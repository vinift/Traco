'use strict';
/* ===== Área de trabalho: alternar rapidamente, tela dividida, sumário da nota e marca-texto que gruda no PDF ===== */

/* ---------- Alternar rapidamente (fixadas + recentes) ---------- */
const QuickSwitch = {
  get S() { return Store.settings; },
  pinned() { return (this.S.pinned || []).filter((id) => Store.heads[id]); },
  recent() { const p = new Set(this.pinned()); return (this.S.recent || []).filter((id) => Store.heads[id] && !p.has(id)).slice(0, 12); },
  touch(id) { const r = (this.S.recent || []).filter((x) => x !== id); r.unshift(id); this.S.recent = r.slice(0, 20); Store.saveSettings(); },
  isPinned(id) { return (this.S.pinned || []).includes(id); },
  pin(id, on = !this.isPinned(id)) {
    const p = (this.S.pinned || []).filter((x) => x !== id); if (on) p.push(id); this.S.pinned = p; Store.saveSettings();
    toast(on ? 'Fixada em Alternar rapidamente' : 'Desafixada', 1200);
  },
  forget(id) { this.S.recent = (this.S.recent || []).filter((x) => x !== id); Store.saveSettings(); },
  /* painel lateral. mode 'open' abre a nota no editor; 'split' abre na tela dividida */
  open(anchor, mode = 'open') {
    closePop();
    const root = $('#popRoot'), back = el('div', { class: 'pop-back' }), panel = el('div', { class: 'qs-panel' });
    back.addEventListener('pointerdown', () => closePop()); root.append(back, panel);
    const render = () => {
      panel.innerHTML = '';
      const close = el('button', { class: 'cbtn qs-x', title: 'Fechar', onclick: () => closePop() }); close.innerHTML = icon('x');
      panel.append(el('div', { class: 'qs-head' }, el('h3', {}, mode === 'split' ? 'Abrir ao lado' : 'Alternar rapidamente'), close));
      const cur = Editor.note && Editor.note.id;
      const row = (id, pinned) => {
        const h = Store.heads[id], more = el('button', { class: 'cbtn qs-more', title: 'Opções' }); more.innerHTML = icon('more');
        const acts = el('div', { class: 'qs-acts hidden' },
          el('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); this.pin(id); render(); } }, pinned ? 'Desafixar' : 'Fixar'),
          mode === 'split' ? null : el('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); closePop(); SplitView.open(id); } }, 'Abrir ao lado'),
          pinned ? null : el('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); this.forget(id); render(); } }, 'Tirar dos recentes'));
        more.onclick = (e) => { e.stopPropagation(); acts.classList.toggle('hidden'); };
        const item = el('div', { class: 'qs-item' + (id === cur ? ' cur' : ''), 'data-id': id },
          el('div', { class: 'qs-thumb' }, h.thumb ? el('img', { src: h.thumb, alt: '' }) : null),
          el('div', { class: 'qs-title' }, h.title, el('small', {}, `${h.pages || 1} pág.`)),
          pinned ? el('span', { class: 'qs-grip', title: 'Arraste para reordenar', html: '⋮⋮' }) : null, more);
        item.addEventListener('click', () => { closePop(); if (mode === 'split') SplitView.open(id); else if (id !== cur) App.openNote(id); });
        if (pinned) this.dragSort(item, item.querySelector('.qs-grip'));
        return el('div', { class: 'qs-wrap' }, item, acts);
      };
      const P = this.pinned(), R = this.recent();
      panel.append(el('div', { class: 'qs-sec' }, 'Fixadas'));
      const pl = el('div', { class: 'qs-list', id: 'qsPinned' }); P.forEach((id) => pl.append(row(id, true)));
      if (!P.length) pl.append(el('p', { class: 'qs-empty' }, 'Toque em ⋯ numa nota (aqui ou na biblioteca) e escolha "Fixar".'));
      panel.append(pl, el('div', { class: 'qs-sec' }, 'Recentes'));
      const rl = el('div', { class: 'qs-list' }); R.forEach((id) => rl.append(row(id, false)));
      if (!R.length) rl.append(el('p', { class: 'qs-empty' }, 'As notas que você abrir aparecem aqui.'));
      panel.append(rl);
    };
    render();
    openPop._close = null;
  },
  /* reordenar fixadas arrastando a alça ⋮⋮ */
  dragSort(item, grip) {
    if (!grip) return;
    grip.addEventListener('click', (e) => e.stopPropagation());
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); grip.setPointerCapture(e.pointerId);
      const wrap = item.parentElement, list = wrap.parentElement; wrap.classList.add('dragging');
      const move = (ev) => {
        const sibs = [...list.children].filter((x) => x !== wrap && x.classList.contains('qs-wrap'));
        const after = sibs.find((x) => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
        if (after) list.insertBefore(wrap, after); else list.append(wrap);
      };
      const up = () => {
        grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); wrap.classList.remove('dragging');
        this.S.pinned = [...list.querySelectorAll('.qs-item')].map((x) => x.dataset.id); Store.saveSettings();
      };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
  },
};

/* v0.25: a tela dividida foi para js/split.js (lado ativo) */

/* ---------- Sumário: marcadores com nome + índice dos PDFs ---------- */
const Outline = {
  async open(anchor) {
    const n = Editor.note; if (!n) return;
    if (n.mode === 'infinite') return toast('Notas em tela infinita não têm páginas');
    const box = el('div', { class: 'ol-box' }), list = el('div', { class: 'ol-list' });
    const go = (i) => { closePop(); Editor.goToPage(i); };
    const renderMarks = () => {
      list.innerHTML = '';
      list.append(el('div', { class: 'qs-sec' }, 'Marcadores'));
      const marks = n.pages.map((p, i) => [p, i]).filter(([p]) => p.bookmark);
      if (!marks.length) list.append(el('p', { class: 'qs-empty' }, 'Marque páginas com o botão 🔖 (ou "Marcar página" abaixo) e dê um nome para achar rápido.'));
      for (const [p, i] of marks) {
        const ren = el('button', { class: 'cbtn', title: 'Renomear' }); ren.innerHTML = icon('pen');
        const del = el('button', { class: 'cbtn', title: 'Remover marcador' }); del.innerHTML = icon('x');
        ren.onclick = async (e) => { e.stopPropagation(); closePop(); const t = await askText('Nome do marcador', p.bmName || '', `Página ${i + 1}`); if (t !== undefined && t !== false) { p.bmName = t; Editor.markChanged(); } Outline.open(anchor); };
        del.onclick = (e) => { e.stopPropagation(); p.bookmark = false; delete p.bmName; Editor.markChanged(); Editor.updateHud(); renderMarks(); appendPdf(); };
        list.append(el('div', { class: 'ol-item mark', onclick: () => go(i) }, el('span', { class: 'ol-pg' }, String(i + 1)), el('span', { class: 'ol-t' }, p.bmName || `Página ${i + 1}`), ren, del));
      }
      const cp = Editor.currentPageIndex(), curP = n.pages[cp];
      if (curP && !curP.bookmark) list.append(el('button', { class: 'btn ol-add', onclick: async () => { const t = await askText('Marcar a página ' + (cp + 1), `Página ${cp + 1}`, 'Nome do marcador (ex.: Art. 5º)'); if (t === undefined) return; curP.bookmark = true; curP.bmName = t || ''; Editor.markChanged(); Editor.updateHud(); Outline.open(anchor); } }, '🔖 Marcar a página atual (' + (cp + 1) + ')'));
    };
    let pdfBox = null;
    /* v0.32: tópicos automáticos (autotoc.js); tocar vai até o ponto e destaca o título */
    const topicBox = typeof AutoToc !== 'undefined' ? AutoToc.section(n, (it) => { closePop(); Editor.flashRects(it.pi, [it.rect], true); }) : null;
    const appendPdf = () => { if (topicBox) list.append(topicBox); if (pdfBox) list.append(pdfBox); };
    renderMarks(); if (topicBox) list.append(topicBox);
    box.append(el('div', { class: 'qs-head' }, el('h3', {}, 'Sumário')), list);
    openPop(anchor, box);
    // índice (outline) dos PDFs desta nota
    const blobs = [...new Set(n.pages.filter((p) => p.pdf).map((p) => p.pdf.blobId))];
    if (!blobs.length) return;
    pdfBox = el('div', {}, el('div', { class: 'qs-sec' }, 'Índice do PDF'), el('p', { class: 'qs-empty' }, 'Lendo o índice…')); list.append(pdfBox);
    try {
      const rows = [];
      for (const b of blobs) {
        const doc = await PdfCache.doc(b), ol = await doc.getOutline(); if (!ol) continue;
        const walk = async (items, lv) => { for (const it of items) { if (rows.length > 400) return; let pi = -1; try { let d = it.dest; if (typeof d === 'string') d = await doc.getDestination(d); if (Array.isArray(d)) { const ref = d[0]; const idx = typeof ref === 'number' ? ref : await doc.getPageIndex(ref); pi = n.pages.findIndex((p) => p.pdf && p.pdf.blobId === b && p.pdf.index === idx); } } catch (_) {} rows.push([it.title, lv, pi]); if (it.items && it.items.length) await walk(it.items, lv + 1); } };
        await walk(ol, 0);
      }
      pdfBox.lastChild.remove();
      if (!rows.length) pdfBox.append(el('p', { class: 'qs-empty' }, 'Este PDF não tem índice.'));
      for (const [t, lv, pi] of rows) pdfBox.append(el('div', { class: 'ol-item' + (pi < 0 ? ' off' : ''), style: { paddingLeft: 10 + lv * 16 + 'px' }, onclick: () => pi >= 0 && go(pi) }, el('span', { class: 'ol-t' }, t), el('span', { class: 'ol-pg' }, pi >= 0 ? String(pi + 1) : '—')));
    } catch (e) { pdfBox.lastChild.textContent = 'Não consegui ler o índice do PDF.'; logError(e, 'sumário'); }
  },
};

/* ---------- Marca-texto que gruda nas linhas do texto do PDF ---------- */
const PdfText = {
  cache: new Map(),
  key(ref) { return ref.blobId + ':' + ref.index; },
  /* começa a ler o texto da página (chamado ao encostar o marca-texto) */
  prefetch(ref) {
    const k = this.key(ref); if (this.cache.has(k)) return;
    const job = (async () => {
      const vl = typeof Tec !== 'undefined' && (await Tec.virtLines(ref)); /* v1.23: caderno montado do TEC — só o texto visível */
      if (vl) { const out = []; for (const [, y, h, segs] of vl) for (const s of segs) out.push({ x: s[1], y, w: s[2], h }); this.cache.set(k, out); return out; }
      const doc = await PdfCache.doc(ref.blobId), pg = await doc.getPage(ref.index + 1), vp = pg.getViewport({ scale: 96 / 72 }), tc = await pg.getTextContent();
      const lib = await PdfCache.loadLib(), out = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const t = lib.Util.transform(vp.transform, it.transform), h = Math.hypot(t[2], t[3]); if (Math.abs(t[1]) > 0.01 * h) continue; // só texto na horizontal
        out.push({ x: t[4], y: t[5] - h * 0.86, w: it.width * vp.scale, h: h * 1.12 });
      }
      this.cache.set(k, out); if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value);
      return out;
    })().catch(() => this.cache.set(k, []));
    this.cache.set(k, job);
  },
  boxes(ref) { const v = this.cache.get(this.key(ref)); return Array.isArray(v) ? v : null; },
  /* devolve as faixas retas (uma por linha de texto) ou null se não der para grudar */
  snap(page, pts) { const B = this.boxes(page.pdf); return B && B.length ? this.snapBoxes(B, pts) : null; },
  /* v1.17: mesma conta para a escrita à mão — caixas = palavras da caneta (Editor.wordsOf), na altura do miolo das letras */
  snapInk(page, pts) {
    if (typeof Editor === 'undefined' || !Editor.wordsOf) return null;
    let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity; for (let i = 0; i < pts.length; i += 3) { x1 = Math.min(x1, pts[i]); x2 = Math.max(x2, pts[i]); y1 = Math.min(y1, pts[i + 1]); y2 = Math.max(y2, pts[i + 1]); }
    if (x2 - x1 < (y2 - y1) * 1.2) return null; /* só traços deitados (circular/riscar na vertical continua livre) */
    const B = Editor.wordsOf(page).filter((w) => w.x2 >= x1 - 40 && w.x1 <= x2 + 40 && w.y2 >= y1 - 40 && w.y1 <= y2 + 40).map((w) => { const h = w.hm * 1.25; return { x: w.x1, w: w.x2 - w.x1, y: w.cy - h / 2, h }; });
    if (!B.length) return null;
    const n = pts.length, close = Math.hypot(pts[0] - pts[n - 3], pts[1] - pts[n - 2]) < (x2 - x1) * 0.3; let len = 0; for (let i = 3; i < n; i += 3) len += Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2]);
    if (close && len > (x2 - x1) * 2) return null; /* contorno fechado (circulou a palavra): fica como desenhado */
    const out = this.snapBoxes(B, pts); if (!out) return null;
    for (const o of out) for (const w of B) { if (Math.abs(w.y + w.h / 2 - o.y) > w.h * 0.45) continue; /* começa/termina no meio de uma palavra → pega a palavra inteira */
      if (o.x1 > w.x && o.x1 < w.x + w.w) o.x1 = w.x; if (o.x2 > w.x && o.x2 < w.x + w.w) o.x2 = w.x + w.w; }
    /* v1.17.2: pedaços da mesma linha com o centro um pouco diferente (palavras lidas em linhas separadas) viram uma faixa só */
    out.sort((p, q) => p.x1 - q.x1); for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) { const p = out[i], q = out[j]; if (Math.abs(p.y - q.y) < Math.max(p.h, q.h) * 0.6) { const lp = p.x2 - p.x1, lq = q.x2 - q.x1; p.y = (p.y * lp + q.y * lq) / (lp + lq); p.h = Math.max(p.h, q.h); p.x1 = Math.min(p.x1, q.x1); p.x2 = Math.max(p.x2, q.x2); out.splice(j--, 1); } }
    for (const o of out) o.ink = 1;
    try { this._last = { t: Date.now(), stroke: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)], words: B.map((b) => [Math.round(b.x), Math.round(b.y + b.h / 2), Math.round(b.w), Math.round(b.h)]), out: out.map((o) => [Math.round(o.x1), Math.round(o.x2), Math.round(o.y * 10) / 10]), ink: page.elements.filter((e) => e.type === 'stroke' && e.tool === 'pen').map((e) => [elBBox(e), e.color]).filter(([b]) => b.x + b.w >= x1 - 60 && b.x <= x2 + 60 && b.y + b.h >= y1 - 80 && b.y <= y2 + 80).slice(0, 400).map(([b, c]) => [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h), c]) }; } catch (_) {} /* v1.18.1: vai no relatório de problema */ /* v1.17.1: na escrita a espessura é a do marca-texto (só a posição gruda) */
    const cov = out.reduce((s, o) => s + o.x2 - o.x1, 0); return cov >= (x2 - x1) * 0.5 ? out : null; /* a faixa tem de cobrir boa parte do traço */
  },
  snapBoxes(B, pts) {
    const P = []; for (let i = 0; i < pts.length; i += 3) P.push([pts[i], pts[i + 1]]);
    const hit = B.filter((b) => P.some(([x, y]) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - b.h * 0.15 && y <= b.y + b.h * 1.15)); if (!hit.length) return null;
    // agrupa por linha (mesma altura)
    hit.sort((a, b) => a.y - b.y); const lines = [];
    for (const b of hit) { const L = lines.find((l) => Math.abs(l.cy - (b.y + b.h / 2)) < Math.min(l.h, b.h) * 0.45); if (L) { L.items.push(b); L.h = Math.max(L.h, b.h); L.sw += b.w; L.sy += (b.y + b.h / 2) * b.w; L.cy = L.sy / L.sw; } else lines.push({ cy: b.y + b.h / 2, h: b.h, items: [b], sw: b.w, sy: (b.y + b.h / 2) * b.w }); } /* v1.17.4: altura da linha = média das caixas (pela largura); antes ficava a da 1ª caixa, a MAIS ALTA (lista em ordem de y) */
    const out = [];
    for (const L of lines) {
      const band = P.filter(([, y]) => Math.abs(y - L.cy) <= L.h * 0.7); if (band.length < 2 && lines.length > 1) continue;
      const xs = (band.length ? band : P).map((p) => p[0]); let x1 = Math.min(...xs), x2 = Math.max(...xs);
      const tx1 = Math.min(...L.items.map((b) => b.x)), tx2 = Math.max(...L.items.map((b) => b.x + b.w));
      x1 = Math.max(x1, tx1); x2 = Math.min(x2, tx2); if (x2 - x1 < 2) continue;
      if (x1 - tx1 < L.h * 0.8) x1 = tx1; if (tx2 - x2 < L.h * 0.8) x2 = tx2; // perto do começo/fim da linha: completa
      out.push({ x1, x2, y: L.cy, h: L.h });
    }
    return out.length ? out : null;
  },
};

/* ---------- v0.28: busca dentro do PDF importado ----------
   Na 1ª busca, o texto de cada página do PDF é lido (pdf.js getTextContent) e guardado em linhas com a posição de cada pedaço
   (meta 'pdftxt:<blobId>'), então as próximas buscas são instantâneas. Resultado = faixa amarela sobre o trecho na página. */
const normCh = (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || ' ';
const PdfFind = {
  idx: new Map(), /* blobId → { pages: {index: [[texto, y, h, [[início, x, w, tamanho], …]], …]}, dirty } */
  async index(blobId) {
    let I = this.idx.get(blobId); if (I) return I;
    I = (await DB.get('meta', 'pdftxt:' + blobId)) || { v: 1, pages: {} }; I.dirty = 0; this.idx.set(blobId, I); return I;
  },
  async save(blobId) { const I = this.idx.get(blobId); if (!I || !I.dirty) return; I.dirty = 0; const { dirty, ...data } = I; try { await DB.put('meta', data, 'pdftxt:' + blobId); } catch (e) { logError(e, 'índice do PDF'); } },
  async readPage(ref) {
    if (typeof Tec !== 'undefined') { const v = await Tec.virtLines(ref); if (v) return v; } /* v1.23: caderno montado do TEC */
    const I = await this.index(ref.blobId); if (I.pages[ref.index]) return I.pages[ref.index];
    const doc = await PdfCache.doc(ref.blobId), pg = await doc.getPage(ref.index + 1), out = await this.pageLines(pg);
    I.pages[ref.index] = out; I.dirty++; if (I.dirty >= 40) this.save(ref.blobId); return out;
  },
  /* v1.23: linhas de texto de uma página do pdf.js (também usado por Tec.build, com PDFs que ainda não são nota) */
  async pageLines(pg) {
    const vp = pg.getViewport({ scale: 96 / 72 }), tc = await pg.getTextContent(), lib = await PdfCache.loadLib();
    const items = [];
    for (const it of tc.items) { if (!it.str || !it.str.trim()) continue; const t = lib.Util.transform(vp.transform, it.transform), h = Math.hypot(t[2], t[3]); if (Math.abs(t[1]) > 0.01 * h) continue; items.push({ s: it.str, x: t[4], y: t[5] - h * 0.86, w: it.width * vp.scale, h: h * 1.12 }); }
    items.sort((a, b) => a.y - b.y || a.x - b.x); const lines = [];
    for (const it of items) { const L = lines.find((l) => Math.abs(l.cy - (it.y + it.h / 2)) < Math.min(l.h, it.h) * 0.5); if (L) { L.its.push(it); L.h = Math.max(L.h, it.h); L.y = Math.min(L.y, it.y); } else lines.push({ cy: it.y + it.h / 2, y: it.y, h: it.h, its: [it] }); }
    const out = lines.map((L) => { L.its.sort((a, b) => a.x - b.x); let t = '', segs = [], end = -Infinity; for (const it of L.its) { if (t && it.x - end > L.h * 0.2 && !t.endsWith(' ')) t += ' '; segs.push([t.length, Math.round(it.x * 10) / 10, Math.round(it.w * 10) / 10, it.s.length]); t += it.s; end = it.x + it.w; } return [t, Math.round(L.y * 10) / 10, Math.round(L.h * 10) / 10, segs]; });
    return out;
  },
  /* ocorrências de q numa página lida: [{rect, line}] */
  findIn(lines, q) {
    const nq = [...q].map(normCh).join(''), out = []; if (!nq.trim()) return out;
    for (const [t, y, h, segs] of lines) {
      const nt = [...t].map(normCh).join(''); let k = nt.indexOf(nq);
      while (k >= 0 && out.length < 30) {
        const at = (i) => { let sg = segs[0]; for (const s of segs) if (s[0] <= i) sg = s; const f = Math.min(1, Math.max(0, (i - sg[0]) / Math.max(1, sg[3]))); return sg[1] + sg[2] * f; };
        const x1 = at(k), x2 = at(k + nq.length); out.push({ rect: { x: x1 - 2, y: y - 1, w: Math.max(6, x2 - x1 + 4), h: h + 2 }, line: t, at: k }); k = nt.indexOf(nq, k + 1);
      }
    }
    return out;
  },
  /* percorre as páginas com PDF da nota; onHit(páginaDaNota, ocorrências) e onProgress(feitas, total) a cada página */
  async search(note, q, onHit, onProgress, token) {
    const todo = note.pages.map((p, i) => [p, i]).filter(([p]) => p.pdf); let done = 0, blobs = new Set();
    for (const [p, i] of todo) {
      if (token.stop) break; blobs.add(p.pdf.blobId);
      let lines; try { lines = await this.readPage(p.pdf); } catch (e) { lines = []; }
      const hits = this.findIn(lines, q); if (hits.length && !token.stop) onHit(i, hits);
      done++; if (onProgress && (done % 10 === 0 || done === todo.length)) onProgress(done, todo.length);
      if (done % 20 === 0) await new Promise((r) => setTimeout(r, 0)); /* deixa a tela respirar */
    }
    for (const b of blobs) this.save(b);
    return todo.length;
  },
};

/* ---------- Tela cheia (sem barras) e barras que somem enquanto você escreve ---------- */
const Focus = {
  on: false,
  ed() { return $('#editor'); },
  setIcon() { const b = $('#btnFull'); if (b) { b.innerHTML = icon(this.on ? 'unfull' : 'full'); b.title = this.on ? 'Sair da tela cheia' : 'Tela cheia (esconde as barras)'; } },
  toggle(v = !this.on) {
    this.on = v; const e = this.ed(); e.classList.toggle('immersive', v); e.classList.toggle('noglass', Store.settings.glassBars === false); /* v1.36: barras em vidro na tela cheia */ e.classList.remove('peek'); this.setIcon();
    Store.settings.immersive = v; Store.saveSettings();
    // v0.15.1: no app instalado (APK/PWA) a tela já é cheia pelo sistema — mexer na "tela cheia do navegador" fazia a barra de
    // horário/bateria voltar ao sair e bagunçava o layout. Só usa esse recurso quando aberto numa aba comum do Chrome.
    const inTab = window.matchMedia && matchMedia('(display-mode: browser)').matches && !Native.on; /* v1.0: o app nativo já é tela cheia */
    if (inTab) try { if (v && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); else if (!v && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (_) {}
    if (v) hint('full', 'Tela cheia — toque duas vezes numa área vazia (ou no botão do canto) para sair', 2600);
  },
  /* v0.29: escrevendo (barras escondidas), um toque de DEDO no topo — onde ficam as barras — traz tudo de volta na hora */
  initTopTap() {
    if (this._topTap) return; this._topTap = true;
    this.ed().addEventListener('pointerdown', (e) => {
      const ed = this.ed(); if (e.pointerType !== 'touch') return;
      const bar = document.querySelector('#editor .ch-topright') || document.querySelector('#editor .ch-topleft'), lim = bar ? bar.getBoundingClientRect().bottom + 14 : 90;
      if (e.clientY > lim) return;
      if (ed.classList.contains('immersive')) { /* v1.36.1: na tela cheia, um toque (sem arrastar) no topo também sai dela — menos no tempo/relógio e no botão do canto */
        if (e.target.closest && e.target.closest('.note-timer,.note-clock,#btnFullExit')) return;
        this._tt = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; return;
      }
      if (!ed.classList.contains('writing')) return;
      clearTimeout(this._wT); ed.classList.remove('writing'); e.preventDefault(); e.stopPropagation(); this._eat = performance.now();
    }, true);
    this.ed().addEventListener('pointerup', (e) => {
      const t = this._tt; this._tt = null; if (!t || t.id !== e.pointerId || !this.on) return;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10 || performance.now() - t.t > 450) return;
      e.preventDefault(); e.stopPropagation(); this.toggle(false); this._eat = performance.now();
    }, true);
    /* v1.36.4: o clique desse mesmo toque não aciona o botão que acabou de reaparecer (voltar, páginas…) — só o próximo toque */
    addEventListener('click', (e) => { if (this._eat && performance.now() - this._eat < 700) { this._eat = 0; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  },
  restore() {
    this.initTopTap();
    if (!$('#btnFullExit')) { const b = el('button', { id: 'btnFullExit', class: 'full-exit', title: 'Sair da tela cheia', onclick: () => this.toggle(false) }); b.innerHTML = icon('unfull'); this.ed().append(b); }
    this.ed().classList.toggle('noglass', Store.settings.glassBars === false); if (Store.settings.immersive) { this.on = true; this.ed().classList.add('immersive'); } this.setIcon();
  },
  peek(ms = 4000) { const e = this.ed(); e.classList.add('peek'); clearTimeout(this._pT); this._pT = setTimeout(() => e.classList.remove('peek'), ms); },
  /* caneta encostou: esconde as barras (se a opção estiver ligada); voltam ~1,5 s depois de parar */
  writing() { if (Store.settings.hideWhileWriting === false || this.on) return; clearTimeout(this._wT); this.ed().classList.add('writing'); },
  writingEnd() { clearTimeout(this._wT); this._wT = setTimeout(() => this.ed().classList.remove('writing'), (+Store.settings.writeHideSec || 2.5) * 1000); }, // v0.24.7: tempo ajustável (Configurações → Aparência e barras; padrão 2,5 s)
};
