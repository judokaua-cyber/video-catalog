/* section/section.js

/* ============================================================
   Логіка сторінки розділу: каталог відео
   ============================================================ */

let currentAlbum = null;
let currentSection = '';
let allVideos = [];          // усі відео альбому (з VideosStore)
let sectionVideos = [];      // тільки цього розділу (з індексами у VideosStore)
let filteredVideos = [];     // після пошуку
let currentQuery = '';
let currentView = 'grid';

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
    applyFilters();

    setStatus('');
}

/**
 * Перебудовує sectionVideos з урахуванням поточного стану VideosStore.
 * Кожен запис: { video: {...}, index: N } — index у глобальному масиві.
 */
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

    document.title = `${currentSection} — ${currentAlbum.title}`;

    document.getElementById('section-title').textContent = currentSection;
    document.getElementById('section-description').textContent = secMeta.description || '';

    document.getElementById('crumb-album').textContent = currentAlbum.title;
    document.getElementById('crumb-album').href =
        `../album/album.html?id=${encodeURIComponent(currentAlbum.id)}`;
    document.getElementById('crumb-section').textContent = currentSection;

    document.getElementById('footer-album-link').href =
        `../album/album.html?id=${encodeURIComponent(currentAlbum.id)}`;
    document.getElementById('footer-album-link').textContent =
        `← До альбому «${currentAlbum.title}»`;

    const cover = document.getElementById('section-cover');
    cover.innerHTML = '';
    cover.classList.remove('placeholder');

    let coverUrl = secMeta.cover || '';
    if (!coverUrl && sectionVideos.length > 0) {
        coverUrl = getThumbnail(sectionVideos[0].video.url);
    }

    if (coverUrl) {
        cover.style.backgroundImage = `url("${coverUrl}")`;
    } else {
        cover.style.backgroundImage = '';
        cover.classList.add('placeholder');
        cover.textContent = currentSection.charAt(0).toUpperCase();
    }

    updateStats();
}

function updateStats() {
    document.getElementById('stat-videos').textContent = sectionVideos.length;
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
    filteredVideos = sectionVideos.slice();

    if (currentQuery) {
        filteredVideos = filteredVideos.filter(item =>
            (item.video.title || '').toLowerCase().includes(currentQuery)
        );
    }

    renderVideos();
    toggleEmptyState();
}

function toggleEmptyState() {
    const empty = document.getElementById('empty-state');
    const grid = document.getElementById('video-grid');
    empty.hidden = filteredVideos.length > 0;
    grid.style.display = filteredVideos.length === 0 ? 'none' : '';
}

function renderVideos() {
    const grid = document.getElementById('video-grid');
    grid.innerHTML = '';

    const fragment = document.createDocumentFragment();
    filteredVideos.forEach(item => {
        fragment.appendChild(createVideoCard(item));
    });
    grid.appendChild(fragment);
}

/* ============================================================
   КАРТКА ВІДЕО
   ============================================================ */

function createVideoCard(item) {
    const video = item.video;
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.index = item.index;

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

        thumbBtn.addEventListener('click', () => {
            const wrap = document.createElement('div');
            wrap.className = 'video-iframe-wrap';

            const iframe = document.createElement('iframe');
            iframe.src = embedUrl + '&autoplay=1';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            iframe.allowFullscreen = true;

            wrap.appendChild(iframe);
            card.replaceChild(wrap, thumbBtn);
        }, { once: true });

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

    info.appendChild(title);
    card.appendChild(info);

    // ПКМ — контекстне меню
    card.addEventListener('contextmenu', e => {
        e.preventDefault();
        openVideoMenu(e, item);
    });

    return card;
}

/* ============================================================
   КОНТЕКСТНЕ МЕНЮ ВІДЕО
   ============================================================ */

function openVideoMenu(e, item) {
    const video = item.video;

    ContextCard.showMenu(e, [
        {
            icon: '✏️',
            label: 'Редагувати',
            onClick: () => openVideoEditor(item)
        },
        {
            icon: '🔀',
            label: 'Переміщення / Дублювання',
            onClick: () => openMoveDup(item)
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

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const sectionOptions = sections.map(s =>
        `<option value="${escapeAttr(s)}" ${s === (video.section || 'Без розділу') ? 'selected' : ''}>${escapeHtml(s)}</option>`
    ).join('');

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
                    <small class="modal-hint">Зміна розділу перемістить відео.</small>
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
    const cancelBtn = modal.querySelector('#vf-cancel');
    const closeBtn = modal.querySelector('.modal-close');

    titleInput.value = video.title || '';
    urlInput.value = video.url || '';

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
            section: newSection
        });

        close();

        if (newSection !== currentSection) {
            location.href = `section.html?id=${encodeURIComponent(currentAlbum.id)}` +
                            `&name=${encodeURIComponent(newSection)}`;
            return;
        }

        rebuildSectionVideos();
        updateStats();
        applyFilters();
        showUnsavedHint();
    });

    setTimeout(() => titleInput.focus(), 50);
}

/* ============================================================
   МОДАЛКА: ПЕРЕМІЩЕННЯ / ДУБЛЮВАННЯ
   ============================================================ */

function openMoveDup(item) {
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
