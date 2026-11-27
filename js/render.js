'use strict';
const STICKY_FOLD = 40; /* v1.8: tamanho do post-it recolhido (unidades da página) */
/* ===== Desenho de modelos e elementos ===== */
const ImgCache = {
  map: new Map(), onReady: null,
  get(id) {
    const v = this.map.get(id);
    if (v && v !== 'loading') return v;
    if (!v) {
      this.map.set(id, 'loading');
      Store.getBlob(id).then((b) => (b ? createImageBitmap(b) : null)).then((bmp) => { if (bmp) { this.map.set(id, bmp); this.onReady && this.onReady(); } }).catch(() => this.map.delete(id));
    }
    return null;
  },
  clear() { this.map.clear(); }, // ao fechar a nota (a memória volta quando ninguém mais usa)
  async load(id) { const v = this.get(id); if (v) return v; for (let i = 0; i < 100; i++) { await sleep(30); const b = this.map.get(id); if (b && b !== 'loading') return b; if (!b) return null; } return null; },
};

/* linhas nítidas: espessura em pixels inteiros da tela e cada linha encaixada na grade de pixels (sem borrão de meio pixel) */
function crispLine(th, S) { const wd = Math.max(1, Math.round(th * S)); return { w: wd / S, at: (v) => (Math.round(v * S - wd / 2) + wd / 2) / S }; }
function drawTemplate(ctx, tpl, vis, z, bounded, pw, ph, dpr = 1) {
  if (!tpl || tpl.type === 'blank') return;
  if (tpl.type === 'custom') return drawCustomTemplate(ctx, tpl, vis, z, pw, dpr); // modelo importado de PDF
  const s = Math.max(4, +tpl.spacing || 32);
  /* v0.20: afastando, a linha afina junto com a folha até 1 pixel do aparelho; daí para baixo ela clareia em vez de engrossar
     (antes o mínimo era 1 px "CSS" = ~3 pixels no tablet, e a grade parecia mais grossa ao tirar o zoom) */
  const S = z * dpr, th0 = +tpl.thickness || 1, dev = th0 * S;
  let op = clamp(+tpl.opacity || 1, 0.05, 1);
  const th = tpl.type === 'dots' ? th0 : Math.max(th0, 1 / S);
  const fade = tpl.type === 'dots' ? 1 : Math.max(0.2, Math.min(1, dev));
  // muito afastado: em vez de sumir, a grade vira um tom suave do papel (mesmo "peso" visual)
  if (s * z < (tpl.type === 'dots' ? 2.4 : 1.8)) return tintTemplate(ctx, tpl.color, op * patternCoverage(tpl.type, th0, s), vis, bounded, pw, ph);
  ctx.save(); ctx.globalAlpha = op * fade;
  const L = crispLine(th, z * dpr);
  ctx.strokeStyle = ctx.fillStyle = tpl.color; ctx.lineWidth = L.w;
  const top = bounded ? (+tpl.top || 0) : 0;
  const x1 = vis.x, x2 = vis.x + vis.w, y1 = vis.y, y2 = vis.y + vis.h;
  // grade centralizada na folha (como no Notewise): margens iguais e pelo menos meio quadradinho de folga
  let ox = 0, oy = 0, xEnd = Infinity, yEnd = Infinity;
  if (tpl.center && bounded && pw && ph) {
    const nx = Math.floor((pw - s) / s + 1e-3), ny = Math.floor((ph - s) / s + 1e-3);
    ox = (pw - nx * s) / 2; oy = (ph - ny * s) / 2; xEnd = ox + nx * s + 0.01; yEnd = oy + ny * s + 0.01;
    const dy = +tpl.dy || 0; if (dy) { oy += dy; yEnd += dy; if (oy - s > -0.01) { oy -= s; } yEnd = Math.min(yEnd, ph); } // deslocamento fino (páginas redimensionadas no Notewise)
  }
  /* 1ª linha visível. Na folha a grade começa na borda (nada antes de 0); na tela infinita ela continua para cima e para a esquerda
     (v0.19.1: antes os pedaços com coordenada negativa ficavam só com linhas ou só com colunas) */
  const first = (v, o, st = s) => { const k = Math.ceil((v - o) / st); return o + (bounded ? Math.max(0, k) : k) * st; };
  const m = L.w; /* folga de meia linha: a linha que cai na emenda de dois blocos sai inteira nos dois */
  ctx.beginPath();
  if (tpl.type === 'lines' || tpl.type === 'grid') {
    const startY = tpl.type === 'lines' && !tpl.center ? top : oy;
    for (let y = first(y1 - m, startY); y <= Math.min(y2 + m, yEnd); y += s) { const q = L.at(y); ctx.moveTo(x1, q); ctx.lineTo(x2, q); }
    if (tpl.type === 'grid') for (let x = first(x1 - m, ox); x <= Math.min(x2 + m, xEnd); x += s) { const q = L.at(x); ctx.moveTo(q, y1); ctx.lineTo(q, y2); }
    ctx.stroke();
  } else if (tpl.type === 'dots') {
    let r = th0 * 1.1; const rMin = 0.7 / S; if (r < rMin) { ctx.globalAlpha = op * Math.max(0.25, (r / rMin) ** 2); r = rMin; } /* ponto pequeno demais: 0,7 px do aparelho, mais claro */
    for (let y = first(y1 - r, oy); y <= Math.min(y2 + r, yEnd); y += s) for (let x = first(x1 - r, ox); x <= Math.min(x2 + r, xEnd); x += s) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
    ctx.fill();
  }
  if (tpl.type === 'lines' && tpl.margin && bounded) {
    const M = crispLine(Math.max(th0, 1 / S), S); ctx.globalAlpha = op * Math.max(0.35, Math.min(1, th0 * S)); ctx.beginPath(); ctx.strokeStyle = tpl.marginColor || '#f19a9a'; ctx.lineWidth = M.w;
    const mx = M.at(Math.round(s * 2.5)); ctx.moveTo(mx, y1); ctx.lineTo(mx, y2); ctx.stroke();
  }
  ctx.restore();
}

function patternCoverage(type, th, s) { const f = Math.min(0.25, th / s); return type === 'grid' ? 2 * f - f * f : type === 'dots' ? Math.PI * Math.min(th * 1.1, s * 0.2) ** 2 / (s * s) : f; }
function tintTemplate(ctx, color, a, vis, bounded, pw, ph) {
  if (a <= 0.003) return; ctx.save(); ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = color;
  let x1 = vis.x, y1 = vis.y, x2 = vis.x + vis.w, y2 = vis.y + vis.h;
  if (bounded && pw && ph) { x1 = Math.max(0, x1); y1 = Math.max(0, y1); x2 = Math.min(pw, x2); y2 = Math.min(ph, y2); }
  if (x2 > x1 && y2 > y1) ctx.fillRect(x1, y1, x2 - x1, y2 - y1); ctx.restore();
}

function drawElement(ctx, e) {
  ctx.save();
  if (e.rot && hasRot(e)) { const c = rawCenter(e); ctx.translate(c.x, c.y); ctx.rotate(e.rot); ctx.translate(-c.x, -c.y); }
  if (e.type === 'stroke') {
    if (e.tool === 'pen' && e.fade && e.fade.c && typeof Fades !== 'undefined') Fades.draw(ctx, e); /* v0.38: cor em degradê */
    else if (e.tool === 'pen' && e.dash && e.dash !== 'solid') {
      ctx.globalAlpha = e.opacity ?? 1; ctx.strokeStyle = e.color; ctx.lineWidth = e.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash(dashPattern(e.dash, e.width)); ctx.stroke(buildPolyPath(e.pts));
    } else if (e.tool === 'pen' && e.pen === 'fine') { ctx.globalAlpha = e.opacity ?? 1; ctx.strokeStyle = e.color; ctx.lineWidth = e.width; ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.stroke(elPath(e)); }
    else if (e.tool === 'pen') { const p = elPath(e); ctx.globalAlpha = e.opacity ?? 1; if (p.strokeW) { ctx.strokeStyle = e.color; ctx.lineWidth = p.strokeW; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(p); } else { ctx.fillStyle = e.color; ctx.fill(p, 'nonzero'); } }
    else {
      ctx.globalAlpha = e.opacity ?? 0.4; ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = e.color; ctx.lineWidth = e.width; ctx.lineCap = e.cap || 'round'; ctx.lineJoin = 'round'; ctx.stroke(elPath(e));
    }
  } else if (e.type === 'shape') {
    const p = elPath(e); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalAlpha = e.opacity ?? 1;
    if (e.fill && e.kind !== 'line' && e.kind !== 'arrow') { ctx.fillStyle = e.fill; ctx.fill(p); }
    if (e.width > 0 && e.fade && e.fade.c && typeof Fades !== 'undefined' && Fades.drawShape(ctx, e)) { /* v1.42.15: forma em degradê */ }
    else if (e.width > 0) {
      ctx.strokeStyle = e.color; ctx.lineWidth = e.width;
      if (e.dash && e.dash !== 'solid') { ctx.setLineDash(dashPattern(e.dash, e.width)); if (e.kind === 'arrow') { ctx.stroke(buildShapePath({ ...e, kind: 'line' })); ctx.setLineDash([]); ctx.stroke(arrowHead(e)); } else ctx.stroke(p); }
      else ctx.stroke(p);
    }
  } else if (e.type === 'text' && e.folded) { /* v1.8: post-it recolhido — quadradinho com a dobra e linhas; toque abre */
    const F = STICKY_FOLD, f = F * 0.32, x = e.x, y = e.y;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2; ctx.fillStyle = e.bg || '#fde68a';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + F, y); ctx.lineTo(x + F, y + F - f); ctx.lineTo(x + F - f, y + F); ctx.lineTo(x, y + F); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.moveTo(x + F, y + F - f); ctx.lineTo(x + F - f, y + F - f); ctx.lineTo(x + F - f, y + F); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath();
    for (const [k, w] of [[0.3, 0.6], [0.5, 0.6], [0.7, 0.36]]) { ctx.moveTo(x + F * 0.2, y + F * k); ctx.lineTo(x + F * (0.2 + w), y + F * k); }
    ctx.stroke();
  } else if (e.type === 'text') {
    const L = layoutText(e);
    let tx = e.x, ty = e.y;
    if (e.sticky) { // post-it
      const h = L.h, f = Math.min(26, e.w * 0.14);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3; ctx.fillStyle = e.bg || '#fde68a';
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.w, e.y); ctx.lineTo(e.x + e.w, e.y + h - f); ctx.lineTo(e.x + e.w - f, e.y + h); ctx.lineTo(e.x, e.y + h); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.moveTo(e.x + e.w, e.y + h - f); ctx.lineTo(e.x + e.w - f, e.y + h - f); ctx.lineTo(e.x + e.w - f, e.y + h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = e.color; tx += STICKY_PAD; ty += STICKY_PAD;
    } else if (e.pbox) { const [bx, by, bw, bh] = e.pbox; ctx.fillStyle = e.bg || '#7c3aed'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill(); } /* v1.27: botão selecionado do TEC (fundo do tamanho do botão) */
    else if (e.bg) { ctx.fillStyle = e.bg; if (e.frame && e.frame.r) { const pd = e.frame.pad ?? 8, w = e.auto ? L.w : e.w; ctx.beginPath(); ctx.roundRect(e.x - pd, e.y - pd, w + 2 * pd, L.h + 2 * pd, Math.min(e.frame.r, (L.h + 2 * pd) / 2)); ctx.fill(); } else ctx.fillRect(e.x - 4, e.y - 2, L.w + 8, L.h + 4); } /* v1.23: fundo arredondado quando a moldura é arredondada (pílulas do TEC) */
    if (e.frame && !e.sticky) { const f = e.frame, pd = f.pad ?? 8, w = e.auto ? L.w : e.w; strokeFrame(ctx, f, e.x - pd, e.y - pd, w + 2 * pd, L.h + 2 * pd, false); } /* v0.27: moldura da caixa de texto */
    drawRichText(ctx, e, L, tx, ty);
  } else if (e.type === 'image') {
    const bmp = ImgCache.get(e.blobId);
    const fr = e.frame, rad = fr ? Math.min(fr.r || 0, e.w / 2, e.h / 2) : 0;
    if (rad > 0) { ctx.save(); ctx.beginPath(); ctx.roundRect(e.x, e.y, e.w, e.h, rad); ctx.clip(); } /* v0.27: cantos arredondados */
    if (bmp) {
      const c = e.crop; // recorte: parte visível da imagem original (frações 0–1)
      if (c) { const W = bmp.width, H = bmp.height, sw = Math.max(1e-3, c.w) * W, sh = Math.max(1e-3, c.h) * H; ctx.drawImage(bmp, c.x * W, c.y * H, sw, sh, e.x, e.y, e.w, e.h); }
      else ctx.drawImage(bmp, e.x, e.y, e.w, e.h);
    }
    else { ctx.fillStyle = 'rgba(120,130,150,.15)'; ctx.fillRect(e.x, e.y, e.w, e.h); }
    if (rad > 0) ctx.restore();
    if (fr && fr.w > 0) strokeFrame(ctx, fr, e.x, e.y, e.w, e.h, true); /* moldura por dentro da imagem */
  } else if (e.type === 'table') {
    const g = tableGrid(e), bw = e.bw || 1, bc = e.bc || '#7c3aed', M = e.merges || [];
    const span = (r, c) => M.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs);
    if (e.fill) { ctx.fillStyle = e.fill; ctx.fillRect(e.x, e.y, e.w, e.h); }
    ctx.fillStyle = bc; ctx.globalAlpha = 0.18; // cabeçalhos com um tom da cor da borda
    if (e.hRow) ctx.fillRect(e.x, g.ys[0], e.w, g.ys[1] - g.ys[0]);
    if (e.hCol) ctx.fillRect(g.xs[0], e.hRow ? g.ys[1] : e.y, g.xs[1] - g.xs[0], e.hRow ? e.y + e.h - g.ys[1] : e.h);
    ctx.globalAlpha = 1;
    for (const [k, col] of Object.entries(e.cellFill || {})) { // cor por célula (ou bloco mesclado)
      const [r, c] = k.split(',').map(Number); if (r >= e.rows || c >= e.cols) continue;
      const m = span(r, c); if (m && (m.r !== r || m.c !== c)) continue;
      const r2_ = m ? m.r + m.rs : r + 1, c2_ = m ? m.c + m.cs : c + 1;
      ctx.fillStyle = col; ctx.fillRect(g.xs[c], g.ys[r], g.xs[c2_] - g.xs[c], g.ys[r2_] - g.ys[r]);
    }
    ctx.strokeStyle = bc; ctx.lineWidth = bw; ctx.lineCap = 'square'; ctx.beginPath();
    for (let i = 0; i <= e.rows; i++) for (let j = 0; j < e.cols; j++) { // linhas horizontais, pulando as células mescladas
      if (i > 0 && i < e.rows) { const m = span(i - 1, j); if (m && i < m.r + m.rs) continue; }
      ctx.moveTo(g.xs[j], g.ys[i]); ctx.lineTo(g.xs[j + 1], g.ys[i]);
    }
    for (let j = 0; j <= e.cols; j++) for (let i = 0; i < e.rows; i++) {
      if (j > 0 && j < e.cols) { const m = span(i, j - 1); if (m && j < m.c + m.cs) continue; }
      ctx.moveTo(g.xs[j], g.ys[i]); ctx.lineTo(g.xs[j], g.ys[i + 1]);
    }
    ctx.stroke();
  } else if (Plugins.renderers[e.type]) {
    try { Plugins.renderers[e.type](ctx, e); } catch (err) { console.warn(err); }
  }
  ctx.restore();
}

/* Desenha uma página (coordenadas locais da página já aplicadas no ctx) */
function drawPageContent(ctx, note, page, vis, z, opts = {}) {
  const bounded = note.mode !== 'infinite';
  const tpl = page.template || note.template;
  if (opts.noBg) { /* só os traços (miniatura em pedaços) */ }
  else if (opts.annot) { // só as anotações (fundo transparente), para ir por cima do PDF original
    if (page.template && page.template.type !== 'blank') drawTemplate(ctx, page.template, vis, z, bounded, page.w, page.h, opts.dpr || 1);
  } else if (bounded) { ctx.fillStyle = page.pdf ? '#ffffff' : tpl.paper || '#fff'; ctx.fillRect(0, 0, page.w, page.h); }
  else { ctx.fillStyle = tpl.paper || '#fff'; ctx.fillRect(vis.x, vis.y, vis.w, vis.h); }
  if (opts.annot || opts.noBg) { /* fundo já tratado */ }
  else if (page.pdf) {
    const bmp = opts.pdfBitmap || PdfCache.bitmap(page.pdf, z * (opts.dpr || 1));
    const pw = page.pdfW && page.pdfW < page.w ? page.pdfW : page.w; /* v1.21: margem de rascunho à direita (page.pdfW = largura do PDF) */
    if (bmp) ctx.drawImage(bmp, 0, 0, pw, page.h);
    if (page.template && page.template.type !== 'blank') drawTemplate(ctx, page.template, vis, z, bounded, page.w, page.h, opts.dpr || 1);
    else if (pw < page.w) { ctx.save(); ctx.beginPath(); ctx.rect(pw, 0, page.w - pw, page.h); ctx.clip(); drawTemplate(ctx, scratchTpl(note), vis, z, bounded, page.w, page.h, opts.dpr || 1); ctx.restore();
      ctx.save(); ctx.strokeStyle = 'rgba(100,116,139,.35)'; ctx.lineWidth = Math.max(1 / z, 1); ctx.beginPath(); ctx.moveTo(pw, 0); ctx.lineTo(pw, page.h); ctx.stroke();
      const tops = typeof Tec !== 'undefined' && Tec.marginTops ? Tec.marginTops(note, page) : null; /* v1.31.1: margem separada por questão */
      if (tops && tops.length) { ctx.strokeStyle = 'rgba(124,58,237,.45)'; ctx.lineWidth = Math.max(1.2 / z, 1.2); ctx.setLineDash([6, 4]); ctx.beginPath(); for (const y of tops) { ctx.moveTo(pw, y); ctx.lineTo(page.w, y); } ctx.stroke(); ctx.setLineDash([]); }
      ctx.restore(); }
  } else drawTemplate(ctx, tpl, vis, z, bounded, page.w, page.h, opts.dpr || 1);
  const els = opts.range ? page.elements.slice(opts.range[0], opts.range[1]) : page.elements;
  for (const e of els) {
    if (opts.skip && opts.skip.has(e.id)) continue;
    if (!rectsHit(elBBox(e), vis)) continue;
    drawElement(ctx, e);
  }
}

/* Renderiza uma página isolada num canvas (miniaturas, exportação) */
/* v0.27: moldura {color, w (espessura), r (raio dos cantos), pad (espaço interno do texto)}; inside = borda por dentro da caixa (imagem) */
function strokeFrame(ctx, f, x, y, w, h, inside) {
  const lw = Math.max(0, +f.w || 0); if (!lw) return; const k = inside ? lw / 2 : 0;
  ctx.save(); ctx.strokeStyle = f.color || '#334155'; ctx.lineWidth = lw; ctx.setLineDash(f.dash === 'dash' ? [lw * 3, lw * 2] : f.dash === 'dot' ? [0.1, lw * 2] : []); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.roundRect(x + k, y + k, w - 2 * k, h - 2 * k, Math.max(0, Math.min((f.r || 0) - k, (w - 2 * k) / 2, (h - 2 * k) / 2))); ctx.stroke(); ctx.restore();
}
async function renderPageCanvas(note, page, scale, { maxW, area, annot = false } = {}) {
  let region = { x: 0, y: 0, w: page.w, h: page.h };
  if (area) region = area; // recorte (print do laço)
  else if (note.mode === 'infinite') {
    const b = bboxUnion(page.elements) || { x: 0, y: 0, w: 800, h: 1000 };
    const m = 40; region = { x: b.x - m, y: b.y - m, w: Math.max(400, b.w + 2 * m), h: Math.max(300, b.h + 2 * m) };
  }
  if (maxW) scale = maxW / region.w;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(region.w * scale)); cv.height = Math.max(1, Math.round(region.h * scale));
  const ctx = cv.getContext('2d');
  for (const e of page.elements) if (e.type === 'image') await ImgCache.load(e.blobId);
  await Fonts.ensure(page.elements);
  let pdfBitmap = null; if (page.pdf && !annot) pdfBitmap = await PdfCache.render(page.pdf, Math.min(4, Math.max(scale, 0.5)));
  ctx.setTransform(scale, 0, 0, scale, -region.x * scale, -region.y * scale);
  drawPageContent(ctx, note, page, region, scale, { pdfBitmap, annot });
  return cv;
}
async function makeThumb(note) {
  try { const cv = await renderPageCanvas(note, note.pages[0], 1, { maxW: 260 }); return cv.toDataURL('image/jpeg', 0.72); } catch (e) { console.warn(e); return null; }
}
function drawTemplatePreview(cv, tpl, w, h) {
  const r = cv.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
  const cw = Math.max(60, r.width || 200); const s = cw / w;
  cv.width = cw * dpr; cv.height = cw * (h / w) * dpr; cv.style.aspectRatio = `${w}/${h}`;
  const ctx = cv.getContext('2d'); ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  ctx.fillStyle = tpl.paper || '#fff'; ctx.fillRect(0, 0, w, h);
  drawTemplate(ctx, tpl, { x: 0, y: 0, w, h }, s, true, w, h);
}

function arrowHead(e) {
  const p = new Path2D(), a = Math.atan2(e.y2 - e.y1, e.x2 - e.x1), L = Math.max(10, e.width * 4.5);
  p.moveTo(e.x2 - L * Math.cos(a - 0.45), e.y2 - L * Math.sin(a - 0.45)); p.lineTo(e.x2, e.y2); p.lineTo(e.x2 - L * Math.cos(a + 0.45), e.y2 - L * Math.sin(a + 0.45));
  return p;
}

/* v1.21: modelo da margem de rascunho — o da nota se tiver linhas/grade, senão a grade do Notewise */
function scratchTpl(note) { const n = note || (typeof Editor !== 'undefined' && Editor.note), t = n && n.template; return t && t.type && t.type !== 'blank' ? t : NOTEWISE_TEMPLATES.grid; }
