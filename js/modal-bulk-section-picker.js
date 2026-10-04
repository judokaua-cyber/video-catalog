/* js/modal-bulk-section-picker.js
   Модалка "Перемістити вибране в розділ".
   Показує всі розділи альбому (крім поточного).
   Підтримує масив items для групового переміщення.
   Виклик: BulkSectionPicker.open({ album, currentSection, items, onDone })
*/

window.BulkSectionPicker = (function () {

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
        if (!opts || !opts.album || !opts.items || !opts.items.length) {
            toast('Помилка: немає вибраних відео', true);
            return;
        }

        state = {
            album: opts.album,
            currentSection: opts.currentSection || '',
            items: opts.items.slice(),
            onDone: (typeof opts.onDone === 'function') ? opts.onDone : function () {},
            step: 1,
            targetSection: null,
            sections: VideosStore.getSections()
                .filter(s => s.name !== opts.currentSection)
        };

        if (!state.sections.length) {
            toast('В альбомі немає інших розділів', true);
            return;
        }

        try {
            renderOverlay();
        } catch (e) {
            console.error('BulkSectionPicker renderOverlay error:', e);
            toast('Помилка відкриття: ' + e.message, true);
        }
    }

    /* ---------------- ОВЕРЛЕЙ ---------------- */

    function renderOverlay() {
        closeOverlay(true);

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'bsp-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const modal = document.createElement('div');
        modal.className = 'modal md-modal';
        modal.innerHTML =
            '<div class="modal-header">' +
                '<h2>Перемістити вибране в розділ</h2>' +
                '<button class="modal-close" type="button" aria-label="Закрити">✕</button>' +
            '</div>' +
            '<div class="modal-body">' +
                '<div class="md-crumbs" id="bsp-crumbs"></div>' +
                '<div class="md-step" id="bsp-step"></div>' +
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
        var overlay = document.getElementById('bsp-overlay');
        if (overlay) overlay.remove();
        document.removeEventListener('keydown', onEsc);
        if (!keepState) state = null;
    }

    /* ---------------- КРОКИ ---------------- */

    function renderStep() {
        if (!state) return;

        var crumbs = document.getElementById('bsp-crumbs');
        var step = document.getElementById('bsp-step');
        if (!crumbs || !step) return;

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
        header.textContent = 'Оберіть розділ, куди перемістити вибрані відео (' +
                             state.items.length + ' шт.):';
        container.appendChild(header);

        var grid = document.createElement('div');
        grid.className = 'md-grid';

        state.sections.forEach(function (sec) {
            var cover = getSectionCover(state.album, sec.name);

            var card = document.createElement('button');
            card.type = 'button';
            card.className = 'md-card';

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
        cancel.addEventListener('click', function () { closeOverlay(); });
        cancelRow.appendChild(cancel);
        container.appendChild(cancelRow);
    }

    function renderStepConfirm(container) {
        var target = state.targetSection;

        container.innerHTML =
            '<p class="md-hint">' +
                'Вибрані відео: <b>' + state.items.length + ' шт.</b><br>' +
                'Цільовий розділ: <b>' + escapeHtml(target) + '</b><br>' +
                '<span style="color:#94a3b8;font-size:0.85em">' +
                'Підрозділи буде скинуто.' +
                '</span>' +
            '</p>' +
            '<div class="md-actions">' +
                '<button type="button" class="btn" id="bsp-move">📂 Перемістити</button>' +
            '</div>' +
            '<div class="modal-actions">' +
                '<button type="button" class="btn secondary" id="bsp-back">← Назад</button>' +
                '<button type="button" class="btn secondary" id="bsp-cancel">Скасувати</button>' +
            '</div>';

        container.querySelector('#bsp-back').addEventListener('click', function () {
            state.step = 1;
            state.targetSection = null;
            renderStep();
        });
        container.querySelector('#bsp-cancel').addEventListener('click', function () {
            closeOverlay();
        });
        container.querySelector('#bsp-move').addEventListener('click', doMove);
    }

    /* ---------------- ДІЯ ---------------- */

    function doMove() {
        if (!state) return;

        var target = state.targetSection;
        var current = state.currentSection;

        if (target === current) {
            toast('Відео вже в цьому розділі', true);
            return;
        }

        var moved = 0;
        state.items.forEach(function (item) {
            var ok = VideosStore.moveVideo(item.index, target);
            if (ok) moved++;
        });

        finish();
        toast('Переміщено ' + moved + ' відео у «' + target + '»');
    }

    function finish() {
        var cb = state && state.onDone;
        closeOverlay();
        if (typeof cb === 'function') cb();
    }

    return { open: open };
})();