// FinTrack Service Worker — Push Notifications + Offline Support
// Place this file in your public/ folder as: public/sw.js

const CACHE_NAME = 'fintrack-v1';

// ── Install & Cache ──────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── Push Notifications (from server or self-triggered) ───────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const title = data.title || 'FinTrack';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    tag: data.tag || 'fintrack-general',
    renotify: data.renotify || false,
    data: { url: data.url || '/' },
    actions: data.actions || [],
    vibrate: [200, 100, 200],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click Handler ───────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // If app is already open, focus it
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});

// ── Message from App (schedule local notifications) ─────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, tag, delayMs } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-72.png',
        tag: tag || 'fintrack',
        vibrate: [200, 100, 200],
        data: { url: '/' },
      });
    }, delayMs || 0);
  }
});
