'use strict';
/* ===== Inicialização e navegação ===== */
/* liga eventos sem quebrar o app se um botão não existir (ex.: arquivos de versões diferentes em cache) */
function on(ids, fn) { for (const id of ids) { const n = document.getElementById(id); if (n) n.onclick = fn; else console.warn('Botão ausente: #' + id); } }
const App = {
  version: '0.56.1',
  async init() {
    hydrateIcons();
    await Store.init();
    { const M = Store.settings.penMap || {}; let ch = false; for (const k in M) if (M[k] === 'bullet') { M[k] = 'hyphenDirect'; ch = true; } if (ch) Store.saveSettings(); } /* v0.47.1: o botão "só tópico" virou hífen direto */
    Store.purgeOldTrash().catch((e) => console.warn('lixeira', e)); // apaga de vez o que está na lixeira há mais de 30 dias
    this.applyTheme();
    StableVH.init(); SafeArea.init(); SystemBar.init(); Editor.init(); Editor.initScroll(); Nav.init(); Palm.init(); ZoomGuard.init(); NoteClock.start(); StudyTimer.init().catch((e) => console.warn('cronômetro', e));
    Plugins.init();
    setTimeout(() => Fonts.prewarm(), 4000); // baixa as fontes para funcionarem sem internet
    this.wire();
    try { Drive.checkCrash(); } catch (e) { console.warn(e); } // o app fechou sozinho na última vez? registra e deixa o backup mais leve
    const back = await Drive.handleRedirect();
    await Drive.loadTok(); // login de até 1 h atrás continua valendo
    Drive.refreshStatus();
    this.restorePlace(); Library.show(); PdfOpen.init();
    if (back && Store.heads[back]) this.openNote(back);
    else this.reopenLast();
    SplitView.restore();
    if (Drive.configured() && Drive.hasAuth()) Drive.schedule();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', async () => { // versão nova instalada: recarrega uma vez
        if (!hadController || reloaded || App._updGo) return; reloaded = true; /* v0.43.1: a verificação manual já recarrega (antes recarregava 2×) */
        if (Editor.note) await Editor.saveNow(); App.keepPlace(); location.reload();
      });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch((e) => console.warn('SW', e));
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  },
  /* voltou para o app (o Android pode ter fechado a página em segundo plano): reabre a nota em que você estava.
     Se a última tentativa de reabrir derrubou o app, não tenta de novo (evita ficar preso). */
  reopenLast() {
    let id = null, tried = null; try { id = localStorage.getItem('traco-last-note'); tried = localStorage.getItem('traco-reopen-try'); } catch (_) {}
    if (tried) { try { localStorage.removeItem('traco-reopen-try'); localStorage.removeItem('traco-last-note'); } catch (_) {} logError('A nota "' + ((Store.heads[tried] || {}).title || tried) + '" não pôde ser reaberta automaticamente', 'reabrir'); return; }
    if (!id || !Store.heads[id]) return;
    try { localStorage.setItem('traco-reopen-try', id); } catch (_) {}
    this.openNote(id).finally(() => setTimeout(() => { try { localStorage.removeItem('traco-reopen-try'); } catch (_) {} }, 8000));
  },
  /* v0.24.7: lembra a pasta/visão da biblioteca antes de recarregar (atualização) e volta para ela depois */
  keepPlace() { try { sessionStorage.setItem('traco-lib-place', JSON.stringify({ folder: Library.folder, view: Library.view })); } catch (_) {} },
  restorePlace() {
    let p = null; try { p = JSON.parse(sessionStorage.getItem('traco-lib-place') || localStorage.getItem('traco-lib-place') || 'null'); sessionStorage.removeItem('traco-lib-place'); } catch (_) {} /* v0.29: também depois que o Android fecha o app */
    if (!p) return; Library.view = p.view && p.view !== 'recent' ? p.view : 'home';
    Library.folder = p.folder && Store.folderChain(p.folder).length ? p.folder : null;
  },
  /* procura uma versão nova no GitHub; se houver, salva a nota, atualiza e reinicia */
  async checkUpdate(btn) {
    if (!navigator.onLine) return toast('Sem internet para verificar');
    btn && btn.classList.add('spin');
    try {
      const r = await fetch('js/app.js?check=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const m = (await r.text()).match(/version:\s*'([^']+)'/), remote = m && m[1];
      if (!remote) throw new Error('versão não encontrada');
      if (cmpVersion(remote, this.version) <= 0) { toast(`Você já está na versão mais recente (${this.version})`, 2600); return; }
      toast(`Atualizando para a versão ${remote}…`, 4000); this._updGo = true;
      if (Editor.note) { await Editor.saveNow(); await Editor.saveView(); } /* reabre na mesma nota e página (reopenLast + meta 'views') */
      /* v0.43.1: espera o service worker novo assumir ANTES de recarregar — senão a página nova abria na versão velha e recarregava de novo (piscava 2×) */
      const reg = 'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistration());
      if (reg) { try { await reg.update(); const w = reg.installing || reg.waiting; if (w) await new Promise((res) => { const t = setTimeout(res, 10000); const chk = () => { if (w.state === 'activated' || w.state === 'redundant') { clearTimeout(t); res(); } }; w.addEventListener('statechange', chk); chk(); }); } catch (_) {} }
      this.keepPlace(); location.replace(location.pathname + '?atualizar=' + Date.now());
    } catch (e) { toast('Não consegui verificar: ' + e.message, 3000); }
    finally { btn && btn.classList.remove('spin'); }
  },
  applyTheme() { const t = Store.settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; },
  async openNote(id, focus) {
    if (this._busy) return; this._busy = true;
    try {
      if (Editor.note && Editor.note.id !== id) await Editor.close(); // trocar de nota direto: fecha a anterior direito
      $('#library').classList.add('hidden'); $('#editor').classList.remove('hidden');
      await new Promise((r) => requestAnimationFrame(r));
      if (!(await Editor.open(id))) return Library.show();
      Nav.push('note'); QuickSwitch.touch(id); SplitView.visible(true);
      try { localStorage.setItem('traco-last-note', id); } catch (_) {} // ao voltar para o app, reabre aqui
      if (focus) setTimeout(() => Editor.focusElement(focus[0], focus[1]), 60);
    } catch (e) { logError(e, 'abrir nota'); toast('Erro ao abrir a nota: ' + e.message, 4000); Editor.note = null; Library.show(); }
    finally { this._busy = false; }
  },
  async closeNote() {
    if (this._busy) return; this._busy = true;
    try { localStorage.removeItem('traco-last-note'); } catch (_) {}
    try { await Editor.close(); } catch (e) { logError(e, 'fechar nota'); }
    finally { this._busy = false; Library.show(); }
  },
  wire() {
    on(['btnNewNote2'], async () => { const n = await newNoteDialog(Library.folder); if (n) this.openNote(n.id); });
    on(['btnSettings'], () => openSettings());
    /* v0.38.1: botões "Recentes" e "Estudo" saíram da barra lateral (Notas recentes + cartão Estudo de hoje) */
    on(['btnEdSettings'], (e) => NoteMenu.open(e.currentTarget));
    on(['btnUpdate'], (e) => this.checkUpdate(e.currentTarget));
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
    on(['btnExport'], () => ExportPanel.open(Editor.note));
    on(['btnSearch'], (e) => noteSearchPop(e.currentTarget));
        on(['btnBookmark'], () => Editor.toggleBookmark());
    on(['btnOutline'], (e) => Outline.open(e.currentTarget));
    on(['btnFull'], () => Focus.toggle());
    on(['btnQuick'], (e) => QuickSwitch.open(e.currentTarget));
    on(['btnSplit'], (e) => (SplitView.note ? SplitView.close() : QuickSwitch.open(e.currentTarget, 'split')));
    on(['btnRead'], () => Editor.setReadOnly(!Editor.readOnly));
    $('#noteTitle').addEventListener('change', () => Editor.markChanged());
    on(['hudZoom'], (e) => menu(e.currentTarget, [
      { label: 'Ajustar à largura', icon: 'fit', run: () => Editor.fitWidth() },
      { label: 'Página inteira', icon: 'pages', run: () => Editor.fitPage() },
      '-',
      ...ZOOM_STEPS.filter((z) => { const [a, b] = Editor.zoomLimits(); return z >= a - 1e-6 && z <= b + 1e-6; }).map((z) => ({ label: (Math.abs(Editor.cam.z - z) < 0.005 ? '✓ ' : '') + Math.round(z * 100) + '%', icon: 'search', run: () => Editor.zoomTo(z) })),
    ]));
    on(['hudPage'], (e) => GoPage.open(e.currentTarget)); /* v0.48: ir para página rápido (o painel de páginas fica em "Todas as páginas…") */
    window.addEventListener('pagehide', () => { if (Editor.note) Editor.saveNow(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Editor.note) Editor.saveNow(); });
  },
};
App.init().catch((e) => { console.error(e); document.body.innerHTML = '<p style="padding:20px">Erro ao iniciar: ' + e.message + '</p>'; });
