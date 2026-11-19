'use strict';
/* ===== v0.32 — Sumário automático ("Tópicos") a partir da escrita =====
   Cada página → linhas de escrita (OCR.groupLines). Para cada linha: altura das letras (miolo: percentis 15–85 dos pontos),
   espessura da caneta e cor (ponderadas pelo comprimento da tinta).
   Referência da nota: a espessura com MAIS tinta é a do texto comum; a altura comum é a mediana das linhas nessa espessura
   (por página quando a página tem linhas comuns suficientes — evita erro quando a escrita muda de tamanho entre páginas).
   Título = letras claramente maiores (≥ 1,4×) OU caneta claramente mais grossa (≥ 1,2× e +0,25). Cor diferente da principal
   só ajuda: com letras um pouco maiores (≥ 1,2×) e linha curta também conta. Filtros contra erro: linha precisa parecer texto
   (larga, com mais de um traço ou comprida), não pode ser desenho enorme, nem quase a largura da página com letra só um pouco maior.
   Níveis: "destaque" = ln(espessura relativa) + ln(altura relativa) (+0,1 pela cor), agrupado em até 3 níveis por saltos.
   Linhas de título seguidas (mesmo nível, coladas) viram um item só. Se "títulos" passam de 40% das linhas, nada é marcado
   (a nota não tem um padrão claro). Nome: texto do OCR da página (se já leu) senão um recorte da escrita. */
const AutoToc = {
  _cache: new WeakMap(),
  strokeLen(e) { const p = e.pts; let l = 0; for (let i = 3; i < p.length; i += 3) l += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]); return l; },
  pageLines(page) {
    const els = page.elements, key = els.length + ':' + (els.length ? els[els.length - 1].id : '') + ':' + (page.w || 0);
    const c = this._cache.get(page); if (c && c.key === key) return c.lines;
    const groups = OCR.groupLines(els), lines = [];
    for (const L of groups) {
      const strokes = L.items.map((o) => o.e); let ink = 0; const ws = new Map(), cs = new Map(), ys = [];
      for (const e of strokes) {
        const l = this.strokeLen(e) + 1; ink += l;
        const w = Math.round((e.width || 1) * 20) / 20; ws.set(w, (ws.get(w) || 0) + l);
        const col = String(e.color || '').toLowerCase(); cs.set(col, (cs.get(col) || 0) + l);
        for (let i = 1; i < e.pts.length; i += 3) ys.push(e.pts[i]);
      }
      ys.sort((a, b) => a - b); const q = (f) => ys[Math.min(ys.length - 1, Math.max(0, Math.round(f * (ys.length - 1))))];
      const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
      lines.push({ x: L.x1, y: L.y1, w: L.x2 - L.x1, h: L.y2 - L.y1, core: Math.max(0.5, q(0.85) - q(0.15)), width: top(ws), color: top(cs), ink, n: strokes.length });
    }
    this._cache.set(page, { key, lines }); return lines;
  },
  compute(note) {
    const pages = note.pages.map((p) => this.pageLines(p));
    const all = pages.flat(); if (all.length < 4) return { items: [], why: 'Pouca escrita nesta nota para achar os títulos.' };
    const wInk = new Map(), cInk = new Map();
    for (const L of all) { wInk.set(L.width, (wInk.get(L.width) || 0) + L.ink); cInk.set(L.color, (cInk.get(L.color) || 0) + L.ink); }
    const modeW = [...wInk.entries()].sort((a, b) => b[1] - a[1])[0][0], mainC = [...cInk.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const wmed = (ls) => { const s = ls.map((L) => [L.core, L.ink]).sort((a, b) => a[0] - b[0]); const tot = s.reduce((t, x) => t + x[1], 0); let acc = 0; for (const [v, k] of s) { acc += k; if (acc >= tot / 2) return v; } return s.length ? s[s.length - 1][0] : 0; };
    const body = (ls) => ls.filter((L) => Math.abs(L.width - modeW) < 0.01);
    const gBody = body(all); if (gBody.length < 3) return { items: [], why: 'Pouca escrita comum para comparar.' };
    const gCore = wmed(gBody);
    const cands = [];
    pages.forEach((ls, pi) => {
      const pb = body(ls), pCore = pb.length >= 5 ? Math.max(wmed(pb), gCore * 0.75) : gCore, pw = note.pages[pi].w || 1000;
      for (const L of ls) {
        const sr = L.core / pCore, wr = L.width / modeW, colorDiff = L.color !== mainC;
        const big = sr >= 1.4, thick = wr >= 1.2 && L.width - modeW >= 0.25, colorHint = colorDiff && sr >= 1.2 && L.w < pw * 0.6;
        if (!(big || thick || colorHint)) continue;
        if (L.w < L.core * 1.2 && L.n < 3) continue; /* não parece texto (traço solto, sinal) */
        if (L.n < 2 && L.ink < L.core * 4) continue;
        if (sr > 7) continue; /* desenho enorme */
        if (L.w > pw * 0.85 && !thick && sr < 1.7) continue; /* linha da largura toda só um pouco maior: texto comum */
        cands.push({ pi, L, pCore, p: Math.log(Math.max(1, wr)) + Math.log(Math.max(1, sr)) + (colorDiff ? 0.1 : 0) });
      }
    });
    if (!cands.length) return { items: [], why: 'Não achei títulos: escreva-os com letras maiores ou caneta mais grossa.' };
    if (cands.length > all.length * 0.4) return { items: [], why: 'A escrita desta nota varia demais para separar títulos com segurança.' };
    /* níveis: a espessura é exata (caneta escolhida), o tamanho da letra varia ~15% à mão. Agrupa por espessura e, dentro dela,
       separa por tamanho só com salto grande (> ~28%). Os grupos são ordenados pelo destaque mediano (maior = nível 1); grupos
       com destaque quase igual ficam no mesmo nível; no máximo 3 níveis. */
    const byW = new Map(); for (const c of cands) { c.ls = Math.log(Math.max(1, c.L.core / (c.pCore || gCore))); const k = c.L.width; if (!byW.has(k)) byW.set(k, []); byW.get(k).push(c); }
    const groups = [];
    for (const arr of byW.values()) { arr.sort((a, b) => b.ls - a.ls); let g = [arr[0]]; for (let i = 1; i < arr.length; i++) { if (arr[i - 1].ls - arr[i].ls > 0.25) { groups.push(g); g = []; } g.push(arr[i]); } groups.push(g); }
    const med = (g) => { const v = g.map((c) => c.p).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    groups.sort((a, b) => med(b) - med(a));
    let lv = 0, lastM = null; for (const g of groups) { const m = med(g); if (lastM !== null && lastM - m > 0.08) lv = Math.min(2, lv + 1); for (const c of g) c.lv = lv; lastM = m; }
    const lvOf = (c) => c.lv;
    cands.sort((a, b) => a.pi - b.pi || a.L.y - b.L.y);
    const items = [];
    for (const c of cands) {
      const lv = lvOf(c), prev = items[items.length - 1];
      if (prev && prev.pi === c.pi && prev.level === lv && c.L.y - (prev.rect.y + prev.rect.h) < c.L.core * 1.3) { /* título em 2 linhas */
        const r = prev.rect, x1 = Math.min(r.x, c.L.x), y1 = Math.min(r.y, c.L.y), x2 = Math.max(r.x + r.w, c.L.x + c.L.w), y2 = Math.max(r.y + r.h, c.L.y + c.L.h);
        prev.rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; continue;
      }
      items.push({ pi: c.pi, level: lv, rect: { x: c.L.x, y: c.L.y, w: c.L.w, h: c.L.h } });
    }
    for (const it of items) it.text = this.ocrText(note.pages[it.pi], it.rect);
    return { items };
  },
  ocrText(page, r) {
    const ls = page.ocr && page.ocr.lines; if (!ls || !ls.length) return '';
    const out = [];
    for (const l of ls) { const ix = Math.max(0, Math.min(r.x + r.w, l.x + l.w) - Math.max(r.x, l.x)), iy = Math.max(0, Math.min(r.y + r.h, l.y + l.h) - Math.max(r.y, l.y)); if (ix * iy > 0.35 * Math.min(r.w * r.h, l.w * l.h)) out.push(l.t); }
    return out.join(' ').trim();
  },
  /* seção "Tópicos" do Sumário */
  section(note, go) {
    const box = el('div', {}, el('div', { class: 'qs-sec' }, 'Tópicos (automático)'));
    const wait = el('p', { class: 'qs-empty' }, 'Procurando títulos…'); box.append(wait);
    setTimeout(() => this.fill(note, box, wait, go), 30); /* o Sumário abre na hora; os tópicos entram logo depois */
    return box;
  },
  fill(note, box, wait, go) {
    let res; try { res = this.compute(note); } catch (e) { logError(e, 'tópicos'); res = { items: [], why: 'Não consegui montar os tópicos.' }; }
    wait.remove(); if (!box.isConnected && !box.parentNode) return;
    if (!res.items.length) { box.append(el('p', { class: 'qs-empty' }, res.why)); return; }
    for (const it of res.items.slice(0, 300)) {
      const name = el('span', { class: 'ol-t' });
      if (it.text) name.textContent = it.text;
      else { const img = el('img', { class: 'ol-crop', alt: '' }); name.append(img); this.crop(note, it).then((u) => u && (img.src = u)); }
      box.append(el('div', { class: 'ol-item ol-topic lv' + it.level, style: { paddingLeft: 10 + it.level * 16 + 'px' }, onclick: () => go(it) }, name, el('span', { class: 'ol-pg' }, String(it.pi + 1))));
    }
  },
  async crop(note, it) {
    try {
      const pad = Math.max(4, it.rect.h * 0.15), r = { x: it.rect.x - pad, y: it.rect.y - pad, w: it.rect.w + 2 * pad, h: it.rect.h + 2 * pad };
      const dpr = Math.min(2, devicePixelRatio || 1), sc = Math.min((26 * dpr) / r.h, (230 * dpr) / r.w);
      const cv = await renderPageCanvas(note, note.pages[it.pi], sc, { area: r, annot: true }); const u = cv.toDataURL('image/png'); cv.width = cv.height = 0; return u;
    } catch (e) { return null; }
  },
};
