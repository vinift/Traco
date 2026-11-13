'use strict';
/* ===== Barra lateral de ferramentas (estilo Notewise): trilho, sub-trilho de predefinições e painel ===== */
const TOOLS = [
  { id: 'pen', name: 'Caneta', icon: 'pen' },
  { id: 'highlighter', name: 'Marca-texto', icon: 'highlighter' },
  { id: 'eraser', name: 'Borracha', icon: 'eraser' },
  { id: 'lasso', name: 'Laço', icon: 'lasso' },
  { id: 'shape', name: 'Formas', icon: 'shapes' },
  { id: 'text', name: 'Texto', icon: 'text' },
];
const SHAPE_KINDS = [['line', 'Linha'], ['arrow', 'Seta'], ['rect', 'Retângulo'], ['ellipse', 'Elipse'], ['triangle', 'Triângulo'], ['diamond', 'Losango']];
const fmtW = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const WIDTH_RANGE = { pen: [0.5, 24, 0.5], highlighter: [4, 60, 0.5], shape: [0.5, 20, 0.5], text: [8, 96, 1], eraser: [4, 120, 1] };

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

const UI = {
  editMode: false, panelOpen: false,

  /* ---------- ferramenta ativa ---------- */
  setTool(t, keepSel = false) {
    Editor.commitText();
    if (Editor.tool === t && !keepSel) { this.togglePanel(); return; }
    if (!keepSel && t !== 'lasso') Editor.sel = null;
    Editor.tool = t; this.editMode = false;
    this.buildToolbar(); this.renderOptions();
    if (this.panelOpen) this.buildPanel();
    Editor.clearLive(); Editor.requestRender();
  },
  st() { const t = Editor.tool; return Store.settings.tools[t]; },
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
    Editor.updateUndoBtns && Editor.note && Editor.updateUndoBtns();
  },

  /* ---------- sub-trilho: predefinições de espessura e cor ---------- */
  renderOptions() {
    const sr = $('#subrail'); sr.innerHTML = '';
    const t = Editor.tool, S = Store.settings, st = S.tools[t];
    const sep = () => sr.append(el('div', { class: 'sep' }));
    const tune = () => { const b = el('button', { class: 'cbtn' + (this.panelOpen ? ' soft-on' : ''), title: 'Ajustes da ferramenta', onclick: () => this.togglePanel() }); b.innerHTML = icon('tune'); sr.append(b); };
    if (t === 'pen' || t === 'highlighter') { this.widthChips(sr, t); sep(); this.colorDots(sr, t); sep(); tune(); }
    else if (t === 'shape') {
      for (const [k, n] of SHAPE_KINDS) { const b = el('button', { class: 'cbtn shp' + (st.kind === k ? ' soft-on' : ''), title: n, onclick: () => { st.kind = k; this.save(); this.renderOptions(); } }); b.innerHTML = icon(k); sr.append(b); }
      sep(); this.widthChips(sr, 'shape'); sep(); this.colorDots(sr, 'shape'); sep(); tune();
    } else if (t === 'text') { this.widthChips(sr, 'text'); sep(); this.colorDots(sr, 'text'); sep(); tune(); }
    else if (t === 'eraser') {
      for (const [m, n] of [['stroke', 'Traço'], ['area', 'Área']]) sr.append(el('button', { class: 'wchip' + (st.mode === m ? ' sel' : ''), title: n === 'Traço' ? 'Apaga o traço inteiro' : 'Apaga só a parte tocada', onclick: () => { st.mode = m; this.save(); this.refresh(); } }, el('span', { class: 'n', style: { fontSize: '11px' } }, n)));
      sep(); this.widthChips(sr, 'eraser'); sep(); tune();
    } else if (t === 'lasso') {
      if (Editor.clip) { const b = el('button', { class: 'cbtn', title: 'Colar', onclick: () => Editor.paste() }); b.innerHTML = icon('paste'); sr.append(b); }
    } else {
      const pt = Plugins.tools.find((x) => x.id === t);
      if (pt && pt.renderOptions) tune();
    }
    if (this.panelOpen && !sr.childElementCount && !Plugins.tools.find((x) => x.id === t)) this.closePanel();
  },
  refresh() { this.renderOptions(); if (this.panelOpen) this.buildPanel(); this.buildToolbar(); },
  colorList(t) { const S = Store.settings; const k = t === 'highlighter' ? 'highlighter' : 'pen'; return S.colorPresets[k] || (S.colorPresets[k] = []); },
  widthList(t) { const S = Store.settings; return S.widthPresets[t] || (S.widthPresets[t] = []); },
  widthKey(t) { return t === 'text' ? 'size' : t === 'eraser' ? 'size' : 'width'; },
  widthChips(sr, t) {
    const st = Store.settings.tools[t], list = this.widthList(t), key = this.widthKey(t);
    list.sort((a, b) => a - b);
    list.forEach((w, i) => {
      const ch = el('button', { class: 'wchip' + (Math.abs(st[key] - w) < 0.01 ? ' sel' : ''), title: fmtW(w) + 'px' });
      if (t === 'text') ch.append(el('span', { style: { fontWeight: 600, fontSize: Math.min(20, 9 + w / 4) + 'px', lineHeight: 1 } }, 'A'));
      else if (t === 'eraser') ch.append(el('span', { class: 'ln', style: { width: Math.min(26, 6 + w / 3) + 'px', height: Math.min(26, 6 + w / 3) + 'px', borderRadius: '50%', background: 'transparent', border: '1.5px solid var(--chfg)' } }));
      else ch.append(el('span', { class: 'ln', style: { height: clamp(t === 'highlighter' ? w / 3 : w * 1.1, 1, 12) + 'px', opacity: t === 'highlighter' ? 0.6 : 1 } }));
      ch.append(el('span', { class: 'n' }, fmtW(w)));
      if (this.editMode) ch.append(el('span', { class: 'xbadge', onclick: (e) => { e.stopPropagation(); list.splice(i, 1); this.save(); this.renderOptions(); } }, '×'));
      onPress(ch, () => { if (this.editMode) return; st[key] = w; this.save(); this.refresh(); }, () => { this.editMode = !this.editMode; this.renderOptions(); });
      sr.append(ch);
    });
    const add = el('button', { class: 'cbtn', title: 'Salvar espessura atual (' + fmtW(st[key]) + ')', onclick: () => { if (!list.some((w) => Math.abs(w - st[key]) < 0.01)) { list.push(st[key]); this.save(); this.renderOptions(); toast('Espessura ' + fmtW(st[key]) + ' salva', 1200); } else toast('Essa espessura já está salva', 1200); } });
    add.innerHTML = icon('plus'); add.style.cssText = 'width:36px;height:36px'; sr.append(add);
  },
  colorDots(sr, t) {
    const st = Store.settings.tools[t], list = this.colorList(t);
    list.forEach((c, i) => {
      const d = el('button', { class: 'cdot' + (st.color.toLowerCase() === c.toLowerCase() ? ' sel' : ''), style: { background: c }, title: c });
      if (this.editMode) d.append(el('span', { class: 'xbadge', onclick: (e) => { e.stopPropagation(); list.splice(i, 1); this.save(); this.renderOptions(); } }, '×'));
      onPress(d, () => { if (this.editMode) return; st.color = c; this.save(); this.refresh(); }, () => { this.editMode = !this.editMode; this.renderOptions(); });
      sr.append(d);
    });
    const add = el('button', { class: 'cbtn', title: 'Adicionar cor' }); add.innerHTML = icon('plus'); add.style.cssText = 'width:36px;height:36px';
    add.onclick = () => colorPop(add, st.color, (c) => { if (!list.some((x) => x.toLowerCase() === c.toLowerCase())) list.push(c); st.color = c; this.save(); this.refresh(); }, t === 'highlighter' ? HL_PALETTE.concat(PALETTE.slice(4, 14)) : PALETTE);
    sr.append(add);
    if (this.editMode) { const ok = el('button', { class: 'cbtn soft-on', title: 'Concluir edição', onclick: () => { this.editMode = false; this.renderOptions(); } }); ok.innerHTML = icon('check'); sr.append(ok); }
  },

  /* ---------- painel de ajustes da ferramenta ---------- */
  togglePanel() { this.panelOpen ? this.closePanel() : this.openPanel(); },
  openPanel() { this.panelOpen = true; this.buildPanel(); this.renderOptions(); },
  closePanel() { this.panelOpen = false; $('#toolPanel').classList.add('hidden'); this.renderOptions(); },
  buildPanel() {
    const p = $('#toolPanel'); p.innerHTML = ''; p.classList.remove('hidden');
    const t = Editor.tool, S = Store.settings, st = S.tools[t];
    const pt = Plugins.tools.find((x) => x.id === t);
    const name = (TOOLS.find((x) => x.id === t) || pt || { name: 'Ferramenta' }).name;
    const x = el('button', { class: 'cbtn', title: 'Fechar', onclick: () => this.closePanel() }); x.innerHTML = icon('x');
    p.append(el('div', { class: 'tp-head' }, name, x));
    const upd = () => { this.renderOptions(); this.buildToolbar(); if (prev) this.drawPreview(prev, t); };
    let prev = null;
    if (t === 'pen' || t === 'highlighter') { prev = el('canvas', { class: 'tp-prev' }); p.append(prev); setTimeout(() => this.drawPreview(prev, t), 0); }
    const key = this.widthKey(t);
    if (t === 'shape') {
      const seg = el('div', { class: 'tp-seg' });
      for (const [k, n] of SHAPE_KINDS) { const b = el('button', { class: st.kind === k ? 'on' : '', onclick: () => { st.kind = k; this.save(); this.refresh(); } }); b.innerHTML = icon(k) + n; seg.append(b); }
      p.append(seg);
    }
    if (t === 'eraser') {
      const seg = el('div', { class: 'tp-seg' });
      for (const [m, n, d] of [['stroke', 'Traço inteiro', 'eraser'], ['area', 'Só a área tocada', 'scribble']]) { const b = el('button', { class: st.mode === m ? 'on' : '', onclick: () => { st.mode = m; this.save(); this.refresh(); } }); b.innerHTML = icon(d) + n; seg.append(b); }
      p.append(seg);
    }
    if (['pen', 'highlighter', 'shape', 'text', 'eraser'].includes(t)) {
      const [mn, mx, step] = WIDTH_RANGE[t];
      p.append(...this.sliderRows(t === 'text' ? 'Tamanho da letra' : t === 'eraser' ? 'Tamanho' : 'Espessura', st[key], mn, mx, step, (v) => fmtW(v), (v) => { st[key] = v; this.save(); upd(); }));
    }
    if (t === 'highlighter') p.append(...this.sliderRows('Opacidade', st.opacity ?? 0.4, 0.1, 0.9, 0.05, (v) => Math.round(v * 100) + '%', (v) => { st.opacity = v; this.save(); upd(); }, false));
    if (t === 'pen') {
      p.append(this.switchRow('Pressione e segure para desenhar forma', 'Desenhe e segure a caneta parada no fim', S.shapeHold, (v) => { S.shapeHold = v; this.save(); }));
      p.append(this.switchRow('Rabiscar para apagar', 'Rabisque em zigue-zague por cima do que quer apagar', S.scribbleErase, (v) => { S.scribbleErase = v; this.save(); }));
      p.append(...this.sliderRows('Sensibilidade à pressão', S.pressureSens ?? 0.6, 0, 1, 0.05, (v) => (v === 0 ? 'Sem' : Math.round(v * 100) + '%'), (v) => { S.pressureSens = v; S.pressure = v > 0; this.save(); upd(); }, false));
    }
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
    if (['pen', 'highlighter', 'shape', 'text'].includes(t)) {
      p.append(this.colorSection('Cor', st.color, (c) => { st.color = c; this.save(); if (t === 'text') this.applyTextStyle({ color: c }); this.refresh(); }, t === 'highlighter' ? HL_PALETTE.concat(PALETTE.slice(4, 14)) : PALETTE, true, t));
    }
    if (t === 'lasso') p.append(el('p', { style: { color: 'var(--chmuted)', fontSize: '14px' } }, 'Desenhe em volta dos itens ou toque em um deles. Arraste a seleção para mover e use a bolinha do canto para redimensionar.'));
    if (pt && pt.renderOptions) { const box = el('div', {}); p.append(box); try { pt.renderOptions(box, Plugins.api(Editor.currentPageIndex(), pt.owner)); } catch (e) { box.textContent = 'Erro: ' + e.message; } }
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
    const wrap = el('div', { style: { borderBottom: '1px solid var(--chline)' } }, row, s);
    return [wrap];
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
    if (t === 'pen') { c.fillStyle = st.color; c.fill(buildPenPath(pts, st.width)); }
    else { c.globalAlpha = st.opacity ?? 0.4; c.strokeStyle = st.color; c.lineWidth = st.width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(buildPolyPath(pts)); }
  },
  applyTextStyle(patch) {
    if (Editor.textEl) { Object.assign(Editor.textCtx.el, patch); const e = Editor.textCtx.el; Editor.textEl.style.color = e.color; Editor.textEl.style.font = textFont(e); Editor.positionText(); }
    else if (Editor.sel) { const page = Editor.pageById(Editor.sel.pageId); for (const e of Editor.selElements()) if (e.type === 'text') Editor.recReplace(page, e, { ...e, ...patch }); Editor.opCommit(); }
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
