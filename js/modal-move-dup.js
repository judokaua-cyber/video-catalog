/* js/modal-move-dup.js
   Модалка "Переміщення / Дублювання" відео між розділами ОДНОГО альбому.
   Виклик: MoveDup.open({ album, currentSection, item, onDone })
*/

window.MoveDup = (function () {

    let state = null;
    let toastTimer = null;

    /* ---------------- УТИЛІТИ ---------------- */

    function getThumbnail(url) {
        if (!url) return '';
        const m = String(url).match(/(?:youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|[?&]v=)([A-Za-z0-9_-]{11})/);
        return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : '';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }

    function getSectionCover(album, sectionName) {
        try {
            const meta = (album && album.sections ? album.sections[sectionName] : null) || {};
            if (meta.cover) return meta.cover;
            const all = (typeof VideosStore.getAll === 'function') ? VideosStore.getAll() : [];
            const first = all.find(v => (v.section || 'Без розділу') === sectionName);
            return first ? getThumbnail(first.url) : '';
        } catch (e) {
            console.warn('getSectionCover error:', e);
            return '';
        }
    }

    function listSections() {
        try {
            const s = VideosStore.getSections();
            return Array.isArray(s) ? s : [];
        } catch (e) {
            console.warn('listSections error:', e);
            return [];
        }
    }

    /* ---------------- МОСТИ ДО STORE ---------------- */
    // Якщо патч у store-videos.js не застосовано — працюємо через наявні методи.

    function store_moveVideo(index, newSection) {
        if (typeof VideosStore.moveVideo === 'function') {
            return VideosStore.moveVideo(index, newSection);
        }
        const v = VideosStore.getAll()[index];
        if (!v) return false;
        if ((v.section || 'Без розділу') === newSection) return false;
        return VideosStore.updateVideo(index, { section: newSection });
    }

    function store_getByIndex(index) {
        if (typeof VideosStore.getByIndex === 'function') {
            return VideosStore.getByIndex(index);
        }
        const v = VideosStore.getAll()[index];
        return v ? Object.assign({}, v) : null;
    }

    function store_insertVideo(index, video) {
        if (typeof VideosStore.insertVideo === 'function') {
            return VideosStore.insertVideo(index, video);
        }
        VideosStore.addVideo(video);
        return true;
    }

    /* ---------------- TOAST ---------------- */

    function toast(msg, isError) {
        let el = document.getElementById('md-toast');
        if (el) el.remove();
        clearTimeout(toastTimer);

        el = document.createElement('div');
        el.id = 'md-toast';
        el.className = 'md-toast' + (isError ? ' error' : '');
        el.textContent = msg;
        document.body.appendChild(el);

        void el.offsetWidth;
        el.classList.add('show');

        toastTimer = setTimeout(function () {
            el.classList.remove('show');
            setTimeout(function () { el.remove(); }, 250);
        }, 2200);
    }

    /* ---------------- ВІДКРИТТЯ ---------------- */

    function open(opts) {
        console.log('[MoveDup.open]', opts);

        if (!opts || !opts.album || !opts.item) {
            console.warn('MoveDup.open: бракує opts.album або opts.item');
            toast('Помилка: немає даних для переміщення', true);
            return;
        }

        state = {
            album: opts.album,
            currentSection: opts.currentSection || '',
            item: opts.item,
            onDone: (typeof opts.onDone === 'function') ? opts.onDone : function () {},
            step: 1,
            targetSection: null,
            sections: listSections()
        };

        console.log('[MoveDup] sections:', state.sections);

        if (!state.sections.length) {
            toast('У цьому альбомі немає розділів', true);
            return;
        }

        try {
            renderOverlay();
        } catch (e) {
            console.error('MoveDup renderOverlay error:', e);
            toast('Помилка відкриття: ' + e.message, true);
        }
    }

    /* ---------------- ОВЕРЛЕЙ ---------------- */

    function renderOverlay() {
        // На випадок повторних кліків — прибираємо старий overlay,
        // але НЕ чіпаємо state
        closeOverlay(true);

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'md-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const modal = document.createElement('div');
        modal.className = 'modal md-modal';
        modal.innerHTML =
            '<div class="modal-header">' +
                '<h2>Переміщення / Дублювання</h2>' +
                '<button class="modal-close" type="button" aria-label="Закрити">✕</button>' +
            '</div>' +
            '<div class="modal-body">' +
                '<div class="md-crumbs" id="md-crumbs"></div>' +
                '<div class="md-step" id="md-step"></div>' +
            '</div>';

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        var closeBtn = overlay.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', closeOverlay);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeOverlay();
        });
        document.addEventListener('keydown', onEsc);

        renderStep();
    }

    function onEsc(e) {
        if (e.key === 'Escape') closeOverlay();
    }

        function closeOverlay(keepState) {
        var overlay = document.getElementById('md-overlay');
        if (overlay) overlay.remove();
        document.removeEventListener('keydown', onEsc);
        if (!keepState) state = null;
    }

    /* ---------------- КРОКИ ---------------- */

    function renderStep() {
        if (!state) return;

        var crumbs = document.getElementById('md-crumbs');
        var step = document.getElementById('md-step');
        if (!crumbs || !step) {
            console.warn('renderStep: немає #md-crumbs або #md-step');
            return;
        }

        try {
            var albumTitle = (state.album && state.album.title) || 'Альбом';
            var c1 = '<span class="md-crumb ' + (state.step === 1 ? 'active' : 'done') +
                     '" data-goto="1">' + escapeHtml(albumTitle) + '</span>';
            var c2 = state.targetSection
                ? '<span class="md-sep">›</span><span class="md-crumb active">' +
                  escapeHtml(state.targetSection) + '</span>'
                : '';
            crumbs.innerHTML = c1 + c2;

            crumbs.querySelectorAll('[data-goto]').forEach(function (el) {
                el.addEventListener('click', function () {
                    state.step = 1;
                    state.targetSection = null;
                    renderStep();
                });
            });

            if (state.step === 1) renderStepChooseSection(step);
            else renderStepActions(step);
        } catch (e) {
            console.error('renderStep error:', e);
            step.innerHTML = '<p style="color:#f87171">Помилка рендеру: ' +
                             escapeHtml(e.message) + '</p>';
        }
    }

    function renderStepChooseSection(container) {
        container.innerHTML = '';

        var header = document.createElement('p');
        header.className = 'md-hint';
        header.textContent = 'Оберіть розділ, куди перемістити або дублювати відео:';
        container.appendChild(header);

        var grid = document.createElement('div');
        grid.className = 'md-grid';

        state.sections.forEach(function (sec) {
            var isCurrent = sec.name === state.currentSection;
            var cover = getSectionCover(state.album, sec.name);

            var card = document.createElement('button');
            card.type = 'button';
            card.className = 'md-card' + (isCurrent ? ' is-current' : '');
            card.dataset.section = sec.name;

            var coverStyle = cover ? 'background-image:url(\'' + cover + '\')' : '';
            var letterHtml = cover ? '' :
                '<span class="md-card-letter">' +
                    escapeHtml((sec.name || '?').charAt(0).toUpperCase()) +
                '</span>';

            card.innerHTML =
                '<div class="md-card-cover" style="' + coverStyle + '">' +
                    letterHtml +
                    '<span class="md-card-count">' + sec.count + '</span>' +
                '</div>' +
                '<div class="md-card-body">' +
                    '<div class="md-card-title">' + escapeHtml(sec.name) + '</div>' +
                    (isCurrent ? '<div class="md-card-note">поточний</div>' : '') +
                '</div>';

            card.addEventListener('click', function () {
                state.targetSection = sec.name;
                state.step = 2;
                renderStep();
            });

            grid.appendChild(card);
        });

        container.appendChild(grid);

        var cancelRow = document.createElement('div');
        cancelRow.className = 'modal-actions';
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn secondary';
        cancel.textContent = 'Скасувати';
        cancel.addEventListener('click', closeOverlay);
        cancelRow.appendChild(cancel);
        container.appendChild(cancelRow);
    }

    function renderStepActions(container) {
        var target = state.targetSection;
        var isSame = target === state.currentSection;
        var videoTitle = (state.item.video && state.item.video.title) || 'без назви';

        container.innerHTML =
            '<p class="md-hint">' +
                'Відео: <b>' + escapeHtml(videoTitle) + '</b><br>' +
                'Цільовий розділ: <b>' + escapeHtml(target) + '</b>' +
            '</p>' +
            '<div class="md-actions">' +
                '<button type="button" class="btn" id="md-move"' +
                (isSame ? ' disabled title="Відео вже в цьому розділі"' : '') + '>' +
                    '🔀 Перемістити' +
                '</button>' +
                '<button type="button" class="btn" id="md-dup">📋 Дублювати</button>' +
            '</div>' +
            '<div class="modal-actions">' +
                '<button type="button" class="btn secondary" id="md-back">← Назад</button>' +
                '<button type="button" class="btn secondary" id="md-cancel">Скасувати</button>' +
            '</div>';

        container.querySelector('#md-back').addEventListener('click', function () {
            state.step = 1;
            state.targetSection = null;
            renderStep();
        });
        container.querySelector('#md-cancel').addEventListener('click', closeOverlay);
        container.querySelector('#md-dup').addEventListener('click', doDuplicate);

        var moveBtn = container.querySelector('#md-move');
        if (!isSame && moveBtn) moveBtn.addEventListener('click', doMove);
    }

    /* ---------------- ДІЇ ---------------- */

    function doMove() {
        if (!state) return;
        var item = state.item;
        var targetSection = state.targetSection;
        var currentSection = state.currentSection;

        if (targetSection === currentSection) {
            toast('Відео вже в цьому розділі', true);
            return;
        }

        var ok = store_moveVideo(item.index, targetSection);
        if (!ok) {
            toast('Не вдалось перемістити', true);
            return;
        }

        var title = (item.video && item.video.title) || 'відео';
        finish();
        toast('«' + title + '» переміщено в «' + targetSection + '»');
    }

    function doDuplicate() {
        if (!state) return;
        var item = state.item;
        var targetSection = state.targetSection;
        var currentSection = state.currentSection;

        var original = store_getByIndex(item.index);
        if (!original) {
            toast('Оригінал не знайдено', true);
            return;
        }

        var copy = {
            title: (original.title || 'Без назви') + ' (копія)',
            section: targetSection,
            url: original.url
        };

        if (targetSection === currentSection) {
            store_insertVideo(item.index + 1, copy);
        } else {
            VideosStore.addVideo(copy);
        }

        finish();
        toast('Створено копію в «' + targetSection + '»');
    }

    function finish() {
        var cb = state && state.onDone;
        closeOverlay();
        if (typeof cb === 'function') cb();
    }

    return { open: open };
})();