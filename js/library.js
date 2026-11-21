'use strict';
/* ===== Biblioteca de notas e pastas ===== */
const FOLDER_COLORS = ['#7c3aed', '#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#0891b2', '#db2777', '#92400e', '#65a30d', '#4b5563', '#0f766e', '#9333ea'];
const folderSvg = (c) => `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M6 20a8 8 0 0 1 8-8h22a6 6 0 0 1 4.6 2.2L46 20h40a8 8 0 0 1 8 8v56a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" fill="${c}"/><path d="M6 32a6 6 0 0 1 6-6h76a6 6 0 0 1 6 6v52a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8Z" fill="${c}" style="filter:brightness(1.14)"/><path d="M58 30h30" stroke="rgba(0,0,0,.45)" stroke-width="3.5" stroke-linecap="round"/></svg>`;
const Library = {
  folder: null, query: '', view: 'home', selecting: false, selected: new Set(),
  show() {
    $('#editor').classList.add('hidden'); $('#library').classList.remove('hidden'); if (typeof SplitView !== 'undefined') SplitView.visible(false); this.render(); Drive.refreshStatus();
  },
  get S() { return Store.settings; },
  children(fid) { return Store.folders.filter((f) => (f.parentId || null) === (fid || null)); },
  descendants(fid) { const out = [], walk = (id) => { for (const c of this.children(id)) { out.push(c); walk(c.id); } }; walk(fid); return out; },
  /* v0.34: estatísticas de TODAS as pastas numa passada só (antes cada pasta varria todas as notas, e a ordenação por data
     chamava isso a cada comparação: ~45% do tempo de desenhar a biblioteca). Vale até o fim da tarefa atual (microtask). */
  folderStats(f) {
    if (!this._fst) {
      const own = new Map(), sub = new Map(), latest = new Map(), byId = new Map(Store.folders.map((x) => [x.id, x]));
      for (const x of Store.folders) { if (x.parentId) sub.set(x.parentId, (sub.get(x.parentId) || 0) + 1); latest.set(x.id, x.created || 0); }
      for (const h of Object.values(Store.heads)) {
        if (!h.folderId) continue; own.set(h.folderId, (own.get(h.folderId) || 0) + 1);
        let c = byId.get(h.folderId), g = 0; while (c && g++ < 50) { if ((latest.get(c.id) || 0) < h.updated) latest.set(c.id, h.updated); c = byId.get(c.parentId); } /* a nota conta para a pasta e as de cima */
      }
      this._fst = { own, sub, latest }; queueMicrotask(() => { this._fst = null; });
    }
    const S = this._fst; return { n: (S.sub.get(f.id) || 0) + (S.own.get(f.id) || 0), latest: S.latest.get(f.id) ?? (f.created || 0) };
  },
  sortItems(list, getName, getDate) {
    const { by, dir } = this.S.libSort || { by: 'name', dir: 1 };
    return list.sort((a, b) => (by === 'name' ? getName(a).localeCompare(getName(b), 'pt-BR', { numeric: true, sensitivity: 'base' }) : getDate(b) - getDate(a)) * (by === 'name' ? dir : dir));
  },
  render() {
    try { localStorage.setItem('traco-lib-place', JSON.stringify({ folder: this.folder, view: this.view, t: Date.now() })); } catch (_) {} /* v0.29: lembra a pasta/visão sempre (o app volta para ela ao reabrir) */
    const S = this.S, q = this.query.trim();
    HomeTop.render(this.view === 'home' && !this.folder && !q); /* v0.37: data + frase do dia + Continuar + painel de estudo (no lugar do "Olá") */
    const ver = $('#libVersion'); if (ver) ver.textContent = 'Versão ' + App.version; const uv = $('#updVer'); if (uv) uv.textContent = 'v' + App.version;
    $('#library').classList.toggle('side-closed', !!S.sideClosed);
    $$('.side-item[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === this.view && !q && (this.view !== 'home' || !this.folder)));
    // pastas na barra lateral
    /* v0.33: árvore de pastas — a seta abre/fecha as subpastas (lembra em S.sideOpen; o caminho da pasta aberta já vem aberto) */
    const sf = $('#sideFolders'); sf.innerHTML = '';
    const chain = this.folder ? Store.folderChain(this.folder).map((x) => x.id).filter((x) => x !== this.folder) : [];
    if (chain.some((x) => !(S.sideOpen || []).includes(x))) { S.sideOpen = [...new Set([...(S.sideOpen || []), ...chain])]; Store.saveSettings(); } /* abriu uma subpasta: as de cima ficam abertas */
    const openSet = new Set(S.sideOpen || []);
    const walk = (pid, depth) => {
      for (const f of this.sortItems(this.children(pid), (x) => x.name, (x) => this.folderStats(x).latest)) {
        const kids = this.children(f.id), open = openSet.has(f.id);
        const arrow = kids.length ? el('span', { class: 'side-arrow' + (open ? ' open' : ''), title: open ? 'Fechar' : 'Mostrar subpastas', onclick: (e) => { e.stopPropagation(); const o = new Set(S.sideOpen || []); if (open) o.delete(f.id); else o.add(f.id); S.sideOpen = [...o]; Store.saveSettings(); this.render(); } }, iconEl('chevRight')) : el('span', { class: 'side-arrow none' });
        sf.append(el('button', { class: 'side-item side-fold' + (this.folder === f.id ? ' on' : ''), style: { paddingLeft: 8 + depth * 18 + 'px' }, onclick: () => this.openFolder(f.id) }, arrow, el('span', { class: 'fdot' + (f.subject ? ' subj' : ''), title: f.subject ? 'Matéria' : '', style: { background: f.color || FOLDER_COLORS[0] } }), el('span', { class: 'side-fname' }, f.name)));
        if (open && kids.length) walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    /* v0.33: notas recentes (as 4 últimas abertas) embaixo das pastas */
    const sr = $('#sideRecent');
    if (sr) {
      sr.innerHTML = ''; const rec = (S.recent || []).filter((id) => Store.heads[id]).slice(0, 4);
      if (rec.length) {
        sr.append(el('div', { class: 'side-sec' }, 'Notas recentes'));
        for (const id of rec) { const h = Store.heads[id]; sr.append(el('button', { class: 'side-item side-note', title: h.title, onclick: () => App.openNote(id) }, h.thumb ? el('img', { class: 'side-thumb', src: h.thumb, alt: '' }) : el('span', { class: 'side-thumb' }), el('span', { class: 'side-fname' }, h.title || 'Sem título'))); }
      }
    }
    // caminho
    const crumbs = $('#crumbs'); crumbs.innerHTML = '';
    const home = el('button', { class: 'crumb', title: 'Início', onclick: () => { this.view = 'home'; this.openFolder(null); } }); home.innerHTML = icon('home'); crumbs.append(home);
    if (q) crumbs.append(iconEl('chevRight'), el('span', { class: 'crumb cur' }, 'Busca: "' + q + '"'));
    else if (this.view === 'recent') crumbs.append(iconEl('chevRight'), el('span', { class: 'crumb cur' }, 'Recentes'));
    else if (this.view === 'marked') crumbs.append(iconEl('chevRight'), el('span', { class: 'crumb cur' }, 'Com marcadores'));
    else if (this.view === 'trash') crumbs.append(iconEl('chevRight'), el('span', { class: 'crumb cur' }, 'Lixeira'));
    else for (const f of Store.folderChain(this.folder)) { crumbs.append(iconEl('chevRight')); crumbs.append(el('button', { class: 'crumb' + (f.id === this.folder ? ' cur' : ''), onclick: () => this.openFolder(f.id) }, f.name)); }
    const so = S.libSort || { by: 'name', dir: 1 };
    $('#btnSort').innerHTML = icon(so.dir > 0 ? 'sortUp' : 'sortDown') + `<span>${so.by === 'name' ? 'Nome' : 'Data'}</span>`;
    $('#btnView').innerHTML = icon(S.libView === 'list' ? 'pages' : 'list');
    $('#btnSelect').classList.toggle('on', this.selecting);
    // itens
    const grid = $('#itemGrid'); grid.innerHTML = ''; grid.className = 'item-grid ' + (S.libView === 'list' ? 'as-list' : 'as-grid');
    const tb = $('#trashBadge'); if (tb) { const n = Store.trashCount(); tb.textContent = n || ''; }
    $('#libEmpty p').textContent = 'Nada por aqui ainda.'; $('#btnNewNote2').classList.toggle('hidden', this.view === 'trash' && !q);
    if (this.view === 'trash' && !q) { this.selecting = false; return this.renderTrash(grid); }
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
      el('div', { class: 'meta' }, el('div', { class: 'dt' }, st.latest ? fmtDate(st.latest) : ''), el('div', { class: 'nm' }, f.name), el('div', { class: 'cnt' }, f.subject ? el('span', { class: 'subj-chip' }, 'matéria') : null, st.n === 1 ? '1 item' : `${st.n} itens`)), this.selecting ? el('span', { class: 'chk-dot' }, sel ? '✓' : '') : mb);
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
    const notes = [...this.selected].filter((k) => k.startsWith('n:')), folders = [...this.selected].map((k) => k.startsWith('f:') && Store.folders.find((x) => x.id === k.slice(2))).filter(Boolean);
    let mode = 'keep';
    if (folders.length) { mode = await this.folderDeleteDialog(folders, notes.length); if (!mode) return; }
    const group = uid();
    for (const k of notes) await Store.trashNote(k.slice(2), group);
    for (const f of folders) { if (Store.folders.includes(f)) await (mode === 'all' ? this.removeFolderDeep(f, group) : this.removeFolder(f, group)); }
    this.selecting = false; this.selected.clear(); this.render(); toast('Itens movidos para a Lixeira (30 dias para restaurar)', 2500);
  },
  /* tudo o que está dentro de uma pasta (subpastas em qualquer nível e notas) */
  folderContents(f) {
    const ids = new Set([f.id]); let grew = true;
    while (grew) { grew = false; for (const x of Store.folders) if (x.parentId && ids.has(x.parentId) && !ids.has(x.id)) { ids.add(x.id); grew = true; } }
    const notes = Object.values(Store.heads).filter((h) => ids.has(h.folderId));
    return { ids, notes, subfolders: ids.size - 1 };
  },
  /* pergunta: excluir tudo ou só a pasta (conteúdo sobe um nível) → 'all' | 'keep' | false */
  folderDeleteDialog(folders, extraNotes = 0) {
    let n = 0, sub = 0; for (const f of folders) { const c = this.folderContents(f); n += c.notes.length; sub += c.subfolders; }
    const one = folders.length === 1, what = [n ? `${n} nota(s)` : null, sub ? `${sub} subpasta(s)` : null].filter(Boolean).join(' e ');
    const intro = one ? (what ? `A pasta "${folders[0].name}" tem ${what}.` : `A pasta "${folders[0].name}" está vazia.`) : (what ? `As ${folders.length} pastas têm ${what}.` : `As ${folders.length} pastas estão vazias.`);
    const body = el('div', {},
      el('p', {}, intro),
      extraNotes ? el('p', { class: 'lbl-sm' }, `As ${extraNotes} nota(s) selecionadas fora das pastas também serão excluídas.`) : null,
      el('p', { class: 'lbl-sm' }, (what ? '"Excluir tudo" leva também as notas e subpastas de dentro. "Só a pasta" mantém o conteúdo, que vai para a pasta de cima. ' : '') + 'Tudo fica na Lixeira por 30 dias e pode ser restaurado.'));
    const buttons = [{ label: 'Cancelar', value: false }];
    if (what) buttons.push({ label: 'Só a pasta', value: 'keep' }, { label: 'Excluir tudo', cls: 'danger', value: 'all' });
    else buttons.push({ label: 'Excluir', cls: 'danger', value: 'keep' });
    return openModal({ title: 'Excluir ' + (folders.length === 1 ? 'pasta' : 'pastas'), body, buttons });
  },
  async removeFolderDeep(f, group = uid()) { // pasta, subpastas e notas vão juntas para a lixeira
    const c = this.folderContents(f);
    for (const h of c.notes) await Store.trashNote(h.id, group);
    await Store.trashFolders(Store.folders.filter((x) => c.ids.has(x.id)), group); Drive.schedule();
    if (c.ids.has(this.folder)) this.folder = f.parentId || null;
  },
  /* ---------- tela da Lixeira ---------- */
  renderTrash(grid) {
    const T = Store.trash, now = Date.now(), days = (at) => Math.max(0, Math.ceil((at + Store.TRASH_DAYS * 864e5 - now) / 864e5));
    const groups = {};
    for (const [id, x] of Object.entries(T.folders)) (groups[x.group] = groups[x.group] || { folders: [], notes: [], at: x.at }).folders.push({ id, ...x });
    for (const [id, x] of Object.entries(T.notes)) (groups[x.group] = groups[x.group] || { folders: [], notes: [], at: x.at }).notes.push({ id, ...x });
    const list = Object.entries(groups).sort((a, b) => b[1].at - a[1].at);
    const bar = $('#selActions'); bar.classList.toggle('hidden', !list.length); bar.innerHTML = '';
    if (list.length) bar.append(el('span', { class: 'lbl-sm' }, `Itens excluídos ficam aqui por ${Store.TRASH_DAYS} dias e depois são apagados de vez.`), el('span', { class: 'sp' }),
      el('button', { class: 'btn danger', onclick: async () => { if (!(await confirmBox('Esvaziar lixeira', 'Apagar de vez tudo o que está na Lixeira? Não dá para desfazer (no Drive, os arquivos vão para a lixeira do Drive).', 'Esvaziar', true))) return; const n = await Store.purgeTrash(); toast(`${n} item(ns) apagados de vez`); this.render(); } }, 'Esvaziar lixeira'));
    for (const [g, it] of list) {
      const inF = new Set(it.folders.map((f) => f.id));
      const tops = it.folders.filter((f) => !inF.has(f.folder.parentId));
      const looseNotes = it.notes.filter((n) => !inF.has(n.head.folderId));
      const mk = (iconHtml, name, sub, at) => {
        const mb = el('button', { class: 'icon-btn more', title: 'Opções' }); mb.innerHTML = icon('more');
        const open = (anchor) => menu(anchor, [
          { label: 'Restaurar', icon: 'undo', run: async () => { const r = await Store.restoreTrash(g); toast(`Restaurado: ${r.notes} nota(s)` + (r.folders ? ` e ${r.folders} pasta(s)` : ''), 2000); this.render(); } },
          { label: 'Excluir de vez', icon: 'trash', danger: true, run: async () => { if (!(await confirmBox('Excluir de vez', `Apagar de vez "${name}"? Não dá para desfazer.`, 'Excluir', true))) return; await Store.purgeTrash((x) => x.group === g); this.render(); } },
        ]);
        mb.onclick = (e) => { e.stopPropagation(); open(mb); };
        return el('div', { class: 'item trash-item', onclick: (e) => open(e.currentTarget.querySelector('.more')) }, iconHtml,
          el('div', { class: 'meta' }, el('div', { class: 'dt' }, `${days(at)} dia(s) para restaurar`), el('div', { class: 'nm' }, name), el('div', { class: 'cnt' }, sub)), mb);
      };
      for (const f of tops) { const nNotes = it.notes.length, nSub = it.folders.length - 1; grid.append(mk(el('div', { class: 'ficon', html: folderSvg(f.folder.color || FOLDER_COLORS[0]) }), f.folder.name, [nNotes ? `${nNotes} nota(s)` : 'pasta vazia', nSub > 0 ? `${nSub} subpasta(s)` : null].filter(Boolean).join(' · '), f.at)); }
      for (const n of looseNotes) grid.append(mk(el('div', { class: 'nthumb' }, n.head.thumb ? el('img', { src: n.head.thumb, alt: '' }) : null), n.head.title, `${n.head.pages} pág.`, n.at));
    }
    $('#libEmpty').classList.toggle('hidden', list.length > 0);
    $('#libEmpty p').textContent = list.length ? '' : 'A Lixeira está vazia.';
  },
  /* ---- pastas ---- */
  async removeFolder(f, group = uid()) { // só a pasta: o conteúdo sobe um nível e a pasta (vazia) vai para a lixeira
    const up = f.parentId || null;
    for (const h of Object.values(Store.heads)) if (h.folderId === f.id) { const n = await Store.getNote(h.id); n.folderId = up; await Store.putNote(n); }
    for (const c of this.children(f.id)) c.parentId = up;
    await Store.trashFolders([f], group); Drive.schedule();
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
      { label: 'Nova matéria dentro', icon: 'timer', run: () => this.newFolder(f.id, true) },
      f.subject ? { label: 'Deixar de ser matéria', icon: 'timer', run: () => { this.setSubject([f], false); toast(`"${f.name}" não é mais matéria`, 1800); } } : { label: 'Marcar como matéria', icon: 'timer', run: () => { this.setSubject([f], true); toast(`"${f.name}" agora é uma matéria: o tempo de estudo das notas dela conta separado`, 2600); } },
      ...(this.children(f.id).length ? [{ label: 'Transformar as subpastas em matérias', icon: 'timer', run: async () => { const kids = this.children(f.id); if (!(await confirmBox('Subpastas viram matérias', `As ${kids.length} pastas dentro de "${f.name}" (${kids.slice(0, 5).map((k) => k.name).join(', ')}${kids.length > 5 ? '…' : ''}) passam a contar tempo de estudo separado.`, 'Transformar'))) return; this.setSubject(kids, true); toast(`${kids.length} matérias criadas`, 1800); } }] : []),
      { label: 'Mover para…', icon: 'move', run: async () => { const d = await this.folderPicker('Mover pasta', new Set([f.id, ...this.descendants(f.id).map((x) => x.id)]), f.parentId); if (d !== undefined) { f.parentId = d; await Store.saveFolders(); Drive.schedule(); this.render(); } } },
      { label: 'Grupo de predefinições…', icon: 'layers', run: async () => {
        const G = Store.settings.presetGroups; const sel = el('select', {}, el('option', { value: '' }, '(herdar da pasta de cima)'), ...G.map((g) => el('option', { value: g.id }, g.name))); sel.value = f.groupId || '';
        const ok = await openModal({ title: 'Grupo da pasta "' + f.name + '"', body: el('div', { class: 'field' }, el('label', {}, 'Cores e espessuras usadas nas notas desta pasta (e das pastas dentro dela)'), sel, el('p', { class: 'lbl-sm' }, 'Crie e edite grupos dentro de uma nota, no botão do grupo no topo da barra de predefinições.')), buttons: [{ label: 'Cancelar', value: false }, { label: 'Salvar', cls: 'primary', value: true }] });
        if (ok) { if (sel.value) f.groupId = sel.value; else delete f.groupId; await Store.saveFolders(); toast('Grupo definido para a pasta'); }
      } },
      '-',
      { label: 'Excluir pasta', icon: 'trash', danger: true, run: async () => {
        const mode = await this.folderDeleteDialog([f]); if (!mode) return;
        await (mode === 'all' ? this.removeFolderDeep(f) : this.removeFolder(f)); this.render(); toast(mode === 'all' ? 'Pasta e conteúdo excluídos' : 'Pasta excluída', 1500);
      } },
    ]);
  },
  noteMenu(anchor, h) {
    menu(anchor, [
      { label: 'Renomear', icon: 'pen', run: async () => { const t = await askText('Renomear nota', h.title); if (t) { const n = await Store.getNote(h.id); n.title = t; n.updated = Date.now(); await Store.putNote(n); this.render(); } } },
      { label: 'Abrir ao lado da última nota', icon: 'sidebar', run: () => SplitView.openFromLibrary(h.id) },
      { label: QuickSwitch.isPinned(h.id) ? 'Desafixar de Alternar rapidamente' : 'Fixar em Alternar rapidamente', icon: 'layers', run: () => QuickSwitch.pin(h.id) },
      { label: 'Mover para…', icon: 'folder', run: () => this.moveDialog(h) },
      { label: 'Duplicar', icon: 'copy', run: async () => { const n = await Store.getNote(h.id); const c = clone(n); c.id = uid(); c.title = n.title + ' (cópia)'; c.created = c.updated = Date.now(); await Store.putNote(c); await Store.setThumb(c.id, h.thumb); this.render(); } },
      { label: 'Exportar…', icon: 'download', run: async () => ExportPanel.open(await Store.getNote(h.id)) },
      { label: 'Compartilhar PDF…', icon: 'external', run: async () => ExportPanel.open(await Store.getNote(h.id), { share: true }) },
      { label: 'Abrir no Google Drive', icon: 'external', run: () => Drive.openInDrive(h.id) },
      '-',
      { label: 'Excluir', icon: 'trash', danger: true, run: async () => { await Store.trashNote(h.id); this.render(); toast(`"${h.title}" foi para a Lixeira (30 dias para restaurar)`, 2500); } },
    ]);
  },
  async moveDialog(h) {
    const d = await this.folderPicker('Mover nota', new Set(), h.folderId); if (d === undefined) return;
    const n = await Store.getNote(h.id); n.folderId = d; await Store.putNote(n); this.render(); toast('Nota movida');
  },
  async newFolder(parentId = this.folder, subject = false) {
    const n = await askText(subject ? 'Nova matéria' : 'Nova pasta', '', subject ? 'Nome da matéria (ex.: Direito Penal I) — o tempo de estudo das notas dela soma separado' : 'Nome da pasta (ex.: Direito Penal I)'); if (!n) return;
    const color = FOLDER_COLORS[Store.folders.length % FOLDER_COLORS.length];
    Store.folders.push({ id: uid(), name: n, parentId: parentId || null, color, created: Date.now(), ...(subject ? { subject: true } : {}) }); await Store.saveFolders(); Drive.schedule(); this.render();
  },
  /* v0.35: pasta-matéria (f.subject) — o tempo de estudo das notas dela e das subpastas soma para ela */
  async setSubject(list, on) { for (const f of list) { if (on) f.subject = true; else delete f.subject; } await Store.saveFolders(); Drive.schedule(); this.render(); },
  fabMenu(anchor) {
    menu(anchor, [
      { label: 'Nova nota', icon: 'pen', run: async () => { const n = await newNoteDialog(this.folder); if (n) App.openNote(n.id); } },
      { label: 'Nova pasta', icon: 'folder', run: () => this.newFolder() },
      { label: 'Nova matéria', icon: 'timer', run: () => this.newFolder(this.folder, true) },
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
      { label: 'Corrigir imagens recortadas (notas já importadas do Notewise)', icon: 'crop', run: () => this.fixNotewiseCrops() },
      { label: 'Cópia de segurança do Traço (.json)', icon: 'download', run: () => importAll() },
    ]);
  },
  async importNotewise() {
    const f = await pickFile(''); if (!f) return;
    toast('Importando do Notewise…', 20000);
    try {
      const res = await importNotewiseFile(f, (i, t, n) => toast(`Importando ${i} de ${t}: ${n.split('/').pop()}`, 20000));
      const ok = res.filter((r) => r.note), bad = res.filter((r) => r.error);
      const st = ok.reduce((a, r) => { for (const k in r.stats) a[k] = (a[k] || 0) + r.stats[k]; return a; }, {});
      this.render(); toast('', 1);
      const body = el('div', {}, el('p', {}, `${ok.length} nota(s) importada(s): ${st.pages || 0} páginas (${st.pdfPages || 0} de PDF), ${st.strokes || 0} traços, ${st.highlights || 0} marca-textos, ${st.shapes || 0} formas, ${st.texts || 0} textos, ${st.tables || 0} tabelas e ${st.images || 0} imagens.`),
        st.skipped ? el('p', { class: 'lbl-sm' }, `${st.skipped} item(ns) de tipos que o Traço ainda não reconhece foram ignorados. Mande um exemplo para eu adicionar.`) : null,
        bad.length ? el('p', { style: { color: 'var(--danger)' } }, 'Com erro: ' + bad.map((b) => b.error).join('; ')) : null);
      const go = await openModal({ title: 'Importação concluída', body, buttons: [{ label: 'Fechar', value: false }, ok.length === 1 ? { label: 'Abrir nota', cls: 'primary', value: true } : null].filter(Boolean) });
      if (go && ok[0]) App.openNote(ok[0].note.id);
    } catch (e) { console.error(e); toast('Não foi possível importar: ' + e.message, 6000); }
  },
  async fixNotewiseCrops() {
    const ok = await openModal({ title: 'Corrigir imagens recortadas', body: el('div', {},
      el('p', {}, 'Notas importadas antes da versão 0.18 mostram as imagens recortadas no Notewise inteiras (e maiores).'),
      el('p', {}, 'Escolha de novo o mesmo arquivo .notewise ou .zip que você importou: o Traço acha as notas com o mesmo título e aplica só o recorte das imagens — sem duplicar notas e sem mexer na sua escrita.'),
      el('p', { class: 'lbl-sm' }, 'Imagens que você já moveu, redimensionou ou recortou ficam como estão.')),
      buttons: [{ label: 'Cancelar', value: false }, { label: 'Escolher arquivo', cls: 'primary', value: true }] });
    if (!ok) return;
    const f = await pickFile(''); if (!f) return;
    toast('Lendo o arquivo do Notewise…', 20000);
    try {
      const r = await fixNotewiseCrops(f, (i, t, n) => toast(`Conferindo ${i} de ${t}: ${n.split('/').pop()}`, 20000));
      this.render(); toast('', 1);
      const body = el('div', {},
        el('p', {}, r.cropped ? `${r.images} de ${r.cropped} imagem(ns) recortada(s) corrigida(s) em ${r.notes} nota(s).` : 'Nenhuma imagem recortada nesse arquivo.'),
        r.already ? el('p', { class: 'lbl-sm' }, `${r.already} já estavam certas.`) : null,
        r.missing ? el('p', { class: 'lbl-sm' }, `${r.missing} não foram corrigidas (imagem já movida/alterada${r.noNote.length ? ', ou nota não encontrada: ' + r.noNote.slice(0, 6).join(', ') + (r.noNote.length > 6 ? '…' : '') : ''}). Nesses casos você pode recortar pelo laço → Recortar imagem.`) : null);
      await openModal({ title: 'Recortes corrigidos', body, buttons: [{ label: 'OK', cls: 'primary' }] });
    } catch (e) { console.error(e); toast('Não foi possível corrigir: ' + e.message, 6000); }
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
    el('div', { class: 'field' }, el('label', {}, 'Qualidade do PDF no Drive (mais alta = arquivo maior e mais memória para gerar)'), (() => { const s = el('select', {}, el('option', { value: '150' }, 'Normal · 150 dpi'), el('option', { value: '200' }, 'Alta · 200 dpi (padrão)'), el('option', { value: '300' }, 'Máxima · 300 dpi')); s.value = String(D.pdfDpi || 200); s.addEventListener('change', () => { D.pdfDpi = +s.value; D.pdfCrash = {}; Store.saveSettings(); }); return s; })()),
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
  /* v0.51: a seção "Você" (S.userName) saiu — o nome não aparece mais desde a v0.37 */
  // --- Escrita
  const chk = (label, key, after) => UI.check(label, S[key], (v) => { S[key] = v; Store.saveSettings(); after && after(v); });
  const th = el('select', {}, el('option', { value: 'auto' }, 'Automático'), el('option', { value: 'light' }, 'Claro'), el('option', { value: 'dark' }, 'Escuro')); th.value = S.theme || 'auto'; th.addEventListener('change', () => { S.theme = th.value; Store.saveSettings(); App.applyTheme(); });
  const barSl = UI.slider('Tamanho', 55, 130, 1, Math.round(barScale() * 100), (v) => { S.barScale = v / 100; Store.saveSettings(); applyBarSize(); }, (v) => v + '%');
  const bar = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, UI.seg([['normal', 'Normal'], ['compact', 'Compacta'], ['mini', 'Bem compacta']], S.barSize || 'compact', (v) => { S.barSize = v; S.barScale = BAR_PRESETS[v]; Store.saveSettings(); applyBarSize(); const r = barSl.querySelector('input'); r.value = Math.round(S.barScale * 100); r.dispatchEvent(new Event('input')); }), barSl);
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Aparência e barras'),
    el('div', { class: 'field' }, el('label', {}, 'Tamanho das barras do editor (mais estreitas deixam mais espaço para escrever)'), bar),
    UI.check('Esconder as barras do topo enquanto escrevo com a caneta', S.hideWhileWriting !== false, (v) => { S.hideWhileWriting = v; Store.saveSettings(); }),
    UI.slider('Barras voltam depois de parar de escrever', 1, 15, 0.5, +S.writeHideSec || 2.5, (v) => { S.writeHideSec = v; Store.saveSettings(); }, (v) => String(v).replace('.', ',') + ' s'),
    el('p', { class: 'muted' }, 'Tela cheia: toque duplo com o dedo numa área vazia da nota. Para trazer as barras de volta, toque no topo da tela.'),
    el('div', { class: 'field' }, el('label', {}, 'Tema do app'), th)));
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Ajustes automáticos'),
    el('p', {}, 'Ao mover, redimensionar ou girar formas, textos, post-its, imagens e tabelas, o app ajuda a alinhar e mostra uma linha-guia rosa.'),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      UI.check('Diretrizes da página: margens, centro e pauta/grade do modelo', S.snapPage !== false, (v) => { S.snapPage = v; Store.saveSettings(); }),
      UI.check('Outros objetos: bordas e centros dos objetos próximos', S.snapObjects !== false, (v) => { S.snapObjects = v; Store.saveSettings(); }),
      UI.check('Ângulo: girar grudando a cada 15° (0°, 45°, 90°…)', S.snapAngle !== false, (v) => { S.snapAngle = v; Store.saveSettings(); }),
      UI.check('Proporção: ao redimensionar, grudar em 1:1 ou na proporção original', S.snapRatio !== false, (v) => { S.snapRatio = v; Store.saveSettings(); }),
      UI.check('Linhas retas da caneta e do marca-texto grudam a cada 15°', S.angleSnap !== false, (v) => { S.angleSnap = v; Store.saveSettings(); }),
      UI.check('Editar pontos das formas: o vértice gruda quando o lado fica a 0°, 45° ou 90° (um 2º dedo na tela solta)', S.vertexSnap !== false, (v) => { S.vertexSnap = v; Store.saveSettings(); }))));
  const zApply = () => { if (Editor.note) { Editor.clampCam(); Editor.requestRender(); } };
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Zoom'),
    el('p', {}, 'Até onde o movimento de pinça pode afastar e aproximar a folha. O menu de zoom (porcentagem no canto) segue estes limites.'),
    UI.slider('Zoom mínimo (afastar)', 10, 100, 5, +S.zoomMin || 20, (v) => { S.zoomMin = v; Store.saveSettings(); zApply(); }, (v) => v + '%'),
    (() => { /* v0.23.3 */
      const sel = el('select', { onchange: () => { S.zoomQuality = sel.value; Store.saveSettings(); if (typeof Editor !== 'undefined' && Editor.evictTiles && Editor.tiles) Editor.evictTiles(); } }, el('option', { value: 'high' }, 'Alta — a página atual fica nítida ao tirar o zoom (usa mais memória)'), el('option', { value: 'eco' }, 'Econômica — menos memória (as bordas podem desfocar por um instante)'));
      sel.value = S.zoomQuality === 'high' ? 'high' : 'eco';
      return el('div', { class: 'field' }, el('label', {}, 'Qualidade ao tirar o zoom'), sel);
    })(),
    /* v0.25.1: a 'Trava de rolagem (%)' saiu — as margens das barras definem quando a rolagem lateral trava (clampCam) */
    UI.slider('Zoom máximo (aproximar)', 200, 2000, 100, +S.zoomMax || 800, (v) => { S.zoomMax = v; Store.saveSettings(); zApply(); }, (v) => v + '%'),
    el('p', { class: 'muted' }, 'No modo tela infinita o mínimo padrão é 10%.')));
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Escrita e caneta'),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      chk('Ignorar a palma da mão em todo o app (toques grandes e toques enquanto a caneta escreve não fazem nada)', 'palmGuard'),
      (() => { /* v0.28: calibrar o tamanho da palma */ const info = el('small', { class: 'muted' }, ''); const upd = () => { info.textContent = Palm.last ? `Seu último toque: ${Palm.last} px` : 'Toque na tela para ver o tamanho do seu toque'; };
        upd(); const iv = setInterval(() => { if (!info.isConnected) return clearInterval(iv); upd(); }, 500);
        return el('div', {}, UI.slider('Toque considerado palma a partir de', 20, 90, 2, +S.palmSize || 40, (v) => { S.palmSize = v; Store.saveSettings(); }, (v) => v + ' px'), info); })(),
      chk('Rabiscar para apagar (zigue-zague com a caneta por cima do que quer apagar)', 'scribbleErase'),
      UI.slider('Sensibilidade à pressão', 0, 1, 0.05, S.pressureSens ?? 0.6, (v) => { S.pressureSens = v; S.pressure = v > 0; Store.saveSettings(); }, (v) => (v === 0 ? 'sem' : Math.round(v * 100) + '%')),
      (() => { /* v0.23: mão que escreve → onde valem os toques de 2/3 dedos (desfazer/refazer) */
        const sel = el('select', { onchange: () => { S.hand = sel.value; Store.saveSettings(); } }, el('option', { value: 'right' }, 'Destro (vale só na metade esquerda)'), el('option', { value: 'left' }, 'Canhoto (vale só na metade direita)'), el('option', { value: 'none' }, 'Tela toda'));
        sel.value = S.hand || 'right';
        return el('div', { class: 'field' }, el('label', {}, 'Mão que escreve — toques de 2 e 3 dedos (desfazer/refazer) do lado da palma são ignorados'), sel);
      })(),
      UI.slider('Melhorar escrita automático (ao levantar a caneta)', 0, 10, 1, autoBeautifyLevel(), (v) => { S.autoBeautify = v; Store.saveSettings(); }, (v) => (v === 0 ? 'desligado' : String(v))),
      el('p', { class: 'muted' }, 'Arredonda as curvas e tira o tremido sem apagar os cantos das letras. Para arrumar algo já escrito: laço → botão ✨ "Melhorar escrita" (também iguala o tamanho e a altura das palavras).'),
      el('div', { class: 'field' }, el('button', { class: 'btn', onclick: () => caligraphyNotebook() }, '✍ Caderno de caligrafia…'), el('p', { class: 'muted' }, 'Escreva cada letra do seu jeito mais bonito; o ✨ "Melhorar escrita" do laço aproxima as suas letras destas.')),
      UI.check('Modo de baixa latência para a caneta (a tinta aparece mais rápido; reabra o app depois de mudar)', S.lowLatency === true, (v) => { S.lowLatency = v; Store.saveSettings(); toast('Reabra o app para aplicar'); }),
      )));
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Formas ao segurar'), el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    chk('Reconhecer formas ao segurar a caneta parada no fim do traço', 'shapeHold'),
    chk('Conectar as formas do segurar às outras (pontas e colchetes na mesma vertical)', 'shapeConnect'))));
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
  // --- Diagnóstico
  const errBox = el('div', { class: 'errlog' });
  const renderErr = () => {
    const errs = readErrors(); errBox.innerHTML = '';
    if (!errs.length) { errBox.append(el('p', {}, '✅ Nenhum erro registrado.')); return; }
    for (const x of errs.slice().reverse().slice(0, 12)) errBox.append(el('div', { class: 'errrow' }, el('b', {}, new Date(x.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + (x.n > 1 ? ` (${x.n}×)` : '') + ' · ' + (x.where || '')), el('span', {}, x.msg)));
  };
  renderErr();
  const diagText = () => JSON.stringify({ versao: App.version, ua: navigator.userAgent, memoria: navigator.deviceMemory, tela: [innerWidth, innerHeight, devicePixelRatio], baixaLatencia: !!S.lowLatency, blocos: Editor.tiles ? Editor.tiles.size : 0, erros: readErrors() }, null, 1);
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Diagnóstico'),
    el('p', {}, 'Se o app travar ou as barras sumirem, os erros ficam registrados aqui. Copie e me mande para eu achar a causa.'),
    S.lowLatency ? el('p', { style: { color: 'var(--danger)' } }, 'O modo de baixa latência está ligado (desde a v0.15 ele só age enquanto a caneta escreve).') : null,
    errBox,
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
      B('Copiar relatório', '', async () => { try { await navigator.clipboard.writeText(diagText()); toast('Relatório copiado'); } catch (_) { openModal({ title: 'Relatório', wide: true, body: el('textarea', { style: { width: '100%', height: '300px' } }, diagText()), buttons: [{ label: 'Fechar', cls: 'primary' }] }); } }),
      B('Limpar', 'ghost', () => { localStorage.removeItem(ERRLOG_KEY); renderErr(); }))));
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Sobre'), el('p', {}, `Traço Notas · versão ${App.version}`), el('p', {}, 'Caderno digital feito sob medida: escrita com caneta, PDFs, tabelas, importação do Notewise e backup no seu Google Drive. As notas ficam guardadas no aparelho.')));
  /* v0.51: 7 grupos em abas que expandem; o resumo aparece com a aba fechada */
  const old = new Map([...body.querySelectorAll(':scope > .set-sec')].map((x) => [x.querySelector('h3').textContent, x]));
  const grp = (title, parts, sum) => {
    const g = el('div', { class: 'set-sec' }, el('h3', {}, title)); g._sum = sum;
    for (const [t, sub] of parts) { const x = old.get(t); if (!x) continue; x.querySelector(':scope > h3').remove(); if (sub) g.append(el('h4', { class: 'set-sub' }, sub)); g.append(...x.childNodes); }
    return g;
  };
  const SNAPS = ['snapPage', 'snapObjects', 'snapAngle', 'snapRatio', 'angleSnap', 'vertexSnap'];
  const groups = [
    grp('Caneta e escrita', [['Escrita e caneta']], () => `Palma ${S.palmGuard ? (+S.palmSize || 40) + ' px' : 'desligada'} · pressão ${S.pressureSens === 0 ? 'sem' : Math.round((S.pressureSens ?? 0.6) * 100) + '%'} · melhorar escrita ${autoBeautifyLevel() || 'desligado'}`),
    grp('Formas e alinhamento', [['Formas ao segurar', 'Segurar a caneta no fim do traço'], ['Ajustes automáticos', 'Guias ao mover, redimensionar e girar']], () => `Formas ao segurar ${S.shapeHold !== false ? 'ligadas' : 'desligadas'} · ${SNAPS.filter((k) => S[k] !== false).length} de ${SNAPS.length} guias`),
    grp('Botões da caneta', [['Botões da caneta (Focus Pen)']], () => { const n = Object.keys(S.penMap || {}).length, d = typeof PEN_DOUBLE_ACTIONS !== 'undefined' && PEN_DOUBLE_ACTIONS.find(([k]) => k === (S.penDouble || 'lassoToggle')); return `${n ? n + (n > 1 ? ' botões configurados' : ' botão configurado') : 'nenhum botão configurado'} · toque duplo: ${S.penTriple === false || S.penDouble === 'none' ? 'desligado' : d ? d[1] : 'padrão'}`; }),
    grp('Tela e zoom', [['Aparência e barras', 'Aparência e barras'], ['Zoom', 'Zoom']], () => `Barras ${{ normal: 'normais', compact: 'compactas', mini: 'bem compactas' }[S.barSize || 'compact'] || 'compactas'} · tema ${{ auto: 'automático', light: 'claro', dark: 'escuro' }[S.theme || 'auto']} · zoom ${+S.zoomMin || 20}–${+S.zoomMax || 800}%`),
    grp('Leitura da escrita (OCR)', [['Leitura da escrita à mão (OCR)']], () => `Leitura automática ${S.ocr.enabled !== false ? 'ligada' : 'desligada'} · ${ocrLang.selectedOptions[0] ? ocrLang.selectedOptions[0].textContent : ''}`),
    grp('Backup e dados', [['Backup automático no Google Drive', 'Google Drive'], ['Cópia local', 'Cópia local'], ['Modelo padrão para novas notas', 'Modelo padrão para novas notas']], () => !Drive.configured() ? 'Drive desligado' : (Drive.hasAuth() ? 'Drive conectado' : 'Drive precisa conectar') + (D.lastSync ? ' · último backup ' + new Date(D.lastSync).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '')),
    grp('Avançado', [['Ferramentas próprias (plugins)', 'Ferramentas próprias (plugins)'], ['Diagnóstico', 'Diagnóstico'], ['Sobre', 'Sobre']], () => { const n = readErrors().length; return `${S.plugins.length} plugin${S.plugins.length === 1 ? '' : 's'} · ${n ? n + ' erro' + (n > 1 ? 's' : '') + ' registrado' + (n > 1 ? 's' : '') : 'sem erros'} · versão ${App.version}`; }),
  ];
  body.innerHTML = ''; body.append(...groups);
  return settingsPage(body, focus, () => { saveDrive(); applyBarSize(); if (Editor.note) { UI.buildToolbar(); UI.renderOptions(); Editor.requestRender(); } });
}
const SET_ORDER = [['Caneta e escrita', 'pen'], ['Formas e alinhamento', 'fit'], ['Botões da caneta', 'hand'], ['Tela e zoom', 'palette'], ['Leitura da escrita (OCR)', 'ocr'], ['Backup e dados', 'cloud'], ['Avançado', 'tune']];
function settingsPage(body, focus, onClose) {
  return new Promise((resolve) => {
    const secs = [...body.querySelectorAll(':scope > .set-sec')];
    const byTitle = new Map(secs.map((x) => [x.querySelector('h3').textContent, x]));
    const content = el('div', { class: 'sp-content' }), nav = el('nav', { class: 'sp-nav' });
    const ordered = SET_ORDER.filter(([t]) => byTitle.has(t)).concat(secs.map((x) => [x.querySelector('h3').textContent, 'settings']).filter(([t]) => !SET_ORDER.some(([o]) => o === t)));
    for (const [t, ic] of ordered) {
      const sec = byTitle.get(t); sec.id = 'sec-' + uid(); const h = sec.querySelector('h3'); h.prepend(iconEl(ic)); content.append(sec);
      /* v0.51: aba que expande — cabeçalho (título + resumo + seta) e corpo; só uma aberta por vez */
      const sum = el('span', { class: 'set-sum' }), chev = iconEl('chevRight'); chev.classList.add('set-chev');
      const head = el('button', { class: 'set-head', type: 'button', onclick: () => toggle(sec) }, h, sum, chev);
      const bodyW = el('div', { class: 'set-body' }, ...[...sec.childNodes]); sec.append(head, bodyW); sec._sumEl = sum;
      const b = el('button', { class: 'sp-item', onclick: () => toggle(sec, true) }, iconEl(ic), el('span', {}, t.replace(' (Focus Pen)', '').replace(' (OCR)', '').replace('Backup automático no ', '').replace(' para novas notas', '').replace(' (plugins)', '')));
      b.dataset.sec = sec.id; nav.append(b);
    }
    const sums = () => { for (const x of secs) if (x._sumEl) { let t = ''; try { t = x._sum ? x._sum() : ''; } catch (_) {} x._sumEl.textContent = t; } };
    const mark = () => $$('.sp-item', nav).forEach((b) => b.classList.toggle('on', !!document.getElementById(b.dataset.sec)?.classList.contains('open')));
    function toggle(sec, force) {
      const open = force || !sec.classList.contains('open');
      if (content.classList.contains('searching')) { search.value = ''; search.dispatchEvent(new Event('input')); }
      for (const x of secs) x.classList.toggle('open', open && x === sec);
      sums(); mark();
      if (open) { const r = sec.getBoundingClientRect(), c = content.getBoundingClientRect(); if (r.top < c.top || r.bottom > c.bottom) content.scrollTo({ top: Math.max(0, content.scrollTop + r.top - c.top - 12) }); }
    }
    const close = () => { page.remove(); onClose && onClose(); resolve(); };
    const back = el('button', { class: 'cbtn round', title: 'Voltar', onclick: close }); back.innerHTML = icon('arrowLeft');
    const ITEM = '.chk,.field,.grp,.sl-row,.slider-row,.pen-map-row,.plugin-row,.seg,p,button,label,select,input';
    const spItems = (node) => { const out = []; for (const c of node.children) { if (c.tagName === 'H3' || c.tagName === 'H4') continue; if (!c.matches(ITEM) && c.children.length > 1) out.push(...spItems(c)); else out.push(c); } return out; }; /* opções "folha" (desce nos blocos que só agrupam) */
    /* v0.36: busca nas configurações — mostra só os itens (e seções) com o texto procurado, sem acento/maiúscula */
    const nrm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const empty = el('p', { class: 'sp-empty hidden' }, 'Nada encontrado nas configurações.');
    const search = el('input', { class: 'sp-search', type: 'search', placeholder: 'Buscar uma opção…', oninput: () => {
      const q = nrm(search.value.trim()); let any = false;
      for (const sec of secs) {
        const kids = spItems(sec.querySelector('.set-body') || sec), titleHit = q && nrm(sec.querySelector('h3').textContent).includes(q); let hits = 0;
        for (const c of kids) { const ok = !q || titleHit || nrm(c.textContent).includes(q) || [...c.querySelectorAll('option')].some((o) => nrm(o.textContent).includes(q)); c.classList.toggle('sp-hide', !ok); if (ok) hits++; }
        sec.classList.toggle('sp-hide', !!q && !hits); if (hits) any = true;
        const b = nav.querySelector(`[data-sec="${sec.id}"]`); if (b) b.classList.toggle('sp-dim', !!q && !hits);
      }
      empty.classList.toggle('hidden', !q || any); content.classList.toggle('searching', !!q); content.scrollTop = 0; /* v0.51: buscando, as abas com resultado ficam abertas */
    } });
    const page = el('div', { class: 'settings-page' },
      el('header', { class: 'sp-head' }, back, el('h1', {}, 'Configurações'), el('span', { class: 'sp-ver' }, 'v' + App.version)),
      el('div', { class: 'sp-body' }, el('div', { class: 'sp-side' }, search, nav), el('div', { class: 'sp-main' }, empty, content)));
    document.body.append(page);
    setTimeout(() => {
      sums();
      if (focus === 'drive') { const d = secs.find((x) => x.querySelector('h3').textContent.includes('Backup')); if (d) toggle(d, true); }
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
  const notes = []; for (const id of await DB.keys('notes')) { const n = await Store.getNote(id); if (n) notes.push(n); } const blobs = {};
  for (const k of await DB.keys('blobs')) { const b = await DB.get('blobs', k); if (b) blobs[k] = await blobToDataURL(b); }
  const data = { app: 'traco-notas', v: 1, exported: Date.now(), folders: Store.folders, notes, blobs, thumbs: Object.fromEntries(Object.values(Store.heads).map((h) => [h.id, h.thumb])) };
  downloadBlob(new Blob([JSON.stringify(data, ptsJSON)], { type: 'application/json' }), `traco-backup-${new Date().toISOString().slice(0, 10)}.json`);
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
const PEN_ACTIONS = [['hyphen', 'Atalho rápido: hífen, tópico ou número romano (aperte, escolha e toque no quadrado)', 'clique'], ['hyphenDirect', 'Hífen direto no quadrado (aperte e toque, sem telinha)', 'clique'], ['gotoPage', 'Ir para página (teclado numérico)', 'clique'], ['undo', 'Desfazer', 'clique'], ['redo', 'Refazer', 'clique'], ['toggle', 'Alternar caneta ↔ borracha', 'clique'], ['read', 'Modo leitura liga/desliga', 'clique'], ['eraser', 'Borracha enquanto segura', 'segurar'], ['lasso', 'Laço enquanto segura', 'segurar'], ['highlighter', 'Marca-texto enquanto segura', 'segurar']];
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
  /* v0.23: toque duplo com a ponta da caneta (os dois toques não deixam marca) */
  const dsel = el('select', { onchange: () => { S.penDouble = dsel.value; Store.saveSettings(); toast('Toque duplo: ' + dsel.selectedOptions[0].textContent, 1500); } }, ...PEN_DOUBLE_ACTIONS.map(([k, n]) => el('option', { value: k }, n)));
  dsel.value = penDoubleAction();
  sec.append(el('div', { class: 'pen-map-row' }, el('span', { class: 'nm' }, 'Toque duplo com a ponta', el('div', { class: 'lbl-sm' }, 'dois toques rápidos no mesmo lugar, com qualquer ferramenta (não deixam marca)')), dsel));
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
  render();
  /* v0.51: tamanhos dos atalhos rápidos (hífen, romano, bolinha…) ficam só na telinha do atalho → Ajustes */
  sec.append(el('p', { class: 'muted', style: { marginTop: '10px' } }, 'Tamanho e posição dos atalhos rápidos (hífen, tópico, números, colchete): na telinha do atalho → Ajustes.'));
  return sec;
}

/* v0.35: matéria de uma nota = a pasta-matéria mais próxima acima dela ('_' = cronômetro fora de uma nota) */
function subjectOfNote(id) {
  if (id === '_') return { key: '_', name: 'Fora das notas', color: 'var(--muted)' };
  if (id.startsWith('f:')) { /* v0.42.1: ajuste manual do relatório gravado direto na matéria */ const ch = Store.folderChain(id.slice(2)) || []; for (let i = ch.length - 1; i >= 0; i--) if (ch[i].subject) return { key: ch[i].id, name: ch[i].name, color: ch[i].color || FOLDER_COLORS[0] }; return { key: '~', name: 'Sem matéria', color: 'var(--muted)' }; }
  const h = Store.heads[id]; if (!h) return { key: '?', name: 'Notas apagadas', color: 'var(--line)' };
  const ch = h.folderId ? Store.folderChain(h.folderId) : [];
  for (let i = ch.length - 1; i >= 0; i--) if (ch[i].subject) return { key: ch[i].id, name: ch[i].name, color: ch[i].color || FOLDER_COLORS[0] };
  return { key: '~', name: 'Sem matéria', color: 'var(--muted)' };
}

/* ===== v0.37 — topo autoral da tela inicial =====
   Data de hoje (título) + frase curta do dia (muda à meia-noite, índice pelo dia do ano). Na tela inicial (raiz, sem busca):
   cartão "Continuar" (última nota de S.recent, miniatura da página onde parou — meta 'views'[id].page — via pageThumb) e painel
   de estudo (anel hoje/meta, sequência de dias na meta, 3 matérias da semana; toque abre StudyReport). Atualiza a cada 60 s. */
const HOME_QUOTES = [
  'Um pouco todo dia vence muito de vez em quando.', 'Escreva para lembrar; revise para entender.', 'Constância é mais forte que intensidade.',
  'O caderno de hoje é a prova de amanhã.', 'Comece pequeno, mas comece agora.', 'Revisar também é estudar.',
  'Uma página bem feita vale mais que dez corridas.', 'Dúvida anotada é dúvida meio resolvida.', 'Foco em uma coisa de cada vez.',
  'O progresso mora nos dias comuns.', 'Entender devagar ainda é entender.', 'Cada traço conta.',
  'Feito é melhor que perfeito — e depois melhora.', 'Pausa também faz parte do estudo.', 'Explique com as suas palavras: aí você aprendeu.',
  'Hoje: menos aba aberta, mais página escrita.', 'Quem revisa não esquece.', 'Disciplina é lembrar o que você quer.',
  'Errar no caderno é barato. Errar na prova é caro.', 'Um Pomodoro de cada vez.', 'Organize a ideia antes de decorar.',
  'Resumo bom cabe numa página.', 'Faça perguntas ao conteúdo.', 'O difícil de hoje é o básico de amanhã.',
  'Sente, abra o caderno, o resto vem.', 'Estudar cansado rende menos: descanse e volte.', 'Menos marca-texto, mais explicação.',
  'Seu eu do futuro agradece esta revisão.', 'Uma matéria por vez, todas no seu tempo.', 'Conhecimento se constrói traço a traço.',
];
const HomeTop = {
  _t: 0,
  render(full) {
    const now = new Date(), h1 = $('#hello'), q = $('#heroQuote'), box = $('#homeCards'); if (!h1) return;
    const d = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    h1.textContent = d.charAt(0).toUpperCase() + d.slice(1);
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5); q.textContent = HOME_QUOTES[doy % HOME_QUOTES.length];
    box.classList.toggle('hidden', !full); if (!full) return;
    box.innerHTML = ''; try { const c = this.cont(); if (c) box.append(c); const st = this.study(); if (st) box.append(st); } catch (e) { logError(e, 'tela inicial'); }
    if (!box.children.length) box.classList.add('hidden');
    clearInterval(this._t); this._t = setInterval(() => { if ($('#library') && !$('#library').classList.contains('hidden') && document.visibilityState === 'visible' && !$('#homeCards').classList.contains('hidden')) { const s2 = this.study(), old = $('#homeCards .hc-study'); if (s2 && old) old.replaceWith(s2); } }, 60000);
  },
  cont() {
    const id = (Store.settings.recent || []).find((x) => Store.heads[x]); if (!id) return null;
    const h = Store.heads[id], sub = typeof subjectOfNote === 'function' ? subjectOfNote(id) : null;
    const img = el('img', { alt: '' }); if (h.thumb) img.src = h.thumb;
    const pg = el('span', { class: 'hc-pg' }, h.pages + (h.pages === 1 ? ' página' : ' páginas'));
    const card = el('button', { class: 'hc-card hc-cont', onclick: () => App.openNote(id) },
      el('div', { class: 'hc-th' }, img),
      el('div', { class: 'hc-info' }, el('small', {}, 'Continuar de onde parei'), el('b', {}, h.title || 'Sem título'),
        el('span', { class: 'hc-meta' }, sub && sub.key !== '?' && sub.name !== 'Sem matéria' ? el('i', { class: 'hc-dot', style: { background: sub.color || 'var(--accent)' } }) : null, sub && sub.name !== 'Sem matéria' ? sub.name + ' · ' : '', pg),
        el('span', { class: 'hc-go' }, 'Continuar →')));
    (async () => { /* miniatura da página onde parou */
      try {
        const views = (await DB.get('meta', 'views')) || {}, v = views[id]; if (!v || !(v.page > 0)) return;
        const n = await Store.getNote(id), p = n && n.pages[v.page]; if (!p) return;
        pg.textContent = `página ${v.page + 1} de ${n.pages.length}`; img.src = await pageThumb(n, p);
      } catch (_) {}
    })();
    return card;
  },
  study() {
    if (typeof StudyReport === 'undefined' || typeof StudyTimer === 'undefined') return null;
    if (!StudyTimer.st) { clearTimeout(this._w); this._w = setTimeout(() => { const s2 = this.study(), old = $('#homeCards .hc-study'); if (s2 && old) old.replaceWith(s2); }, 1200); return el('div', { class: 'hc-card hc-study' }); } /* cronômetro ainda carregando */
    const R = StudyReport, T = StudyTimer, map = R.dayMap(), goal = R.goalMs(), day = (back) => { const x = new Date(); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - back); return T.dayKey(x.getTime()); };
    const today = R.sum(map[day(0)]), frac = goal ? Math.min(1, today / goal) : today > 0 ? 1 : 0;
    const streak = R.streaks(map).cur; /* v0.50: meta de dias úteis/fim de semana e dias de pausa */
    const subj = new Map(); for (let i = 0; i < 7; i++) for (const [nid, ms] of Object.entries(map[day(i)] || {})) { const s = subjectOfNote(nid), o = subj.get(s.key) || { name: s.name, color: s.color, ms: 0 }; o.ms += ms; subj.set(s.key, o); }
    const top = [...subj.values()].sort((a, b) => b.ms - a.ms).slice(0, 3), mx = top.length ? top[0].ms : 1;
    const r = 30, C = 2 * Math.PI * r, ring = el('div', { class: 'hc-ring' }); ring.innerHTML = `<svg viewBox="0 0 72 72" width="72" height="72"><circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="8"/><circle cx="36" cy="36" r="${r}" fill="none" stroke="${frac >= 1 ? 'var(--ok, #16a34a)' : 'var(--accent)'}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 36 36)"/></svg>`;
    ring.append(el('b', {}, Math.round(frac * 100) + '%'));
    return el('button', { class: 'hc-card hc-study', title: 'Abrir relatório de estudo', onclick: () => R.open() }, ring,
      el('div', { class: 'hc-info' }, el('small', {}, 'Estudo de hoje'), el('b', {}, goal ? `${T.fmtDur(today)} de ${T.fmtDur(goal)}` : `${T.fmtDur(today)} · descanso`),
        el('span', { class: 'hc-meta' }, streak ? `🔥 ${streak} ${streak === 1 ? 'dia' : 'dias'} seguidos na meta` : 'Bata a meta hoje para começar a sequência')),
      el('div', { class: 'hc-subj' }, el('small', {}, 'Esta semana'), ...(top.length ? top.map((s) => el('div', { class: 'hc-srow' }, el('span', {}, s.name), el('i', { style: { width: Math.max(6, (s.ms / mx) * 100) + '%', background: s.color || 'var(--accent)' } }), el('em', {}, T.fmtDur(s.ms)))) : [el('span', { class: 'hc-meta' }, 'Nada estudado ainda')])));
  },
};
