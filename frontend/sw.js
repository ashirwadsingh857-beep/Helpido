const SHELL_CACHE = 'helpido-shell-v3';
const SHELL_ASSETS = [
    '/dashboard.html',
    '/style.css',
    '/asset/192.png',
    '/asset/512.png',
    '/manifest.json'
];

// ---- INSTALL: Cache app shell ----
self.addEventListener('install', (event) => {
    console.log('[SW] Installing v3 — caching app shell');
    event.waitUntil(
        caches.open(SHELL_CACHE).then(cache => {
            return cache.addAll(SHELL_ASSETS).catch(err => {
                console.warn('[SW] Shell pre-cache partial failure (ok):', err);
            });
        })
    );
    self.skipWaiting();
});

// ---- ACTIVATE: Remove old caches ----
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating v3');
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(key => {
                if (key !== SHELL_CACHE) {
                    console.log('[SW] Deleting old cache:', key);
                    return caches.delete(key);
                }
            }))
        ).then(() => self.clients.claim())
    );
});

// ---- FETCH: Cache-first for shell, network-first for API ----
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Never cache: API calls, socket.io, firebase, external APIs
    if (
        url.pathname.startsWith('/api/') ||
        url.hostname.includes('socket.io') ||
        url.hostname.includes('firebaseapp') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('nominatim') ||
        url.hostname.includes('openstreetmap') ||
        url.hostname.includes('wikimedia')
    ) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response('{"offline":true}', {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // For navigation requests (main HTML), try network first then cache
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Update cache with fresh response
                    const clone = response.clone();
                    caches.open(SHELL_CACHE).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => {
                    // Offline: serve from cache
                    return caches.match(event.request).then(cached => {
                        return cached || caches.match('/dashboard.html');
                    });
                })
        );
        return;
    }

    // Static assets (CSS, images, fonts): cache-first, update in background
    event.respondWith(
        caches.match(event.request).then(cached => {
            const networkFetch = fetch(event.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(SHELL_CACHE).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => null);

            return cached || networkFetch;
        })
    );
});

// --- UNIFIED NATIVE PUSH HANDLER WITH FOREGROUND SUPPRESSION ---
self.addEventListener('push', function (event) {
    if (!event.data) return;

    const data = event.data.json();

    const options = {
        body: data.desc || 'You have a new notification!',
        icon: 'asset/192.png',
        badge: 'asset/192.png',
        vibrate: [200, 100, 200],
        data: {
            type: data.type,
            taskId: data.taskId,
            senderPhone: data.senderPhone
        }
    };

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            let isAppVisible = false;
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('helpido.onrender.com') || client.url.includes('/dashboard.html')) {
                    if (client.visibilityState === 'visible') {
                        isAppVisible = true;
                        break;
                    }
                }
            }
            if (isAppVisible) {
                console.log("Foreground detected: Suppressing native OS notification.");
                return null;
            }
            return self.registration.showNotification(data.title || 'Helpido', options);
        })
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const payload = event.notification.data;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            let chatUrl = '/dashboard.html';
            if (payload && payload.type === 'chat') {
                chatUrl = `/dashboard.html?action=chat&taskId=${payload.taskId}&phone=${payload.senderPhone}`;
            }

            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if ((client.url.includes('helpido.onrender.com') || client.url.includes('/dashboard.html')) && 'focus' in client) {
                    client.focus();
                    if (payload && payload.type === 'chat') {
                        client.postMessage({ action: 'openChat', taskId: payload.taskId, phone: payload.senderPhone });
                    } else if (payload && payload.type === 'task') {
                        client.postMessage({ action: 'openHome' });
                    }
                    return;
                }
            }

            if (clients.openWindow) {
                return clients.openWindow(chatUrl);
            }
        })
    );
});