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

    /**
     * Повертає масив { name, count } — унікальні підрозділи
     * у межах одного розділу.
     * Порожній subsection ('') у список не потрапляє —
     * його треба обробляти окремо (картка "без підрозділу").
     */
    function getSubsections(sectionName) {
        const counts = {};
        data.forEach(v => {
            if ((v.section || 'Без розділу') !== sectionName) return;
            const sub = v.subsection || '';
            if (!sub) return;
            counts[sub] = (counts[sub] || 0) + 1;
        });
        return Object.keys(counts)
            .sort((a, b) => a.localeCompare(b, 'uk'))
            .map(name => ({ name, count: counts[name] }));
    }

    /**
     * Повертає об'єкт {
     *   subsections: [{name, count}, ...],
     *   withoutSub: { count, videos: [{video, index}, ...] }
     * }
     * для сторінки розділу (огляд).
     */
    function getGroupedBySubsection(sectionName) {
        const subs = {};
        const without = [];

        data.forEach((v, i) => {
            if ((v.section || 'Без розділу') !== sectionName) return;
            const sub = v.subsection || '';
            if (sub) {
                if (!subs[sub]) subs[sub] = [];
                subs[sub].push({ video: v, index: i });
            } else {
                without.push({ video: v, index: i });
            }
        });

        const subsections = Object.keys(subs)
            .sort((a, b) => a.localeCompare(b, 'uk'))
            .map(name => ({
                name,
                count: subs[name].length,
                firstUrl: subs[name][0]?.video?.url || ''
            }));

        return {
            subsections,
            withoutSub: { count: without.length, videos: without }
        };
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
       ЗМІНА ПІДРОЗДІЛІВ
       ============================================================ */

    /**
     * Перейменувати підрозділ у межах одного розділу.
     * Порожній newName означає "прибрати підрозділ".
     */
    function renameSubsection(sectionName, oldSub, newSub) {
        const target = newSub || '';
        let count = 0;
        data.forEach(v => {
            if ((v.section || 'Без розділу') !== sectionName) return;
            if ((v.subsection || '') === oldSub) {
                if (target) v.subsection = target;
                else delete v.subsection;
                count++;
            }
        });
        if (count > 0) dirty = true;
        return count;
    }

    /**
     * Прибрати підрозділ у всіх відео розділу (перевести у "без підрозділу").
     */
    function removeSubsection(sectionName, subName) {
        return renameSubsection(sectionName, subName, '');
    }

    /* ============================================================
       ЗМІНА ВІДЕО
       ============================================================ */

    function addVideo({ title, section, subsection, url }) {
        const v = {
            title: title || 'Без назви',
            section: section || 'Без розділу',
            url
        };
        if (subsection) v.subsection = subsection;
        data.push(v);
        dirty = true;
    }

    /** Вставити відео у конкретну позицію (для дублювання поруч) */
    function insertVideo(index, video) {
        const v = {
            title: video.title || 'Без назви',
            section: video.section || 'Без розділу',
            url: video.url
        };
        if (video.subsection) v.subsection = video.subsection;
        if (index < 0) index = 0;
        if (index >= data.length) data.push(v);
        else data.splice(index, 0, v);
        dirty = true;
        return true;
    }

    function updateVideo(index, patch) {
        if (index < 0 || index >= data.length) return false;
        const next = { ...data[index], ...patch };
        // Якщо subsection явно передано як '' або null — прибираємо поле
        if ('subsection' in patch && !patch.subsection) {
            delete next.subsection;
        }
        data[index] = next;
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
        // При зміні розділу підрозділ скидається — він належав старому розділу
        delete data[index].subsection;
        dirty = true;
        return true;
    }

    /**
     * Перемістити відео в підрозділ.
     * subsectionName === '' або null → прибрати підрозділ.
     */
    function moveVideoToSubsection(index, subsectionName) {
        if (index < 0 || index >= data.length) return false;
        const target = subsectionName || '';
        const current = data[index].subsection || '';
        if (current === target) return false;
        if (target) data[index].subsection = target;
        else delete data[index].subsection;
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
        getSubsections,
        getGroupedBySubsection,
        getByIndex,
        renameSection,
        removeSection,
        renameSubsection,
        removeSubsection,
        addVideo,
        insertVideo,
        updateVideo,
        moveVideo,
        moveVideoToSubsection,
        removeVideo,
        isDirty,
        markClean,
        exportJson,
        download,
        save,
        get filename() { return filename; }
    };
})();
