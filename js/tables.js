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
      if (e.noAtt && e.noAtt.includes(x.id)) continue; /* v1.44.2: estava na página antes de a tabela chegar por cima — não é dela */
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
      const b = elBBox(x); let cell = this.cellAt(oldE, b.x + b.w / 2, b.y + b.h / 2); if (!cell) continue;
      { const m = (oldE.merges || []).find((q) => cell.r >= q.r && cell.r < q.r + q.rs && cell.c >= q.c && cell.c < q.c + q.cs); /* v1.44.1: célula mesclada (ex.: título) — toda a escrita dela anda junto, presa ao canto da mesclagem (antes cada letra seguia a coluna de baixo e a frase se partia) */
        if (m && (!rowMap || rowMap[m.r] >= 0) && (!colMap || colMap[m.c] >= 0)) cell = { r: m.r, c: m.c }; }
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
    if (e.hOff) { const r = rowMap[e.hOff.r], c = colMap[e.hOff.c]; n.hOff = { r: r >= 0 ? r : Math.min(e.hOff.r, rows - 1), c: c >= 0 ? c : Math.min(e.hOff.c, cols - 1) }; } /* v1.44.1: o cabeçalho acompanha a linha/coluna dele */
    n.rows = rows; n.cols = cols; return n;
  },
  /* v1.44: estrutura escolhida no painel antes de inserir — linha de título e de rodapé (uma célula de ponta a ponta), coluna única
     à esquerda (uma célula de cima a baixo) e cores do título/cabeçalho. Tudo vira mesclagem + cor por célula (merges/cellFill),
     que inserir/apagar linhas e colunas já reposicionam. Sem nenhuma peça nova, a tabela sai como antes (hRow/hCol). */
  tone(c, a) { const h = String(c || '#7c3aed').replace('#', ''); const v = (i) => parseInt(h.slice(i, i + 2), 16) || 0; return `rgba(${v(0)},${v(2)},${v(4)},${a})`; },
  build(st) {
    const plain = { cols: st.cols, rows: st.rows, hRow: st.hRow, hCol: st.hCol, bw: st.bw, bc: st.bc, fill: st.fill };
    const T = st.tTitle ? 1 : 0, F = st.tFoot ? 1 : 0, Sd = st.tSide ? 1 : 0;
    if (!T && !F && !Sd) return st.hColor ? { ...plain, hColor: st.hColor } : plain;
    const R = st.rows + T + F, C = st.cols + Sd, hc = st.hColor || this.tone(st.bc, 0.18), tc = st.tColor || this.tone(st.bc, 0.3);
    const merges = [], cf = {};
    if (T) { if (C > 1) merges.push({ r: 0, c: 0, rs: 1, cs: C }); cf['0,0'] = tc; }
    if (F) { if (C > 1) merges.push({ r: R - 1, c: 0, rs: 1, cs: C }); cf[R - 1 + ',0'] = hc; }
    if (Sd) { if (st.rows > 1) merges.push({ r: T, c: 0, rs: st.rows, cs: 1 }); cf[T + ',0'] = hc; }
    /* v1.44.1: cabeçalho continua como hRow/hCol (o painel de edição reconhece) na posição hOff, e as peças ficam em tParts */
    return { ...plain, cols: C, rows: R, merges, cellFill: cf, hOff: { r: T, c: Sd }, tParts: { t: T, f: F, s: Sd }, hColor: st.hColor || null };
  },
  /* v1.44.1: peças de uma tabela pronta (tParts). Tabelas da v1.44.0 tinham o cabeçalho só pintado (cellFill) — norm converte. */
  parts(e) { const p = e.tParts || {}; return { t: p.t ? 1 : 0, f: p.f ? 1 : 0, s: p.s ? 1 : 0 }; },
  normTable(e) {
    if (e.tParts || !e.merges || !e.merges.length) return null;
    const C = e.cols, R = e.rows, M = e.merges, has = (r, c, rs, cs) => M.some((m) => m.r === r && m.c === c && m.rs === rs && m.cs === cs);
    const T = C > 1 && has(0, 0, 1, C) ? 1 : 0, F = C > 1 && R > 1 && has(R - 1, 0, 1, C) ? 1 : 0, Sd = M.some((m) => m.c === 0 && m.cs === 1 && m.r === T && m.rs === R - T - F && m.rs > 1) ? 1 : 0;
    if (!T && !F && !Sd) return null;
    const n = { ...e, cellFill: { ...(e.cellFill || {}) }, tParts: { t: T, f: F, s: Sd }, hOff: { r: T, c: Sd } }, cf = n.cellFill;
    const same = (keys) => { const v = cf[keys[0]]; return v && keys.every((k) => cf[k] === v) ? v : null; };
    const rk = []; for (let c = Sd; c < C; c++) rk.push(T + ',' + c);
    const rv = !e.hRow && same(rk); if (rv) { rk.forEach((k) => delete cf[k]); n.hRow = true; }
    const ck = []; for (let r = T + (rv ? 1 : 0); r < R - F; r++) ck.push(r + ',' + Sd);
    const cv = !e.hCol && ck.length && same(ck); if (cv) { ck.forEach((k) => delete cf[k]); n.hCol = true; }
    const v = rv || cv; if (v && v !== this.tone(e.bc, 0.18)) n.hColor = v;
    return n;
  },
  /* v1.44.3: acrescentar/tirar UMA coluna ou linha no fim (contagem dos Ajustes), respeitando as peças: coluna nova entra no fim
     e o título/rodapé de ponta a ponta se estendem; linha nova entra antes do rodapé e a coluna única se estende. A escrita
     acompanha as células (Editor.tableOp → relayout) — antes a contagem só redividia a largura e a escrita ficava parada. */
  addCol(e) {
    const res = this.insertCols(e, e.cols, 1); for (const m of res.n.merges) if (m.c === 0 && m.cs === e.cols && e.cols > 1) m.cs = res.n.cols;
    return res;
  },
  delCol(e) { const P = this.parts(e); if (e.cols - 1 < P.s + 1) return null; return this.deleteCols(e, e.cols - 1, e.cols - 1); },
  addRow(e) {
    const P = this.parts(e), at = e.rows - P.f, res = this.insertRows(e, at, 1);
    for (const m of res.n.merges) if (P.s && m.c === 0 && m.cs === 1 && m.r === P.t && m.r + m.rs === at) m.rs += 1;
    if (P.s && !(res.n.merges || []).some((m) => m.c === 0 && m.cs === 1 && m.r === P.t) && res.n.rows - P.t - P.f > 1) res.n.merges.push({ r: P.t, c: 0, rs: res.n.rows - P.t - P.f, cs: 1 });
    return res;
  },
  delRow(e) { const P = this.parts(e), r = e.rows - P.f - 1; if (r < P.t + 1) return null; return this.deleteRows(e, r, r); },
  /* há escrita na última coluna / na última linha do corpo? (para confirmar antes de tirar) */
  hasInkAt(page, e, k) {
    const P = this.parts(e), c = e.cols - 1, r = e.rows - P.f - 1;
    return this.attached(page, e).some((x) => { const b = elBBox(x), cell = this.cellAt(e, b.x + b.w / 2, b.y + b.h / 2); return cell && (k === 'c' ? cell.c === c : cell.r === r); });
  },
  /* liga/desliga uma peça numa tabela pronta: devolve {n, rowMap, colMap} para o Editor.tableOp (a escrita acompanha as células) */
  setPart(e, k, on, st) {
    const P = this.parts(e); if (!!P[k] === !!on) return null;
    const hc = e.hColor || this.tone(e.bc, 0.18), tc = (st && st.tColor) || this.tone(e.bc, 0.3);
    let res;
    if (k === 't') res = on ? this.insertRows(e, 0, 1) : this.deleteRows(e, 0, 0);
    else if (k === 'f') res = on ? this.insertRows(e, e.rows, 1) : this.deleteRows(e, e.rows - 1, e.rows - 1);
    else res = on ? this.insertCols(e, 0, 1) : this.deleteCols(e, 0, 0);
    if (!res) return null;
    const n = res.n, Q = { ...P, [k]: on ? 1 : 0 }; n.tParts = Q; n.hOff = { r: Q.t, c: Q.s };
    const C = n.cols, R = n.rows; n.merges = (n.merges || []).filter((m) => !(on && ((k === 't' && m.r === 0) || (k === 'f' && m.r === R - 1) || (k === 's' && m.c === 0)))); n.cellFill = { ...(n.cellFill || {}) };
    if (on && k === 't') { if (C > 1) n.merges.push({ r: 0, c: 0, rs: 1, cs: C }); n.cellFill['0,0'] = tc; }
    if (on && k === 'f') { if (C > 1) n.merges.push({ r: R - 1, c: 0, rs: 1, cs: C }); n.cellFill[R - 1 + ',0'] = hc; }
    if (on && k === 's') { const rs = R - Q.t - Q.f; if (rs > 1) n.merges.push({ r: Q.t, c: 0, rs, cs: 1 }); n.cellFill[Q.t + ',0'] = hc; }
    /* título/rodapé de ponta a ponta acompanham a coluna única nova */
    if (k === 's') for (const m of n.merges) if ((Q.t && m.r === 0) || (Q.f && m.r === R - 1)) { m.c = 0; m.cs = C; }
    if (k === 's') { /* a cor do título/rodapé fica na 1ª célula da mesclagem */
      const ocf = e.cellFill || {}, tf = ocf['0,0'], ff = ocf[e.rows - 1 + ',0'];
      if (Q.t) { delete n.cellFill['0,1']; if (tf) n.cellFill['0,0'] = tf; }
      if (Q.f) { delete n.cellFill[R - 1 + ',1']; if (ff) n.cellFill[R - 1 + ',0'] = ff; }
    }
    if (k === 't' || k === 'f') for (const m of n.merges) if (Q.s && m.c === 0 && m.cs === 1) { m.r = Q.t; m.rs = R - Q.t - Q.f; }
    return { ...res, n, keepSel: false };
  },
  model(st) { return st.model ? (st.models || []).find((m) => m.id === st.model) || null : null; },
  /* o que a tabela nova vai ser: modelo salvo ou a estrutura do painel (sem posição) */
  spec(st) { const m = this.model(st); return m ? { ...clone(m.t), _w: m.w, _h: m.h } : this.build(st); },
  saveModel(e, name) {
    const st = Store.settings.tools.table, L = (st.models = st.models || []);
    const t = { cols: e.cols, rows: e.rows, colW: e.colW ? e.colW.slice() : null, rowH: e.rowH ? e.rowH.slice() : null, merges: clone(e.merges || []), cellFill: clone(e.cellFill || {}), hRow: !!e.hRow, hCol: !!e.hCol, bw: e.bw, bc: e.bc, fill: e.fill || null };
    const m = { id: uid(), name: String(name).slice(0, 40), t, w: e.w, h: e.h }; L.push(m); if (L.length > 20) L.shift(); Store.saveSettings(); return m;
  },
  ident(n) { return Array.from({ length: n }, (_, i) => i); },
  insertRows(e, at, count = 1) {
    const { cw, rh } = this.dims(e), hNew = rh[Math.min(Math.max(at - 1, 0), rh.length - 1)];
    const rowMap = this.ident(e.rows).map((r) => (r >= at ? r + count : r));
    const n = this.remap(e, rowMap, this.ident(e.cols), e.rows + count, e.cols);
    { const P = e.tParts || {}; if (P.s && at === e.rows - (P.f ? 1 : 0)) for (const m of n.merges) if (m.c === 0 && m.cs === 1 && m.r === (P.t ? 1 : 0) && m.r + m.rs === at) m.rs += count; } /* v1.44.3: coluna única acompanha a linha nova no fim do corpo */
    const nrh = rh.slice(); nrh.splice(at, 0, ...Array(count).fill(hNew));
    n.rowH = nrh; n.colW = cw; n.h = e.h + hNew * count; return { n, rowMap, colMap: null };
  },
  insertCols(e, at, count = 1) {
    const { cw, rh } = this.dims(e), wNew = cw[Math.min(Math.max(at - 1, 0), cw.length - 1)];
    const colMap = this.ident(e.cols).map((c) => (c >= at ? c + count : c));
    const n = this.remap(e, this.ident(e.rows), colMap, e.rows, e.cols + count);
    /* v1.44.3: a mesclagem que atravessa o ponto de inserção já sai do remap cobrindo a coluna nova (mín/máx dos índices); o antigo "+count" aqui a alargava 2× e a escrita caía nas células erradas */
    if (at === e.cols && e.cols > 1) for (const m of n.merges) if (m.c === 0 && m.cs === e.cols) m.cs += count; /* v1.44.3: título/rodapé de ponta a ponta acompanham a coluna nova no fim */
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
  /* v1.7: escrita em cima do post-it faz parte dele — itens acima dele (na ordem da página) com o centro dentro do papel */
  stickyAtt(page, els, exclude = new Set()) {
    const out = new Set(), sel = new Set(els.filter((s) => s.type === 'text' && s.sticky)); if (!sel.size) return out;
    const inside = (s, x) => { const b = elBBox(x); let cx = b.x + b.w / 2, cy = b.y + b.h / 2; if (s.rot) { const c = rawCenter(s); [cx, cy] = rotPt(cx, cy, c.x, c.y, -s.rot); } return cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + layoutText(s).h; };
    const stack = []; /* post-its já vistos (de baixo para cima): cada item pertence ao post-it MAIS ALTO abaixo dele que o contém */
    for (const x of page.elements) {
      if (x.type === 'text' && x.sticky) { if (!x.folded) stack.push(x); continue; }
      if (!stack.length || exclude.has(x.id) || x.type === 'table' || x.lock) continue;
      for (let k = stack.length - 1; k >= 0; k--) if (inside(stack[k], x)) { if (sel.has(stack[k])) out.add(x.id); break; }
    }
    return out;
  },
  /* v1.8: recolher/abrir post-it — recolhido, a escrita dele fica guardada dentro (kids) e some da página; ao abrir volta no lugar (andando com o post-it) */
  foldSticky(page, s) {
    if (!s || !s.sticky || s.folded) return; const att = this.stickyAtt(page, [s]), kids = page.elements.filter((x) => att.has(x.id));
    for (const k of kids) this.recRemove(page, k);
    const cur = page.elements.find((x) => x.id === s.id); this.recReplace(page, cur, { ...cur, folded: true, kids: clone(kids), fx: cur.x, fy: cur.y }); this.opCommit();
    if (this.sel) this.sel = { pageId: page.id, ids: new Set([s.id]) }; UI.buildSelBar(); this.requestRender();
  },
  unfoldSticky(page, s) {
    if (!s || !s.folded) return; const dx = s.x - (s.fx ?? s.x), dy = s.y - (s.fy ?? s.y), { folded, kids, fx, fy, ...n } = s;
    this.recReplace(page, s, n); let i = page.elements.indexOf(n) + 1;
    for (const k of kids || []) this.recAdd(page, dx || dy ? transformEl(k, { ox: 0, oy: 0, sx: 1, sy: 1, dx, dy }) : k, i++);
    this.opCommit(); if (this.sel && this.sel.ids.has(s.id)) UI.buildSelBar(); this.requestRender();
  },
  /* toque (dedo ou caneta) num post-it recolhido: abre */
  tapFolded(page, x, y) { const s = [...page.elements].reverse().find((e) => e.folded && x >= e.x - 4 && x <= e.x + STICKY_FOLD + 4 && y >= e.y - 4 && y <= e.y + STICKY_FOLD + 4); if (!s) return false; this.unfoldSticky(page, s); return true; },
  /* seleção + escrita dos post-its selecionados, na ordem da página */
  selWithAtt() { const page = this.pageById(this.sel.pageId), els = this.selElements(), att = this.stickyAtt(page, els, this.sel.ids); return att.size ? page.elements.filter((e) => this.sel.ids.has(e.id) || att.has(e.id)) : els; },
  /* prepara a ação de mover/redimensionar: alvos de alinhamento e escrita presa às tabelas */
  prepSel(a) {
    a.prep = true;
    const page = this.pageById(this.sel.pageId), els = this.selElements();
    a.page = page; a.pi = this.pageIdx(page); a.b0 = bboxUnion(els);
    const attached = new Set();
    for (const e of els) if (e.type === 'table') for (const x of Tables.attached(page, e, this.sel.ids)) attached.add(x.id);
    for (const id of this.stickyAtt(page, els, this.sel.ids)) attached.add(id); /* v1.7 */
    a.inkScale = !!(els.length === 1 && els[0].sticky && Store.settings.stickyInkScale); /* v1.8: redimensionar o post-it leva a escrita junto (opção) */
    a.attached = attached;
    const single = els.length === 1 ? els[0] : null; a.el1 = single;
    a.free = !!(single && single.type !== 'stroke' && !(single.type === 'shape' && (single.kind === 'poly' || single.kind === 'path' || single.kind === 'line' || single.kind === 'arrow')) && !single.rot);
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
    if (this.action && (this.action.noSnap || this.action.penFree)) return null; // segundo dedo na tela: movimento livre
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
    const a = this.action, z = this.cam.z, tol = 5 / z; /* v0.53.1: atração mais fraca (antes 9 px de tela) */
    if (!a.prep) this.prepSel(a);
    const b = a.b0;
    if (a.kind === 'move') {
      let dx = (p.x - a.start.x) / z, dy = (p.y - a.start.y) / z;
      /* v0.53.2: trava de eixo (dedo, com ajustes ligados) — arrasto que sai quase reto na horizontal mantém a altura exata (e vice-versa);
         solta de vez ao passar 20 px de tela no outro eixo. Decide depois de 8 px; a caneta e o 2º dedo (livre) não travam. */
      if (!a.noSnap && !a.penFree && a.axis !== 'free') {
        const ax = Math.abs(dx) * z, ay = Math.abs(dy) * z;
        if (!a.axis && Math.max(ax, ay) >= 8) a.axis = ay <= 0.35 * ax ? 'x' : ax <= 0.35 * ay ? 'y' : 'free';
        if (a.axis === 'x') { if (ay > 20) a.axis = 'free'; else dy = 0; }
        else if (a.axis === 'y') { if (ax > 20) a.axis = 'free'; else dx = 0; }
      }
      /* v0.25.1: movimento pequeno não gruda; v0.53.1: POR EIXO — arrastando para o lado, a altura só gruda depois de 14 px na vertical (e vice-versa) */
      const nearX = Math.abs(dx) * z < 14, nearY = Math.abs(dy) * z < 14;
      const sx = nearX ? null : this.snap1([b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx], a.tx, a.grid && this.gridLines(a.grid, a.page, 0), tol);
      let sy = nearY ? null : this.snap1([b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy], a.ty, a.grid && this.gridLines(a.grid, a.page, 1), tol);
      if (sx) dx += sx.d; if (sy) dy += sy.d;
      const t1 = a.el1;
      if (t1 && t1.type === 'text' && !a.noSnap && !a.penFree) { // texto: base da 1ª linha gruda na pauta; com "alinhar às linhas" sempre fica sobre elas
        const g = this.ruledFor(a.page), L = layoutText(t1), pad = t1.sticky ? STICKY_PAD : 0;
        if (g && t1.ruled) { const k = Math.round((b.y + dy - g.o) / g.s); dy = g.o + k * g.s - b.y; }
        else if (g && this.snapOn('snapPage') && !nearY) { const base = b.y + pad + L.lines[0].base + dy, k = Math.round((base - g.o) / g.s), d = g.o + k * g.s - base; if (Math.abs(d) < tol) { dy += d; sy = { d, at: g.o + k * g.s }; } }
      }
      this.setGuides(a, sx, sy); this.ratioLabel = a.noSnap ? 'livre' : null;
      this.selTf = { ox: b.x, oy: b.y, sx: 1, sy: 1, dx, dy };
    } else if (a.kind === 'rotate') {
      const c = { x: a.box.x + a.box.w / 2, y: a.box.y + a.box.h / 2 };
      let ang = Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(a.start.y - c.y, a.start.x - c.x);
      if (this.snapOn('snapAngle') && !a.noSnap && !a.penFree) { const sn = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12); if (Math.abs(ang - sn) < 0.06) ang = sn; } // gruda a cada 15°
      this.selTf = { ox: b.x, oy: b.y, sx: 1, sy: 1, dx: 0, dy: 0, rot: ang, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
    } else if (a.free && (a.el.type === 'text' || a.el.type === 'table')) { // texto e tabela: largura e altura livres (o texto reflui, não muda a letra)
      const hh = a.hh || 'se', dX = hh.includes('e') ? 1 : hh.includes('w') ? -1 : 0, dY = hh.includes('s') ? 1 : hh.includes('n') ? -1 : 0;
      const rb = a.rb; let w = Math.max(8 / z, rb.w + dX * (p.x - a.start.x) / z), h = Math.max(8 / z, rb.h + dY * (p.y - a.start.y) / z);
      const ex = dX < 0 ? rb.x + rb.w - w : rb.x + w, ey = dY < 0 ? rb.y + rb.h - h : rb.y + h; /* borda que está andando */
      const sx = dX && this.snap1([ex], a.tx, a.grid && this.gridLines(a.grid, a.page, 0), tol), sy = dY && this.snap1([ey], a.ty, a.grid && this.gridLines(a.grid, a.page, 1), tol);
      if (sx) w += dX * sx.d; if (sy) h += dY * sy.d;
      let label = null;
      if (dX && dY && this.snapOn('snapRatio') && !a.noSnap && !a.penFree) {
        for (const [r, lab] of [[1, '1:1'], [a.ratio, 'proporção original']]) { if (Math.abs(w / h - r) / r < 0.06) { h = w / r; label = lab; break; } }
      }
      this.setGuides(a, sx, label ? null : sy); this.ratioLabel = a.noSnap ? 'livre' : label;
      const t = { ox: dX < 0 ? rb.x + rb.w : rb.x, oy: dY < 0 ? rb.y + rb.h : rb.y, sx: w / rb.w, sy: h / rb.h, dx: 0, dy: 0, free: true };
      if (a.el.type === 'table' && dX && dY && !a.noSnap) { /* v1.44.2: canto = a tabela inteira na mesma proporção, com a escrita junto (letras e espessuras escalam) */
        const k = Math.max(0.05, (w / rb.w + h / rb.h) / 2), tu = { ox: t.ox, oy: t.oy, sx: k, sy: k, dx: 0, dy: 0 }, map = new Map();
        for (const x of a.page.elements) if (a.attached.has(x.id)) map.set(x.id, transformEl(x, tu));
        map.set(a.el.id, transformEl(a.el, tu)); this.tPreview = { map, removed: [] }; this.selTf = null; this.ratioLabel = null; this.guides = null;
      }
      else if (a.el.type === 'table') { const n = transformEl(a.el, t); this.tPreview = Tables.relayout(a.page, a.el, n, null, null, a.page.elements.filter((x) => a.attached.has(x.id))); this.selTf = null; }
      else this.selTf = t;
    } else { /* v0.22: cantos mantêm a proporção (ancorados no canto oposto); lados esticam só a largura ou só a altura */
      const hh = a.hh || 'se', dX = hh.includes('e') ? 1 : hh.includes('w') ? -1 : 0, dY = hh.includes('s') ? 1 : hh.includes('n') ? -1 : 0;
      const bw = Math.max(b.w, 1), bh = Math.max(b.h, 1), fx = (bw + dX * (p.x - a.start.x) / z) / bw, fy = (bh + dY * (p.y - a.start.y) / z) / bh;
      let sx, sy;
      if (dX && dY) sx = sy = Math.max(0.05, Math.max(fx, fy));
      else if (dX) { sx = Math.max(0.05, fx); sy = 1; } else { sy = Math.max(0.05, fy); sx = 1; }
      this.selTf = { ox: dX < 0 ? b.x + b.w : b.x, oy: dY < 0 ? b.y + b.h : b.y, sx, sy, dx: 0, dy: 0, free: !!a.free };
      this.ratioLabel = dX && dY ? null : `${Math.round(sx * 100)}% × ${Math.round(sy * 100)}%`;
    }
    this.requestRender();
  },
  endMoveSel() {
    const a = this.action || this._lastAction; this.guides = null; this.ratioLabel = null;
    if (this.tPreview) return this.commitTablePreview();
    const t = this.selTf; this.selTf = null; if (!t) return this.requestRender();
    const page = this.pageById(this.sel.pageId), att = (a && a.attached) || new Set();
    const apply = (e) => (t.node ? { ...t.node, id: e.id } : t.rot != null ? rotateEl(e, t.rot, t.cx, t.cy) : transformEl(e, t));
    /* v0.58: ao MOVER, se o centro do que foi movido cai em outra página, os itens passam para ela (coordenadas convertidas; um passo do desfazer) */
    const moved = [...this.selElements(), ...(!t.free ? page.elements.filter((x) => att.has(x.id)) : [])], plain = a && a.kind === 'move' && !t.node && t.rot == null && t.sx === 1 && t.sy === 1 && this.note.mode !== 'infinite';
    let dest = -1; const si = this.pageIdx(page);
    if (plain && moved.length) { const bb = bboxUnion(moved.map(apply)), o = this.layout[si]; if (bb) { const d = this.pageIndexAt(o.x + bb.x + bb.w / 2, o.y + bb.y + bb.h / 2); if (d >= 0 && d !== si) dest = d; } }
    if (dest >= 0) {
      const tp = this.note.pages[dest], o1 = this.layout[si], o2 = this.layout[dest], ox = o1.x - o2.x, oy = o1.y - o2.y;
      for (const e of moved) { const n = transformEl(apply(e), { ox: 0, oy: 0, sx: 1, sy: 1, dx: ox, dy: oy }); this.recRemove(page, e); this.recAdd(tp, n); }
      this.sel = { pageId: tp.id, ids: new Set(this.sel.ids) }; this.opCommit(); UI.buildSelBar && UI.buildSelBar();  return;
    }
    for (const e of this.selElements()) { let n = apply(e);
      if (e.type === 'table' && !n.rot) { /* v1.44.2: escrita que já estava onde a tabela foi solta não vira "da tabela" (noAtt); a lista guarda só o que ainda está por cima dela */
        const moving = new Set([...this.sel.ids, ...att]), keep = [];
        for (const x of page.elements) { if (x.type === 'table' || moving.has(x.id)) continue; const b = elBBox(x), cx = b.x + b.w / 2, cy = b.y + b.h / 2; if (cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h) keep.push(x.id); }
        n = { ...n }; if (keep.length) n.noAtt = keep.slice(0, 2000); else delete n.noAtt; }
      this.recReplace(page, e, n); }
    if (!t.free || (a && a.inkScale)) for (const e of page.elements.filter((x) => att.has(x.id))) this.recReplace(page, e, apply(e)); // escrita dentro da tabela vai junto
    this.raiseOverTables(page, this.sel.ids);
    this.opCommit();
  },
  /* v1.44.1: o que foi solto em cima de uma tabela que está ACIMA dele na ordem da página sobe para logo depois dela
     (as células pintadas cobriam a escrita, e ela não andava junto com a tabela). Mesmo passo do desfazer. */
  raiseOverTables(page, ids) {
    for (const id of [...ids]) {
      const els = page.elements, i = els.findIndex((x) => x.id === id), e = els[i]; if (i < 0 || e.type === 'table') continue;
      const b = elBBox(e), cx = b.x + b.w / 2, cy = b.y + b.h / 2; let top = -1;
      for (let j = i + 1; j < els.length; j++) { const T = els[j]; if (T.type === 'table' && !T.rot && cx >= T.x && cx <= T.x + T.w && cy >= T.y && cy <= T.y + T.h) top = j; }
      for (let j = 0; j < els.length; j++) { const T = els[j]; if (T.type === 'table' && T.noAtt && T.noAtt.includes(id) && cx >= T.x && cx <= T.x + T.w && cy >= T.y && cy <= T.y + T.h) this.recReplace(page, T, { ...T, noAtt: T.noAtt.filter((q) => q !== id) }); } /* levado de propósito para dentro: passa a ser da tabela */
      if (top < 0) continue;
      this.recRemove(page, e); this.recAdd(page, e, top); /* depois de tirar, a tabela desceu 1: índice "top" = logo depois dela */
    }
  },
  commitTablePreview() {
    const pv = this.tPreview; this.tPreview = null; const page = this.pageById(this.sel.pageId); if (!pv || !page) return this.requestRender();
    for (const [id, n] of pv.map) { const old = page.elements.find((x) => x.id === id); if (old) this.recReplace(page, old, n); }
    for (const x of pv.removed) { const old = page.elements.find((y) => y.id === x.id); if (old) this.recRemove(page, old); }
    this.opCommit(); UI.buildSelBar();
  },

  /* ---------- tabela selecionada: alças de linha/coluna, células, redimensionar linhas ---------- */
  /* v0.39: tabela tem dois modos, como a caixa de texto: seleção comum (mover/redimensionar pelas alças) e "editar células"
     (faixas de linhas/colunas, células, cores, mesclar — barra das células). tEdit liga pelo botão da barra ou toque (duplo, com a caneta) na tabela */
  tableCells() { if (!this.tEdit) return null; const e = this.selTable(); if (!e) { this.tEdit = false; this.tsel = null; } return e; },
  toggleTableCells(on = !this.tableCells()) { this.tEdit = !!on && !!this.selTable(); this.tsel = null; UI.buildSelBar(); this.requestRender(); if (this.tEdit) hint('tcells', 'Toque nas células, linhas ou colunas para editar', 1600); },
  selTable() { const els = this.selElements(); return els.length === 1 && els[0].type === 'table' && !els[0].rot ? els[0] : null; },
  tableScreen(e) { const pi = this.pageIdx(this.pageById(this.sel.pageId)), o = this.layout[pi], g = tableGrid(e); return { xs: g.xs.map((x) => this.toScreen(x + o.x, 0).x), ys: g.ys.map((y) => this.toScreen(0, y + o.y).y), o, pi }; },
  tableHit(e, p) {
    const S = this.tableScreen(e), xs = S.xs, ys = S.ys, x0 = xs[0], x1 = xs[xs.length - 1], y0 = ys[0], y1 = ys[ys.length - 1];
    if (Math.hypot(p.x - (x0 - 16), p.y - (y0 - 16)) < 18) return { k: 'tmove' };
    if (Math.abs(p.x - (x0 + x1) / 2) < 26 && Math.abs(p.y - (y1 + 14)) < 16) return { k: 'tallrows' }; /* v1.5: alça de baixo = altura de todas as linhas */
    if (Math.abs(p.y - (y0 + y1) / 2) < 26 && Math.abs(p.x - (x1 + 14)) < 16) return { k: 'tallcols' }; /* alça da direita = largura de todas as colunas */
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
    else if (th.k === 'trowsize' || th.k === 'tcolsize' || th.k === 'tallrows' || th.k === 'tallcols') { a.dims = Tables.dims(e); a.att = Tables.attached(a.page, e); }
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
    if (th.k === 'tallrows' || th.k === 'tallcols') { /* v1.5: todas as linhas/colunas de uma vez — mantém as proporções ou (S.tableEqual) deixa todas iguais */
      const eq = !!Store.settings.tableEqual, { cw, rh } = a.dims;
      if (th.k === 'tallrows') { const H = Math.max(10 * e.rows, e.h + (p.y - a.start.y) / z), k = H / e.h; this.tPreview = Tables.relayout(a.page, e, { ...e, colW: cw, rowH: rh.map((v) => (eq ? H / e.rows : v * k)), h: H }, null, null, a.att); }
      else { const W = Math.max(14 * e.cols, e.w + (p.x - a.start.x) / z), k = W / e.w; this.tPreview = Tables.relayout(a.page, e, { ...e, rowH: rh, colW: cw.map((v) => (eq ? W / e.cols : v * k)), w: W }, null, null, a.att); }
      this.requestRender(); return;
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
    { /* v1.5: alças de baixo e da direita (todas as linhas / todas as colunas); com "igualar" ligado ficam com um "=" */
      const eq = !!Store.settings.tableEqual, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const pill = (x, y, w, h, vert) => { ctx.fillStyle = '#7c3aed'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, Math.min(w, h) / 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath();
        if (eq) { if (!vert) { ctx.moveTo(x - 2.5, y - 4); ctx.lineTo(x - 2.5, y + 4); ctx.moveTo(x + 2.5, y - 4); ctx.lineTo(x + 2.5, y + 4); } else { ctx.moveTo(x - 4, y - 2.5); ctx.lineTo(x + 4, y - 2.5); ctx.moveTo(x - 4, y + 2.5); ctx.lineTo(x + 4, y + 2.5); } }
        else if (vert) { ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x, y - 6); ctx.lineTo(x + 3, y - 3); ctx.moveTo(x - 3, y + 3); ctx.lineTo(x, y + 6); ctx.lineTo(x + 3, y + 3); }
        else { ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x - 6, y); ctx.lineTo(x - 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x + 6, y); ctx.lineTo(x + 3, y + 3); }
        ctx.stroke(); };
      pill(mx, y1 + 14, 34, 18, true); pill(x1 + 14, my, 18, 34, false); /* vert = arrasta na vertical */
    }
    // células selecionadas
    if (this.tsel) { const t = this.tsel; ctx.fillStyle = 'rgba(124,58,237,.18)'; ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2; ctx.fillRect(xs[t.c1], ys[t.r1], xs[t.c2 + 1] - xs[t.c1], ys[t.r2 + 1] - ys[t.r1]); ctx.strokeRect(xs[t.c1], ys[t.r1], xs[t.c2 + 1] - xs[t.c1], ys[t.r2 + 1] - ys[t.r1]); }
    ctx.restore();
  },
});
