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
      const t = o.meas * Math.PI / 180; c.strokeStyle = '#2563eb'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(R, R); c.lineTo(R + R * Math.cos(t), R - R * Math.sin(t)); c.stroke();
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
function templateEditor(tplIn, size = { w: 794, h: 1123 }) {
  const tpl = { ...DEFAULT_TEMPLATE, ...clone(tplIn) };
  const root = el('div', {});
  const pick = el('div', { class: 'tpl-pick' });
  const prev = el('canvas', { class: 'tpl-prev' });
  const fields = el('div', {});
  const redraw = () => { drawTemplatePreview(prev, tpl, size.w, size.h); $$('canvas', pick).forEach((c, i) => drawTemplatePreview(c, { ...tpl, type: TPL_TYPES[i][0], margin: false }, 300, 400)); };
  TPL_TYPES.forEach(([v, n]) => {
    const b = el('button', { type: 'button', class: tpl.type === v ? 'on' : '', onclick: () => { tpl.type = v; $$('button', pick).forEach((x) => x.classList.remove('on')); b.classList.add('on'); buildFields(); redraw(); } }, el('canvas'), n);
    pick.append(b);
  });
  const num = (label, key, min, max, step, unit) => {
    const r = el('input', { type: 'range', min, max, step, value: tpl[key] });
    const n = el('input', { type: 'number', min, max, step, value: tpl[key], style: { width: '80px' } });
    const set = (v) => { v = clamp(+v || min, min, max); tpl[key] = v; r.value = v; n.value = v; redraw(); };
    r.addEventListener('input', () => set(r.value)); n.addEventListener('change', () => set(n.value));
    return el('div', { class: 'field' }, el('label', {}, `${label} (${unit})`), el('div', { class: 'grp', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, r, n));
  };
  const color = (label, key) => { const i = el('input', { type: 'color', value: tpl[key], style: { width: '100%', height: '40px', border: '0', background: 'transparent' } }); i.addEventListener('input', () => { tpl[key] = i.value; redraw(); }); return el('div', { class: 'field' }, el('label', {}, label), i); };
  function buildFields() {
    fields.innerHTML = '';
    if (tpl.type !== 'blank') {
      fields.append(el('div', { class: 'row' }, num(tpl.type === 'dots' ? 'Distância entre pontos' : 'Espaçamento / densidade', 'spacing', 6, 120, 1, 'px'), num(tpl.type === 'dots' ? 'Tamanho do ponto' : 'Espessura da linha', 'thickness', 0.25, 6, 0.25, 'px')));
      fields.append(el('div', { class: 'row' }, num('Intensidade', 'opacity', 0.1, 1, 0.05, '0–1'), color('Cor da linha', 'color'), color('Cor do papel', 'paper')));
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
  return { el: root, get: () => clone(tpl), setSize: (w, h) => { size = { w, h }; redraw(); } };
}

/* ===== Nova nota ===== */
async function newNoteDialog(folderId) {
  const S = Store.settings;
  const title = el('input', { type: 'text', value: '', placeholder: 'Ex.: Direito Civil — Aula 3' });
  let layout = S.layout || 'pages';
  const sizeSel = el('select', {}, ...Object.entries(PAGE_SIZES).map(([k, v]) => el('option', { value: k }, v.label)));
  sizeSel.value = S.pageSize || 'a4';
  const wI = el('input', { type: 'number', min: 200, max: 4000, value: PAGE_SIZES[sizeSel.value].w });
  const hI = el('input', { type: 'number', min: 200, max: 6000, value: PAGE_SIZES[sizeSel.value].h });
  const te = templateEditor(S.template, { w: +wI.value, h: +hI.value });
  const sizeRow = el('div', { class: 'row' }, el('div', { class: 'field' }, el('label', {}, 'Tamanho da página'), sizeSel), el('div', { class: 'field' }, el('label', {}, 'Largura (px)'), wI), el('div', { class: 'field' }, el('label', {}, 'Altura (px)'), hI));
  sizeSel.addEventListener('change', () => { const s = PAGE_SIZES[sizeSel.value]; wI.value = s.w; hI.value = s.h; te.setSize(s.w, s.h); });
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
  const tpl = te.get(); const w = clamp(+wI.value || 794, 200, 4000), h = clamp(+hI.value || 1123, 200, 6000);
  if (def.checked) { S.template = tpl; S.layout = layout; S.pageSize = sizeSel.value; Store.saveSettings(); }
  const note = newNote({ title: title.value.trim() || 'Nota sem título', folderId, mode: layout, w, h, template: tpl });
  await Store.putNote(note);
  return note;
}

/* ===== Painel de páginas e modelo ===== */
async function pagesPanel() {
  const n = Editor.note, cur = Editor.currentPageIndex(), curPage = n.pages[cur];
  const te = templateEditor(curPage.template || n.template, { w: curPage.w, h: curPage.h });
  let scope = 'all';
  const body = el('div', {});
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Modelo de página'), te.el,
    n.mode === 'pages' ? el('div', { class: 'field' }, el('label', {}, 'Aplicar em'), UI.seg([['all', 'Todas as páginas'], ['cur', `Só a página ${cur + 1}`]], scope, (v) => (scope = v))) : null,
    el('button', { class: 'btn primary', onclick: () => {
      const t = te.get();
      if (scope === 'all' || n.mode === 'infinite') { n.template = t; n.pages.forEach((p) => { if (!p.pdf) p.template = null; }); }
      else curPage.template = t;
      Editor.markChanged(); Editor.requestRender(); toast('Modelo aplicado');
    } }, 'Aplicar modelo')));
  if (n.mode === 'pages') {
    const list = el('div', { class: 'page-list' });
    const acts = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' } });
    const close = () => $('#modalRoot').innerHTML = '';
    const A = (label, ic, fn) => { const b = el('button', { class: 'btn', onclick: fn }); b.innerHTML = icon(ic) + label; acts.append(b); };
    A('Nova página', 'plus', () => { Editor.addPage(cur); close(); });
    A('Duplicar', 'copy', () => { Editor.duplicatePage(cur); close(); });
    A('Subir', 'back', () => { Editor.movePage(cur, -1); close(); });
    A('Descer', 'download', () => { Editor.movePage(cur, 1); close(); });
    A('Inserir PDF', 'file', async () => { const f = await pickFile('application/pdf'); if (!f) return; close(); toast('Importando PDF…', 8000); try { const pages = await importPdfFile(f); n.pages.splice(cur + 1, 0, ...pages); Editor.afterPagesChanged(); Editor.goToPage(cur + 1); toast(`${pages.length} página(s) inseridas`); } catch (e) { toast('Erro ao abrir PDF: ' + e.message, 5000); } });
    A('Excluir página', 'trash', async () => { if (await confirmBox('Excluir página', `Excluir a página ${cur + 1}? Isso não pode ser desfeito.`, 'Excluir', true)) { Editor.deletePage(cur); close(); } });
    body.append(el('div', { class: 'set-sec' }, el('h3', {}, `Páginas (atual: ${cur + 1} de ${n.pages.length})`), acts, list));
    (async () => {
      for (let i = 0; i < n.pages.length; i++) {
        const box = el('div', { class: 'pg' + (i === cur ? ' on' : ''), onclick: () => { Editor.goToPage(i); close(); } }, el('span', {}, String(i + 1)));
        list.append(box);
      }
      for (let i = 0; i < n.pages.length && list.isConnected !== false; i++) {
        const cv = await renderPageCanvas(n, n.pages[i], 1, { maxW: 120 }); const img = el('img', { src: cv.toDataURL('image/jpeg', 0.6) });
        list.children[i] && list.children[i].prepend(img);
      }
    })();
  }
  await openModal({ title: 'Páginas e modelo', body, wide: true, buttons: [{ label: 'Fechar', cls: 'primary' }] });
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
