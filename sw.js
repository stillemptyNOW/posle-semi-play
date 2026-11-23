const installShell = [
  './', './install.js', './install.css', './manifest.webmanifest',
  './home-loader.js', './lobby-music.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
const cacheName = 'после-семи-shell-v2';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(installShell)));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('после-семи-shell-') && name !== cacheName).map(name => caches.delete(name)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || !event.request.url.startsWith(self.registration.scope)) return;
  const root = new URL(event.request.url).pathname === new URL(self.registration.scope).pathname;
  if (!root) return;
  event.respondWith(fetch(event.request).catch(() => caches.match('./')));
});
