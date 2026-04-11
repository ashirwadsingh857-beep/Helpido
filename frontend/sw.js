/* =============================================================
   Helpido Service Worker v4
   Strategy:
   - App shell (HTML + local CSS): Cache-first, update in background
   - CDN resources (Google Fonts, Socket.IO, etc): Network-only
     (we never try to cache these to avoid broken offline state)
   - API calls: Network-only (feed data is in localStorage via HPD_CACHE)
   - Push notifications: handled here
============================================================= */

const SHELL_CACHE = 'helpido-shell-v5';

// Only cache files we FULLY control (self-hosted on render.com)
const SHELL_ASSETS = [
    '/dashboard.html',
    '/style.css',
];

// ---- INSTALL: pre-cache app shell ----
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then(cache => {
            // Use individual adds (not addAll) so one failure doesn't abort everything
            return Promise.allSettled(
                SHELL_ASSETS.map(url => cache.add(url).catch(e => console.warn('[SW] Could not cache:', url, e)))
            );
        }).then(() => self.skipWaiting())
    );
});

// ---- ACTIVATE: clean up old caches ----
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys
                .filter(k => k !== SHELL_CACHE)
                .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ---- FETCH ----
self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    // === NEVER cache: external CDN, APIs, sockets, Firebase ===
    const isExternal = (
        url.hostname !== self.location.hostname ||
        url.pathname.startsWith('/api/') ||
        url.pathname.includes('socket.io')
    );
    if (isExternal) {
        // Just pass through (network only, no cache involvement)
        return;
    }

    // === App shell: stale-while-revalidate ===
    // Serve from cache immediately, fetch update in background
    event.respondWith(
        caches.open(SHELL_CACHE).then(cache =>
            cache.match(req).then(cached => {
                const networkFetch = fetch(req).then(response => {
                    if (response && response.ok) {
                        cache.put(req, response.clone());
                    }
                    return response;
                }).catch(() => null);

                // Return cache immediately if available, else wait for network
                return cached || networkFetch;
            })
        )
    );
});

/* =======================================================
   PUSH NOTIFICATION HANDLER
   (Only shows OS notification when app is in background)
======================================================= */
self.addEventListener('push', function(event) {
    if (!event.data) return;
    let data;
    try { data = event.data.json(); } catch(e) { return; }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Suppress OS notification if app is visible in foreground
            const appVisible = windowClients.some(c =>
                c.visibilityState === 'visible' &&
                (c.url.includes('helpido.onrender.com') || c.url.includes('/dashboard.html'))
            );
            if (appVisible) return;

            return self.registration.showNotification(data.title || 'Helpido', {
                body: data.desc || 'You have a new notification!',
                icon: '/asset/192.png',
                badge: '/asset/192.png',
                vibrate: [200, 100, 200],
                data: { type: data.type, taskId: data.taskId, senderPhone: data.senderPhone }
            });
        })
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const payload = event.notification.data;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Try to focus existing window
            for (const client of windowClients) {
                if (client.url.includes('helpido.onrender.com') || client.url.includes('/dashboard.html')) {
                    client.focus();
                    if (payload?.type === 'chat') {
                        client.postMessage({ action: 'openChat', taskId: payload.taskId, phone: payload.senderPhone });
                    } else if (payload?.type === 'task') {
                        client.postMessage({ action: 'openHome' });
                    }
                    return;
                }
            }
            // Open new window
            let targetUrl = '/dashboard.html';
            if (payload?.type === 'chat') {
                targetUrl = `/dashboard.html?action=chat&taskId=${payload.taskId}&phone=${payload.senderPhone}`;
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});