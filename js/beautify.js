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


