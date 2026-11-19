'use strict';
/* ===== v0.25: "Editar pontos" de uma forma selecionada (botão na barra da seleção) =====
   A seleção fica laranja e aparecem os pontos: vértices (círculos), arestas (quadradinhos no meio do lado: arrastam o lado inteiro)
   e curvas (losangos, no colchete: mudam o raio da curva). Retângulo/losango/triângulo viram polígono ao mexer num ponto;
   elipse tem 4 pontos que mudam a largura/altura; linha e seta têm as 2 pontas. Sem mudar a espessura. */
const VEDIT_COLOR = '#f97316';
const BR_K = 1 - Math.SQRT1_2; /* meio do quarto de círculo: (1 − cos 45°)·r de cada eixo a partir do canto */

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
/* pontos editáveis de uma forma, em coordenadas da página. t: 'v' vértice, 'e' aresta, 'c' curva */
function shapeNodes(e) {
  const N = [];
  if (e.kind === 'line' || e.kind === 'arrow') { N.push({ t: 'v', k: 'p1', x: e.x1, y: e.y1 }, { t: 'v', k: 'p2', x: e.x2, y: e.y2 }); return N; }
  if (e.kind === 'ellipse') {
    const g = shapeGeom(e), cx = (g.x1 + g.x2) / 2, cy = (g.y1 + g.y2) / 2, a = e.rot || 0, c = Math.cos(a), s = Math.sin(a), rx = g.w / 2, ry = g.h / 2;
    for (const [k, ux, uy] of [['rx', 1, 0], ['rx', -1, 0], ['ry', 0, 1], ['ry', 0, -1]]) { const lx = ux * rx, ly = uy * ry; N.push({ t: 'e', k, x: cx + lx * c - ly * s, y: cy + lx * s + ly * c }); }
    return N;
  }
  if (e.kind === 'poly' && e.br) {
    const b = bracketFix(e.br), P = (cr, ax) => (b.v ? { x: cr, y: ax } : { x: ax, y: cr });
    N.push({ t: 'v', k: 'T', ...P(b.sx + b.hT, b.top) }, { t: 'v', k: 'B', ...P(b.sx + b.hB, b.bot) }, { t: 'e', k: 'S', ...P(b.sx, (b.top + b.bot) / 2) });
    if (b.hT) N.push({ t: 'c', k: 'cT', ...P(b.sx + Math.sign(b.hT) * b.rT * BR_K, b.top + b.rT * BR_K) });
    if (b.hB) N.push({ t: 'c', k: 'cB', ...P(b.sx + Math.sign(b.hB) * b.rB * BR_K, b.bot - b.rB * BR_K) });
    return N;
  }
  let P;
  if (e.kind === 'poly') { P = []; for (let i = 0; i < e.pts.length; i += 2) P.push([e.pts[i], e.pts[i + 1]]); }
  else P = shapeCorners(e);
  if (P.length > 30) return N; /* polígono com pontos demais (curva antiga): só mover */
  P.forEach(([x, y], i) => N.push({ t: 'v', k: 'v' + i, i, x, y }));
  const closed = e.kind !== 'poly' || e.closed, m = closed ? P.length : P.length - 1;
  for (let i = 0; i < m; i++) { const a = P[i], c = P[(i + 1) % P.length]; N.push({ t: 'e', k: 'e' + i, i, x: (a[0] + c[0]) / 2, y: (a[1] + c[1]) / 2 }); }
  return N;
}
/* nova forma com o ponto `nd` arrastado até `l` (coordenadas da página); `s` = onde o arrasto começou */
function moveShapeNode(e, nd, l, s, z) {
  if (e.kind === 'line' || e.kind === 'arrow') { const n = { ...e }; if (nd.k === 'p1') { n.x1 = r2(l.x); n.y1 = r2(l.y); } else { n.x2 = r2(l.x); n.y2 = r2(l.y); } return n; }
  if (e.kind === 'ellipse') {
    const g = shapeGeom(e), cx = (g.x1 + g.x2) / 2, cy = (g.y1 + g.y2) / 2, a = e.rot || 0, dx = l.x - cx, dy = l.y - cy;
    const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a), n = { ...e };
    if (nd.k === 'rx') { const r = Math.max(2, Math.abs(lx)); n.x1 = r2(cx - r); n.x2 = r2(cx + r); n.y1 = g.y1; n.y2 = g.y2; }
    else { const r = Math.max(2, Math.abs(ly)); n.y1 = r2(cy - r); n.y2 = r2(cy + r); n.x1 = g.x1; n.x2 = g.x2; }
    return n;
  }
  if (e.kind === 'poly' && e.br) {
    const b = bracketFix(e.br), ax = b.v ? l.y : l.x, cr = b.v ? l.x : l.y, min = 6 / z;
    const hook = (old) => { const h = cr - b.sx; return Math.abs(h) < min ? (old ? Math.sign(old) * Math.min(Math.abs(old), min) : 0) : h; };
    if (nd.k === 'T') { b.top = Math.min(ax, b.bot - 8); const h = hook(b.hT); if (!b.hT && h) b.rT = 0; b.hT = h; }
    else if (nd.k === 'B') { b.bot = Math.max(ax, b.top + 8); const h = hook(b.hB); if (!b.hB && h) b.rB = 0; b.hB = h; }
    else if (nd.k === 'S') { const d = cr - (b.v ? s.x : s.y); b.sx = (e.br.sx) + d; }
    else if (nd.k === 'cT') { const t = ((cr - b.sx) * Math.sign(b.hT) + (ax - b.top)) / 2; b.rT = Math.max(1, t / BR_K); }
    else if (nd.k === 'cB') { const t = ((cr - b.sx) * Math.sign(b.hB) + (b.bot - ax)) / 2; b.rB = Math.max(1, t / BR_K); }
    for (const k of ['sx', 'top', 'bot', 'hT', 'hB', 'rT', 'rB']) b[k] = r2(b[k]);
    return { ...e, ...bracketShape(b) };
  }
  const p = e.kind === 'poly' ? e : shapeToPoly(e), n = { ...p, pts: p.pts.slice() }, L = n.pts.length / 2;
  if (nd.t === 'v') { n.pts[nd.i * 2] = r2(l.x); n.pts[nd.i * 2 + 1] = r2(l.y); }
  else { const dx = l.x - s.x, dy = l.y - s.y, j = (nd.i + 1) % L; for (const q of [nd.i, j]) { n.pts[q * 2] = r2(p.pts[q * 2] + dx); n.pts[q * 2 + 1] = r2(p.pts[q * 2 + 1] + dy); } }
  return n;
}

Object.assign(Editor, {
  vEdit: false,
  /* a forma em edição de pontos (ou null: a seleção mudou e o modo sai sozinho) */
  vEditEl() {
    if (!this.vEdit) return null;
    const els = this.selElements(); if (els.length === 1 && els[0].type === 'shape' && !els[0].lock) return els[0];
    this.vEdit = false; return null;
  },
  toggleVEdit() { if (this.vEditEl()) this.vEdit = false; else { this.vEdit = true; if (!this.vEditEl()) return; } UI.buildSelBar(); this.requestRender(); if (this.vEdit) toast('Arraste os pontos laranja para mudar a forma', 1600); },
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
    const n = moveShapeNode(a.el0, a.node, l, a.l0, this.cam.z);
    this.selTf = { ox: 0, oy: 0, sx: 1, sy: 1, dx: 0, dy: 0, free: true, node: n }; this.requestRender();
  },
  drawVEdit(box) {
    const ctx = this.ctx, t = this.selTf, e = (t && t.node) || this.vEditEl(); if (!e) return;
    ctx.save(); ctx.strokeStyle = VEDIT_COLOR; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.setLineDash([]);
    const N = this.vNodesScreen(e);
    if (e.kind === 'poly' && !e.br || e.kind === 'rect' || e.kind === 'diamond' || e.kind === 'triangle') { /* contorno fino ligando os vértices */
      const V = N.filter((n) => n.t === 'v'); if (V.length > 1) { ctx.beginPath(); V.forEach((n, i) => (i ? ctx.lineTo(n.sx, n.sy) : ctx.moveTo(n.sx, n.sy))); if (e.kind !== 'poly' || e.closed) ctx.closePath(); ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1.5; }
    }
    for (const n of N) {
      ctx.beginPath();
      if (n.t === 'v') { ctx.arc(n.sx, n.sy, 8, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(n.sx, n.sy, 3.5, 0, Math.PI * 2); ctx.fillStyle = VEDIT_COLOR; ctx.fill(); }
      else if (n.t === 'e') { ctx.roundRect(n.sx - 6, n.sy - 6, 12, 12, 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); }
      else { ctx.moveTo(n.sx, n.sy - 8); ctx.lineTo(n.sx + 8, n.sy); ctx.lineTo(n.sx, n.sy + 8); ctx.lineTo(n.sx - 8, n.sy); ctx.closePath(); ctx.fillStyle = VEDIT_COLOR; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.strokeStyle = VEDIT_COLOR; }
    }
    ctx.restore();
  },
});
