/* ============================================================
   Логіка головної сторінки: каталог альбомів
   ============================================================ */

const DATA_BASE = 'data/';
const MAX_COVER_SIZE = 300 * 1024;   // 300 КБ

/* ============================================================
   СТАТУС
   ============================================================ */

function setStatus(msg, isError = false) {
    const el = document.getElementById('status');
    el.textContent = msg || '';
    el.classList.toggle('error', isError);
}

/* ============================================================
   РЕНДЕР КАТАЛОГУ
   ============================================================ */

async function renderCatalog() {
    const grid = document.getElementById('albums-grid');
    grid.innerHTML = '';

    setStatus('Завантаження…');

    try {
        await AlbumsStore.load();
    } catch (err) {
        console.error(err);
        setStatus('Помилка завантаження albums.json: ' + err.message, true);
        return;
    }

    const albums = AlbumsStore.getAll();

    if (albums.length === 0) {
        setStatus('Поки що немає жодного альбому. Створіть перший.');
    } else {
        setStatus('');
    }

    for (const album of albums) {
        grid.appendChild(await createAlbumCard(album));
    }

    grid.appendChild(ContextCard.createNew({
        label: 'Новий альбом',
        onClick: () => openAlbumEditor(null)
    }));
}

/* ============================================================
   СТВОРЕННЯ КАРТКИ АЛЬБОМУ
   ============================================================ */

async function createAlbumCard(album) {
    let videoCount = 0;
    let sectionCount = 0;

    try {
        const res = await fetch(DATA_BASE + album.file);
        if (res.ok) {
            const data = await res.json();
            videoCount = Array.isArray(data) ? data.length : 0;
            sectionCount = new Set(
                data.map(v => v.section).filter(Boolean)
            ).size;
        }
    } catch (e) {
        console.warn('Не вдалось прочитати', album.file, e.message);
    }

    const subtitle = sectionCount > 0
        ? `${sectionCount} розділів`
        : (album.description || '');

    return ContextCard.create({
        title: album.title,
        description: subtitle || album.description || '',
        cover: album.cover,
        placeholderLetter: album.title.charAt(0),
        count: videoCount || undefined,
        accent: 'blue',
        href: `album/album.html?id=${encodeURIComponent(album.id)}`,
        menuItems: [
            {
                icon: '📂',
                label: 'Відкрити',
                onClick: () => {
                    location.href = `album/album.html?id=${encodeURIComponent(album.id)}`;
                }
            },
            {
                icon: '✏️',
                label: 'Редагувати альбом',
                onClick: () => openAlbumEditor(album)
            },
            '---',
            {
                icon: '📥',
                label: 'Завантажити JSON',
                onClick: () => downloadAlbumFile(album)
            },
            {
                icon: '🔗',
                label: 'Додати посилання',
                onClick: () => openAddLinksDialog(album)
            },
            '---',
            {
                icon: '🗑️',
                label: 'Видалити альбом',
                danger: true,
                onClick: () => removeAlbum(album)
            }
        ]
    });
}

/* ============================================================
   МОДАЛКА РЕДАГУВАННЯ АЛЬБОМУ (з Base64-обкладинкою)
   ============================================================ */

function openAlbumEditor(album) {
    const isNew = !album;

    // Локальний стан цієї модалки
    let coverDataUrl = album?.cover || '';   // data:image/...;base64,...
    let coverName = '';
    let coverSize = 0;

    // --- Побудова вмісту модалки вручну (не через Modal.open) ---
    // Бо потрібна кастомна логіка з файлом і прев'ю.

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
        <div class="modal-header">
            <h2>${isNew ? 'Новий альбом' : 'Редагувати альбом'}</h2>
            <button class="modal-close" type="button" aria-label="Закрити">✕</button>
        </div>
        <div class="modal-body">
            <form class="modal-form" novalidate>

                <div class="modal-field">
                    <label for="mf-title">Назва</label>
                    <input id="mf-title" name="title" type="text"
                           placeholder="Наприклад: Техніка у стійці" required>
                </div>

                <div class="modal-field">
                    <label for="mf-description">Опис</label>
                    <textarea id="mf-description" name="description" rows="2"
                              placeholder="Короткий опис альбому"></textarea>
                </div>

                <div class="modal-field">
                    <label>Обкладинка</label>
                    <div class="cover-picker">
                        <div class="cover-preview" id="cover-preview"></div>
                        <div class="cover-controls">
                            <input type="file" id="cover-input" accept="image/*" hidden>
                            <button type="button" class="btn" id="cover-pick-btn">
                                📁 Обрати файл…
                            </button>
                            <button type="button" class="btn secondary" id="cover-clear-btn" hidden>
                                ✕ Прибрати
                            </button>
                            <p class="cover-info" id="cover-info"></p>
                            <p class="modal-hint">
                                Рекомендовано до 300 КБ. Картинка зберігається
                                прямо в albums.json (Base64).
                            </p>
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn secondary" id="modal-cancel">Скасувати</button>
                    <button type="submit" class="btn">${isNew ? 'Створити' : 'Зберегти'}</button>
                </div>
            </form>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // --- Елементи ---
    const form = modal.querySelector('form');
    const titleInput = modal.querySelector('#mf-title');
    const descInput = modal.querySelector('#mf-description');
    const coverPreview = modal.querySelector('#cover-preview');
    const coverInput = modal.querySelector('#cover-input');
    const coverPickBtn = modal.querySelector('#cover-pick-btn');
    const coverClearBtn = modal.querySelector('#cover-clear-btn');
    const coverInfo = modal.querySelector('#cover-info');
    const cancelBtn = modal.querySelector('#modal-cancel');
    const closeBtn = modal.querySelector('.modal-close');

    // --- Початкові значення ---
    titleInput.value = album?.title || '';
    descInput.value = album?.description || '';
    renderCoverPreview();

    // --- Прев'ю обкладинки ---
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
            const letter = (titleInput.value || '?').charAt(0).toUpperCase();
            coverPreview.textContent = letter;
            coverClearBtn.hidden = true;
        }
    }

    // Оновлюємо літеру-заглушку, коли змінюється назва
    titleInput.addEventListener('input', () => {
        if (!coverDataUrl) renderCoverPreview();
    });

    // --- Вибір файлу ---
    coverPickBtn.addEventListener('click', () => coverInput.click());

    coverInput.addEventListener('change', () => {
        const file = coverInput.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Це не зображення. Оберіть файл .jpg, .png, .webp або .gif');
            coverInput.value = '';
            return;
        }

        if (file.size > MAX_COVER_SIZE) {
            const kb = Math.round(file.size / 1024);
            const ok = confirm(
                `Файл завеликий: ${kb} КБ (ліміт ${Math.round(MAX_COVER_SIZE / 1024)} КБ).\n\n` +
                `Це роздує albums.json. Продовжити все одно?`
            );
            if (!ok) {
                coverInput.value = '';
                return;
            }
        }

        const reader = new FileReader();
        reader.onload = e => {
            coverDataUrl = e.target.result;   // data:image/...;base64,...
            coverName = file.name;
            coverSize = file.size;
            renderCoverPreview();
            coverInfo.textContent = `${file.name} — ${Math.round(file.size / 1024)} КБ`;
        };
        reader.onerror = () => {
            alert('Не вдалось прочитати файл.');
        };
        reader.readAsDataURL(file);
    });

    // --- Прибрати обкладинку ---
    coverClearBtn.addEventListener('click', () => {
        coverDataUrl = '';
        coverName = '';
        coverSize = 0;
        coverInput.value = '';
        coverInfo.textContent = '';
        renderCoverPreview();
    });

    // --- Закриття ---
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

    // --- Submit ---
    form.addEventListener('submit', e => {
        e.preventDefault();

        const title = titleInput.value.trim();
        if (!title) {
            titleInput.focus();
            titleInput.classList.add('error');
            setTimeout(() => titleInput.classList.remove('error'), 1500);
            return;
        }

        const values = {
            title,
            description: descInput.value.trim(),
            cover: coverDataUrl
        };

        if (isNew) {
            const created = AlbumsStore.add(values);
            close();
            renderCatalog();
            setTimeout(() => showNewAlbumHint(created), 100);
        } else {
            AlbumsStore.update(album.id, values);
            close();
            renderCatalog();
        }
        showUnsavedHint();
    });

    // --- Фокус ---
    setTimeout(() => titleInput.focus(), 50);
}

/* ============================================================
   ДІЇ: ЗАВАНТАЖИТИ JSON
   ============================================================ */

async function downloadAlbumFile(album) {
    try {
        const res = await fetch(DATA_BASE + album.file);
        if (!res.ok) {
            alert(`Файл ${album.file} не знайдено на сервері.`);
            return;
        }
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = album.file;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Помилка завантаження: ' + err.message);
    }
}

/* ============================================================
   ДІЇ: ДОДАТИ ПОСИЛАННЯ
   ============================================================ */

function openAddLinksDialog(album) {
    Modal.open({
        title: `Додати відео — ${album.title}`,
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
                name: 'section',
                label: 'Розділ',
                placeholder: 'Наприклад: JUDO',
                hint: 'Усі додані відео потраплять у цей розділ.'
            }
        ],
        onSubmit: async values => {
            await addLinksToAlbum(album, values.links, values.section);
        }
    });
}

async function addLinksToAlbum(album, rawLinks, section) {
    const ids = extractYouTubeIds(rawLinks);

    if (ids.length === 0) {
        alert('Не знайдено жодного YouTube ID у введеному тексті.');
        return false;
    }

    let data = [];
    try {
        const res = await fetch(DATA_BASE + album.file);
        if (res.ok) data = await res.json();
        if (!Array.isArray(data)) data = [];
    } catch (e) {
        // Файл ще не існує — почнемо з порожнього
    }

    const existingIds = new Set(
        data.map(v => extractYouTubeId(v.url)).filter(Boolean)
    );

    const newIds = ids.filter(id => !existingIds.has(id));

    if (newIds.length === 0) {
        alert('Усі ці відео вже є в альбомі.');
        return false;
    }

    const sectionName = section.trim() || 'Без розділу';
    newIds.forEach(id => {
        data.push({
            title: `Відео ${data.length + 1}`,
            section: sectionName,
            url: `https://www.youtube.com/watch?v=${id}`
        });
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = album.file;
    a.click();
    URL.revokeObjectURL(url);

    setTimeout(() => {
        alert(
            `Додано ${newIds.length} відео.\n\n` +
            `Файл ${album.file} завантажено. Замініть його у теці data/ ` +
            `і оновіть сторінку.`
        );
    }, 200);
}

/* ============================================================
   ДІЇ: ВИДАЛИТИ АЛЬБОМ
   ============================================================ */

async function removeAlbum(album) {
    const ok = await Modal.confirm({
        title: 'Видалити альбом?',
        message: `Ви впевнені, що хочете видалити «${album.title}» з каталогу?\n\n` +
                 `Файл ${album.file} на сервері не буде видалено — тільки запис в albums.json.`,
        okLabel: 'Видалити'
    });
    if (!ok) return;

    AlbumsStore.remove(album.id);
    renderCatalog();
    showUnsavedHint();
}

/* ============================================================
   ПІДКАЗКИ ПРО НЕЗБЕРЕЖЕНІ ЗМІНИ
   ============================================================ */

function showUnsavedHint() {
    if (!AlbumsStore.isDirty()) return;

    let banner = document.getElementById('unsaved-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'unsaved-banner';
        banner.className = 'unsaved-banner';
        banner.innerHTML = `
            <span>⚠️ Є незбережені зміни в albums.json</span>
            <button class="btn" id="save-albums-btn">💾 Зберегти albums.json</button>
        `;
        document.body.appendChild(banner);

        banner.querySelector('#save-albums-btn').addEventListener('click', async () => {
            const btn = banner.querySelector('#save-albums-btn');
            btn.disabled = true;
            btn.textContent = '💾 Збереження…';

            try {
                const result = await AlbumsStore.save();
                AlbumsStore.markClean();
                banner.remove();

            if (result.method === 'both') {
                    setStatus('✅ albums.json: записано локально та закомічено на GitHub.');
                } else if (result.method === 'fs') {
                    setStatus('✅ albums.json збережено у вибрану теку.');
                } else if (result.method === 'github') {
                    setStatus('✅ albums.json закомічено на GitHub (локально не записано).');
                } else {
                    setStatus('✅ albums.json завантажено в Downloads. Перетягніть його в data/.');
                }
            } catch (err) {
                console.error(err);
                btn.disabled = false;
                btn.textContent = '💾 Спробувати ще раз';
                setStatus('Помилка збереження: ' + err.message, true);
            }
        });
    }
}

function showNewAlbumHint(album) {
    Modal.open({
        title: 'Файл даних для нового альбому',
        submitLabel: 'Створити порожній файл',
        fields: [
            {
                name: 'filename',
                label: 'Назва файлу',
                value: album.file,
                hint: `Файл буде завантажено на ваш комп'ютер. Покладіть його у теку data/.`
            }
        ],
        onSubmit: values => {
            const filename = values.filename.trim() || album.file;
            if (filename !== album.file) {
                AlbumsStore.update(album.id, { file: filename });
            }
            const blob = new Blob(['[]'], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }
    });
}

/* ============================================================
   УТИЛІТИ: ПАРСИНГ YOUTUBE ID
   (тимчасово тут; пізніше винесемо в js/youtube-utils.js)
   ============================================================ */

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
   СТАРТ
   ============================================================ */

document.addEventListener('DOMContentLoaded', renderCatalog);
