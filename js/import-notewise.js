'use strict';
/* ===== Importação do Notewise (.notewise e .zip com pastas) =====
   Formato (descoberto a partir de um arquivo real): o .notewise é um ZIP com
   note (metadados), page/<id> (uma página cada) e image/<id> (imagens WebP).
   Os arquivos note/page são Protocol Buffers codificados em base64. */

/* ---- leitor de ZIP mínimo (usa a descompressão nativa do navegador) ---- */
async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer);
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('arquivo não é um ZIP válido');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    entries.push({ name, method, csize, off }); p += 46 + nlen + xlen + clen;
  }
  const files = {};
  for (const e of entries) {
    if (e.name.endsWith('/')) continue;
    const ln = dv.getUint16(e.off + 26, true), lx = dv.getUint16(e.off + 28, true), start = e.off + 30 + ln + lx;
    const raw = buf.subarray(start, start + e.csize);
    files[e.name] = { method: e.method, raw, async bytes() {
      if (this.method === 0) return this.raw;
      if (this.method !== 8) throw new Error('compressão ZIP não suportada');
      const ds = new DecompressionStream('deflate-raw');
      return new Uint8Array(await new Response(new Blob([this.raw]).stream().pipeThrough(ds)).arrayBuffer());
    } };
  }
  return files;
}

/* ---- leitor de Protocol Buffers sem esquema ---- */
function pbParse(b) {
  const out = []; let i = 0; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const varint = () => { let r = 0, s = 0, c; do { c = b[i++]; r += (c & 0x7f) * Math.pow(2, s); s += 7; } while (c >= 0x80); return r; };
  while (i < b.length) {
    const k = varint(), f = Math.floor(k / 8), t = k & 7; let v;
    if (t === 0) v = varint();
    else if (t === 1) { v = dv.getFloat64(i, true); i += 8; }
    else if (t === 5) { v = dv.getFloat32(i, true); i += 4; }
    else if (t === 2) { const L = varint(); v = b.subarray(i, i + L); i += L; }
    else throw new Error('protobuf inválido');
    out.push([f, t, v]);
  }
  return out;
}
const pbGet = (fs, f) => { const x = fs.find((y) => y[0] === f); return x ? x[2] : undefined; };
const pbAll = (fs, f) => fs.filter((y) => y[0] === f).map((y) => y[2]);
const pbStr = (v) => (v ? new TextDecoder().decode(v) : '');
const pbFloats = (v) => { if (!v) return []; const a = new Float32Array(v.byteLength / 4); new Uint8Array(a.buffer).set(v); return Array.from(a); };
const b64bytes = (u8) => { const s = atob(new TextDecoder().decode(u8).replace(/\s+/g, '')); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
function pbColor(v) { if (!v) return { hex: '#000000', a: 1 }; const c = pbParse(v); const a = pbGet(c, 2); return { hex: pbStr(pbGet(c, 1)) || '#000000', a: a == null ? 1 : a }; }
function pbMatrix(v) { // matriz 3x3 em linhas: x' = m1·x + m2·y + m3 ; y' = m4·x + m5·y + m6
  const m = { 1: 1, 2: 0, 3: 0, 4: 0, 5: 1, 6: 0 }; if (v) for (const [f, t, x] of pbParse(v)) if (t === 5) m[f] = x; return m;
}

/* ---- conversão de uma nota ---- */
const NW_TARGET_W = 1000; // largura das páginas importadas no Traço (mantém a proporção)
async function convertNotewise(files, { folderId = null } = {}) {
  const meta = pbParse(b64bytes(await files.note.bytes()));
  const title = pbStr(pbGet(meta, 2)) || 'Nota do Notewise';
  const pageIds = pbAll(meta, 4).map(pbStr);
  const stats = { pages: 0, strokes: 0, highlights: 0, shapes: 0, images: 0, skipped: 0 };
  // imagens
  const imgMap = {};
  for (const name of Object.keys(files)) if (name.startsWith('image/')) {
    const id = name.slice(6), bytes = await files[name].bytes();
    const isWebp = bytes[8] === 0x57 && bytes[9] === 0x45, isPng = bytes[0] === 0x89, mime = isWebp ? 'image/webp' : isPng ? 'image/png' : 'image/jpeg';
    imgMap[id] = await Store.putBlob(new Blob([bytes], { type: mime }));
  }
  const pages = [];
  const order = pageIds.length ? pageIds : Object.keys(files).filter((n) => n.startsWith('page/')).map((n) => n.slice(5));
  for (const pid of order) {
    const f = files['page/' + pid]; if (!f) continue;
    const P = pbParse(b64bytes(await f.bytes()));
    const setup = pbParse(pbGet(P, 6) || new Uint8Array());
    const size = pbParse(pbGet(setup, 1) || new Uint8Array());
    const PW = pbGet(size, 3) || 3480, PH = pbGet(size, 4) || 4000, s = NW_TARGET_W / PW;
    const bg = pbColor(pbGet(setup, 2)).hex, tplCode = pbGet(setup, 7);
    const tpl = { ...DEFAULT_TEMPLATE, paper: bg, type: tplCode === 6 ? 'grid' : 'blank', spacing: 26, color: '#c3ccd8', thickness: 0.8, top: 0, margin: false };
    const page = { id: uid(), w: NW_TARGET_W, h: Math.round(PH * s), template: tpl, pdf: null, elements: [], nw: { tpl: tplCode } };
    for (const ev of pbAll(P, 4)) {
      const E = pbParse(ev), M = pbMatrix(pbGet(E, 3));
      const T = (x, y) => [(M[1] * x + M[2] * y + M[3]) * s, (M[4] * x + M[5] * y + M[6]) * s];
      const det = Math.sqrt(Math.abs(M[1] * M[5] - M[2] * M[4])) || 1;
      const stroke = pbGet(E, 4), hl = pbGet(E, 5), shape = pbGet(E, 6), img = pbGet(E, 7);
      try {
        if (stroke) {
          const S = pbParse(stroke), w = pbGet(S, 2) || 4, col = pbColor(pbGet(S, 3));
          const xs = pbFloats(pbGet(S, 4)), ys = pbFloats(pbGet(S, 5)), ws = pbFloats(pbGet(S, 6));
          const pts = [];
          for (let i = 0; i < xs.length; i++) { const [x, y] = T(xs[i], ys[i]); const r = ws.length ? ws[i] / w : 1; pts.push(r2(x), r2(y), r2(clamp((r - 0.35) / 1.3, 0.02, 1))); }
          if (!pts.length) continue;
          const kind = pbGet(S, 1);
          if (col.a < 0.95 && kind !== 2) page.elements.push({ id: uid(), type: 'stroke', tool: 'highlighter', color: col.hex, width: w * s * det, opacity: col.a, pts: pts.map((v, i) => (i % 3 === 2 ? 0.5 : v)) });
          else page.elements.push({ id: uid(), type: 'stroke', tool: 'pen', color: col.hex, width: Math.max(0.3, w * s * det), opacity: col.a < 1 ? col.a : undefined, pts });
          stats.strokes++;
        } else if (hl) {
          const H = pbParse(hl), w = pbGet(H, 1) || 20, col = pbColor(pbGet(H, 2));
          const xs = pbFloats(pbGet(H, 3)), ys = pbFloats(pbGet(H, 4)), pts = [];
          for (let i = 0; i < xs.length; i++) { const [x, y] = T(xs[i], ys[i]); pts.push(r2(x), r2(y), 0.5); }
          if (pts.length) { page.elements.push({ id: uid(), type: 'stroke', tool: 'highlighter', color: col.hex, width: w * s * det, opacity: clamp(col.a, 0.15, 0.8), pts }); stats.highlights++; }
        } else if (shape) {
          const G = pbParse(shape), stc = pbColor(pbGet(G, 1)), w = (pbGet(G, 2) || 4) * s * det, geo = pbParse(pbGet(G, 4) || new Uint8Array());
          const filled = pbGet(G, 5) === 1, fillc = pbColor(pbGet(G, 6));
          const rect = pbGet(geo, 3), line = pbGet(geo, 4);
          if (rect) {
            const R = pbParse(pbGet(pbParse(rect), 1) || new Uint8Array()); const x1 = pbGet(R, 1), y1 = pbGet(R, 2), x2 = pbGet(R, 3), y2 = pbGet(R, 4);
            const a = T(x1, y1), b = T(x2, y1), c = T(x1, y2), wd = Math.hypot(b[0] - a[0], b[1] - a[1]), ht = Math.hypot(c[0] - a[0], c[1] - a[1]), rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
            const cx = (a[0] + b[0] + c[0] + (b[0] + c[0] - a[0])) / 4, cy = (a[1] + b[1] + c[1] + (b[1] + c[1] - a[1])) / 4;
            const el = { id: uid(), type: 'shape', kind: 'rect', x1: cx - wd / 2, y1: cy - ht / 2, x2: cx + wd / 2, y2: cy + ht / 2, color: stc.hex, width: w, fill: filled ? fillc.hex : null };
            if (Math.abs(rot) > 0.001) el.rot = rot; page.elements.push(el); stats.shapes++;
          } else if (line) {
            const L = pbParse(line), p1 = pbParse(pbGet(L, 1) || new Uint8Array()), p2 = pbParse(pbGet(L, 2) || new Uint8Array());
            const a = T(pbGet(p1, 1) || 0, pbGet(p1, 2) || 0), b = T(pbGet(p2, 1) || 0, pbGet(p2, 2) || 0);
            page.elements.push({ id: uid(), type: 'shape', kind: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], color: stc.hex, width: w, fill: null }); stats.shapes++;
          } else stats.skipped++;
        } else if (img) {
          const I = pbParse(img), ref = pbStr(pbGet(I, 1)), R = pbParse(pbGet(I, 2) || new Uint8Array());
          const x1 = pbGet(R, 1) || 0, y1 = pbGet(R, 2) || 0, x2 = pbGet(R, 3) || 100, y2 = pbGet(R, 4) || 100;
          const a = T(x1, y1), b = T(x2, y1), c = T(x1, y2), wd = Math.hypot(b[0] - a[0], b[1] - a[1]), ht = Math.hypot(c[0] - a[0], c[1] - a[1]), rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const cx = (b[0] + c[0]) / 2, cy = (b[1] + c[1]) / 2;
          if (imgMap[ref]) { const el = { id: uid(), type: 'image', x: cx - wd / 2, y: cy - ht / 2, w: wd, h: ht, blobId: imgMap[ref] }; if (Math.abs(rot) > 0.001) el.rot = rot; page.elements.push(el); stats.images++; }
          else stats.skipped++;
        } else stats.skipped++;
      } catch (err) { console.warn('elemento ignorado', err); stats.skipped++; }
    }
    pages.push(page); stats.pages++;
  }
  if (!pages.length) throw new Error('nenhuma página encontrada');
  const note = newNote({ title, folderId, mode: 'pages', w: pages[0].w, h: pages[0].h, template: pages[0].template });
  note.pages = pages; note.importedFrom = 'notewise';
  await Store.putNote(note);
  const t = await makeThumb(note); if (t) await Store.setThumb(note.id, t);
  return { note, stats };
}

/* ---- ponto de entrada: um .notewise ou um .zip com várias notas e pastas ---- */
async function importNotewiseFile(file, onProgress) {
  const files = await readZip(file);
  if (files.note) return [await convertNotewise(files, { folderId: Library.folder })];
  // ZIP exportado com várias notas: cada .notewise vira uma nota; as pastas viram pastas
  const list = Object.keys(files).filter((n) => /\.notewise$/i.test(n));
  if (!list.length) throw new Error('não encontrei notas do Notewise dentro do arquivo');
  const results = [], folderIds = {};
  for (let k = 0; k < list.length; k++) {
    const name = list[k]; onProgress && onProgress(k + 1, list.length, name);
    const dir = name.split('/').slice(0, -1).filter(Boolean).join(' / ');
    let folderId = Library.folder;
    if (dir) {
      if (!folderIds[dir]) { const ex = Store.folders.find((f) => f.name === dir); if (ex) folderIds[dir] = ex.id; else { const f = { id: uid(), name: dir }; Store.folders.push(f); await Store.saveFolders(); folderIds[dir] = f.id; } }
      folderId = folderIds[dir];
    }
    try { const inner = await readZip(new Blob([await files[name].bytes()])); results.push(await convertNotewise(inner, { folderId })); }
    catch (e) { console.warn(name, e); results.push({ error: name.split('/').pop() + ': ' + e.message }); }
  }
  return results;
}
