/* js/context-card.js
   Універсальна картка з контекстним меню (ПКМ).
   Використовується на index.html, album.html, section.html
*/

window.ContextCard = (function () {

    /* ============================================================
       КОНТЕКСТНЕ МЕНЮ
       ============================================================ */

    let activeMenu = null;

    function closeMenu() {
        if (activeMenu) {
            activeMenu.remove();
            activeMenu = null;
            document.removeEventListener('click', closeMenu);
            document.removeEventListener('scroll', closeMenu, true);
            document.removeEventListener('keydown', onEscClose);
        }
    }

    function onEscClose(e) {
        if (e.key === 'Escape') closeMenu();
    }

    /**
     * Показує контекстне меню у позиції курсора.
     * @param {MouseEvent} e
     * @param {Array<{label, icon?, danger?, disabled?, onClick}>} items
     */
    function showMenu(e, items) {
        e.preventDefault();
        closeMenu();

        const menu = document.createElement('div');
        menu.className = 'cc-menu';
        menu.setAttribute('role', 'menu');

        items.forEach(item => {
            if (item === '---') {
                const sep = document.createElement('div');
                sep.className = 'cc-menu-sep';
                menu.appendChild(sep);
                return;
            }

            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'cc-menu-item'
                + (item.danger ? ' danger' : '')
                + (item.disabled ? ' disabled' : '');
            el.disabled = !!item.disabled;
            el.setAttribute('role', 'menuitem');
            el.innerHTML = `
                <span class="cc-menu-icon">${item.icon || ''}</span>
                <span class="cc-menu-label">${item.label}</span>
            `;
            if (!item.disabled) {
                el.addEventListener('click', ev => {
                    ev.stopPropagation();
                    closeMenu();
                    item.onClick();
                });
            }
            menu.appendChild(el);
        });

        // Позиціонування з урахуванням країв вікна
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let x = e.clientX;
        let y = e.clientY;
        if (x + rect.width > vw) x = vw - rect.width - 8;
        if (y + rect.height > vh) y = vh - rect.height - 8;

        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        activeMenu = menu;

        // Закриття
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
            document.addEventListener('scroll', closeMenu, true);
            document.addEventListener('keydown', onEscClose);
        }, 0);
    }

    /* ============================================================
       КАРТКА
       ============================================================ */

    /**
     * Створює картку.
     * @param {object} opts
     *   - title: string
     *   - description?: string
     *   - cover?: string (URL)
     *   - count?: number (показується як бейдж)
     *   - placeholderLetter?: string (для картки без обкладинки)
     *   - href?: string (куди веде ЛКМ)
     *   - menuItems?: Array (для ПКМ)
     *   - accent?: 'blue' | 'green' | 'purple' | 'gray'
     */
    function create(opts) {
        const card = document.createElement('a');
        card.className = 'cc-card';
        if (opts.accent) card.classList.add('cc-accent-' + opts.accent);

        if (opts.href) {
            card.href = opts.href;
        } else {
            card.href = '#';
            card.addEventListener('click', e => e.preventDefault());
        }

        // Обкладинка
        const cover = document.createElement('div');
        cover.className = 'cc-cover';
        if (opts.cover) {
            cover.style.backgroundImage = `url("${opts.cover}")`;
        } else {
            cover.classList.add('cc-cover-placeholder');
            cover.textContent = (opts.placeholderLetter
                || (opts.title || '?').charAt(0).toUpperCase());
        }

        // Бейдж-лічильник
        if (typeof opts.count === 'number') {
            const badge = document.createElement('span');
            badge.className = 'cc-count';
            badge.textContent = opts.count;
            cover.appendChild(badge);
        }

        // Тіло
        const body = document.createElement('div');
        body.className = 'cc-body';

        const title = document.createElement('h3');
        title.className = 'cc-title';
        title.textContent = opts.title || '(без назви)';

        const desc = document.createElement('p');
        desc.className = 'cc-desc';
        desc.textContent = opts.description || '';

        body.append(title, desc);
        card.append(cover, body);

        // ПКМ
        if (opts.menuItems && opts.menuItems.length) {
            card.addEventListener('contextmenu', e => {
                showMenu(e, opts.menuItems);
            });
        }

        return card;
    }

    /**
     * Створює картку "Новий …".
     * @param {object} opts
     *   - label: string ("Новий альбом", "Новий розділ")
     *   - onClick: () => void
     *   - accent?: string
     */
    function createNew(opts) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'cc-card cc-card-new';
        if (opts.accent) card.classList.add('cc-accent-' + opts.accent);

        card.innerHTML = `
            <div class="cc-new-inner">
                <span class="cc-new-plus">+</span>
                <span class="cc-new-label">${opts.label}</span>
            </div>
        `;

        card.addEventListener('click', opts.onClick);
        return card;
    }

    /* ============================================================
       ПУБЛІЧНЕ API
       ============================================================ */

    return {
        create,
        createNew,
        showMenu,
        closeMenu
    };
})();