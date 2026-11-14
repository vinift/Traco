'use strict';
/* ===== Interface do editor: barra de ferramentas, opções, seleção, painéis ===== */
/* (barra de ferramentas e painel ficam em toolbar.js) */

/* ===== Régua e transferidor (ficam "sobre o vidro", fixos na tela) ===== */
const Instruments = {
  ruler: { on: false, x: 0, y: 0, a: 0, len: 1000, h: 76 },
  prot: { on: false, cx: 0, cy: 0, a: 0, R: 170, meas: 60 },
  els: {},
  toggle(k) {
    const o = this[k]; o.on = !o.on;
    if (o.on) {
      const W = Editor.W, H = Editor.H;
      if (k === 'ruler') { o.len = Math.max(W, H) * 1.1; o.x = W / 2 - o.len / 2; o.y = H / 2 - o.h / 2; o.a = 0; }
      else { o.cx = W / 2; o.cy = H / 2 + o.R / 2; o.a = 0; }
    }
    this.sync(); UI.buildToolbar();
  },
  hideAll() { for (const k of Object.keys(this.els)) { this.els[k].remove(); delete this.els[k]; } },
  sync() {
    for (const k of ['ruler', 'prot']) {
      const o = this[k];
      if (!o.on) { if (this.els[k]) { this.els[k].remove(); delete this.els[k]; } continue; }
      if (!this.els[k]) this.els[k] = this.create(k);
      this.place(k);
    }
    this.redraw();
  },
  create(k) {
    const d = el('div', { class: k === 'ruler' ? 'ruler' : 'prot' }); const cv = el('canvas'); d.append(cv);
    d.append(el('span', { class: 'ang' }));
    if (k === 'prot') { const kn = el('div', { class: 'knob' }, '°'); d.append(kn); this.knobDrag(kn); }
    $('#overlay').append(d); this.dragger(d, k); return d;
  },
  place(k) {
    const d = this.els[k]; if (!d) return; const o = this[k];
    if (k === 'ruler') { d.style.width = o.len + 'px'; d.style.height = o.h + 'px'; d.style.transform = `translate(${o.x}px,${o.y}px) rotate(${o.a}deg)`; }
    else { d.style.width = 2 * o.R + 'px'; d.style.height = o.R + 30 + 'px'; d.style.transformOrigin = `${o.R}px ${o.R}px`; d.style.transform = `translate(${o.cx - o.R}px,${o.cy - o.R}px) rotate(${o.a}deg)`; }
    const ang = d.querySelector('.ang'); const deg = ((-o.a % 360) + 360) % 360;
    if (k === 'ruler') { ang.textContent = Math.round(deg) + '°'; ang.style.left = o.len / 2 - 20 + 'px'; ang.style.top = o.h - 26 + 'px'; }
    else {
      ang.textContent = Math.round(o.meas) + '°'; ang.style.left = o.R - 22 + 'px'; ang.style.top = o.R - 46 + 'px';
      const kn = d.querySelector('.knob'), t = o.meas * Math.PI / 180;
      kn.style.left = o.R + (o.R + 14) * Math.cos(t) - 17 + 'px'; kn.style.top = o.R - (o.R + 14) * Math.sin(t) - 17 + 'px';
    }
  },
  redraw() {
    const dpr = Editor.dpr || 1, z = Editor.cam.z, mm = 3.7795 * z;
    if (this.els.ruler) {
      const o = this.ruler, cv = this.els.ruler.querySelector('canvas'); cv.width = o.len * dpr; cv.height = o.h * dpr;
      const c = cv.getContext('2d'); c.scale(dpr, dpr); c.strokeStyle = '#334155'; c.fillStyle = '#334155'; c.lineWidth = 1; c.font = '11px system-ui'; c.textAlign = 'center';
      const step = mm < 3 ? 10 : 1; c.beginPath();
      for (let i = 0, x = 0; x <= o.len; i += step, x = i * mm) {
        const L = i % 10 === 0 ? 18 : i % 5 === 0 ? 12 : 7; c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, L);
        if (i % 10 === 0 && (mm * 10 > 22 || i % 50 === 0)) c.fillText(String(i / 10), x, 31);
      }
      c.stroke(); c.globalAlpha = 0.5; c.beginPath(); c.moveTo(0, o.h - 0.5); c.lineTo(o.len, o.h - 0.5); c.stroke();
      c.globalAlpha = 1; c.textAlign = 'left'; c.fillText('cm', 6, o.h - 10);
    }
    if (this.els.prot) {
      const o = this.prot, R = o.R, cv = this.els.prot.querySelector('canvas'); cv.width = 2 * R * dpr; cv.height = (R + 30) * dpr;
      cv.style.width = 2 * R + 'px'; cv.style.height = R + 30 + 'px';
      const c = cv.getContext('2d'); c.scale(dpr, dpr);
      c.fillStyle = 'rgba(240,244,250,.8)'; c.strokeStyle = 'rgba(60,80,110,.6)'; c.beginPath(); c.moveTo(0, R); c.arc(R, R, R, Math.PI, 0); c.lineTo(2 * R, R + 22); c.lineTo(0, R + 22); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#334155'; c.fillStyle = '#334155'; c.font = '10px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.beginPath();
      for (let g = 0; g <= 180; g++) {
        const t = g * Math.PI / 180, L = g % 10 === 0 ? 16 : g % 5 === 0 ? 10 : 5;
        const x1 = R + R * Math.cos(t), y1 = R - R * Math.sin(t), x2 = R + (R - L) * Math.cos(t), y2 = R - (R - L) * Math.sin(t);
        c.moveTo(x1, y1); c.lineTo(x2, y2);
        if (g % 10 === 0) c.fillText(String(g), R + (R - 26) * Math.cos(t), R - (R - 26) * Math.sin(t));
      }
      c.stroke(); c.beginPath(); c.moveTo(R - 8, R); c.lineTo(R + 8, R); c.moveTo(R, R - 8); c.lineTo(R, R + 8); c.stroke();
      const t = o.meas * Math.PI / 180; c.strokeStyle = '#7c3aed'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(R, R); c.lineTo(R + R * Math.cos(t), R - R * Math.sin(t)); c.stroke();
      c.beginPath(); c.arc(R, R, 30, 0, -t, true); c.stroke();
    }
  },
  dragger(d, k) {
    const P = new Map(); let base = null;
    const start = () => {
      const o = this[k], pts = [...P.values()];
      base = { o: { ...o }, n: pts.length };
      if (pts.length >= 2) { base.mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }; base.ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x); }
      else base.p = { ...pts[0] };
    };
    const loc = (e) => { const r = Editor.stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    d.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') return; // a caneta desenha encostada na régua
      e.stopPropagation(); d.setPointerCapture(e.pointerId); P.set(e.pointerId, loc(e)); start();
    });
    d.addEventListener('pointermove', (e) => {
      if (!P.has(e.pointerId)) return; e.stopPropagation(); P.set(e.pointerId, loc(e));
      const pts = [...P.values()], o = this[k]; if (pts.length !== base.n) start();
      if (pts.length >= 2) {
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        let a = base.o.a + (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) - base.ang) * 180 / Math.PI;
        const sn = Math.round(a / 15) * 15; if (Math.abs(a - sn) < 1.5) a = sn;
        const rot = (a - base.o.a) * Math.PI / 180;
        // gira em torno do ponto médio inicial e acompanha o deslocamento
        const piv = k === 'ruler' ? { x: base.o.x, y: base.o.y } : { x: base.o.cx, y: base.o.cy };
        const vx = piv.x - base.mid.x, vy = piv.y - base.mid.y;
        const nx = mid.x + vx * Math.cos(rot) - vy * Math.sin(rot), ny = mid.y + vx * Math.sin(rot) + vy * Math.cos(rot);
        o.a = a; if (k === 'ruler') { o.x = nx; o.y = ny; } else { o.cx = nx; o.cy = ny; }
      } else {
        const p = pts[0], dx = p.x - base.p.x, dy = p.y - base.p.y;
        if (k === 'ruler') { o.x = base.o.x + dx; o.y = base.o.y + dy; } else { o.cx = base.o.cx + dx; o.cy = base.o.cy + dy; }
      }
      this.place(k);
    });
    const end = (e) => { if (P.delete(e.pointerId)) { e.stopPropagation(); if (P.size) start(); } };
    d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
  },
  knobDrag(kn) {
    const loc = (e) => { const r = Editor.stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    let on = false;
    kn.addEventListener('pointerdown', (e) => { e.stopPropagation(); kn.setPointerCapture(e.pointerId); on = true; });
    kn.addEventListener('pointermove', (e) => {
      if (!on) return; e.stopPropagation(); const o = this.prot, p = loc(e), a = o.a * Math.PI / 180;
      const dx = p.x - o.cx, dy = p.y - o.cy; const lx = dx * Math.cos(-a) - dy * Math.sin(-a), ly = dx * Math.sin(-a) + dy * Math.cos(-a);
      o.meas = clamp(Math.atan2(-ly, lx) * 180 / Math.PI, 0, 180); this.place('prot'); this.redraw();
    });
    kn.addEventListener('pointerup', (e) => { on = false; e.stopPropagation(); });
  },
  snapFor(p) {
    const r = this.ruler;
    if (r.on) {
      const a = r.a * Math.PI / 180, d = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -Math.sin(a), y: Math.cos(a) };
      const vx = p.x - r.x, vy = p.y - r.y, lx = vx * d.x + vy * d.y, ly = vx * n.x + vy * n.y;
      if (lx > -20 && lx < r.len + 20) {
        if (ly > -30 && ly < r.h / 2) return { type: 'line', ox: r.x, oy: r.y, dx: d.x, dy: d.y };
        if (ly >= r.h / 2 && ly < r.h + 30) return { type: 'line', ox: r.x + n.x * r.h, oy: r.y + n.y * r.h, dx: d.x, dy: d.y };
      }
    }
    const o = this.prot;
    if (o.on) {
      const a = o.a * Math.PI / 180, dx = p.x - o.cx, dy = p.y - o.cy;
      const lx = dx * Math.cos(-a) - dy * Math.sin(-a), ly = dx * Math.sin(-a) + dy * Math.cos(-a), dist = Math.hypot(lx, ly);
      if (ly < 10 && Math.abs(dist - o.R) < 24) return { type: 'arc', cx: o.cx, cy: o.cy, R: o.R };
      if (Math.abs(ly) < 18 && Math.abs(lx) < o.R) return { type: 'line', ox: o.cx, oy: o.cy, dx: Math.cos(a), dy: Math.sin(a) };
    }
    return null;
  },
  project(s, p) {
    if (s.type === 'line') { const t = (p.x - s.ox) * s.dx + (p.y - s.oy) * s.dy; return { x: s.ox + t * s.dx, y: s.oy + t * s.dy }; }
    const dx = p.x - s.cx, dy = p.y - s.cy, L = Math.hypot(dx, dy) || 1; return { x: s.cx + (dx / L) * s.R, y: s.cy + (dy / L) * s.R };
  },
};

/* ===== Editor de modelos de página ===== */
const TPL_TYPES = [['blank', 'Em branco'], ['lines', 'Linhas'], ['grid', 'Grade'], ['dots', 'Pontos']];
function templateEditor(tplIn, size = { w: 794, h: 1123 }, { onNotewise } = {}) {
  const tpl = { ...DEFAULT_TEMPLATE, ...clone(tplIn) };
  const root = el('div', {});
  // modelos prontos do Notewise
  const nwRow = el('div', { class: 'nw-row' });
  const syncPick = () => $$('button', pick).forEach((b, i) => b.classList.toggle('on', TPL_TYPES[i][0] === tpl.type));
  for (const [k, n] of [['grid', 'Grade · densidade 6'], ['grid7', 'Grade · densidade 7'], ['lines', 'Linha'], ['dots', 'Ponto'], ['blank', 'Em branco']]) {
    nwRow.append(el('button', { type: 'button', class: 'btn', onclick: () => {
      const paper = tpl.paper; Object.assign(tpl, clone(NOTEWISE_TEMPLATES[k])); tpl.paper = paper || '#ffffff';
      if (isDarkPaper(tpl.paper)) tpl.color = '#3a3a3a';
      syncPick(); buildFields(); redraw(); onNotewise && onNotewise();
    } }, n));
  }
  // papéis do Notewise
  const papers = el('div', { class: 'nw-papers' });
  const paintPapers = () => $$('.swatch', papers).forEach((sw) => sw.classList.toggle('sel', sw.dataset.c.toLowerCase() === (tpl.paper || '').toLowerCase()));
  for (const [c, n] of NOTEWISE_PAPERS) {
    const sw = el('div', { class: 'swatch', title: n, style: { background: c }, onclick: () => {
      const wasDark = isDarkPaper(tpl.paper); tpl.paper = c;
      if (isDarkPaper(c) && !wasDark) tpl.color = '#3a3a3a'; else if (!isDarkPaper(c) && wasDark) tpl.color = tpl.nw ? NW_BASE.color : DEFAULT_TEMPLATE.color;
      paintPapers(); buildFields(); redraw();
    } }); sw.dataset.c = c; papers.append(sw);
  }
  // importar de PDF: nota vazia exportada do Notewise (ou qualquer PDF com pauta/grade/pontos)
  const impInfo = el('div', { class: 'lbl-sm', style: { marginTop: '6px' } });
  const imp = el('button', { type: 'button', class: 'btn primary', onclick: async () => {
    const f = await pickFile('application/pdf,.pdf'); if (!f) return;
    imp.disabled = true; impInfo.textContent = 'Lendo o modelo do PDF…';
    try {
      const det = await detectTemplateFromPdf(f);
      for (const k of Object.keys(tpl)) delete tpl[k]; Object.assign(tpl, det);
      impInfo.textContent = '✓ ' + describeCustomTemplate(det) + (Math.abs(det.bh / det.bw - size.h / size.w) > 0.02 ? ' · atenção: a proporção do PDF é diferente desta página' : '');
      syncPick(); paintPapers(); buildFields(); redraw();
    } catch (e) { console.error(e); impInfo.textContent = 'Não consegui ler o PDF: ' + e.message; }
    imp.disabled = false;
  } }, 'Importar de um PDF…');
  root.append(el('div', { class: 'field' }, el('label', {}, 'Modelos do Notewise (folha 3480 × 4000)'), nwRow),
    el('div', { class: 'field' }, el('label', {}, 'Modelo idêntico ao do Notewise: exporte em PDF uma nota vazia, só com o modelo de fundo, e importe aqui'), el('div', {}, imp), impInfo),
    el('div', { class: 'field' }, el('label', {}, 'Cor do papel'), papers));
  setTimeout(paintPapers, 0);
  const pick = el('div', { class: 'tpl-pick' });
  const prev = el('canvas', { class: 'tpl-prev' });
  const fields = el('div', {});
  const redraw = () => { drawTemplatePreview(prev, tpl, size.w, size.h); $$('canvas', pick).forEach((c, i) => drawTemplatePreview(c, { ...tpl, type: TPL_TYPES[i][0], margin: false }, 300, 400)); };
  TPL_TYPES.forEach(([v, n]) => {
    const b = el('button', { type: 'button', class: tpl.type === v ? 'on' : '', onclick: () => { tpl.type = v; $$('button', pick).forEach((x) => x.classList.remove('on')); b.classList.add('on'); buildFields(); redraw(); } }, el('canvas'), n);
    pick.append(b);
  });
  const num = (label, key, min, max, step, unit) => {
    const show = (v) => Math.round(v * 100) / 100;
    const r = el('input', { type: 'range', min, max, step, value: tpl[key] });
    const n = el('input', { type: 'number', min, max, step: 'any', value: show(tpl[key]), style: { width: '80px' } });
    const set = (v) => { v = clamp(+v || min, min, max); tpl[key] = v; r.value = v; n.value = show(v); redraw(); };
    r.addEventListener('input', () => set(r.value)); n.addEventListener('change', () => set(n.value));
    return el('div', { class: 'field' }, el('label', {}, `${label} (${unit})`), el('div', { class: 'grp', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, r, n));
  };
  const color = (label, key) => { const i = el('input', { type: 'color', value: tpl[key], style: { width: '100%', height: '40px', border: '0', background: 'transparent' } }); i.addEventListener('input', () => { tpl[key] = i.value; redraw(); }); return el('div', { class: 'field' }, el('label', {}, label), i); };
  function buildFields() {
    fields.innerHTML = '';
    if (tpl.type === 'custom') { // modelo importado: posições fixas; dá para mudar papel e intensidade
      fields.append(el('p', { class: 'lbl-sm', style: { margin: '0 0 10px' } }, describeCustomTemplate(tpl) + '. As linhas ficam exatamente onde estavam no PDF.'));
      fields.append(el('div', { class: 'row' }, num('Intensidade', 'opacity', 0.1, 1, 0.05, '0–1'), color('Cor do papel', 'paper')));
    } else if (tpl.type !== 'blank') {
      fields.append(el('div', { class: 'row' }, num(tpl.type === 'dots' ? 'Distância entre pontos' : 'Espaçamento / densidade', 'spacing', 6, 120, 1, 'px'), num(tpl.type === 'dots' ? 'Tamanho do ponto' : 'Espessura da linha', 'thickness', 0.25, 6, 0.25, 'px')));
      fields.append(el('div', { class: 'row' }, num('Intensidade', 'opacity', 0.1, 1, 0.05, '0–1'), color('Cor da linha', 'color'), color('Cor do papel', 'paper')));
      const ce = el('input', { type: 'checkbox' }); ce.checked = !!tpl.center; ce.addEventListener('change', () => { tpl.center = ce.checked; redraw(); });
      fields.append(el('label', { class: 'chk', style: { margin: '0 0 12px' } }, ce, 'Centralizar na folha (como no Notewise)'));
      if (tpl.type === 'lines') {
        const m = el('input', { type: 'checkbox' }); m.checked = !!tpl.margin; m.addEventListener('change', () => { tpl.margin = m.checked; redraw(); });
        fields.append(el('div', { class: 'row' }, num('Margem superior', 'top', 0, 300, 2, 'px'), el('div', { class: 'field' }, el('label', {}, 'Margem lateral'), el('label', { class: 'chk' }, m, 'Mostrar linha vermelha')), color('Cor da margem', 'marginColor')));
      }
    } else fields.append(color('Cor do papel', 'paper'));
    // modelos salvos
    const mine = Store.settings.myTemplates;
    const sel = el('select', {}, el('option', { value: '' }, mine.length ? 'Carregar modelo salvo…' : 'Nenhum modelo salvo'), ...mine.map((m, i) => el('option', { value: i }, m.name)));
    sel.addEventListener('change', () => { if (sel.value === '') return; Object.assign(tpl, clone(mine[+sel.value].tpl)); $$('button', pick).forEach((b, i) => b.classList.toggle('on', TPL_TYPES[i][0] === tpl.type)); buildFields(); redraw(); });
    const save = el('button', { type: 'button', class: 'btn', onclick: async () => { const n = await askText('Salvar modelo', '', 'Nome do modelo'); if (n) { mine.push({ name: n, tpl: clone(tpl) }); Store.saveSettings(); toast('Modelo salvo'); buildFields(); } } }, 'Salvar como meu modelo');
    const del = mine.length ? el('button', { type: 'button', class: 'btn ghost', onclick: () => { if (sel.value === '') return toast('Escolha um modelo na lista'); mine.splice(+sel.value, 1); Store.saveSettings(); buildFields(); } }, 'Excluir') : null;
    fields.append(el('div', { class: 'field' }, el('label', {}, 'Meus modelos'), el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, sel, save, del)));
  }
  buildFields();
  root.append(el('div', { class: 'field' }, el('label', {}, 'Modelo'), pick), el('div', { class: 'tpl-layout' }, fields, el('div', {}, el('div', { class: 'lbl-sm', style: { marginBottom: '6px' } }, 'Prévia'), prev)));
  setTimeout(redraw, 30);
  return { el: root, get: () => clone(tpl), setSize: (w, h) => { size = { w, h }; redraw(); }, refresh: () => { syncPick(); paintPapers(); buildFields(); redraw(); } };
}

/* ===== Nova nota ===== */
async function newNoteDialog(folderId) {
  const S = Store.settings;
  const title = el('input', { type: 'text', value: '', placeholder: defaultNoteTitle() });
  let layout = S.layout || 'pages';
  const sizeSel = el('select', {}, ...Object.entries(PAGE_SIZES).map(([k, v]) => el('option', { value: k }, v.label)));
  sizeSel.value = S.pageSize || 'a4';
  const wI = el('input', { type: 'number', min: 200, max: 4000, value: PAGE_SIZES[sizeSel.value].w });
  const hI = el('input', { type: 'number', min: 200, max: 6000, step: 'any', value: Math.round(PAGE_SIZES[sizeSel.value].h * 100) / 100 });
  const te = templateEditor(S.template, { w: +wI.value, h: +hI.value }, { onNotewise: () => { sizeSel.value = 'notewise'; wI.value = PAGE_SIZES.notewise.w; hI.value = Math.round(PAGE_SIZES.notewise.h * 100) / 100; te.setSize(+wI.value, +hI.value); } });
  const sizeRow = el('div', { class: 'row' }, el('div', { class: 'field' }, el('label', {}, 'Tamanho da página'), sizeSel), el('div', { class: 'field' }, el('label', {}, 'Largura (px)'), wI), el('div', { class: 'field' }, el('label', {}, 'Altura (px)'), hI));
  sizeSel.addEventListener('change', () => { const s = PAGE_SIZES[sizeSel.value]; wI.value = s.w; hI.value = Math.round(s.h * 100) / 100; te.setSize(s.w, s.h); });
  for (const i of [wI, hI]) i.addEventListener('change', () => { sizeSel.value = 'custom'; te.setSize(+wI.value, +hI.value); });
  const lay = UI.seg([['pages', 'Páginas'], ['infinite', 'Tela infinita']], layout, (v) => { layout = v; sizeRow.style.display = v === 'pages' ? '' : 'none'; });
  sizeRow.style.display = layout === 'pages' ? '' : 'none';
  const def = el('input', { type: 'checkbox' });
  const body = el('div', {},
    el('div', { class: 'field' }, el('label', {}, 'Título'), title),
    el('div', { class: 'field' }, el('label', {}, 'Formato'), lay),
    sizeRow, te.el,
    el('label', { class: 'chk' }, def, 'Usar estas opções como padrão para novas notas'));
  const ok = await openModal({ title: 'Nova nota', body, wide: true, buttons: [{ label: 'Cancelar', value: false }, { label: 'Criar nota', cls: 'primary', value: true }] });
  if (!ok) return null;
  const tpl = te.get(); const ps = PAGE_SIZES[sizeSel.value];
  const w = clamp(+wI.value || 794, 200, 4000), h0 = clamp(+hI.value || 1123, 200, 6000), h = ps && Math.abs(ps.h - h0) < 0.01 ? ps.h : h0;
  if (def.checked) { S.template = tpl; S.layout = layout; S.pageSize = sizeSel.value; Store.saveSettings(); }
  const note = newNote({ title: title.value.trim() || defaultNoteTitle(), folderId, mode: layout, w, h, template: tpl });
  await Store.putNote(note);
  return note;
}

/* ===== Modelo de página ===== */
async function templateModal(pageIdx = null) {
  const n = Editor.note, cur = pageIdx ?? Editor.currentPageIndex(), curPage = n.pages[cur];
  const te = templateEditor(curPage.template || n.template, { w: curPage.w, h: curPage.h });
  let scope = pageIdx != null ? 'cur' : 'all';
  const nwCode = !curPage.pdf && curPage.nw && curPage.nw.tpl != null ? curPage.nw.tpl : null;
  const opts = [['all', 'Todas as páginas'], ['cur', `Só a página ${cur + 1}`]];
  if (nwCode != null) opts.push(['nw', 'Todas as notas importadas com este modelo do Notewise']);
  const body = el('div', {}, te.el, n.mode === 'pages' ? el('div', { class: 'field' }, el('label', {}, 'Aplicar em'), UI.seg(opts, scope, (v) => (scope = v)),
    nwCode != null ? el('p', { class: 'lbl-sm', style: { marginTop: '6px' } }, 'A última opção troca o modelo em todas as páginas importadas do Notewise que usavam o mesmo modelo desta página, e as próximas importações já virão com ele.') : null) : null);
  const ok = await openModal({ title: 'Modelo de página', body, wide: true, buttons: [{ label: 'Cancelar', value: false }, { label: 'Aplicar', cls: 'primary', value: true }] });
  if (!ok) return;
  const t = te.get();
  if (scope === 'nw') {
    toast('Aplicando nas notas importadas…', 20000);
    const r = await applyTemplateToNotewiseCode(t, nwCode, curPage.nw.v, (i, tot) => toast(`Aplicando nas notas importadas… ${i}/${tot}`, 20000));
    toast(`Modelo aplicado em ${r.pages} página(s) de ${r.notes + 1} nota(s)`, 3000); Library.render && Library.render(); return;
  }
  Editor.recTemplate(() => { if (scope === 'all' || n.mode === 'infinite') { n.template = t; n.pages.forEach((p) => { if (!p.pdf) p.template = null; }); } else curPage.template = t; });
  toast('Modelo aplicado · dá para desfazer', 1400);
}

/* ===== Caixa de páginas (estilo Notewise) ===== */
const PageThumbs = new Map();
function pageSig(p, n) { const L = p.elements.length; return [L, L ? p.elements[L - 1].id : '', JSON.stringify(p.template || n.template), p.pdf ? p.pdf.index : ''].join('|'); }
async function pageThumb(n, p) {
  const sig = pageSig(p, n), c = PageThumbs.get(p.id); if (c && c.sig === sig) return c.url;
  const cv = await renderPageCanvas(n, p, 1, { maxW: 180 }); const url = cv.toDataURL('image/jpeg', 0.7);
  PageThumbs.set(p.id, { sig, url }); return url;
}
const PageManager = {
  root: null, filter: 'all', selecting: false, selected: new Set(),
  open() {
    const n = Editor.note; if (n.mode === 'infinite') return templateModal();
    Editor.commitText(); this.selecting = false; this.selected.clear();
    this.root = el('div', { class: 'pm-back', onpointerdown: (e) => { if (e.target === this.root) this.close(); } });
    $('#modalRoot').append(this.root); this.render();
  },
  close() { if (this.root) this.root.remove(); this.root = null; Editor.afterPagesChanged(); },
  render() {
    const n = Editor.note, cur = Editor.currentPageIndex(); const box = el('div', { class: 'pm' });
    const B = (ic, title, fn, cls = '') => { const b = el('button', { class: 'cbtn ' + cls, title, onclick: fn }); b.innerHTML = icon(ic); return b; };
    const filt = el('select', { class: 'pm-filter' }, el('option', { value: 'all' }, 'Todas as páginas'), el('option', { value: 'bm' }, 'Marcadores'));
    filt.value = this.filter; filt.onchange = () => { this.filter = filt.value; this.render(); };
    const head = el('div', { class: 'pm-head' }, iconEl('pages'), filt, el('span', { class: 'sp' }),
      B('grid', 'Modelo de página', () => { this.close(); templateModal(); }),
      B('file', 'Inserir PDF no fim', () => this.insertPdf()),
      B('plus', 'Nova página no fim', () => { n.pages.push(newPage(n.pages[n.pages.length - 1].pdf ? 794 : n.pages[n.pages.length - 1].w, n.pages[n.pages.length - 1].pdf ? 1123 : n.pages[n.pages.length - 1].h)); Editor.markChanged(); this.render(); }),
      B('checkSq', this.selecting ? 'Sair da seleção' : 'Selecionar páginas', () => { this.selecting = !this.selecting; this.selected.clear(); this.render(); }, this.selecting ? 'soft-on' : ''),
      B('x', 'Fechar', () => this.close()));
    box.append(head);
    if (this.selecting) {
      const nsel = this.selected.size;
      const A = (label, fn, danger) => el('button', { class: 'btn' + (danger ? ' danger' : ''), disabled: !nsel && label !== 'Selecionar todas', onclick: fn }, label);
      box.append(el('div', { class: 'pm-actions' }, el('b', {}, nsel ? `${nsel} selecionada(s)` : 'Toque nas páginas para selecionar'), el('span', { class: 'sp' }),
        A('Selecionar todas', () => { n.pages.forEach((p) => this.selected.add(p.id)); this.render(); }),
        A('Marcar', () => { const all = n.pages.filter((p) => this.selected.has(p.id)); const v = !all.every((p) => p.bookmark); all.forEach((p) => (p.bookmark = v)); Editor.markChanged(); this.render(); }),
        A('Duplicar', () => { const ids = [...this.selected]; for (const id of ids) { const i = n.pages.findIndex((p) => p.id === id); const c = clone(n.pages[i]); c.id = uid(); c.elements.forEach((e) => (e.id = uid())); n.pages.splice(i + 1, 0, c); } Editor.markChanged(); this.selected.clear(); this.render(); }),
        A('Excluir', async () => {
          if (this.selected.size >= n.pages.length) return toast('A nota precisa de pelo menos uma página');
          if (!(await confirmBox('Excluir páginas', `Excluir ${this.selected.size} página(s)? Isso não pode ser desfeito.`, 'Excluir', true))) return;
          n.pages = n.pages.filter((p) => !this.selected.has(p.id)); Editor.undoStack = []; Editor.redoStack = []; Editor.sel = null; Editor.markChanged(); this.selected.clear(); this.render();
        }, true)));
    }
    const grid = el('div', { class: 'pm-grid' });
    n.pages.forEach((p, i) => {
      if (this.filter === 'bm' && !p.bookmark) return;
      const img = el('img', { alt: '' });
      const bm = el('button', { class: 'pm-bm' + (p.bookmark ? ' on' : ''), title: p.bookmark ? 'Remover marcador' : 'Marcar página', onclick: (e) => { e.stopPropagation(); p.bookmark = !p.bookmark; Editor.markChanged(); this.render(); } }); bm.innerHTML = icon('bookmark');
      const thumb = el('div', { class: 'pm-thumb' + (i === cur ? ' cur' : '') + (this.selected.has(p.id) ? ' sel' : ''), style: { aspectRatio: `${p.w}/${p.h}` } }, img, bm);
      if (this.selecting) thumb.append(el('span', { class: 'pm-check' }, this.selected.has(p.id) ? '✓' : ''));
      const mb = el('button', { class: 'pm-num', onclick: (e) => { e.stopPropagation(); this.pageMenu(mb, i); } }, String(i + 1), iconEl('down'));
      const card = el('div', { class: 'pm-card' }, thumb, mb); card.dataset.id = p.id;
      this.dragify(card, () => {
        if (this.selecting) { this.selected.has(p.id) ? this.selected.delete(p.id) : this.selected.add(p.id); this.render(); }
        else { const idx = n.pages.indexOf(p); this.close(); Editor.goToPage(idx); }
      });
      grid.append(card);
      pageThumb(n, p).then((u) => (img.src = u)).catch(() => {});
    });
    if (!grid.childElementCount) grid.append(el('p', { style: { color: 'var(--chmuted)' } }, 'Nenhuma página marcada. Toque no marcador de uma página para encontrá-la aqui depois.'));
    box.append(grid, el('div', { class: 'pm-hint' }, 'Toque para abrir · segure e arraste para mudar a ordem · ▾ para mais opções'));
    this.root.innerHTML = ''; this.root.append(box);
  },
  dragify(card, tap) { // segurar e arrastar para reordenar
    let t = null, drag = false, sx = 0, sy = 0, id = null;
    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.pm-num,.pm-bm')) return;
      sx = e.clientX; sy = e.clientY; id = e.pointerId; drag = false; card.setPointerCapture(id);
      t = setTimeout(() => { if (this.filter === 'all') { drag = true; card.classList.add('drag'); if (navigator.vibrate) navigator.vibrate(10); } }, 380);
    });
    card.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      if (!drag) { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { clearTimeout(t); t = null; } return; }
      card.style.visibility = 'hidden'; const over = document.elementFromPoint(e.clientX, e.clientY); card.style.visibility = '';
      const target = over && over.closest('.pm-card'); if (!target || target === card) return;
      const r = target.getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) target.before(card); else target.after(card);
    });
    const end = (e) => {
      if (e.pointerId !== id) return; clearTimeout(t); id = null;
      if (drag) {
        card.classList.remove('drag'); drag = false; const n = Editor.note;
        const order = $$('.pm-card', card.parentNode).map((c) => n.pages.find((p) => p.id === c.dataset.id)).filter(Boolean);
        if (order.length === n.pages.length) { n.pages = order; Editor.markChanged(); }
        this.render();
      } else if (t !== null || Math.hypot(e.clientX - sx, e.clientY - sy) < 10) tap();
      t = null;
    };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', (e) => { clearTimeout(t); id = null; drag = false; card.classList.remove('drag'); });
  },
  pageMenu(anchor, i) {
    const n = Editor.note, p = n.pages[i];
    const blank = () => newPage(p.pdf ? 794 : p.w, p.pdf ? 1123 : p.h, p.pdf ? null : p.template ? clone(p.template) : null);
    menu(anchor, [
      { label: 'Abrir página', icon: 'eye', run: () => { this.close(); Editor.goToPage(i); } },
      { label: 'Nova página antes', icon: 'up', run: () => { n.pages.splice(i, 0, blank()); Editor.markChanged(); this.render(); } },
      { label: 'Nova página depois', icon: 'down', run: () => { n.pages.splice(i + 1, 0, blank()); Editor.markChanged(); this.render(); } },
      { label: 'Duplicar', icon: 'copy', run: () => { const c = clone(p); c.id = uid(); c.elements.forEach((e) => (e.id = uid())); n.pages.splice(i + 1, 0, c); Editor.markChanged(); this.render(); } },
      { label: 'Mover para o início', icon: 'up', run: () => { n.pages.splice(i, 1); n.pages.unshift(p); Editor.markChanged(); this.render(); } },
      { label: 'Mover para o fim', icon: 'down', run: () => { n.pages.splice(i, 1); n.pages.push(p); Editor.markChanged(); this.render(); } },
      { label: p.bookmark ? 'Remover marcador' : 'Marcar página', icon: 'bookmark', run: () => { p.bookmark = !p.bookmark; Editor.markChanged(); this.render(); } },
      { label: 'Modelo desta página…', icon: 'grid', run: () => { this.close(); templateModal(i); } },
      '-',
      { label: 'Excluir página', icon: 'trash', danger: true, run: async () => {
        if (n.pages.length <= 1) return toast('A nota precisa de pelo menos uma página');
        if (!(await confirmBox('Excluir página', `Excluir a página ${i + 1}? Isso não pode ser desfeito.`, 'Excluir', true))) return;
        n.pages.splice(i, 1); Editor.undoStack = []; Editor.redoStack = []; Editor.sel = null; Editor.markChanged(); this.render();
      } },
    ]);
  },
  async insertPdf() {
    const f = await pickFile('application/pdf'); if (!f) return; toast('Importando PDF…', 8000);
    try { const pages = await importPdfFile(f); Editor.note.pages.push(...pages); Editor.markChanged(); toast(`${pages.length} página(s) inseridas`); this.render(); }
    catch (e) { toast('Erro ao abrir PDF: ' + e.message, 5000); }
  },
};
async function pagesPanel() { PageManager.open(); }

/* ===== Busca ===== */
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function snippet(text, q) { const t = text.replace(/\s+/g, ' '), i = norm(t).indexOf(norm(q)); const a = Math.max(0, i - 30); return (a ? '…' : '') + t.slice(a, i + q.length + 50) + (i + q.length + 50 < t.length ? '…' : ''); }
function noteSearchPop(anchor) {
  const n = Editor.note; const inp = el('input', { class: 'tp-input', placeholder: 'Buscar nesta nota (textos e escrita à mão)', style: { marginBottom: '8px' } });
  const list = el('div', { style: { maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' } });
  const run = () => {
    list.innerHTML = ''; const q = inp.value.trim(); if (!q) return;
    let k = 0;
    n.pages.forEach((p, i) => p.elements.forEach((e) => {
      if (e.type !== 'text' || !norm(e.text).includes(norm(q)) || k > 60) return; k++;
      list.append(el('button', { class: 'pm-res', onclick: () => { closePop(); Editor.focusElement(i, e.id); } }, el('b', {}, n.mode === 'infinite' ? 'Nota' : `Pág. ${i + 1}`), ' ', snippet(e.text, q)));
    }));
    n.pages.forEach((p, i) => {
      if (!p.ocr || !p.ocr.text || !norm(p.ocr.text).includes(norm(q)) || k > 60) return; k++;
      list.append(el('button', { class: 'pm-res', onclick: () => { closePop(); Editor.goToPage(i); } }, el('b', {}, (n.mode === 'infinite' ? 'Nota' : `Pág. ${i + 1}`) + ' ✍'), ' ', snippet(p.ocr.text, q)));
    });
    if (!k) list.append(el('p', { style: { color: 'var(--chmuted)', margin: '6px 2px' } }, OCR.enabled() ? 'Nada encontrado. A escrita à mão é lida em segundo plano alguns segundos depois de você parar de escrever (precisa de internet).' : 'Nada encontrado nos textos digitados. Ligue a leitura da escrita à mão nas Configurações para buscar também nela.'));
  };
  inp.addEventListener('input', run);
  const pop = openPop(anchor, el('div', { style: { width: 'min(380px, 86vw)' } }, inp, list));
  pop.style.background = 'var(--ch)'; pop.style.color = 'var(--chfg)'; setTimeout(() => inp.focus(), 50);
}

/* ===== Exportação ===== */
function exportMenu(anchor) {
  menu(anchor, [
    { label: 'Exportar nota em PDF', icon: 'file', run: () => exportPdfFlow(Editor.note) },
    { label: 'Página atual como imagem (PNG)', icon: 'image', run: async () => { const p = Editor.note.pages[Editor.currentPageIndex()]; const cv = await renderPageCanvas(Editor.note, p, 2); cv.toBlob((b) => downloadBlob(b, safeName(Editor.note.title) + '.png')); } },
    { label: 'Compartilhar PDF…', icon: 'download', run: () => exportPdfFlow(Editor.note, true) },
  ]);
}
async function exportPdfFlow(note, share = false) {
  try {
    if (Editor.note && Editor.note.id === note.id) await Editor.saveNow();
    const blob = await exportNotePdf(note, (i, t) => toast(`Gerando PDF… ${i}/${t}`, 4000));
    const name = safeName(note.title) + '.pdf';
    if (share && navigator.canShare) { const f = new File([blob], name, { type: 'application/pdf' }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: note.title }); return; } }
    downloadBlob(blob, name); toast('PDF gerado');
  } catch (e) { console.error(e); toast('Erro ao exportar: ' + e.message, 5000); }
}

function defaultNoteTitle(d = new Date()) { const p = (n) => String(n).padStart(2, '0'); return `Nova nota ${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; }
