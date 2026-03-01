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

// --- UNIFIED NATIVE PUSH HANDLER WITH FOREGROUND SUPPRESSION ---
self.addEventListener('push', function (event) {
    if (!event.data) return;

    const data = event.data.json();

    const options = {
        // Fallback text covers both tasks and chats
        body: data.desc || 'You have a new notification!', 
        icon: '/192.png',
        badge: '/192.png',
        vibrate: [200, 100, 200],
        data: {
            // These will simply be 'undefined' for New Tasks, which is perfectly safe!
            type: data.type,
            taskId: data.taskId,
            senderPhone: data.senderPhone
        }
    };

    // NEW: Check if the app is currently open and visible on screen
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            let isAppVisible = false;

            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                // If the user is actively looking at the dashboard, flag it!
                if (client.url.includes('helpido.onrender.com') || client.url.includes('/dashboard.html')) {
                    if (client.visibilityState === 'visible') {
                        isAppVisible = true;
                        break;
                    }
                }
            }

            // If the app is visible, stay silent! (Socket.io will handle the in-app toast)
            if (isAppVisible) {
                console.log("Foreground detected: Suppressing native OS notification.");
                return null; 
            }

            // If app is minimized, screen is off, or app is closed, fire the native lock-screen alert!
            return self.registration.showNotification(data.title || 'Helpido', options);
        })
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const payload = event.notification.data;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // 1. Build the URL for a "Cold Start" (App is completely closed)
            let chatUrl = '/dashboard.html'; // Defaults to Home tab anyway!
            if (payload && payload.type === 'chat') {
                chatUrl = `/dashboard.html?action=chat&taskId=${payload.taskId}&phone=${payload.senderPhone}`;
            }

            // 2. Check if the app is already open in the background
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if ((client.url.includes('helpido.onrender.com') || client.url.includes('/dashboard.html')) && 'focus' in client) {
                    client.focus();
                    
                    // Tell the already-open app what to do!
                    if (payload && payload.type === 'chat') {
                        client.postMessage({
                            action: 'openChat',
                            taskId: payload.taskId,
                            phone: payload.senderPhone
                        });
                    } else if (payload && payload.type === 'task') {
                        // NEW: Tell the app to switch to the home feed
                        client.postMessage({ action: 'openHome' });
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