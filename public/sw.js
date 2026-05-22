// FinTrack Service Worker — Offline Cache + Push Notifications
const CACHE_NAME = 'fintrack-v2';
const OFFLINE_URL = '/';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
];

// ── Install: pre-cache shell ─────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clear old caches ───────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// ── Fetch: network-first for API/Firebase, cache-first for assets ────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin Firebase/Google API requests
  if (request.method !== 'GET') return;
  if (url.origin.includes('firebaseio.com')) return;
  if (url.origin.includes('googleapis.com')) return;
  if (url.origin.includes('firestore.googleapis.com')) return;

  // Network-first for navigation (HTML) — falls back to cached index.html
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => cached);
    })
  );
});

// ── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const title = data.title || 'FinTrack';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'fintrack-general',
    renotify: data.renotify || false,
    data: { url: data.url || '/' },
    actions: data.actions || [],
    vibrate: [200, 100, 200],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// ── Scheduled Notifications (from app) ──────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, tag, delayMs } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: tag || 'fintrack',
        vibrate: [200, 100, 200],
        data: { url: '/' },
      });
    }, delayMs || 0);
  }
});
