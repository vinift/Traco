'use strict';
/* ===== Inicialização e navegação ===== */
const App = {
  version: '0.1.0',
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
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  },
  applyTheme() { const t = Store.settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; },
  async openNote(id) {
    $('#library').classList.add('hidden'); $('#editor').classList.remove('hidden');
    await new Promise((r) => requestAnimationFrame(r));
    if (!(await Editor.open(id))) Library.show();
  },
  async closeNote() { await Editor.close(); Library.show(); },
  wire() {
    $('#btnNewNote').onclick = $('#btnNewNote2').onclick = async () => { const n = await newNoteDialog(Library.folder); if (n) this.openNote(n.id); };
    $('#btnNewFolder').onclick = () => Library.newFolder();
    $('#btnImportPdf').onclick = () => Library.importPdf();
    $('#btnSettings').onclick = $('#btnEdSettings').onclick = () => openSettings();
    $('#libSearch').addEventListener('input', (e) => { Library.query = e.target.value; Library.render(); });
    $('#libSync').onclick = $('#edSync').onclick = () => Drive.onPillClick();
    $('#btnBack').onclick = () => this.closeNote();
    $('#btnUndo').onclick = () => Editor.undo();
    $('#btnRedo').onclick = () => Editor.redo();
    $('#btnFinger').onclick = () => { const S = Store.settings; S.fingerDraws = !S.fingerDraws; Store.saveSettings(); $('#btnFinger').classList.toggle('on', S.fingerDraws); toast(S.fingerDraws ? 'Dedo escreve (use 2 dedos para mover)' : 'Dedo só navega', 1600); };
    $('#btnPages').onclick = () => pagesPanel();
    $('#btnExport').onclick = (e) => exportMenu(e.currentTarget);
    $('#noteTitle').addEventListener('change', () => Editor.markChanged());
    $('#hudZoom').onclick = (e) => menu(e.currentTarget, [
      { label: 'Ajustar à largura', icon: 'fit', run: () => Editor.fitWidth() },
      { label: '100%', icon: 'search', run: () => Editor.zoomAt(Editor.W / 2, Editor.H / 2, 1 / Editor.cam.z) },
      { label: '200%', icon: 'search', run: () => Editor.zoomAt(Editor.W / 2, Editor.H / 2, 2 / Editor.cam.z) },
    ]);
    $('#hudPage').onclick = () => pagesPanel();
    window.addEventListener('pagehide', () => { if (Editor.note) Editor.saveNow(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Editor.note) Editor.saveNow(); });
  },
};
App.init().catch((e) => { console.error(e); document.body.innerHTML = '<p style="padding:20px">Erro ao iniciar: ' + e.message + '</p>'; });
