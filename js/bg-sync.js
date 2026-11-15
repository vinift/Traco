'use strict';
/* ===== Backup em segundo plano (roda dentro do service worker, sem a tela do app) =====
   O Android chama o evento "sync" quando há internet — mesmo com o app fechado ou pausado — e o
   service worker envia as notas, imagens e PDFs anexados que ficaram pendentes. Os PDFs gerados das
   notas (que precisam desenhar as páginas) continuam sendo feitos com o app aberto.
   Usa o mesmo código de backup do app (util.js, store.js, drive.js), com uma trava para os dois não enviarem ao mesmo tempo. */
const _oidMap = new WeakMap(); let _oidSeq = 1;
function oid(o) { if (!o || typeof o !== 'object') return 0; let n = _oidMap.get(o); if (!n) { n = _oidSeq++; _oidMap.set(o, n); } return n; }

const BgSync = {
  async load() {
    await DB.open();
    const S = Store, get = (k) => DB.get('meta', k);
    S.settings = mergeDeep(clone(DEFAULT_SETTINGS), (await get('settings')) || {});
    S.heads = (await get('heads')) || {}; S.folders = (await get('folders')) || [];
    S.trash = mergeDeep({ notes: {}, folders: {} }, (await get('trash')) || {});
    S.driveMap = (await get('driveMap')) || {};
    S.dirty = mergeDeep({ notes: {}, blobs: {}, deleted: {}, pdfs: {}, folders: {} }, (await get('dirty')) || {});
    const snap = clone(S.dirty);
    // gravações "educadas": não apagam o que o app marcou enquanto o segundo plano enviava
    S.saveDirty = async () => {
      const cur = mergeDeep({ notes: {}, blobs: {}, deleted: {}, pdfs: {}, folders: {} }, (await get('dirty')) || {});
      for (const c of ['notes', 'blobs', 'deleted', 'pdfs', 'folders']) for (const k of Object.keys(snap[c] || {})) if (!(k in (S.dirty[c] || {})) && cur[c][k] === snap[c][k]) delete cur[c][k];
      if (snap.lib && !S.dirty.lib && cur.lib === snap.lib) cur.lib = false;
      await DB.put('meta', cur, 'dirty');
    };
    S.saveSettings = async () => {
      const cur = (await get('settings')) || {}, D = S.settings.drive; cur.drive = cur.drive || {};
      for (const k of ['lastSync', 'lastBgSync', 'folderId', 'layoutV']) if (D[k] !== undefined) cur.drive[k] = D[k];
      if (!D.refreshToken) delete cur.drive.refreshToken;
      await DB.put('meta', cur, 'settings');
    };
    S.saveSettings.flush = S.saveSettings;
  },
  async run(reason) {
    // app aberto e visível: ele mesmo faz o backup
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((c) => c.visibilityState === 'visible')) return;
    let err = null;
    // espera o app terminar o que estiver enviando (até 1 min); se o app estiver pausado segurando a trava, o Android tenta de novo depois
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined;
    const work = async () => {
      await this.load(); // dentro da trava: o estado mais novo (o app pode ter acabado de enviar)
      if (!Drive.configured()) return;
      await Drive.loadTok();
      if (!Drive.hasAuth()) return; // sem login válido: espera o app abrir
      const d = Store.dirty, pend = Object.keys(d.notes).length + Object.keys(d.blobs).length + Object.keys(d.deleted).length + Object.keys(d.folders).length + (d.lib ? 1 : 0);
      if (!pend) return;
      Drive.running = false; await Drive._sync(false, { background: true, noPdf: true, sw: true });
      if (Drive.state === 'err') err = new Error(Drive.msg || 'falha no backup');
    };
    if (navigator.locks) await navigator.locks.request('traco-drive', signal ? { signal } : {}, work); else await work();
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ type: 'traco-synced', reason });
    if (err) throw err; // o Android tenta de novo mais tarde
  },
};
self.addEventListener('sync', (e) => { if (e.tag === 'traco-backup') e.waitUntil(BgSync.run('sync')); });
self.addEventListener('periodicsync', (e) => { if (e.tag === 'traco-backup') e.waitUntil(BgSync.run('periodic').catch(() => {})); });
