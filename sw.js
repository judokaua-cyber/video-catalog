/* sw.js
   Service Worker — мінімальний.
   Потрібен для того, щоб Chrome дозволив встановити сайт як PWA
   і додав його у список "Поділитися".
   
   Також кешує статичні файли (CSS, JS) — щоб сайт відкривався швидше.
*/

const CACHE_NAME = 'video-catalog-v1';
const CACHE_URLS = [
    '/video-catalog/',
    '/video-catalog/index.html',
    '/video-catalog/index.css',
    '/video-catalog/styles.css',
    '/video-catalog/manifest.json'
];

// Встановлення — кешуємо статичні файли
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS))
    );
    self.skipWaiting();
});

// Активація — прибираємо старі кеші
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(names => {
            return Promise.all(
                names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
            );
        })
    );
    self.clients.claim();
});

// Обробка запитів — спочатку мережа, потім кеш
self.addEventListener('fetch', event => {
    // Не чіпаємо API GitHub і noembed — вони мають бути завжди свіжі
    const url = event.request.url;
    if (url.includes('api.github.com') || url.includes('noembed.com')) {
        return;
    }

    // Для решти — мережа, а якщо не вдалось, то кеш
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Кешуємо тільки успішні GET-запити до наших файлів
                if (event.request.method === 'GET' && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
