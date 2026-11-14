'use strict';
/* ===== Importação do Notewise (.notewise e .zip com pastas) =====
   Formato (descoberto a partir de um arquivo real): o .notewise é um ZIP com
   note (metadados), page/<id> (uma página cada) e image/<id> (imagens WebP).
   Os arquivos note/page são Protocol Buffers codificados em base64. */

/* ---- leitor de ZIP mínimo (usa a descompressão nativa do navegador) ---- */
async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (!buf.length) throw new Error('o arquivo chegou vazio (0 bytes). Se ele está no Google Drive ou em outro app, baixe para a pasta Downloads do tablet e importe de lá');
  const inflate = async (raw, method) => {
    if (method === 0) return raw;
    if (method !== 8) throw new Error('compressão ZIP não suportada (' + method + ')');
    const ds = new DecompressionStream('deflate-raw');
    return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
  };
  const files = {};
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd >= 0) { // caminho normal: diretório central no fim do arquivo
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    for (let k = 0; k < count && p + 46 <= buf.length; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
      if (name.endsWith('/') || off + 30 > buf.length) continue;
      const ln = dv.getUint16(off + 26, true), lx = dv.getUint16(off + 28, true), start = off + 30 + ln + lx;
      files[name] = { method, raw: buf.subarray(start, start + csize), bytes() { return inflate(this.raw, this.method); } };
    }
  }
  if (!Object.keys(files).length) { // sem diretório central (arquivo cortado ou gravado de outro jeito): lê os cabeçalhos locais em sequência
    let p = 0;
    while (p + 30 <= buf.length && dv.getUint32(p, true) === 0x04034b50) {
      const flags = dv.getUint16(p + 6, true), method = dv.getUint16(p + 8, true); let csize = dv.getUint32(p + 18, true);
      const nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true), start = p + 30 + nlen + xlen;
      const name = new TextDecoder().decode(buf.subarray(p + 30, p + 30 + nlen));
      let next;
      if ((flags & 8) && !csize) { // tamanho vem depois dos dados (descritor PK 07 08)
        let q = start; csize = -1;
        while (q + 16 <= buf.length) { if (dv.getUint32(q, true) === 0x08074b50 && dv.getUint32(q + 8, true) === q - start) { csize = q - start; break; } q++; }
        if (csize < 0) break;
        next = start + csize + 16;
      } else next = start + csize + ((flags & 8) ? (dv.getUint32(start + csize, true) === 0x08074b50 ? 16 : 12) : 0);
      if (!name.endsWith('/') && start + csize <= buf.length) files[name] = { method, raw: buf.subarray(start, start + csize), bytes() { return inflate(this.raw, this.method); } };
      p = next;
    }
  }
  if (!Object.keys(files).length) {
    const head = [...buf.subarray(0, 8)].map((v) => v.toString(16).padStart(2, '0')).join(' ');
    const looksText = buf.subarray(0, 200).every((v) => v === 9 || v === 10 || v === 13 || (v >= 32 && v < 127) || v >= 128);
    throw new Error(`o arquivo não é um ZIP válido (${(buf.length / 1024).toFixed(1)} KB, começa com ${head}${looksText ? ': parece texto, talvez uma página da web ou um link em vez do arquivo' : ''}). Tente baixar o arquivo para a pasta Downloads do tablet e importar de lá`);
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
const NW_TARGET_W = 1000; // largura das páginas de caderno importadas (as de PDF ficam no tamanho real do PDF)
const NW_PT = 300 / 72; // o Notewise usa 300 dpi: unidades por ponto tipográfico
const NW_PDF_S = 96 / 300; // páginas de PDF: unidades do Notewise → pixels do Traço (96 dpi)
const NW_DASH = { 1: 'solid', 2: 'long', 3: 'dot', 4: 'short', 5: 'dashdot', 6: 'mixed' };
/* fundo das páginas: campo 7 = densidade (6 → quadradinho de 100, 7 → 80…), campo 8 = tipo (1 = grade, 2 = linha, 3 = ponto, 4/5 = sem modelo) */
const NW_KIND = { 1: 'grid', 2: 'lines', 3: 'dots', 4: 'blank', 5: 'blank' };
const NW_DENSITY = { 6: 100, 7: 80 }; // medidos em PDFs do Notewise (folha 3480 × 4000)
function nwSpacing(d) { return NW_DENSITY[d] || clamp(220 - 20 * (d || 6), 40, 200); }
function nwTemplate(density, kind, bg, s) {
  const base = NOTEWISE_TEMPLATES[NW_KIND[kind] || 'grid']; // sem o tipo (notas importadas antes): grade
  const tpl = { ...base, paper: bg || '#ffffff', spacing: nwSpacing(density) * s, thickness: (base.type === 'dots' ? base.thickness : 0.95) * s / NW_SCALE, nwDensity: density };
  if (isDarkPaper(tpl.paper)) tpl.color = '#3a3a3a';
  return tpl;
}
const EMPTY = new Uint8Array();
const pbMsg = (fs, f) => pbParse(pbGet(fs, f) || EMPTY);
function nwRgba(c) { if (c.a >= 0.999) return c.hex; const n = parseInt(c.hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.round(c.a * 100) / 100})`; }
function nwRuns(body) { // texto rico do Notewise: trechos {texto, tamanho em pt, cor}
  return pbAll(body, 1).map((r) => { const q = pbParse(r); return { t: pbStr(pbGet(q, 1)), size: pbGet(q, 2) || 11, color: pbColor(pbGet(q, 3)).hex.toLowerCase() }; }).filter((r) => r.t);
}
function nwTextEl(runs, extra) {
  const text = runs.map((r) => r.t).join(''), color = (runs[0] && runs[0].color) || '#000000';
  const el = { id: uid(), type: 'text', text, color, bold: false, font: 'sys', ...extra };
  if (runs.length > 1 && runs.some((r) => r.color !== color)) el.spans = runs.map((r) => (r.color !== color ? { n: r.t.length, c: r.color } : { n: r.t.length }));
  return el;
}
async function convertNotewise(files, { folderId = null } = {}) {
  const meta = pbParse(b64bytes(await files.note.bytes()));
  const title = pbStr(pbGet(meta, 2)) || 'Nota do Notewise';
  const pageIds = pbAll(meta, 4).map(pbStr);
  const stats = { pages: 0, pdfPages: 0, strokes: 0, highlights: 0, shapes: 0, images: 0, texts: 0, tables: 0, skipped: 0 };
  // imagens e PDFs
  const imgMap = {}, pdfMap = {};
  for (const name of Object.keys(files)) {
    if (name.startsWith('image/')) {
      const id = name.slice(6), bytes = await files[name].bytes();
      const isWebp = bytes[8] === 0x57 && bytes[9] === 0x45, isPng = bytes[0] === 0x89, mime = isWebp ? 'image/webp' : isPng ? 'image/png' : 'image/jpeg';
      imgMap[id] = await Store.putBlob(new Blob([bytes], { type: mime }));
    } else if (name.startsWith('pdf/')) {
      pdfMap[name.slice(4)] = await Store.putBlob(new Blob([await files[name].bytes()], { type: 'application/pdf' }));
    }
  }
  const pages = [];
  const order = pageIds.length ? pageIds : Object.keys(files).filter((n) => n.startsWith('page/')).map((n) => n.slice(5));
  for (const pid of order) {
    const f = files['page/' + pid]; if (!f) continue;
    const P = pbParse(b64bytes(await f.bytes()));
    const setup = pbMsg(P, 6), size = pbMsg(setup, 1);
    const PW = pbGet(size, 3) || 3480, PH = pbGet(size, 4) || 4000;
    const ref = pbMsg(P, 3), pdfBlob = pdfMap[pbStr(pbGet(ref, 1))];
    const pdf = pdfBlob ? { blobId: pdfBlob, index: pbGet(ref, 2) || 0 } : null;
    const s = pdf ? NW_PDF_S : NW_TARGET_W / PW;
    const bg = pbColor(pbGet(setup, 2)).hex, tplCode = pbGet(setup, 7), tplVar = pbGet(setup, 8);
    const tpl = nwTemplate(tplCode, tplVar, bg, s);
    const page = { id: uid(), w: pdf ? Math.round(PW * s) : NW_TARGET_W, h: pdf ? Math.round(PH * s) : PH * s, template: pdf ? null : tpl, pdf, elements: [], nw: { tpl: tplCode, v: tplVar, pw: PW, ph: PH, fx: 2 } };
    if (pdf) stats.pdfPages++; // altura sem arredondar: a grade do modelo é centralizada pela altura exata
    for (const ev of pbAll(P, 4)) {
      const E = pbParse(ev), M = pbMatrix(pbGet(E, 3));
      const T = (x, y) => [(M[1] * x + M[2] * y + M[3]) * s, (M[4] * x + M[5] * y + M[6]) * s];
      const det = Math.sqrt(Math.abs(M[1] * M[5] - M[2] * M[4])) || 1, msx = Math.hypot(M[1], M[4]) || 1, msy = Math.hypot(M[2], M[5]) || 1;
      const stroke = pbGet(E, 4), hl = pbGet(E, 5), shape = pbGet(E, 6), img = pbGet(E, 7), tbox = pbGet(E, 8), table = pbGet(E, 11), comment = pbGet(E, 14);
      const locked = pbGet(E, 9) === 1;
      const n0 = page.elements.length;
      const box = (R) => { // retângulo {x1,y1,x2,y2} do Notewise → centro, largura, altura e giro já transformados
        const x1 = pbGet(R, 1) || 0, y1 = pbGet(R, 2) || 0, x2 = pbGet(R, 3) || 0, y2 = pbGet(R, 4) || 0;
        const a = T(x1, y1), b = T(x2, y1), c = T(x1, y2);
        return { cx: (b[0] + c[0]) / 2, cy: (b[1] + c[1]) / 2, w: Math.hypot(b[0] - a[0], b[1] - a[1]), h: Math.hypot(c[0] - a[0], c[1] - a[1]), rot: Math.atan2(b[1] - a[1], b[0] - a[0]), raw: [x1, y1, x2, y2] };
      };
      const pt = (v) => { const q = pbParse(v || EMPTY); return T(pbGet(q, 1) || 0, pbGet(q, 2) || 0); };
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
          // forma: 1 = cor da linha, 2 = espessura, 3 = preenchida, 4 = geometria, 5 = tipo de linha, 6 = cor do preenchimento
          const G = pbParse(shape), stc = pbColor(pbGet(G, 1)), w = Math.max(0.3, (pbGet(G, 2) || 4) * s * det);
          const filled = pbGet(G, 3) === 1, fillc = pbColor(pbGet(G, 6)), dash = NW_DASH[pbGet(G, 5)] || 'solid';
          const geo = pbParse(pbGet(G, 4) || EMPTY), gk = geo.length ? geo[0][0] : 0, gv = geo.length ? geo[0][2] : EMPTY;
          const baseEl = { id: uid(), type: 'shape', color: stc.hex, width: w, dash, fill: filled ? nwRgba(fillc) : null };
          if (gk === 1 || gk === 3) { // 1 = elipse, 3 = retângulo
            const b = box(pbMsg(pbParse(gv), 1));
            const el = { ...baseEl, kind: gk === 1 ? 'ellipse' : 'rect', x1: b.cx - b.w / 2, y1: b.cy - b.h / 2, x2: b.cx + b.w / 2, y2: b.cy + b.h / 2 };
            if (Math.abs(b.rot) > 0.001) el.rot = b.rot; page.elements.push(el);
          } else if (gk === 4 || gk === 14) { // 4 = linha, 14 = seta
            const L = pbParse(gv), a = pt(pbGet(L, 1)), b = pt(pbGet(L, 2));
            page.elements.push({ ...baseEl, kind: gk === 14 ? 'arrow' : 'line', fill: null, x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
          } else if (gk === 2) { // triângulo / polígono
            const q = []; for (const [, t, v] of pbParse(gv)) if (t === 2) q.push(...pt(v));
            if (q.length >= 6) page.elements.push({ ...baseEl, kind: 'poly', closed: true, pts: q });
          } else if (gk === 5) { // arco: retângulo da elipse + ângulo inicial + abertura (radianos)
            const A = pbParse(gv), R = pbMsg(A, 1), a0 = pbGet(A, 2) || 0, sw = pbGet(A, 3) || Math.PI;
            const x1 = pbGet(R, 1) || 0, y1 = pbGet(R, 2) || 0, x2 = pbGet(R, 3) || 0, y2 = pbGet(R, 4) || 0, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
            const q = []; const N = 32; for (let i = 0; i <= N; i++) { const t = a0 + (sw * i) / N; q.push(...T(cx + rx * Math.cos(t), cy + ry * Math.sin(t))); }
            page.elements.push({ ...baseEl, kind: 'poly', closed: false, fill: null, pts: q });
          } else { stats.skipped++; continue; }
          stats.shapes++;
        } else if (img) {
          const I = pbParse(img), refi = pbStr(pbGet(I, 1)), b = box(pbMsg(I, 2));
          if (imgMap[refi]) { const el = { id: uid(), type: 'image', x: b.cx - b.w / 2, y: b.cy - b.h / 2, w: b.w, h: b.h, blobId: imgMap[refi] }; if (Math.abs(b.rot) > 0.001) el.rot = b.rot; page.elements.push(el); stats.images++; }
          else stats.skipped++;
        } else if (tbox) { // caixa de texto
          const X = pbParse(tbox), R = pbMsg(X, 7), runs = nwRuns(pbMsg(X, 9));
          if (runs.length) {
            const x1 = pbGet(R, 1) || 0, y1 = pbGet(R, 2) || 0, x2 = pbGet(R, 3) || x1 + 500, [x, y] = T(x1, y1);
            const bw = Math.max(20, (x2 - x1) * s * msx); // largura automática (a fonte do aparelho pode ser um pouco mais larga que a do Notewise)
            page.elements.push(nwTextEl(runs, { x, y, w: bw, auto: true, maxW: bw * 1.15, size: Math.max(4, runs[0].size * NW_PT * s * msy) }));
            stats.texts++;
          } else stats.skipped++;
        } else if (comment) { // comentário → post-it
          const C = pbParse(comment), b = box(pbMsg(C, 1)), runs = nwRuns(pbMsg(C, 2)), bgc = pbColor(pbGet(C, 3)).hex;
          const el = nwTextEl(runs.length ? runs : [{ t: '', size: 12, color: '#000000' }], { sticky: true, bg: bgc, x: b.cx - b.w / 2, y: b.cy - b.h / 2, w: Math.max(60, b.w), minH: Math.max(40, b.h), size: Math.max(8, (runs[0] ? runs[0].size : 12) * NW_PT * s * msy) });
          page.elements.push(el); stats.texts++;
        } else if (table) { // tabela: posição, linhas e colunas (com alturas/larguras) e mesclagens
          const Tb = pbParse(table), bc = pbColor(pbGet(Tb, 1)).hex, P0 = pbMsg(Tb, 2);
          const rd = (f) => pbAll(Tb, f).map(pbParse).map((r) => ({ k: pbGet(r, 1) || 0, v: pbGet(r, 2) || 100, id: pbStr(pbGet(r, 4)) })).sort((a, b) => a.k - b.k);
          const cols = rd(8), rows = rd(9); // 8 = colunas (larguras), 9 = linhas (alturas)
          if (rows.length && cols.length) {
            const [x, y] = T(pbGet(P0, 1) || 0, pbGet(P0, 2) || 0);
            const colW = cols.map((c) => c.v * s * msx), rowH = rows.map((r) => r.v * s * msy);
            const merges = [];
            for (const mv of pbAll(Tb, 10)) {
              const m = pbParse(mv), sp = pbMsg(m, 4), c = cols.findIndex((q) => q.id === pbStr(pbGet(m, 5))), r = rows.findIndex((q) => q.id === pbStr(pbGet(m, 6)));
              let cs = pbGet(sp, 1) || 1, rs = pbGet(sp, 2) || 1;
              if (r < 0 || c < 0) continue;
              if (r + rs > rows.length || c + cs > cols.length) [rs, cs] = [cs, rs];
              if ((rs > 1 || cs > 1) && r + rs <= rows.length && c + cs <= cols.length) merges.push({ r, c, rs, cs });
            }
            const el = { id: uid(), type: 'table', x, y, w: colW.reduce((a, b) => a + b, 0), h: rowH.reduce((a, b) => a + b, 0), cols: cols.length, rows: rows.length, colW, rowH, hCol: pbGet(Tb, 3) === 1, hRow: pbGet(Tb, 4) === 1, bw: Math.max(1, (pbGet(Tb, 7) || 2) * NW_PT * s * 0.5), bc, fill: null };
            if (merges.length) el.merges = merges;
            page.elements.push(el); stats.tables++;
          } else stats.skipped++;
        } else stats.skipped++;
      } catch (err) { console.warn('elemento ignorado', err); stats.skipped++; }
      if (locked) for (let k = n0; k < page.elements.length; k++) page.elements[k].lock = true;
    }
    if (!pdf) nwAutoAlign(page);
    pages.push(page); stats.pages++;
  }
  if (!pages.length) throw new Error('nenhuma página encontrada');
  const note = newNote({ title, folderId, mode: 'pages', w: pages[0].w, h: pages[0].h, template: pages.find((p) => p.template)?.template || pages[0].template || NOTEWISE_TEMPLATES.blank });
  note.pages = pages; note.importedFrom = 'notewise';
  await Store.putNote(note);
  try { const t = await makeThumb(note); if (t) await Store.setThumb(note.id, t); } catch (e) { console.warn('miniatura', e); }
  return { note, stats };
}

/* corrige notas importadas antes da v0.8.6: descobre o tamanho original da página do Notewise e refaz a grade pela densidade
   (regra conferida na escrita das suas notas: quadradinho = 220 − 20 × densidade, grade centralizada na folha) */
const NW_SIZES = [[3480, 4000], [3500, 4000], [3480, 2408], [2480, 3508], [2478, 3507], [2479, 3506], [2125, 2952], [4960, 3508], [3480, 3000], [3480, 3600], [3980, 4000], [5000, 4000], [3200, 4000], [3600, 4000]];
function fixNotewiseHeights(note) {
  if (!note || note.importedFrom !== 'notewise') return false;
  let changed = false;
  for (const p of note.pages) {
    if (p.pdf || !p.nw || p.nw.tpl == null || (p.nw.fx || 0) >= 2) continue;
    let PW = p.nw.pw, PH = p.nw.ph;
    if (!PW) { let best = null; for (const [w, h] of NW_SIZES) { const d = Math.abs((h * NW_TARGET_W) / w - p.h); if (d < 1.2 && (!best || d < best.d)) best = { w, h, d }; } if (best) { PW = best.w; PH = best.h; } }
    p.nw.fx = 2; changed = true;
    if (!PW) continue; // tamanho desconhecido: deixa como está
    const s = NW_TARGET_W / PW; p.w = NW_TARGET_W; p.h = PH * s; p.nw.pw = PW; p.nw.ph = PH;
    const paper = (p.template && p.template.paper) || '#ffffff';
    p.template = nwTemplate(p.nw.tpl, p.nw.v, paper, s); // inclusive páginas que receberam modelo de PDF de outro tamanho
    nwAutoAlign(p);
  }
  return changed;
}
/* páginas redimensionadas no Notewise guardam a grade da folha original: mede a base das letras e desloca a grade para ela */
function nwAutoAlign(p) {
  const t = p.template; if (!t || !t.center || t.type === 'blank' || t.type === 'custom' || !p.nw || !p.nw.pw) return;
  const g = Editor.gridLines({ ...t, dy: 0 }, p, 1); if (!g) return;
  const sc = p.w / p.nw.pw; let c = 0, sn = 0, k = 0;
  for (const e of p.elements) {
    if (e.type !== 'stroke' || e.tool !== 'pen') continue;
    let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
    for (let i = 0; i < e.pts.length; i += 3) { const x = e.pts[i], y = e.pts[i + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const h = (y1 - y0) / sc; if (h < 15 || h > 70 || (x1 - x0) / sc > 200) continue; // só letras de tamanho normal
    const a = (2 * Math.PI * (y1 - g.o)) / g.s; c += Math.cos(a); sn += Math.sin(a); k++;
  }
  if (k < 60 || Math.hypot(c, sn) / k < 0.6) return; // pouca escrita ou sem padrão claro
  const dev = Math.atan2(sn, c) / (2 * Math.PI) + 0.02; // a base das letras fica ~2% acima da linha
  if (Math.abs(dev) > 0.1) t.dy = dev * g.s;
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
    let folderId = Library.folder || null;
    for (const seg of name.split('/').slice(0, -1).filter(Boolean)) { // pastas e subpastas do ZIP
      const key = folderId + '/' + seg;
      if (!folderIds[key]) {
        const ex = Store.folders.find((f) => f.name === seg && (f.parentId || null) === folderId);
        if (ex) folderIds[key] = ex.id;
        else { const f = { id: uid(), name: seg, parentId: folderId, color: FOLDER_COLORS[Store.folders.length % FOLDER_COLORS.length], created: Date.now() }; Store.folders.push(f); await Store.saveFolders(); folderIds[key] = f.id; }
      }
      folderId = folderIds[key];
    }
    try { const inner = await readZip(new Blob([await files[name].bytes()])); results.push(await convertNotewise(inner, { folderId })); }
    catch (e) { console.warn(name, e); results.push({ error: name.split('/').pop() + ': ' + e.message }); }
  }
  return results;
}
