'use strict';
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
  async load(id) { const v = this.get(id); if (v) return v; for (let i = 0; i < 100; i++) { await sleep(30); const b = this.map.get(id); if (b && b !== 'loading') return b; if (!b) return null; } return null; },
};

function drawTemplate(ctx, tpl, vis, z, bounded) {
  if (!tpl || tpl.type === 'blank') return;
  const s = Math.max(4, +tpl.spacing || 32);
  if (s * z < (tpl.type === 'dots' ? 5 : 3)) return;
  const th = Math.max(+tpl.thickness || 1, 0.6 / z);
  ctx.save(); ctx.globalAlpha = clamp(+tpl.opacity || 1, 0.05, 1);
  ctx.strokeStyle = ctx.fillStyle = tpl.color; ctx.lineWidth = th;
  const top = bounded ? (+tpl.top || 0) : 0;
  const x1 = vis.x, x2 = vis.x + vis.w, y1 = vis.y, y2 = vis.y + vis.h;
  ctx.beginPath();
  if (tpl.type === 'lines' || tpl.type === 'grid') {
    const startY = tpl.type === 'lines' ? top : 0;
    for (let y = startY + Math.max(0, Math.ceil((y1 - startY) / s)) * s; y <= y2; y += s) { if (y < startY) continue; ctx.moveTo(x1, y); ctx.lineTo(x2, y); }
    if (tpl.type === 'grid') for (let x = Math.ceil(x1 / s) * s; x <= x2; x += s) { ctx.moveTo(x, y1); ctx.lineTo(x, y2); }
    ctx.stroke();
  } else if (tpl.type === 'dots') {
    const r = Math.max(th * 1.1, 0.8 / z);
    for (let y = Math.ceil(y1 / s) * s; y <= y2; y += s) for (let x = Math.ceil(x1 / s) * s; x <= x2; x += s) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
    ctx.fill();
  }
  if (tpl.type === 'lines' && tpl.margin && bounded) {
    ctx.beginPath(); ctx.strokeStyle = tpl.marginColor || '#f19a9a'; ctx.lineWidth = Math.max(th, 1);
    const mx = Math.round(s * 2.5); ctx.moveTo(mx, y1); ctx.lineTo(mx, y2); ctx.stroke();
  }
  ctx.restore();
}

function drawElement(ctx, e) {
  ctx.save();
  if (e.rot && hasRot(e)) { const c = rawCenter(e); ctx.translate(c.x, c.y); ctx.rotate(e.rot); ctx.translate(-c.x, -c.y); }
  if (e.type === 'stroke') {
    if (e.tool === 'pen' && e.dash && e.dash !== 'solid') {
      ctx.globalAlpha = e.opacity ?? 1; ctx.strokeStyle = e.color; ctx.lineWidth = e.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash(dashPattern(e.dash, e.width)); ctx.stroke(buildPolyPath(e.pts));
    } else if (e.tool === 'pen') { ctx.globalAlpha = e.opacity ?? 1; ctx.fillStyle = e.color; ctx.fill(elPath(e), 'nonzero'); }
    else {
      ctx.globalAlpha = e.opacity ?? 0.4; ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = e.color; ctx.lineWidth = e.width; ctx.lineCap = e.cap || 'round'; ctx.lineJoin = 'round'; ctx.stroke(elPath(e));
    }
  } else if (e.type === 'shape') {
    const p = elPath(e); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalAlpha = e.opacity ?? 1;
    if (e.fill && e.kind !== 'line' && e.kind !== 'arrow') { ctx.fillStyle = e.fill; ctx.fill(p); }
    if (e.width > 0) {
      ctx.strokeStyle = e.color; ctx.lineWidth = e.width;
      if (e.dash && e.dash !== 'solid') { ctx.setLineDash(dashPattern(e.dash, e.width)); if (e.kind === 'arrow') { ctx.stroke(buildShapePath({ ...e, kind: 'line' })); ctx.setLineDash([]); ctx.stroke(arrowHead(e)); } else ctx.stroke(p); }
      else ctx.stroke(p);
    }
  } else if (e.type === 'text') {
    const L = layoutText(e); ctx.font = textFont(e); ctx.fillStyle = e.color; ctx.textBaseline = 'top';
    let tx = e.x, ty = e.y;
    if (e.sticky) { // post-it
      const h = L.h, f = Math.min(26, e.w * 0.14);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3; ctx.fillStyle = e.bg || '#fde68a';
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.w, e.y); ctx.lineTo(e.x + e.w, e.y + h - f); ctx.lineTo(e.x + e.w - f, e.y + h); ctx.lineTo(e.x, e.y + h); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.moveTo(e.x + e.w, e.y + h - f); ctx.lineTo(e.x + e.w - f, e.y + h - f); ctx.lineTo(e.x + e.w - f, e.y + h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = e.color; tx += STICKY_PAD; ty += STICKY_PAD;
    } else if (e.bg) { ctx.fillStyle = e.bg; ctx.fillRect(e.x - 4, e.y - 2, e.w + 8, L.h + 4); ctx.fillStyle = e.color; }
    L.lines.forEach((ln, i) => ctx.fillText(ln, tx, ty + i * L.lh + e.size * 0.12));
  } else if (e.type === 'image') {
    const bmp = ImgCache.get(e.blobId);
    if (bmp) ctx.drawImage(bmp, e.x, e.y, e.w, e.h);
    else { ctx.fillStyle = 'rgba(120,130,150,.15)'; ctx.fillRect(e.x, e.y, e.w, e.h); }
  } else if (Plugins.renderers[e.type]) {
    try { Plugins.renderers[e.type](ctx, e); } catch (err) { console.warn(err); }
  }
  ctx.restore();
}

/* Desenha uma página (coordenadas locais da página já aplicadas no ctx) */
function drawPageContent(ctx, note, page, vis, z, opts = {}) {
  const bounded = note.mode !== 'infinite';
  const tpl = page.template || note.template;
  if (bounded) { ctx.fillStyle = page.pdf ? '#ffffff' : tpl.paper || '#fff'; ctx.fillRect(0, 0, page.w, page.h); }
  else { ctx.fillStyle = tpl.paper || '#fff'; ctx.fillRect(vis.x, vis.y, vis.w, vis.h); }
  if (page.pdf) {
    const bmp = opts.pdfBitmap || PdfCache.bitmap(page.pdf, z * (opts.dpr || 1));
    if (bmp) ctx.drawImage(bmp, 0, 0, page.w, page.h);
    if (page.template && page.template.type !== 'blank') drawTemplate(ctx, page.template, vis, z, bounded);
  } else drawTemplate(ctx, tpl, vis, z, bounded);
  for (const e of page.elements) {
    if (opts.skip && opts.skip.has(e.id)) continue;
    if (!rectsHit(elBBox(e), vis)) continue;
    drawElement(ctx, e);
  }
}

/* Renderiza uma página isolada num canvas (miniaturas, exportação) */
async function renderPageCanvas(note, page, scale, { maxW } = {}) {
  let region = { x: 0, y: 0, w: page.w, h: page.h };
  if (note.mode === 'infinite') {
    const b = bboxUnion(page.elements) || { x: 0, y: 0, w: 800, h: 1000 };
    const m = 40; region = { x: b.x - m, y: b.y - m, w: Math.max(400, b.w + 2 * m), h: Math.max(300, b.h + 2 * m) };
  }
  if (maxW) scale = maxW / region.w;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(region.w * scale)); cv.height = Math.max(1, Math.round(region.h * scale));
  const ctx = cv.getContext('2d');
  for (const e of page.elements) if (e.type === 'image') await ImgCache.load(e.blobId);
  let pdfBitmap = null; if (page.pdf) pdfBitmap = await PdfCache.render(page.pdf, Math.min(3, Math.max(scale, 0.5)));
  ctx.setTransform(scale, 0, 0, scale, -region.x * scale, -region.y * scale);
  drawPageContent(ctx, note, page, region, scale, { pdfBitmap });
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
  drawTemplate(ctx, tpl, { x: 0, y: 0, w, h }, s, true);
}

function arrowHead(e) {
  const p = new Path2D(), a = Math.atan2(e.y2 - e.y1, e.x2 - e.x1), L = Math.max(10, e.width * 4.5);
  p.moveTo(e.x2 - L * Math.cos(a - 0.45), e.y2 - L * Math.sin(a - 0.45)); p.lineTo(e.x2, e.y2); p.lineTo(e.x2 - L * Math.cos(a + 0.45), e.y2 - L * Math.sin(a + 0.45));
  return p;
}
