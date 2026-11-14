'use strict';
/* ===== Barra lateral de ferramentas (estilo Notewise): trilho, sub-trilho de predefinições e painel ===== */
const TOOLS = [
  { id: 'pen', name: 'Caneta', icon: 'pen' },
  { id: 'highlighter', name: 'Marca-texto', icon: 'highlighter' },
  { id: 'eraser', name: 'Borracha', icon: 'eraser' },
  { id: 'lasso', name: 'Laço', icon: 'lasso' },
  { id: 'shape', name: 'Formas', icon: 'shapes' },
  { id: 'text', name: 'Texto', icon: 'text' },
  { id: 'sticky', name: 'Post-it', icon: 'sticky' },
  { id: 'table', name: 'Tabela', icon: 'table' },
];
const SHAPE_KINDS = [['line', 'Linha'], ['arrow', 'Seta'], ['rect', 'Retângulo'], ['ellipse', 'Elipse'], ['triangle', 'Triângulo'], ['diamond', 'Losango']];
const STICKY_COLORS = ['#fde68a', '#fecaca', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fed7aa', '#f5f5f4'];
const fmtW = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const WIDTH_RANGE = { pen: [0.5, 24, 0.5], highlighter: [4, 60, 0.5], shape: [0.5, 20, 0.5], text: [8, 96, 1], eraser: [4, 120, 1], sticky: [10, 40, 1] };

function onPress(node, tap, long) {
  let t = null, fired = false;
  node.addEventListener('pointerdown', () => { fired = false; t = setTimeout(() => { fired = true; t = null; long && long(); }, 550); });
  const cancel = () => { if (t) { clearTimeout(t); t = null; } };
  node.addEventListener('pointerup', () => { if (t) { cancel(); if (!fired) tap(); } });
  node.addEventListener('pointerleave', cancel); node.addEventListener('pointercancel', cancel);
}
function mapPressure(raw) {
  const s = Store.settings.pressureSens ?? 0.6;
  return clamp(0.5 + (raw - 0.5) * s * 1.8, 0.04, 1);
}
function lineTypeSvg(dash, size = 34) {
  const pat = { solid: '', dot: '0.1 4', long: '9 4', short: '4 4', dashdot: '8 3.5 0.1 3.5', mixed: '9 3 3 3' }[dash] || '';
  return `<svg width="${size}" height="${size * 0.7}" viewBox="0 0 40 28" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 24 C 16 24, 14 4, 34 4" stroke-dasharray="${pat}"/></svg>`;
}

/* Predefinições: tocar seleciona, arrastar para cima/baixo reordena, segurar parado mostra o × para remover */
function makeSortable(container, selector, list, onDone, { tap, long }) {
  let st = null;
  container.addEventListener('pointerdown', (e) => {
    const it = e.target.closest(selector); if (!it || e.target.closest('.xbadge')) return;
    st = { it, id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, longT: setTimeout(() => { if (st && !st.drag) { st.longDone = true; long && long(); } }, 600) };
    it.setPointerCapture(e.pointerId);
  });
  container.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.drag) { if (Math.abs(e.clientY - st.y) > 8 || Math.abs(e.clientX - st.x) > 12) { st.drag = true; clearTimeout(st.longT); st.it.classList.add('dragging'); } else return; }
    e.preventDefault();
    const sibs = $$(selector, container).filter((x) => x !== st.it);
    let before = null; for (const sb of sibs) { const r = sb.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { before = sb; break; } }
    if (before) container.insertBefore(st.it, before); else if (sibs.length) sibs[sibs.length - 1].after(st.it);
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return; clearTimeout(st.longT);
    const s0 = st; st = null; s0.it.classList.remove('dragging');
    if (s0.drag) { const order = $$(selector, container).map((x) => list[+x.dataset.i]); list.splice(0, list.length, ...order); onDone(); }
    else if (!s0.longDone && e.type === 'pointerup') tap && tap(+s0.it.dataset.i);
  };
  container.addEventListener('pointerup', end); container.addEventListener('pointercancel', end);
}

const UI = {
  editMode: false, panelOpen: false,

  /* ---------- ferramenta ativa ---------- */
  setTool(t, keepSel = false) {
    Editor.commitText();
    if (Editor.readOnly) Editor.setReadOnly(false);
    if (this.clipsOpen) this.closePanel();
    if (Editor.tool === t && !keepSel) { this.togglePanel(); return; }
    if (!keepSel && t !== 'lasso') Editor.sel = null;
    Editor.tool = t; this.editMode = false;
    this.buildToolbar(); this.renderOptions();
    if (this.panelOpen) this.buildPanel();
    Editor.clearLive(); Editor.requestRender();
  },
  save() { Store.saveSettings(); },

  /* ---------- trilho principal ---------- */
  buildToolbar() {
    const r = $('#rail'); r.innerHTML = '';
    const S = Store.settings;
    const B = (ic, title, fn, cls = '', html) => { const b = el('button', { class: 'cbtn ' + cls, title, onclick: fn }); b.innerHTML = html || icon(ic); r.append(b); return b; };
    B('undo', 'Desfazer (toque com 2 dedos)', () => Editor.undo(), 'keep').id = 'btnUndo';
    B('redo', 'Refazer (toque com 3 dedos)', () => Editor.redo(), 'keep').id = 'btnRedo';
    const fb = B('hand', 'Escrever com o dedo', () => { S.fingerDraws = !S.fingerDraws; this.save(); fb.classList.toggle('soft-on', S.fingerDraws); toast(S.fingerDraws ? 'Dedo escreve (2 dedos movem a página)' : 'Dedo só navega', 1600); }, S.fingerDraws ? 'soft-on' : '');
    fb.id = 'btnFinger';
    r.append(el('div', { class: 'sep' }));
    for (const t of TOOLS) {
      const b = B(t.icon, t.name, () => this.setTool(t.id), Editor.tool === t.id ? 'on' : '');
      if ((t.id === 'pen' || t.id === 'highlighter') && Editor.tool !== t.id) b.append(el('span', { style: { position: 'absolute', right: '7px', bottom: '7px', width: '9px', height: '9px', borderRadius: '50%', background: S.tools[t.id].color, boxShadow: '0 0 0 1.5px var(--ch)' } }));
    }
    B('image', 'Inserir imagem', async () => Editor.insertImage(await pickFile('image/*')));
    B('library', 'Biblioteca (itens copiados)', () => this.openClips(), this.clipsOpen ? 'soft-on' : '').id = 'btnClips';
    r.append(el('div', { class: 'sep' }));
    B('ruler', 'Régua', () => Instruments.toggle('ruler'), Instruments.ruler.on ? 'soft-on' : '');
    B('protractor', 'Transferidor', () => Instruments.toggle('prot'), Instruments.prot.on ? 'soft-on' : '');
    if (Plugins.tools.length || Plugins.actions.length) {
      r.append(el('div', { class: 'sep' }));
      for (const t of Plugins.tools) B(null, t.name, () => this.setTool(t.id), Editor.tool === t.id ? 'on' : '', pluginIcon(t.icon));
      for (const a of Plugins.actions) B(null, a.name, () => Plugins.runAction(a), '', pluginIcon(a.icon));
    }
    r.append(el('div', { class: 'grow' }));
    const col = $('#editor').classList.contains('collapsed');
    B(col ? 'chevRight' : 'chevLeft', col ? 'Mostrar ferramentas' : 'Esconder ferramentas', () => { $('#editor').classList.toggle('collapsed'); this.buildToolbar(); }, 'keep');
    if (Editor.note) Editor.updateUndoBtns();
  },

  /* ---------- grupos de predefinições ---------- */
  group() { return Store.activeGroup(Editor.note); },
  colorList(t) { const g = this.group(); const k = t === 'highlighter' ? 'highlighter' : 'pen'; g.colors = g.colors || {}; return g.colors[k] || (g.colors[k] = []); },
  widthList(t) { const g = this.group(); g.widths = g.widths || {}; return g.widths[t] || (g.widths[t] = (Store.settings.widthPresets[t] || []).slice()); },
  groupMenu(anchor) {
    const S = Store.settings, note = Editor.note, cur = this.group(), folder = Store.folderOf(note);
    const items = S.presetGroups.map((g) => ({ label: (g.id === cur.id ? '✓ ' : '   ') + g.name, run: () => { note.groupId = g.id; Editor.markChanged(); this.refresh(); toast('Grupo "' + g.name + '" nesta nota', 1300); } }));
    items.push('-');
    items.push({ label: 'Novo grupo (cópia do atual)…', icon: 'plus', run: async () => {
      const n = await askText('Novo grupo de predefinições', '', 'Nome (ex.: Direito Penal)'); if (!n) return;
      const g = { id: uid(), name: n, colors: clone(cur.colors || {}), widths: clone(cur.widths || {}) }; S.presetGroups.push(g); note.groupId = g.id; this.save(); Editor.markChanged(); this.refresh();
    } });
    items.push({ label: 'Renomear "' + cur.name + '"…', icon: 'pen', run: async () => { const n = await askText('Renomear grupo', cur.name); if (n) { cur.name = n; this.save(); this.refresh(); } } });
    if (folder) items.push({ label: 'Usar como padrão da pasta "' + folder.name + '"', icon: 'folder', run: async () => { folder.groupId = cur.id; delete note.groupId; await Store.saveFolders(); Editor.markChanged(); toast('Padrão da pasta atualizado', 1300); } });
    if (cur.id !== 'default') items.push({ label: 'Excluir "' + cur.name + '"', icon: 'trash', danger: true, run: async () => {
      if (!(await confirmBox('Excluir grupo', `Excluir o grupo "${cur.name}"? As notas e pastas que o usam voltam para "Geral".`, 'Excluir', true))) return;
      S.presetGroups = S.presetGroups.filter((g) => g.id !== cur.id); for (const f of Store.folders) if (f.groupId === cur.id) delete f.groupId;
      if (note.groupId === cur.id) delete note.groupId; await Store.saveFolders(); this.save(); Editor.markChanged(); this.refresh();
    } });
    menu(anchor, items);
  },

  /* ---------- sub-trilho: predefinições de espessura e cor ---------- */
  renderOptions() {
    const sr = $('#subrail'); sr.innerHTML = '';
    const t = Editor.tool, S = Store.settings, st = S.tools[t];
    this.placeSubrail();
    const sep = () => sr.append(el('div', { class: 'sep' }));
    const tune = () => { const b = el('button', { class: 'cbtn' + (this.panelOpen ? ' soft-on' : ''), title: 'Ajustes da ferramenta', onclick: () => this.togglePanel() }); b.innerHTML = icon('tune'); sr.append(b); };
    const groupBtn = (into = sr) => {
      const g = this.group(); const b = el('button', { class: 'cbtn', title: 'Grupo de predefinições: ' + g.name, style: { fontSize: '11px', fontWeight: 700, background: 'var(--ch2)', width: '44px', height: '30px', borderRadius: '10px' } }, g.name.slice(0, 4));
      b.onclick = () => this.groupMenu(b); into.append(b);
    };
    const lineBtn = (into = sr) => { const b = el('button', { class: 'cbtn', title: 'Tipo de linha' }); b.innerHTML = lineTypeSvg(st.dash || 'solid', 26); b.onclick = () => this.lineTypePop(b); into.append(b); };
    if (t === 'pen' || t === 'highlighter') { const top = el('div', { class: 'srow' }); sr.append(top); groupBtn(top); if (t === 'pen') lineBtn(top); sep(); this.presetCols(sr, t, t); sep(); tune(); }
    else if (t === 'shape') {
      for (const [k, n] of SHAPE_KINDS) { const b = el('button', { class: 'cbtn shp' + (st.kind === k ? ' soft-on' : ''), title: n, onclick: () => { st.kind = k; this.save(); this.renderOptions(); } }); b.innerHTML = icon(k); sr.append(b); }
      sep(); const top = el('div', { class: 'srow' }); sr.append(top); lineBtn(top); sep(); this.presetCols(sr, 'shape', 'shape'); sep(); tune();
    } else if (t === 'text') { const top = el('div', { class: 'srow' }); sr.append(top); groupBtn(top); sep(); this.presetCols(sr, 'text', 'text'); sep(); tune(); }
    else if (t === 'table') { tune(); }
    else if (t === 'sticky') {
      for (const c of STICKY_COLORS) { const d = el('button', { class: 'cdot' + (st.bg === c ? ' sel' : ''), style: { background: c, borderRadius: '8px' }, title: 'Cor do post-it', onclick: () => { st.bg = c; this.save(); this.applyStickyBg(c); this.renderOptions(); } }); sr.append(d); }
      sep(); tune();
    } else if (t === 'eraser') {
      for (const [m, n] of [['stroke', 'Traço'], ['area', 'Área']]) sr.append(el('button', { class: 'wchip' + (st.mode === m ? ' sel' : ''), title: n === 'Traço' ? 'Apaga o traço inteiro' : 'Apaga só a parte tocada', onclick: () => { st.mode = m; this.save(); this.refresh(); } }, el('span', { class: 'n', style: { fontSize: '11px' } }, n)));
      sep(); this.widthChips(sr, 'eraser'); sep(); tune();
    } else if (t === 'lasso') {
      if (Editor.clip) { const b = el('button', { class: 'cbtn', title: 'Colar', onclick: () => Editor.paste() }); b.innerHTML = icon('paste'); sr.append(b); }
    } else {
      const pt = Plugins.tools.find((x) => x.id === t);
      if (pt && pt.renderOptions) tune();
    }
    if (this.editMode) { const ok = el('button', { class: 'cbtn soft-on', title: 'Concluir edição', onclick: () => { this.editMode = false; this.renderOptions(); } }); ok.innerHTML = icon('check'); sr.prepend(ok); }
    this.addGrip();
  },
  /* barra de predefinições: posição vertical ajustável pela alça */
  placeSubrail() {
    const sr = $('#subrail'), y = Store.settings.subrailY;
    if (y == null) { sr.style.top = ''; sr.style.maxHeight = ''; return; }
    const top = clamp(y, 64, Math.max(64, innerHeight - 140)); sr.style.top = top + 'px'; sr.style.maxHeight = `calc(100% - ${top + 12}px)`;
  },
  addGrip() {
    const sr = $('#subrail'); if (!sr.childElementCount) return;
    const g = el('div', { class: 'grip', title: 'Segure e arraste para subir ou descer a barra' }, el('span'), el('span'), el('span'));
    sr.prepend(g);
    let st = null;
    g.addEventListener('pointerdown', (e) => { e.preventDefault(); g.setPointerCapture(e.pointerId); st = { id: e.pointerId, y: e.clientY, top: sr.getBoundingClientRect().top }; g.classList.add('on'); });
    g.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      Store.settings.subrailY = clamp(st.top + e.clientY - st.y, 64, innerHeight - 140); this.placeSubrail();
      if (this.panelOpen) $('#toolPanel').style.top = '';
    });
    const end = (e) => { if (!st || e.pointerId !== st.id) return; st = null; g.classList.remove('on'); this.save(); };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    g.addEventListener('dblclick', () => { delete Store.settings.subrailY; this.save(); this.placeSubrail(); });
  },
  refresh() { this.renderOptions(); if (this.panelOpen) this.buildPanel(); this.buildToolbar(); },
  widthKey(t) { return t === 'text' || t === 'eraser' || t === 'sticky' ? 'size' : 'width'; },
  widthChips(sr, t) {
    const st = Store.settings.tools[t], list = this.widthList(t), key = this.widthKey(t);
    const box = el('div', { class: 'scol' });
    list.forEach((w, i) => {
      const ch = el('button', { class: 'wchip' + (Math.abs(st[key] - w) < 0.01 ? ' sel' : ''), title: fmtW(w) + 'px · arraste para reordenar' }); ch.dataset.i = i;
      if (t === 'text') ch.append(el('span', { style: { fontWeight: 600, fontSize: Math.min(20, 9 + w / 4) + 'px', lineHeight: 1 } }, 'A'));
      else if (t === 'eraser') ch.append(el('span', { class: 'ln', style: { width: Math.min(26, 6 + w / 3) + 'px', height: Math.min(26, 6 + w / 3) + 'px', borderRadius: '50%', background: 'transparent', border: '1.5px solid var(--chfg)' } }));
      else ch.append(el('span', { class: 'ln', style: { height: clamp(t === 'highlighter' ? w / 3 : w * 1.1, 1, 12) + 'px', opacity: t === 'highlighter' ? 0.6 : 1 } }));
      ch.append(el('span', { class: 'n' }, fmtW(w)));
      if (this.editMode) ch.append(el('span', { class: 'xbadge', onclick: (e) => { e.stopPropagation(); list.splice(i, 1); this.save(); this.renderOptions(); } }, '×'));
      box.append(ch);
    });
    makeSortable(box, '.wchip', list, () => { this.save(); this.renderOptions(); }, {
      tap: (i) => { if (this.editMode) return; st[key] = list[i]; this.save(); if (t === 'text') this.applyTextStyle({ size: list[i] }); this.refresh(); },
      long: () => { this.editMode = !this.editMode; this.renderOptions(); if (this.editMode) toast('Toque no × para remover', 1500); },
    });
    const add = el('button', { class: 'cbtn addb', title: 'Salvar espessura atual (' + fmtW(st[key]) + ')', onclick: () => { if (!list.some((w) => Math.abs(w - st[key]) < 0.01)) { list.push(st[key]); this.save(); this.renderOptions(); toast('Espessura ' + fmtW(st[key]) + ' salva', 1200); } else toast('Essa espessura já está salva', 1200); } });
    add.innerHTML = icon('plus'); box.append(add);
    sr.append(box);
  },
  colorDots(sr, t) {
    const st = Store.settings.tools[t], list = this.colorList(t);
    const box = el('div', { class: 'scol' });
    list.forEach((c, i) => {
      const d = el('button', { class: 'cdot' + (st.color.toLowerCase() === c.toLowerCase() ? ' sel' : ''), style: { background: c }, title: c + ' · arraste para reordenar' }); d.dataset.i = i;
      if (this.editMode) d.append(el('span', { class: 'xbadge', onclick: (e) => { e.stopPropagation(); list.splice(i, 1); this.save(); this.renderOptions(); } }, '×'));
      box.append(d);
    });
    makeSortable(box, '.cdot', list, () => { this.save(); this.renderOptions(); }, {
      tap: (i) => { if (this.editMode) return; st.color = list[i]; this.save(); if (t === 'text') this.applyTextStyle({ color: list[i] }); this.refresh(); },
      long: () => { this.editMode = !this.editMode; this.renderOptions(); if (this.editMode) toast('Toque no × para remover', 1500); },
    });
    const add = el('button', { class: 'cbtn addb', title: 'Adicionar cor' }); add.innerHTML = icon('plus');
    add.onclick = () => colorPop(add, st.color, (c) => { if (!list.some((x) => x.toLowerCase() === c.toLowerCase())) list.push(c); st.color = c; this.save(); this.refresh(); }, t === 'highlighter' ? HL_PALETTE.concat(PALETTE.slice(4, 14)) : PALETTE);
    box.append(add);
    sr.append(box);
  },
  /* espessuras e cores lado a lado (alcance fácil com a mão esquerda) */
  presetCols(sr, wt, ct) { const row = el('div', { class: 'scols' }); this.widthChips(row, wt); this.colorDots(row, ct); sr.append(row); },
  lineTypePop(anchor) {
    const t = Editor.tool, st = Store.settings.tools[t];
    const grid = el('div', { class: 'tp-seg', style: { gridTemplateColumns: 'repeat(3, 110px)', margin: 0 } });
    for (const [k, n] of LINE_TYPES) { const b = el('button', { class: (st.dash || 'solid') === k ? 'on' : '', onclick: () => { st.dash = k; this.save(); closePop(); this.refresh(); } }); b.innerHTML = lineTypeSvg(k) + n; grid.append(b); }
    const pop = openPop(anchor, grid); pop.style.background = 'var(--ch)'; pop.style.color = 'var(--chfg)';
  },

  /* ---------- painel de ajustes da ferramenta ---------- */
  togglePanel() { this.panelOpen ? this.closePanel() : this.openPanel(); },
  openPanel() { this.panelOpen = true; this.buildPanel(); this.renderOptions(); },
  closePanel() { this.panelOpen = false; this.tableEdit = null; if (this.clipsOpen) { this.clipsOpen = false; this.buildToolbar(); } $('#toolPanel').classList.add('hidden'); this.renderOptions(); },
  openTableEdit(id) { this.tableEdit = id; this.panelOpen = true; this.buildPanel(); },
  buildPanel() {
    const p = $('#toolPanel'); p.innerHTML = ''; p.classList.remove('hidden');
    const sr = $('#subrail'), rr = $('#rail'); const anchorR = (sr.childElementCount && getComputedStyle(sr).display !== 'none' ? sr : rr).getBoundingClientRect().right;
    if (innerWidth > 700) p.style.left = anchorR + 10 + 'px'; else p.style.left = '';
    if (this.tableEdit) return this.buildTablePanel(p);
    if (this.clipsOpen) return this.buildClipsPanel(p);
    if (Editor.tool === 'table') return this.buildTablePanel(p, true);
    const t = Editor.tool, S = Store.settings, st = S.tools[t];
    const pt = Plugins.tools.find((x) => x.id === t);
    const name = (TOOLS.find((x) => x.id === t) || pt || { name: 'Ferramenta' }).name;
    const x = el('button', { class: 'cbtn', title: 'Fechar', onclick: () => this.closePanel() }); x.innerHTML = icon('x');
    p.append(el('div', { class: 'tp-head' }, name, x));
    let prev = null;
    const upd = () => { this.renderOptions(); this.buildToolbar(); if (prev) this.drawPreview(prev, t); };
    if (t === 'pen' || t === 'highlighter') { prev = el('canvas', { class: 'tp-prev' }); p.append(prev); setTimeout(() => this.drawPreview(prev, t), 0); }
    const key = this.widthKey(t);
    if (t === 'pen' || t === 'shape') {
      const seg = el('div', { class: 'tp-seg', style: { gridTemplateColumns: 'repeat(3,1fr)' } });
      for (const [k, n] of LINE_TYPES) { const b = el('button', { class: (st.dash || 'solid') === k ? 'on' : '', onclick: () => { st.dash = k; this.save(); this.refresh(); } }); b.innerHTML = lineTypeSvg(k, 28) + n; seg.append(b); }
      p.append(el('div', { class: 'tp-sec' }, 'Tipo de linha'), seg);
    }
    if (t === 'shape') {
      const seg = el('div', { class: 'tp-seg' });
      for (const [k, n] of SHAPE_KINDS) { const b = el('button', { class: st.kind === k ? 'on' : '', onclick: () => { st.kind = k; this.save(); this.refresh(); } }); b.innerHTML = icon(k) + n; seg.append(b); }
      p.append(el('div', { class: 'tp-sec' }, 'Forma'), seg);
    }
    if (t === 'eraser') {
      const seg = el('div', { class: 'tp-seg' });
      for (const [m, n, d] of [['stroke', 'Traço inteiro', 'eraser'], ['area', 'Só a área tocada', 'scribble']]) { const b = el('button', { class: st.mode === m ? 'on' : '', onclick: () => { st.mode = m; this.save(); this.refresh(); } }); b.innerHTML = icon(d) + n; seg.append(b); }
      p.append(seg);
    }
    if (['pen', 'highlighter', 'shape', 'text', 'eraser', 'sticky'].includes(t)) {
      const [mn, mx, step] = WIDTH_RANGE[t];
      p.append(...this.sliderRows(t === 'text' || t === 'sticky' ? 'Tamanho da letra' : t === 'eraser' ? 'Tamanho' : 'Espessura', st[key], mn, mx, step, (v) => fmtW(v), (v) => { st[key] = v; this.save(); if (t === 'text' || t === 'sticky') this.applyTextStyle({ size: v }); upd(); }));
    }
    if (t === 'highlighter') p.append(...this.sliderRows('Opacidade', st.opacity ?? 0.4, 0.1, 0.9, 0.05, (v) => Math.round(v * 100) + '%', (v) => { st.opacity = v; this.save(); upd(); }, false));
    if (t === 'pen') {
      p.append(this.switchRow('Pressione e segure para desenhar forma', 'Desenhe e segure a caneta parada no fim', S.shapeHold, (v) => { S.shapeHold = v; this.save(); }));
      p.append(this.switchRow('Sempre fazer linhas retas', 'Cada traço vira uma linha reta do início ao fim', S.straightAlways, (v) => { S.straightAlways = v; this.save(); }));
      p.append(this.switchRow('Alinhar linhas a 0°, 45° e 90°', 'Linhas quase retas grudam na horizontal, vertical e diagonais', S.angleSnap !== false, (v) => { S.angleSnap = v; this.save(); }));
      p.append(this.switchRow('Rabiscar para apagar', 'Rabisque em vai-e-volta por cima do que quer apagar', S.scribbleErase, (v) => { S.scribbleErase = v; this.save(); }));
      p.append(...this.sliderRows('Sensibilidade à pressão', S.pressureSens ?? 0.6, 0, 1, 0.05, (v) => (v === 0 ? 'Sem' : Math.round(v * 100) + '%'), (v) => { S.pressureSens = v; S.pressure = v > 0; this.save(); upd(); }, false));
    }
    if (t === 'shape') p.append(this.switchRow('Alinhar linhas a 0°, 45° e 90°', null, S.angleSnap !== false, (v) => { S.angleSnap = v; this.save(); }));
    if (t === 'pen' || t === 'highlighter') p.append(...this.sliderRows('Estabilização (suavizar)', S.stabilizer, 0, 0.9, 0.05, (v) => Math.round(v * 100) + '%', (v) => { S.stabilizer = v; this.save(); }, false));
    if (t === 'eraser') {
      p.append(this.switchRow('Apagar só marca-texto', 'Mantém a escrita da caneta', st.onlyHl, (v) => { st.onlyHl = v; this.save(); }));
      p.append(this.switchRow('Rabiscar para apagar (com a caneta)', 'Funciona com a ferramenta Caneta ativa', S.scribbleErase, (v) => { S.scribbleErase = v; this.save(); }));
    }
    if (t === 'shape') {
      p.append(this.switchRow('Preencher forma', null, st.fill, (v) => { st.fill = v; this.save(); }));
      p.append(this.colorSection('Cor do preenchimento', st.fillColor, (c) => { st.fillColor = c; st.fill = true; this.save(); this.buildPanel(); }, PALETTE.concat(HL_PALETTE), false));
    }
    if (t === 'text') p.append(this.switchRow('Negrito', null, st.bold, (v) => { st.bold = v; this.save(); this.applyTextStyle({ bold: v }); }));
    if (t === 'sticky') {
      p.append(this.colorSection('Cor do post-it', st.bg, (c) => { st.bg = c; this.save(); this.applyStickyBg(c); this.refresh(); }, STICKY_COLORS, false));
      p.append(this.colorSection('Cor do texto', st.color, (c) => { st.color = c; this.save(); this.applyTextStyle({ color: c }); this.refresh(); }, PALETTE.slice(0, 14), false));
      p.append(el('p', { style: { color: 'var(--chmuted)', fontSize: '13px' } }, 'Toque na página para colar um post-it. Você pode escrever dentro com o teclado ou desenhar por cima com a caneta; para mover, use o laço.'));
    }
    if (['pen', 'highlighter', 'shape', 'text'].includes(t)) {
      p.append(this.colorSection('Cor', st.color, (c) => { st.color = c; this.save(); if (t === 'text') this.applyTextStyle({ color: c }); this.refresh(); }, t === 'highlighter' ? HL_PALETTE.concat(PALETTE.slice(4, 14)) : PALETTE, true, t));
    }
    if (t === 'lasso') p.append(el('p', { style: { color: 'var(--chmuted)', fontSize: '14px' } }, 'Desenhe em volta dos itens ou toque em um deles. Arraste para mover, use a bolinha do canto para redimensionar e a alça de cima para girar — com a caneta ou com o dedo.'));
    if (pt && pt.renderOptions) { const box = el('div', {}); p.append(box); try { pt.renderOptions(box, Plugins.api(Editor.currentPageIndex(), pt.owner)); } catch (e) { box.textContent = 'Erro: ' + e.message; } }
  },
  /* ---------- biblioteca de itens copiados ---------- */
  openClips() { if (this.clipsOpen) return this.closePanel(); this.tableEdit = null; this.clipsOpen = true; this.panelOpen = true; this.buildPanel(); this.buildToolbar(); },
  async buildClipsPanel(p) {
    const x = el('button', { class: 'cbtn', title: 'Fechar', onclick: () => this.closePanel() }); x.innerHTML = icon('x');
    p.append(el('div', { class: 'tp-head' }, 'Biblioteca', x));
    const list = await Clips.all();
    if (!list.length) { p.append(el('p', { style: { color: 'var(--chmuted)', fontSize: '14px', lineHeight: 1.5 } }, 'Ainda não há itens aqui. Selecione formas, imagens, tabelas ou escrita com o laço e toque em Copiar: eles ficam guardados nesta biblioteca para você colar em qualquer nota.')); return; }
    p.append(el('p', { style: { color: 'var(--chmuted)', fontSize: '13px', margin: '0 0 10px' } }, 'Toque num item para colar no meio da tela. Segure para fixar no topo ou remover.'));
    const grid = el('div', { class: 'clip-grid' });
    for (const c of list) {
      const card = el('button', { class: 'clip' + (c.pin ? ' pin' : ''), title: c.label }, el('img', { src: c.thumb || '', alt: '' }), c.pin ? el('span', { class: 'clip-pin' }, '★') : null);
      onPress(card, () => { Editor.pasteElements(c.els); toast('Colado da biblioteca', 1000); }, () => menu(card, [
        { label: c.pin ? 'Desafixar' : 'Fixar no topo', icon: 'star', run: async () => { await Clips.update(c.id, { pin: !c.pin }); this.buildPanel(); } },
        { label: 'Remover da biblioteca', icon: 'trash', danger: true, run: async () => { await Clips.remove(c.id); this.buildPanel(); } },
      ]));
      grid.append(card);
    }
    p.append(grid, el('button', { class: 'btn ghost', style: { marginTop: '12px', color: 'var(--chmuted)' }, onclick: async () => { if (await confirmBox('Limpar biblioteca', 'Remover todos os itens não fixados?', 'Limpar', true)) { await Clips.clear(); this.buildPanel(); } } }, 'Limpar itens não fixados'));
  },
  buildTablePanel(p, isTool) {
    const S = Store.settings, st = S.tools.table;
    const page = this.tableEdit && Editor.sel ? Editor.pageById(Editor.sel.pageId) : null;
    const cur = () => (page ? page.elements.find((e) => e.id === this.tableEdit) : null);
    if (this.tableEdit && !cur()) { this.tableEdit = null; return this.closePanel(); }
    const get = () => (cur() || st);
    const set = (patch) => {
      const e = cur();
      if (e) { const n = { ...e, ...patch }; if (patch.cols != null) n.colW = null; if (patch.rows != null) n.rowH = null; Editor.recReplace(page, e, n); Editor.opCommit(); }
      Object.assign(st, patch); this.save(); draw();
    };
    const x = el('button', { class: 'cbtn', title: 'Fechar', onclick: () => this.closePanel() }); x.innerHTML = icon('x');
    p.append(el('div', { class: 'tp-head' }, this.tableEdit ? 'Tabela selecionada' : 'Tabela', x));
    const prev = el('canvas', { class: 'tp-prev', style: { height: '120px' } }); p.append(prev);
    const draw = () => {
      const r = prev.getBoundingClientRect(), d = devicePixelRatio || 1; if (!r.width) return;
      prev.width = r.width * d; prev.height = r.height * d; const c = prev.getContext('2d'); c.scale(d, d);
      const T = get(), w = Math.min(r.width - 40, T.cols * 70), h = Math.min(r.height - 20, T.rows * 18);
      drawElement(c, { type: 'table', x: (r.width - w) / 2, y: (r.height - h) / 2, w, h, cols: T.cols, rows: T.rows, hRow: T.hRow, hCol: T.hCol, bw: Math.min(T.bw, 4), bc: T.bc, fill: T.fill });
    };
    setTimeout(draw, 0);
    const T = get();
    p.append(this.switchRow('Coluna de cabeçalho', null, T.hCol, (v) => set({ hCol: v })));
    p.append(this.switchRow('Linha de cabeçalho', null, T.hRow, (v) => set({ hRow: v })));
    p.append(...this.sliderRows('Contagem de colunas', T.cols, 1, 20, 1, (v) => v, (v) => set({ cols: v })));
    p.append(...this.sliderRows('Contagem de linhas', T.rows, 1, 40, 1, (v) => v, (v) => set({ rows: v })));
    p.append(...this.sliderRows('Largura da borda', T.bw, 0.5, 10, 0.5, (v) => fmtW(v), (v) => set({ bw: v })));
    p.append(this.colorSection('Cor da borda', T.bc, (c) => { set({ bc: c }); this.buildPanel(); }, PALETTE, false));
    const fillSec = this.colorSection('Cor de preenchimento', T.fill || '', (c) => { set({ fill: c }); this.buildPanel(); }, ['#ffffff'].concat(HL_PALETTE, STICKY_COLORS), false);
    const none = el('button', { class: 'cdot' + (!T.fill ? ' sel' : ''), title: 'Sem preenchimento', style: { background: 'repeating-linear-gradient(45deg,transparent 0 4px,var(--chline) 4px 6px)' }, onclick: () => { set({ fill: null }); this.buildPanel(); } });
    fillSec.querySelector('.tp-colors').prepend(none); p.append(fillSec);
    if (isTool) p.append(el('p', { style: { color: 'var(--chmuted)', fontSize: '13px' } }, 'Arraste na página para desenhar a tabela no tamanho que quiser, ou toque para usar o tamanho padrão. Para mudar uma tabela pronta, selecione-a com o laço.'));
  },
  sliderRows(label, val, min, max, step, fmt, on, plusMinus = true) {
    const v = el('div', { class: 'tp-val' }, fmt(val));
    const r = el('input', { type: 'range', min, max, step, value: val });
    const set = (x) => { x = clamp(Math.round(x / step) * step, min, max); x = Math.round(x * 100) / 100; r.value = x; v.textContent = fmt(x); on(x); };
    r.addEventListener('input', () => set(+r.value));
    const row = el('div', { class: 'tp-row', style: { borderBottom: '0', minHeight: '44px' } }, el('span', { class: 'lab' }, label), v);
    const s = el('div', { class: 'tp-slider' });
    if (plusMinus) { const m = el('button', { class: 'cbtn', title: '−' + fmtW(step), onclick: () => set(+r.value - step) }); m.innerHTML = icon('minus'); s.append(m); }
    s.append(r);
    if (plusMinus) { const pl = el('button', { class: 'cbtn', title: '+' + fmtW(step), onclick: () => set(+r.value + step) }); pl.innerHTML = icon('plus'); s.append(pl); }
    return [el('div', { style: { borderBottom: '1px solid var(--chline)' } }, row, s)];
  },
  switchRow(label, hint, val, on) {
    const i = el('input', { type: 'checkbox' }); i.checked = !!val; i.addEventListener('change', () => on(i.checked));
    return el('label', { class: 'tp-row', style: { cursor: 'pointer' } }, el('span', { class: 'lab' }, label, hint ? el('small', {}, hint) : null), el('span', { class: 'switch' }, i, el('span')));
  },
  colorSection(label, cur, on, palette, withAdd, tool) {
    const box = el('div', {});
    const head = el('div', { class: 'tp-sec' }, label, el('span', { class: 'sp' }));
    if (withAdd) {
      const add = el('button', { class: 'cbtn', title: 'Salvar a cor atual nas predefinições', style: { width: '34px', height: '34px' }, onclick: () => { const list = this.colorList(tool); const c = Store.settings.tools[tool].color; if (!list.some((x) => x.toLowerCase() === c.toLowerCase())) { list.push(c); this.save(); this.renderOptions(); toast('Cor salva nas predefinições', 1200); } } });
      add.innerHTML = icon('plus'); head.append(add);
    }
    const row = el('div', { class: 'tp-colors' });
    for (const c of palette) row.append(el('button', { class: 'cdot' + (c.toLowerCase() === (cur || '').toLowerCase() ? ' sel' : ''), style: { background: c }, onclick: () => on(c) }));
    const wheel = el('label', { class: 'cdot wheel', title: 'Cor personalizada', style: { display: 'inline-block' } });
    const inp = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#000000', style: { opacity: 0, width: '1px', height: '1px', position: 'absolute' } });
    inp.addEventListener('change', () => on(inp.value)); wheel.append(inp); row.append(wheel);
    box.append(head, row); return box;
  },
  drawPreview(cv, t) {
    const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; if (!r.width) return;
    cv.width = r.width * d; cv.height = r.height * d; const c = cv.getContext('2d'); c.scale(d, d);
    const st = Store.settings.tools[t], pts = [];
    for (let i = 0; i <= 60; i++) { const u = i / 60; const x = 30 + u * (r.width - 60), y = r.height / 2 - Math.sin(u * Math.PI * 1.6) * 22; pts.push(x, y, t === 'pen' ? mapPressure(0.15 + 0.75 * Math.sin(u * Math.PI)) : 0.5); }
    if (t === 'pen' && st.dash && st.dash !== 'solid') { c.strokeStyle = st.color; c.lineWidth = st.width; c.lineCap = 'round'; c.setLineDash(dashPattern(st.dash, st.width)); c.stroke(buildPolyPath(pts)); }
    else if (t === 'pen') { c.fillStyle = st.color; c.fill(buildPenPath(pts, st.width)); }
    else { c.globalAlpha = st.opacity ?? 0.4; c.strokeStyle = st.color; c.lineWidth = st.width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(buildPolyPath(pts)); }
  },
  applyTextStyle(patch) {
    if (Editor.textEl) { Object.assign(Editor.textCtx.el, patch); const e = Editor.textCtx.el; Editor.textEl.style.color = e.color; Editor.textEl.style.font = textFont(e); Editor.positionText(); Editor.requestRender(); }
    else if (Editor.sel) { const page = Editor.pageById(Editor.sel.pageId); for (const e of Editor.selElements()) if (e.type === 'text') Editor.recReplace(page, e, { ...e, ...patch }); Editor.opCommit(); }
  },
  applyStickyBg(c) {
    if (Editor.textEl && Editor.textCtx.el.sticky) { Editor.textCtx.el = { ...Editor.textCtx.el, bg: c }; Editor.requestRender(); }
    else if (Editor.sel) { const page = Editor.pageById(Editor.sel.pageId); for (const e of Editor.selElements()) if (e.sticky) Editor.recReplace(page, e, { ...e, bg: c }); Editor.opCommit(); }
  },

  /* ---------- barra da seleção ---------- */
  buildSelBar() {
    const bar = $('#selBar'); bar.innerHTML = '';
    const B = (ic, title, fn) => { const b = el('button', { class: 'icon-btn', title, onclick: fn }); b.innerHTML = icon(ic); bar.append(b); return b; };
    const cb = B('palette', 'Mudar cor', () => colorPop(cb, '#000', (c) => Editor.recolorSel(c)));
    B('copy', 'Copiar', () => Editor.copySel());
    B('cut', 'Recortar', () => Editor.cutSel());
    B('plus', 'Duplicar', () => Editor.duplicateSel());
    B('front', 'Trazer para frente', () => Editor.orderSel(true));
    const els = Editor.selElements();
    if (els.length === 1 && els[0].type === 'table') B('table', 'Ajustes da tabela', () => this.openTableEdit(els[0].id));
    if (Editor.selElements().some((e) => e.type === 'stroke' && e.tool === 'pen')) {
      B('ocr', 'Reconhecer texto (copiar ou converter)', () => recognizeSelection());
      B('align', 'Alinhar a escrita na horizontal', () => straightenSelection());
    }
    const d = B('trash', 'Excluir', () => Editor.deleteSel()); d.style.color = 'var(--danger)';
  },

  /* ---------- auxiliares usados nos diálogos ---------- */
  slider(label, min, max, step, val, onInput, fmt = (v) => v) {
    const out = el('span', { class: 'val' }, fmt(val));
    const r = el('input', { type: 'range', min, max, step, value: val });
    r.addEventListener('input', () => { out.textContent = fmt(+r.value); onInput(+r.value); });
    return el('div', { class: 'grp', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, el('label', {}, label), r, out);
  },
  check(label, val, on) { const i = el('input', { type: 'checkbox' }); i.checked = !!val; i.addEventListener('change', () => on(i.checked)); return el('label', { class: 'chk' }, i, label); },
  seg(items, cur, on) {
    const s = el('div', { class: 'seg' });
    for (const [v, lab, ic] of items) { const b = el('button', { class: v === cur ? 'on' : '', title: lab, onclick: () => { $$('button', s).forEach((x) => x.classList.remove('on')); b.classList.add('on'); on(v); } }); if (ic) b.innerHTML = icon(ic); else b.textContent = lab; s.append(b); }
    return s;
  },
};
function pluginIcon(ic) { return ic && ICONS[ic] ? icon(ic) : `<span class="emo" style="font-size:20px;line-height:1">${(ic || '★').replace(/[<>&]/g, '')}</span>`; }

/* ===== Biblioteca: últimos itens copiados (guardados no aparelho) ===== */
const Clips = {
  MAX: 40,
  async all() { const l = (await DB.get('meta', 'clips')) || []; return l.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.at - a.at); },
  async save(l) { await DB.put('meta', l, 'clips'); },
  async add(els) {
    const copy = clone(els), b = bboxUnion(copy); if (!b) return;
    const kinds = new Set(copy.map((e) => (e.type === 'stroke' ? 'escrita' : e.type === 'shape' ? 'forma' : e.type === 'image' ? 'imagem' : e.type === 'table' ? 'tabela' : 'texto')));
    const entry = { id: uid(), at: Date.now(), els: copy, label: [...kinds].join(', '), thumb: await this.thumb(copy, b) };
    let l = (await DB.get('meta', 'clips')) || [];
    const sig = JSON.stringify(copy.map((e) => [e.type, e.kind, e.blobId, e.pts ? e.pts.length : 0, Math.round(b.w), Math.round(b.h)]));
    l = l.filter((c) => c.sig !== sig); entry.sig = sig; // não repete o mesmo item
    l.unshift(entry);
    const pinned = l.filter((c) => c.pin), rest = l.filter((c) => !c.pin).slice(0, this.MAX);
    await this.save(pinned.concat(rest));
    if (UI.clipsOpen) UI.buildPanel();
  },
  async thumb(els, b) {
    for (const e of els) if (e.type === 'image') await ImgCache.load(e.blobId);
    const S = 160, pad = 8, sc = Math.min((S - 2 * pad) / Math.max(b.w, 1), (S - 2 * pad) / Math.max(b.h, 1), 3);
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, S, S);
    c.setTransform(sc, 0, 0, sc, (S - b.w * sc) / 2 - b.x * sc, (S - b.h * sc) / 2 - b.y * sc);
    for (const e of els) drawElement(c, e);
    return cv.toDataURL('image/png');
  },
  async update(id, patch) { const l = (await DB.get('meta', 'clips')) || []; const c = l.find((x) => x.id === id); if (c) Object.assign(c, patch); await this.save(l); },
  async remove(id) { await this.save(((await DB.get('meta', 'clips')) || []).filter((c) => c.id !== id)); },
  async clear() { await this.save(((await DB.get('meta', 'clips')) || []).filter((c) => c.pin)); },
};
