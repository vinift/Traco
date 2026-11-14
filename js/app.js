'use strict';
/* ===== Inicialização e navegação ===== */
/* liga eventos sem quebrar o app se um botão não existir (ex.: arquivos de versões diferentes em cache) */
function on(ids, fn) { for (const id of ids) { const n = document.getElementById(id); if (n) n.onclick = fn; else console.warn('Botão ausente: #' + id); } }
const App = {
  version: '0.7.0',
  async init() {
    hydrateIcons();
    await Store.init();
    this.applyTheme();
    Editor.init();
    Plugins.init();
    this.wire();
    const back = await Drive.handleRedirect();
    Drive.refreshStatus();
    Library.show();
    if (back && Store.heads[back]) this.openNote(back);
    if (Drive.configured() && Drive.hasAuth()) Drive.schedule();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', async () => { // versão nova instalada: recarrega uma vez
        if (!hadController || reloaded) return; reloaded = true;
        if (Editor.note) await Editor.saveNow(); location.reload();
      });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch((e) => console.warn('SW', e));
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  },
  applyTheme() { const t = Store.settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; },
  async openNote(id, focus) {
    $('#library').classList.add('hidden'); $('#editor').classList.remove('hidden');
    await new Promise((r) => requestAnimationFrame(r));
    if (!(await Editor.open(id))) return Library.show();
    if (focus) setTimeout(() => Editor.focusElement(focus[0], focus[1]), 60);
  },
  async closeNote() { await Editor.close(); Library.show(); },
  wire() {
    on(['btnNewNote2'], async () => { const n = await newNoteDialog(Library.folder); if (n) this.openNote(n.id); });
    on(['btnSettings', 'btnEdSettings'], () => openSettings());
    $('#libSearch').addEventListener('input', (e) => { Library.query = e.target.value; Library.render(); });
    on(['libSync'], (e) => Drive.pillMenu(e.currentTarget, null));
    on(['edSync'], (e) => Drive.pillMenu(e.currentTarget, Editor.note && Editor.note.id));
    on(['btnFab'], (e) => Library.fabMenu(e.currentTarget));
    on(['btnSort'], (e) => {
      const S = Store.settings, so = S.libSort || { by: 'name', dir: 1 };
      const set = (by, dir) => { S.libSort = { by, dir }; Store.saveSettings(); Library.render(); };
      menu(e.currentTarget, [
        { label: (so.by === 'name' ? '✓ ' : '') + 'Nome', icon: 'text', run: () => set('name', so.by === 'name' ? -so.dir : 1) },
        { label: (so.by === 'date' ? '✓ ' : '') + 'Data de modificação', icon: 'clock', run: () => set('date', so.by === 'date' ? -so.dir : 1) },
      ]);
    });
    on(['btnView'], () => { const S = Store.settings; S.libView = S.libView === 'list' ? 'grid' : 'list'; Store.saveSettings(); Library.render(); });
    on(['btnSelect'], () => { Library.selecting = !Library.selecting; Library.selected.clear(); Library.render(); });
    on(['btnSide', 'btnSide2'], () => { const S = Store.settings; S.sideClosed = !S.sideClosed; Store.saveSettings(); Library.render(); });
    $$('.side-item[data-view]').forEach((b) => (b.onclick = () => { Library.view = b.dataset.view; Library.folder = null; Library.query = ''; $('#libSearch').value = ''; Library.render(); if (innerWidth < 800) { Store.settings.sideClosed = true; Library.render(); } }));
    on(['btnBack'], () => this.closeNote());
    on(['btnPages'], () => pagesPanel());
    on(['btnAddPage'], () => { if (Editor.note.mode === 'infinite') return toast('Notas em tela infinita não têm páginas'); Editor.addPage(Editor.currentPageIndex()); toast('Página adicionada', 1200); });
    on(['btnExport'], (e) => exportMenu(e.currentTarget));
    on(['btnSearch'], (e) => noteSearchPop(e.currentTarget));
    on(['btnTemplate'], () => templateModal());
    on(['btnBookmark'], () => Editor.toggleBookmark());
    on(['btnRead'], () => Editor.setReadOnly(!Editor.readOnly));
    $('#noteTitle').addEventListener('change', () => Editor.markChanged());
    on(['hudZoom'], (e) => menu(e.currentTarget, [
      { label: 'Ajustar à largura', icon: 'fit', run: () => Editor.fitWidth() },
      { label: '100%', icon: 'search', run: () => Editor.zoomAt(Editor.W / 2, Editor.H / 2, 1 / Editor.cam.z) },
      { label: '200%', icon: 'search', run: () => Editor.zoomAt(Editor.W / 2, Editor.H / 2, 2 / Editor.cam.z) },
    ]));
    on(['hudPage'], () => pagesPanel());
    window.addEventListener('pagehide', () => { if (Editor.note) Editor.saveNow(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Editor.note) Editor.saveNow(); });
  },
};
App.init().catch((e) => { console.error(e); document.body.innerHTML = '<p style="padding:20px">Erro ao iniciar: ' + e.message + '</p>'; });
