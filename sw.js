/* Service worker: deixa o app funcionando offline */
const VERSION = 'traco-v0.2.1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/store.js', 'js/geom.js', 'js/render.js', 'js/pdf.js', 'js/drive.js', 'js/editor.js', 'js/toolbar.js', 'js/ui.js', 'js/library.js', 'js/plugins.js', 'js/app.js',
  'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs', 'icons/icon-192.png', 'icons/icon-512.png', 'privacidade.html'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Google APIs passam direto
  // rede primeiro (pega atualizações), cache como reserva offline
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
