// frontend/sw.js
const CACHE_NAME = 'helpido-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/style.css'
];

// Install and cache files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
});

// Serve fresh code first, fall back to cache if offline
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request) // Try the network first
            .catch(() => caches.match(event.request)) // If network fails, use cache
    );
});
