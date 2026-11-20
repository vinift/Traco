'use strict';
/* ===== v0.36 — Caderno de caligrafia + "melhorar escrita" novo =====
   Caderno (Configurações → Escrita e caneta → "Caderno de caligrafia"): até 3 versões de cada caractere, desenhadas numa célula
   com guias (unidades 0–100; linha de base em 72). Guardado em meta 'calligraphy' = { glyphs: { ch: [amostra|null ×3] }, strength }.
   Amostra = lista de traços [x, y, x, y, …].
   Melhorar escrita (✨ no laço) — `beautifySelection()`:
     1) cada linha (OCR.groupLines) é endireitada;
     2) inclinação: as partes quase verticais dos traços dão a inclinação média → cisalhamento de 80% (letras em pé);
     3) letras = traços que se sobrepõem na horizontal (+ pingos/acentos em cima); cada letra é comparada com o caderno pelo
        reconhecedor $P (nuvem de pontos, independe da ordem/direção dos traços). Só com certeza (distância < limite e bem menor
        que a da 2ª letra mais parecida) a letra é APROXIMADA do modelo (`strength`, padrão 60%): cada traço vai para o traço
        correspondente do modelo, posto no mesmo lugar e altura da letra. Sem certeza, fica como está;
     4) espaço entre letras de uma palavra e altura/tamanho das palavras ficam mais iguais (suave — antes aumentava demais);
     5) alisamento leve. Tudo num passo do desfazer. */

const CALI_SETS = [['Minúsculas', 'abcdefghijklmnopqrstuvwxyz'], ['Maiúsculas', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], ['Números', '0123456789'], ['Acentos', 'áàâãéêíóôõúüç']];

/* ---------- reconhecedor $P (Vatavu, Anthony, Wobbrock 2012), N pontos ---------- */
const PDollar = {
  N: 32,
  cloud(strokes) {
    let pts = []; strokes.forEach((s, id) => { for (let i = 0; i + 1 < s.length; i += 2) pts.push({ x: s[i], y: s[i + 1], id }); });
    if (pts.length < 2) return null;
    pts = this.resample(pts, this.N);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const p of pts) { x1 = Math.min(x1, p.x); x2 = Math.max(x2, p.x); y1 = Math.min(y1, p.y); y2 = Math.max(y2, p.y); }
    const size = Math.max(x2 - x1, y2 - y1) || 1; let cx = 0, cy = 0;
    pts = pts.map((p) => ({ x: (p.x - x1) / size, y: (p.y - y1) / size, id: p.id })); for (const p of pts) { cx += p.x; cy += p.y; } cx /= pts.length; cy /= pts.length;
    return pts.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
  },
  resample(src, n) {
    const pts = src.map((p) => ({ ...p })); let L = 0; for (let i = 1; i < pts.length; i++) if (pts[i].id === pts[i - 1].id) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const I = L / (n - 1); if (!(I > 0)) return Array.from({ length: n }, () => ({ ...pts[0] }));
    let D = 0; const out = [{ ...pts[0] }];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].id !== pts[i - 1].id) continue;
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (D + d >= I && d > 0) { const t = (I - D) / d, q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y), id: pts[i].id }; out.push(q); pts.splice(i, 0, q); D = 0; }
      else D += d;
    }
    while (out.length < n) out.push({ ...pts[pts.length - 1] }); return out.slice(0, n);
  },
  dist(a, b) { const n = a.length, step = Math.max(1, Math.floor(Math.sqrt(n))); let min = Infinity; for (let i = 0; i < n; i += step) min = Math.min(min, this.cd(a, b, i), this.cd(b, a, i)); return min; },
  cd(a, b, start) {
    const n = a.length, used = new Uint8Array(n); let sum = 0, i = start;
    do { let idx = -1, m = Infinity; for (let j = 0; j < n; j++) if (!used[j]) { const d = Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y); if (d < m) { m = d; idx = j; } } used[idx] = 1; sum += (1 - ((i - start + n) % n) / n) * m; i = (i + 1) % n; } while (i !== start);
    return sum;
  },
};

const Cali = {
  data: null, _tpl: null, MAXD: 5,
  async load() { if (!this.data) { try { this.data = (await DB.get('meta', 'calligraphy')) || null; } catch (_) {} this.data = this.data || { glyphs: {}, strength: 0.6 }; } return this.data; },
  saveLater: debounce(() => { try { DB.put('meta', Cali.data, 'calligraphy'); } catch (_) {} }, 400),
  changed() { this._tpl = null; this.saveLater(); },
  count() { let n = 0; for (const k in (this.data && this.data.glyphs) || {}) n += this.data.glyphs[k].filter(Boolean).length; return n; },
  strength() { return clamp(this.data && this.data.strength != null ? this.data.strength : 0.6, 0, 1); },
  templates() {
    if (this._tpl) return this._tpl; const out = [];
    for (const [ch, list] of Object.entries((this.data && this.data.glyphs) || {})) for (const s of list || []) {
      if (!s || !s.length) continue; const c = PDollar.cloud(s); if (!c) continue;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const st of s) for (let i = 0; i + 1 < st.length; i += 2) { x1 = Math.min(x1, st[i]); x2 = Math.max(x2, st[i]); y1 = Math.min(y1, st[i + 1]); y2 = Math.max(y2, st[i + 1]); }
      out.push({ ch, cloud: c, strokes: s, box: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } });
    }
    return (this._tpl = out);
  },
  /* letra (traços em [x,y,…]) → { tpl, d } se tiver certeza, senão null */
  recognize(strokes, box) {
    const T = this.templates(); if (!T.length) return null; const c = PDollar.cloud(strokes); if (!c) return null;
    const ar = (b) => { const m = Math.max(b.w, b.h) || 1; return (b.w + 0.15 * m) / (b.h + 0.15 * m); }, nc = strokes.length;
    const best = new Map(); for (const t of T) { const d = PDollar.dist(c, t.cloud) + 1.5 * Math.abs(Math.log(ar(box) / ar(t.box))) + 0.8 * Math.abs(nc - t.strokes.length); const b = best.get(t.ch); if (!b || d < b.d) best.set(t.ch, { tpl: t, d }); } /* + formato da caixa + número de traços (l × t × i) */
    const arr = [...best.values()].sort((a, b) => a.d - b.d); const b1 = arr[0], b2 = arr[1];
    this._last = arr.slice(0, 3).map((x) => x.tpl.ch + ':' + x.d.toFixed(2)).join(' ');
    if (!b1 || b1.d > Cali.MAXD) return null; if (b2 && b1.d > 0.75 * b2.d) return null; /* parecida demais com outra letra: não mexe */
    return b1;
  },
};

/* traço [x,y,p,…] → K pontos igualmente espaçados (com pressão) */
function resampleStroke3(p, K) {
  const n = p.length / 3; if (n < 2) { const o = []; for (let k = 0; k < K; k++) o.push(p[0], p[1], p[2] ?? 0.5); return o; }
  const S = [0]; for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2])); const L = S[n - 1] || 1, out = [];
  for (let k = 0, j = 0; k < K; k++) { const t = (L * k) / (K - 1); while (j < n - 2 && S[j + 1] < t) j++; const f = S[j + 1] > S[j] ? (t - S[j]) / (S[j + 1] - S[j]) : 0; for (let c = 0; c < 3; c++) out.push(p[j * 3 + c] + (p[j * 3 + 3 + c] - p[j * 3 + c]) * f); }
  return out;
}
function resample2(s, K) { const p = []; for (let i = 0; i + 1 < s.length; i += 2) p.push(s[i], s[i + 1], 0.5); const r = resampleStroke3(p, K), o = []; for (let i = 0; i < r.length; i += 3) o.push(r[i], r[i + 1]); return o; }

/* aproxima os traços de uma letra (Map id→pts) do modelo reconhecido */
function morphLetter(ptsOf, ids, box, tpl, a) {
  const tb = tpl.box, s = tb.h > 4 ? box.h / tb.h : box.w / Math.max(4, tb.w), tcx = tb.x + tb.w / 2, tcy = tb.y + tb.h / 2, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const T = tpl.strokes.map((st) => { const o = []; for (let i = 0; i + 1 < st.length; i += 2) o.push(cx + (st[i] - tcx) * s, cy + (st[i + 1] - tcy) * s); return o; });
  const used = new Set(), lenOf = (p) => { let l = 0; for (let i = 3; i < p.length; i += 3) l += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]); return l; };
  const order = [...ids].sort((x, y) => lenOf(ptsOf.get(y)) - lenOf(ptsOf.get(x)));
  let n = 0;
  for (const id of order) {
    const p = ptsOf.get(id), K = clamp(Math.round(p.length / 3), 16, 160), u = resampleStroke3(p, K);
    let best = null, bd = Infinity, rev = false;
    T.forEach((t, ti) => { if (used.has(ti) || t.length < 4) return; const r = resample2(t, K); let d1 = 0, d2 = 0; for (let k = 0; k < K; k++) { d1 += Math.hypot(u[k * 3] - r[k * 2], u[k * 3 + 1] - r[k * 2 + 1]); d2 += Math.hypot(u[k * 3] - r[(K - 1 - k) * 2], u[k * 3 + 1] - r[(K - 1 - k) * 2 + 1]); } const d = Math.min(d1, d2) / K; if (d < bd) { bd = d; best = { ti, r }; rev = d2 < d1; } });
    if (!best || bd > Math.max(box.h, box.w) * 0.45) continue; /* traço sem par no modelo: fica como está */
    used.add(best.ti); const r = best.r, o = [];
    for (let k = 0; k < K; k++) { const q = rev ? K - 1 - k : k; o.push(r2(u[k * 3] + (r[q * 2] - u[k * 3]) * a), r2(u[k * 3 + 1] + (r[q * 2 + 1] - u[k * 3 + 1]) * a), u[k * 3 + 2]); }
    ptsOf.set(id, o); n++;
  }
  return n;
}

/* letras de uma linha: traços que se sobrepõem na horizontal, pingos e acentos juntam com a letra embaixo */
function splitLetters(items, core) {
  const S = items.map((e) => ({ e, b: elBBox(e) })).sort((a, b) => a.b.x - b.b.x), groups = [];
  for (const o of S) {
    const small = o.b.w < core * 0.45 && o.b.h < core * 0.45, cxo = o.b.x + o.b.w / 2;
    let g = null;
    for (let k = groups.length - 1; k >= Math.max(0, groups.length - 3) && !g; k--) {
      const G = groups[k], ov = Math.min(G.x2, o.b.x + o.b.w) - Math.max(G.x1, o.b.x), mw = Math.min(G.x2 - G.x1, o.b.w) || 1;
      if (ov >= mw * 0.3 || (small && cxo >= G.x1 - core * 0.15 && cxo <= G.x2 + core * 0.15)) g = G;
    }
    if (g) { g.items.push(o.e); g.x1 = Math.min(g.x1, o.b.x); g.x2 = Math.max(g.x2, o.b.x + o.b.w); }
    else groups.push({ items: [o.e], x1: o.b.x, x2: o.b.x + o.b.w });
  }
  return groups;
}

async function beautifySelection() {
  if (!Editor.sel) return; const page = Editor.pageById(Editor.sel.pageId); if (!page) return;
  await Cali.load();
  const sel = Editor.selElements(), lines = OCR.groupLines(sel); if (!lines.length) return toast('Selecione escrita feita com a caneta');
  const ptsOf = new Map(), orig = new Map();
  for (const L of lines) for (const { e } of L.items) { orig.set(e.id, e); ptsOf.set(e.id, Array.from(e.pts)); }
  const bbOf = (ids) => { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const id of ids) { const p = ptsOf.get(id); for (let i = 0; i < p.length; i += 3) { x1 = Math.min(x1, p[i]); x2 = Math.max(x2, p[i]); y1 = Math.min(y1, p[i + 1]); y2 = Math.max(y2, p[i + 1]); } } return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
  const mapPts = (ids, fn) => { for (const id of ids) { const p = ptsOf.get(id); for (let i = 0; i < p.length; i += 3) { const q = fn(p[i], p[i + 1]); p[i] = q[0]; p[i + 1] = q[1]; } } };
  const ysOf = (ids) => { const ys = []; for (const id of ids) { const p = ptsOf.get(id); for (let i = 1; i < p.length; i += 3) ys.push(p[i]); } return ys.sort((a, b) => a - b); };
  const pct = (ys, q) => ys[Math.min(ys.length - 1, Math.max(0, Math.round(q * (ys.length - 1))))];
  let nLetters = 0, nMorph = 0; const tplOn = Cali.templates().length > 0, A = Cali.strength();
  for (const L of lines) {
    const ids = L.items.map((o) => o.e.id); if (!ids.length) continue;
    /* 1) endireita a linha */
    { let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0; for (const id of ids) { const p = ptsOf.get(id); for (let i = 0; i < p.length; i += 3) { n++; sx += p[i]; sy += p[i + 1]; sxx += p[i] * p[i]; sxy += p[i] * p[i + 1]; } }
      const den = n * sxx - sx * sx, ang = den ? Math.atan((n * sxy - sx * sy) / den) : 0;
      if (Math.abs(ang) > 0.004 && Math.abs(ang) < 0.6) { const b = bbOf(ids), cx = b.x + b.w / 2, cy = b.y + b.h / 2, c = Math.cos(-ang), s = Math.sin(-ang); mapPts(ids, (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); } }
    let ys = ysOf(ids); const core = Math.max(2, pct(ys, 0.85) - pct(ys, 0.15)), base = pct(ys, 0.5);
    /* 2) inclinação: média ponderada das partes quase verticais */
    { let sw = 0, ss = 0; for (const id of ids) { const p = ptsOf.get(id); for (let i = 3; i < p.length; i += 3) { const dx = p[i] - p[i - 3], dy = p[i + 1] - p[i - 2], l = Math.hypot(dx, dy); if (l > 0 && Math.abs(dy) > Math.abs(dx) * 1.7) { ss += (dx / dy) * l; sw += l; } } }
      const slope = sw > core * 2 ? ss / sw : 0; if (Math.abs(slope) > 0.04 && Math.abs(slope) < 0.7) mapPts(ids, (x, y) => [x - 0.8 * slope * (y - base), y]); }
    /* 3) letras pelo caderno */
    const cur = (o) => ({ ...o, pts: ptsOf.get(o.id) });
    const letters = splitLetters(L.items.map((o) => cur(o.e)), core); nLetters += letters.length;
    if (tplOn && A > 0) for (const g of letters) {
      const lids = g.items.map((e) => e.id), box = bbOf(lids); if (box.h < 2 && box.w < 2) continue;
      if (box.w > core * 2.2 && box.w > box.h * 1.6) continue; /* largo demais: letras emendadas, não dá para separar */
      const strokes = lids.map((id) => { const p = ptsOf.get(id), o = []; for (let i = 0; i < p.length; i += 3) o.push(p[i], p[i + 1]); return o; });
      const r = Cali.recognize(strokes, box); if (r && morphLetter(ptsOf, lids, box, r.tpl, A)) nMorph++;
    }
    /* 4) palavras: espaço entre letras e altura/tamanho mais iguais (suave) */
    const lg = splitLetters(L.items.map((o) => cur(o.e)), core).map((g) => ({ ids: g.items.map((e) => e.id), b: bbOf(g.items.map((e) => e.id)) })).sort((a, b) => a.b.x - b.b.x);
    const words = []; for (const g of lg) { const w = words[words.length - 1]; if (w && g.b.x - (w.x2) < core * 0.45) { w.gs.push(g); w.x2 = Math.max(w.x2, g.b.x + g.b.w); } else words.push({ gs: [g], x2: g.b.x + g.b.w }); }
    const gaps = []; for (const w of words) for (let k = 1; k < w.gs.length; k++) gaps.push(w.gs[k].b.x - (w.gs[k - 1].b.x + w.gs[k - 1].b.w)); gaps.sort((a, b) => a - b);
    const gT = gaps.length >= 3 ? clamp(gaps[Math.floor(gaps.length / 2)], core * 0.05, core * 0.4) : null;
    ys = ysOf(ids); const midT = pct(ys, 0.5); let shift = 0;
    const wc = words.map((w) => { const all = w.gs.flatMap((g) => g.ids), y = ysOf(all); return Math.max(1, pct(y, 0.85) - pct(y, 0.15)); }), wcs = [...wc].sort((a, b) => a - b), cT = wcs[Math.floor(wcs.length / 2)];
    words.forEach((w, wi) => {
      const all = w.gs.flatMap((g) => g.ids); if (shift) mapPts(all, (x, y) => [x + shift, y]);
      if (gT != null) for (let k = 1; k < w.gs.length; k++) { const prev = w.gs[k - 1], g = w.gs[k], pb = bbOf(prev.ids), b = bbOf(g.ids), gap = b.x - (pb.x + pb.w), dx = (gT - gap) * 0.6; if (Math.abs(dx) > 0.05) { const rest = w.gs.slice(k).flatMap((q) => q.ids); mapPts(rest, (x, y) => [x + dx, y]); shift += dx; } }
      const b = bbOf(all), y = ysOf(all), real = b.h > core * 0.55;
      if (real) { const med = pct(y, 0.5), sc = 1 + (clamp(cT / wc[wi], 0.85, 1.2) - 1) * 0.5, dy = (midT - med) * 0.7, ox = b.x; mapPts(all, (x, yy) => [ox + (x - ox) * sc, med + (yy - med) * sc + dy]); shift += b.w * (sc - 1); }
    });
    /* 5) alisamento leve */
    const sig = clamp(core * 0.05, 0.3, 2.2); for (const id of ids) ptsOf.set(id, Array.from(smoothArc(ptsOf.get(id), sig)));
  }
  for (const [id, p] of ptsOf) { const e = orig.get(id), cur = page.elements.find((x) => x.id === id); if (cur) Editor.recReplace(page, cur, { ...e, pts: p.map((v) => r2(v)) }); }
  Editor.opCommit(); UI.buildSelBar(); Editor.requestRender();
  toast(tplOn ? `Escrita melhorada · ${nMorph} de ${nLetters} letras aproximadas do seu caderno · Desfazer volta ao original` : `Escrita arrumada (inclinação, espaço e altura) · Preencha o Caderno de caligrafia nas Configurações para as letras ficarem como as suas melhores`, 3200);
}

/* ---------- Caderno de caligrafia (página inteira) ----------
   v0.36.1: página inteira (como as Configurações; fecha só pelo voltar — a palma encostando fora não fecha mais) e à prova de palma:
   cada tela guarda o seu traço por ponteiro; depois que a caneta aparece, toques de dedo nas telas são ignorados; a caneta
   tem prioridade (se um toque estava desenhando, ele é descartado e a caneta começa); toque grande (Palm.big) nunca desenha.
   Ponto (traço de 1 ponto) é desenhado como bolinha cheia. */
async function caligraphyNotebook() {
  await Cali.load(); const D = Cali.data; let set = 0, ch = CALI_SETS[0][1][0], penSeen = false;
  const grid = el('div', { class: 'cal-grid' }), cells = el('div', { class: 'cal-cells' }), title = el('div', { class: 'cal-ch' });
  const tabs = el('div', { class: 'xp-tabs cal-tabs' }), countEl = el('span', { class: 'sp-ver' });
  const filled = (c) => ((D.glyphs[c] || []).filter((s) => s && s.length).length);
  const paintGrid = () => {
    grid.innerHTML = '';
    for (const c of CALI_SETS[set][1]) { const f = filled(c); grid.append(el('button', { class: 'cal-key' + (c === ch ? ' on' : '') + (f ? ' has' : ''), onclick: () => { ch = c; paintGrid(); paintCells(); } }, el('b', {}, c), el('small', {}, f ? '●'.repeat(f) : '·'))); }
    [...tabs.children].forEach((b, i) => b.classList.toggle('on', i === set)); countEl.textContent = Cali.count() + ' versões salvas';
  };
  const wide = innerWidth >= 900, dpr = Math.min(3, devicePixelRatio || 1);
  const S = Math.round(clamp(wide ? Math.min((innerWidth - 436) / 3 - 16, innerHeight - 250) : Math.min((innerWidth - 64) / 3 - 10, 300), 150, 340));
  const drawCell = (cv, sample) => {
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S);
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    const line = (y, c, dash, lw) => { const yy = Math.round((y * S) / 100) + 0.5; g.strokeStyle = c; g.lineWidth = lw || 1; g.setLineDash(dash || []); g.beginPath(); g.moveTo(8, yy); g.lineTo(S - 8, yy); g.stroke(); };
    line(16, '#e5e7eb', [4, 4]); line(42, '#c7d2fe', [4, 4]); line(72, '#818cf8', null, 1.6); line(92, '#e5e7eb', [4, 4]); g.setLineDash([]);
    const lw = (3.2 * S) / 200; g.strokeStyle = g.fillStyle = '#111827'; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const st of sample || []) {
      const short = st.length <= 2 || (st.length <= 6 && Math.hypot(st[st.length - 2] - st[0], st[st.length - 1] - st[1]) < 0.5);
      if (short) { g.beginPath(); g.arc((st[0] * S) / 100, (st[1] * S) / 100, lw * 0.75, 0, Math.PI * 2); g.fill(); continue; } /* ponto */
      g.beginPath(); for (let i = 0; i + 1 < st.length; i += 2) { const x = (st[i] * S) / 100, y = (st[i + 1] * S) / 100; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    }
  };
  const paintCells = () => {
    title.textContent = ch; cells.innerHTML = ''; const list = D.glyphs[ch] || (D.glyphs[ch] = [null, null, null]);
    for (let k = 0; k < 3; k++) {
      const cv = el('canvas', { class: 'cal-cv', width: S * dpr, height: S * dpr, style: { width: S + 'px', height: S + 'px' } }); let cur = null, pid = null, ptype = '';
      drawCell(cv, list[k]);
      const pt = (e) => { const r = cv.getBoundingClientRect(); return [r2(((e.clientX - r.left) / r.width) * 100), r2(((e.clientY - r.top) / r.height) * 100)]; };
      const drop = () => { if (cur && list[k]) { const j = list[k].indexOf(cur); if (j >= 0) list[k].splice(j, 1); if (!list[k].length) list[k] = null; } cur = null; pid = null; drawCell(cv, list[k]); };
      cv.addEventListener('pointerdown', (e) => {
        e.preventDefault(); const pen = e.pointerType === 'pen';
        if (pen) penSeen = true;
        else if (e.pointerType === 'touch' && (penSeen || (typeof Palm !== 'undefined' && Palm.big(e.width || 0, e.height || 0)))) return; /* palma / dedo depois da caneta */
        if (pid !== null) { if (pen && ptype !== 'pen') drop(); else return; } /* a caneta toma o lugar do toque */
        pid = e.pointerId; ptype = e.pointerType; try { cv.setPointerCapture(pid); } catch (_) {}
        if (!list[k]) list[k] = []; cur = pt(e); list[k].push(cur); drawCell(cv, list[k]);
      });
      cv.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid || !cur) return;
        if (ptype === 'touch' && typeof Palm !== 'undefined' && Palm.big(e.width || 0, e.height || 0)) return drop(); /* cresceu: era a palma */
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const ev of evs.length ? evs : [e]) cur.push(...pt(ev)); drawCell(cv, list[k]);
      });
      const end = (e) => { if (e.pointerId !== pid) return; if (e.type === 'pointercancel' && ptype === 'touch') return drop(); pid = null; cur = null; Cali.changed(); paintGrid(); };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      cells.append(el('div', { class: 'cal-cell' }, cv, el('div', { class: 'cal-row' }, el('small', {}, `Versão ${k + 1}`), el('button', { class: 'btn ghost cal-clear', onclick: () => { list[k] = null; cur = null; pid = null; drawCell(cv, null); Cali.changed(); paintGrid(); } }, 'Limpar'))));
    }
  };
  CALI_SETS.forEach(([n], i) => tabs.append(el('button', { class: 'xp-tab', onclick: () => { set = i; ch = CALI_SETS[i][1][0]; paintGrid(); paintCells(); } }, n)));
  const all = CALI_SETS.map((x) => x[1]).join(''), step = (d) => { const i = all.indexOf(ch); ch = all[(i + d + all.length) % all.length]; set = CALI_SETS.findIndex((x) => x[1].includes(ch)); paintGrid(); paintCells(); };
  const sl = UI.slider('Quanto aproximar as letras do caderno', 0, 100, 10, Math.round(Cali.strength() * 100), (v) => { D.strength = v / 100; Cali.saveLater(); }, (v) => v + '%');
  paintGrid(); paintCells();
  await new Promise((resolve) => {
    const close = () => { page.remove(); resolve(); };
    const back = el('button', { class: 'cbtn round', title: 'Voltar', onclick: close }); back.innerHTML = icon('arrowLeft');
    const side = el('div', { class: 'cal-side' }, tabs, grid, sl, el('p', { class: 'lbl-sm' }, 'Escreva cada letra do seu jeito mais bonito, em cima da linha roxa (linha de base). Até 3 versões por letra ajudam a reconhecer os jeitos diferentes que você escreve. O ✨ "Melhorar escrita" do laço aproxima as suas letras destas. Pode apoiar a mão: depois que a caneta escreve, o dedo e a palma não riscam as telas.'));
    const main = el('div', { class: 'cal-main' }, el('div', { class: 'cal-edit' }, el('button', { class: 'btn ghost cal-prev', title: 'Letra anterior', onclick: () => step(-1) }, '←'), title, el('button', { class: 'btn primary cal-next', onclick: () => step(1) }, 'Próxima letra →')), cells);
    const page = el('div', { class: 'settings-page cal-page' + (wide ? '' : ' narrow') },
      el('header', { class: 'sp-head' }, back, el('h1', {}, 'Caderno de caligrafia'), countEl),
      el('div', { class: 'cal-body' }, side, main));
    document.body.append(page);
  });
  try { await DB.put('meta', Cali.data, 'calligraphy'); } catch (_) {}
}
