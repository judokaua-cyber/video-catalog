/* js/modal-subsection-picker.js
   Модалка "Перемістити в підгрупу".
   Показує підрозділи ПОТОЧНОГО розділу + картку "без підрозділу"
   + картку "Створити новий підрозділ".
   Виклик: SubsectionPicker.open({ section, currentSubsection, item, onDone })
*/

window.SubsectionPicker = (function () {

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

    function listSubsections(sectionName) {
        try {
            const s = VideosStore.getSubsections(sectionName);
            return Array.isArray(s) ? s : [];
        } catch (e) {
            console.warn('listSubsections error:', e);
            return [];
        }
    }

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
        if (!opts || !opts.section || !opts.item) {
            toast('Помилка: немає даних для переміщення', true);
            return;
        }

        state = {
            section: opts.section,
            currentSubsection: opts.currentSubsection || '',
            item: opts.item,
            onDone: (typeof opts.onDone === 'function') ? opts.onDone : function () {},
            step: 1,
            targetSubsection: null,
            subsections: listSubsections(opts.section)
        };

        try {
            renderOverlay();
        } catch (e) {
            console.error('SubsectionPicker renderOverlay error:', e);
            toast('Помилка відкриття: ' + e.message, true);
        }
    }

    /* ---------------- ОВЕРЛЕЙ ---------------- */

    function renderOverlay() {
        closeOverlay(true);

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'sp-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const modal = document.createElement('div');
        modal.className = 'modal md-modal';
        modal.innerHTML =
            '<div class="modal-header">' +
                '<h2>Перемістити в підгрупу</h2>' +
                '<button class="modal-close" type="button" aria-label="Закрити">✕</button>' +
            '</div>' +
            '<div class="modal-body">' +
                '<div class="md-crumbs" id="sp-crumbs"></div>' +
                '<div class="md-step" id="sp-step"></div>' +
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
        var overlay = document.getElementById('sp-overlay');
        if (overlay) overlay.remove();
        document.removeEventListener('keydown', onEsc);
        if (!keepState) state = null;
    }

    /* ---------------- КРОКИ ---------------- */

    function renderStep() {
        if (!state) return;

        var crumbs = document.getElementById('sp-crumbs');
        var step = document.getElementById('sp-step');
        if (!crumbs || !step) return;

        try {
            var sectionTitle = state.section;
            var c1 = '<span class="md-crumb active">' +
                     escapeHtml(sectionTitle) + '</span>';
            var c2 = state.targetSubsection !== null
                ? '<span class="md-sep">›</span><span class="md-crumb active">' +
                  escapeHtml(state.targetSubsection || '(без підрозділу)') + '</span>'
                : '';
            crumbs.innerHTML = c1 + c2;

            if (state.step === 1) renderStepChoose(step);
            else renderStepConfirm(step);
        } catch (e) {
            console.error('renderStep error:', e);
            step.innerHTML = '<p style="color:#f87171">Помилка рендеру: ' +
                             escapeHtml(e.message) + '</p>';
        }
    }

    function renderStepChoose(container) {
        container.innerHTML = '';

        var header = document.createElement('p');
        header.className = 'md-hint';
        header.textContent = 'Оберіть підрозділ у межах розділу «' + state.section + '»:';
        container.appendChild(header);

        var grid = document.createElement('div');
        grid.className = 'md-grid';

        // Картка "(без підрозділу)" — першою
        grid.appendChild(makeCard({
            name: '',
            label: '(без підрозділу)',
            count: null,
            isCurrent: state.currentSubsection === '',
            isSpecial: true,
            onClick: function () {
                state.targetSubsection = '';
                state.step = 2;
                renderStep();
            }
        }));

        // Наявні підрозділи
        state.subsections.forEach(function (sub) {
            grid.appendChild(makeCard({
                name: sub.name,
                label: sub.name,
                count: sub.count,
                isCurrent: sub.name === state.currentSubsection,
                onClick: function () {
                    state.targetSubsection = sub.name;
                    state.step = 2;
                    renderStep();
                }
            }));
        });

        // Картка "Створити новий"
        var newCard = document.createElement('button');
        newCard.type = 'button';
        newCard.className = 'md-card md-card-new-sub';
        newCard.innerHTML =
            '<div class="md-card-cover md-card-cover-new">' +
                '<span class="md-card-plus">+</span>' +
            '</div>' +
            '<div class="md-card-body">' +
                '<div class="md-card-title">Новий підрозділ…</div>' +
            '</div>';
        newCard.addEventListener('click', function () {
            showNewSubInput(container);
        });
        grid.appendChild(newCard);

        container.appendChild(grid);

        var cancelRow = document.createElement('div');
        cancelRow.className = 'modal-actions';
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn secondary';
        cancel.textContent = 'Скасувати';
        cancel.addEventListener('click', function () { closeOverlay(); });
        cancelRow.appendChild(cancel);
        container.appendChild(cancelRow);
    }

    function makeCard(opts) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'md-card' + (opts.isCurrent ? ' is-current' : '');
        if (opts.isSpecial) card.classList.add('md-card-special');

        var letter = opts.name
            ? escapeHtml(opts.name.charAt(0).toUpperCase())
            : '⬜';

        var countHtml = (opts.count != null)
            ? '<span class="md-card-count">' + opts.count + '</span>'
            : '';

        card.innerHTML =
            '<div class="md-card-cover">' +
                '<span class="md-card-letter">' + letter + '</span>' +
                countHtml +
            '</div>' +
            '<div class="md-card-body">' +
                '<div class="md-card-title">' + escapeHtml(opts.label) + '</div>' +
                (opts.isCurrent ? '<div class="md-card-note">поточний</div>' : '') +
            '</div>';

        card.addEventListener('click', opts.onClick);
        return card;
    }

    function showNewSubInput(container) {
        container.innerHTML = '';

        var hint = document.createElement('p');
        hint.className = 'md-hint';
        hint.textContent = 'Введіть назву нового підрозділу в розділі «' + state.section + '»:';
        container.appendChild(hint);

        var field = document.createElement('div');
        field.className = 'modal-field';
        field.innerHTML =
            '<input type="text" id="sp-new-name" placeholder="Наприклад: Зачеп ззовні" autocomplete="off">';
        container.appendChild(field);

        var actions = document.createElement('div');
        actions.className = 'modal-actions';
        actions.innerHTML =
            '<button type="button" class="btn secondary" id="sp-new-back">← Назад</button>' +
            '<button type="button" class="btn" id="sp-new-ok">Далі</button>';
        container.appendChild(actions);

        var input = container.querySelector('#sp-new-name');
        setTimeout(function () { input.focus(); }, 50);

        function goNext() {
            var name = input.value.trim();
            if (!name) {
                input.classList.add('error');
                setTimeout(function () { input.classList.remove('error'); }, 1500);
                input.focus();
                return;
            }
            state.targetSubsection = name;
            state.step = 2;
            renderStep();
        }

        container.querySelector('#sp-new-back').addEventListener('click', function () {
            state.targetSubsection = null;
            renderStep();
        });

        container.querySelector('#sp-new-ok').addEventListener('click', goNext);

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                goNext();
            }
        });
    }

    function renderStepConfirm(container) {
        var target = state.targetSubsection;
        var label = target || '(без підрозділу)';
        var videoTitle = (state.item.video && state.item.video.title) || 'без назви';

        container.innerHTML =
            '<p class="md-hint">' +
                'Відео: <b>' + escapeHtml(videoTitle) + '</b><br>' +
                'Цільовий підрозділ: <b>' + escapeHtml(label) + '</b>' +
            '</p>' +
            '<div class="md-actions">' +
                '<button type="button" class="btn" id="sp-move">📁 Перемістити</button>' +
            '</div>' +
            '<div class="modal-actions">' +
                '<button type="button" class="btn secondary" id="sp-back">← Назад</button>' +
                '<button type="button" class="btn secondary" id="sp-cancel">Скасувати</button>' +
            '</div>';

        container.querySelector('#sp-back').addEventListener('click', function () {
            state.step = 1;
            state.targetSubsection = null;
            renderStep();
        });
        container.querySelector('#sp-cancel').addEventListener('click', function () {
            closeOverlay();
        });
        container.querySelector('#sp-move').addEventListener('click', doMove);
    }

    /* ---------------- ДІЯ ---------------- */

    function doMove() {
        if (!state) return;

        var item = state.item;
        var target = state.targetSubsection || '';
        var current = state.currentSubsection || '';

        if (target === current) {
            toast('Відео вже в цьому підрозділі', true);
            return;
        }

        var ok = VideosStore.moveVideoToSubsection(item.index, target);
        if (!ok) {
            toast('Не вдалось перемістити', true);
            return;
        }

        var title = (item.video && item.video.title) || 'відео';
        var label = target || '(без підрозділу)';
        finish();
        toast('«' + title + '» → «' + label + '»');
    }

    function finish() {
        var cb = state && state.onDone;
        closeOverlay();
        if (typeof cb === 'function') cb();
    }

    return { open: open };
})();
