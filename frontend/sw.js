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

// --- NEW: NATIVE PUSH NOTIFICATION HANDLER ---
self.addEventListener('push', function(event) {
    if (event.data) {
        const data = event.data.json(); // Parses the {title, desc} from server
        
        const options = {
            body: data.desc || 'You have a new update!',
            icon: '/192.png', // The app icon on the notification
            badge: '/192.png', // The tiny monochrome icon in the top status bar
            vibrate: [200, 100, 200], // Native vibration pattern
            data: { url: '/dashboard.html' } // Where to go when tapped
        };

        // Tell Android to show the notification banner!
        event.waitUntil(
            self.registration.showNotification(data.title || 'Helpido', options)
        );
    }
});

// --- NEW: NOTIFICATION CLICK HANDLER ---
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Close the Android banner

    // When tapped, open the Helpido app!
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            // If app is already open in background, just focus it
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if (client.url.includes('/dashboard.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise, launch the app from scratch
            if (clients.openWindow) {
                return clients.openWindow('/dashboard.html');
            }
        })
    );
});