/* js/store-videos.js
   Робота з файлом конкретного альбому (albumN.json).
   Завантажує, дозволяє читати/змінювати відео в пам'яті.
*/

window.VideosStore = (function () {
    let data = [];
    let filename = '';
    let loaded = false;
    let dirty = false;

    /* ============================================================
       ЗАВАНТАЖЕННЯ
       ============================================================ */

    async function load(albumFile) {
        filename = albumFile;
        const res = await fetch('/video-catalog/data/' + albumFile, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${albumFile}: HTTP ${res.status}`);
        const json = await res.json();
        data = Array.isArray(json) ? json : [];
        loaded = true;
        dirty = false;
        return data;
    }

    /* ============================================================
       ЧИТАННЯ
       ============================================================ */

    function getAll() {
        return data.slice();
    }

    /** Повертає масив { name, count } — усі унікальні розділи з кількістю */
    function getSections() {
        const counts = {};
        data.forEach(v => {
            const s = v.section || 'Без розділу';
            counts[s] = (counts[s] || 0) + 1;
        });
        return Object.keys(counts)
            .sort((a, b) => a.localeCompare(b, 'uk'))
            .map(name => ({ name, count: counts[name] }));
    }

    /** Повертає копію відео за індексом */
    function getByIndex(index) {
        if (index < 0 || index >= data.length) return null;
        return Object.assign({}, data[index]);
    }

    /* ============================================================
       ЗМІНА РОЗДІЛІВ
       ============================================================ */

    /** Перейменувати розділ у всіх відео */
    function renameSection(oldName, newName) {
        if (!newName || oldName === newName) return 0;
        let count = 0;
        data.forEach(v => {
            if ((v.section || 'Без розділу') === oldName) {
                v.section = newName;
                count++;
            }
        });
        if (count > 0) dirty = true;
        return count;
    }

    /** Видалити всі відео розділу */
    function removeSection(name) {
        const before = data.length;
        data = data.filter(v => (v.section || 'Без розділу') !== name);
        const removed = before - data.length;
        if (removed > 0) dirty = true;
        return removed;
    }

    /* ============================================================
       ЗМІНА ВІДЕО
       ============================================================ */

    function addVideo({ title, section, url }) {
        data.push({
            title: title || 'Без назви',
            section: section || 'Без розділу',
            url
        });
        dirty = true;
    }

    /** Вставити відео у конкретну позицію (для дублювання поруч) */
    function insertVideo(index, video) {
        const v = {
            title: video.title || 'Без назви',
            section: video.section || 'Без розділу',
            url: video.url
        };
        if (index < 0) index = 0;
        if (index >= data.length) data.push(v);
        else data.splice(index, 0, v);
        dirty = true;
        return true;
    }

    function updateVideo(index, patch) {
        if (index < 0 || index >= data.length) return false;
        data[index] = { ...data[index], ...patch };
        dirty = true;
        return true;
    }

    /** Перемістити відео в інший розділ (у межах цього ж альбому) */
    function moveVideo(index, newSection) {
        if (index < 0 || index >= data.length) return false;
        const target = newSection || 'Без розділу';
        const current = data[index].section || 'Без розділу';
        if (current === target) return false;
        data[index].section = target;
        dirty = true;
        return true;
    }

    function removeVideo(index) {
        if (index < 0 || index >= data.length) return false;
        data.splice(index, 1);
        dirty = true;
        return true;
    }

    /* ============================================================
       СТАН + ЕКСПОРТ
       ============================================================ */

    function isDirty() { return dirty; }
    function markClean() { dirty = false; }

    function exportJson() {
        return JSON.stringify(data, null, 2);
    }

    function download() {
        if (!filename) return;
        const blob = new Blob([exportJson()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
	async function save() {
        if (!filename) return { saved: false, method: 'none', filename: '' };
        return FileStorage.save(filename, exportJson());
}

    /* ============================================================
       ПУБЛІЧНЕ API
       ============================================================ */

    return {
        load,
        getAll,
        getSections,
        getByIndex,
        renameSection,
        removeSection,
        addVideo,
        insertVideo,
        updateVideo,
        moveVideo,
        removeVideo,
        isDirty,
        markClean,
        exportJson,
        download,
		save,
        get filename() { return filename; }
    };
})();
