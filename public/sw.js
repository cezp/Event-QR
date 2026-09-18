// Personal data is always network-only. Never queue attendance changes offline.
const CACHE = 'sami-swoi-offline-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/logo.png'])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate' && !new URL(event.request.url).pathname.startsWith('/.auth')) {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  }
});
