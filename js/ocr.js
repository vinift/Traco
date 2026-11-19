'use strict';
/* ===== Reconhecimento de escrita à mão (lê os traços da caneta, não uma imagem) ===== */
const OCR = {
  URLS: ['https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8',
    'https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8'],
  get lang() { return (Store.settings.ocr && Store.settings.ocr.lang) || 'pt_BR'; },
  enabled() { return !(Store.settings.ocr && Store.settings.ocr.enabled === false); },

  /* Agrupa traços em linhas de escrita (pela sobreposição vertical) */
  groupLines(strokes) {
    const items = strokes.filter((e) => e.type === 'stroke' && e.tool === 'pen').map((e) => ({ e, b: elBBox(e) })).filter((o) => o.b.w + o.b.h > 0.5);
    if (!items.length) return [];
    const hs = items.map((o) => o.b.h).sort((a, b) => a - b), med = hs[Math.floor(hs.length / 2)] || 20;
    // encadeia da esquerda para a direita: cada traço entra na linha cujo último traço está perto (segue linhas inclinadas)
    items.sort((a, b) => a.b.x - b.b.x);
    const lines = [], gapX = med * 4;
    for (const o of items) {
      const cy = o.b.y + o.b.h / 2; let best = null, bd = Infinity;
      for (const L of lines) {
        const last = L.tail, ly = last.b.y + last.b.h / 2, dx = o.b.x - (last.b.x + last.b.w);
        if (dx > gapX) continue;
        const dy = Math.abs(cy - ly), lim = Math.max(med * 0.8, Math.min(o.b.h, last.b.h) * 0.7);
        if (dy < lim && dy + Math.max(0, dx) * 0.05 < bd) { best = L; bd = dy + Math.max(0, dx) * 0.05; }
      }
      if (best) { best.items.push(o); if (o.b.x + o.b.w >= best.tail.b.x + best.tail.b.w) best.tail = o; best.y1 = Math.min(best.y1, o.b.y); best.y2 = Math.max(best.y2, o.b.y + o.b.h); best.h = best.y2 - best.y1; }
      else lines.push({ items: [o], tail: o, y1: o.b.y, y2: o.b.y + o.b.h, h: o.b.h });
    }
    // junta pedaços da mesma linha separados por espaços largos entre palavras
    lines.forEach((L) => { L.x1 = Math.min(...L.items.map((o) => o.b.x)); L.x2 = Math.max(...L.items.map((o) => o.b.x + o.b.w)); L.tailY = L.tail.b.y + L.tail.b.h / 2; });
    let merged = true;
    while (merged) {
      merged = false; lines.sort((a, b) => a.x1 - b.x1);
      for (let i = 0; i < lines.length; i++) {
        const A = lines[i]; if (A.dead) continue;
        for (let j = i + 1; j < lines.length; j++) {
          const B = lines[j]; if (B.dead) continue;
          const gap = B.x1 - A.x2; if (gap > med * 22) continue;
          const ov = Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1), mh = Math.min(A.h, B.h);
          let same;
          if (gap < 0) same = ov >= mh * 0.5 && Math.abs((A.y1 + A.y2) / 2 - (B.y1 + B.y2) / 2) < Math.max(med, mh * 0.6); // intercalados
          else { const headY = B.items[0].b.y + B.items[0].b.h / 2; same = ov >= mh * 0.45 && Math.abs(headY - A.tailY) < Math.max(med, mh * 0.6); }
          if (same) {
            A.items.push(...B.items); A.x2 = Math.max(A.x2, B.x2); A.y1 = Math.min(A.y1, B.y1); A.y2 = Math.max(A.y2, B.y2); A.h = A.y2 - A.y1;
            if (B.x2 >= A.x2 - 0.5) { A.tail = B.tail; A.tailY = B.tailY; } B.dead = true; merged = true;
          }
        }
      }
      for (let k = lines.length - 1; k >= 0; k--) if (lines[k].dead) lines.splice(k, 1);
    }
    for (let k = lines.length - 1; k >= 0; k--) if (lines[k].dead) lines.splice(k, 1);
    // pingos, acentos e til soltos vão para a linha mais próxima
    for (let k = lines.length - 1; k >= 0; k--) {
      const T = lines[k]; if (T.items.length > 2 || T.h > med * 0.9) continue;
      let best = null, bd = Infinity; const cx = (T.x1 + T.x2) / 2, cy = (T.y1 + T.y2) / 2;
      for (const L of lines) { if (L === T || L.items.length < 3 || cx < L.x1 - med || cx > L.x2 + med) continue; const d = cy < L.y1 ? L.y1 - cy : cy > L.y2 ? cy - L.y2 : 0; if (d < med * 1.6 && d < bd) { bd = d; best = L; } }
      if (best) { best.items.push(...T.items); best.y1 = Math.min(best.y1, T.y1); best.y2 = Math.max(best.y2, T.y2); best.h = best.y2 - best.y1; lines.splice(k, 1); }
    }
    for (const L of lines) { L.items.sort((a, b) => a.b.x - b.b.x); L.x1 = Math.min(...L.items.map((o) => o.b.x)); L.x2 = Math.max(...L.items.map((o) => o.b.x + o.b.w)); }
    return lines.sort((a, b) => a.y1 - b.y1);
  },
  /* Reconhece uma linha (pode ter várias palavras) */
  async recognizeLine(L) {
    const ox = L.x1, oy = L.y1; let t = 0; const ink = [];
    for (const { e } of L.items) {
      const xs = [], ys = [], ts = [], p = e.pts, step = Math.max(1, Math.floor(p.length / 3 / 120)); // no máx. ~120 pontos por traço
      for (let i = 0; i < p.length; i += 3 * step) { xs.push(Math.round(p[i] - ox)); ys.push(Math.round(p[i + 1] - oy)); ts.push(t); t += 12; }
      t += 150; if (xs.length) ink.push([xs, ys, ts]);
    }
    const body = JSON.stringify({ options: 'enable_pre_space', requests: [{ writing_guide: { writing_area_width: Math.round(L.x2 - L.x1) + 10, writing_area_height: Math.round(L.h) + 10 }, ink, language: this.lang, max_num_results: 1, max_completions: 0 }] });
    let lastErr;
    for (const url of this.URLS) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (j[0] !== 'SUCCESS') throw new Error(String(j[0]));
        return ((j[1] && j[1][0] && j[1][0][1]) || [])[0] || '';
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Falha no reconhecimento');
  },
  async recognize(strokes) { return (await this.recognizeLines(strokes)).text; },
  /* texto + posição de cada linha (a busca usa para destacar onde a palavra está escrita) */
  async recognizeLines(strokes) {
    const groups = this.groupLines(strokes), lines = [];
    for (const L of groups) { const t = await this.recognizeLine(L); if (t.trim()) lines.push({ t, x: Math.round(L.x1), y: Math.round(L.y1), w: Math.round(L.x2 - L.x1), h: Math.round(L.h) }); }
    return { text: lines.map((l) => l.t).join('\n'), lines };
  },
  OCR_V: 2, // v2 guarda as linhas com posição; páginas lidas antes são relidas aos poucos

  /* ---- Índice para a busca: lê as páginas em segundo plano ---- */
  queue: [], busy: false,
  pageSig(p) { const s = p.elements.filter((e) => e.type === 'stroke' && e.tool === 'pen'); return s.length + ':' + s.map((e) => e.id).join(',').length + ':' + (s.length ? s[s.length - 1].id : ''); },
  scheduleNote(note) {
    if (!this.enabled() || !navigator.onLine || !note) return;
    for (const p of note.pages) {
      const sig = this.pageSig(p);
      if (sig.startsWith('0:')) continue;
      if ((!p.ocr || p.ocr.sig !== sig || p.ocr.v !== this.OCR_V) && !this.queue.some((q) => q.pageId === p.id)) this.queue.push({ noteId: note.id, pageId: p.id });
    }
    this.run();
  },
  async live(noteId) { return Editor.note && Editor.note.id === noteId ? Editor.note : Store.getNote(noteId); }, // sempre a cópia mais nova
  async run() {
    if (this.busy) return; this.busy = true; this.lastError = null;
    try {
      while (this.queue.length) {
        const q = this.queue.shift();
        if (Editor.note && Editor.note.id === q.noteId && Editor.action) { this.queue.push(q); await sleep(1500); continue; }
        let note = await this.live(q.noteId), page = note && note.pages.find((p) => p.id === q.pageId); if (!page) continue;
        const sig = this.pageSig(page); if (page.ocr && page.ocr.sig === sig && page.ocr.v === this.OCR_V) continue;
        let r;
        try { r = await this.recognizeLines(page.elements); } catch (e) { console.warn('OCR', e); this.lastError = e.message; this.queue = []; break; }
        note = await this.live(q.noteId); page = note && note.pages.find((p) => p.id === q.pageId); if (!page || this.pageSig(page) !== sig) continue;
        page.ocr = { sig, text: r.text, lines: r.lines, v: this.OCR_V, at: Date.now() };
        if (Editor.note === note) Editor.saveDebounced(); else if (Store.heads[note.id]) await Store.putNote(note); /* v0.30: nota que foi para a Lixeira não volta */
        await sleep(400);
      }
    } finally { this.busy = false; }
  },
  async indexAll(onProgress) {
    const ids = Object.keys(Store.heads); let k = 0;
    for (const id of ids) {
      const note = await this.live(id); if (!note) continue;
      this.scheduleNote(note); while (this.busy || this.queue.length) await sleep(300);
      if (this.lastError) throw new Error(this.lastError);
      onProgress && onProgress(++k, ids.length);
    }
  },
};

/* ===== Endireitar a escrita (alinhar na horizontal) ===== */
function straightenSelection() {
  const els = Editor.selElements(), page = Editor.pageById(Editor.sel.pageId);
  const lines = OCR.groupLines(els); if (!lines.length) return toast('Selecione escrita feita com a caneta');
  let changed = 0;
  for (const L of lines) {
    // inclinação pela regressão linear dos pontos da linha
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const { e } of L.items) for (let i = 0; i < e.pts.length; i += 3) { const x = e.pts[i], y = e.pts[i + 1]; n++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const den = n * sxx - sx * sx; if (!den) continue;
    const slope = (n * sxy - sx * sy) / den, ang = Math.atan(slope);
    if (Math.abs(ang) < 0.004 || Math.abs(ang) > 0.6) continue;
    const cx = (L.x1 + L.x2) / 2, cy = (L.y1 + L.y2) / 2;
    for (const { e } of L.items) { const cur = page.elements.find((x) => x.id === e.id); if (cur) { Editor.recReplace(page, cur, rotateEl(cur, -ang, cx, cy)); changed++; } }
  }
  Editor.opCommit();
  toast(changed ? `Escrita alinhada (${lines.length} linha${lines.length > 1 ? 's' : ''})` : 'A escrita já está reta', 1600);
}

/* ===== Reconhecer texto da seleção: copiar ou converter em caixa de texto ===== */
async function recognizeSelection() {
  const els = Editor.selElements(), page = Editor.pageById(Editor.sel.pageId);
  const strokes = els.filter((e) => e.type === 'stroke' && e.tool === 'pen');
  if (!strokes.length) return toast('Selecione escrita feita com a caneta');
  if (!navigator.onLine) return toast('O reconhecimento precisa de internet');
  toast('Reconhecendo escrita…', 8000);
  let text;
  try { text = await OCR.recognize(strokes); } catch (e) { return toast('Não foi possível reconhecer: ' + e.message, 5000); }
  toast('', 1);
  const ta = el('textarea', { style: { width: '100%', height: '160px', fontSize: '16px', fontFamily: 'inherit' } }); ta.value = text;
  const del = el('input', { type: 'checkbox' }); del.checked = true;
  const body = el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Texto reconhecido (você pode corrigir antes de usar)'), ta),
    el('label', { class: 'chk' }, del, 'Ao converter, apagar a escrita à mão original'));
  const copy = async () => {
    try { await navigator.clipboard.writeText(ta.value); toast('Texto copiado'); }
    catch (_) { ta.focus(); ta.select(); try { document.execCommand('copy'); toast('Texto copiado'); } catch (__) { toast('Selecione o texto e use Copiar do teclado'); } }
    return false;
  };
  const res = await openModal({ title: 'Texto da escrita', body, wide: true, buttons: [{ label: 'Fechar', value: null }, { label: 'Copiar', action: copy }, { label: 'Converter em texto', cls: 'primary', value: 'convert' }] });
  if (res !== 'convert' || !ta.value.trim()) return;
  const b = bboxUnion(strokes), lines = OCR.groupLines(strokes);
  const lh = lines.length ? lines.reduce((s, L) => s + L.h, 0) / lines.length : 24;
  const size = clamp(Math.round(lh * 0.62), 10, 72);
  const tel = { id: uid(), type: 'text', x: b.x, y: b.y, w: Math.max(b.w, 80), text: ta.value.trim(), size, color: strokes[0].color, bold: false };
  if (del.checked) for (const e of strokes) Editor.recRemove(page, e);
  Editor.recAdd(page, tel); Editor.opCommit();
  Editor.sel = { pageId: page.id, ids: new Set([tel.id]) }; Editor.requestRender();
}
