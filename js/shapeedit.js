'use strict';
/* ===== v0.25: "Editar pontos" de uma forma selecionada (botão na barra da seleção) =====
   A seleção fica laranja e aparecem os pontos: vértices (círculos), arestas (quadradinhos no meio do lado: arrastam o lado inteiro)
   e curvas (losangos, no colchete: mudam o raio da curva). Retângulo/losango/triângulo viram polígono ao mexer num ponto;
   elipse tem 4 pontos que mudam a largura/altura; linha e seta têm as 2 pontas. Sem mudar a espessura. */
const VEDIT_COLOR = '#f97316';

/* cantos de retângulo/losango/triângulo (com o giro aplicado), na ordem do contorno */
function shapeCorners(e) {
  const g = shapeGeom(e), cx = (g.x1 + g.x2) / 2, cy = (g.y1 + g.y2) / 2;
  let P;
  if (e.kind === 'rect') P = [[g.x1, g.y1], [g.x2, g.y1], [g.x2, g.y2], [g.x1, g.y2]];
  else if (e.kind === 'triangle') P = [[cx, g.y1], [g.x2, g.y2], [g.x1, g.y2]];
  else P = [[cx, g.y1], [g.x2, cy], [cx, g.y2], [g.x1, cy]];
  if (e.rot && hasRot(e)) { const c = rawCenter(e); P = P.map(([x, y]) => rotPt(x, y, c.x, c.y, e.rot)); }
  return P;
}
function shapeToPoly(e) {
  const n = { ...e, kind: 'poly', closed: true, pts: [] }; for (const [x, y] of shapeCorners(e)) n.pts.push(r2(x), r2(y));
  delete n.x1; delete n.y1; delete n.x2; delete n.y2; delete n.rot; return n;
}
/* colchete antigo (v0.25.0, poly com br) → linha com cantos editável */
function brToPath(e) {
  const b = bracketFix(e.br), P = (cr, ax) => (b.v ? [cr, ax] : [ax, cr]), V = [], R = [];
  if (b.hT) { V.push(P(b.sx + b.hT, b.top), P(b.sx, b.top)); R.push(0, b.rT); } else { V.push(P(b.sx, b.top)); R.push(0); }
  if (b.hB) { V.push(P(b.sx, b.bot), P(b.sx + b.hB, b.bot)); R.push(b.rB, 0); } else { V.push(P(b.sx, b.bot)); R.push(0); }
  if (b.rev) { V.reverse(); R.reverse(); }
  const n = { ...e, kind: 'path', pts: V.flat().map(r2), rr: R.map(r2) }; delete n.br; delete n.closed; return n;
}
const asPath = (e) => (e.kind === 'poly' && e.br ? brToPath(e) : e);
function shapeVerts(e) { const P = []; for (let i = 0; i < e.pts.length; i += 2) P.push([e.pts[i], e.pts[i + 1]]); return P; }
/* pontos editáveis de uma forma, em coordenadas da página. t: 'v' vértice, 'e' aresta, 'c' curva */
function shapeNodes(e0) {
  const N = [], e = asPath(e0);
  if (e.kind === 'line' || e.kind === 'arrow') { N.push({ t: 'v', k: 'p1', x: e.x1, y: e.y1 }, { t: 'v', k: 'p2', x: e.x2, y: e.y2 }); return N; }
  if (e.kind === 'ellipse') {
    const g = shapeGeom(e), cx = (g.x1 + g.x2) / 2, cy = (g.y1 + g.y2) / 2, a = e.rot || 0, c = Math.cos(a), s = Math.sin(a), rx = g.w / 2, ry = g.h / 2;
    for (const [k, ux, uy] of [['rx', 1, 0], ['rx', -1, 0], ['ry', 0, 1], ['ry', 0, -1]]) { const lx = ux * rx, ly = uy * ry; N.push({ t: 'e', k, x: cx + lx * c - ly * s, y: cy + lx * s + ly * c }); }
    return N;
  }
  const P = e.kind === 'poly' || e.kind === 'path' ? shapeVerts(e) : shapeCorners(e);
  if (P.length > 30) return N; /* polígono com pontos demais (curva antiga): só mover */
  P.forEach(([x, y], i) => N.push({ t: 'v', k: 'v' + i, i, x, y }));
  const closed = e.kind === 'path' ? false : e.kind !== 'poly' || e.closed, m = closed ? P.length : P.length - 1;
  for (let i = 0; i < m; i++) { const a = P[i], c = P[(i + 1) % P.length]; N.push({ t: 'e', k: 'e' + i, i, x: (a[0] + c[0]) / 2, y: (a[1] + c[1]) / 2 }); }
  if (e.kind === 'path') for (let i = 1; i < P.length - 1; i++) { const h = pathCurveHandle(e, i); if (h) N.push({ t: 'c', k: 'c' + i, i, x: h.x, y: h.y }); }
  return N;
}
/* v0.25.1: vértice gruda quando o lado até o vizinho fica a 0/45/90° (Configurações → "Grudar ângulos ao editar pontos") */
function snapVertex(P, i, p, closed, z) {
  const nb = []; if (i > 0) nb.push(P[i - 1]); else if (closed) nb.push(P[P.length - 1]); if (i < P.length - 1) nb.push(P[i + 1]); else if (closed) nb.push(P[0]);
  const tol = 9 / z, C = nb.map((q) => { const a = Math.round(Math.atan2(p.y - q[1], p.x - q[0]) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(p.x - q[0], p.y - q[1]); return { q, a, x: q[0] + Math.cos(a) * d, y: q[1] + Math.sin(a) * d }; });
  if (C.length === 2) { /* os dois lados alinhados ao mesmo tempo (ex.: canto reto de colchete) */
    const [A, B] = C, den = Math.cos(A.a) * Math.sin(B.a) - Math.sin(A.a) * Math.cos(B.a);
    if (Math.abs(den) > 0.1) { const t = ((B.q[0] - A.q[0]) * Math.sin(B.a) - (B.q[1] - A.q[1]) * Math.cos(B.a)) / den, x = A.q[0] + Math.cos(A.a) * t, y = A.q[1] + Math.sin(A.a) * t; if (Math.hypot(x - p.x, y - p.y) < tol) return { x, y }; }
  }
  let best = null, bd = tol; for (const c of C) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } }
  return best ? { x: best.x, y: best.y } : p;
}
/* nova forma com o ponto `nd` arrastado até `l` (coordenadas da página); `s` = onde o arrasto começou */
function moveShapeNode(e0, nd, l, s, z, snap) {
  const e = asPath(e0);
  if (e.kind === 'line' || e.kind === 'arrow') {
    const n = { ...e }, o = nd.k === 'p1' ? [e.x2, e.y2] : [e.x1, e.y1], q = snap ? snapVertex([o, [0, 0]], 1, l, false, z) : l;
    if (nd.k === 'p1') { n.x1 = r2(q.x); n.y1 = r2(q.y); } else { n.x2 = r2(q.x); n.y2 = r2(q.y); } return n;
  }
  if (e.kind === 'ellipse') {
    const g = shapeGeom(e), cx = (g.x1 + g.x2) / 2, cy = (g.y1 + g.y2) / 2, a = e.rot || 0, dx = l.x - cx, dy = l.y - cy;
    const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a), n = { ...e };
    if (nd.k === 'rx') { const r = Math.max(2, Math.abs(lx)); n.x1 = r2(cx - r); n.x2 = r2(cx + r); n.y1 = g.y1; n.y2 = g.y2; }
    else { const r = Math.max(2, Math.abs(ly)); n.y1 = r2(cy - r); n.y2 = r2(cy + r); n.x1 = g.x1; n.x2 = g.x2; }
    return n;
  }
  if (e.kind === 'path' && nd.t === 'c') { /* curvatura só deste canto */
    const c = pathCorner(e, nd.i); if (!c) return e; let r = Math.min(pathRadiusFrom(e, nd.i, l.x, l.y), c.rmax ?? Infinity); if (r * z < 1.5) r = 0;
    const rr = (e.rr || []).slice(); while (rr.length < e.pts.length / 2) rr.push(0); rr[nd.i] = r2(r); return { ...e, rr };
  }
  const p = e.kind === 'poly' || e.kind === 'path' ? e : shapeToPoly(e), n = { ...p, pts: Array.from(p.pts) }, L = n.pts.length / 2;
  if (nd.t === 'v') { const q = snap ? snapVertex(shapeVerts(p), nd.i, l, p.kind !== 'path' && !!p.closed, z) : l; n.pts[nd.i * 2] = r2(q.x); n.pts[nd.i * 2 + 1] = r2(q.y); }
  else { const dx = l.x - s.x, dy = l.y - s.y, j = (nd.i + 1) % L; for (const q of [nd.i, j]) { n.pts[q * 2] = r2(p.pts[q * 2] + dx); n.pts[q * 2 + 1] = r2(p.pts[q * 2 + 1] + dy); } }
  return n;
}

/* v0.26.1: toque duplo no lado cria um vértice ali; toque duplo num vértice o remove */
function insertVertex(e0, i, x, y) {
  let e = asPath(e0);
  if (e.kind === 'line') e = { ...e, kind: 'path', pts: [e.x1, e.y1, e.x2, e.y2], rr: [0, 0] };
  else if (e.kind === 'rect' || e.kind === 'diamond' || e.kind === 'triangle') e = shapeToPoly(e);
  if (e.kind !== 'poly' && e.kind !== 'path') return null;
  if (e.kind === 'path') { delete e.x1; delete e.y1; delete e.x2; delete e.y2; }
  const pts = Array.from(e.pts); pts.splice((i + 1) * 2, 0, r2(x), r2(y)); const n = { ...e, pts };
  if (e.kind === 'path') { const rr = (e.rr || []).slice(); while (rr.length < e.pts.length / 2) rr.push(0); rr.splice(i + 1, 0, 0); n.rr = rr; }
  return n;
}
function removeVertex(e0, i) {
  const e = asPath(e0); if (e.kind !== 'poly' && e.kind !== 'path') return null;
  const n = e.pts.length / 2, min = e.kind === 'poly' && e.closed ? 4 : 3; if (n < min) return null;
  const pts = Array.from(e.pts); pts.splice(i * 2, 2); const out = { ...e, pts };
  if (e.kind === 'path') { const rr = (e.rr || []).slice(); rr.splice(i, 1); rr[0] = 0; rr[rr.length - 1] = 0; out.rr = rr; }
  return out;
}
Object.assign(Editor, {
  vTap(p, node) {
    const now = performance.now(), L = this._vLast; this._vLast = { x: p.x, y: p.y, t: now };
    if (!L || now - L.t > 400 || Math.hypot(p.x - L.x, p.y - L.y) > 16) return; this._vLast = null;
    const e = this.vEditEl(); if (!e) return; const pg = this.pageById(this.sel.pageId), o = this.layout[this.pageIdx(pg)];
    const w = this.toWorld(p.x, p.y), l = { x: w.x - o.x, y: w.y - o.y }; let n = null;
    if (node && node.t === 'v') { n = removeVertex(e, node.i); if (!n) return toast('A forma precisa desses vértices', 1200); }
    else if (node && node.t === 'e') n = insertVertex(e, node.i, node.x, node.y);
    else if (!node || node.t !== 'c') { /* toque duplo em cima da linha: vértice novo no ponto mais perto do lado tocado */
      const v = e.kind === 'line' ? [[e.x1, e.y1], [e.x2, e.y2]] : e.kind === 'poly' || e.kind === 'path' ? shapeVerts(asPath(e)) : e.kind === 'ellipse' ? null : shapeCorners(e); if (!v) return;
      const closed = e.kind !== 'line' && e.kind !== 'path' && !(e.kind === 'poly' && !e.closed) && !(e.kind === 'poly' && e.br);
      let best = null, bd = 14 / this.cam.z;
      for (let i = 0; i < v.length - (closed ? 0 : 1); i++) { const a = v[i], b = v[(i + 1) % v.length], dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((l.x - a[0]) * dx + (l.y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0.05, 0.95), q = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(q[0] - l.x, q[1] - l.y); if (d < bd) { bd = d; best = { i, q }; } }
      if (best) n = insertVertex(e, best.i, best.q[0], best.q[1]);
    }
    if (!n) return;
    n.id = e.id; this.recReplace(pg, e, n); this.opCommit(); if (navigator.vibrate) navigator.vibrate(10); this.requestRender();
  },

  vEdit: false,
  /* a forma em edição de pontos (ou null: a seleção mudou e o modo sai sozinho) */
  vEditEl() {
    if (!this.vEdit) return null;
    const els = this.selElements(); if (els.length === 1 && els[0].type === 'shape' && !els[0].lock) return els[0];
    this.vEdit = false; return null;
  },
  toggleVEdit() { if (this.vEditEl()) this.vEdit = false; else { this.vEdit = true; if (!this.vEditEl()) return; } UI.buildSelBar(); this.requestRender(); if (this.vEdit) hint('vedit', 'Arraste os pontos laranja para mudar a forma', 1600); },
  vNodesScreen(e) { const o = this.layout[this.pageIdx(this.pageById(this.sel.pageId))]; return shapeNodes(e).map((n) => ({ ...n, sx: this.toScreen(n.x + o.x, n.y + o.y).x, sy: this.toScreen(n.x + o.x, n.y + o.y).y })); },
  vHit(p) {
    const e = this.vEditEl(); if (!e) return null; let best = null, bd = 24;
    for (const n of this.vNodesScreen(e)) { const d = Math.hypot(p.x - n.sx, p.y - n.sy) - (n.t === 'v' ? 2 : 0); if (d < bd) { bd = d; best = n; } }
    return best;
  },
  startVNode(a) { a.el0 = this.vEditEl(); a.node = this._vn; const w = this.toWorld(a.start.x, a.start.y); a.pg = this.pageById(this.sel.pageId); a.l0 = this.local(this.pageIdx(a.pg), w.x, w.y); },
  moveVNode(p) {
    const a = this.action; if (!a.el0) this.startVNode(a);
    const w = this.toWorld(p.x, p.y), l = this.local(this.pageIdx(a.pg), w.x, w.y);
    const n = moveShapeNode(a.el0, a.node, l, a.l0, this.cam.z, Store.settings.vertexSnap !== false && !a.noSnap);
    this.selTf = { ox: 0, oy: 0, sx: 1, sy: 1, dx: 0, dy: 0, free: true, node: n }; this.requestRender();
  },
  drawVEdit(box) {
    const ctx = this.ctx, t = this.selTf, e = (t && t.node) || this.vEditEl(); if (!e) return;
    ctx.save(); ctx.strokeStyle = VEDIT_COLOR; ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]); ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.setLineDash([]);
    const N = this.vNodesScreen(e);
    if (e.kind === 'poly' && !e.br || e.kind === 'path' || e.kind === 'rect' || e.kind === 'diamond' || e.kind === 'triangle') { /* contorno fino ligando os vértices */
      const V = N.filter((n) => n.t === 'v'); if (V.length > 1) { ctx.beginPath(); V.forEach((n, i) => (i ? ctx.lineTo(n.sx, n.sy) : ctx.moveTo(n.sx, n.sy))); if ((e.kind !== 'poly' && e.kind !== 'path') || e.closed) ctx.closePath(); ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1.5; }
    }
    for (const n of N) {
      ctx.beginPath();
      /* v0.26.1: pontos menores (cobrem menos a forma); a área de toque continua de ~24 px */
      if (n.t === 'v') { ctx.arc(n.sx, n.sy, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(n.sx, n.sy, 2, 0, Math.PI * 2); ctx.fillStyle = VEDIT_COLOR; ctx.fill(); }
      else if (n.t === 'e') { ctx.roundRect(n.sx - 4, n.sy - 4, 8, 8, 1.5); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); }
      else { ctx.moveTo(n.sx, n.sy - 5.5); ctx.lineTo(n.sx + 5.5, n.sy); ctx.lineTo(n.sx, n.sy + 5.5); ctx.lineTo(n.sx - 5.5, n.sy); ctx.closePath(); ctx.fillStyle = VEDIT_COLOR; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.strokeStyle = VEDIT_COLOR; }
    }
    ctx.restore();
  },
});
