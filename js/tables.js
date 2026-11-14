'use strict';
/* ===== Tabelas: células, linhas, colunas, mesclagem — e a escrita acompanha as células ===== */
const Tables = {
  dims(e) {
    const cw0 = e.colW && e.colW.length === e.cols ? e.colW : Array(e.cols).fill(1), rh0 = e.rowH && e.rowH.length === e.rows ? e.rowH : Array(e.rows).fill(1);
    const sw = cw0.reduce((a, b) => a + b, 0) || 1, sh = rh0.reduce((a, b) => a + b, 0) || 1;
    return { cw: cw0.map((v) => (v * e.w) / sw), rh: rh0.map((v) => (v * e.h) / sh) };
  },
  cellAt(e, x, y) {
    if (e.rot) { const c = rawCenter(e); [x, y] = rotPt(x, y, c.x, c.y, -e.rot); }
    const g = tableGrid(e); if (x < g.xs[0] || x > g.xs[e.cols] || y < g.ys[0] || y > g.ys[e.rows]) return null;
    let c = 0, r = 0; while (c < e.cols - 1 && x > g.xs[c + 1]) c++; while (r < e.rows - 1 && y > g.ys[r + 1]) r++;
    return { r, c };
  },
  norm(r1, c1, r2, c2) { return { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) }; },
  expand(e, rg) { // inclui mesclagens que cruzam a seleção
    let { r1, c1, r2, c2 } = rg, changed = true;
    while (changed) {
      changed = false;
      for (const m of e.merges || []) {
        const mr2 = m.r + m.rs - 1, mc2 = m.c + m.cs - 1;
        if (m.r <= r2 && mr2 >= r1 && m.c <= c2 && mc2 >= c1 && (m.r < r1 || mr2 > r2 || m.c < c1 || mc2 > c2)) { r1 = Math.min(r1, m.r); c1 = Math.min(c1, m.c); r2 = Math.max(r2, mr2); c2 = Math.max(c2, mc2); changed = true; }
      }
    }
    return { r1, c1, r2, c2 };
  },
  rect(e, rg) { const g = tableGrid(e); return { x: g.xs[rg.c1], y: g.ys[rg.r1], w: g.xs[rg.c2 + 1] - g.xs[rg.c1], h: g.ys[rg.r2 + 1] - g.ys[rg.r1] }; },
  attached(page, e, exclude = new Set()) { // escrita e itens cujo centro está dentro da tabela
    const out = [];
    for (const x of page.elements) {
      if (x === e || x.type === 'table' || exclude.has(x.id)) continue;
      const b = elBBox(x); let cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (e.rot) { const c = rawCenter(e); [cx, cy] = rotPt(cx, cy, c.x, c.y, -e.rot); }
      if (cx >= e.x && cx <= e.x + e.w && cy >= e.y && cy <= e.y + e.h) out.push(x);
    }
    return out;
  },
  /* Reposiciona a escrita: cada item segue a sua célula (rowMap/colMap: índice antigo → novo, -1 = apagado) */
  relayout(page, oldE, newE, rowMap, colMap, attached) {
    const go = tableGrid(oldE), gn = tableGrid(newE), map = new Map(), removed = [];
    for (const x of attached || this.attached(page, oldE)) {
      const b = elBBox(x), cell = this.cellAt(oldE, b.x + b.w / 2, b.y + b.h / 2); if (!cell) continue;
      const nr = rowMap ? rowMap[cell.r] : cell.r, nc = colMap ? colMap[cell.c] : cell.c;
      if (nr < 0 || nc < 0 || nr == null || nc == null) { removed.push(x); continue; }
      const dx = gn.xs[nc] - go.xs[cell.c], dy = gn.ys[nr] - go.ys[cell.r];
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) map.set(x.id, transformEl(x, { ox: 0, oy: 0, sx: 1, sy: 1, dx, dy }));
    }
    map.set(newE.id, newE);
    return { map, removed };
  },
  remap(e, rowMap, colMap, rows, cols) { // mesclagens e cores acompanham as mudanças de índice
    const n = { ...e };
    n.merges = [];
    for (const m of e.merges || []) {
      const rs = []; for (let r = m.r; r < m.r + m.rs; r++) if (rowMap[r] >= 0) rs.push(rowMap[r]);
      const cs = []; for (let c = m.c; c < m.c + m.cs; c++) if (colMap[c] >= 0) cs.push(colMap[c]);
      if (!rs.length || !cs.length) continue;
      const nm = { r: Math.min(...rs), c: Math.min(...cs), rs: Math.max(...rs) - Math.min(...rs) + 1, cs: Math.max(...cs) - Math.min(...cs) + 1 };
      if (nm.rs * nm.cs > 1) n.merges.push(nm);
    }
    n.cellFill = {};
    for (const [k, v] of Object.entries(e.cellFill || {})) { const [r, c] = k.split(',').map(Number); if (rowMap[r] >= 0 && colMap[c] >= 0) n.cellFill[rowMap[r] + ',' + colMap[c]] = v; }
    n.rows = rows; n.cols = cols; return n;
  },
  ident(n) { return Array.from({ length: n }, (_, i) => i); },
  insertRows(e, at, count = 1) {
    const { cw, rh } = this.dims(e), hNew = rh[Math.min(Math.max(at - 1, 0), rh.length - 1)];
    const rowMap = this.ident(e.rows).map((r) => (r >= at ? r + count : r));
    const n = this.remap(e, rowMap, this.ident(e.cols), e.rows + count, e.cols);
    for (const m of n.merges) { const orig = (e.merges || []).find((o) => o.c === m.c && o.cs === m.cs && o.r < at && o.r + o.rs > at); if (orig && m.r < at) m.rs += count; } // linha nova dentro de um bloco mesclado
    const nrh = rh.slice(); nrh.splice(at, 0, ...Array(count).fill(hNew));
    n.rowH = nrh; n.colW = cw; n.h = e.h + hNew * count; return { n, rowMap, colMap: null };
  },
  insertCols(e, at, count = 1) {
    const { cw, rh } = this.dims(e), wNew = cw[Math.min(Math.max(at - 1, 0), cw.length - 1)];
    const colMap = this.ident(e.cols).map((c) => (c >= at ? c + count : c));
    const n = this.remap(e, this.ident(e.rows), colMap, e.rows, e.cols + count);
    for (const m of n.merges) { const orig = (e.merges || []).find((o) => o.r === m.r && o.rs === m.rs && o.c < at && o.c + o.cs > at); if (orig && m.c < at) m.cs += count; }
    const ncw = cw.slice(); ncw.splice(at, 0, ...Array(count).fill(wNew));
    n.colW = ncw; n.rowH = rh; n.w = e.w + wNew * count; return { n, rowMap: null, colMap };
  },
  deleteRows(e, r1, r2) {
    if (r2 - r1 + 1 >= e.rows) return null;
    const { cw, rh } = this.dims(e); let k = 0; const rowMap = this.ident(e.rows).map((r) => (r >= r1 && r <= r2 ? -1 : k++));
    const n = this.remap(e, rowMap, this.ident(e.cols), e.rows - (r2 - r1 + 1), e.cols);
    const del = rh.slice(r1, r2 + 1).reduce((a, b) => a + b, 0); const nrh = rh.filter((_, i) => i < r1 || i > r2);
    n.rowH = nrh; n.colW = cw; n.h = e.h - del; return { n, rowMap, colMap: null };
  },
  deleteCols(e, c1, c2) {
    if (c2 - c1 + 1 >= e.cols) return null;
    const { cw, rh } = this.dims(e); let k = 0; const colMap = this.ident(e.cols).map((c) => (c >= c1 && c <= c2 ? -1 : k++));
    const n = this.remap(e, this.ident(e.rows), colMap, e.rows, e.cols - (c2 - c1 + 1));
    const del = cw.slice(c1, c2 + 1).reduce((a, b) => a + b, 0); const ncw = cw.filter((_, i) => i < c1 || i > c2);
    n.colW = ncw; n.rowH = rh; n.w = e.w - del; return { n, rowMap: null, colMap };
  },
  resizeRow(e, r, h) { const { cw, rh } = this.dims(e); const d = h - rh[r]; const nrh = rh.slice(); nrh[r] = h; return { ...e, rowH: nrh, colW: cw, h: e.h + d }; },
  resizeCol(e, c, w) { const { cw, rh } = this.dims(e); const d = w - cw[c]; const ncw = cw.slice(); ncw[c] = w; return { ...e, colW: ncw, rowH: rh, w: e.w + d }; },
};

/* ===== Editor: ajustes ao mover/redimensionar (diretrizes, objetos, ângulo, proporção) e edição de tabelas ===== */
Object.assign(Editor, {
  guides: null, tsel: null, tPreview: null,
  snapOn(k) { return Store.settings[k] !== false; },
  /* prepara a ação de mover/redimensionar: alvos de alinhamento e escrita presa às tabelas */
  prepSel(a) {
    a.prep = true;
    const page = this.pageById(this.sel.pageId), els = this.selElements();
    a.page = page; a.pi = this.pageIdx(page); a.b0 = bboxUnion(els);
    const attached = new Set();
    for (const e of els) if (e.type === 'table') for (const x of Tables.attached(page, e, this.sel.ids)) attached.add(x.id);
    a.attached = attached;
    const single = els.length === 1 ? els[0] : null; a.el1 = single;
    a.free = !!(single && single.type !== 'stroke' && !(single.type === 'shape' && (single.kind === 'poly' || single.kind === 'line' || single.kind === 'arrow')) && !single.rot);
    if (a.free) { a.rb = rawBox(single); a.ratio = a.rb.w / Math.max(a.rb.h, 0.01); a.el = single; }
    // alvos: diretrizes da página e bordas/centros de outros objetos
    const tx = [], ty = [];
    if (this.snapOn('snapPage') && this.note.mode !== 'infinite') { tx.push([0, 'p'], [page.w / 2, 'p'], [page.w, 'p']); ty.push([0, 'p'], [page.h / 2, 'p'], [page.h, 'p']); }
    if (this.snapOn('snapObjects')) for (const x of page.elements) {
      if (this.sel.ids.has(x.id) || attached.has(x.id) || x.type === 'stroke') continue;
      const b = elBBox(x); tx.push([b.x, 'o'], [b.x + b.w / 2, 'o'], [b.x + b.w, 'o']); ty.push([b.y, 'o'], [b.y + b.h / 2, 'o'], [b.y + b.h, 'o']);
    }
    a.tx = tx; a.ty = ty;
    const tpl = page.template || this.note.template;
    a.grid = this.snapOn('snapPage') && tpl && tpl.type !== 'blank' && this.note.mode !== 'infinite' ? tpl : null;
  },
  gridLines(tpl, page, axis) { // posição das linhas do modelo (para grudar na pauta/grade)
    if (tpl.type === 'custom') return customGridLines(tpl, page, axis);
    const s = +tpl.spacing; if (!s) return null;
    let o = 0;
    if (tpl.center) { const L = axis ? page.h : page.w; const n = Math.floor((L - s) / s + 1e-3); o = (L - n * s) / 2; if (axis && tpl.dy) o = ((o + +tpl.dy) % s + s) % s; }
    else if (axis && tpl.type === 'lines') o = +tpl.top || 0;
    if (!axis && tpl.type === 'lines') return null; // pauta só tem linhas horizontais
    return { o, s };
  },
  snap1(vals, targets, grid, tol) { // melhor ajuste de um eixo: vals = posições do objeto (borda, centro…)
    if (this.action && this.action.noSnap) return null; // segundo dedo na tela: movimento livre
    let best = null;
    for (const v of vals) {
      for (const [t] of targets) { const d = t - v; if (Math.abs(d) < tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t }; }
      if (grid) { const k = Math.round((v - grid.o) / grid.s), t = grid.o + k * grid.s, d = t - v; if (Math.abs(d) < tol * 0.75 && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t }; }
    }
    return best;
  },
  setGuides(a, gx, gy) {
    const page = a.page, L = [];
    const H = this.note.mode === 'infinite' ? 4000 : page.h, W = this.note.mode === 'infinite' ? 4000 : page.w;
    if (gx) L.push([gx.at, 0, gx.at, H]); if (gy) L.push([0, gy.at, W, gy.at]);
    this.guides = L.length ? { pi: a.pi, lines: L } : null;
  },
  drawGuides() {
    const g = this.guides; if (!g || !this.note) return;
    const ctx = this.ctx; this.pageTf(ctx, g.pi); ctx.save(); ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 1.2 / this.cam.z; ctx.setLineDash([6 / this.cam.z, 4 / this.cam.z]);
    ctx.beginPath(); for (const [x1, y1, x2, y2] of g.lines) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); } ctx.stroke(); ctx.restore();
  },
  /* mover / redimensionar / girar a seleção, com ajustes */
  moveSel(p) {
    const a = this.action, z = this.cam.z, tol = 9 / z;
    if (!a.prep) this.prepSel(a);
    const b = a.b0;
    if (a.kind === 'move') {
      let dx = (p.x - a.start.x) / z, dy = (p.y - a.start.y) / z;
      const sx = this.snap1([b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx], a.tx, a.grid && this.gridLines(a.grid, a.page, 0), tol);
      let sy = this.snap1([b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy], a.ty, a.grid && this.gridLines(a.grid, a.page, 1), tol);
      if (sx) dx += sx.d; if (sy) dy += sy.d;
      const t1 = a.el1;
      if (t1 && t1.type === 'text' && !a.noSnap) { // texto: base da 1ª linha gruda na pauta; com "alinhar às linhas" sempre fica sobre elas
        const g = this.ruledFor(a.page), L = layoutText(t1), pad = t1.sticky ? STICKY_PAD : 0;
        if (g && t1.ruled) { const k = Math.round((b.y + dy - g.o) / g.s); dy = g.o + k * g.s - b.y; }
        else if (g && this.snapOn('snapPage')) { const base = b.y + pad + L.lines[0].base + dy, k = Math.round((base - g.o) / g.s), d = g.o + k * g.s - base; if (Math.abs(d) < tol) { dy += d; sy = { d, at: g.o + k * g.s }; } }
      }
      this.setGuides(a, sx, sy); this.ratioLabel = a.noSnap ? 'livre' : null;
      this.selTf = { ox: b.x, oy: b.y, sx: 1, sy: 1, dx, dy };
    } else if (a.kind === 'rotate') {
      const c = { x: a.box.x + a.box.w / 2, y: a.box.y + a.box.h / 2 };
      let ang = Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(a.start.y - c.y, a.start.x - c.x);
      if (this.snapOn('snapAngle') && !a.noSnap) { const sn = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12); if (Math.abs(ang - sn) < 0.06) ang = sn; } // gruda a cada 15°
      this.selTf = { ox: b.x, oy: b.y, sx: 1, sy: 1, dx: 0, dy: 0, rot: ang, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
    } else if (a.free) { // um objeto só: largura e altura livres
      const rb = a.rb; let w = Math.max(8 / z, rb.w + (p.x - a.start.x) / z), h = Math.max(8 / z, rb.h + (p.y - a.start.y) / z);
      const sx = this.snap1([rb.x + w], a.tx, a.grid && this.gridLines(a.grid, a.page, 0), tol), sy = this.snap1([rb.y + h], a.ty, a.grid && this.gridLines(a.grid, a.page, 1), tol);
      if (sx) w += sx.d; if (sy) h += sy.d;
      let label = null;
      if (this.snapOn('snapRatio') && !a.noSnap) {
        for (const [r, lab] of [[1, '1:1'], [a.ratio, 'proporção original']]) { if (Math.abs(w / h - r) / r < 0.06) { h = w / r; label = lab; break; } }
      }
      this.setGuides(a, sx, label ? null : sy); this.ratioLabel = a.noSnap ? 'livre' : label;
      const t = { ox: rb.x, oy: rb.y, sx: w / rb.w, sy: h / rb.h, dx: 0, dy: 0, free: true };
      if (a.el.type === 'table') { const n = transformEl(a.el, t); this.tPreview = Tables.relayout(a.page, a.el, n, null, null, a.page.elements.filter((x) => a.attached.has(x.id))); this.selTf = null; }
      else this.selTf = t;
    } else {
      const bw = a.box.w, bh = a.box.h;
      const s = Math.max(0.05, Math.max((bw + (p.x - a.start.x)) / bw, (bh + (p.y - a.start.y)) / bh));
      this.selTf = { ox: b.x, oy: b.y, sx: s, sy: s, dx: 0, dy: 0 };
    }
    this.requestRender();
  },
  endMoveSel() {
    const a = this.action || this._lastAction; this.guides = null; this.ratioLabel = null;
    if (this.tPreview) return this.commitTablePreview();
    const t = this.selTf; this.selTf = null; if (!t) return this.requestRender();
    const page = this.pageById(this.sel.pageId), att = (a && a.attached) || new Set();
    const apply = (e) => (t.rot != null ? rotateEl(e, t.rot, t.cx, t.cy) : transformEl(e, t));
    for (const e of this.selElements()) this.recReplace(page, e, apply(e));
    if (!t.free) for (const e of page.elements.filter((x) => att.has(x.id))) this.recReplace(page, e, apply(e)); // escrita dentro da tabela vai junto
    this.opCommit();
  },
  commitTablePreview() {
    const pv = this.tPreview; this.tPreview = null; const page = this.pageById(this.sel.pageId); if (!pv || !page) return this.requestRender();
    for (const [id, n] of pv.map) { const old = page.elements.find((x) => x.id === id); if (old) this.recReplace(page, old, n); }
    for (const x of pv.removed) { const old = page.elements.find((y) => y.id === x.id); if (old) this.recRemove(page, old); }
    this.opCommit(); UI.buildSelBar();
  },

  /* ---------- tabela selecionada: alças de linha/coluna, células, redimensionar linhas ---------- */
  selTable() { const els = this.selElements(); return els.length === 1 && els[0].type === 'table' && !els[0].rot ? els[0] : null; },
  tableScreen(e) { const pi = this.pageIdx(this.pageById(this.sel.pageId)), o = this.layout[pi], g = tableGrid(e); return { xs: g.xs.map((x) => this.toScreen(x + o.x, 0).x), ys: g.ys.map((y) => this.toScreen(0, y + o.y).y), o, pi }; },
  tableHit(e, p) {
    const S = this.tableScreen(e), xs = S.xs, ys = S.ys, x0 = xs[0], x1 = xs[xs.length - 1], y0 = ys[0], y1 = ys[ys.length - 1];
    if (Math.hypot(p.x - (x0 - 16), p.y - (y0 - 16)) < 18) return { k: 'tmove' };
    if (p.y >= y0 - 22 && p.y < y0 - 2 && p.x >= x0 && p.x <= x1) { let c = 0; while (c < e.cols - 1 && p.x > xs[c + 1]) c++; return { k: 'tcolsel', c }; }
    if (p.x >= x0 - 22 && p.x < x0 - 2 && p.y >= y0 && p.y <= y1) { let r = 0; while (r < e.rows - 1 && p.y > ys[r + 1]) r++; return { k: 'trowsel', r }; }
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) {
      for (let i = 1; i < ys.length; i++) if (Math.abs(p.y - ys[i]) < 9 && !(i === ys.length - 1 && p.x > x1 - 30)) return { k: 'trowsize', r: i - 1 };
      for (let j = 1; j < xs.length; j++) if (Math.abs(p.x - xs[j]) < 9 && !(j === xs.length - 1 && p.y > y1 - 30)) return { k: 'tcolsize', c: j - 1 };
      const w = this.toWorld(p.x, p.y), cell = Tables.cellAt(e, w.x - S.o.x, w.y - S.o.y);
      if (cell) return { k: 'tcell', ...cell };
    }
    return null;
  },
  startTableAct(a) {
    const e = this.selTable(); a.table = e; a.page = this.pageById(this.sel.pageId); a.th0 = a.th;
    const th = a.th;
    if (th.k === 'tcolsel') { this.tsel = { id: e.id, r1: 0, r2: e.rows - 1, c1: th.c, c2: th.c, a: th.c, mode: 'col' }; UI.buildSelBar(); }
    else if (th.k === 'trowsel') { this.tsel = { id: e.id, c1: 0, c2: e.cols - 1, r1: th.r, r2: th.r, a: th.r, mode: 'row' }; UI.buildSelBar(); }
    else if (th.k === 'tcell') { this.tsel = { id: e.id, ...Tables.expand(e, { r1: th.r, c1: th.c, r2: th.r, c2: th.c }), ar: th.r, ac: th.c, mode: 'cell' }; UI.buildSelBar(); }
    else if (th.k === 'trowsize' || th.k === 'tcolsize') { a.dims = Tables.dims(e); a.att = Tables.attached(a.page, e); }
    this.requestRender();
  },
  moveTableAct(p) {
    const a = this.action, e = a.table, th = a.th, z = this.cam.z;
    if (th.k === 'tcolsel' || th.k === 'trowsel' || th.k === 'tcell') {
      const w = this.toWorld(p.x, p.y), o = this.layout[this.pageIdx(a.page)], cell = Tables.cellAt(e, clamp(w.x - o.x, e.x + 0.1, e.x + e.w - 0.1), clamp(w.y - o.y, e.y + 0.1, e.y + e.h - 0.1));
      if (!cell) return; const t = this.tsel;
      if (t.mode === 'col') Object.assign(t, { c1: Math.min(t.a, cell.c), c2: Math.max(t.a, cell.c) });
      else if (t.mode === 'row') Object.assign(t, { r1: Math.min(t.a, cell.r), r2: Math.max(t.a, cell.r) });
      else Object.assign(t, Tables.expand(e, Tables.norm(t.ar, t.ac, cell.r, cell.c)));
      UI.buildSelBar(); this.requestRender(); return;
    }
    if (th.k === 'trowsize') { const h = Math.max(10, a.dims.rh[th.r] + (p.y - a.start.y) / z); const n = Tables.resizeRow(e, th.r, h); this.tPreview = Tables.relayout(a.page, e, n, null, null, a.att); }
    if (th.k === 'tcolsize') { const w = Math.max(14, a.dims.cw[th.c] + (p.x - a.start.x) / z); const n = Tables.resizeCol(e, th.c, w); this.tPreview = Tables.relayout(a.page, e, n, null, null, a.att); }
    this.requestRender();
  },
  endTableAct() { if (this.tPreview) this.commitTablePreview(); else this.requestRender(); },
  /* operações da barra de células */
  tableOp(fn) {
    const e = this.selTable(); if (!e) return; const page = this.pageById(this.sel.pageId);
    const res = fn(e); if (!res) return toast('A tabela precisa de pelo menos uma linha e uma coluna');
    const n = { ...res.n, id: e.id }, pv = Tables.relayout(page, e, n, res.rowMap, res.colMap);
    this.tPreview = pv; this.commitTablePreview();
    if (res.keepSel === false || !this.tsel) this.tsel = null; else if (res.tsel) this.tsel = { ...this.tsel, ...res.tsel };
    UI.buildSelBar(); this.requestRender();
  },
  drawTableOverlay(box) {
    const e = this.selTable(); if (!e) { this.tsel = null; return; }
    if (this.tsel && this.tsel.id !== e.id) this.tsel = null;
    const ctx = this.ctx, S = this.tableScreen(e), xs = S.xs, ys = S.ys, x0 = xs[0], y0 = ys[0], x1 = xs[xs.length - 1], y1 = ys[ys.length - 1];
    ctx.save();
    // faixas de seleção de colunas (em cima) e linhas (à esquerda)
    ctx.fillStyle = 'rgba(124,58,237,.16)'; ctx.strokeStyle = 'rgba(124,58,237,.55)'; ctx.lineWidth = 1;
    for (let c = 0; c < e.cols; c++) { const on = this.tsel && this.tsel.mode === 'col' && c >= this.tsel.c1 && c <= this.tsel.c2; ctx.fillStyle = on ? 'rgba(124,58,237,.55)' : 'rgba(124,58,237,.16)'; ctx.fillRect(xs[c] + 1.5, y0 - 18, xs[c + 1] - xs[c] - 3, 12); }
    for (let r = 0; r < e.rows; r++) { const on = this.tsel && this.tsel.mode === 'row' && r >= this.tsel.r1 && r <= this.tsel.r2; ctx.fillStyle = on ? 'rgba(124,58,237,.55)' : 'rgba(124,58,237,.16)'; ctx.fillRect(x0 - 18, ys[r] + 1.5, 12, ys[r + 1] - ys[r] - 3); }
    // alça de mover
    ctx.fillStyle = '#7c3aed'; ctx.beginPath(); ctx.arc(x0 - 16, y0 - 16, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff';
    for (const [dx, dy] of [[-4, -4], [0, -4], [4, -4], [-4, 0], [0, 0], [4, 0], [-4, 4], [0, 4], [4, 4]]) { ctx.beginPath(); ctx.arc(x0 - 16 + dx, y0 - 16 + dy, 1.3, 0, Math.PI * 2); ctx.fill(); }
    // células selecionadas
    if (this.tsel) { const t = this.tsel; ctx.fillStyle = 'rgba(124,58,237,.18)'; ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2; ctx.fillRect(xs[t.c1], ys[t.r1], xs[t.c2 + 1] - xs[t.c1], ys[t.r2 + 1] - ys[t.r1]); ctx.strokeRect(xs[t.c1], ys[t.r1], xs[t.c2 + 1] - xs[t.c1], ys[t.r2 + 1] - ys[t.r1]); }
    ctx.restore();
  },
});
