const CACHE_NAME = 'lotato-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/lotato.html',
    '/control-level1.html',
    '/control-level2.html',
    '/subsystem-admin.html',
    '/master-dashboard.html',
    '/styles/main.css',
    '/scripts/main.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});
