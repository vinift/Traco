'use strict';
/* ===== PDF: importação (pdf.js), cache de renderização e exportação ===== */
const PdfCache = {
  lib: null, docs: new Map(), bmps: new Map(), pending: new Set(), onReady: null,
  async loadLib() {
    if (this.lib) return this.lib;
    const base = new URL('vendor/', document.baseURI).href;
    this.lib = await import(base + 'pdf.min.mjs');
    this.lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
    return this.lib;
  },
  doc(blobId) {
    if (!this.docs.has(blobId)) {
      this.docs.set(blobId, (async () => {
        const lib = await this.loadLib(); const blob = await Store.getBlob(blobId);
        if (!blob) throw new Error('PDF não encontrado');
        return lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      })());
    }
    return this.docs.get(blobId);
  },
  bucket(s) { return clamp(Math.pow(2, Math.ceil(Math.log2(Math.max(0.25, s)) * 2) / 2), 0.5, 2.83); },
  key(ref, b) { return ref.blobId + ':' + ref.index + ':' + b; },
  bitmap(ref, s) { // retorna o melhor bitmap disponível agora e agenda o ideal
    const b = this.bucket(s), k = this.key(ref, b);
    const hit = this.bmps.get(k);
    if (hit) { this.bmps.delete(k); this.bmps.set(k, hit); return hit; }
    this.want.set(k, performance.now());
    if (!this.pending.has(k)) { this.pending.add(k); this.queue.push([k, ref, b]); this.pump(); }
    let best = null, bestB = 0;
    for (const [kk, v] of this.bmps) { const [bid, idx, bb] = kk.split(':'); if (bid === ref.blobId && +idx === ref.index && +bb > bestB) { best = v; bestB = +bb; } }
    return best;
  },
  /* fila: no máximo 1 página do PDF sendo desenhada por vez, e só as que ainda estão na tela
     (rolar rápido por 200 páginas abria dezenas de desenhos ao mesmo tempo e estourava a memória) */
  queue: [], want: new Map(), running: 0,
  async pump() {
    if (this.running) return;
    while (this.queue.length) {
      this.queue.sort((x, y) => (this.want.get(y[0]) || 0) - (this.want.get(x[0]) || 0)); // o pedido mais recente primeiro
      const [k, ref, b] = this.queue.shift();
      if (performance.now() - (this.want.get(k) || 0) > 1500) { this.pending.delete(k); continue; } // saiu da tela: não desenha
      this.running++;
      try { await this.render(ref, b); this.onReady && this.onReady(); } catch (e) { console.warn(e); }
      finally { this.running--; this.pending.delete(k); }
    }
  },
  async render(ref, scale) {
    const b = scale, k = this.key(ref, b);
    if (this.bmps.has(k)) return this.bmps.get(k);
    this.busy++; try { return await this._render(ref, b, k); } finally { this.busy--; }
  },
  async _render(ref, b, k) {
    const doc = await this.doc(ref.blobId); const page = await doc.getPage(ref.index + 1);
    const vp = page.getViewport({ scale: (96 / 72) * b });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, canvas: cv, viewport: vp }).promise;
    this.bmps.set(k, cv); this.trim();
    return cv;
  },
  // com os blocos, o PDF renderizado só serve de fonte: 28 Mpx (~110 MB) bastam; antes eram 90 Mpx e estouravam a memória no tablet
  trim() { let px = 0; const ent = [...this.bmps.entries()]; for (let i = ent.length - 1; i >= 0; i--) { px += ent[i][1].width * ent[i][1].height; if (px > 28e6 && i < ent.length - 1) this.bmps.delete(ent[i][0]); } },
  clear() { // ao fechar a nota: libera bitmaps e documentos
    if (!this.busy && !this.pending.size) for (const cv of this.bmps.values()) { cv.width = 0; cv.height = 0; } // libera na hora (se nada estiver usando)
    this.bmps.clear(); this.queue = []; this.want.clear();
    clearTimeout(this._dT); this._dT = setTimeout(() => this.dropDocs(), 30000); // documentos: fecha depois, se nada mais estiver usando
  },
  busy: 0,
  dropDocs() {
    if (this.busy || this.pending.size || (typeof Editor !== 'undefined' && Editor.note)) return;
    for (const p of this.docs.values()) p.then((d) => d && d.destroy && d.destroy()).catch(() => {}); this.docs.clear();
  },
};

async function importPdfFile(file) {
  const lib = await PdfCache.loadLib();
  const buf = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  const blobId = await Store.putBlob(new Blob([buf], { type: 'application/pdf' }));
  PdfCache.docs.set(blobId, Promise.resolve(doc));
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i); const vp = p.getViewport({ scale: 96 / 72 });
    pages.push({ id: uid(), w: Math.round(vp.width), h: Math.round(vp.height), template: null, pdf: { blobId, index: i - 1 }, elements: [] });
  }
  return pages;
}

/* PDF mínimo com uma imagem JPEG por página */
async function buildPdfFromCanvases(list) { // list: [{canvas, wPx, hPx}]
  const enc = new TextEncoder(); const chunks = []; let off = 0; const offsets = [];
  const push = (d) => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); off += b.length; };
  const n = list.length; const obj = (i) => { offsets[i] = off; };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1); push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  const kids = list.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(2); push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);
  for (let i = 0; i < n; i++) {
    const { canvas, wPx, hPx } = list[i];
    const W = (wPx * 0.75).toFixed(2), H = (hPx * 0.75).toFixed(2);
    const jpg = new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
    const po = 3 + i * 3, co = po + 1, io = po + 2;
    obj(po); push(`${po} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${io} 0 R >> >> /Contents ${co} 0 R >>\nendobj\n`);
    const cs = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(co); push(`${co} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);
    obj(io); push(`${io} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
    push(jpg); push('\nendstream\nendobj\n');
  }
  const total = 3 + n * 3; const xref = off;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}
/* PDF em alta qualidade: páginas de PDF entram como o PDF original (vetorial, texto nítido) com as anotações por cima em 300 dpi;
   páginas de caderno viram imagem em 300 dpi. Sem o pdf-lib (ou em tela infinita) usa o gerador simples. */
const PDF_DPI = 300;
let _pdfLibP = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  return (_pdfLibP = _pdfLibP || new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('vendor/pdf-lib.min.js', document.baseURI).href; s.onload = () => (window.PDFLib ? res(window.PDFLib) : rej(new Error('pdf-lib'))); s.onerror = () => { _pdfLibP = null; rej(new Error('não consegui carregar o gerador de PDF')); }; document.head.append(s); }));
}
const canvasBytes = (cv, type, q) => new Promise((r) => cv.toBlob(async (b) => r(new Uint8Array(await b.arrayBuffer())), type, q));
async function exportNotePdf(note, onProgress, { shouldStop, dpi = PDF_DPI, jpegQ = 0.93, png = false, maxPx = 6000 } = {}) {
  let L = null; if (note.mode !== 'infinite') try { L = await loadPdfLib(); } catch (e) { console.warn(e); }
  if (!L) return exportNotePdfRaster(note, onProgress, { dpi, jpegQ, maxPx });
  const out = await L.PDFDocument.create(); out.setTitle(note.title || 'Nota'); out.setCreator('Traço Notas');
  const srcs = new Map(), k = dpi / 96; // pixels por unidade da página (a página é medida a 96 dpi)
  for (let i = 0; i < note.pages.length; i++) {
    onProgress && onProgress(i + 1, note.pages.length);
    if (shouldStop && shouldStop()) throw Object.assign(new Error('PDF adiado'), { deferred: true }); // você voltou a escrever: para e tenta depois
    const page = note.pages[i], wPt = page.w * 0.75, hPt = page.h * 0.75, sc = Math.min(k, maxPx / Math.max(page.w, page.h)); /* v0.29: qualidade escolhida na exportação (dpi, jpeg/png, limite) */
    let done = false;
    if (page.pdf) {
      try {
        // páginas do PDF original: copiadas todas de uma vez por arquivo (copyPages compartilha fontes e imagens).
        // Antes cada página era "embutida" à parte e o PDF de 4 MB virava 400–900 MB, estourando a memória do tablet.
        let src = srcs.get(page.pdf.blobId);
        if (src === undefined) {
          const blob = await Store.getBlob(page.pdf.blobId), doc = blob ? await L.PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), { ignoreEncryption: true }) : null;
          src = null;
          if (doc) {
            const idx = note.pages.filter((p) => p.pdf && p.pdf.blobId === page.pdf.blobId).map((p) => p.pdf.index).filter((x) => x < doc.getPageCount());
            const copies = await out.copyPages(doc, idx), q = new Map();
            idx.forEach((x, j) => { if (!q.has(x)) q.set(x, []); q.get(x).push(copies[j]); });
            src = q;
          }
          srcs.set(page.pdf.blobId, src);
        }
        const list = src && src.get(page.pdf.index), cp = list && list.shift();
        if (cp && !(cp.getRotation().angle % 360)) {
          const pg = out.addPage(cp), box = pg.getCropBox ? pg.getCropBox() : { x: 0, y: 0, ...pg.getSize() };
          const full = page.template && page.template.type !== 'blank';
          const bb = full ? { x: 0, y: 0, w: page.w, h: page.h } : bboxUnion(page.elements);
          if (bb) {
            // só o retângulo onde há escrita (não a página inteira), e a imagem é gravada já compactada (embed) para não acumular memória
            const m = 6, ax = Math.max(0, Math.floor(bb.x - m)), ay = Math.max(0, Math.floor(bb.y - m)), area = { x: ax, y: ay, w: Math.min(page.w, Math.ceil(bb.x + bb.w + m)) - ax, h: Math.min(page.h, Math.ceil(bb.y + bb.h + m)) - ay };
            if (area.w > 0 && area.h > 0) {
              const cv = await renderPageCanvas(note, page, sc, { annot: true, area });
              const png = await canvasBytes(cv, 'image/png'); cv.width = cv.height = 0; // libera a memória da imagem na hora
              const img = await out.embedPng(png), kx = box.width / page.w, ky = box.height / page.h;
              pg.drawImage(img, { x: box.x + area.x * kx, y: box.y + (page.h - area.y - area.h) * ky, width: area.w * kx, height: area.h * ky });
              if (img.embed) await img.embed();
            }
          }
          done = true;
        }
      } catch (e) { console.warn('PDF original não pôde ser copiado; usando imagem', e); }
    }
    if (!done) { // caderno (ou PDF que não deu para copiar): imagem nítida da página inteira
      const cv = await renderPageCanvas(note, page, sc);
      const bytes = await canvasBytes(cv, png ? 'image/png' : 'image/jpeg', jpegQ); cv.width = cv.height = 0; // libera a memória da imagem na hora
      const pg = out.addPage([wPt, hPt]), img = png ? await out.embedPng(bytes) : await out.embedJpg(bytes); pg.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt }); if (img.embed) await img.embed();
    }
    await new Promise((r) => setTimeout(r, 30)); // deixa a tela respirar
  }
  srcs.clear();
  return new Blob([await out.save()], { type: 'application/pdf' });
}
async function exportNotePdfRaster(note, onProgress, { dpi = PDF_DPI, maxPx = 5000 } = {}) {
  const list = [];
  for (let i = 0; i < note.pages.length; i++) {
    onProgress && onProgress(i + 1, note.pages.length);
    const page = note.pages[i]; const scale = Math.min(dpi / 96, maxPx / Math.max(page.w, page.h));
    const cv = await renderPageCanvas(note, page, scale);
    list.push({ canvas: cv, wPx: cv.width / scale, hPx: cv.height / scale });
  }
  return buildPdfFromCanvases(list);
}
