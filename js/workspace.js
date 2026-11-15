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

/* ---------- Tela dividida: outra nota (ou outra parte da mesma) ao lado, para ler enquanto escreve ---------- */
const SplitView = {
  note: null, zoom: 1, holders: [], io: null,
  get S() { return Store.settings; },
  pane() {
    let p = $('#splitPane'); if (p) return p;
    const B = (ic, title, fn) => { const b = el('button', { class: 'cbtn', title, onclick: fn }); b.innerHTML = icon(ic); return b; };
    p = el('aside', { id: 'splitPane', class: 'split-pane hidden' },
      el('div', { class: 'spl-grip', title: 'Arraste para mudar o tamanho' }),
      el('div', { class: 'spl-head' },
        el('button', { class: 'spl-title', title: 'Escolher outra nota', onclick: (e) => QuickSwitch.open(e.currentTarget, 'split') }, el('span', { id: 'splTitle' }, ''), el('i', { html: '▾' })),
        B('minus', 'Diminuir', () => this.setZoom(this.zoom / 1.25)), B('plus', 'Aumentar', () => this.setZoom(this.zoom * 1.25)),
        B('refresh', 'Trocar de lado (editar esta nota)', () => this.swap()), B('x', 'Fechar tela dividida', () => this.close())),
      el('div', { class: 'spl-scroll' }, el('div', { class: 'spl-pages' })));
    document.getElementById('app').append(p);
    this.wireResize(p.querySelector('.spl-grip')); this.wirePinch(p.querySelector('.spl-scroll'));
    p.querySelector('.spl-scroll').addEventListener('scroll', () => { clearTimeout(this._sT); this._sT = setTimeout(() => this.saveState(), 400); });
    return p;
  },
  async open(id) {
    const n = Editor.note && Editor.note.id === id ? Editor.note : await Store.getNote(id); if (!n) return toast('Nota não encontrada');
    this.note = n; this.zoom = this.S.split && this.S.split.id === id ? this.S.split.zoom || 1 : 1;
    const p = this.pane(); p.classList.remove('hidden'); this.applyWidth(); $('#splTitle').textContent = n.title;
    this.layout(this.S.split && this.S.split.id === id ? this.S.split.top : 0); this.saveState(); this.visible(true);
  },
  close() { this.free(); this.note = null; this.S.split = null; Store.saveSettings(); const p = $('#splitPane'); if (p) p.classList.add('hidden'); this.visible(false); },
  restore() { const s = this.S.split; if (s && Store.heads[s.id]) this.open(s.id).then(() => this.visible(!$('#editor').classList.contains('hidden'))); },
  /* só aparece junto do editor (na biblioteca fica escondida) */
  visible(on) {
    const p = $('#splitPane'), show = on && !!this.note;
    if (p) p.classList.toggle('hidden', !show); $('#editor').classList.toggle('split-on', show);
    document.documentElement.style.setProperty('--splitW', show ? this.width() + 'px' : '0px');
    if (typeof Editor !== 'undefined' && Editor.note) setTimeout(() => { Editor.resize(); }, 30);
  },
  width() { const w = (this.S.split && this.S.split.w) || 0.45; return Math.round(innerWidth * clamp(w, 0.25, 0.7)); },
  applyWidth() { document.documentElement.style.setProperty('--splitW', this.width() + 'px'); },
  saveState() { if (!this.note) return; const sc = $('#splitPane .spl-scroll'); this.S.split = { id: this.note.id, w: (this.S.split && this.S.split.w) || 0.45, zoom: this.zoom, top: sc ? sc.scrollTop / Math.max(1, sc.scrollHeight) : 0 }; Store.saveSettings(); },
  async swap() {
    if (!this.note || !Editor.note) return; const other = this.note.id, cur = Editor.note.id; if (other === cur) return toast('As duas metades já mostram esta nota');
    await App.openNote(other); await this.open(cur);
  },
  setZoom(z) { const sc = $('#splitPane .spl-scroll'), f = sc ? sc.scrollTop / Math.max(1, sc.scrollHeight) : 0; this.zoom = clamp(z, 0.5, 4); this.layout(f); this.saveState(); },
  free() { if (this.io) this.io.disconnect(); for (const h of this.holders) if (h.cv) { h.cv.width = h.cv.height = 0; h.cv.remove(); h.cv = null; } this.holders = []; clearInterval(this._live); },
  /* uma "folha" por página; o desenho só é feito para as que estão na tela (e liberado quando saem de perto) */
  layout(frac = 0) {
    this.free(); const n = this.note; if (!n) return;
    const box = $('#splitPane .spl-pages'), sc = $('#splitPane .spl-scroll'); box.innerHTML = '';
    const W = Math.max(120, (sc.clientWidth || this.width()) - 24) * this.zoom;
    box.style.width = W + 24 + 'px';
    this.io = new IntersectionObserver((ents) => { for (const en of ents) { const h = en.target._h; if (en.isIntersecting) this.paint(h); else if (h.cv) { h.cv.width = h.cv.height = 0; h.cv.remove(); h.cv = null; } } }, { root: sc, rootMargin: '120% 0px' });
    n.pages.forEach((page, i) => {
      const ar = n.mode === 'infinite' ? 1.4 : page.h / page.w, div = el('div', { class: 'spl-page', style: { width: W + 'px', height: Math.round(W * ar) + 'px' } }, el('span', { class: 'spl-num' }, n.mode === 'infinite' ? '' : String(i + 1)));
      const h = { div, page, i, cv: null, sig: null }; div._h = h; this.holders.push(h); box.append(div); this.io.observe(div);
    });
    requestAnimationFrame(() => { sc.scrollTop = frac * sc.scrollHeight; });
    clearInterval(this._live);
    this._live = setInterval(() => { // mesma nota dos dois lados: o que você escreve aparece aqui também
      if (!this.note || this.note !== Editor.note) return;
      for (const h of this.holders) if (h.cv && h.sig !== this.sig(h.page)) this.paint(h, true);
    }, 1500);
  },
  sig(p) { return Store.pageSigOf(p) + '|' + oid(p.template) + '|' + oid(p.pdf); },
  async paint(h, force) {
    if (h.busy || (h.cv && !force)) return; h.busy = true;
    try {
      const n = this.note, W = h.div.clientWidth, dpr = Math.min(2.5, devicePixelRatio || 1), sc = Math.min((W * dpr) / h.page.w, 2600 / h.page.w);
      const cv = await renderPageCanvas(n, h.page, sc); if (n !== this.note) { cv.width = 0; return; }
      cv.className = 'spl-cv'; if (h.cv) { h.cv.width = h.cv.height = 0; h.cv.remove(); } h.cv = cv; h.sig = this.sig(h.page); h.div.prepend(cv);
    } catch (e) { logError(e, 'tela dividida'); } finally { h.busy = false; }
  },
  wireResize(grip) {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId);
      const move = (ev) => { const w = clamp((innerWidth - ev.clientX) / innerWidth, 0.25, 0.7); this.S.split = { ...(this.S.split || {}), w }; this.applyWidth(); };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); this.saveState(); this.visible(true); this.layout($('#splitPane .spl-scroll').scrollTop / Math.max(1, $('#splitPane .spl-scroll').scrollHeight)); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
    });
  },
  /* pinça com dois dedos no painel: amplia/reduz a leitura */
  wirePinch(sc) {
    const pts = new Map(); let d0 = 0, z0 = 1;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    sc.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { d0 = dist(); z0 = this.zoom; } });
    sc.addEventListener('pointermove', (e) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2 && d0) { const k = dist() / d0; sc.firstChild.style.transform = `scale(${k})`; sc.firstChild.style.transformOrigin = 'top center'; } });
    const end = (e) => { if (!pts.has(e.pointerId)) return; if (pts.size === 2 && d0) { const k = dist() / d0; sc.firstChild.style.transform = ''; d0 = 0; this.setZoom(z0 * k); } pts.delete(e.pointerId); };
    sc.addEventListener('pointerup', end); sc.addEventListener('pointercancel', end);
    sc.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.01)); } }, { passive: false });
  },
};

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
    const appendPdf = () => { if (pdfBox) list.append(pdfBox); };
    renderMarks();
    box.append(el('div', { class: 'qs-head' }, el('h3', {}, 'Sumário')), list);
    openPop(anchor, box);
    // índice (outline) dos PDFs desta nota
    const blobs = [...new Set(n.pages.filter((p) => p.pdf).map((p) => p.pdf.blobId))];
    if (!blobs.length) return;
    pdfBox = el('div', {}, el('div', { class: 'qs-sec' }, 'Índice do PDF'), el('p', { class: 'qs-empty' }, 'Lendo o índice…')); appendPdf();
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
  snap(page, pts) {
    const B = this.boxes(page.pdf); if (!B || !B.length) return null;
    const P = []; for (let i = 0; i < pts.length; i += 3) P.push([pts[i], pts[i + 1]]);
    const hit = B.filter((b) => P.some(([x, y]) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - b.h * 0.15 && y <= b.y + b.h * 1.15)); if (!hit.length) return null;
    // agrupa por linha (mesma altura)
    hit.sort((a, b) => a.y - b.y); const lines = [];
    for (const b of hit) { const L = lines.find((l) => Math.abs(l.cy - (b.y + b.h / 2)) < Math.min(l.h, b.h) * 0.45); if (L) { L.items.push(b); L.h = Math.max(L.h, b.h); } else lines.push({ cy: b.y + b.h / 2, h: b.h, items: [b] }); }
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

/* ---------- Tela cheia (sem barras) e barras que somem enquanto você escreve ---------- */
const Focus = {
  on: false,
  ed() { return $('#editor'); },
  setIcon() { const b = $('#btnFull'); if (b) { b.innerHTML = icon(this.on ? 'unfull' : 'full'); b.title = this.on ? 'Sair da tela cheia' : 'Tela cheia (esconde as barras)'; } },
  toggle(v = !this.on) {
    this.on = v; const e = this.ed(); e.classList.toggle('immersive', v); e.classList.remove('peek'); this.setIcon();
    Store.settings.immersive = v; Store.saveSettings();
    // v0.15.1: no app instalado (APK/PWA) a tela já é cheia pelo sistema — mexer na "tela cheia do navegador" fazia a barra de
    // horário/bateria voltar ao sair e bagunçava o layout. Só usa esse recurso quando aberto numa aba comum do Chrome.
    const inTab = window.matchMedia && matchMedia('(display-mode: browser)').matches;
    if (inTab) try { if (v && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); else if (!v && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (_) {}
    if (v) toast('Tela cheia — para sair, toque no botão discreto no canto superior direito', 2600);
  },
  restore() {
    if (!$('#btnFullExit')) { const b = el('button', { id: 'btnFullExit', class: 'full-exit', title: 'Sair da tela cheia', onclick: () => this.toggle(false) }); b.innerHTML = icon('unfull'); this.ed().append(b); }
    if (Store.settings.immersive) { this.on = true; this.ed().classList.add('immersive'); } this.setIcon();
  },
  peek(ms = 4000) { const e = this.ed(); e.classList.add('peek'); clearTimeout(this._pT); this._pT = setTimeout(() => e.classList.remove('peek'), ms); },
  /* caneta encostou: esconde as barras (se a opção estiver ligada); voltam ~1,5 s depois de parar */
  writing() { if (Store.settings.hideWhileWriting === false || this.on) return; clearTimeout(this._wT); this.ed().classList.add('writing'); },
  writingEnd() { clearTimeout(this._wT); this._wT = setTimeout(() => this.ed().classList.remove('writing'), 2500); }, // volta ~2,5 s depois de parar de escrever
};
