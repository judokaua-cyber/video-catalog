/* ============================================================
   Логіка сторінки альбому: каталог розділів
   ============================================================ */

const DATA_BASE = '../data/';
const MAX_COVER_SIZE = 300 * 1024;   // 300 КБ

let currentAlbum = null;

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

function extractYouTubeIds(text) {
    if (!text) return [];
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s,;"'<>]+/gi;
    const urls = text.match(urlRegex) || [];
    const ids = new Set();
    urls.forEach(u => {
        const id = extractYouTubeId(u);
        if (id) ids.add(id);
    });
    if (ids.size === 0) {
        const bare = /\b([A-Za-z0-9_-]{11})\b/g;
        let m;
        while ((m = bare.exec(text)) !== null) ids.add(m[1]);
    }
    return [...ids];
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

/* ============================================================
   ЗАВАНТАЖЕННЯ СТОРІНКИ
   ============================================================ */

async function init() {
    const albumId = getParam('id');
    if (!albumId) {
        setStatus('Не вказано альбом. Перейдіть з головної сторінки.', true);
        return;
    }

    setStatus('Завантаження…');

    // 1) Метадані альбому
    try {
        await AlbumsStore.load();
    } catch (err) {
        setStatus('Помилка завантаження albums.json: ' + err.message, true);
        return;
    }

    currentAlbum = AlbumsStore.getById(albumId);
    if (!currentAlbum) {
        setStatus(`Альбом "${albumId}" не знайдено в albums.json.`, true);
        return;
    }

    // 2) Відео альбому
    try {
        await VideosStore.load(currentAlbum.file);
    } catch (err) {
        console.warn('Файл відео не завантажено:', err.message);
        setStatus(`Файл ${currentAlbum.file} не знайдено. Створіть його з вмістом [].`, true);
    }

    applyAlbumMeta();
    renderSections();
}

/* ============================================================
   ЗАГОЛОВОК АЛЬБОМУ
   ============================================================ */

function applyAlbumMeta() {
    document.title = `${currentAlbum.title} — Відео Академія`;
    document.getElementById('album-title').textContent = currentAlbum.title;
    document.getElementById('album-description').textContent = currentAlbum.description || '';
    document.getElementById('crumb-album').textContent = currentAlbum.title;

    const cover = document.getElementById('album-cover');
    cover.innerHTML = '';
    cover.classList.remove('placeholder');
    if (currentAlbum.cover) {
        cover.style.backgroundImage = `url("${currentAlbum.cover}")`;
    } else {
        cover.style.backgroundImage = '';
        cover.classList.add('placeholder');
        cover.textContent = currentAlbum.title.charAt(0).toUpperCase();
    }
}

function updateStats(sections) {
    const totalVideos = sections.reduce((sum, s) => sum + s.count, 0);
    document.getElementById('stat-sections').textContent = sections.length;
    document.getElementById('stat-videos').textContent = totalVideos;
}

/* ============================================================
   РЕНДЕР РОЗДІЛІВ
   ============================================================ */

function renderSections() {
    const grid = document.getElementById('sections-grid');
    grid.innerHTML = '';

    const sections = VideosStore.getSections();
    updateStats(sections);

    if (sections.length === 0) {
        setStatus('У цьому альбомі ще немає розділів. Створіть перший.');
    } else {
        setStatus('');
    }

    sections.forEach(sec => {
        grid.appendChild(createSectionCard(sec));
    });

    grid.appendChild(ContextCard.createNew({
        label: 'Новий розділ',
        onClick: () => openSectionEditor(null)
    }));
}

function createSectionCard(section) {
    const secMeta = (currentAlbum.sections || {})[section.name] || {};

    // Обкладинка: із секції, або — прев'ю першого відео розділу
    let cover = secMeta.cover || '';
    if (!cover) {
        const firstVideo = VideosStore.getAll()
            .find(v => (v.section || 'Без розділу') === section.name);
        if (firstVideo) {
            const id = extractYouTubeId(firstVideo.url);
            if (id) cover = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
        }
    }

    const href = `../section/section.html?id=${encodeURIComponent(currentAlbum.id)}` +
                 `&name=${encodeURIComponent(section.name)}`;

    return ContextCard.create({
        title: section.name,
        description: secMeta.description || '',
        cover,
        placeholderLetter: section.name.charAt(0),
        count: section.count,
        accent: 'green',
        href,
        menuItems: [
            {
                icon: '📂',
                label: 'Відкрити',
                onClick: () => { location.href = href; }
            },
            {
                icon: '✏️',
                label: 'Редагувати розділ',
                onClick: () => openSectionEditor(section)
            },
            {
                icon: '🔗',
                label: 'Додати відео',
                onClick: () => openAddVideosDialog(section)
            },
            '---',
            {
                icon: '🗑️',
                label: 'Видалити розділ',
                danger: true,
                onClick: () => removeSection(section)
            }
        ]
    });
}

/* ============================================================
   МОДАЛКА: РЕДАГУВАННЯ / СТВОРЕННЯ РОЗДІЛУ
   ============================================================ */

function openSectionEditor(section) {
    const isNew = !section;
    const secMeta = section
        ? ((currentAlbum.sections || {})[section.name] || {})
        : {};

    let coverDataUrl = secMeta.cover || '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
        <div class="modal-header">
            <h2>${isNew ? 'Новий розділ' : 'Редагувати розділ'}</h2>
            <button class="modal-close" type="button" aria-label="Закрити">✕</button>
        </div>
        <div class="modal-body">
            <form class="modal-form" novalidate>

                <div class="modal-field">
                    <label for="sf-name">Назва розділу</label>
                    <input id="sf-name" name="name" type="text"
                           placeholder="Наприклад: JUDO" required>
                </div>

                <div class="modal-field">
                    <label for="sf-description">Опис</label>
                    <textarea id="sf-description" name="description" rows="2"
                              placeholder="Короткий опис розділу"></textarea>
                </div>

                <div class="modal-field">
                    <label>Обкладинка</label>
                    <div class="cover-picker">
                        <div class="cover-preview" id="sec-cover-preview"></div>
                        <div class="cover-controls">
                            <input type="file" id="sec-cover-input" accept="image/*" hidden>
                            <button type="button" class="btn" id="sec-cover-pick-btn">
                                📁 Обрати файл…
                            </button>
                            <button type="button" class="btn secondary" id="sec-cover-clear-btn" hidden>
                                ✕ Прибрати
                            </button>
                            <p class="cover-info" id="sec-cover-info"></p>
                            <p class="modal-hint">
                                Необов'язково. Якщо порожньо — використається прев'ю
                                першого відео розділу.
                            </p>
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn secondary" id="sec-cancel">Скасувати</button>
                    <button type="submit" class="btn">${isNew ? 'Створити' : 'Зберегти'}</button>
                </div>
            </form>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const form = modal.querySelector('form');
    const nameInput = modal.querySelector('#sf-name');
    const descInput = modal.querySelector('#sf-description');
    const coverPreview = modal.querySelector('#sec-cover-preview');
    const coverInput = modal.querySelector('#sec-cover-input');
    const coverPickBtn = modal.querySelector('#sec-cover-pick-btn');
    const coverClearBtn = modal.querySelector('#sec-cover-clear-btn');
    const coverInfo = modal.querySelector('#sec-cover-info');
    const cancelBtn = modal.querySelector('#sec-cancel');
    const closeBtn = modal.querySelector('.modal-close');

    nameInput.value = section?.name || '';
    descInput.value = secMeta.description || '';
    renderCoverPreview();

    function renderCoverPreview() {
        coverPreview.innerHTML = '';
        if (coverDataUrl) {
            const img = document.createElement('img');
            img.src = coverDataUrl;
            img.alt = 'Обкладинка';
            coverPreview.appendChild(img);
            coverPreview.classList.remove('empty');
            coverClearBtn.hidden = false;
        } else {
            coverPreview.classList.add('empty');
            const letter = (nameInput.value || '?').charAt(0).toUpperCase();
            coverPreview.textContent = letter;
            coverClearBtn.hidden = true;
        }
    }

    nameInput.addEventListener('input', () => {
        if (!coverDataUrl) renderCoverPreview();
    });

    coverPickBtn.addEventListener('click', () => coverInput.click());

    coverInput.addEventListener('change', () => {
        const file = coverInput.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Це не зображення.');
            coverInput.value = '';
            return;
        }

        if (file.size > MAX_COVER_SIZE) {
            const kb = Math.round(file.size / 1024);
            const ok = confirm(
                `Файл завеликий: ${kb} КБ (ліміт ${Math.round(MAX_COVER_SIZE / 1024)} КБ).\n\n` +
                `Продовжити все одно?`
            );
            if (!ok) { coverInput.value = ''; return; }
        }

        const reader = new FileReader();
        reader.onload = e => {
            coverDataUrl = e.target.result;
            renderCoverPreview();
            coverInfo.textContent = `${file.name} — ${Math.round(file.size / 1024)} КБ`;
        };
        reader.readAsDataURL(file);
    });

    coverClearBtn.addEventListener('click', () => {
        coverDataUrl = '';
        coverInput.value = '';
        coverInfo.textContent = '';
        renderCoverPreview();
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

        const newName = nameInput.value.trim();
        if (!newName) {
            nameInput.focus();
            nameInput.classList.add('error');
            setTimeout(() => nameInput.classList.remove('error'), 1500);
            return;
        }

        const newDesc = descInput.value.trim();
        const newCover = coverDataUrl;

        if (isNew) {
            // Перевірка на дублікат
            const existing = VideosStore.getSections();
            if (existing.some(s => s.name === newName)) {
                alert(`Розділ "${newName}" уже існує.`);
                nameInput.focus();
                return;
            }

            if (!currentAlbum.sections) currentAlbum.sections = {};
            currentAlbum.sections[newName] = {
                description: newDesc,
                cover: newCover
            };
            AlbumsStore.update(currentAlbum.id, { sections: currentAlbum.sections });

            close();
            renderSections();
            showUnsavedHint();

            setTimeout(() => {
                const addNow = confirm(
                    `Розділ "${newName}" створено.\n\n` +
                    `Додати відео зараз?`
                );
                if (addNow) {
                    openAddVideosDialog({ name: newName, count: 0 });
                }
            }, 200);

        } else {
            const oldName = section.name;

            if (newName !== oldName) {
                const ok = confirm(
                    `Перейменувати розділ "${oldName}" → "${newName}"?\n\n` +
                    `Це оновить розділ у всіх ${section.count} відео.`
                );
                if (!ok) return;

                VideosStore.renameSection(oldName, newName);

                if (currentAlbum.sections && currentAlbum.sections[oldName]) {
                    currentAlbum.sections[newName] = currentAlbum.sections[oldName];
                    delete currentAlbum.sections[oldName];
                }
            }

            if (!currentAlbum.sections) currentAlbum.sections = {};
            currentAlbum.sections[newName] = {
                description: newDesc,
                cover: newCover
            };
            AlbumsStore.update(currentAlbum.id, { sections: currentAlbum.sections });

            close();
            renderSections();
            showUnsavedHint();
        }
    });

    setTimeout(() => nameInput.focus(), 50);
}

/* ============================================================
   МОДАЛКА: ДОДАТИ ВІДЕО
   ============================================================ */

function openAddVideosDialog(section) {
    Modal.open({
        title: `Додати відео — ${section.name}`,
        submitLabel: 'Додати',
        fields: [
            {
                name: 'links',
                label: 'Посилання на YouTube',
                type: 'textarea',
                rows: 8,
                placeholder: 'Одне на рядок, або все в купі — розберемо автоматично',
                required: true
            },
            {
                name: 'titles',
                label: 'Назви (необов\'язково)',
                type: 'textarea',
                rows: 3,
                placeholder: 'По одній на рядок, у тому ж порядку, що й посилання',
                hint: 'Якщо порожньо — будуть назви "Відео 1", "Відео 2"…'
            }
        ],
        onSubmit: values => {
            addVideosToSection(section, values.links, values.titles);
        }
    });
}

function addVideosToSection(section, rawLinks, rawTitles) {
    const ids = extractYouTubeIds(rawLinks);
    if (ids.length === 0) {
        alert('Не знайдено жодного YouTube ID.');
        return false;
    }

    const existingIds = new Set(
        VideosStore.getAll()
            .map(v => extractYouTubeId(v.url))
            .filter(Boolean)
    );

    const newIds = ids.filter(id => !existingIds.has(id));
    if (newIds.length === 0) {
        alert('Усі ці відео вже є в альбомі.');
        return false;
    }

    const titles = (rawTitles || '')
        .split('\n')
        .map(t => t.trim())
        .filter(Boolean);

    const currentCount = VideosStore.getAll().length;

    newIds.forEach((id, i) => {
        const title = titles[i] || `Відео ${currentCount + i + 1}`;
        VideosStore.addVideo({
            title,
            section: section.name,
            url: `https://www.youtube.com/watch?v=${id}`
        });
    });

    renderSections();
    showUnsavedHint();

    return true;
}

/* ============================================================
   ДІЯ: ВИДАЛИТИ РОЗДІЛ
   ============================================================ */

async function removeSection(section) {
    const ok = await Modal.confirm({
        title: 'Видалити розділ?',
        message: `Ви впевнені, що хочете видалити розділ «${section.name}»?\n\n` +
                 `Це видалить ${section.count} відео з розділу. ` +
                 `Зміни збережуться у ${VideosStore.filename} та albums.json.`,
        okLabel: 'Видалити'
    });
    if (!ok) return;

    VideosStore.removeSection(section.name);

    if (currentAlbum.sections && currentAlbum.sections[section.name]) {
        delete currentAlbum.sections[section.name];
        AlbumsStore.update(currentAlbum.id, { sections: currentAlbum.sections });
    }

    renderSections();
    showUnsavedHint();
}

/* ============================================================
   БАНЕР НЕЗБЕРЕЖЕНИХ ЗМІН
   ============================================================ */

function showUnsavedHint() {
    const needsAlbums = AlbumsStore.isDirty();
    const needsVideos = VideosStore.isDirty();
    if (!needsAlbums && !needsVideos) return;

    let banner = document.getElementById('unsaved-banner');
    if (banner) banner.remove();

    banner = document.createElement('div');
    banner.id = 'unsaved-banner';
    banner.className = 'unsaved-banner';

    const buttons = [];
    if (needsVideos) {
        buttons.push(`<button class="btn" data-save="videos">💾 Зберегти ${VideosStore.filename}</button>`);
    }
    if (needsAlbums) {
        buttons.push(`<button class="btn" data-save="albums">💾 Зберегти albums.json</button>`);
    }

    banner.innerHTML = `
        <span>⚠️ Є незбережені зміни</span>
        ${buttons.join('')}
    `;
    document.body.appendChild(banner);

    banner.querySelectorAll('[data-save]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const which = btn.dataset.save;
            btn.disabled = true;
            const originalText = btn.textContent;
            btn.textContent = '💾 Збереження…';

            try {
                let result;
                if (which === 'albums') {
                    result = await AlbumsStore.save();
                    AlbumsStore.markClean();
                } else {
                    const result = await VideosStore.save();
                VideosStore.markClean();

                alert('DEBUG: ' + JSON.stringify(result));
                showUnsavedHint();

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
                btn.textContent = originalText;
                setStatus('Помилка збереження: ' + err.message, true);
            }
        });
    });
}

/* ============================================================
   СТАРТ
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);
