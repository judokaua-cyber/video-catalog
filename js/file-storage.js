/* js/file-storage.js
   Обгортка над File System Access API.
   Дозволяє зберігати файли прямо в теку, яку користувач вибрав один раз.
   Якщо API недоступний (Firefox, Safari) — використовує звичайне завантаження.
*/

window.FileStorage = (function () {

    // Покажчик на вибрану теку (у пам'яті поточного сеансу)
    let dirHandle = null;

    // Ключ у localStorage — щоб нагадати назву теки при наступному відкритті
    const LS_KEY = 'FileStorage.lastFolderName';

    /* ============================================================
       СТАН
       ============================================================ */

    function isSupported() {
        return typeof window.showDirectoryPicker === 'function';
    }

    function hasFolder() {
        return dirHandle !== null;
    }

    function getFolderName() {
        if (dirHandle) return dirHandle.name;
        // Якщо тека ще не вибрана — показуємо збережену з минулого разу
        return localStorage.getItem(LS_KEY) || '';
    }

    /* ============================================================
       ВИБІР ТЕКИ
       ============================================================ */

    /**
     * Просить користувача вибрати теку.
     * Повертає Promise<boolean> — чи вдалось.
     */
    async function pickFolder() {
        if (!isSupported()) return false;

        try {
            dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                id: 'web-project-data',     // підказка браузеру: та сама тека
                startIn: 'documents'
            });

            // Запам'ятовуємо назву для нагадування
            localStorage.setItem(LS_KEY, dirHandle.name);

            // Перевіряємо дозвіл
            const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                const req = await dirHandle.requestPermission({ mode: 'readwrite' });
                if (req !== 'granted') {
                    dirHandle = null;
                    return false;
                }
            }

            return true;
        } catch (err) {
            // Користувач скасував або помилка
            if (err.name === 'AbortError') {
                return false;
            }
            console.error('FileStorage.pickFolder:', err);
            return false;
        }
    }

    /**
     * Забути вибрану теку. Наступний save() знову попросить вибрати.
     */
    function forget() {
        dirHandle = null;
        localStorage.removeItem(LS_KEY);
    }

    /* ============================================================
       ЗБЕРЕЖЕННЯ
       ============================================================ */

    /**
     * Зберігає файл у вибрану теку.
     * Якщо тека не вибрана або API недоступний — падає на download().
     *
     * @param {string} filename — ім'я файлу, напр. "albums.json"
     * @param {string} content  — вміст файлу
     * @returns {Promise<{saved: boolean, method: string, filename: string}>}
     */
    async function save(filename, content) {
        // Спроба через File System Access API
        if (isSupported()) {
            if (!dirHandle) {
                const ok = await pickFolder();
                if (!ok) {
                    // Користувач скасував вибір — падаємо на download
                    downloadFallback(filename, content);
                    return { saved: true, method: 'download', filename };
                }
            }

            try {
                // Перевіряємо дозвіл ще раз
                const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                    const req = await dirHandle.requestPermission({ mode: 'readwrite' });
                    if (req !== 'granted') {
                        dirHandle = null;
                        downloadFallback(filename, content);
                        return { saved: true, method: 'download', filename };
                    }
                }

                const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();

                return { saved: true, method: 'fs', filename };
            } catch (err) {
                console.error('FileStorage.save (FS):', err);
                // Якщо не вдалось — пробуємо через download
                downloadFallback(filename, content);
                return { saved: true, method: 'download', filename };
            }
        }

        // API недоступний — звичайне завантаження
        downloadFallback(filename, content);
        return { saved: true, method: 'download', filename };
    }

    /* ============================================================
       FALLBACK — звичайне завантаження через <a download>
       ============================================================ */

    function downloadFallback(filename, content) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /* ============================================================
       ПУБЛІЧНЕ API
       ============================================================ */

    return {
        isSupported,
        hasFolder,
        getFolderName,
        pickFolder,
        forget,
        save,
        // для тестування
        downloadFallback
    };
})();