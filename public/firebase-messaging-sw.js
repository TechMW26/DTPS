// Firebase Messaging Service Worker
// This file must be in the public folder

// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Firebase configuration - loaded from API to avoid hardcoding secrets
// The config is fetched once and cached
let firebaseInitialized = false;
let messaging = null;

// Initialize Firebase with config from API
async function initializeFirebase() {
    if (firebaseInitialized) return true;

    try {
        // Fetch config from API endpoint
        const response = await fetch('/api/firebase-config');
        if (!response.ok) {
            console.error('[firebase-messaging-sw.js] Failed to fetch Firebase config');
            return false;
        }

        const firebaseConfig = await response.json();

        if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
            console.error('[firebase-messaging-sw.js] Invalid Firebase config received');
            return false;
        }

        // Initialize Firebase in the service worker
        firebase.initializeApp(firebaseConfig);

        // Get Firebase Messaging instance
        messaging = firebase.messaging();
        firebaseInitialized = true;

        console.log('[firebase-messaging-sw.js] Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('[firebase-messaging-sw.js] Error initializing Firebase:', error);
        return false;
    }
}

// Initialize on service worker activation
self.addEventListener('activate', async (event) => {
    event.waitUntil(initializeFirebase());
});

// Store for recent notification IDs to prevent duplicates
const recentNotifications = new Set();
const NOTIFICATION_EXPIRY = 5000; // 5 seconds

// Function to check if notification was recently shown
function wasRecentlyShown(tag) {
    if (recentNotifications.has(tag)) {
        return true;
    }
    recentNotifications.add(tag);
    setTimeout(() => recentNotifications.delete(tag), NOTIFICATION_EXPIRY);
    return false;
}

// Get notification actions based on type
function getNotificationActions(type) {
    switch (type) {
        case 'call':
            return [
                { action: 'accept', title: '✓ Accept' },
                { action: 'decline', title: '✕ Decline' }
            ];
        case 'new_message':
            return [
                { action: 'reply', title: '↩ Reply' },
                { action: 'open', title: 'Open' }
            ];
        case 'appointment':
        case 'appointment_booked':
            return [
                { action: 'view', title: '📅 View' },
                { action: 'dismiss', title: 'Dismiss' }
            ];
        case 'payment_link':
        case 'payment_link_created':
            return [
                { action: 'pay', title: '💳 Pay Now' },
                { action: 'later', title: 'Later' }
            ];
        case 'meal_plan':
        case 'meal_plan_created':
            return [
                { action: 'view', title: '📋 View Plan' },
                { action: 'dismiss', title: 'Dismiss' }
            ];
        case 'task_assigned':
            return [
                { action: 'view', title: '✓ View Task' },
                { action: 'dismiss', title: 'Dismiss' }
            ];
        default:
            return [
                { action: 'open', title: 'Open' },
                { action: 'close', title: 'Dismiss' }
            ];
    }
}

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message:', payload);

    // Generate a unique tag for deduplication
    const notificationTag = payload.data?.tag ||
        payload.data?.messageId ||
        payload.messageId ||
        `dtps-${Date.now()}`;

    // Check for duplicate
    if (wasRecentlyShown(notificationTag)) {
        console.log('[firebase-messaging-sw.js] Skipping duplicate notification:', notificationTag);
        return;
    }

    const notificationTitle = payload.notification?.title ||
        payload.data?.title ||
        'DTPS Notification';
    const notificationBody = payload.notification?.body ||
        payload.data?.body ||
        payload.data?.message ||
        'You have a new notification';
    const notificationType = payload.data?.type || 'general';

    const notificationOptions = {
        body: notificationBody,
        icon: payload.notification?.icon || payload.data?.icon || '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        image: payload.notification?.image || payload.data?.image,
        data: payload.data || {},
        tag: notificationTag,
        requireInteraction: notificationType === 'call' ||
            notificationType === 'new_message' ||
            payload.data?.requireInteraction === 'true',
        vibrate: [200, 100, 200],
        actions: getNotificationActions(notificationType),
        renotify: true,
        silent: false
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification click:', event);

    event.notification.close();

    const action = event.action;
    const data = event.notification.data || {};
    const type = data.type;

    // Handle dismiss actions
    if (action === 'close' || action === 'dismiss' || action === 'later' || action === 'decline') {
        return;
    }

    // Determine URL based on type and action
    let urlToOpen = data.clickAction || data.url || '/user';

    // Type-specific URL handling
    if (type === 'new_message') {
        urlToOpen = data.conversationWith
            ? `/user/messages?conversationWith=${data.conversationWith}`
            : '/user/messages';
    } else if (type === 'appointment' || type === 'appointment_booked') {
        urlToOpen = '/user/appointments';
    } else if (type === 'payment_link' || type === 'payment_link_created' || action === 'pay') {
        urlToOpen = '/user/payments';
    } else if (type === 'meal_plan' || type === 'meal_plan_created') {
        urlToOpen = '/user/plan';
    } else if (type === 'task_assigned') {
        urlToOpen = '/user/tasks';
    } else if (type === 'call' && action === 'accept') {
        urlToOpen = data.callUrl || `/call/${data.callId}`;
    }

    // Ensure the URL is absolute
    if (!urlToOpen.startsWith('http')) {
        urlToOpen = self.location.origin + (urlToOpen.startsWith('/') ? '' : '/') + urlToOpen;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Try to focus existing window and navigate
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if ('focus' in client) {
                    return client.focus().then(() => {
                        if ('navigate' in client) {
                            return client.navigate(urlToOpen);
                        }
                        return client;
                    });
                }
            }

            // If no window is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Handle push events directly (for data-only messages)
self.addEventListener('push', (event) => {
    console.log('[firebase-messaging-sw.js] Push event received');

    if (!event.data) {
        console.log('[firebase-messaging-sw.js] No data in push event');
        return;
    }

    let data;
    try {
        data = event.data.json();
        console.log('[firebase-messaging-sw.js] Push data:', data);
    } catch (e) {
        console.log('[firebase-messaging-sw.js] Push text:', event.data.text());
        return;
    }

    // If this is a data-only message (no notification field), show notification manually
    if (!data.notification && data.data) {
        const notificationTag = data.data.tag ||
            data.data.messageId ||
            `dtps-push-${Date.now()}`;

        if (wasRecentlyShown(notificationTag)) {
            console.log('[firebase-messaging-sw.js] Skipping duplicate push notification');
            return;
        }

        const notificationTitle = data.data.title || 'DTPS Notification';
        const notificationBody = data.data.body || data.data.message || 'You have a new notification';
        const notificationType = data.data.type || 'general';

        event.waitUntil(
            self.registration.showNotification(notificationTitle, {
                body: notificationBody,
                icon: data.data.icon || '/icons/icon-192x192.png',
                badge: '/icons/icon-72x72.png',
                data: data.data,
                tag: notificationTag,
                requireInteraction: notificationType === 'call' || notificationType === 'new_message',
                vibrate: [200, 100, 200],
                actions: getNotificationActions(notificationType),
                renotify: true
            })
        );
    }
});

// Service worker activation
self.addEventListener('activate', (event) => {
    console.log('[firebase-messaging-sw.js] Service Worker activated');
    event.waitUntil(self.clients.claim());
});

// Service worker installation
self.addEventListener('install', (event) => {
    console.log('[firebase-messaging-sw.js] Service Worker installed');
    self.skipWaiting();
});
