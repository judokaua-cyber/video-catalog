/* sw.js
   Service Worker — мінімальний.
   Потрібен тільки для того, щоб Chrome дозволив встановити сайт
   як PWA і додав його у список "Поділитися".
*/

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

// Обробник запитів — просто пропускає все далі
self.addEventListener('fetch', event => {
    // Нічого не робимо — хай браузер обробляє як звичайно
});
