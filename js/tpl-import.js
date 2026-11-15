'use strict';
/* ===== Modelo a partir de um PDF (ex.: nota vazia exportada do Notewise) =====
   Renderiza a 1ª página, encontra as linhas horizontais e verticais e os pontos e guarda a posição exata de cada um.
   O modelo resultante (tipo 'custom') é desenhado igualzinho em qualquer página de mesma proporção. */
const TPL_BASE_W = 1000; // unidades de referência: largura 1000

async function detectTemplateFromPdf(file) {
  const lib = await PdfCache.loadLib();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pg = await doc.getPage(1), vp1 = pg.getViewport({ scale: 1 });
  const W = Math.round(Math.min(3480, (vp1.width * 300) / 72)), vp = pg.getViewport({ scale: W / vp1.width });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Math.round(vp.height);
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  const H = cv.height, d = ctx.getImageData(0, 0, W, H).data, f = TPL_BASE_W / W;
  // cor do papel = cor mais comum
  const hist = new Map();
  for (let i = 0; i < d.length; i += 4 * 61) { const k = ((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2); hist.set(k, (hist.get(k) || 0) + 1); }
  let pk = 0, pc = -1; for (const [k, c] of hist) if (c > pc) { pc = c; pk = k; }
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (let i = 0; i < d.length; i += 4 * 61) if ((((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2)) === pk) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; sn++; }
  const P = [sr / sn, sg / sn, sb / sn];
  // marca os pixels diferentes do papel
  const diff = new Uint8Array(W * H), rowCnt = new Uint32Array(H), colCnt = new Uint32Array(W), rowSum = new Float64Array(H), colSum = new Float64Array(W);
  for (let y = 0, i = 0, j = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4, j++) {
    const dd = Math.max(Math.abs(d[i] - P[0]), Math.abs(d[i + 1] - P[1]), Math.abs(d[i + 2] - P[2]));
    if (dd > 6) { diff[j] = dd; rowCnt[y]++; colCnt[x]++; rowSum[y] += dd; colSum[x] += dd; }
  }
  const groups = (cnt, min, max) => { const out = []; let cur = null; for (let i = 0; i < cnt.length; i++) { if (cnt[i] >= min && cnt[i] < max) { if (cur && i - cur.b <= 1) cur.b = i; else { cur = { a: i, b: i }; out.push(cur); } } } return out; };
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const lineColor = (pix) => { // média dos pixels mais fortes (centro da linha)
    if (!pix.length) return '#cccccc'; pix.sort((a, b) => b[0] - a[0]); const top = pix.slice(0, Math.max(1, Math.ceil(pix.length * 0.3)));
    return hex(...[1, 2, 3].map((k) => top.reduce((s, p) => s + p[k], 0) / top.length));
  };
  // linhas horizontais: cobrem pelo menos 20% da largura
  const hl = [];
  for (const g of groups(rowCnt, W * 0.2, Infinity)) {
    let peak = g.a; for (let y = g.a; y <= g.b; y++) if (rowSum[y] > rowSum[peak]) peak = y;
    let cy = 0, cw = 0, t = 0; for (let y = g.a; y <= g.b; y++) { cy += y * rowSum[y]; cw += rowSum[y]; t += rowSum[y] / rowSum[peak]; }
    let x1 = W, x2 = 0; const pix = [];
    for (let x = 0; x < W; x++) { const j = peak * W + x; if (diff[j]) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (x % 3 === 0) pix.push([diff[j], d[j * 4], d[j * 4 + 1], d[j * 4 + 2]]); } }
    hl.push({ y: ((cy / cw) + 0.5) * f, x1: x1 * f, x2: (x2 + 1) * f, c: lineColor(pix), t: Math.max(0.2, t * f) });
  }
  // linhas verticais: cobrem pelo menos 20% da altura
  const vl = [];
  for (const g of groups(colCnt, H * 0.2, Infinity)) {
    let peak = g.a; for (let x = g.a; x <= g.b; x++) if (colSum[x] > colSum[peak]) peak = x;
    let cx = 0, cw = 0, t = 0; for (let x = g.a; x <= g.b; x++) { cx += x * colSum[x]; cw += colSum[x]; t += colSum[x] / colSum[peak]; }
    let y1 = H, y2 = 0; const pix = [];
    for (let y = 0; y < H; y++) { const j = y * W + peak; if (diff[j]) { if (y < y1) y1 = y; if (y > y2) y2 = y; if (y % 3 === 0) pix.push([diff[j], d[j * 4], d[j * 4 + 1], d[j * 4 + 2]]); } }
    vl.push({ x: ((cx / cw) + 0.5) * f, y1: y1 * f, y2: (y2 + 1) * f, c: lineColor(pix), t: Math.max(0.2, t * f) });
  }
  // pontos: o que sobra fora das linhas, em fileiras e colunas regulares
  let dots = null;
  if (!hl.length && !vl.length) {
    const rc = new Uint32Array(H), cc = new Uint32Array(W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (diff[y * W + x]) { rc[y]++; cc[x]++; }
    const rows = groups(rc, 3, W * 0.2), cols = groups(cc, 3, H * 0.2);
    if (rows.length >= 3 && cols.length >= 3) {
      const ctr = (g, arr) => { let s = 0, w = 0; for (let i = g.a; i <= g.b; i++) { s += i * arr[i]; w += arr[i]; } return s / w + 0.5; };
      const ys = rows.map((g) => ctr(g, rc)), xs = cols.map((g) => ctr(g, cc));
      const pix = []; for (const y of ys.slice(0, 6)) for (const x of xs.slice(0, 6)) { const j = Math.round(y - 0.5) * W + Math.round(x - 0.5); if (diff[j]) pix.push([diff[j], d[j * 4], d[j * 4 + 1], d[j * 4 + 2]]); }
      const diam = rows.reduce((s, g) => s + (g.b - g.a + 1), 0) / rows.length;
      dots = { xs: xs.map((v) => v * f), ys: ys.map((v) => v * f), r: Math.max(0.3, (diam / 2) * f), c: lineColor(pix) };
    }
  }
  const med = (a) => { if (a.length < 2) return 0; const ds = a.slice(1).map((v, i) => v - a[i]).sort((p, q) => p - q); return ds[ds.length >> 1]; };
  const ys = hl.length ? hl.map((l) => l.y) : dots ? dots.ys : [], xs = vl.length ? vl.map((l) => l.x) : dots ? dots.xs : [];
  const kind = hl.length >= 3 && vl.length >= 3 ? 'grid' : hl.length ? 'lines' : dots ? 'dots' : vl.length ? 'lines' : 'blank'; // pauta com 1–2 linhas verticais = margem
  const colors = [...hl, ...vl].map((l) => l.c); const main = colors.sort((a, b) => colors.filter((c) => c === b).length - colors.filter((c) => c === a).length)[0] || (dots && dots.c) || '#cccccc';
  return {
    type: 'custom', kind, name: (file.name || 'Modelo').replace(/\.pdf$/i, ''), bw: TPL_BASE_W, bh: H * f,
    paper: hex(...P), hl, vl, dots, spacing: med(ys) || med(xs) || 30, color: main, thickness: hl[0] ? hl[0].t : 1, opacity: 1, src: 'pdf',
  };
}
const TPL_KIND_NAMES = { grid: 'grade', lines: 'pauta', dots: 'pontos', blank: 'em branco' };
function describeCustomTemplate(t) {
  const parts = [];
  if (t.hl && t.hl.length) parts.push(`${t.hl.length} linhas horizontais`);
  if (t.vl && t.vl.length) parts.push(`${t.vl.length} verticais`);
  if (t.dots) parts.push(`${t.dots.xs.length * t.dots.ys.length} pontos`);
  return `Modelo de ${TPL_KIND_NAMES[t.kind] || 'PDF'}: ${parts.join(', ') || 'sem linhas'} · espaçamento ${fmtW(t.spacing)}`;
}

/* desenho do modelo importado (posições exatas, escaladas pela largura da página) */
function drawCustomTemplate(ctx, tpl, vis, z, pw, dpr = 1) {
  const k = (pw || tpl.bw) / tpl.bw;
  if ((tpl.spacing || 30) * k * z < 1.8) { // muito afastado: vira um tom suave em vez de sumir
    const l = (tpl.hl && tpl.hl[0]) || (tpl.vl && tpl.vl[0]), sp = (tpl.spacing || 30) * k;
    if (l) return tintTemplate(ctx, l.c, clamp(+tpl.opacity || 1, 0.05, 1) * patternCoverage(tpl.vl && tpl.vl.length && tpl.hl && tpl.hl.length ? 'grid' : 'lines', Math.max(l.t * k, 1 / z), sp), vis, true, pw, (tpl.bh || 0) * k || null);
    if (tpl.dots) return tintTemplate(ctx, tpl.dots.c, clamp(+tpl.opacity || 1, 0.05, 1) * patternCoverage('dots', Math.max(tpl.dots.r * k, 0.6 / z) / 1.1, sp), vis, true, pw, null);
    return;
  }
  const x1 = vis.x, x2 = vis.x + vis.w, y1 = vis.y, y2 = vis.y + vis.h;
  ctx.save(); ctx.globalAlpha = clamp(+tpl.opacity || 1, 0.05, 1); ctx.lineCap = 'butt';
  for (const l of tpl.hl || []) {
    const y = l.y * k; if (y < y1 - 4 || y > y2 + 4) continue;
    const L = crispLine(Math.max(l.t * k, 1 / z), z * dpr), q = L.at(y); ctx.strokeStyle = l.c; ctx.lineWidth = L.w; ctx.beginPath(); ctx.moveTo(Math.max(x1, l.x1 * k), q); ctx.lineTo(Math.min(x2, l.x2 * k), q); ctx.stroke();
  }
  for (const l of tpl.vl || []) {
    const x = l.x * k; if (x < x1 - 4 || x > x2 + 4) continue;
    const L = crispLine(Math.max(l.t * k, 1 / z), z * dpr), q = L.at(x); ctx.strokeStyle = l.c; ctx.lineWidth = L.w; ctx.beginPath(); ctx.moveTo(q, Math.max(y1, l.y1 * k)); ctx.lineTo(q, Math.min(y2, l.y2 * k)); ctx.stroke();
  }
  const D = tpl.dots;
  if (D) {
    const r = Math.max(D.r * k, 0.6 / z); ctx.fillStyle = D.c; ctx.beginPath();
    for (const yy of D.ys) { const y = yy * k; if (y < y1 - r || y > y2 + r) continue; for (const xx of D.xs) { const x = xx * k; if (x < x1 - r || x > x2 + r) continue; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); } }
    ctx.fill();
  }
  ctx.restore();
}
/* linhas do modelo importado para "grudar" e para o texto alinhado às linhas */
function customGridLines(tpl, page, axis) {
  const k = page.w / tpl.bw;
  const arr = axis ? (tpl.hl && tpl.hl.length ? tpl.hl.map((l) => l.y) : tpl.dots && tpl.dots.ys) : (tpl.vl && tpl.vl.length ? tpl.vl.map((l) => l.x) : tpl.dots && tpl.dots.xs);
  if (!arr || arr.length < 2) return null;
  const ds = arr.slice(1).map((v, i) => v - arr[i]).sort((a, b) => a - b), s = ds[ds.length >> 1];
  return { o: arr[0] * k, s: s * k };
}
