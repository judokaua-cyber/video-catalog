/* js/modal.js
   Простий модальний діалог з підтримкою форм.
*/

window.Modal = (function () {

    function open(opts) {
        // opts: { title, fields, submitLabel, onSubmit, onCancel }
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const modal = document.createElement('div');
        modal.className = 'modal';

        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `<h2>${opts.title}</h2>`;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.type = 'button';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'Закрити');
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal-body';

        const form = document.createElement('form');
        form.className = 'modal-form';

        const inputs = {};

        opts.fields.forEach(field => {
            const wrap = document.createElement('div');
            wrap.className = 'modal-field';

            const label = document.createElement('label');
            label.textContent = field.label;
            label.htmlFor = 'mf-' + field.name;

            let input;
            if (field.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = field.rows || 3;
            } else {
                input = document.createElement('input');
                input.type = field.type || 'text';
            }
            input.id = 'mf-' + field.name;
            input.name = field.name;
            input.value = field.value || '';
            input.placeholder = field.placeholder || '';
            if (field.required) input.required = true;

            inputs[field.name] = input;

            wrap.append(label, input);
            if (field.hint) {
                const hint = document.createElement('small');
                hint.className = 'modal-hint';
                hint.textContent = field.hint;
                wrap.appendChild(hint);
            }
            form.appendChild(wrap);
        });

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn secondary';
        cancelBtn.textContent = 'Скасувати';

        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.className = 'btn';
        submitBtn.textContent = opts.submitLabel || 'Зберегти';

        actions.append(cancelBtn, submitBtn);
        form.appendChild(actions);

        body.appendChild(form);
        modal.append(header, body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Фокус на перше поле
        setTimeout(() => {
            const first = form.querySelector('input, textarea');
            if (first) first.focus();
        }, 50);

        // Закриття
        function close() {
            overlay.remove();
            document.removeEventListener('keydown', onEsc);
        }
        function onEsc(e) {
            if (e.key === 'Escape') close();
        }
        document.addEventListener('keydown', onEsc);

        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) close();
        });

        // Submit
        form.addEventListener('submit', e => {
            e.preventDefault();
            const values = {};
            Object.entries(inputs).forEach(([name, input]) => {
                values[name] = input.value.trim();
            });
            const result = opts.onSubmit(values);
            if (result !== false) close();
        });
    }

    /**
     * Модалка підтвердження.
     */
    function confirm(opts) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal modal-small">
                    <div class="modal-header"><h2>${opts.title || 'Підтвердження'}</h2></div>
                    <div class="modal-body">
                        <p>${opts.message || ''}</p>
                        <div class="modal-actions">
                            <button class="btn secondary" data-act="cancel">Скасувати</button>
                            <button class="btn danger" data-act="ok">${opts.okLabel || 'Так'}</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            overlay.addEventListener('click', e => {
                const act = e.target.dataset.act;
                if (act === 'cancel' || e.target === overlay) {
                    overlay.remove();
                    resolve(false);
                } else if (act === 'ok') {
                    overlay.remove();
                    resolve(true);
                }
            });
        });
    }

    return { open, confirm };
})();