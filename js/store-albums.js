/* js/store-albums.js
   Єдине джерело правди для albums.json.
   Тримає поточний стан і дозволяє змінювати його в пам'яті.
*/

window.AlbumsStore = (function () {
    let albums = [];
    let loaded = false;
    let dirty = false;

    /* ============================================================
       ТРАНСЛІТЕРАЦІЯ (укр + рос)
       ============================================================ */
    const TRANSLIT = {
        'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ye','ж':'zh',
        'з':'z','и':'y','і':'i','ї':'yi','й':'y','к':'k','л':'l','м':'m','н':'n',
        'о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
        'ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'yu','я':'ya',
        'ё':'yo','ы':'y','э':'e','ъ':''
    };

    function transliterate(str) {
        return str.split('').map(ch => {
            const lower = ch.toLowerCase();
            if (TRANSLIT[lower] !== undefined) {
                const tr = TRANSLIT[lower];
                if (ch === lower) return tr;
                return tr.charAt(0).toUpperCase() + tr.slice(1);
            }
            return ch;
        }).join('');
    }

    /* ============================================================
       ЗАВАНТАЖЕННЯ
       ============================================================ */

    async function load() {
        if (loaded) return albums;
            const res = await fetch('/data/albums.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('albums.json: HTTP ' + res.status);
        albums = await res.json();
        if (!Array.isArray(albums)) albums = [];
        loaded = true;
        return albums;
    }

    function getAll() {
        return albums.slice();
    }

    function getById(id) {
        return albums.find(a => a.id === id) || null;
    }

    /* ============================================================
       ГЕНЕРАЦІЯ ID
       ============================================================ */

    function generateId(title) {
        let base = transliterate(title || 'album');

        base = base
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 30);

        if (!base) {
            base = 'album-' + Date.now().toString(36);
        }

        let id = base;
        let n = 1;
        while (albums.some(a => a.id === id)) {
            id = base + '-' + (++n);
        }
        return id;
    }

    /* ============================================================
       CRUD
       ============================================================ */

    function add(albumData) {
        const id = albumData.id || generateId(albumData.title);
        const album = {
            id,
            title: albumData.title || 'Новий альбом',
            description: albumData.description || '',
            cover: albumData.cover || '',
            file: albumData.file || `${id}.json`,
            sections: albumData.sections || {}
        };
        albums.push(album);
        dirty = true;
        return album;
    }

    function update(id, patch) {
        const idx = albums.findIndex(a => a.id === id);
        if (idx === -1) return null;
        albums[idx] = { ...albums[idx], ...patch };
        dirty = true;
        return albums[idx];
    }

    function remove(id) {
        const idx = albums.findIndex(a => a.id === id);
        if (idx === -1) return false;
        albums.splice(idx, 1);
        dirty = true;
        return true;
    }

        /* ============================================================
       СТАН + ЕКСПОРТ
       ============================================================ */

    function isDirty() { return dirty; }

    function exportJson() {
        return JSON.stringify(albums, null, 2);
    }

    function download() {
        const blob = new Blob([exportJson()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'albums.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    async function save() {
        return FileStorage.save('albums.json', exportJson());
    }

    function markClean() { dirty = false; }

    /* ============================================================
       ПУБЛІЧНЕ API
       ============================================================ */

    return {
        load, getAll, getById, add, update, remove,
        isDirty, exportJson, download, markClean,
        generateId,
        transliterate,
        save
    };	
	
})();