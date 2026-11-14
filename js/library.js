'use strict';
/* ===== Biblioteca de notas e pastas ===== */
const FOLDER_COLORS = ['#7c3aed', '#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#0891b2', '#db2777', '#92400e', '#65a30d', '#4b5563', '#0f766e', '#9333ea'];
const folderSvg = (c) => `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M6 20a8 8 0 0 1 8-8h22a6 6 0 0 1 4.6 2.2L46 20h40a8 8 0 0 1 8 8v56a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" fill="${c}"/><path d="M6 32a6 6 0 0 1 6-6h76a6 6 0 0 1 6 6v52a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" fill="${c}" style="filter:brightness(1.14)"/><path d="M58 30h30" stroke="rgba(0,0,0,.45)" stroke-width="3.5" stroke-linecap="round"/></svg>`;
const Library = {
  folder: null, query: '', view: 'home', selecting: false, selected: new Set(),
  show() {
    $('#editor').classList.add('hidden'); $('#library').classList.remove('hidden'); this.render(); Drive.refreshStatus();
  },
  get S() { return Store.settings; },
  children(fid) { return Store.folders.filter((f) => (f.parentId || null) === (fid || null)); },
  descendants(fid) { const out = [], walk = (id) => { for (const c of this.children(id)) { out.push(c); walk(c.id); } }; walk(fid); return out; },
  folderStats(f) {
    const ids = new Set([f.id, ...this.descendants(f.id).map((x) => x.id)]);
    let latest = f.created || 0; for (const h of Object.values(Store.heads)) if (ids.has(h.folderId)) latest = Math.max(latest, h.updated);
    const n = this.children(f.id).length + Object.values(Store.heads).filter((h) => h.folderId === f.id).length;
    return { n, latest };
  },
  sortItems(list, getName, getDate) {
    const { by, dir } = this.S.libSort || { by: 'name', dir: 1 };
    return list.sort((a, b) => (by === 'name' ? getName(a).localeCompare(getName(b), 'pt-BR', { numeric: true, sensitivity: 'base' }) : getDate(b) - getDate(a)) * (by === 'name' ? dir : dir));
  },
  render() {
    const S = this.S, q = this.query.trim();
    $('#hello').textContent = S.userName ? `Olá, ${S.userName}` : 'Olá!';
    const ver = $('#libVersion'); if (ver) ver.textContent = 'Versão ' + App.version;
    $('#library').classList.toggle('side-closed', !!S.sideClosed);
    $$('.side-item[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === this.view && !q && (this.view !== 'home' || !this.folder)));
    // pastas na barra lateral
    const sf = $('#sideFolders'); sf.innerHTML = '';
    for (const f of this.sortItems(this.children(null), (x) => x.name, (x) => this.folderStats(x).latest)) {
      const on = this.folder && (this.folder === f.id || Store.folderChain(this.folder).some((x) => x.id === f.id));
      sf.append(el('button', { class: 'side-item' + (on ? ' on' : ''), onclick: () => this.openFolder(f.id) }, el('span', { class: 'fdot', style: { background: f.color || FOLDER_COLORS[0] } }), f.name));
    }
    // caminho
    const crumbs = $('#crumbs'); crumbs.innerHTML = '';
    const home = el('button', { class: 'crumb', title: 'Início', onclick: () => { this.view = 'home'; this.openFolder(null); } }); home.innerHTML = icon('home'); crumbs.append(home);
    if (q) crumbs.append(iconEl('chevRight'), el('span', { class: 'crumb cur' }, 'Busca: "' + q + '"'));
    else if (this.view === 'recent') crumbs.append(iconEl('chevRight'), el('span', { class: 'crumb cur' }, 'Recentes'));
    else if (this.view === 'marked') crumbs.append(iconEl('chevRight'), el('span', { class: 'crumb cur' }, 'Com marcadores'));
    else for (const f of Store.folderChain(this.folder)) { crumbs.append(iconEl('chevRight')); crumbs.append(el('button', { class: 'crumb' + (f.id === this.folder ? ' cur' : ''), onclick: () => this.openFolder(f.id) }, f.name)); }
    const so = S.libSort || { by: 'name', dir: 1 };
    $('#btnSort').innerHTML = icon(so.dir > 0 ? 'sortUp' : 'sortDown') + `<span>${so.by === 'name' ? 'Nome' : 'Data'}</span>`;
    $('#btnView').innerHTML = icon(S.libView === 'list' ? 'pages' : 'list');
    $('#btnSelect').classList.toggle('on', this.selecting);
    // itens
    const grid = $('#itemGrid'); grid.innerHTML = ''; grid.className = 'item-grid ' + (S.libView === 'list' ? 'as-list' : 'as-grid');
    let folders = [], heads = Object.values(Store.heads); const hits = {};
    if (q) {
      const nq = norm(q);
      folders = Store.folders.filter((f) => norm(f.name).includes(nq));
      heads = heads.filter((h) => { if (norm(h.title).includes(nq)) return true; const t = (h.texts || []).find((x) => norm(x[2]).includes(nq)); if (t) { hits[h.id] = t; return true; } return false; });
    } else if (this.view === 'recent') heads = heads.sort((a, b) => b.updated - a.updated).slice(0, 60);
    else if (this.view === 'marked') heads = heads.filter((h) => h.bm);
    else { folders = this.children(this.folder); heads = heads.filter((h) => (h.folderId || null) === (this.folder || null)); }
    if (this.view === 'home' || q) { folders = this.sortItems(folders, (x) => x.name, (x) => this.folderStats(x).latest); heads = this.sortItems(heads, (x) => x.title, (x) => x.updated); }
    for (const f of folders) grid.append(this.folderItem(f));
    for (const h of heads) grid.append(this.noteItem(h, hits[h.id], q));
    $('#libEmpty').classList.toggle('hidden', folders.length + heads.length > 0);
    this.renderSelBar();
  },
  folderItem(f) {
    const st = this.folderStats(f), sel = this.selected.has('f:' + f.id);
    const mb = el('button', { class: 'icon-btn more', title: 'Opções', onclick: (e) => { e.stopPropagation(); this.folderMenu(mb, f); } }); mb.innerHTML = icon('more');
    const ic = el('div', { class: 'ficon', html: folderSvg(f.color || FOLDER_COLORS[0]) });
    return el('div', { class: 'item' + (sel ? ' sel' : ''), onclick: () => this.selecting ? this.toggleSel('f:' + f.id) : this.openFolder(f.id) }, ic,
      el('div', { class: 'meta' }, el('div', { class: 'dt' }, st.latest ? fmtDate(st.latest) : ''), el('div', { class: 'nm' }, f.name), el('div', { class: 'cnt' }, st.n === 1 ? '1 item' : `${st.n} itens`)), this.selecting ? el('span', { class: 'chk-dot' }, sel ? '✓' : '') : mb);
  },
  noteItem(h, hit, q) {
    const sel = this.selected.has('n:' + h.id);
    const mb = el('button', { class: 'icon-btn more', title: 'Opções', onclick: (e) => { e.stopPropagation(); this.noteMenu(mb, h); } }); mb.innerHTML = icon('more');
    const th = el('div', { class: 'nthumb' }, h.thumb ? el('img', { src: h.thumb, alt: '' }) : null);
    const info = h.mode === 'infinite' ? 'Tela infinita' : `${h.pages} pág.` + (h.hasPdf ? ' · PDF' : '') + (h.bm ? ` · ${h.bm} marcador${h.bm > 1 ? 'es' : ''}` : '');
    const where = this.view !== 'home' || q ? (Store.folderChain(h.folderId).map((f) => f.name).join(' › ') || 'Início') : null;
    return el('div', { class: 'item' + (sel ? ' sel' : ''), onclick: () => this.selecting ? this.toggleSel('n:' + h.id) : App.openNote(h.id, hit ? [hit[0], hit[1]] : null) }, th,
      el('div', { class: 'meta' }, el('div', { class: 'dt' }, fmtDate(h.updated)), el('div', { class: 'nm' }, h.title), el('div', { class: 'cnt' }, where ? where + ' · ' + info : info),
        hit ? el('div', { class: 'lib-hit', title: hit[2] }, el('b', {}, 'Pág. ' + (hit[0] + 1) + (hit[1] ? '' : ' ✍') + ': '), snippet(hit[2], q)) : null), this.selecting ? el('span', { class: 'chk-dot' }, sel ? '✓' : '') : mb);
  },
  openFolder(id) { this.folder = id; this.view = 'home'; this.query = ''; $('#libSearch').value = ''; this.selected.clear(); this.render(); $('.lib-body').scrollTop = 0; },
  /* ---- seleção múltipla ---- */
  toggleSel(k) { this.selected.has(k) ? this.selected.delete(k) : this.selected.add(k); this.render(); },
  renderSelBar() {
    const bar = $('#selActions'); bar.classList.toggle('hidden', !this.selecting); if (!this.selecting) return;
    const n = this.selected.size; bar.innerHTML = '';
    const B = (l, fn, cls = '') => el('button', { class: 'btn ' + cls, disabled: !n, onclick: fn }, l);
    bar.append(el('b', {}, n ? `${n} selecionado(s)` : 'Toque nos itens para selecionar'), el('span', { class: 'sp' }),
      B('Mover…', () => this.moveSelected()), B('Excluir', () => this.deleteSelected(), 'danger'),
      el('button', { class: 'btn ghost', onclick: () => { this.selecting = false; this.selected.clear(); this.render(); } }, 'Cancelar'));
  },
  async moveSelected() {
    const fIds = [...this.selected].filter((k) => k.startsWith('f:')).map((k) => k.slice(2));
    const exclude = new Set(fIds.flatMap((id) => [id, ...this.descendants(id).map((x) => x.id)]));
    const dest = await this.folderPicker('Mover para', exclude); if (dest === undefined) return;
    for (const k of this.selected) {
      if (k.startsWith('n:')) { const n = await Store.getNote(k.slice(2)); if (n) { n.folderId = dest; await Store.putNote(n); } }
      else { const f = Store.folders.find((x) => x.id === k.slice(2)); if (f) f.parentId = dest; }
    }
    await Store.saveFolders(); Drive.schedule(); this.selecting = false; this.selected.clear(); this.render(); toast('Itens movidos');
  },
  async deleteSelected() {
    const notes = [...this.selected].filter((k) => k.startsWith('n:')), folders = [...this.selected].filter((k) => k.startsWith('f:'));
    if (!(await confirmBox('Excluir', `Excluir ${notes.length} nota(s)` + (folders.length ? ` e ${folders.length} pasta(s)? O conteúdo das pastas vai para a pasta de cima.` : '?'), 'Excluir', true))) return;
    for (const k of notes) await Store.deleteNote(k.slice(2));
    for (const k of folders) { const f = Store.folders.find((x) => x.id === k.slice(2)); if (f) await this.removeFolder(f); }
    this.selecting = false; this.selected.clear(); this.render();
  },
  /* ---- pastas ---- */
  async removeFolder(f) {
    const up = f.parentId || null;
    for (const h of Object.values(Store.heads)) if (h.folderId === f.id) { const n = await Store.getNote(h.id); n.folderId = up; await Store.putNote(n); }
    for (const c of this.children(f.id)) c.parentId = up;
    Store.folders = Store.folders.filter((x) => x.id !== f.id); await Store.saveFolders(); Drive.schedule();
    if (this.folder === f.id) this.folder = up;
  },
  folderTreeOptions(exclude = new Set()) {
    const out = [], walk = (pid, depth) => { for (const f of this.sortItems(this.children(pid), (x) => x.name, () => 0)) { if (exclude.has(f.id)) continue; out.push([f.id, ' '.repeat(depth) + f.name]); walk(f.id, depth + 1); } };
    walk(null, 0); return out;
  },
  async folderPicker(title, exclude = new Set(), current = null) {
    const sel = el('select', {}, el('option', { value: '' }, 'Início (sem pasta)'), ...this.folderTreeOptions(exclude).map(([id, n]) => el('option', { value: id }, n)));
    sel.value = current || '';
    const ok = await openModal({ title, body: el('div', { class: 'field' }, el('label', {}, 'Pasta de destino'), sel), buttons: [{ label: 'Cancelar', value: false }, { label: 'Mover', cls: 'primary', value: true }] });
    return ok ? sel.value || null : undefined;
  },
  folderMenu(anchor, f) {
    menu(anchor, [
      { label: 'Renomear', icon: 'pen', run: async () => { const n = await askText('Renomear pasta', f.name); if (n) { f.name = n; await Store.saveFolders(); Drive.schedule(); this.render(); } } },
      { label: 'Cor da pasta', icon: 'palette', run: () => colorPop(anchor, f.color || FOLDER_COLORS[0], async (c) => { f.color = c; await Store.saveFolders(); this.render(); }, FOLDER_COLORS.concat(['#111827', '#a16207', '#be185d', '#1d4ed8', '#15803d', '#b91c1c'])) },
      { label: 'Nova pasta dentro', icon: 'folder', run: () => this.newFolder(f.id) },
      { label: 'Mover para…', icon: 'move', run: async () => { const d = await this.folderPicker('Mover pasta', new Set([f.id, ...this.descendants(f.id).map((x) => x.id)]), f.parentId); if (d !== undefined) { f.parentId = d; await Store.saveFolders(); Drive.schedule(); this.render(); } } },
      { label: 'Grupo de predefinições…', icon: 'layers', run: async () => {
        const G = Store.settings.presetGroups; const sel = el('select', {}, el('option', { value: '' }, '(herdar da pasta de cima)'), ...G.map((g) => el('option', { value: g.id }, g.name))); sel.value = f.groupId || '';
        const ok = await openModal({ title: 'Grupo da pasta "' + f.name + '"', body: el('div', { class: 'field' }, el('label', {}, 'Cores e espessuras usadas nas notas desta pasta (e das pastas dentro dela)'), sel, el('p', { class: 'lbl-sm' }, 'Crie e edite grupos dentro de uma nota, no botão do grupo no topo da barra de predefinições.')), buttons: [{ label: 'Cancelar', value: false }, { label: 'Salvar', cls: 'primary', value: true }] });
        if (ok) { if (sel.value) f.groupId = sel.value; else delete f.groupId; await Store.saveFolders(); toast('Grupo definido para a pasta'); }
      } },
      '-',
      { label: 'Excluir pasta', icon: 'trash', danger: true, run: async () => {
        if (!(await confirmBox('Excluir pasta', `Excluir a pasta "${f.name}"? As notas e pastas de dentro não são apagadas: elas vão para a pasta de cima.`, 'Excluir', true))) return;
        await this.removeFolder(f); this.render();
      } },
    ]);
  },
  noteMenu(anchor, h) {
    menu(anchor, [
      { label: 'Renomear', icon: 'pen', run: async () => { const t = await askText('Renomear nota', h.title); if (t) { const n = await Store.getNote(h.id); n.title = t; n.updated = Date.now(); await Store.putNote(n); this.render(); } } },
      { label: 'Mover para…', icon: 'folder', run: () => this.moveDialog(h) },
      { label: 'Duplicar', icon: 'copy', run: async () => { const n = await Store.getNote(h.id); const c = clone(n); c.id = uid(); c.title = n.title + ' (cópia)'; c.created = c.updated = Date.now(); await Store.putNote(c); await Store.setThumb(c.id, h.thumb); this.render(); } },
      { label: 'Exportar PDF', icon: 'download', run: async () => exportPdfFlow(await Store.getNote(h.id)) },
      { label: 'Abrir no Google Drive', icon: 'external', run: () => Drive.openInDrive(h.id) },
      '-',
      { label: 'Excluir', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Excluir nota', `Excluir "${h.title}"? No Drive, o arquivo vai para a lixeira.`, 'Excluir', true)) { await Store.deleteNote(h.id); this.render(); } } },
    ]);
  },
  async moveDialog(h) {
    const d = await this.folderPicker('Mover nota', new Set(), h.folderId); if (d === undefined) return;
    const n = await Store.getNote(h.id); n.folderId = d; await Store.putNote(n); this.render(); toast('Nota movida');
  },
  async newFolder(parentId = this.folder) {
    const n = await askText('Nova pasta', '', 'Nome da pasta (ex.: Direito Penal I)'); if (!n) return;
    const color = FOLDER_COLORS[Store.folders.length % FOLDER_COLORS.length];
    Store.folders.push({ id: uid(), name: n, parentId: parentId || null, color, created: Date.now() }); await Store.saveFolders(); Drive.schedule(); this.render();
  },
  fabMenu(anchor) {
    menu(anchor, [
      { label: 'Nova nota', icon: 'pen', run: async () => { const n = await newNoteDialog(this.folder); if (n) App.openNote(n.id); } },
      { label: 'Nova pasta', icon: 'folder', run: () => this.newFolder() },
      '-',
      { label: 'Importar PDF', icon: 'file', run: () => this.importPdf() },
      { label: 'Importar do Notewise', icon: 'layers', run: () => this.importNotewise() },
      { label: 'Restaurar cópia do Traço (.json)', icon: 'download', run: () => importAll() },
    ]);
  },
  importMenu(anchor) {
    menu(anchor, [
      { label: 'PDF (apostilas, leis, artigos)', icon: 'file', run: () => this.importPdf() },
      { label: 'Notas do Notewise (.notewise ou .zip)', icon: 'layers', run: () => this.importNotewise() },
      { label: 'Cópia de segurança do Traço (.json)', icon: 'download', run: () => importAll() },
    ]);
  },
  async importNotewise() {
    const f = await pickFile(''); if (!f) return;
    if (!/\.(notewise|zip)$/i.test(f.name)) return toast('Escolha um arquivo .notewise ou o .zip exportado pelo Notewise', 4000);
    toast('Importando do Notewise…', 20000);
    try {
      const res = await importNotewiseFile(f, (i, t, n) => toast(`Importando ${i} de ${t}: ${n.split('/').pop()}`, 20000));
      const ok = res.filter((r) => r.note), bad = res.filter((r) => r.error);
      const st = ok.reduce((a, r) => { for (const k in r.stats) a[k] = (a[k] || 0) + r.stats[k]; return a; }, {});
      this.render(); toast('', 1);
      const body = el('div', {}, el('p', {}, `${ok.length} nota(s) importada(s): ${st.pages || 0} páginas, ${st.strokes || 0} traços, ${st.highlights || 0} marca-textos, ${st.shapes || 0} formas e ${st.images || 0} imagens.`),
        st.skipped ? el('p', { class: 'lbl-sm' }, `${st.skipped} item(ns) de tipos que o Traço ainda não reconhece (ex.: caixas de texto ou PDFs do Notewise) foram ignorados. Mande um exemplo para eu adicionar.`) : null,
        bad.length ? el('p', { style: { color: 'var(--danger)' } }, 'Com erro: ' + bad.map((b) => b.error).join('; ')) : null);
      const go = await openModal({ title: 'Importação concluída', body, buttons: [{ label: 'Fechar', value: false }, ok.length === 1 ? { label: 'Abrir nota', cls: 'primary', value: true } : null].filter(Boolean) });
      if (go && ok[0]) App.openNote(ok[0].note.id);
    } catch (e) { console.error(e); toast('Não foi possível importar: ' + e.message, 6000); }
  },
  async importPdf() {
    const f = await pickFile('application/pdf'); if (!f) return;
    toast('Importando PDF…', 10000);
    try {
      const pages = await importPdfFile(f);
      const note = newNote({ title: f.name.replace(/\.pdf$/i, ''), folderId: this.folder, mode: 'pages', template: { ...Store.settings.template, type: 'blank' } });
      note.pages = pages; await Store.putNote(note); toast(`PDF importado: ${pages.length} página(s)`);
      App.openNote(note.id);
    } catch (e) { console.error(e); toast('Não foi possível abrir o PDF: ' + e.message, 5000); }
  },
};

/* ===== Configurações ===== */
async function openSettings(focus) {
  const S = Store.settings, D = S.drive;
  const body = el('div', {});
  // --- Drive
  const cid = el('input', { type: 'text', value: D.clientId || '', placeholder: 'xxxxxxxx.apps.googleusercontent.com' });
  const sec = el('input', { type: 'password', value: D.clientSecret || '', placeholder: 'Opcional — evita ter que reconectar a cada hora' });
  const auto = el('input', { type: 'checkbox' }); auto.checked = D.enabled !== false;
  const status = el('p', {}, Drive.configured() ? (Drive.hasAuth() ? '✅ Conectado.' : '⚠️ Configurado, mas precisa conectar.') + (D.lastSync ? ' Último backup: ' + new Date(D.lastSync).toLocaleString('pt-BR') : '') : 'Backup no Drive desligado.');
  const saveDrive = () => { const changed = cid.value.trim() !== D.clientId || sec.value.trim() !== (D.clientSecret || ''); D.clientId = cid.value.trim(); D.clientSecret = sec.value.trim(); D.enabled = auto.checked && !!D.clientId; if (changed) { delete D.refreshToken; Drive.token = null; } Store.saveSettings.flush(); Drive.refreshStatus(); };
  const B = (label, cls, fn) => el('button', { class: 'btn ' + cls, onclick: fn }, label);
  const driveSec = el('div', { class: 'set-sec', id: 'set-drive' }, el('h3', {}, 'Backup automático no Google Drive'),
    el('p', {}, 'Suas notas ficam salvas no tablet e são copiadas automaticamente para o seu Drive alguns segundos depois de cada alteração, organizadas como: Traço Notas › nome da pasta › título da nota. O Drive guarda o histórico de versões de cada arquivo.'),
    !Drive.canUse() ? el('p', { style: { color: 'var(--danger)' } }, 'Atenção: o backup só funciona quando o app está hospedado em um endereço https (veja o guia de instalação).') : null,
    el('div', { class: 'field' }, el('label', {}, 'Client ID (OAuth do Google Cloud)'), cid),
    el('div', { class: 'field' }, el('label', {}, 'Client Secret (opcional, recomendado)'), sec),
    el('div', { class: 'field' }, el('label', {}, 'URI de redirecionamento e origem para cadastrar no Google Cloud'), el('code', { class: 'k' }, Drive.redirectUri()), el('code', { class: 'k' }, location.origin)),
    el('label', { class: 'chk', style: { marginBottom: '10px' } }, auto, 'Backup automático ligado'),
    UI.check('Salvar também uma cópia em PDF de cada nota (para ler direto no Drive)', D.pdf !== false, (v) => { D.pdf = v; Store.saveSettings(); }),
    status,
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      B('Salvar e conectar', 'primary', () => { saveDrive(); if (D.clientId) Drive.connect(); else toast('Informe o Client ID'); }),
      B('Fazer backup agora', '', () => { saveDrive(); Drive.sync(true); }),
      B('Restaurar do Drive', '', async () => {
        saveDrive(); if (!(await confirmBox('Restaurar do Drive', 'Baixar as notas do Drive? Notas que estão mais novas no Drive substituem as do tablet; as demais ficam como estão.', 'Restaurar'))) return;
        try { const n = await Drive.restore((i, t) => toast(`Restaurando… ${i}/${t}`, 4000)); toast(`${n} nota(s) restauradas`); Library.render(); } catch (e) { toast(e.needAuth ? 'Conecte o Drive primeiro' : 'Erro: ' + e.message, 5000); }
      }),
      Drive.hasAuth() ? B('Desconectar', 'ghost danger', () => { Drive.disconnect(); toast('Drive desconectado'); }) : null));
  body.append(driveSec);
  const nameI = el('input', { type: 'text', value: S.userName || '', placeholder: 'Seu nome' }); nameI.addEventListener('change', () => { S.userName = nameI.value.trim(); Store.saveSettings(); Library.render(); });
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Você'), el('div', { class: 'field' }, el('label', {}, 'Nome exibido na saudação da tela inicial'), nameI)));
  // --- Escrita
  const chk = (label, key, after) => UI.check(label, S[key], (v) => { S[key] = v; Store.saveSettings(); after && after(v); });
  const th = el('select', {}, el('option', { value: 'auto' }, 'Automático'), el('option', { value: 'light' }, 'Claro'), el('option', { value: 'dark' }, 'Escuro')); th.value = S.theme || 'auto'; th.addEventListener('change', () => { S.theme = th.value; Store.saveSettings(); App.applyTheme(); });
  const bar = UI.seg([['normal', 'Normal'], ['compact', 'Compacta'], ['mini', 'Bem compacta']], S.barSize || 'compact', (v) => { S.barSize = v; Store.saveSettings(); applyBarSize(); });
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Aparência e barras'),
    el('div', { class: 'field' }, el('label', {}, 'Largura das barras laterais do editor (mais estreitas deixam mais espaço para escrever)'), bar),
    el('div', { class: 'field' }, el('label', {}, 'Tema do app'), th)));
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Ajustes automáticos'),
    el('p', {}, 'Ao mover, redimensionar ou girar formas, textos, post-its, imagens e tabelas, o app ajuda a alinhar e mostra uma linha-guia rosa.'),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      UI.check('Diretrizes da página: margens, centro e pauta/grade do modelo', S.snapPage !== false, (v) => { S.snapPage = v; Store.saveSettings(); }),
      UI.check('Outros objetos: bordas e centros dos objetos próximos', S.snapObjects !== false, (v) => { S.snapObjects = v; Store.saveSettings(); }),
      UI.check('Ângulo: girar grudando a cada 15° (0°, 45°, 90°…)', S.snapAngle !== false, (v) => { S.snapAngle = v; Store.saveSettings(); }),
      UI.check('Proporção: ao redimensionar, grudar em 1:1 ou na proporção original', S.snapRatio !== false, (v) => { S.snapRatio = v; Store.saveSettings(); }),
      UI.check('Linhas retas da caneta e do marca-texto grudam a cada 15°', S.angleSnap !== false, (v) => { S.angleSnap = v; Store.saveSettings(); }))));
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Escrita e caneta'),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      chk('Ignorar a palma da mão (toques são ignorados enquanto a caneta está perto da tela)', 'palmGuard'),
      chk('Escrever com o dedo (o mesmo que o botão de mão no editor)', 'fingerDraws'),
      chk('Rabiscar para apagar (zigue-zague com a caneta por cima do que quer apagar)', 'scribbleErase'),
      UI.slider('Sensibilidade à pressão', 0, 1, 0.05, S.pressureSens ?? 0.6, (v) => { S.pressureSens = v; S.pressure = v > 0; Store.saveSettings(); }, (v) => (v === 0 ? 'sem' : Math.round(v * 100) + '%')),
      chk('Reconhecer formas ao segurar a caneta parada no fim do traço', 'shapeHold'),
      UI.check('Modo de baixa latência (a tinta aparece mais rápido; reabra o app depois de mudar)', S.lowLatency === true, (v) => { S.lowLatency = v; Store.saveSettings(); toast('Reabra o app para aplicar'); }),
      UI.slider('Estabilização do traço (deixa a letra mais firme)', 0, 1, 0.05, S.stabilizer ?? 0.55, (v) => { S.stabilizer = v; Store.saveSettings(); }, (v) => Math.round(v * 100) + '%'),
      )));
  body.append(penMapSection());
  S.ocr = S.ocr || { enabled: true, lang: 'pt_BR' };
  const ocrLang = el('select', {}, ...[['pt_BR', 'Português (Brasil)'], ['pt_PT', 'Português (Portugal)'], ['en', 'Inglês'], ['es', 'Espanhol'], ['fr', 'Francês'], ['it', 'Italiano'], ['de', 'Alemão'], ['la', 'Latim']].map(([v, n]) => el('option', { value: v }, n)));
  ocrLang.value = S.ocr.lang || 'pt_BR'; ocrLang.addEventListener('change', () => { S.ocr.lang = ocrLang.value; Store.saveSettings(); });
  const ocrStatus = el('p', {});
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Leitura da escrita à mão (OCR)'),
    el('p', {}, 'O app lê os traços da caneta para você buscar palavras escritas à mão, copiar o texto e converter a escrita em texto digitado (selecione com o laço). Os traços são enviados ao serviço de reconhecimento de escrita do Google, que é gratuito mas não oficial e pode mudar sem aviso.'),
    UI.check('Ler a escrita automaticamente para a busca (precisa de internet)', S.ocr.enabled !== false, (v) => { S.ocr.enabled = v; Store.saveSettings(); }),
    el('div', { class: 'row', style: { marginTop: '10px' } }, el('div', { class: 'field' }, el('label', {}, 'Idioma da escrita'), ocrLang)),
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, B('Ler todas as notas agora', '', async () => {
      if (!navigator.onLine) return toast('Precisa de internet');
      try { await OCR.indexAll((i, t) => { ocrStatus.textContent = `Lendo notas… ${i} de ${t}`; }); ocrStatus.textContent = '✅ Todas as notas foram lidas.'; }
      catch (e) { ocrStatus.textContent = '⚠️ Não foi possível ler: ' + e.message; }
    })), ocrStatus));
  // --- Modelo padrão
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Modelo padrão para novas notas'),
    el('button', { class: 'btn', onclick: async () => {
      const te = templateEditor(S.template);
      const ok = await openModal({ title: 'Modelo padrão', body: te.el, wide: true, buttons: [{ label: 'Cancelar', value: false }, { label: 'Salvar', cls: 'primary', value: true }] });
      if (ok) { S.template = te.get(); Store.saveSettings(); toast('Modelo padrão salvo'); }
    } }, 'Editar modelo padrão')));
  // --- Plugins
  const plist = el('div', {});
  const renderPlugins = () => {
    plist.innerHTML = '';
    for (const p of S.plugins) {
      const t = el('input', { type: 'checkbox' }); t.checked = p.enabled;
      t.addEventListener('change', () => { p.enabled = t.checked; Store.saveSettings(); Plugins.loadAll(); renderPlugins(); });
      const err = Plugins.errors[p.id];
      plist.append(el('div', { class: 'plugin-row' }, t, el('span', { class: 'nm' }, p.name, err ? el('div', { style: { color: 'var(--danger)', fontSize: '12px' } }, 'Erro: ' + err) : null),
        B('Editar', 'ghost', () => editPlugin(p).then(renderPlugins)),
        B('Excluir', 'ghost danger', async () => { if (await confirmBox('Excluir plugin', `Excluir "${p.name}"?`, 'Excluir', true)) { S.plugins = S.plugins.filter((x) => x !== p); Store.saveSettings(); Plugins.loadAll(); renderPlugins(); } })));
    }
    if (!S.plugins.length) plist.append(el('p', {}, 'Nenhum plugin instalado.'));
  };
  renderPlugins();
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Ferramentas próprias (plugins)'),
    el('p', {}, 'Crie suas próprias ferramentas em JavaScript. Elas aparecem na barra do editor. Use apenas código que você escreveu ou em que confia.'),
    plist,
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
      B('Novo plugin', 'primary', () => editPlugin(null).then(renderPlugins)),
      B('Carregar arquivo .js', '', async () => { const f = await pickFile('.js,text/javascript'); if (!f) return; S.plugins.push({ id: uid(), name: f.name.replace(/\.js$/, ''), code: await f.text(), enabled: true }); Store.saveSettings(); Plugins.loadAll(); renderPlugins(); }),
      B('Como criar (API)', 'ghost', () => openModal({ title: 'API de plugins', wide: true, body: el('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '12.5px' } }, PLUGIN_DOC), buttons: [{ label: 'Fechar', cls: 'primary' }] })))));
  // --- Backup local
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Cópia local'),
    el('p', {}, 'Um arquivo único com todas as notas, imagens e PDFs, para guardar onde quiser ou levar para outro aparelho.'),
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, B('Exportar tudo', '', exportAll), B('Importar arquivo de backup', '', importAll))));
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Sobre'), el('p', {}, `Traço Notas · versão ${App.version}`), el('p', {}, 'Caderno digital feito sob medida: escrita com caneta, PDFs, tabelas, importação do Notewise e backup no seu Google Drive. As notas ficam guardadas no aparelho.')));
  return settingsPage(body, focus, () => { saveDrive(); applyBarSize(); if (Editor.note) { UI.buildToolbar(); UI.renderOptions(); Editor.requestRender(); } });
}
const SET_ORDER = [['Você', 'home'], ['Aparência e barras', 'palette'], ['Escrita e caneta', 'pen'], ['Ajustes automáticos', 'fit'], ['Botões da caneta (Focus Pen)', 'hand'], ['Leitura da escrita à mão (OCR)', 'ocr'], ['Backup automático no Google Drive', 'cloud'], ['Modelo padrão para novas notas', 'grid'], ['Ferramentas próprias (plugins)', 'plug'], ['Cópia local', 'download'], ['Sobre', 'star']];
function settingsPage(body, focus, onClose) {
  return new Promise((resolve) => {
    const secs = [...body.querySelectorAll(':scope > .set-sec')];
    const byTitle = new Map(secs.map((x) => [x.querySelector('h3').textContent, x]));
    const content = el('div', { class: 'sp-content' }), nav = el('nav', { class: 'sp-nav' });
    const ordered = SET_ORDER.filter(([t]) => byTitle.has(t)).concat(secs.map((x) => [x.querySelector('h3').textContent, 'settings']).filter(([t]) => !SET_ORDER.some(([o]) => o === t)));
    for (const [t, ic] of ordered) {
      const sec = byTitle.get(t); sec.id = 'sec-' + uid(); const h = sec.querySelector('h3'); h.prepend(iconEl(ic)); content.append(sec);
      const b = el('button', { class: 'sp-item', onclick: () => { content.scrollTo({ top: sec.offsetTop - 12, behavior: 'smooth' }); } }, iconEl(ic), el('span', {}, t.replace(' (Focus Pen)', '').replace(' (OCR)', '').replace('Backup automático no ', '').replace(' para novas notas', '').replace(' (plugins)', '')));
      b.dataset.sec = sec.id; nav.append(b);
    }
    const close = () => { page.remove(); onClose && onClose(); resolve(); };
    const back = el('button', { class: 'cbtn round', title: 'Voltar', onclick: close }); back.innerHTML = icon('arrowLeft');
    const page = el('div', { class: 'settings-page' },
      el('header', { class: 'sp-head' }, back, el('h1', {}, 'Configurações'), el('span', { class: 'sp-ver' }, 'v' + App.version)),
      el('div', { class: 'sp-body' }, nav, content));
    content.addEventListener('scroll', () => { // destaca a seção visível
      let cur = null; for (const sec of content.children) if (sec.offsetTop - content.scrollTop < 140) cur = sec.id;
      $$('.sp-item', nav).forEach((b) => b.classList.toggle('on', b.dataset.sec === cur));
    });
    document.body.append(page);
    setTimeout(() => {
      content.dispatchEvent(new Event('scroll'));
      if (focus === 'drive') { const d = [...content.children].find((x) => x.querySelector('h3').textContent.includes('Google Drive')); if (d) content.scrollTo({ top: d.offsetTop - 12 }); }
    }, 30);
  });
}
async function editPlugin(p) {
  const S = Store.settings;
  const name = el('input', { type: 'text', value: p ? p.name : 'Minha ferramenta' });
  const code = el('textarea', { spellcheck: 'false' }); code.value = p ? p.code : `Traco.registerTool({
  id: 'minha-ferramenta', name: 'Minha ferramenta', icon: '✨',
  hint: 'Toque na página',
  onUp(p, api) {
    api.addShape('ellipse', p.x - 10, p.y - 10, p.x + 10, p.y + 10, { color: '#dc2626', width: 2 });
  }
});`;
  code.style.height = '320px';
  const ok = await openModal({ title: p ? 'Editar plugin' : 'Novo plugin', wide: true, body: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Nome'), name), el('div', { class: 'field' }, el('label', {}, 'Código'), code), el('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '11.5px', color: 'var(--muted)' } }, PLUGIN_DOC)), buttons: [{ label: 'Cancelar', value: false }, { label: 'Salvar', cls: 'primary', value: true }] });
  if (!ok) return;
  if (p) { if (p.code !== code.value) p.edited = true; p.name = name.value; p.code = code.value; } else S.plugins.push({ id: uid(), name: name.value, code: code.value, enabled: true });
  Store.saveSettings(); Plugins.loadAll();
  const target = p || S.plugins[S.plugins.length - 1];
  toast(Plugins.errors[target.id] ? 'Plugin com erro: ' + Plugins.errors[target.id] : 'Plugin salvo', 4000);
}
async function exportAll() {
  toast('Preparando cópia…', 6000);
  const notes = await DB.all('notes'); const blobs = {};
  for (const k of await DB.keys('blobs')) { const b = await DB.get('blobs', k); if (b) blobs[k] = await blobToDataURL(b); }
  const data = { app: 'traco-notas', v: 1, exported: Date.now(), folders: Store.folders, notes, blobs, thumbs: Object.fromEntries(Object.values(Store.heads).map((h) => [h.id, h.thumb])) };
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `traco-backup-${new Date().toISOString().slice(0, 10)}.json`);
}
async function importAll() {
  const f = await pickFile('application/json,.json'); if (!f) return;
  try {
    const data = JSON.parse(await f.text()); if (data.app !== 'traco-notas') throw new Error('arquivo não é um backup do Traço');
    for (const [k, v] of Object.entries(data.blobs || {})) { await DB.put('blobs', dataURLToBlob(v), k); Store.dirty.blobs[k] = 1; }
    for (const fo of data.folders || []) if (!Store.folders.find((x) => x.id === fo.id)) Store.folders.push(fo);
    await Store.saveFolders();
    let n = 0;
    for (const note of data.notes || []) { const h = Store.heads[note.id]; if (!h || note.updated > h.updated) { await Store.putNote(note); if (data.thumbs && data.thumbs[note.id]) await Store.setThumb(note.id, data.thumbs[note.id]); n++; } }
    toast(`${n} nota(s) importadas`); Library.render();
  } catch (e) { toast('Erro ao importar: ' + e.message, 5000); }
}

/* ===== Botões da caneta: mapear como em jogos ("pressione o botão") ===== */
const PEN_ACTIONS = [['undo', 'Desfazer', 'clique'], ['redo', 'Refazer', 'clique'], ['toggle', 'Alternar caneta ↔ borracha', 'clique'], ['read', 'Modo leitura liga/desliga', 'clique'], ['eraser', 'Borracha enquanto segura', 'segurar'], ['lasso', 'Laço enquanto segura', 'segurar'], ['highlighter', 'Marca-texto enquanto segura', 'segurar']];
function sigLabel(sg) {
  return { 'pen:2': 'Botão lateral 1', 'pen:4': 'Botão lateral 2', 'pen:8': 'Botão extra', 'pen:16': 'Botão extra 2', 'pen:32': 'Ponta/botão borracha', 'pen:ctx': 'Clique do botão (menu)' }[sg] || (sg.startsWith('key:') ? 'Tecla ' + sg.slice(4) : sg);
}
const PenCapture = {
  active: false, cb: null,
  start(cb) {
    this.active = true; this.cb = cb;
    this.kh = (e) => { if (!this.active) return; if (e.key === 'Escape') return this.stop(); e.preventDefault(); this.got('key:' + (e.code || e.key)); };
    window.addEventListener('keydown', this.kh, true);
  },
  got(sg) { if (!this.active || !sg) return; const cb = this.cb; this.stop(); cb && cb(sg); },
  stop() { this.active = false; window.removeEventListener('keydown', this.kh, true); },
};
function penMapSection() {
  const S = Store.settings; S.penMap = S.penMap || {};
  const sec = el('div', { class: 'set-sec' }, el('h3', {}, 'Botões da caneta (Focus Pen)'),
    el('p', {}, 'Toque em "Definir" e aperte o botão da caneta que você quer usar, com a ponta perto da tela. Se nada acontecer, o Android pode estar usando esse botão para outra função: nas configurações do tablet, procure Caneta → Atalhos dos botões e desative o atalho do sistema.'));
  const list = el('div', {}); sec.append(list);
  const render = () => {
    list.innerHTML = '';
    for (const [act, name, kind] of PEN_ACTIONS) {
      const sigs = Object.entries(S.penMap).filter(([, a]) => a === act).map(([sg]) => sg);
      const row = el('div', { class: 'pen-map-row' }, el('span', { class: 'nm' }, name, el('div', { class: 'lbl-sm' }, kind === 'clique' ? 'um toque no botão' : 'segure o botão enquanto escreve')),
        ...sigs.map((sg) => el('span', { class: 'k' }, sigLabel(sg))),
        el('button', { class: 'btn', onclick: () => {
          const msg = el('p', { style: { fontSize: '16px', textAlign: 'center' } }, 'Aproxime a caneta da tela e aperte o botão agora…');
          const m = openModal({ title: 'Definir: ' + name, body: msg, buttons: [{ label: 'Cancelar', value: false }], onClose: () => PenCapture.stop() });
          PenCapture.start((sg) => { S.penMap[sg] = act; Store.saveSettings(); $('#modalRoot').lastChild && $('#modalRoot').lastChild.remove(); toast(sigLabel(sg) + ' → ' + name, 2000); render(); });
          return m;
        } }, 'Definir'),
        sigs.length ? el('button', { class: 'btn ghost', onclick: () => { for (const sg of sigs) delete S.penMap[sg]; Store.saveSettings(); render(); } }, 'Limpar') : null);
      list.append(row);
    }
  };
  render(); return sec;
}
