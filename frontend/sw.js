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

// --- NEW: NATIVE PUSH NOTIFICATION HANDLER ---
self.addEventListener('push', function(event) {
    if (event.data) {
        const data = event.data.json(); 
        
        const options = {
            body: data.desc || 'You have a new message!',
            icon: '/192.png',
            badge: '/192.png',
            vibrate: [200, 100, 200], 
            // NEW: Pass the hidden routing data into the notification
            data: { 
                type: data.type,
                taskId: data.taskId,
                senderPhone: data.senderPhone
            } 
        };

        event.waitUntil(
            self.registration.showNotification(data.title || 'Helpido', options)
        );
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close(); 
    const payload = event.notification.data;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // 1. Build the URL for a "Cold Start" (App is completely closed)
            let chatUrl = '/dashboard.html';
            if (payload && payload.type === 'chat') {
                chatUrl = `/dashboard.html?action=chat&taskId=${payload.taskId}&phone=${payload.senderPhone}`;
            }

            // 2. Check if the app is already open in the background
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if (client.url.includes('/dashboard.html') && 'focus' in client) {
                    client.focus();
                    // Tell the already-open app to slide the chat drawer up
                    if (payload && payload.type === 'chat') {
                        client.postMessage({
                            action: 'openChat',
                            taskId: payload.taskId,
                            phone: payload.senderPhone
                        });
                    }
                    return;
                }
            }
            
            // 3. If the app was closed, launch it using the cold start URL
            if (clients.openWindow) {
                return clients.openWindow(chatUrl);
            }
        })
    );
});