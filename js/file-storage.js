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
        const results = {
            fs: false,
            github: false,
            download: false,
            filename
        };

        // ─── 1. Спроба через File System Access API ───
        if (isSupported()) {
            if (!dirHandle) {
                const ok = await pickFolder();
                if (ok) {
                    // продовжуємо нижче
                }
            }
            if (dirHandle) {
                try {
                    const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
                    if (perm === 'granted' || (await dirHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
                        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(content);
                        await writable.close();
                        results.fs = true;
                    }
                } catch (err) {
                    console.error('FileStorage.save (FS):', err);
                }
            }
        }

        // ─── 2. Спроба через GitHub API ───
        if (window.GitHubAPI && GitHubAPI.hasToken()) {
            try {
                // Визначаємо шлях у репозиторії
                const repoPath = 'data/' + filename;
                await GitHubAPI.writeFile(repoPath, content, `Update ${filename}`);
                results.github = true;
            } catch (err) {
                console.error('FileStorage.save (GitHub):', err);
            }
        }

        // ─── 3. Fallback: звичайне завантаження ───
        if (!results.fs && !results.github) {
            downloadFallback(filename, content);
            results.download = true;
        }

        // Визначаємо "головний" метод для повідомлення
        let method = 'none';
        if (results.fs && results.github) method = 'both';
        else if (results.fs) method = 'fs';
        else if (results.github) method = 'github';
        else if (results.download) method = 'download';

        return { saved: true, method, filename, results };
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
