const CACHE_NAME = 'helpido-v1';

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installed');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activated');
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // This simple pass-through satisfies the PWA install requirement
    event.respondWith(
        fetch(event.request).catch(() => {
            console.log('[Service Worker] Fetch failed, likely offline.');
        })
    );
});