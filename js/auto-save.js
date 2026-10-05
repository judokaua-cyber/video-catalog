/* js/auto-save.js
   Автоматичне збереження змін на GitHub і в локальну теку.

   Замінює ручний банер "Є незбережені зміни" з кнопкою "Зберегти".
   Після кожної зміни (переміщення, редагування, створення) зміни
   зберігаються автоматично через 2 секунди після останньої дії.

   Використання:
       AutoSave.schedule()   — викликати після кожної зміни
       AutoSave.flush()      — примусово зберегти зараз
       AutoSave.setSources([{name, store}]) — зареєструвати сховища

   Публічне API:
       AutoSave.schedule()
       AutoSave.flush()
       AutoSave.setSources(sources)
       AutoSave.onProgress(callback)
       AutoSave.isSaving()
*/

window.AutoSave = (function () {

    // ─── КОНФІГУРАЦІЯ ───
    const DELAY_MS = 2000;        // 2 секунди після останньої зміни
    const MAX_WAIT_MS = 30000;    // максимум 30 секунд, якщо зміни йдуть безперервно

    // ─── СТАН ───
    let sources = [];             // [{name, store}, ...]
    let timer = null;
    let firstChangeAt = null;
    let saving = false;
    let pendingSave = false;
    let progressCallback = null;

    /* ============================================================
       РЕЄСТРАЦІЯ ДЖЕРЕЛ
       ============================================================ */

    /**
     * Зареєструвати сховища, які треба зберігати.
     * @param {Array<{name: string, store: object}>} list
     *   name  — для повідомлень (наприклад, "judo.json")
     *   store — об'єкт із методами isDirty(), save(), markClean()
     */
    function setSources(list) {
        sources = Array.isArray(list) ? list.slice() : [];
    }

    /* ============================================================
       ПЛАНУВАННЯ ЗБЕРЕЖЕННЯ
       ============================================================ */

    /**
     * Викликати після кожної зміни.
     * Перезапускає таймер (debounce). Гарантує, що коміт буде
     * не частіше ніж раз на 2 секунди, але не пізніше 30 секунд
     * від першої зміни.
     */
    function schedule() {
        if (saving) {
            // Зараз іде збереження — після завершення перевіримо ще раз
            pendingSave = true;
            return;
        }

        if (firstChangeAt === null) {
            firstChangeAt = Date.now();
        }

        // Якщо зміни йдуть безперервно довше MAX_WAIT_MS — зберігаємо примусово
        if (Date.now() - firstChangeAt >= MAX_WAIT_MS) {
            flush();
            return;
        }

        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, DELAY_MS);
    }

    /* ============================================================
       ЗБЕРЕЖЕННЯ
       ============================================================ */

    /**
     * Примусово зберегти всі "брудні" сховища.
     * @returns {Promise<boolean>} true — успіх, false — помилка
     */
    async function flush() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        firstChangeAt = null;

        if (saving) {
            pendingSave = true;
            return false;
        }

        // Які сховища мають незбережені зміни?
        const dirty = sources.filter(s => s.store && s.store.isDirty && s.store.isDirty());
        if (!dirty.length) {
            return true;
        }

        saving = true;
        let allOk = true;
        const failed = [];

        try {
            for (const src of dirty) {
                try {
                    const result = await src.store.save();
                    src.store.markClean();

                    // result.method: 'both' | 'fs' | 'github' | 'download' | 'none'
                    if (result && result.method === 'download') {
                        // Завантажилось у Downloads, а не в теку і не на GitHub
                        showToast('⚠️ ' + src.name + ' завантажено в Downloads (немає токена або теки)', true);
                    } else if (result && result.method === 'none') {
                        showToast('⚠️ ' + src.name + ' не збережено', true);
                    }
                } catch (err) {
                    console.error('AutoSave: помилка збереження', src.name, err);
                    failed.push(src.name);
                    allOk = false;
                }
            }

            if (allOk) {
                notifyProgress('saved');
            } else {
                const msg = '❌ Не вдалось зберегти: ' + failed.join(', ');
                showToast(msg, true);
                notifyProgress('error');
            }
        } finally {
            saving = false;

            // Якщо під час збереження надійшли нові зміни — запланувати ще раз
            if (pendingSave) {
                pendingSave = false;
                schedule();
            }
        }

        return allOk;
    }

    /* ============================================================
       ПРОГРЕС
       ============================================================ */

    function onProgress(callback) {
        progressCallback = typeof callback === 'function' ? callback : null;
    }

    function notifyProgress(state) {
        if (progressCallback) {
            try {
                progressCallback(state);
            } catch (e) {
                console.warn('AutoSave progress callback error:', e);
            }
        }
    }

    /* ============================================================
       TOAST
       ============================================================ */

    let toastTimer = null;

    function showToast(message, isError) {
        let el = document.getElementById('autosave-toast');
        if (el) el.remove();
        clearTimeout(toastTimer);

        el = document.createElement('div');
        el.id = 'autosave-toast';
        el.className = 'autosave-toast' + (isError ? ' error' : '');
        el.textContent = message;
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);

        // Примусовий reflow для анімації
        void el.offsetWidth;
        el.classList.add('show');

        // Успіх — зникає через 2 секунди. Помилка — тримається, поки не закриють.
        if (!isError) {
            toastTimer = setTimeout(() => {
                el.classList.remove('show');
                setTimeout(() => el.remove(), 250);
            }, 2000);
        } else {
            el.addEventListener('click', () => {
                el.classList.remove('show');
                setTimeout(() => el.remove(), 250);
            });
            el.title = 'Клікніть, щоб закрити';
            el.style.cursor = 'pointer';
        }
    }

    /* ============================================================
       FLUSH ПРИ ЗАКРИТТІ ВКЛАДКИ
       ============================================================ */

    window.addEventListener('beforeunload', e => {
        const hasDirty = sources.some(s => s.store && s.store.isDirty && s.store.isDirty());
        if (!hasDirty) return;

        // Спроба синхронно попередити браузер — він покаже діалог
        // "Ви впевнені, що хочете піти? Незбережені зміни."
        // Це єдиний спосіб не втратити останні 2 секунди правок.
        e.preventDefault();
        e.returnValue = '';

        // Також спробуємо асинхронно зберегти (може не встигнути, але спробуємо)
        flush();
    });

    /* ============================================================
       ЕКСПОРТ
       ============================================================ */

    return {
        schedule,
        flush,
        setSources,
        onProgress,
        isSaving: () => saving,
        // Для тестів
        _config: { DELAY_MS, MAX_WAIT_MS }
    };
})();