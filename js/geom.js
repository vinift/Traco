'use strict';
/* ===== Geometria, traços e elementos ===== */
const _bboxCache = new WeakMap();
/* caminhos de desenho (Path2D) guardados com limite: numa nota de 36 mil traços eles chegavam a ~500 MB de memória
   e derrubavam o app. Os blocos já guardam a imagem pronta, então basta manter os caminhos usados por último. */
const PathLRU = {
  map: new Map(), cost: 0, max: 1600000, // ~1,6 milhão de números de pontos (≈ 3–4 mil traços longos)
  get(e) { const v = this.map.get(e); if (!v) return null; this.map.delete(e); this.map.set(e, v); return v.p; },
  set(e, p) { const c = (e.pts ? e.pts.length : 60) + 40; this.map.set(e, { p, c }); this.cost += c; if (this.cost > this.max) this.trim(); },
  trim() { for (const [k, v] of this.map) { if (this.cost <= this.max * 0.8) break; this.map.delete(k); this.cost -= v.c; } },
  clear() { this.map.clear(); this.cost = 0; },
};
const _pathCache = PathLRU;
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
/* ---------- Estabilização ---------- */
// nível 0–10 por tipo de caneta (esferográfica mais firme por padrão) e um para o marca-texto
const STAB_DEFAULT = { ball: 8 };
function stabLevel(tool, pen) {
  const S = Store.settings, old = Math.round((S.stabilizer ?? 0.55) * 10);
  if (tool === 'highlighter') return clamp(S.stabHl ?? old, 0, 10);
  const v = (S.stabPen || {})[pen]; return clamp(v ?? STAB_DEFAULT[pen] ?? old, 0, 10);
}
function smoothStroke(pts, s) { // passadas de média [1/4 1/2 1/4] em x e y, mantendo início e fim
  const n = pts.length / 3, passes = Math.round(clamp(s, 0, 1) * 4); if (n < 4 || !passes) return pts;
  for (let k = 0; k < passes; k++) {
    let px = pts[0], py = pts[1];
    for (let i = 1; i < n - 1; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1];
      pts[i * 3] = px * 0.25 + x * 0.5 + pts[(i + 1) * 3] * 0.25; pts[i * 3 + 1] = py * 0.25 + y * 0.5 + pts[(i + 1) * 3 + 1] * 0.25;
      px = x; py = y;
    }
  }
  return pts;
}
function splinePts(pts) { // Catmull-Rom: insere pontos nas curvas para o contorno não ficar quebrado
  const n = pts.length / 3; if (n < 3) return pts;
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(0, i - 1), i2 = i + 1, i3 = Math.min(n - 1, i + 2);
    const x0 = pts[i0 * 3], y0 = pts[i0 * 3 + 1], x1 = pts[i * 3], y1 = pts[i * 3 + 1], p1 = pts[i * 3 + 2], x2 = pts[i2 * 3], y2 = pts[i2 * 3 + 1], p2 = pts[i2 * 3 + 2], x3 = pts[i3 * 3], y3 = pts[i3 * 3 + 1];
    out.push(x1, y1, p1);
    const segs = Math.min(8, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 1.2));
    for (let j = 1; j < segs; j++) {
      const t = j / segs, t2 = t * t, t3 = t2 * t;
      const cx = 0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
      const cy = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
      out.push(cx, cy, p1 + (p2 - p1) * t);
    }
  }
  out.push(pts[(n - 1) * 3], pts[(n - 1) * 3 + 1], pts[(n - 1) * 3 + 2]);
  return out;
}
/* ---------- Tipos de caneta ---------- */
const PEN_TYPES = [
  ['ball', 'Esferográfica', 'Espessura constante, não reage à pressão'],
  ['natural', 'Natural', 'Engrossa conforme a pressão da caneta'],
  ['fountain', 'Caneta-tinteiro', 'Afina nas pontas e nos movimentos rápidos'],
  ['calli', 'Caligrafia', 'Pena chanfrada: grossa ou fina conforme a direção'],
  ['brush', 'Pincel', 'Variação forte com a pressão, para lettering'],
  ['fine', 'Marcador fino', 'Espessura constante e pontas retas'],
];
function penKind(e) { return e.pen || 'natural'; } // traços antigos: comportamento natural (pressão)
const CAPSULE_PENS = new Set(['ball', 'natural', 'fountain', 'brush']);
function penRadii(pts, w, kind) {
  const n = pts.length / 3, r = new Array(n);
  if (kind === 'ball') { r.fill(w / 2); return r; }
  if (kind === 'natural') { for (let i = 0; i < n; i++) r[i] = penRadius(w, pts[i * 3 + 2]); return r; }
  const taperN = kind === 'brush' ? 9 : 6, tmin = kind === 'brush' ? 0.18 : 0.3;
  let sf = 1;
  for (let i = 0; i < n; i++) {
    const p = clamp(pts[i * 3 + 2], 0, 1);
    let base;
    if (kind === 'brush') base = (w / 2) * (0.1 + 1.55 * Math.pow(p, 1.3));
    else { // tinteiro: pressão moderada + velocidade (distância entre amostras)
      const d = i ? Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2]) : 0;
      const target = clamp(1.25 - 0.3 * (d / Math.max(w, 0.5)), 0.5, 1.2); sf += (target - sf) * 0.35;
      base = (w / 2) * (0.55 + 0.75 * p) * sf;
    }
    const t = Math.min(i, n - 1 - i), taper = n > 3 ? tmin + (1 - tmin) * Math.min(1, t / taperN) : 1;
    r[i] = Math.min(base * taper, (w / 2) * 1.65);
  }
  return r;
}
function buildRadiiPath(pts, r, path = new Path2D(), from = 0) {
  const n = pts.length / 3; if (!n) return path;
  let px = pts[from * 3], py = pts[from * 3 + 1], pr = r[from];
  if (from === 0) addCircle(path, px, py, pr);
  for (let i = from + 1; i < n; i++) { const x = pts[i * 3], y = pts[i * 3 + 1]; addCircle(path, x, y, r[i]); addCapsule(path, px, py, pr, x, y, r[i]); px = x; py = y; pr = r[i]; }
  return path;
}
/* caligrafia: a pena é um segmento inclinado (ângulo nib) arrastado ao longo do traço */
function buildCalliPath(pts, w, nibDeg = 45, path = new Path2D()) {
  const n = pts.length / 3; if (!n) return path;
  const a = -nibDeg * Math.PI / 180, cx = Math.cos(a), cy = Math.sin(a), hair = Math.max(0.25, w * 0.06);
  const half = (i) => (w / 2) * (0.8 + 0.5 * clamp(pts[i * 3 + 2], 0, 1));
  const quad = (P) => { let ar = 0; for (let k = 0; k < 4; k++) { const u = P[k], v = P[(k + 1) % 4]; ar += u[0] * v[1] - v[0] * u[1]; } if (Math.abs(ar) < 1e-6) return; if (ar < 0) P.reverse(); path.moveTo(P[0][0], P[0][1]); for (let k = 1; k < 4; k++) path.lineTo(P[k][0], P[k][1]); path.closePath(); };
  let x0 = pts[0], y0 = pts[1], h0 = half(0);
  quad([[x0 - cx * h0 - cy * hair, y0 - cy * h0 + cx * hair], [x0 + cx * h0 - cy * hair, y0 + cy * h0 + cx * hair], [x0 + cx * h0 + cy * hair, y0 + cy * h0 - cx * hair], [x0 - cx * h0 + cy * hair, y0 - cy * h0 - cx * hair]]);
  for (let i = 1; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], h = half(i);
    quad([[x0 - cx * h0, y0 - cy * h0], [x0 + cx * h0, y0 + cy * h0], [x + cx * h, y + cy * h], [x - cx * h, y - cy * h]]);
    addCapsule(path, x0, y0, hair, x, y, hair); // traço fino mínimo quando o movimento é paralelo à pena
    x0 = x; y0 = y; h0 = h;
  }
  return path;
}
/* contorno (para preencher) ou linha (para o marcador fino) de um traço de caneta */
function penStrokePath(pts, w, kind, nib) {
  if (kind === 'fine') return buildPolyPath(pts);
  if (kind === 'calli') return buildCalliPath(splinePts(pts), w, nib ?? 45);
  const r = penRadii(pts, w, kind), q = pts.slice(); for (let i = 0; i < r.length; i++) q[i * 3 + 2] = r[i]; // raio calculado nos pontos reais (velocidade)
  let same = r.length > 0; for (let i = 1; i < r.length && same; i++) if (Math.abs(r[i] - r[0]) > 1e-6) same = false;
  const sp = splinePts(q);
  if (same) { // espessura constante (esferográfica, ou pressão igual — como as notas do Notewise): o contorno de círculos + cápsulas
    // é exatamente uma linha com pontas e juntas redondas. Desenhar assim dá o mesmo traço com uma fração da memória e do tempo.
    const path = new Path2D(), n = sp.length / 3; path.moveTo(sp[0], sp[1]);
    let moved = 0; for (let i = 1; i < n; i++) { path.lineTo(sp[i * 3], sp[i * 3 + 1]); moved += Math.abs(sp[i * 3] - sp[i * 3 - 3]) + Math.abs(sp[i * 3 + 1] - sp[i * 3 - 2]); }
    if (moved < 0.01) path.lineTo(sp[0] + 0.01, sp[1]); // ponto (pingo do i, dois-pontos): o navegador ignora traço de tamanho zero
    path.strokeW = r[0] * 2; return path;
  }
  const rr = []; for (let i = 2; i < sp.length; i += 3) rr.push(sp[i]);
  return buildRadiiPath(sp, rr);
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
  let same = true; for (let i = 3; i < pts.length && same; i += 3) if (Math.abs(pts[i] - pts[0]) + Math.abs(pts[i + 1] - pts[1]) > 0.005) same = false;
  if (same) path.lineTo(pts[0] + 0.01, pts[1]); // todos os pontos no mesmo lugar: vira um pontinho visível
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
  if (e.type === 'stroke') p = e.tool === 'pen' ? penStrokePath(e.pts, e.width, penKind(e), e.nib) : buildPolyPath(e.pts);
  else if (e.type === 'shape') p = buildShapePath(e);
  _pathCache.set(e, p); return p;
}
const STICKY_PAD = 16; // textFont e layoutText ficam em richtext.js
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
  } else if (e.type === 'text') { const L = layoutText(e); b = { x: e.x, y: e.y, w: e.auto ? L.w : e.w, h: L.h }; }
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
  const anyIn = (pts) => pts.some(([x, y]) => pointInPoly(x, y, poly));
  if (e.type === 'stroke' && e.tool !== 'highlighter') { // escrita: precisa estar (pelo menos metade) dentro, para não pegar letras vizinhas
    const pts = []; for (let i = 0; i < e.pts.length; i += 3) pts.push([e.pts[i], e.pts[i + 1]]);
    const step = Math.max(1, Math.floor(pts.length / 40)); let inn = 0, tot = 0;
    for (let i = 0; i < pts.length; i += step) { tot++; if (pointInPoly(pts[i][0], pts[i][1], poly)) inn++; }
    return inn / tot >= 0.5;
  }
  // os demais itens entram inteiros quando o laço pega um pedaço deles
  if (e.type === 'stroke') { // marca-texto: amostra ao longo de cada segmento
    const pts = [], q = e.pts, gap = Math.max(2, (e.width || 4) / 2);
    for (let i = 0; i < q.length; i += 3) { pts.push([q[i], q[i + 1]]); if (i + 3 < q.length) { const dx = q[i + 3] - q[i], dy = q[i + 4] - q[i + 1], n = Math.min(60, Math.floor(Math.hypot(dx, dy) / gap)); for (let k = 1; k < n; k++) pts.push([q[i] + (dx * k) / n, q[i + 1] + (dy * k) / n]); } }
    return anyIn(pts);
  }
  if (e.type === 'shape') {
    const sp = shapeSamples(e), dense = []; // contorno com pontos a cada ~4 unidades
    for (let i = 0; i < sp.length; i++) { dense.push(sp[i]); const nx = sp[i + 1]; if (nx) { const dx = nx[0] - sp[i][0], dy = nx[1] - sp[i][1], n = Math.min(40, Math.floor(Math.hypot(dx, dy) / 4)); for (let k = 1; k < n; k++) dense.push([sp[i][0] + (dx * k) / n, sp[i][1] + (dy * k) / n]); } }
    if (anyIn(dense)) return true;
    if (!e.fill || ['line', 'arrow'].includes(e.kind) || (e.kind === 'poly' && !e.closed)) return false;
  }
  // caixas (texto, post-it, imagem, tabela, forma preenchida): contorno ou interior tocado pelo laço
  const b = elBBox(e), pts = [];
  const N = 8; for (let i = 0; i <= N; i++) { const u = i / N; pts.push([b.x + u * b.w, b.y], [b.x + u * b.w, b.y + b.h], [b.x, b.y + u * b.h], [b.x + b.w, b.y + u * b.h]); }
  if (e.type === 'text' || e.type === 'shape') for (let i = 1; i < 6; i++) for (let j = 1; j < 4; j++) pts.push([b.x + (b.w * i) / 6, b.y + (b.h * j) / 4]); // texto: também o miolo
  return anyIn(pts); // tabela/imagem: o laço precisa pegar a borda (escrever dentro da tabela não seleciona a tabela)
}
/* Transformações — sempre retornam um novo objeto (invalida caches) */
function transformEl(e, f) { // f: {sx, sy, ox, oy, dx, dy}  x' = ox + (x-ox)*sx + dx
  const X = (x) => f.ox + (x - f.ox) * f.sx + f.dx, Y = (y) => f.oy + (y - f.oy) * f.sy + f.dy;
  const s = f.free ? 1 : Math.sqrt(Math.abs(f.sx * f.sy)); // redimensionar livre não engrossa linhas nem letras
  const n = { ...e };
  if (e.type === 'stroke') { const p = new Array(e.pts.length); for (let i = 0; i < p.length; i += 3) { p[i] = r2(X(e.pts[i])); p[i + 1] = r2(Y(e.pts[i + 1])); p[i + 2] = e.pts[i + 2]; } n.pts = p; if (s !== 1) n.width = e.width * s; }
  else if (e.type === 'shape') {
    if (e.kind === 'poly' && e.br && f.sx > 0 && f.sy > 0) { /* v0.25: colchete continua ajustável depois de mover/redimensionar */
      const b = e.br, A = b.v ? Y : X, C = b.v ? X : Y, kc = b.v ? f.sx : f.sy, kr = Math.min(f.sx, f.sy);
      n.br = { ...b, sx: r2(C(b.sx)), top: r2(A(b.top)), bot: r2(A(b.bot)), hT: r2(b.hT * kc), hB: r2(b.hB * kc), rT: r2(b.rT * kr), rB: r2(b.rB * kr) };
      const g = bracketShape(n.br); n.pts = g.pts; n.br = g.br;
    }
    else if (e.kind === 'poly') { n.pts = e.pts.map((v, i) => r2(i % 2 ? Y(v) : X(v))); delete n.br; }
    else { n.x1 = X(e.x1); n.y1 = Y(e.y1); n.x2 = X(e.x2); n.y2 = Y(e.y2); }
    if (s !== 1) n.width = e.width * s;
  } else if (e.type === 'text') {
    const bw = e.auto ? layoutText(e).w : e.w;
    n.x = X(e.x); n.y = Y(e.y); n.w = Math.max(20, bw * f.sx);
    if (e.auto) { if (f.free) delete n.auto; else n.maxW = (e.maxW || 600) * f.sx; } // largura ajustada à mão: a caixa passa a quebrar linhas nela
    if (f.free) { if (e.sticky) n.minH = Math.max(40, (e.minH || e.w) * f.sy); }
    else if (f.sx !== 1 || f.sy !== 1) { n.size = Math.max(4, e.size * f.sy); if (e.minH) n.minH = e.minH * f.sy; }
  }
  else if (e.type === 'image') { n.x = X(e.x); n.y = Y(e.y); n.w = e.w * f.sx; n.h = e.h * f.sy; }
  else if (e.type === 'table') { n.x = X(e.x); n.y = Y(e.y); n.w = e.w * f.sx; n.h = e.h * f.sy; if (s !== 1) n.bw = (e.bw || 1) * s; if (e.colW) n.colW = e.colW.map((v) => v * f.sx); if (e.rowH) n.rowH = e.rowH.map((v) => v * f.sy); }
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
/* v0.24.10: colchete de anotação — linha reta (vertical ou horizontal) com uma ou as duas pontas curvando para o MESMO lado
   (como "[", "└", "⌐"). Vira uma versão limpa: reta + curvas redondas (quarto de círculo) + rabinho do tamanho que você fez. */
function recognizeBracket(P, x1, y1, x2, y2) {
  const w = x2 - x1, h = y2 - y1, vert = h >= w * 2.2, horz = w >= h * 2.2; if (!vert && !horz) return null;
  const Q = vert ? P : P.map(([x, y]) => [y, x]); // trabalha sempre como se fosse vertical
  const L = vert ? h : w, top = vert ? y1 : x1, bot = vert ? y2 : x2; if (L < 20) return null;
  const mid = Q.filter(([, y]) => y > top + L * 0.2 && y < bot - L * 0.2); if (mid.length < 3) return null;
  const xs = mid.map((p) => p[0]).sort((m, n) => m - n), sx = xs[xs.length >> 1];
  if (mid.some(([x]) => Math.abs(x - sx) > Math.max(3, L * 0.05))) return null; // o meio precisa ser reto
  const a = Q[0], b = Q[Q.length - 1], minHook = Math.max(3, L * 0.02);
  const hook = (e) => { const off = e[0] - sx; return Math.abs(off) >= minHook && (Math.abs(e[1] - top) < L * 0.12 || Math.abs(e[1] - bot) < L * 0.12) ? off : 0; };
  const ha = hook(a), hb = hook(b); if (!ha && !hb) return null;
  if (ha && hb && Math.sign(ha) !== Math.sign(hb)) return null; // ganchos para o mesmo lado ( [ ou ] )
  const aTop = a[1] <= b[1], hT = aTop ? ha : hb, hB = aTop ? hb : ha, out = [];
  /* raio da curva = quanto o gancho desce/sobe até encontrar a reta (do jeito que você desenhou) */
  const seq = aTop ? Q : Q.slice().reverse();
  /* ponto onde o gancho está na metade do caminho até a reta (sobra d para o lado, já desceu ym): o círculo tangente à reta e ao rabinho
     que passa por ele tem raio r = d + ym + √(2·d·ym) */
  const curveR = (fromTop, hk) => { const arr = fromTop ? seq : seq.slice().reverse(), e = arr[0], H = Math.abs(hk);
    for (const p of arr) { const d = Math.abs(p[0] - sx); if (d <= H * 0.5) { const ym = Math.abs(p[1] - e[1]); return clamp(d + ym + Math.sqrt(2 * d * ym), 2, H); } } return H; };
  const rT = hT ? Math.min(curveR(true, hT), L * 0.18) : 0, rB = hB ? Math.min(curveR(false, hB), L * 0.18) : 0;
  return bracketShape({ v: vert, sx: r2(sx), top: r2(top), bot: r2(bot), hT: r2(hT), hB: r2(hB), rT: r2(rT), rB: r2(rB), rev: !aTop });
}
/* v0.25: o colchete guarda os parâmetros (br) para poder ser ajustado depois — segurando a caneta ou no modo "editar pontos".
   br (como se fosse vertical; v = false troca x↔y): sx = posição da reta, top/bot = pontas no eixo, hT/hB = rabinhos (0 = sem gancho,
   sinal = lado), rT/rB = raio das curvas, rev = pontos de baixo para cima (a ordem em que foi desenhado) */
function bracketFix(br) {
  const b = { ...br }; if (b.bot < b.top + 8) b.bot = b.top + 8; const L = b.bot - b.top;
  b.rT = b.hT ? clamp(b.rT || Math.abs(b.hT) * 0.6, 1, Math.min(Math.abs(b.hT), L * 0.45)) : 0;
  b.rB = b.hB ? clamp(b.rB || Math.abs(b.hB) * 0.6, 1, Math.min(Math.abs(b.hB), L * 0.45)) : 0;
  return b;
}
function bracketShape(br0) {
  const br = bracketFix(br0), { v: vert, sx, top, bot, hT, hB, rT, rB } = br, out = [];
  const push = (x, y) => { const q = vert ? [x, y] : [y, x]; out.push(r2(q[0]), r2(q[1])); };
  if (hT) { const sg = Math.sign(hT), r = rT, cx = sx + sg * r, cy = top + r;
    if (Math.abs(hT) > r + 0.5) push(sx + hT, top);
    for (let k = 0; k <= 8; k++) { const t = (k / 8) * Math.PI / 2; push(cx - sg * r * Math.sin(t), cy - r * Math.cos(t)); }
  } else push(sx, top);
  if (hB) { const sg = Math.sign(hB), r = rB, cx = sx + sg * r, cy = bot - r;
    for (let k = 0; k <= 8; k++) { const t = (k / 8) * Math.PI / 2; push(cx - sg * r * Math.cos(t), cy + r * Math.sin(t)); }
    if (Math.abs(hB) > r + 0.5) push(sx + hB, bot);
  } else push(sx, bot);
  if (br.rev) { const rev = []; for (let i = out.length - 2; i >= 0; i -= 2) rev.push(out[i], out[i + 1]); return { kind: 'poly', pts: rev, closed: false, br }; }
  return { kind: 'poly', pts: out, closed: false, br };
}
function recognizeShape(flat) {
  const P = []; for (let i = 0; i < flat.length; i += 3) P.push([flat[i], flat[i + 1]]);
  if (P.length < 4) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, len = 0;
  P.forEach((p, i) => { x1 = Math.min(x1, p[0]); x2 = Math.max(x2, p[0]); y1 = Math.min(y1, p[1]); y2 = Math.max(y2, p[1]); if (i) len += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]); });
  const diag = Math.hypot(x2 - x1, y2 - y1); if (diag < 12) return null;
  { const br = recognizeBracket(P, x1, y1, x2, y2); if (br) return br; } // v0.24.10: colchete arredondado (antes da linha reta: ganchos pequenos numa linha longa viravam linha)
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
/* rabisco de apagar (zigue-zague por cima). v0.24.3: medidas em pixels de TELA (z = zoom) — antes eram fixas na folha e rabiscos
   pequenos (para apagar um acento, um ponto, uma letra) não contavam; passada longa = 40% do tamanho (antes 50%) */
function isScribble(flat, z = 1) {
  const n = flat.length / 3; if (n < 8) return false;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, len = 0;
  for (let i = 0; i < n; i++) { const x = flat[i * 3], y = flat[i * 3 + 1]; x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); if (i) len += Math.hypot(x - flat[i * 3 - 3], y - flat[i * 3 - 2]); }
  const w = x2 - x1, h = y2 - y1, px = 1 / z; if (w + h < 9 * px) return false; // menor que ~9 px de tela: é um ponto/tique
  const passes = (axis, minFrac = 0.4) => { // passadas longas ao longo de um eixo (com histerese para ignorar tremidas)
    const ext = axis ? h : w; if (ext < 3 * px) return { n: 0, drift: Infinity };
    const thr = Math.max(ext * 0.12, 1.2 * px); let dir = 0, ex = flat[axis], exC = flat[1 - axis]; const turns = [[ex, exC]];
    for (let i = 1; i < n; i++) {
      const v = flat[i * 3 + axis], c = flat[i * 3 + 1 - axis];
      if (!dir) { if (Math.abs(v - ex) > thr) { dir = Math.sign(v - ex); ex = v; exC = c; } continue; }
      if ((v - ex) * dir > 0) { ex = v; exC = c; } else if (Math.abs(v - ex) > thr) { turns.push([ex, exC]); dir = -dir; ex = v; exC = c; }
    }
    turns.push([ex, exC]);
    const long = []; for (let k = 1; k < turns.length; k++) { const L = Math.abs(turns[k][0] - turns[k - 1][0]); if (L >= ext * minFrac) long.push(Math.abs(turns[k][1] - turns[k - 1][1])); }
    return { n: long.length, drift: long.length ? long.reduce((s2, d) => s2 + d, 0) / long.length : Infinity, maxDrift: long.length ? Math.max(...long) : Infinity };
  };
  const H = passes(0), V = passes(1);
  const okH = H.n >= 4 && H.drift < Math.max(10 * px, h * 0.5);           // vai-e-volta horizontal
  const okV = V.n >= 4 && V.drift < Math.max(10 * px, w * 0.3) && w / Math.max(h, 1e-6) < 2.2; // vai-e-volta vertical, compacto
  if ((okH || okV) && len > 2.4 * (w + h)) return 2; // rabisco "forte": 4 idas e voltas
  /* v0.24.4: rabisco "leve" — 3 idas e voltas (ou voltinhas/caracóis), mais curto. Só apaga o que ficar BEM coberto (ver scribbleTargets),
     e se não houver nada embaixo vira tinta normal: por isso pode ser bem menos exigente */
  /* v0.24.5: em QUALQUER direção (vertical, diagonal ou horizontal): mede na direção principal do rabisco e na perpendicular.
     As passadas precisam ficar juntinhas (deslocamento ≤ 40% do comprimento da passada): isso deixa de fora as barrigas do "B", o "z" e as corcovas largas */
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += flat[i * 3]; my += flat[i * 3 + 1]; } mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0; for (let i = 0; i < n; i++) { const dx = flat[i * 3] - mx, dy = flat[i * 3 + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  for (const ang of [th, th + Math.PI / 2, 0, Math.PI / 2]) {
    const c = Math.cos(-ang), si = Math.sin(-ang), R = new Array(n * 3); let a1 = Infinity, a2 = -Infinity, b1 = Infinity, b2 = -Infinity;
    for (let i = 0; i < n; i++) { const dx = flat[i * 3] - mx, dy = flat[i * 3 + 1] - my, u = dx * c - dy * si, v = dx * si + dy * c; R[i * 3] = u; R[i * 3 + 1] = v; a1 = Math.min(a1, u); a2 = Math.max(a2, u); b1 = Math.min(b1, v); b2 = Math.max(b2, v); }
    const W = a2 - a1, Hh = b2 - b1, L = lightPasses(R, n, W, px);
    if (!L.n || L.ratio > 0.4 || Hh > 1.2 * L.plen) continue; // compacto: as corcovas de "m"/"nn" se espalham para o lado
    const ok = L.n >= 4 || (L.n === 3 && L.ratio <= 0.28 && L.maxDrift < Math.max(4 * px, Hh * 0.75));
    if (ok && len > 1.2 * (W + Hh)) return 1;
  }
  return 0;
}
// Apaga tudo o que estiver majoritariamente dentro da área do rabisco, mesmo sem encostar
function someInside(e, hull) {
  if (e.type === 'stroke' && e.pts) { for (let i = 0; i < e.pts.length; i += 3) if (pointInPoly(e.pts[i], e.pts[i + 1], hull)) return true; return false; }
  const b = elBBox(e); return [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h], [b.x + b.w / 2, b.y + b.h / 2]].some(([x, y]) => pointInPoly(x, y, hull));
}
/* passadas ao longo do eixo x de pontos já girados: quantas, deslocamento médio/máximo entre elas e comprimento médio */
function lightPasses(R, n, ext, px) {
  if (ext < 3 * px) return { n: 0 };
  const thr = Math.max(ext * 0.12, 1.2 * px); let dir = 0, ex = R[0], exC = R[1]; const turns = [[ex, exC]];
  for (let i = 1; i < n; i++) { const v = R[i * 3], c = R[i * 3 + 1]; if (!dir) { if (Math.abs(v - ex) > thr) { dir = Math.sign(v - ex); ex = v; exC = c; } continue; } if ((v - ex) * dir > 0) { ex = v; exC = c; } else if (Math.abs(v - ex) > thr) { turns.push([ex, exC]); dir = -dir; ex = v; exC = c; } }
  turns.push([ex, exC]);
  const dr = [], ln = []; for (let k = 1; k < turns.length; k++) { const L = Math.abs(turns[k][0] - turns[k - 1][0]); if (L >= ext * 0.35) { dr.push(Math.abs(turns[k][1] - turns[k - 1][1])); ln.push(L); } }
  if (!dr.length) return { n: 0 };
  const md = dr.reduce((a, b) => a + b, 0) / dr.length, ml = ln.reduce((a, b) => a + b, 0) / ln.length;
  return { n: dr.length, maxDrift: Math.max(...dr), ratio: md / ml, plen: ml };
}
/* fração do item que fica dentro da área do rabisco (traços: pelos pontos; outros: cantos e centro da caixa) */
function coverIn(e, hull) {
  if (e.type === 'stroke' && e.pts) { const n = e.pts.length / 3, st = Math.max(1, Math.floor(n / 60)); let a = 0, t = 0; for (let i = 0; i < n; i += st) { t++; if (pointInPoly(e.pts[i * 3], e.pts[i * 3 + 1], hull)) a++; } return t ? a / t : 0; }
  const b = elBBox(e); return [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h], [b.x + b.w / 2, b.y + b.h / 2]].filter(([x, y]) => pointInPoly(x, y, hull)).length / 5;
}
function scribbleTargets(elements, flat, z = 1, strength = 2) {
  const P = []; for (let i = 0; i < flat.length; i += 3) P.push([flat[i], flat[i + 1]]);
  const hull = convexHull(P); if (hull.length < 3) return [];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const [x, y] of hull) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); }
  const tol = Math.max(0.8, 1.5 / z), sb = { x: x1 - tol, y: y1 - tol, w: x2 - x1 + 2 * tol, h: y2 - y1 + 2 * tol }; /* margem de ~1,5 px de tela: não pega o vizinho (ex.: a haste do "i" ao apagar o pingo) */
  const out = [], step = Math.max(1, Math.floor(P.length / 120));
  for (const e of elements) {
    const b = elBBox(e); if (!rectsHit(b, sb)) continue;
    if (e.type === 'image' || e.type === 'table' || e.lock) continue; // imagens, tabelas e bloqueados ficam
    /* coisa pequena (ponto, acento, letra) com a caixa toda dentro da área do rabisco: apaga */
    if (b.x >= sb.x && b.y >= sb.y && b.x + b.w <= sb.x + sb.w && b.y + b.h <= sb.y + sb.h && (b.w + b.h) < (sb.w + sb.h) * 1.2) { out.push(e); continue; }
    if (strength < 2) { if (coverIn(e, hull) >= 0.35) out.push(e); continue; } // rabisco leve: só o que ficou bem coberto
    let hits = 0; for (let i = 0; i < P.length && hits < 3; i += step) if (hitElement(e, P[i][0], P[i][1], tol)) hits++;
    /* encostar pela borda não basta: o item precisa ter algum ponto DENTRO da área do rabisco (riscar parte de uma palavra apaga; raspar no vizinho não) */
    if (hits >= 3 && !someInside(e, hull)) hits = 0;
    if (hits >= 3 || elInLasso(e, hull)) out.push(e);
  }
  return out;
}

/* ===== Rotação ===== */
function rotPt(x, y, cx, cy, a) { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; }
function hasRot(e) { return e.type === 'image' || e.type === 'text' || e.type === 'table' || (e.type === 'shape' && e.kind !== 'line' && e.kind !== 'arrow' && e.kind !== 'poly'); }
function rawBox(e) {
  if (e.type === 'text') { const L = layoutText(e); return { x: e.x, y: e.y, w: e.auto ? L.w : e.w, h: L.h }; }
  if (e.type === 'image' || e.type === 'table') return { x: e.x, y: e.y, w: e.w, h: e.h };
  const g = shapeGeom(e); return { x: g.x1, y: g.y1, w: g.w, h: g.h };
}
function rawCenter(e) { const b = rawBox(e); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
function rotateEl(e, ang, cx, cy) {
  const R = (x, y) => rotPt(x, y, cx, cy, ang), n = { ...e };
  if (e.type === 'stroke') { const p = e.pts.slice(); for (let i = 0; i < p.length; i += 3) { const q = R(p[i], p[i + 1]); p[i] = r2(q[0]); p[i + 1] = r2(q[1]); } n.pts = p; return n; }
  if (e.type === 'shape' && e.kind === 'poly') { delete n.br; const p = e.pts.slice(); for (let i = 0; i < p.length; i += 2) { const q = R(p[i], p[i + 1]); p[i] = r2(q[0]); p[i + 1] = r2(q[1]); } n.pts = p; return n; }
  if (e.type === 'shape' && (e.kind === 'line' || e.kind === 'arrow')) { const a = R(e.x1, e.y1), b = R(e.x2, e.y2); n.x1 = a[0]; n.y1 = a[1]; n.x2 = b[0]; n.y2 = b[1]; return n; }
  if (hasRot(e)) {
    const c = rawCenter(e), q = R(c.x, c.y), dx = q[0] - c.x, dy = q[1] - c.y;
    if (e.type === 'shape') { n.x1 = e.x1 + dx; n.x2 = e.x2 + dx; n.y1 = e.y1 + dy; n.y2 = e.y2 + dy; } else { n.x = e.x + dx; n.y = e.y + dy; }
    n.rot = ((e.rot || 0) + ang) % (Math.PI * 2); if (Math.abs(n.rot) < 1e-4) delete n.rot;
  }
  return n;
}
/* Alinha linhas a 0°, 45°, 90°… quando estão perto desses ângulos */
function snapAngle(x1, y1, x2, y2, tolDeg = 8) { // linhas retas grudam a cada 15° (0°, 15°, 30°, 45°…)
  if (Store.settings.angleSnap === false) return [x2, y2];
  const ang = Math.atan2(y2 - y1, x2 - x1), step = Math.PI / 12, sn = Math.round(ang / step) * step;
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
