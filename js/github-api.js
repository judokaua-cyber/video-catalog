/* js/github-api.js
   Модуль для роботи з GitHub API.
   Дозволяє читати й записувати файли в репозиторій.
   Використовується для збереження змін із ПК і телефону.
*/

window.GitHubAPI = (function () {

    // ═══════════════════════════════════════════════════════════
    //  НАЛАШТУВАННЯ — ЦІ ТРИ ПОЛЯ ТРЕБА ЗАПОВНИТИ
    // ═══════════════════════════════════════════════════════════

    const OWNER  = 'judokaua-cyber';       // ваш GitHub-логін
    const REPO   = 'video-catalog';         // назва репозиторію
    const BRANCH = 'main';                   // гілка

    // ═══════════════════════════════════════════════════════════
    //  ТОКЕН
    // ═══════════════════════════════════════════════════════════

    const TOKEN_KEY = 'GitHubAPI.token';

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) || '';
    }

    function setToken(token) {
        if (token) {
            localStorage.setItem(TOKEN_KEY, token.trim());
        } else {
            localStorage.removeItem(TOKEN_KEY);
        }
    }

    function hasToken() {
        return !!getToken();
    }

    function forgetToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    // ═══════════════════════════════════════════════════════════
    //  ПУБЛІЧНЕ API
    // ═══════════════════════════════════════════════════════════

    /**
     * Перевіряє, чи токен робочий.
     * Повертає true/false.
     */
    async function checkToken() {
        const token = getToken();
        if (!token) return false;

        try {
            const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github+json'
                }
            });
            return res.ok;
        } catch (e) {
            console.error('GitHubAPI.checkToken:', e);
            return false;
        }
    }

    /**
     * Читає файл із репозиторію.
     * @param {string} path — шлях від кореня репозиторію, напр. 'data/albums.json'
     * @returns {Promise<{content: string, sha: string} | null>}
     */
    async function readFile(path) {
        const token = getToken();
        if (!token) throw new Error('Токен не встановлено');

        const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        if (res.status === 404) return null;
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`GitHub read: ${res.status} ${err.message || ''}`);
        }

        const data = await res.json();
        // content у Base64
        const content = decodeBase64Utf8(data.content);
        return { content, sha: data.sha };
    }

    /**
     * Читає файл через звичайний fetch (не через GitHub API).
     * Працює для будь-якого розміру файлу.
     * @param {string} path — шлях від кореня сайту, напр. 'data/albums.json'
     * @returns {Promise<string | null>}
     */
    async function readFileViaFetch(path) {
        try {
            const res = await fetch('/video-catalog/' + path, { cache: 'no-store' });
            if (!res.ok) return null;
            return await res.text();
        } catch (e) {
            console.error('GitHubAPI.readFileViaFetch:', e);
            return null;
        }
    }

   
    /**
     * Записує файл у репозиторій (створює або оновлює).
     * @param {string} path — шлях від кореня, напр. 'data/albums.json'
     * @param {string} content — вміст файлу (текст)
     * @param {string} message — повідомлення коміту
     * @returns {Promise<{sha: string}>}
     */
    async function writeFile(path, content, message) {
        const token = getToken();
        if (!token) throw new Error('Токен не встановлено');

        // 1. Дізнаємось SHA поточного файлу (якщо існує)
        let sha = null;
        try {
            const existing = await readFile(path);
            if (existing) sha = existing.sha;
        } catch (e) {
            // файл не існує — це нормально для створення
        }

        // 2. Формуємо payload
        const body = {
            message: message || `Update ${path}`,
            content: encodeBase64Utf8(content),
            branch: BRANCH
        };
        if (sha) body.sha = sha;

        // 3. PUT
        const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`GitHub write: ${res.status} ${err.message || ''}`);
        }

        const data = await res.json();
        return { sha: data.content.sha };
    }

    // ═══════════════════════════════════════════════════════════
    //  BASE64 + UTF-8 (щоб кирилиця не ламалась)
    // ═══════════════════════════════════════════════════════════

    function encodeBase64Utf8(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    function decodeBase64Utf8(b64) {
        return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
    }

    // ═══════════════════════════════════════════════════════════

    return {
        hasToken,
        getToken,
        setToken,
        forgetToken,
        checkToken,
        readFile,
        writeFile,
        OWNER,
        REPO,
        BRANCH
    };
})();
