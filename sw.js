// Bankroll service worker. Bump nothing by hand: the release kit stamps the version in.
const CACHE_PREFIX = 'bankroll-';
const VERSION = CACHE_PREFIX + '0.1.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/icon.svg',
  'js/app.js', 'js/db.js', 'js/ui.js', 'js/model.js', 'js/store.js', 'js/hooks.js', 'js/stats.js', 'js/chart.js', 'js/review.js',
  'js/views/stats.js', 'js/views/tools.js', 'js/cards.js', 'js/equity.js', 'js/homegame.js',
  'js/tools/hands.js', 'js/tools/opponents.js', 'js/tools/equity.js', 'js/tools/timer.js', 'js/tools/payouts.js', 'js/tools/settle.js',
  'js/views/home.js', 'js/views/live.js', 'js/views/sessions.js', 'js/views/session-form.js', 'js/views/bankroll.js',
  'js/views/more.js', 'js/views/settings.js', 'js/views/import.js',
  'js/csv.js', 'js/backup.js', 'js/lock.js', 'js/sharecard.js', 'js/notify.js', 'js/appearance.js',
];

self.addEventListener('install', e => e.waitUntil(
  caches.open(VERSION)
    // Add files one by one so a missing optional file never blocks the install.
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
    .then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== VERSION).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));

// Cache first for the app's own files, network for everything else (e.g. GitHub Gist backups).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(c => c.match(e.request, { ignoreSearch: true }).then(hit =>
    hit || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })
      .catch(() => (e.request.mode === 'navigate' ? c.match('index.html') : Response.error())))));
});

// Tapping the "session running" notification opens the live screen.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate && c.navigate('./#/live'); return c.focus(); } }
    return self.clients.openWindow('./#/live');
  }));
});
