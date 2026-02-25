// A simple Service Worker to satisfy PWA installation requirements
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installed successfully');
});

self.addEventListener('fetch', (event) => {
    // Just lets network requests pass through normally for now
    return;
});