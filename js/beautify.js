'use strict';
/* ===== v0.23 — Melhorar a escrita =====
   1) Automático (ao levantar a caneta): alisamento por DISTÂNCIA (não por amostra), que arredonda as curvas e tira o tremido
      sem apagar os cantos (pontas de "v", "z", "r" são detectadas e ficam no lugar). Nível em Configurações (0 = desligado).
   2) Botão "Melhorar escrita" no laço: alisa com mais força, endireita cada linha e deixa as palavras do mesmo tamanho
      e na mesma altura (pontuação fica como está). Tudo num passo só do desfazer. */

/* alisamento por comprimento de arco. pts = [x, y, pressão, …]; sigma em unidades da página. Devolve uma lista nova. */
function smoothArc(pts, sigma, cornerDeg = 62) {
  const n = pts.length / 3; if (n < 4 || !(sigma > 0)) return pts;
  const S = new Float64Array(n); for (let i = 1; i < n; i++) S[i] = S[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2]);
  const total = S[n - 1]; if (total < sigma * 3) return pts; // pingo, ponto do i, tracinho: fica como está
  /* 1. reamostra em passos iguais (h = sigma/3) */
  const h = sigma / 3, m = Math.max(3, Math.ceil(total / h)), X = new Float64Array(m + 1), Y = new Float64Array(m + 1), P = new Float64Array(m + 1);
  for (let k = 0, j = 0; k <= m; k++) {
    const t = (total * k) / m; while (j < n - 2 && S[j + 1] < t) j++;
    const L = S[j + 1] - S[j], f = L > 0 ? (t - S[j]) / L : 0;
    X[k] = pts[j * 3] + (pts[j * 3 + 3] - pts[j * 3]) * f; Y[k] = pts[j * 3 + 1] + (pts[j * 3 + 4] - pts[j * 3 + 1]) * f; P[k] = pts[j * 3 + 2] + (pts[j * 3 + 5] - pts[j * 3 + 2]) * f;
  }
  /* 2. cantos: onde a direção vira mais que cornerDeg numa janela de ~1,5 sigma (só máximos locais) */
  const w = Math.max(2, Math.round((1.5 * sigma) / h)), cosT = Math.cos((cornerDeg * Math.PI) / 180), ang = new Float64Array(m + 1), cuts = [0];
  for (let i = w; i <= m - w; i++) {
    const ax = X[i] - X[i - w], ay = Y[i] - Y[i - w], bx = X[i + w] - X[i], by = Y[i + w] - Y[i], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la > 0 && lb > 0) { const c = (ax * bx + ay * by) / (la * lb); ang[i] = c < cosT ? 1 - c : 0; }
  }
  for (let i = w; i <= m - w; i++) if (ang[i] > 0) { let mx = true; for (let j = Math.max(0, i - w); j <= Math.min(m, i + w); j++) if (ang[j] > ang[i] || (ang[j] === ang[i] && j < i)) { mx = false; break; } if (mx) cuts.push(i); }
  cuts.push(m);
  /* 3. média gaussiana dentro de cada trecho entre cantos; perto das pontas e dos cantos o efeito diminui até zero (ficam no lugar) */
  const K = Math.ceil((3 * sigma) / h), wt = []; for (let j = 0; j <= K; j++) wt.push(Math.exp(-((j * h) ** 2) / (2 * sigma * sigma)));
  const OX = new Float64Array(m + 1), OY = new Float64Array(m + 1), OP = new Float64Array(m + 1);
  for (let c = 0; c < cuts.length - 1; c++) {
    const a = cuts[c], b = cuts[c + 1];
    for (let i = a; i <= b; i++) {
      let sx = 0, sy = 0, sp = 0, sw = 0;
      for (let j = -K; j <= K; j++) { const q = Math.min(b, Math.max(a, i + j)), ww = wt[Math.abs(j)]; sx += X[q] * ww; sy += Y[q] * ww; sp += P[q] * ww; sw += ww; }
      const d = Math.min(i - a, b - i) * h, r = Math.min(1, d / (1.5 * sigma)), k = r * r * (3 - 2 * r); // suave: 0 na ponta/canto, 1 longe dela
      OX[i] = X[i] + (sx / sw - X[i]) * k; OY[i] = Y[i] + (sy / sw - Y[i]) * k; OP[i] = P[i] + (sp / sw - P[i]) * k;
    }
  }
  /* 4. saída mais leve: um ponto a cada 2 passos, mais pontas e cantos */
  const keep = new Set(cuts), out = [];
  for (let i = 0; i <= m; i++) if (i % 2 === 0 || keep.has(i) || i === m) out.push(OX[i], OY[i], OP[i]);
  return out;
}

/* nível do automático (0–10; 0 = desligado) → sigma em px de tela */
function autoBeautifyLevel() { const v = Store.settings.autoBeautify; return clamp(v == null ? 5 : +v, 0, 10); }
function autoBeautifySigma(z) { const L = autoBeautifyLevel(); return L ? (0.25 * L) / (z || 1) : 0; }

/* percentis de y dos pontos de um grupo de traços */
function yPercentiles(strokes, qs) {
  const ys = []; for (const e of strokes) for (let i = 1; i < e.pts.length; i += 3) ys.push(e.pts[i]);
  ys.sort((a, b) => a - b); return qs.map((q) => ys[Math.min(ys.length - 1, Math.max(0, Math.round(q * (ys.length - 1))))]);
}

/* botão "Melhorar escrita" (laço) */
function beautifySelection() {
  if (!Editor.sel) return; const page = Editor.pageById(Editor.sel.pageId);
  const lines = OCR.groupLines(Editor.selElements()); if (!lines.length) return toast('Selecione escrita feita com a caneta');
  const cur = (e) => page.elements.find((x) => x.id === e.id);
  let nW = 0;
  for (const L of lines) {
    let items = L.items.map((o) => cur(o.e)).filter(Boolean); if (!items.length) continue;
    /* a) endireita a linha (regressão dos pontos) */
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const e of items) for (let i = 0; i < e.pts.length; i += 3) { const x = e.pts[i], y = e.pts[i + 1]; n++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const den = n * sxx - sx * sx, ang = den ? Math.atan((n * sxy - sx * sy) / den) : 0;
    if (Math.abs(ang) > 0.004 && Math.abs(ang) < 0.6) {
      const b = bboxUnion(items), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      items = items.map((e) => { const r = rotateEl(e, -ang, cx, cy); Editor.recReplace(page, e, r); return r; });
    }
    /* b) palavras: traços separados por um espaço maior que ~0,45 da altura da letra */
    const [q15, q85] = yPercentiles(items, [0.15, 0.85]), lineCore = Math.max(2, q85 - q15);
    const sorted = items.map((e) => ({ e, b: elBBox(e) })).sort((a, b) => a.b.x - b.b.x), words = [];
    for (const o of sorted) { const w = words[words.length - 1]; if (w && o.b.x - w.x2 < lineCore * 0.45) { w.items.push(o.e); w.x2 = Math.max(w.x2, o.b.x + o.b.w); } else words.push({ items: [o.e], x1: o.b.x, x2: o.b.x + o.b.w }); }
    for (const w of words) { const [a, m, c] = yPercentiles(w.items, [0.15, 0.5, 0.85]); w.core = c - a; w.mid = m; w.h = bboxUnion(w.items).h; }
    const real = words.filter((w) => w.h > lineCore * 0.55); if (!real.length) continue; // sem palavras de verdade (só pontuação)
    const cores = real.map((w) => w.core).sort((a, b) => a - b), target = cores[Math.floor(cores.length / 2)];
    const mids = real.map((w) => w.mid).sort((a, b) => a - b), midT = mids[Math.floor(mids.length / 2)];
    /* c) cada palavra: alisa os traços, ajusta o tamanho (80% do caminho até a mediana) e a altura; as seguintes andam junto */
    const sig = clamp(target * 0.07, 0.35, 3);
    let shift = 0;
    for (const w of words) {
      const isReal = w.h > lineCore * 0.55;
      const s = isReal && w.core > 0 ? 1 + (clamp(target / w.core, 0.72, 1.35) - 1) * 0.8 : 1;
      const dy = isReal ? (midT - w.mid) * 0.8 : 0;
      const tf = { ox: w.x1, oy: w.mid, sx: s, sy: s, dx: shift, dy, free: true };
      for (const e of w.items) {
        const now = cur(e); if (!now) continue;
        const sm = { ...now, pts: Array.from(smoothArc(Array.from(now.pts), sig)) };
        Editor.recReplace(page, now, transformEl(sm, tf));
      }
      shift += (w.x2 - w.x1) * (s - 1); nW++;
    }
  }
  Editor.opCommit(); UI.buildSelBar(); Editor.requestRender();
  toast(`Escrita melhorada (${lines.length} linha${lines.length > 1 ? 's' : ''}, ${nW} palavra${nW > 1 ? 's' : ''}) · Desfazer volta ao original`, 2200);
}
