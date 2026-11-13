'use strict';
/* ===== Inicialização e navegação ===== */
/* liga eventos sem quebrar o app se um botão não existir (ex.: arquivos de versões diferentes em cache) */
function on(ids, fn) { for (const id of ids) { const n = document.getElementById(id); if (n) n.onclick = fn; else console.warn('Botão ausente: #' + id); } }
const App = {
  version: '0.2.1',
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
    on(['btnNewNote', 'btnNewNote2'], async () => { const n = await newNoteDialog(Library.folder); if (n) this.openNote(n.id); });
    on(['btnNewFolder'], () => Library.newFolder());
    on(['btnImportPdf'], () => Library.importPdf());
    on(['btnSettings', 'btnEdSettings'], () => openSettings());
    $('#libSearch').addEventListener('input', (e) => { Library.query = e.target.value; Library.render(); });
    on(['libSync', 'edSync'], () => Drive.onPillClick());
    on(['btnBack'], () => this.closeNote());
    on(['btnPages'], () => pagesPanel());
    on(['btnAddPage'], () => { if (Editor.note.mode === 'infinite') return toast('Notas em tela infinita não têm páginas'); Editor.addPage(Editor.currentPageIndex()); toast('Página adicionada', 1200); });
    on(['btnExport'], (e) => exportMenu(e.currentTarget));
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
