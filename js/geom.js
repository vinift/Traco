'use strict';
/* ===== Geometria, traços e elementos ===== */
const _bboxCache = new WeakMap();
const _pathCache = new WeakMap();
const _textCache = new WeakMap();
const measureCtx = document.createElement('canvas').getContext('2d');

function penRadius(w, p) { return (w / 2) * (0.35 + 1.3 * clamp(p, 0, 1)); }

/* Contorno do traço da caneta: cadeia de "cápsulas" (círculos + trapézios tangentes) com mesma orientação */
function addCapsule(path, x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  if (d < Math.abs(r1 - r2) || d < 0.01) return;
  const th = Math.atan2(dy, dx), al = Math.acos(clamp((r1 - r2) / d, -1, 1));
  const a1 = th + al, a2 = th - al;
  const P = [
    [x1 + r1 * Math.cos(a1), y1 + r1 * Math.sin(a1)], [x2 + r2 * Math.cos(a1), y2 + r2 * Math.sin(a1)],
    [x2 + r2 * Math.cos(a2), y2 + r2 * Math.sin(a2)], [x1 + r1 * Math.cos(a2), y1 + r1 * Math.sin(a2)],
  ];
  let area = 0; for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) P.reverse();
  path.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 4; i++) path.lineTo(P[i][0], P[i][1]); path.closePath();
}
function addCircle(path, x, y, r) { path.moveTo(x + r, y); path.arc(x, y, r, 0, Math.PI * 2, false); path.closePath(); }

function buildPenPath(pts, w, path = new Path2D(), from = 0) {
  const n = pts.length / 3;
  if (n === 0) return path;
  let px = pts[from * 3], py = pts[from * 3 + 1], pr = penRadius(w, pts[from * 3 + 2]);
  if (from === 0) addCircle(path, px, py, pr);
  for (let i = from + 1; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], r = penRadius(w, pts[i * 3 + 2]);
    addCircle(path, x, y, r); addCapsule(path, px, py, pr, x, y, r);
    px = x; py = y; pr = r;
  }
  return path;
}
function buildPolyPath(pts, path = new Path2D()) {
  const n = pts.length / 3; if (!n) return path;
  path.moveTo(pts[0], pts[1]);
  if (n === 1) { path.lineTo(pts[0] + 0.01, pts[1]); return path; }
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], nx = pts[(i + 1) * 3], ny = pts[(i + 1) * 3 + 1];
    path.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  path.lineTo(pts[(n - 1) * 3], pts[(n - 1) * 3 + 1]);
  return path;
}
function shapeGeom(e) {
  const x1 = Math.min(e.x1, e.x2), x2 = Math.max(e.x1, e.x2), y1 = Math.min(e.y1, e.y2), y2 = Math.max(e.y1, e.y2);
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
}
function buildShapePath(e) {
  const p = new Path2D();
  const g = shapeGeom(e);
  switch (e.kind) {
    case 'line': p.moveTo(e.x1, e.y1); p.lineTo(e.x2, e.y2); break;
    case 'arrow': {
      p.moveTo(e.x1, e.y1); p.lineTo(e.x2, e.y2);
      const a = Math.atan2(e.y2 - e.y1, e.x2 - e.x1), L = Math.max(10, e.width * 4.5);
      p.moveTo(e.x2 - L * Math.cos(a - 0.45), e.y2 - L * Math.sin(a - 0.45)); p.lineTo(e.x2, e.y2);
      p.lineTo(e.x2 - L * Math.cos(a + 0.45), e.y2 - L * Math.sin(a + 0.45)); break;
    }
    case 'rect': p.rect(g.x1, g.y1, g.w, g.h); break;
    case 'ellipse': p.ellipse((g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2, g.w / 2, g.h / 2, 0, 0, Math.PI * 2); break;
    case 'triangle': p.moveTo((g.x1 + g.x2) / 2, g.y1); p.lineTo(g.x2, g.y2); p.lineTo(g.x1, g.y2); p.closePath(); break;
    case 'diamond': p.moveTo((g.x1 + g.x2) / 2, g.y1); p.lineTo(g.x2, (g.y1 + g.y2) / 2); p.lineTo((g.x1 + g.x2) / 2, g.y2); p.lineTo(g.x1, (g.y1 + g.y2) / 2); p.closePath(); break;
    case 'poly': { const q = e.pts; p.moveTo(q[0], q[1]); for (let i = 2; i < q.length; i += 2) p.lineTo(q[i], q[i + 1]); if (e.closed) p.closePath(); break; }
  }
  return p;
}
function elPath(e) {
  let p = _pathCache.get(e); if (p) return p;
  if (e.type === 'stroke') p = e.tool === 'pen' ? buildPenPath(e.pts, e.width) : buildPolyPath(e.pts);
  else if (e.type === 'shape') p = buildShapePath(e);
  _pathCache.set(e, p); return p;
}
function textFont(e) { return `${e.bold ? '600 ' : ''}${e.size}px system-ui,-apple-system,Roboto,sans-serif`; }
const STICKY_PAD = 16;
function layoutText(e) {
  let L = _textCache.get(e); if (L) return L;
  measureCtx.font = textFont(e);
  const lines = [];
  for (const para of (e.text || '').split('\n')) {
    const words = para.split(/(\s+)/); let cur = '';
    const maxW = e.sticky ? e.w - 2 * STICKY_PAD : e.w;
    for (const w of words) {
      const t = cur + w;
      if (measureCtx.measureText(t).width > maxW && cur.trim()) { lines.push(cur.replace(/\s+$/, '')); cur = w.replace(/^\s+/, ''); }
      else cur = t;
    }
    lines.push(cur);
  }
  const th = Math.max(1, lines.length) * e.size * 1.3;
  L = { lines, lh: e.size * 1.3, h: e.sticky ? Math.max(e.minH || e.w, th + 2 * STICKY_PAD) : th };
  _textCache.set(e, L); return L;
}
function elBBox(e) {
  let b = _bboxCache.get(e); if (b) return b;
  if (e.type === 'stroke') {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i < e.pts.length; i += 3) { const x = e.pts[i], y = e.pts[i + 1]; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    const m = e.tool === 'pen' ? penRadius(e.width, 1) : e.width / 2;
    b = { x: x1 - m, y: y1 - m, w: x2 - x1 + 2 * m, h: y2 - y1 + 2 * m };
  } else if (e.type === 'shape') {
    let x1, y1, x2, y2;
    if (e.kind === 'poly') { x1 = y1 = Infinity; x2 = y2 = -Infinity; for (let i = 0; i < e.pts.length; i += 2) { x1 = Math.min(x1, e.pts[i]); x2 = Math.max(x2, e.pts[i]); y1 = Math.min(y1, e.pts[i + 1]); y2 = Math.max(y2, e.pts[i + 1]); } }
    else { const g = shapeGeom(e); x1 = g.x1; y1 = g.y1; x2 = g.x2; y2 = g.y2; }
    const m = e.width / 2 + (e.kind === 'arrow' ? e.width * 4 : 0);
    b = { x: x1 - m, y: y1 - m, w: x2 - x1 + 2 * m, h: y2 - y1 + 2 * m };
  } else if (e.type === 'text') { b = { x: e.x, y: e.y, w: e.w, h: layoutText(e).h }; }
  else if (e.type === 'image') b = { x: e.x, y: e.y, w: e.w, h: e.h };
  else if (e.type === 'table') { const m = (e.bw || 1) / 2; b = { x: e.x - m, y: e.y - m, w: e.w + 2 * m, h: e.h + 2 * m }; }
  else if (e.bbox) b = e.bbox; else b = { x: e.x || 0, y: e.y || 0, w: e.w || 10, h: e.h || 10 };
  if (e.rot && hasRot(e)) { // caixa envolvente da versão girada
    const c = rawCenter(e); let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) { const q = rotPt(px, py, c.x, c.y, e.rot); x1 = Math.min(x1, q[0]); x2 = Math.max(x2, q[0]); y1 = Math.min(y1, q[1]); y2 = Math.max(y2, q[1]); }
    b = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  _bboxCache.set(e, b); return b;
}
function bboxUnion(list) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const e of list) { const b = elBBox(e); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
  return isFinite(x1) ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}
const rectsHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/* Pontos de amostra do contorno de uma forma (para borracha e laço) */
function shapeSamples(e) {
  const out = shapeSamplesRaw(e);
  if (!e.rot || !hasRot(e)) return out;
  const c = rawCenter(e); return out.map(([x, y]) => rotPt(x, y, c.x, c.y, e.rot));
}
function shapeSamplesRaw(e) {
  const out = [];
  if (e.kind === 'poly') { for (let i = 0; i < e.pts.length; i += 2) out.push([e.pts[i], e.pts[i + 1]]); if (e.closed) out.push([e.pts[0], e.pts[1]]); return out; }
  if (e.kind === 'line' || e.kind === 'arrow') { for (let t = 0; t <= 1; t += 0.05) out.push([e.x1 + (e.x2 - e.x1) * t, e.y1 + (e.y2 - e.y1) * t]); return out; }
  const g = shapeGeom(e), cx = (g.x1 + g.x2) / 2, cy = (g.y1 + g.y2) / 2;
  if (e.kind === 'ellipse') { for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 24) out.push([cx + (g.w / 2) * Math.cos(a), cy + (g.h / 2) * Math.sin(a)]); return out; }
  let poly;
  if (e.kind === 'rect') poly = [[g.x1, g.y1], [g.x2, g.y1], [g.x2, g.y2], [g.x1, g.y2]];
  else if (e.kind === 'triangle') poly = [[cx, g.y1], [g.x2, g.y2], [g.x1, g.y2]];
  else poly = [[cx, g.y1], [g.x2, cy], [cx, g.y2], [g.x1, cy]];
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; for (let t = 0; t < 1; t += 0.1) out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  out.push(poly[0]); return out;
}
/* Distância de um ponto até o elemento (0 = dentro) */
function hitElement(e, x, y, tol) {
  const b = elBBox(e);
  if (x < b.x - tol || x > b.x + b.w + tol || y < b.y - tol || y > b.y + b.h + tol) return false;
  let ux = x, uy = y; // ponto no referencial sem rotação
  if (e.rot && hasRot(e)) { const c = rawCenter(e); [ux, uy] = rotPt(x, y, c.x, c.y, -e.rot); }
  if (e.type === 'stroke') {
    const p = e.pts, n = p.length / 3, wr = (e.tool === 'pen' ? penRadius(e.width, 0.6) : e.width / 2) + tol;
    if (n === 1) return Math.hypot(x - p[0], y - p[1]) <= wr;
    for (let i = 1; i < n; i++) if (distSeg(x, y, p[(i - 1) * 3], p[(i - 1) * 3 + 1], p[i * 3], p[i * 3 + 1]) <= wr) return true;
    return false;
  }
  if (e.type === 'shape') {
    if (e.fill && e.kind !== 'line' && e.kind !== 'arrow') { measureCtx.setTransform(1, 0, 0, 1, 0, 0); if (measureCtx.isPointInPath(elPath(e), ux, uy)) return true; }
    const s = shapeSamples(e), wr = e.width / 2 + tol;
    for (let i = 1; i < s.length; i++) if (distSeg(x, y, s[i - 1][0], s[i - 1][1], s[i][0], s[i][1]) <= wr) return true;
    return false;
  }
  if (e.type === 'table') { // tabela: só as linhas contam (escrever dentro das células não "acerta" a tabela)
    const g = tableGrid(e), t = tol + (e.bw || 1) / 2 + 2;
    if (ux < e.x - t || ux > e.x + e.w + t || uy < e.y - t || uy > e.y + e.h + t) return false;
    return g.xs.some((gx) => Math.abs(ux - gx) <= t) || g.ys.some((gy) => Math.abs(uy - gy) <= t);
  }
  const rb = rawBox(e); // texto e imagem: dentro da caixa
  return ux >= rb.x - tol && ux <= rb.x + rb.w + tol && uy >= rb.y - tol && uy <= rb.y + rb.h + tol;
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function elInLasso(e, poly) {
  let pts;
  if (e.type === 'stroke') { pts = []; for (let i = 0; i < e.pts.length; i += 3) pts.push([e.pts[i], e.pts[i + 1]]); }
  else if (e.type === 'shape') pts = shapeSamples(e);
  else { const b = elBBox(e); return pointInPoly(b.x + b.w / 2, b.y + b.h / 2, poly); }
  const step = Math.max(1, Math.floor(pts.length / 40)); let inn = 0, tot = 0;
  for (let i = 0; i < pts.length; i += step) { tot++; if (pointInPoly(pts[i][0], pts[i][1], poly)) inn++; }
  return inn / tot >= 0.5;
}
/* Transformações — sempre retornam um novo objeto (invalida caches) */
function transformEl(e, f) { // f: {sx, sy, ox, oy, dx, dy}  x' = ox + (x-ox)*sx + dx
  const X = (x) => f.ox + (x - f.ox) * f.sx + f.dx, Y = (y) => f.oy + (y - f.oy) * f.sy + f.dy;
  const s = Math.sqrt(Math.abs(f.sx * f.sy));
  const n = { ...e };
  if (e.type === 'stroke') { const p = new Array(e.pts.length); for (let i = 0; i < p.length; i += 3) { p[i] = r2(X(e.pts[i])); p[i + 1] = r2(Y(e.pts[i + 1])); p[i + 2] = e.pts[i + 2]; } n.pts = p; if (s !== 1) n.width = e.width * s; }
  else if (e.type === 'shape') {
    if (e.kind === 'poly') { n.pts = e.pts.map((v, i) => r2(i % 2 ? Y(v) : X(v))); }
    else { n.x1 = X(e.x1); n.y1 = Y(e.y1); n.x2 = X(e.x2); n.y2 = Y(e.y2); }
    if (s !== 1) n.width = e.width * s;
  } else if (e.type === 'text') { n.x = X(e.x); n.y = Y(e.y); n.w = Math.max(20, e.w * f.sx); if (f.sx !== 1 || f.sy !== 1) { n.size = Math.max(4, e.size * f.sy); if (e.minH) n.minH = e.minH * f.sy; } }
  else if (e.type === 'image') { n.x = X(e.x); n.y = Y(e.y); n.w = e.w * f.sx; n.h = e.h * f.sy; }
  else if (e.type === 'table') { n.x = X(e.x); n.y = Y(e.y); n.w = e.w * f.sx; n.h = e.h * f.sy; if (s !== 1) n.bw = (e.bw || 1) * s; }
  else { if (n.x != null) { n.x = X(e.x); n.y = Y(e.y); } }
  return n;
}
const r2 = (v) => Math.round(v * 100) / 100;

/* Borracha por área: divide traços removendo pontos dentro do raio */
function eraseFromStroke(e, x, y, r) {
  const p = e.pts, n = p.length / 3, wr = r + (e.tool === 'pen' ? penRadius(e.width, 0.5) : e.width / 2) * 0.6;
  const segs = []; let cur = []; let touched = false;
  for (let i = 0; i < n; i++) {
    const px = p[i * 3], py = p[i * 3 + 1];
    if (Math.hypot(px - x, py - y) <= wr) { touched = true; if (cur.length) { segs.push(cur); cur = []; } }
    else cur.push(px, py, p[i * 3 + 2]);
  }
  if (cur.length) segs.push(cur);
  if (!touched) return null;
  return segs.filter((s) => s.length >= 3).map((s) => ({ ...e, id: uid(), pts: s }));
}

/* ===== Reconhecimento de formas (segurar a caneta parada no fim do traço) ===== */
function rdp(points, eps) {
  if (points.length < 3) return points;
  let dmax = 0, idx = 0; const a = points[0], b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) { const d = distSeg(points[i][0], points[i][1], a[0], a[1], b[0], b[1]); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > eps) { const l = rdp(points.slice(0, idx + 1), eps), r = rdp(points.slice(idx), eps); return l.slice(0, -1).concat(r); }
  return [a, b];
}
function recognizeShape(flat) {
  const P = []; for (let i = 0; i < flat.length; i += 3) P.push([flat[i], flat[i + 1]]);
  if (P.length < 4) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, len = 0;
  P.forEach((p, i) => { x1 = Math.min(x1, p[0]); x2 = Math.max(x2, p[0]); y1 = Math.min(y1, p[1]); y2 = Math.max(y2, p[1]); if (i) len += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]); });
  const diag = Math.hypot(x2 - x1, y2 - y1); if (diag < 12) return null;
  const a = P[0], b = P[P.length - 1], chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (chord / len > 0.9) {
    let dev = 0; for (const p of P) dev = Math.max(dev, distSeg(p[0], p[1], a[0], a[1], b[0], b[1]));
    if (dev / chord < 0.1) return { kind: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
  }
  if (chord > diag * 0.3) return null; // não fechado
  const simp = rdp(P, diag * 0.06);
  const corners = simp.length - 1; // primeiro == ~último
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = (x2 - x1) / 2, ry = (y2 - y1) / 2;
  let eErr = 0; for (const p of P) { const d = Math.hypot((p[0] - cx) / (rx || 1), (p[1] - cy) / (ry || 1)); eErr += Math.abs(d - 1); } eErr /= P.length;
  if (corners === 3) return snapTriangle(simp.slice(0, 3));
  if (corners === 4 && eErr > 0.08) {
    // retângulo alinhado se os lados forem quase horizontais/verticais
    let aligned = true;
    for (let i = 0; i < 4; i++) { const p = simp[i], q = simp[i + 1]; const ang = Math.abs(Math.atan2(q[1] - p[1], q[0] - p[0])) % (Math.PI / 2); if (Math.min(ang, Math.PI / 2 - ang) > 0.25) aligned = false; }
    if (aligned) return snapBox({ kind: 'rect', x1, y1, x2, y2 });
    // losango: cantos perto do meio de cada lado da caixa
    const mids = [[cx, y1], [x2, cy], [cx, y2], [x1, cy]], tolD = diag * 0.12;
    if (simp.slice(0, 4).every((p) => mids.some((m) => Math.hypot(p[0] - m[0], p[1] - m[1]) < tolD))) return snapBox({ kind: 'diamond', x1, y1, x2, y2 });
    const pts = []; for (let i = 0; i < 4; i++) pts.push(r2(simp[i][0]), r2(simp[i][1]));
    return { kind: 'poly', pts, closed: true };
  }
  if (eErr < 0.2) return snapBox({ kind: 'ellipse', x1, y1, x2, y2 });
  return null;
}

/* ===== Rabiscar para apagar ===== */
// Rabisco = vai e volta várias vezes sobre a MESMA região, cruzando quase toda a largura (ou altura) a cada passada.
// A letra cursiva avança para a direita, então as passadas não se sobrepõem — isso evita apagar por engano.
function isScribble(flat) {
  const n = flat.length / 3; if (n < 14) return false;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, len = 0;
  for (let i = 0; i < n; i++) { const x = flat[i * 3], y = flat[i * 3 + 1]; x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); if (i) len += Math.hypot(x - flat[i * 3 - 3], y - flat[i * 3 - 2]); }
  const w = x2 - x1, h = y2 - y1; if (w + h < 16) return false;
  const passes = (axis) => { // passadas longas ao longo de um eixo (com histerese para ignorar tremidas)
    const ext = axis ? h : w; if (ext < 12) return { n: 0, drift: Infinity };
    const thr = ext * 0.12; let dir = 0, ex = flat[axis], exC = flat[1 - axis]; const turns = [[ex, exC]];
    for (let i = 1; i < n; i++) {
      const v = flat[i * 3 + axis], c = flat[i * 3 + 1 - axis];
      if (!dir) { if (Math.abs(v - ex) > thr) { dir = Math.sign(v - ex); ex = v; exC = c; } continue; }
      if ((v - ex) * dir > 0) { ex = v; exC = c; } else if (Math.abs(v - ex) > thr) { turns.push([ex, exC]); dir = -dir; ex = v; exC = c; }
    }
    turns.push([ex, exC]);
    const long = []; for (let k = 1; k < turns.length; k++) { const L = Math.abs(turns[k][0] - turns[k - 1][0]); if (L >= ext * 0.55) long.push(Math.abs(turns[k][1] - turns[k - 1][1])); }
    return { n: long.length, drift: long.length ? long.reduce((s2, d) => s2 + d, 0) / long.length : Infinity };
  };
  const H = passes(0), V = passes(1);
  const okH = H.n >= 5 && H.drift < Math.max(14, h * 0.45);           // vai-e-volta horizontal
  const okV = V.n >= 5 && V.drift < Math.max(14, w * 0.3) && w / Math.max(h, 1) < 2.2; // vai-e-volta vertical, compacto
  return (okH || okV) && len > 3.2 * (w + h);
}
// Apaga tudo o que estiver majoritariamente dentro da área do rabisco, mesmo sem encostar
function scribbleTargets(elements, flat) {
  const P = []; for (let i = 0; i < flat.length; i += 3) P.push([flat[i], flat[i + 1]]);
  const hull = convexHull(P); if (hull.length < 3) return [];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const [x, y] of hull) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); }
  const sb = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  const out = [];
  for (const e of elements) {
    const b = elBBox(e); if (!rectsHit(b, sb)) continue;
    if (e.type === 'image' || e.type === 'table') continue; // imagens e tabelas só com a borracha
    let hits = 0; for (let i = 0; i < P.length && hits < 3; i += 2) if (hitElement(e, P[i][0], P[i][1], 2)) hits++;
    if (hits >= 3 || elInLasso(e, hull)) out.push(e);
  }
  return out;
}

/* ===== Rotação ===== */
function rotPt(x, y, cx, cy, a) { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; }
function hasRot(e) { return e.type === 'image' || e.type === 'text' || e.type === 'table' || (e.type === 'shape' && e.kind !== 'line' && e.kind !== 'arrow' && e.kind !== 'poly'); }
function rawBox(e) {
  if (e.type === 'text') return { x: e.x, y: e.y, w: e.w, h: layoutText(e).h };
  if (e.type === 'image' || e.type === 'table') return { x: e.x, y: e.y, w: e.w, h: e.h };
  const g = shapeGeom(e); return { x: g.x1, y: g.y1, w: g.w, h: g.h };
}
function rawCenter(e) { const b = rawBox(e); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
function rotateEl(e, ang, cx, cy) {
  const R = (x, y) => rotPt(x, y, cx, cy, ang), n = { ...e };
  if (e.type === 'stroke') { const p = e.pts.slice(); for (let i = 0; i < p.length; i += 3) { const q = R(p[i], p[i + 1]); p[i] = r2(q[0]); p[i + 1] = r2(q[1]); } n.pts = p; return n; }
  if (e.type === 'shape' && e.kind === 'poly') { const p = e.pts.slice(); for (let i = 0; i < p.length; i += 2) { const q = R(p[i], p[i + 1]); p[i] = r2(q[0]); p[i + 1] = r2(q[1]); } n.pts = p; return n; }
  if (e.type === 'shape' && (e.kind === 'line' || e.kind === 'arrow')) { const a = R(e.x1, e.y1), b = R(e.x2, e.y2); n.x1 = a[0]; n.y1 = a[1]; n.x2 = b[0]; n.y2 = b[1]; return n; }
  if (hasRot(e)) {
    const c = rawCenter(e), q = R(c.x, c.y), dx = q[0] - c.x, dy = q[1] - c.y;
    if (e.type === 'shape') { n.x1 = e.x1 + dx; n.x2 = e.x2 + dx; n.y1 = e.y1 + dy; n.y2 = e.y2 + dy; } else { n.x = e.x + dx; n.y = e.y + dy; }
    n.rot = ((e.rot || 0) + ang) % (Math.PI * 2); if (Math.abs(n.rot) < 1e-4) delete n.rot;
  }
  return n;
}
/* Alinha linhas a 0°, 45°, 90°… quando estão perto desses ângulos */
function snapAngle(x1, y1, x2, y2, tolDeg = 7) {
  if (Store.settings.angleSnap === false) return [x2, y2];
  const ang = Math.atan2(y2 - y1, x2 - x1), step = Math.PI / 4, sn = Math.round(ang / step) * step;
  if (Math.abs(ang - sn) > tolDeg * Math.PI / 180) return [x2, y2];
  const L = Math.hypot(x2 - x1, y2 - y1); return [x1 + L * Math.cos(sn), y1 + L * Math.sin(sn)];
}
/* Tipos de linha */
const LINE_TYPES = [['solid', 'Sólida'], ['dot', 'Pontilhada'], ['long', 'Traço longo'], ['short', 'Traço curto'], ['dashdot', 'Ponto e traço'], ['mixed', 'Traços mistos']];
function dashPattern(dash, w) {
  const u = Math.max(w, 1.5);
  switch (dash) {
    case 'dot': return [0.001, u * 2.4];
    case 'long': return [u * 7, u * 3];
    case 'short': return [u * 2.5, u * 2.5];
    case 'dashdot': return [u * 6, u * 2.5, 0.001, u * 2.5];
    case 'mixed': return [u * 7, u * 2.5, u * 2.5, u * 2.5];
    default: return [];
  }
}
/* Envoltória convexa (para a área do rabisco) */
function convexHull(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/* ===== Formas padrão: quadrado, círculo, triângulos ===== */
function snapBox(sh, tol = 0.15) { // quase quadrado/círculo → exato (mantém o centro)
  const w = Math.abs(sh.x2 - sh.x1), h = Math.abs(sh.y2 - sh.y1); if (!w || !h) return sh;
  let tw = w, th = h;
  if (sh.kind === 'triangle') { const eq = w * 0.866; if (Math.abs(h - eq) / eq < tol) th = eq; } // equilátero
  else if (Math.abs(w - h) / Math.max(w, h) < tol) tw = th = (w + h) / 2;
  if (tw === w && th === h) return sh;
  const cx = (sh.x1 + sh.x2) / 2, cy = (sh.y1 + sh.y2) / 2;
  return { ...sh, x1: cx - tw / 2, x2: cx + tw / 2, y1: cy - th / 2, y2: cy + th / 2 };
}
function snapTriangle(P) {
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys), w = x2 - x1, h = y2 - y1, tol = 0.14;
  const near = (a, b, size) => Math.abs(a - b) < size * tol;
  // isósceles/equilátero com a base embaixo: dois pontos com o mesmo y perto do fundo e o terceiro no meio, em cima
  const bottom = P.filter((p) => near(p[1], y2, h)), top = P.filter((p) => near(p[1], y1, h));
  if (bottom.length === 2 && top.length === 1 && near(top[0][0], (x1 + x2) / 2, w)) return snapBox({ kind: 'triangle', x1, y1, x2, y2 });
  // triângulo retângulo com os catetos na horizontal e na vertical
  for (const c of P) {
    const others = P.filter((p) => p !== c);
    const v = others.find((p) => near(p[0], c[0], w || 1)), hz = others.find((p) => p !== v && near(p[1], c[1], h || 1));
    if (v && hz) { const pts = [c[0], c[1], c[0], v[1], hz[0], c[1]].map(r2); return { kind: 'poly', pts, closed: true }; }
  }
  const pts = []; for (const p of P) pts.push(r2(p[0]), r2(p[1]));
  return { kind: 'poly', pts, closed: true };
}
/* ===== Tabela ===== */
function tableGrid(e) {
  const cw = e.colW && e.colW.length === e.cols ? e.colW : Array(e.cols).fill(1), rh = e.rowH && e.rowH.length === e.rows ? e.rowH : Array(e.rows).fill(1);
  const sw = cw.reduce((a, b) => a + b, 0), sh = rh.reduce((a, b) => a + b, 0);
  const xs = [e.x], ys = [e.y]; let acc = 0; for (const c of cw) { acc += c; xs.push(e.x + (e.w * acc) / sw); } acc = 0; for (const r of rh) { acc += r; ys.push(e.y + (e.h * acc) / sh); }
  return { xs, ys };
}
