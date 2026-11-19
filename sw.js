/* Service worker: deixa o app funcionando offline */
const VERSION = 'traco-v0.28.1';
/* backup em segundo plano: o mesmo código do app, rodando sem tela */
self.window = self;
self.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ getContext: () => ({}) }), visibilityState: 'hidden' };
try { importScripts('js/util.js', 'js/store.js', 'js/drive.js', 'js/bg-sync.js'); } catch (e) { console.warn('segundo plano indisponível', e); }
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/store.js', 'js/geom.js', 'js/render.js', 'js/pdf.js', 'js/tpl-import.js', 'js/drive.js', 'js/editor.js', 'js/toolbar.js', 'js/tables.js', 'js/tiles.js', 'js/navigation.js', 'js/richtext.js', 'js/crop.js', 'js/shapeedit.js', 'js/colorpicker.js', 'js/ui.js', 'js/ocr.js', 'js/beautify.js', 'js/import-notewise.js', 'js/library.js', 'js/plugins.js', 'js/workspace.js', 'js/split.js', 'js/timer.js', 'js/bg-sync.js', 'js/app.js',
  'vendor/pdf.min.mjs', 'vendor/pdf-lib.min.js', 'vendor/pdf.worker.min.mjs', 'icons/icon-192.png', 'icons/icon-512.png', 'privacidade.html'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'traco-fonts').map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
/* v0.24: notificações do cronômetro — tocar abre o app; Pausar/Continuar/Iniciar foco são repassados para a página */
self.addEventListener('notificationclick', (e) => {
  const act = e.action || 'open', d = e.notification.data || {}; if (!d.timer) return;
  if (act === 'open' || e.notification.tag === 'traco-timer-end') e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (cs) => {
    let c = cs[0];
    if (act !== 'open' && c) { c.postMessage({ type: 'traco-timer', action: act }); if (e.notification.tag === 'traco-timer') return; }
    if (c && c.focus) { try { await c.focus(); } catch (_) {} } else if (self.clients.openWindow) c = await self.clients.openWindow('./');
    if (act !== 'open' && c && !cs.length) setTimeout(() => c.postMessage({ type: 'traco-timer', action: act }), 1500);
  }));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method === 'GET' && /^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) { // fontes: guarda para usar offline
    e.respondWith(caches.open('traco-fonts').then((c) => c.match(e.request).then((hit) => {
      const net = fetch(e.request).then((r) => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Google APIs passam direto
  // rede primeiro, sempre confirmando com o servidor (no-cache), cache só sem internet
  e.respondWith(fetch(new Request(e.request, { cache: 'no-cache' })).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
