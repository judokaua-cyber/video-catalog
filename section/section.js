/* section/section.js
   Логіка сторінки розділу: каталог відео + підрозділи + групові дії.
*/

let currentAlbum = null;
let currentSection = '';
let currentSubsection = '';   // '' = огляд розділу
let allVideos = [];           // усі відео альбому
let sectionVideos = [];       // відео поточного розділу
let filteredVideos = [];      // після пошуку/фільтра
let currentQuery = '';
let currentView = 'grid';
const selectedVideoIndices = new Set();

/* ============================================================
   СТАТУС
   ============================================================ */

function setStatus(msg, isError = false) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('error', isError);
}

/* ============================================================
   УТИЛІТИ
   ============================================================ */

function getParam(name) {
    return new URLSearchParams(location.search).get(name);
}

function extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return null;
    let u = url.trim().replace(/[.,;:!?)]+$/, '');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    let m;
    if ((m = u.match(/youtu\.be\/([A-Za-z0-9_-]{11})/))) return m[1];
    if ((m = u.match(/\/shorts\/([A-Za-z0-9_-]{11})/))) return m[1];
    if ((m = u.match(/\/embed\/([A-Za-z0-9_-]{11})/))) return m[1];
    if ((m = u.match(/\/live\/([A-Za-z0-9_-]{11})/))) return m[1];
    if ((m = u.match(/[?&]v=([A-Za-z0-9_-]{11})/))) return m[1];
    return null;
}

function getThumbnail(url) {
    const id = extractYouTubeId(url);
    return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '';
}

function getEmbedUrl(url) {
    const id = extractYouTubeId(url);
    return id ? `https://www.youtube.com/embed/${id}?rel=0` : null;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

/* ============================================================
   ЗАВАНТАЖЕННЯ СТОРІНКИ
   ============================================================ */

async function init() {
    const albumId = getParam('id');
    currentSection = getParam('name') || '';
    currentSubsection = getParam('sub') || '';

    if (!albumId || !currentSection) {
        setStatus('Не вказано альбом або розділ.', true);
        return;
    }

    setStatus('Завантаження…');

    try {
        await AlbumsStore.load();
    } catch (err) {
        setStatus('Помилка завантаження albums.json: ' + err.message, true);
        return;
    }

    currentAlbum = AlbumsStore.getById(albumId);
    if (!currentAlbum) {
        setStatus(`Альбом "${albumId}" не знайдено.`, true);
        return;
    }

    try {
        await VideosStore.load(currentAlbum.file);
    } catch (err) {
        setStatus(`Файл ${currentAlbum.file} не знайдено: ` + err.message, true);
        return;
    }

    rebuildSectionVideos();
    applyMeta();
    setupSearch();
    setupViewToggle();
    setupBulkActions();
    applyFilters();

    setStatus('');
}

function rebuildSectionVideos() {
    allVideos = VideosStore.getAll();
    sectionVideos = allVideos
        .map((v, i) => ({ video: v, index: i }))
        .filter(item => (item.video.section || 'Без розділу') === currentSection);
}

/* ============================================================
   ЗАГОЛОВОК СТОРІНКИ
   ============================================================ */

function applyMeta() {
    const secMeta = (currentAlbum.sections || {})[currentSection] || {};

    const titleText = currentSubsection
        ? `${currentSubsection} — ${currentSection}`
        : currentSection;
    document.title = `${titleText} — ${currentAlbum.title}`;

    document.getElementById('section-title').textContent = titleText;
    document.getElementById('section-description').textContent =
        currentSubsection ? '' : (secMeta.description || '');

    // Хлібні крихти
    const crumbAlbum = document.getElementById('crumb-album');
    crumbAlbum.textContent = currentAlbum.title;
    crumbAlbum.href =
        `../album/album.html?id=${encodeURIComponent(currentAlbum.id)}`;

    const crumbSection = document.getElementById('crumb-section');
    if (currentSubsection) {
        const sectionHref = `section.html?id=${encodeURIComponent(currentAlbum.id)}` +
                            `&name=${encodeURIComponent(currentSection)}`;
        crumbSection.outerHTML =
            `<a id="crumb-section" href="${sectionHref}">${escapeHtml(currentSection)}</a>` +
            `<span class="sep">›</span>` +
            `<span class="current">${escapeHtml(currentSubsection)}</span>`;
    } else {
        crumbSection.textContent = currentSection;
        crumbSection.className = 'current';
    }

    // Футер
    const footer = document.getElementById('footer-album-link');
    if (currentSubsection) {
        footer.href = `section.html?id=${encodeURIComponent(currentAlbum.id)}` +
                      `&name=${encodeURIComponent(currentSection)}`;
        footer.textContent = `← До розділу «${currentSection}»`;
    } else {
        footer.href = `../album/album.html?id=${encodeURIComponent(currentAlbum.id)}`;
        footer.textContent = `← До альбому «${currentAlbum.title}»`;
    }

    // Обкладинка
    const cover = document.getElementById('section-cover');
    cover.innerHTML = '';
    cover.classList.remove('placeholder');

    let coverUrl = '';
    if (currentSubsection) {
        const first = sectionVideos.find(
            it => (it.video.subsection || '') === currentSubsection
        );
        if (first) coverUrl = getThumbnail(first.video.url);
    } else {
        coverUrl = secMeta.cover || '';
        if (!coverUrl && sectionVideos.length > 0) {
            coverUrl = getThumbnail(sectionVideos[0].video.url);
        }
    }

    if (coverUrl) {
        cover.style.backgroundImage = `url("${coverUrl}")`;
    } else {
        cover.style.backgroundImage = '';
        cover.classList.add('placeholder');
        const letter = (currentSubsection || currentSection).charAt(0).toUpperCase();
        cover.textContent = letter;
    }

    updateStats();
}

function updateStats() {
    let count;
    if (currentSubsection) {
        count = sectionVideos.filter(
            it => (it.video.subsection || '') === currentSubsection
        ).length;
    } else {
        count = sectionVideos.length;
    }
    document.getElementById('stat-videos').textContent = count;
}

/* ============================================================
   ПОШУК
   ============================================================ */

let searchTimer = null;

function setupSearch() {
    const input = document.getElementById('search-input');
    const clear = document.getElementById('search-clear');

    input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentQuery = input.value.trim().toLowerCase();
            toggleSearchClear();
            applyFilters();
        }, 180);
    });

    clear.addEventListener('click', () => {
        input.value = '';
        currentQuery = '';
        toggleSearchClear();
        applyFilters();
        input.focus();
    });

    document.getElementById('reset-search').addEventListener('click', () => {
        input.value = '';
        currentQuery = '';
        toggleSearchClear();
        applyFilters();
    });
}

function toggleSearchClear() {
    document.getElementById('search-clear').hidden = !currentQuery;
}

/* ============================================================
   ВИГЛЯД: СІТКА / СПИСОК
   ============================================================ */

function setupViewToggle() {
    const saved = localStorage.getItem('videoView');
    if (saved === 'list') currentView = 'list';

    document.querySelectorAll('.view-toggle .btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === currentView);
        btn.addEventListener('click', () => setView(btn.dataset.view));
    });

    applyViewClass();
}

function setView(view) {
    currentView = view;
    localStorage.setItem('videoView', view);

    document.querySelectorAll('.view-toggle .btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    applyViewClass();
}

function applyViewClass() {
    const grid = document.getElementById('video-grid');
    grid.classList.toggle('view-list', currentView === 'list');
}

/* ============================================================
   ФІЛЬТРАЦІЯ + РЕНДЕР
   ============================================================ */

function applyFilters() {
    let base = sectionVideos.slice();

    if (currentSubsection) {
        base = base.filter(
            it => (it.video.subsection || '') === currentSubsection
        );
    }

    if (currentQuery) {
        base = base.filter(it =>
            (it.video.title || '').toLowerCase().includes(currentQuery)
        );
    }

    filteredVideos = base;

    if (currentSubsection || currentQuery) {
        hideSubsectionsZone();
        renderVideos();
    } else {
        renderOverview();
    }

    toggleEmptyState();
}

function toggleEmptyState() {
    const empty = document.getElementById('empty-state');
    const grid = document.getElementById('video-grid');
    const hasAny = filteredVideos.length > 0;
    empty.hidden = hasAny;
    grid.style.display = hasAny ? '' : 'none';
}

/* ============================================================
   ОГЛЯД РОЗДІЛУ: ПАПКИ ПІДРОЗДІЛІВ
   ============================================================ */

function hideSubsectionsZone() {
    const zone = document.getElementById('subsections-zone');
    if (zone) zone.remove();
}

function renderOverview() {
    const catalog = document.querySelector('.catalog');
    if (!catalog) return;

    hideSubsectionsZone();

    const grouped = VideosStore.getGroupedBySubsection(currentSection);

    if (grouped.subsections.length === 0) {
        filteredVideos = grouped.withoutSub.videos;
        renderVideos();
        return;
    }

    const zone = document.createElement('div');
    zone.id = 'subsections-zone';
    zone.className = 'subsections-zone';

    const heading = document.createElement('h2');
    heading.className = 'subsections-heading';
    heading.textContent = '📁 Підрозділи';
    zone.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'subsections-grid';

    grouped.subsections.forEach(sub => {
        grid.appendChild(createSubsectionFolder(sub));
    });

    zone.appendChild(grid);
    catalog.insertBefore(zone, catalog.firstChild);

    filteredVideos = grouped.withoutSub.videos;
    renderVideos();
}

function createSubsectionFolder(sub) {
    const a = document.createElement('a');
    a.className = 'subsection-folder';
    a.href = `section.html?id=${encodeURIComponent(currentAlbum.id)}` +
             `&name=${encodeURIComponent(currentSection)}` +
             `&sub=${encodeURIComponent(sub.name)}`;

    const thumb = sub.firstUrl ? getThumbnail(sub.firstUrl) : '';
    const cover = document.createElement('div');
    cover.className = 'subsection-folder-cover';
    if (thumb) {
        cover.style.backgroundImage = `url("${thumb}")`;
    } else {
        cover.classList.add('placeholder');
        cover.textContent = '📁';
    }

    const badge = document.createElement('span');
    badge.className = 'subsection-folder-count';
    badge.textContent = sub.count;
    cover.appendChild(badge);

    const body = document.createElement('div');
    body.className = 'subsection-folder-body';

    const title = document.createElement('div');
    title.className = 'subsection-folder-title';
    title.textContent = sub.name;

    const note = document.createElement('div');
    note.className = 'subsection-folder-note';
    note.textContent = 'підрозділ';

    body.append(title, note);
    a.append(cover, body);

    return a;
}

/* ============================================================
   СІТКА ВІДЕО
   ============================================================ */

function renderVideos() {
    const grid = document.getElementById('video-grid');
    grid.innerHTML = '';

    const fragment = document.createDocumentFragment();
    filteredVideos.forEach(item => {
        fragment.appendChild(createVideoCard(item));
    });
    grid.appendChild(fragment);
    updateBulkActions();
}

/* ============================================================
   КАРТКА ВІДЕО
   ============================================================ */

function createVideoCard(item) {
    const video = item.video;
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.index = item.index;
    card.classList.toggle('is-selected', selectedVideoIndices.has(item.index));

    const embedUrl = getEmbedUrl(video.url);
    const thumbUrl = getThumbnail(video.url);

    if (embedUrl) {
        const thumbBtn = document.createElement('button');
        thumbBtn.type = 'button';
        thumbBtn.className = 'video-thumb';
        thumbBtn.style.backgroundImage = `url("${thumbUrl}")`;
        thumbBtn.setAttribute('aria-label', 'Відтворити: ' + (video.title || ''));

        const play = document.createElement('span');
        play.className = 'play-icon';
        play.textContent = '▶';
        thumbBtn.appendChild(play);

        thumbBtn.addEventListener('click', e => {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                toggleVideoSelection(item.index);
                return;
            }

            const wrap = document.createElement('div');
            wrap.className = 'video-iframe-wrap';

            const iframe = document.createElement('iframe');
            iframe.src = embedUrl + '&autoplay=1';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            iframe.allowFullscreen = true;

            wrap.appendChild(iframe);
            card.replaceChild(wrap, thumbBtn);
        });

        card.appendChild(thumbBtn);
    } else {
        const errBox = document.createElement('div');
        errBox.className = 'video-thumb';
        errBox.textContent = 'Некоректне посилання';
        errBox.style.color = '#94a3b8';
        errBox.style.fontSize = '0.85rem';
        card.appendChild(errBox);
    }

    const info = document.createElement('div');
    info.className = 'video-info';

    const title = document.createElement('h3');
    title.className = 'video-title';
    title.textContent = video.title || 'Без назви';

    const actions = document.createElement('div');
    actions.className = 'video-card-actions';

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'video-select';
    selectBtn.title = 'Натисніть або Ctrl+Click картку, щоб вибрати відео';
    selectBtn.setAttribute('aria-pressed', String(selectedVideoIndices.has(item.index)));
    selectBtn.setAttribute('aria-label', selectedVideoIndices.has(item.index)
        ? 'Скасувати вибір відео'
        : 'Вибрати відео для групового переміщення');
    selectBtn.textContent = selectedVideoIndices.has(item.index) ? '✓' : '□';
    selectBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleVideoSelection(item.index);
    });

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'video-menu-button';
    menuBtn.textContent = '⋮';
    menuBtn.setAttribute('aria-label', 'Меню відео: ' + (video.title || 'Без назви'));
    menuBtn.addEventListener('click', e => {
        e.stopPropagation();
        openVideoMenu(e, item);
    });

    actions.append(selectBtn, menuBtn);
    info.append(title, actions);

    if (!currentSubsection && video.subsection) {
        const badge = document.createElement('span');
        badge.className = 'video-subsection-badge';
        badge.textContent = '📁 ' + video.subsection;
        info.appendChild(badge);
    }

    card.appendChild(info);

    card.addEventListener('contextmenu', e => {
        e.preventDefault();
        openVideoMenu(e, item);
    });
    card.addEventListener('click', e => {
        if (!e.ctrlKey || e.target.closest('button')) return;
        e.preventDefault();
        e.stopPropagation();
        toggleVideoSelection(item.index);
    });

    return card;
}

/* ============================================================
   ГРУПОВІ ДІЇ
   ============================================================ */

function setupBulkActions() {
    const catalog = document.querySelector('.catalog');
    const grid = document.getElementById('video-grid');
    if (!catalog || !grid || document.getElementById('bulk-video-actions')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'bulk-video-actions';
    toolbar.className = 'bulk-video-actions';

    const count = document.createElement('span');
    count.className = 'bulk-video-count';
    count.setAttribute('aria-live', 'polite');

    const moveSubBtn = document.createElement('button');
    moveSubBtn.type = 'button';
    moveSubBtn.className = 'btn';
    moveSubBtn.dataset.action = 'move-sub';
    moveSubBtn.textContent = '📁 У підрозділ';
    moveSubBtn.hidden = true;
    moveSubBtn.title = 'Перемістити вибране в підрозділ поточного розділу';
    moveSubBtn.addEventListener('click', openBulkSubsectionPicker);

    const moveSecBtn = document.createElement('button');
    moveSecBtn.type = 'button';
    moveSecBtn.className = 'btn';
    moveSecBtn.dataset.action = 'move-sec';
    moveSecBtn.textContent = '📂 У розділ';
    moveSecBtn.hidden = true;
    moveSecBtn.title = 'Перемістити вибране в інший розділ альбому';
    moveSecBtn.addEventListener('click', openBulkSectionPicker);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn secondary';
    clearBtn.dataset.action = 'clear';
    clearBtn.textContent = 'Скасувати вибір';
    clearBtn.hidden = true;
    clearBtn.addEventListener('click', clearVideoSelection);

    toolbar.append(count, moveSubBtn, moveSecBtn, clearBtn);
    catalog.insertBefore(toolbar, grid);
    updateBulkActions();
}

function toggleVideoSelection(index) {
    if (selectedVideoIndices.has(index)) selectedVideoIndices.delete(index);
    else selectedVideoIndices.add(index);

    const card = document.querySelector(`.video-card[data-index="${index}"]`);
    if (card) {
        const selected = selectedVideoIndices.has(index);
        card.classList.toggle('is-selected', selected);
        const button = card.querySelector('.video-select');
        if (button) {
            button.textContent = selected ? '✓' : '□';
            button.setAttribute('aria-pressed', String(selected));
            button.setAttribute('aria-label', selected
                ? 'Скасувати вибір відео'
                : 'Вибрати відео для групового переміщення');
        }
    }
    updateBulkActions();
}

function clearVideoSelection() {
    selectedVideoIndices.clear();
    document.querySelectorAll('.video-card.is-selected').forEach(card => {
        card.classList.remove('is-selected');
        const button = card.querySelector('.video-select');
        if (button) {
            button.textContent = '□';
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-label', 'Вибрати відео для групового переміщення');
        }
    });
    updateBulkActions();
}

function updateBulkActions() {
    const toolbar = document.getElementById('bulk-video-actions');
    if (!toolbar) return;
    const count = toolbar.querySelector('.bulk-video-count');
    const hasSelection = selectedVideoIndices.size > 0;
    count.textContent = hasSelection
        ? `Вибрано відео: ${selectedVideoIndices.size}`
        : 'Ctrl+Click картки або натисніть □, щоб вибрати відео';

    toolbar.querySelectorAll('[data-action]').forEach(btn => {
        btn.hidden = !hasSelection;
    });
}

function openBulkSubsectionPicker() {
    const items = [...selectedVideoIndices]
        .map(index => ({ video: VideosStore.getAll()[index], index }))
        .filter(item => item.video);

    if (!items.length) {
        clearVideoSelection();
        return;
    }

    SubsectionPicker.open({
        section: currentSection,
        items,
        onDone: () => {
            clearVideoSelection();
            rebuildSectionVideos();
            updateStats();
            applyMeta();
            applyFilters();
            showUnsavedHint();
        }
    });
}

function openBulkSectionPicker() {
    const items = [...selectedVideoIndices]
        .map(index => ({ video: VideosStore.getAll()[index], index }))
        .filter(item => item.video);

    if (!items.length) {
        clearVideoSelection();
        return;
    }

    BulkSectionPicker.open({
        album: currentAlbum,
        currentSection: currentSection,
        items,
        onDone: () => {
            clearVideoSelection();
            rebuildSectionVideos();
            updateStats();
            applyMeta();
            applyFilters();
            showUnsavedHint();
        }
    });
}

/* ============================================================
   КОНТЕКСТНЕ МЕНЮ ВІДЕО
   ============================================================ */

function openVideoMenu(e, item) {
    ContextCard.showMenu(e, [
        {
            icon: '✏️',
            label: 'Редагувати',
            onClick: () => openVideoEditor(item)
        },
        {
            icon: '🔀',
            label: 'Переміщення / Дублювання в альбомі',
            onClick: () => openMoveDup(item)
        },
        {
            icon: '📁',
            label: 'Перемістити в підгрупу',
            onClick: () => openSubsectionPicker(item)
        },
        '---',
        {
            icon: '🗑️',
            label: 'Видалити відео',
            danger: true,
            onClick: () => removeVideo(item)
        }
    ]);
}

/* ============================================================
   МОДАЛКА: РЕДАГУВАННЯ ВІДЕО
   ============================================================ */

function openVideoEditor(item) {
    const video = item.video;

    const sections = [...new Set(
        VideosStore.getAll().map(v => v.section || 'Без розділу')
    )].sort((a, b) => a.localeCompare(b, 'uk'));

    const subs = VideosStore.getSubsections(video.section || currentSection);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const sectionOptions = sections.map(s =>
        `<option value="${escapeAttr(s)}" ${s === (video.section || 'Без розділу') ? 'selected' : ''}>${escapeHtml(s)}</option>`
    ).join('');

    const currentSub = video.subsection || '';
    const subOptions = ['<option value="">— без підрозділу —</option>']
        .concat(subs.map(s =>
            `<option value="${escapeAttr(s.name)}" ${s.name === currentSub ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
        ))
        .join('');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-header">
            <h2>Редагувати відео</h2>
            <button class="modal-close" type="button" aria-label="Закрити">✕</button>
        </div>
        <div class="modal-body">
            <form class="modal-form" novalidate>

                <div class="modal-field">
                    <label for="vf-title">Назва</label>
                    <input id="vf-title" type="text"
                           placeholder="Назва відео" required>
                </div>

                <div class="modal-field">
                    <label for="vf-url">Посилання на YouTube</label>
                    <input id="vf-url" type="text"
                           placeholder="https://youtu.be/…" required>
                </div>

                <div class="modal-field">
                    <label for="vf-section">Розділ</label>
                    <select id="vf-section">${sectionOptions}</select>
                    <small class="modal-hint">Зміна розділу перемістить відео і скине підрозділ.</small>
                </div>

                <div class="modal-field">
                    <label for="vf-subsection">Підрозділ</label>
                    <select id="vf-subsection">${subOptions}</select>
                    <div id="vf-sub-new-wrap" style="margin-top:8px;display:none">
                        <input id="vf-sub-new" type="text"
                               placeholder="Назва нового підрозділу">
                    </div>
                    <small class="modal-hint">Обрати наявний або створити новий.</small>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn secondary" id="vf-cancel">Скасувати</button>
                    <button type="submit" class="btn">Зберегти</button>
                </div>
            </form>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const form = modal.querySelector('form');
    const titleInput = modal.querySelector('#vf-title');
    const urlInput = modal.querySelector('#vf-url');
    const sectionSelect = modal.querySelector('#vf-section');
    const subSelect = modal.querySelector('#vf-subsection');
    const subNewWrap = modal.querySelector('#vf-sub-new-wrap');
    const subNewInput = modal.querySelector('#vf-sub-new');
    const cancelBtn = modal.querySelector('#vf-cancel');
    const closeBtn = modal.querySelector('.modal-close');

    titleInput.value = video.title || '';
    urlInput.value = video.url || '';

    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '➕ новий підрозділ…';
    subSelect.appendChild(newOpt);

    subSelect.addEventListener('change', () => {
        if (subSelect.value === '__new__') {
            subNewWrap.style.display = '';
            subNewInput.focus();
        } else {
            subNewWrap.style.display = 'none';
            subNewInput.value = '';
        }
    });

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

    form.addEventListener('submit', e => {
        e.preventDefault();

        const newTitle = titleInput.value.trim();
        const newUrl = urlInput.value.trim();
        const newSection = sectionSelect.value;
        let newSub = subSelect.value;

        if (newSub === '__new__') {
            newSub = subNewInput.value.trim();
            if (!newSub) {
                alert('Введіть назву нового підрозділу.');
                subNewInput.focus();
                return;
            }
        }

        if (!newTitle) {
            titleInput.focus();
            titleInput.classList.add('error');
            setTimeout(() => titleInput.classList.remove('error'), 1500);
            return;
        }
        if (!extractYouTubeId(newUrl)) {
            alert('Не вдалось розпізнати YouTube ID у посиланні.');
            urlInput.focus();
            return;
        }

        VideosStore.updateVideo(item.index, {
            title: newTitle,
            url: newUrl,
            section: newSection,
            subsection: newSub
        });

        close();

        if (newSection !== currentSection) {
            location.href = `section.html?id=${encodeURIComponent(currentAlbum.id)}` +
                            `&name=${encodeURIComponent(newSection)}`;
            return;
        }

        rebuildSectionVideos();
        updateStats();
        applyMeta();
        applyFilters();
        showUnsavedHint();
    });

    setTimeout(() => titleInput.focus(), 50);
}

/* ============================================================
   МОДАЛКА: ПЕРЕМІЩЕННЯ / ДУБЛЮВАННЯ
   ============================================================ */

function openMoveDup(item) {
    clearVideoSelection();
    MoveDup.open({
        album: currentAlbum,
        currentSection: currentSection,
        item: item,
        onDone: () => {
            rebuildSectionVideos();
            updateStats();
            applyFilters();
            applyMeta();
            showUnsavedHint();
        }
    });
}

/* ============================================================
   МОДАЛКА: ПЕРЕМІСТИТИ В ПІДГРУПУ
   ============================================================ */

function openSubsectionPicker(item) {
    SubsectionPicker.open({
        section: item.video.section || currentSection,
        currentSubsection: item.video.subsection || '',
        item: item,
        onDone: () => {
            rebuildSectionVideos();
            updateStats();
            applyMeta();
            applyFilters();
            showUnsavedHint();
        }
    });
}

/* ============================================================
   ДІЯ: ВИДАЛИТИ ВІДЕО
   ============================================================ */

async function removeVideo(item) {
    const video = item.video;
    const ok = await Modal.confirm({
        title: 'Видалити відео?',
        message: `Ви впевнені, що хочете видалити «${video.title || 'без назви'}» ` +
                 `з розділу «${currentSection}»?`,
        okLabel: 'Видалити'
    });
    if (!ok) return;

    VideosStore.removeVideo(item.index);
    const remainingSelections = [...selectedVideoIndices]
        .filter(index => index !== item.index)
        .map(index => index > item.index ? index - 1 : index);
    selectedVideoIndices.clear();
    remainingSelections.forEach(index => selectedVideoIndices.add(index));

    rebuildSectionVideos();
    updateStats();
    applyFilters();
    applyMeta();
    showUnsavedHint();
}

/* ============================================================
   БАНЕР НЕЗБЕРЕЖЕНИХ ЗМІН
   ============================================================ */

function showUnsavedHint() {
    const needsVideos = VideosStore.isDirty();
    if (!needsVideos) return;

    let banner = document.getElementById('unsaved-banner');
    if (banner) banner.remove();

    banner = document.createElement('div');
    banner.id = 'unsaved-banner';
    banner.className = 'unsaved-banner';
    banner.innerHTML = `
        <span>⚠️ Є незбережені зміни</span>
        <button class="btn" data-save="videos">💾 Зберегти ${VideosStore.filename}</button>
    `;
    document.body.appendChild(banner);

    banner.querySelector('[data-save]').addEventListener('click', async () => {
        const btn = banner.querySelector('[data-save]');
        btn.disabled = true;
        btn.textContent = '💾 Збереження…';

        try {
            const result = await VideosStore.save();
            VideosStore.markClean();
            banner.remove();

            if (result.method === 'both') {
                setStatus('✅ Записано локально та закомічено на GitHub.');
            } else if (result.method === 'fs') {
                setStatus('✅ Збережено у вибрану теку.');
            } else if (result.method === 'github') {
                setStatus('✅ Закомічено на GitHub (локально не записано).');
            } else {
                setStatus('✅ Завантажено в Downloads. Перетягніть у data/.');
            }
        } catch (err) {
            console.error(err);
            btn.disabled = false;
            btn.textContent = '💾 Спробувати ще раз';
            setStatus('Помилка збереження: ' + err.message, true);
        }
    });
}

/* ============================================================
   СТАРТ
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);
// ═══ КІНЕЦЬ ФАЙЛУ section.js ═══