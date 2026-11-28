'use strict';
/* ===== Editor: câmera, entrada (caneta/dedo), ferramentas e desenho ===== */
const GAP = 28;
const Editor = {
  note: null, cam: { x: 0, y: 0, z: 1 }, W: 0, H: 0, dpr: 1, layout: [], maxW: 0, totalH: 0,
  tool: 'pen', undoStack: [], redoStack: [], curOp: null,
  pointers: new Map(), action: null, gesture: null, lastPenSeen: 0, penDown: false,
  sel: null, selTf: null, clip: null, editingId: null, textEl: null, needs: false, desk: '#d9dde3', readOnly: false, penBtns: 0,

  init() {
    this.stage = $('#stage'); this.cMain = $('#cMain'); this.cLive = $('#cLive'); this.overlay = $('#overlay');
    // Baixa latência: o canvas principal (opaco) fica "dessincronizado" e a tinta da caneta é desenhada direto nele.
    // Um canvas transparente dessincronizado deixava a tela preta em alguns tablets Android.
    this.lowLat = Store.settings.lowLatency === true;
    this.ctx = this.cMain.getContext('2d', { alpha: true }); // transparente: os blocos da página ficam por baixo
    // v0.15 baixa latência: só a TINTA vai numa tela "rápida" (dessincronizada), mostrada apenas enquanto a caneta escreve.
    // Rolar e dar zoom usam a camada normal — antes a tela inteira era dessincronizada e piscava ao mexer.
    if (this.lowLat) {
      this.cInk = document.createElement('canvas'); this.cInk.id = 'cInk'; this.cInk.style.display = 'none'; this.cMain.after(this.cInk);
      try { this.ictx = this.cInk.getContext('2d', { alpha: false, desynchronized: true }); } catch (_) { this.ictx = this.cInk.getContext('2d', { alpha: false }); }
    }
    this.lctx = this.cLive.getContext('2d');
    for (const ev of ['pointermove', 'pointerdown']) this.stage.addEventListener(ev, (e) => { if (e.pointerType !== 'touch' && this._liveOff) this.liveOn(); }, { capture: true, passive: true }); /* v0.58.3 */
    this.initPenTriple();
    // o Android pode descartar a memória de desenho (app em segundo plano, memória cheia): refaz tudo em vez de ficar em branco
    for (const c of [this.cMain, this.cLive]) {
      c.addEventListener('contextlost', (ev) => { ev.preventDefault(); logError('contexto do canvas perdido (memória)', 'canvas'); });
      c.addEventListener('contextrestored', () => { this.resetTiles(); PdfCache.bmps.clear(); this.resize(true); this.requestRender(); });
    }
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (!this.note) return;
      if (Date.now() - hiddenAt > 20000) { this.resetTiles(); PdfCache.bmps.clear(); } // voltou depois de um tempo: blocos podem ter sido descartados
      this.resize(true); this.requestRender();
    });
    const s = this.stage;
    s.addEventListener('pointerdown', (e) => this.onDown(e));
    s.addEventListener('pointermove', (e) => this.onMove(e));
    /* v0.22: pointerrawupdate entrega os pontos da caneta assim que chegam (o pointermove espera o próximo quadro): a tinta sai mais colada na ponta */
    if ('onpointerrawupdate' in window) s.addEventListener('pointerrawupdate', (e) => this.onRaw(e));
    s.addEventListener('pointerup', (e) => this.onUp(e));
    s.addEventListener('pointercancel', (e) => this.onUp(e, true));
    s.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    new ResizeObserver(() => { if (this.note) { this.resize(); } }).observe(s);
    setTimeout(() => { const ro = new ResizeObserver(() => { this._mg = null; }); for (const id of ['rail', 'subrail']) { const n = document.getElementById(id); if (n) ro.observe(n); } }, 0); /* barras mudaram: margens medidas de novo */
    ImgCache.onReady = () => { this.imgEpoch = (this.imgEpoch || 0) + 1; this.requestRender(); };
    PdfCache.onReady = () => this.requestRender();
    window.addEventListener('keydown', (e) => this.onKey(e));
    // atalhos dos botões da caneta (capturados antes de tudo)
    for (const t of ['pointerdown', 'pointermove', 'pointerup']) window.addEventListener(t, (e) => this.penButtons(e), true);
    window.addEventListener('contextmenu', (e) => { if (e.pointerType === 'pen' && (this.note || PenCapture.active)) { e.preventDefault(); this.firePenSig('pen:ctx'); } }, true);
    this.saveDebounced = debounce(() => this.saveNow(), 900);
    this.thumbDebounced = debounce(() => this.updateThumb(), 8000);
    this.viewDebounced = debounce(() => this.saveView(), 1500);
    this.ocrDebounced = debounce(() => OCR.scheduleNote(this.note), 12000);
  },

  /* ---------- Abrir / salvar ---------- */
  /* pre (v0.25, tela dividida): { note, cam, undo, redo, fast } — troca de lado ativo sem recarregar a nota nem perder o desfazer */
  async open(id, pre) {
    const note = (pre && pre.note) || await Store.getNote(id); if (!note) { toast('Nota não encontrada'); return false; }
    this.resetTiles(); this._prevZ = undefined; this.lastInput = Date.now(); // nota recém-aberta conta como "em uso" (o backup pesado espera)
    { const L = Store.settings.tools.lasso; if (L && L.mode === 'shot') L.mode = 'free'; }
    if (this.crop) this.cancelCrop(); this.note = note; this._mg = null; this.undoStack = (pre && pre.undo) || []; this.redoStack = (pre && pre.redo) || []; this.sel = null; this.selTf = null; this.action = null; this.editingId = null;
    this.readOnly = false; $('#editor').classList.remove('reading'); { const rb = $('#btnRead'); if (rb) rb.classList.remove('soft-on'); }
    $('#noteTitle').value = note.title;
    this.desk = getComputedStyle(document.documentElement).getPropertyValue('--desk').trim() || '#d9dde3';
    this.computeLayout(); this.resize(true); Store.compactLater(note);
    if (pre && pre.cam) { this.cam = { x: pre.cam.x, y: pre.cam.y, z: pre.cam.z }; this.clampCam(); }
    else { const views = (await DB.get('meta', 'views')) || {}; const v = views[note.id] || note.view; /* continua de onde parou */ if (v) { this.cam = { ...v }; this.clampCam(); } else { this.fitWidth(); this._fitAfter = true; } }
    if (!(pre && pre.fast)) { applyBarSize(); UI.buildToolbar(); UI.renderOptions(); }
    this._mg = null; if (this._fitAfter) { this._fitAfter = false; this.fitWidth(); } else this.clampCam(); /* margens medidas com as barras já montadas */
    this.updateUndoBtns(); Instruments.sync(); Focus.restore(); setTimeout(() => this.placeScroll(), 80);
    this.requestRender();
    return true;
  },
  async close() {
    if (Native.on) { Native.inkClear('all'); this._natPend = null; }
    try { this.commitText(); } catch (e) { logError(e, 'fechar: texto'); }
    this.ocrDebounced.cancel(); this.viewDebounced.cancel(); this.thumbDebounced.cancel && this.thumbDebounced.cancel();
    try { await this.saveView(); await this.saveNow(); } catch (e) { logError(e, 'fechar: salvar'); toast('Não consegui salvar a nota: ' + e.message, 4000); }
    const note = this.note;
    try { if (note) { const t = await makeThumb(note); if (t) await Store.setThumb(note.id, t); } } catch (e) { logError(e, 'fechar: miniatura'); }
    try { Instruments.hideAll(); } catch (e) { logError(e, 'fechar: instrumentos'); }
    if (this.crop) this.cancelCrop();
    this.note = null; this.sel = null; this.selTf = null; this.action = null; this.gesture = null; this.stopInertia();
    this.resetTiles(); PdfCache.clear(); ImgCache.clear(); PathLRU.clear(); // libera a memória dos blocos, do PDF e das imagens
    for (const c of [this.cMain, this.cLive, this.cInk]) if (c) { c.width = 1; c.height = 1; } this._inkKey = null; clearTimeout(this._mainT); clearTimeout(this._liveIdleT); this._mainT = this._liveIdleT = null; this._mainOff = this._liveOff = false; /* v0.34: as 3 telas do editor (~50 MB no Pad 7) não ficam ocupando memória com a nota fechada; open() → resize() refaz */
    if (note) OCR.scheduleNote(note);
  },
  /* v0.25 (tela dividida): solta a nota sem o trabalho pesado do close() — salva em segundo plano e devolve a "folha" com os
     blocos que estão na tela (o lado passivo mostra essa imagem até as páginas dele ficarem prontas) */
  detach() {
    try { this.commitText(); } catch (e) { logError(e, 'trocar lado: texto'); }
    this.ocrDebounced.cancel(); this.viewDebounced.cancel(); this.thumbDebounced.cancel && this.thumbDebounced.cancel();
    if (this.crop) this.cancelCrop();
    const note = this.note; if (!note) return null;
    const cam = { ...this.cam }, page = this.currentPageIndex();
    this.saveNow().catch((e) => logError(e, 'trocar lado: salvar')); /* lê nota e título agora, grava depois */
    DB.get('meta', 'views').then((v) => { v = v || {}; v[note.id] = { ...cam, page, at: Date.now() }; return DB.put('meta', v, 'views'); }).catch(() => {});
    this.sel = null; this.selTf = null; this.action = null; this.gesture = null; this.stopInertia(); this.pointers.clear(); this.vEdit = false; this.tEdit = false; this.tsel = null; this.tPreview = null; this.guides = null;
    if (this.inkOn) this.inkHide(); this.clearLive();
    const w = this.world; this.world = null; this.wFrames = null; this.wLevels = new Map(); this._frDivs = new Map(); this._frSig = null;
    this.tiles = new Map(); this.pcache = new Map(); this._curLvl = null; this._fbLvl = null; this._ovLvl = null; this._ovNext = null; this.imgEpoch = (this.imgEpoch || 0) + 1;
    this.note = null;
    setTimeout(() => { makeThumb(note).then((t) => t && Store.setThumb(note.id, t)).catch(() => {}); OCR.scheduleNote(note); }, 2500);
    return w;
  },
  /* chama fn quando os blocos da tela ficarem prontos (ou depois de ms, o que vier antes) */
  onDone(fn, ms = 1500) { this._onDone = fn; setTimeout(() => { if (this._onDone === fn) { this._onDone = null; fn(); } }, ms); },
  markChanged() {
    if (!this.note) return;
    this._chgN = (this._chgN || 0) + 1; /* v1.42.13: invalida caches por página (palavras do wordsOf) */
    this.note.updated = Date.now(); this.saveDebounced(); this.thumbDebounced(); this.ocrDebounced(); this.updateUndoBtns();
  },
  async saveNow() {
    if (!this.note) return; this.saveDebounced.cancel();
    this.note.view = { ...this.cam }; this.note.title = $('#noteTitle').value.trim() || 'Nota sem título';
    await Store.putNote(this.note);
  },
  async saveView() { // posição de leitura salva à parte (não dispara backup no Drive)
    if (!this.note) return; const views = (await DB.get('meta', 'views')) || {};
    views[this.note.id] = { ...this.cam, page: this.currentPageIndex(), at: Date.now() };
    const keys = Object.keys(views); if (keys.length > 400) keys.sort((a, b) => views[a].at - views[b].at).slice(0, keys.length - 400).forEach((k) => delete views[k]);
    await DB.put('meta', views, 'views');
  },
  async updateThumb() { if (!this.note) return; const t = await makeThumb(this.note); if (t) await Store.setThumb(this.note.id, t); },

  /* ---------- Layout e câmera ---------- */
  computeLayout() {
    this._layoutVer = (this._layoutVer || 0) + 1;
    const n = this.note;
    if (n.mode === 'infinite') { this.layout = [{ x: 0, y: 0 }]; this.maxW = 0; this.totalH = 0; return; }
    let y = 0, mw = 0;
    this.layout = n.pages.map((p) => { const o = { x: -p.w / 2, y }; y += p.h + GAP; mw = Math.max(mw, p.w); return o; });
    this.totalH = y - GAP; this.maxW = mw;
  },
  resize(silent) {
    const r = this.stage.getBoundingClientRect(); this.dpr = Math.min(3, devicePixelRatio || 1);
    this.W = r.width; this.H = r.height; this.rect = r;
    this._pw = Math.round(r.width * this.dpr); this._ph = Math.round(r.height * this.dpr); /* v0.58.3: tamanho cheio das telas (as contas usam isto, não o tamanho atual da tela, que pode estar liberada em 1×1) */
    if (!this._mainOff) this.setCv(this.cMain, true); if (!this._liveOff) this.setCv(this.cLive, true); /* v0.25.1: mudar o tamanho (mesmo para o igual) apaga a tela: só quando muda */
    this._mg = null; if (this.placeScroll) this.placeScroll(); /* margens e rolagem rápida medidas de novo só quando a tela muda */
    if (!silent) { this.clampCam(); this.requestRender(); Instruments.redraw(); }
  },
  fitWidth() {
    if (this.note.mode === 'infinite') { this.cam = { x: -40, y: -40, z: 1 }; return this.requestRender(); }
    const m = this.barMargins(), z = clamp((this.W - m.mL - m.mR) / this.maxW, 0.2, 3); this.cam.z = z; /* v0.25.1: largura = área entre as barras e a margem */
    this.cam.x = -this.maxW / 2 - m.mL / z; this.cam.y = -16 / z; this.clampCam(); this.requestRender();
  },
  /* v1.4.1: perto do zoom máximo (até 50 pontos de % abaixo dele) o dedo não seleciona nem mexe em tabelas — só rola/zoom */
  tableFingerLock() { return this.cam.z * 100 >= this.zoomLimits()[1] * 100 - 50 - 1e-6; },
  zoomLimits() { // ajustável em Configurações → Zoom (em %)
    const S = Store.settings, inf = this.note && this.note.mode === 'infinite';
    const a = clamp((+S.zoomMin || (inf ? 10 : 20)) / 100, 0.05, 1), b = clamp((+S.zoomMax || 800) / 100, 1.5, 20);
    return [a, b];
  },
  /* v0.25.1 (estilo Notewise): margens laterais da tela = barras de ferramentas + cores à esquerda (se estiverem por cima desta tela) e
     ~12 px à direita. Medidas uma vez (ResizeObserver) e guardando o maior valor visto: trocar de ferramenta não faz a folha pular */
  barMargins() {
    if (this._mg && this._mgW === this.W) return this._mg;
    const x = this.barsOver(this.stage.getBoundingClientRect());
    const mL = Math.max(12, Math.round(Math.max(x + 8, this._mgMax || 0))); this._mgMax = Math.max(this._mgMax || 0, x + 8);
    this._mg = { mL, mR: 12 }; this._mgW = this.W; return this._mg;
  },
  /* quanto as barras da esquerda (ferramentas + cores) entram por cima de uma tela (px a partir da borda esquerda dela) */
  barsOver(st) { let x = 0; for (const id of ['rail', 'subrail']) { const n = document.getElementById(id); if (!n || !n.offsetWidth || getComputedStyle(n).display === 'none') continue; const r = n.getBoundingClientRect(); if (r.right > st.left && r.left < st.left + 40 + (r.width || 0) * 2) x = Math.max(x, r.right - st.left); } return x; },
  resetMargins() { this._mg = null; this._mgMax = 0; },
  /* a folha (na largura atual) cabe entre as margens? então a rolagem lateral trava */
  /* v0.33: tela infinita → volta ao ponto de partida (origem no canto de cima, como ao criar a nota), animando e mantendo o zoom */
  goHome() {
    if (!this.note || this.note.mode !== 'infinite') return; this.stopInertia && this.stopInertia();
    const z = this.cam.z, from = { x: this.cam.x, y: this.cam.y }, to = { x: -40 / z, y: -40 / z }, t0 = performance.now(), D = 320;
    const step = (now) => { const u = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - u, 3); this.cam.x = from.x + (to.x - from.x) * e; this.cam.y = from.y + (to.y - from.y) * e; this.requestRender(); if (u < 1) requestAnimationFrame(step); else { this.updateHud(); this.viewDebounced && this.viewDebounced(); } };
    requestAnimationFrame(step);
  },
  hScrollable() { if (!this.note || this.note.mode === 'infinite') return true; const m = this.barMargins(); return this.maxW * this.cam.z > this.W - m.mL - m.mR + 0.5; },
  clampCam() {
    const [a, b] = this.zoomLimits(); const c = this.cam; c.z = clamp(c.z, a, b);
    if (this.note.mode === 'infinite') return;
    const vw = this.W / c.z, L = -this.maxW / 2, R = this.maxW / 2, m = this.barMargins(), pw = this.maxW * c.z;
    /* v0.25.1: folha mais larga que a área entre as margens → rola para os lados até a borda encostar na margem (sem folga).
       Mais estreita → rolagem lateral travada: a folha encosta nas barras e, tirando mais zoom, vai para o meio da tela aos poucos */
    if (pw > this.W - m.mL - m.mR) c.x = clamp(c.x, L - m.mL / c.z, R + m.mR / c.z - vw);
    else { const left = Math.max(m.mL, (this.W - pw) / 2); c.x = L - left / c.z; }
    c.y = clamp(c.y, this.camMinY(), this.camMaxY());
  },
  /* fim da rolagem: o fim da última página fica um pouco acima da borda de baixo da tela (daí em diante é "puxar para adicionar") */
  camMinY() { return -60 / this.cam.z; }, // topo: só um pouquinho acima da 1ª página
  camMaxBase() { const z = this.cam.z, vh = this.H / z; return Math.max(this.camMinY(), this.totalH - vh + Math.max(220, this.H * 0.3) / z); }, /* v0.27: margem maior embaixo da última página (antes 90 px) antes de começar o "puxar para nova página" */
  camMaxY() { return this.camMaxBase() + (this.pull || 0) * 0.6 / this.cam.z; }, // ao puxar, a folha sobe um pouco (efeito elástico)
  /* ---------- puxar para adicionar página (como no Notewise) ---------- */
  PULL_MAX: 260, PULL_ADD: 190, /* v0.23.6: mais exigente (~340 px de puxada, antes ~150) */
  setPull(px) {
    px = this.note && this.note.mode !== 'infinite' && !this.readOnly ? Math.max(0, px) : 0;
    const eased = px ? this.PULL_MAX * (1 - Math.exp(-px / this.PULL_MAX)) : 0; // resistência elástica
    const was = this.pull || 0; this.pull = eased;
    let h = $('#pullHint');
    if (!eased) { if (h) h.classList.remove('on', 'ready'); return; }
    if (!h) { h = el('div', { id: 'pullHint', class: 'pull-hint' }, el('div', { class: 'ph-ring' }, el('span', { html: icon('addPage') })), el('div', { class: 'ph-txt' })); this.stage.append(h); }
    const ready = eased >= this.PULL_ADD;
    h.classList.add('on'); h.classList.toggle('ready', ready);
    h.style.setProperty('--p', Math.min(1, eased / this.PULL_ADD));
    h.querySelector('.ph-txt').textContent = ready ? 'Solte para adicionar uma página' : 'Puxe para adicionar uma página';
    if (ready && was < this.PULL_ADD && navigator.vibrate) navigator.vibrate(10);
  },
  placePull() { const h = $('#pullHint'); if (!h || !this.pull) return; const y = this.toScreen(0, this.totalH).y; h.style.top = Math.min(this.H - 120, y + 14) + 'px'; },
  releasePull() {
    const ready = (this.pull || 0) >= this.PULL_ADD; this.setPull(0);
    if (!ready) return;
    const last = this.note.pages.length - 1; this.addPage(last); toast(`Página ${last + 2} adicionada`, 1200);
  },
  toWorld(sx, sy) { return { x: this.cam.x + sx / this.cam.z, y: this.cam.y + sy / this.cam.z }; },
  toScreen(wx, wy) { return { x: (wx - this.cam.x) * this.cam.z, y: (wy - this.cam.y) * this.cam.z }; },
  pageIndexAt(wx, wy, loose = false) {
    if (this.note.mode === 'infinite') return 0;
    const pages = this.note.pages;
    for (let i = 0; i < pages.length; i++) { const o = this.layout[i], p = pages[i]; if (wx >= o.x && wx <= o.x + p.w && wy >= o.y && wy <= o.y + p.h) return i; }
    if (!loose) return -1;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pages.length; i++) { const o = this.layout[i], p = pages[i]; const d = wy < o.y ? o.y - wy : wy > o.y + p.h ? wy - o.y - p.h : 0; if (d < bd) { bd = d; best = i; } }
    return best;
  },
  currentPageIndex() { const w = this.toWorld(this.W / 2, this.H / 2); return this.pageIndexAt(w.x, w.y, true); },
  pageById(id) { return this.note.pages.find((p) => p.id === id); },
  pageIdx(page) { return this.note.pages.indexOf(page); },
  local(pi, wx, wy) { const o = this.layout[pi]; return { x: wx - o.x, y: wy - o.y }; },
  pageTf(ctx, pi) { const o = this.layout[pi], z = this.cam.z, d = this.dpr; ctx.setTransform(d * z, 0, 0, d * z, d * (o.x - this.cam.x) * z, d * (o.y - this.cam.y) * z); },

  /* ---------- Desenho ---------- */
  requestRender() { if (this.needs) return; this.needs = true; requestAnimationFrame(() => { this.needs = false; this.safeDraw(); }); },
  safeDraw() { // um erro no desenho não pode congelar a tela: registra, volta ao desenho direto e tenta de novo
    try { this.draw(); this._drawErr = 0; }
    catch (e) {
      logError(e, 'desenho'); this._drawErr = (this._drawErr || 0) + 1;
      try { this.ctx.reset ? this.ctx.reset() : this.ctx.setTransform(1, 0, 0, 1, 0, 0); } catch (_) {}
      this.resetTiles(); if (this._drawErr >= 2) this.noTiles = true;
      if (this._drawErr < 4) setTimeout(() => this.requestRender(), 50);
    }
  },
  draw() {
    if (!this.note) return;
    const ctx = this.ctx, z = this.cam.z, d = this.dpr, note = this.note, inf = note.mode === 'infinite';
    const vis = { x: this.cam.x, y: this.cam.y, w: this.W / z, h: this.H / z };
    const skip = new Set(); if (this.editingId) skip.add(this.editingId);
    const selActive = this.sel && this.selTf; if (selActive) for (const id of this.sel.ids) skip.add(id);
    if (this.crop) skip.add(this.crop.id); // recorte na página: a imagem é desenhada por cima, inteira
    const att = selActive && this.action && this.action.attached && (!this.selTf.free || this.action.inkScale) ? this.action.attached : null; /* v1.8: post-it com "escrita junto" */ if (att) for (const id of att) skip.add(id);
    const pv = this.tPreview; if (pv) { for (const id of pv.map.keys()) skip.add(id); for (const x of pv.removed) skip.add(x.id); }
    // zoom em andamento: usa os blocos já prontos (esticados) e redesenha nítido quando o zoom para
    const now = performance.now(); this.frameNo = (this.frameNo || 0) + 1;
    if (this._prevZ !== undefined && this._prevZ !== z) { this._zoomAt = now; clearTimeout(this._zT); this._zT = setTimeout(() => this.requestRender(), 150); }
    this._prevZ = z;
    const st = { t0: now, rendered: 0, zooming: now - (this._zoomAt || 0) < 120 }; let allDone = true;
    // v0.13: com a camada de composição, os blocos ficam na tela e só a "folha" se move; esta tela de cima só desenha o que está sendo mexido
    const dom = this.domMode(); let skipPages = null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (dom) {
      skipPages = new Set(); if (skip.size) for (const p of note.pages) if (p.elements.some((e) => skip.has(e.id))) skipPages.add(p.id);
      allDone = this.drawDom(vis, st, skipPages);
      const needOv = skipPages.size || this.sel || this.flash || this.guides || pv;
      this._wantMain = !!(needOv || this.crop || this.textEl || this.action); if (this._wantMain) this.mainOn(); /* v0.58.3: a liberação é agendada no fim do draw */
      if (needOv || this._ovDirty) ctx.clearRect(0, 0, this.cMain.width, this.cMain.height);
      this._ovDirty = !!needOv;
    } else { this._wantMain = true; this.mainOn(); this._ovDirty = true; if (this.world) this.world.style.display = 'none'; ctx.fillStyle = this.desk; ctx.fillRect(0, 0, this.cMain.width, this.cMain.height); }
    let moveLater = -1;
    note.pages.forEach((page, i) => {
      if (dom && !skipPages.has(page.id)) return;
      const o = this.layout[i];
      const pr = inf ? vis : { x: o.x, y: o.y, w: page.w, h: page.h };
      if (!inf && !rectsHit(pr, vis)) return;
      this.pageTf(ctx, i); ctx.save();
      let lv = { x: vis.x - o.x, y: vis.y - o.y, w: vis.w, h: vis.h };
      if (!inf) {
        if (!dom) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 10 * d; ctx.shadowOffsetY = 2 * d; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, page.w, page.h); ctx.restore(); }
        ctx.beginPath(); ctx.rect(0, 0, page.w, page.h); ctx.clip();
        const x1 = Math.max(0, lv.x), y1 = Math.max(0, lv.y); lv = { x: x1, y: y1, w: Math.min(page.w, lv.x + lv.w) - x1, h: Math.min(page.h, lv.y + lv.h) - y1 };
      }
      const direct = dom || this.noTiles || (skip.size && page.elements.some((e) => skip.has(e.id))); // item sendo movido/editado nesta página: desenho direto
      if (direct) drawPageContent(ctx, note, page, lv, z, { dpr: d, skip });
      else if (!this.drawPageTiled(ctx, page, i, o, vis, st)) allDone = false;
      if (this.textEl && this.textCtx && this.textCtx.page === page && this.textCtx.el.sticky) { const te = this.textCtx.el, h = layoutText(te).h; drawElement(ctx, { ...te, text: '', spans: undefined, minH: Math.max(te.minH || te.w, h) }); } // post-it em edição
      /* v0.58: só MOVER (sem girar/escalar/editar pontos) — desenha por último e sem o recorte da página, para o item aparecer ao passar para a página vizinha */
      const plainMove = selActive && this.sel.pageId === page.id && !this.selTf.free && !this.selTf.node && this.selTf.rot == null && this.selTf.sx === 1 && this.selTf.sy === 1 && this.note.mode !== 'infinite';
      if (plainMove) moveLater = i;
      else if (selActive && this.sel.pageId === page.id) {
        const t = this.selTf;
        if (t.free) { for (const e of page.elements) if (this.sel.ids.has(e.id) || (att && att.has(e.id))) drawElement(ctx, t.node || transformEl(e, t)); }
        else {
          if (t.rot != null) { ctx.translate(t.cx, t.cy); ctx.rotate(t.rot); ctx.translate(-t.cx, -t.cy); }
          else { ctx.translate(t.ox + t.dx, t.oy + t.dy); ctx.scale(t.sx, t.sy); ctx.translate(-t.ox, -t.oy); }
          for (const e of page.elements) if (this.sel.ids.has(e.id) || (att && att.has(e.id))) drawElement(ctx, e);
        }
      }
      if (pv && this.sel && this.sel.pageId === page.id) { // prévia da tabela (linha/coluna redimensionada, escrita acompanhando)
        for (const e of page.elements) { const n = pv.map.get(e.id); if (n) drawElement(ctx, n); }
      }
      ctx.restore();
      if (this.crop && this.crop.pageId === page.id) { this.pageTf(ctx, i); this.drawCropImage(ctx); }
    });
    if (moveLater >= 0 && this.selTf) { /* v0.58: itens sendo movidos por cima de todas as páginas (podem passar para outra) */
      const page = note.pages[moveLater], t = this.selTf; this.pageTf(ctx, moveLater); ctx.save(); ctx.translate(t.dx, t.dy);
      for (const e of page.elements) if (this.sel.ids.has(e.id) || (att && att.has(e.id))) drawElement(ctx, e);
      ctx.restore();
    }
    const a = this.action;
    /* v0.23: a tinta ao vivo (tela rápida ou camada de prévia) só some quando os blocos já mostram o traço inteiro — antes sumia um quadro antes (ou vários, se a área precisava ser redesenhada) e a tela piscava */
    const drawing = this.action && this.action.kind === 'draw';
    if (!drawing && (this._inkHide || this._liveClear || this._natPend) && (allDone || performance.now() - (this._liveT || 0) > 600)) {
      if (this._natPend) { const ids = this._natPend; this._natPend = null; requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => Native.inkClear(ids), 70))); } /* v1.0.4: o WebView leva alguns quadros para mostrar os blocos na tela — tirar a tinta nativa na hora deixava um quadro sem o traço (piscava) */
      if (this._inkHide) { this._inkHide = false; this.inkHide(); }
      if (this._liveClear) { this._liveClear = false; this.clearLive(); }
    }
    this.idleCanvases(this._wantMain); /* v0.58.3: agenda liberar as telas paradas (depois de limpar a prévia do traço) */
    this.drawSelection(); this.drawFlash(ctx); this.drawGuides(); this.updateHud(); this.positionText(); this.placePull(); this.updateScroll();
    if (!allDone && !st.zooming) this.requestRender(); // ainda há blocos a desenhar: continua no próximo quadro
    this._drawnCam = { ...this.cam }; this._drawnComplete = allDone && !st.zooming;
    if (st.rendered && !this.inkOn) this._inkKey = null; /* blocos novos: o fundo da tela rápida precisa ser refeito */
    if (this._onDone && allDone && !st.zooming) { const f = this._onDone; this._onDone = null; setTimeout(f, 30); }
    this.evictTiles(); if (allDone && !st.zooming) { this.schedulePrefetch(); if (this.lowLat) this.inkPrepLater(); }
    if (this._lastCam !== `${this.cam.x}|${this.cam.y}|${this.cam.z}`) { this._lastCam = `${this.cam.x}|${this.cam.y}|${this.cam.z}`; this.viewDebounced(); }
  },
  /* v0.39.1: arrastar a seleção só conta como TOQUE se quase não mexeu (< 1,2 px) ou se foi rápido (< 200 ms) e curto (< 4 px).
     Ajuste fino e lento (1–3 px, para quem escreve pequeno) fica gravado — antes < 3,5 px sempre voltava ao lugar */
  isTapMove(a, md) { const dt = performance.now() - (a.t0 || 0); return md < 1.2 || (md < 4 && dt < 200); },
  selElements() { if (!this.sel) return []; const p = this.pageById(this.sel.pageId); return p ? p.elements.filter((e) => this.sel.ids.has(e.id)) : []; },
  selScreenBox() {
    const els = this.selElements(); if (!els.length) return null;
    const t = this.selTf, b = t && t.node ? elBBox(t.node) : bboxUnion(els), pi = this.pageIdx(this.pageById(this.sel.pageId)), o = this.layout[pi];
    let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
    if (t && t.rot == null) { const f = (x, y) => [t.ox + (x - t.ox) * t.sx + t.dx, t.oy + (y - t.oy) * t.sy + t.dy]; [x1, y1] = f(x1, y1); [x2, y2] = f(x2, y2); }
    const a = this.toScreen(x1 + o.x, y1 + o.y), c = this.toScreen(x2 + o.x, y2 + o.y);
    return { x: a.x - 6, y: a.y - 6, w: c.x - a.x + 12, h: c.y - a.y + 12, local: b };
  },
  /* v1.42.11: halo leve só na seleção de palavras com o dedo (`_wordSelRef`): um único caminho com todos os traços, sem sombra,
     roxo translúcido um pouco mais largo que a tinta. Não desenha durante gesto (rolar/zoom) nem acima de 400 traços. */
  drawSelGlow() {
    if (!this._wordSelRef || this.sel !== this._wordSelRef || (this.gesture && !this.gesture.wsel)) return;
    const page = this.pageById(this.sel.pageId); if (!page) return; const pi = this.pageIdx(page); if (pi < 0 || !this.layout[pi]) return;
    const els = page.elements.filter((e) => this.sel.ids.has(e.id) && e.pts && !e.rot); if (!els.length || els.length > 400) return;
    const ctx = this.ctx, z = this.cam.z, path = new Path2D(); let w = 0, tot = 0; for (const e of els) tot += e.pts.length / 3; const st = Math.max(1, Math.ceil(tot / 5000));
    for (const e of els) { const P = e.pts, n = P.length / 3; w = Math.max(w, e.width || 2); path.moveTo(P[0], P[1]); for (let k = st; k < n; k += st) path.lineTo(P[k * 3], P[k * 3 + 1]); if (n > 1) path.lineTo(P[(n - 1) * 3], P[(n - 1) * 3 + 1]); else path.lineTo(P[0] + 0.01, P[1]); }
    ctx.save(); this.pageTf(ctx, pi); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(124,58,237,.2)'; ctx.lineWidth = w + 7 / z; ctx.stroke(path); ctx.restore();
  },
  drawSelection() {
    const bar = $('#selBar');
    if (this.crop) { bar.classList.add('hidden'); this.drawCropUI(); return; }
    if (!this.sel) { bar.classList.add('hidden'); return; }
    const box = this.selScreenBox();
    if (!box) { this.sel = null; bar.classList.add('hidden'); return; }
    const ctx = this.ctx, d = this.dpr; ctx.setTransform(d, 0, 0, d, 0, 0);
    if (this.selLocked()) { // seleção bloqueada: só a moldura e um cadeado
      ctx.save(); ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.setLineDash([]);
      ctx.fillStyle = '#6b7280'; ctx.beginPath(); ctx.roundRect(box.x + box.w - 22, box.y - 26, 22, 20, 6); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.strokeRect(box.x + box.w - 16, box.y - 18, 10, 7); ctx.beginPath(); ctx.arc(box.x + box.w - 11, box.y - 19, 3, Math.PI, 0); ctx.stroke(); ctx.restore();
    } else if (this.vEditEl()) { this.drawVEdit(box); } else if (this.tableCells()) { /* v0.39: modo células da tabela — sem alças, moldura verde-azulada */
      ctx.save(); ctx.strokeStyle = '#0d9488'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.setLineDash([]); ctx.restore();
      if (!this.selTf && !this.tPreview) this.drawTableOverlay(box);
    } else {
    if (!this.selTf) this.drawSelGlow(); /* v1.42.11: halo leve, só na seleção de palavras */
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.save(); ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.setLineDash([]);
    for (const [h, x, y] of this.selHandles(box)) { /* v0.22: alças em todos os cantos e lados */
      /* v0.26.1: alças menores (a área de toque continua a mesma) */
      ctx.fillStyle = '#fff'; ctx.beginPath(); if (h.length === 2) ctx.arc(x, y, 5.5, 0, Math.PI * 2); else ctx.roundRect(x - 4, y - 4, 8, 8, 2); ctx.fill(); ctx.stroke();
      if (h === 'se') { ctx.fillStyle = '#7c3aed'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
    }
    const rx = box.x + box.w / 2, ry = box.y - 34; // alça de rotação
    ctx.beginPath(); ctx.moveTo(rx, box.y); ctx.lineTo(rx, ry + 8); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(rx, ry, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(rx, ry, 3.5, -Math.PI * 0.9, Math.PI * 0.4); ctx.stroke();
    if (this.ratioLabel) { ctx.fillStyle = '#ec4899'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'right'; ctx.fillText(this.ratioLabel, box.x + box.w - 14, box.y + box.h + 22); }
    if (this.selTf && this.selTf.rot != null) { ctx.fillStyle = '#7c3aed'; ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(Math.round(this.selTf.rot * 180 / Math.PI) + '°', rx, ry - 18); }
    ctx.restore();
    }
    if (this.selTf || this.tPreview) { bar.classList.add('hidden'); return; }
    if (bar.classList.contains('hidden') || bar.dataset.n !== String(this.sel.ids.size)) UI.buildSelBar();
    bar.classList.remove('hidden'); bar.dataset.n = this.sel.ids.size;
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    let y = box.y - bh - 52; if (y < 6) y = box.y + box.h + 16; if (y + bh > this.H - 6) y = clamp(box.y + 10, 6, this.H - bh - 6);
    bar.style.left = clamp(box.x + box.w / 2 - bw / 2, 6, this.W - bw - 6) + 'px'; bar.style.top = y + 'px';
  },
  updateHud() { // só mexe na tela quando o texto muda (a cada quadro isso custava um recálculo de layout)
    const ci = this.currentPageIndex(), pg = this.note.pages[ci], key = `${Math.round(this.cam.z * 100)}|${ci}|${this.note.pages.length}|${this.note.mode}|${!!(pg && pg.bookmark)}`;
    if (key === this._hudKey) return;
    /* v0.24.1: na pinça o zoom muda a cada quadro; reescrever o "157%" a cada quadro redesenhava a barra de cima o tempo todo (piscava no Android) */
    if (this.gesture && this._hudKey && performance.now() - (this._hudT || 0) < 120) { clearTimeout(this._hudTO); this._hudTO = setTimeout(() => this.updateHud(), 130); return; }
    this._hudKey = key; this._hudT = performance.now();
    $('#hudZoom').textContent = Math.round(this.cam.z * 100) + '%';
    const hp = $('#hudPage');
    if (this.note.mode === 'infinite') hp.classList.add('hidden');
    else { hp.classList.remove('hidden'); hp.textContent = `${ci + 1} / ${this.note.pages.length}`; }
    const bm = $('#btnBookmark'); if (bm) bm.classList.toggle('soft-on', !!(pg && pg.bookmark));
    if (typeof SplitView !== 'undefined' && SplitView.shown) SplitView.hud();
  },
  clearLive() { const c = this.lctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cLive.width, this.cLive.height); },
  /* v0.58.3: as duas telas de tela cheia (cMain = seleção/guias/destaques por cima dos blocos; cLive = traço ao vivo, laço, prévia de forma)
     ocupam ~26 MB cada no Pad 7. Paradas, vão para 1×1 (cMain depois de 1,5 s sem nada por cima; cLive depois de 2 s sem traço) e voltam
     na hora em que forem usadas (cLive já quando a caneta chega perto da tela). */
  setCv(c, on) { const w = on ? this._pw || 1 : 1, h = on ? this._ph || 1 : 1; if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; },
  liveOn() { clearTimeout(this._liveIdleT); this._liveIdleT = null; if (this._liveOff) { this._liveOff = false; this.setCv(this.cLive, true); } },
  mainOn() { clearTimeout(this._mainT); this._mainT = null; if (this._mainOff) { this._mainOff = false; this.setCv(this.cMain, true); } },
  idleCanvases(wantMain) {
    if (wantMain) this.mainOn();
    else if (!this._mainOff && !this._mainT) this._mainT = setTimeout(() => { this._mainT = null; if (this.note && this.domMode() && !this.sel && !this.flash && !this.guides && !this.crop && !this.textEl && !this.tPreview && !this.action) { this._mainOff = true; this.setCv(this.cMain, false); } }, 1500);
    if (!this.action && !this._liveClear && !this._inkHide && !this._liveOff && !this._liveIdleT) this._liveIdleT = setTimeout(() => { this._liveIdleT = null; if (this.note && !this.action && !this._liveClear && !this._inkHide) { this._liveOff = true; this.setCv(this.cLive, false); } }, 2000);
  },

  /* ---------- Histórico (desfazer/refazer) ---------- */
  opBegin() { if (!this.curOp) this.curOp = { changes: [] }; },
  recAdd(page, el, i = page.elements.length) { this.opBegin(); page.elements.splice(i, 0, el); this.curOp.changes.push({ p: page.id, k: 'add', el, i }); },
  recRemove(page, el) { const i = page.elements.indexOf(el); if (i < 0) return; this.opBegin(); page.elements.splice(i, 1); this.curOp.changes.push({ p: page.id, k: 'rem', el, i }); },
  recReplace(page, old, el) { const i = page.elements.indexOf(old); if (i < 0) return; this.opBegin(); page.elements[i] = el; this.curOp.changes.push({ p: page.id, k: 'rep', old, el, i }); },
  /* mudanças de modelo de página entram no desfazer/refazer */
  tplSnap() { return { nt: clone(this.note.template), pages: this.note.pages.map((p) => [p.id, clone(p.template || null)]) }; },
  tplApply(s) { this.note.template = clone(s.nt); for (const [id, t] of s.pages) { const p = this.pageById(id); if (p) p.template = clone(t); } },
  recTemplate(fn) { const a = this.tplSnap(); fn(); const b = this.tplSnap(); if (JSON.stringify(a) === JSON.stringify(b)) return; this.opBegin(); this.curOp.changes.push({ k: 'tpl', a, b }); this.opCommit(); },
  /* v0.19: adicionar, excluir, duplicar e mudar a ordem das páginas também entra no desfazer/refazer.
     Guarda a lista de páginas antes e depois (as próprias páginas, não cópias: o resto do histórico continua apontando para elas). */
  recPages(fn) {
    const a = this.note.pages.slice(), r = fn(), b = this.note.pages.slice();
    if (a.length === b.length && a.every((p, i) => p === b[i])) return r;
    this.opBegin(); this.curOp.changes.push({ k: 'pages', a, b }); this.opCommit(); this.computeLayout(); this.clampCam();
    return r;
  },
  opCommit() {
    const op = this.curOp; this.curOp = null; if (op) op.t = performance.now();
    if (op && op.changes.length) { this.undoStack.push(op); if (this.undoStack.length > 300) this.undoStack.shift(); this.redoStack = []; this.markChanged(); }
    this.requestRender();
  },
  undo() {
    if (this.crop) return this.cancelCrop(); // desfazer durante o recorte: só cancela o recorte
    this.commitText(); const op = this.undoStack.pop(); if (!op) return; let pg = false;
    for (let j = op.changes.length - 1; j >= 0; j--) {
      const c = op.changes[j]; if (c.k === 'tpl') { this.tplApply(c.a); continue; }
      if (c.k === 'pages') { this.note.pages = c.a.slice(); pg = true; continue; }
      const page = this.pageById(c.p); if (!page) continue; const els = page.elements;
      if (c.k === 'add') { const i = els.findIndex((e) => e.id === c.el.id); if (i >= 0) els.splice(i, 1); }
      else if (c.k === 'rem') els.splice(Math.min(c.i, els.length), 0, c.el);
      else { const i = els.findIndex((e) => e.id === c.el.id); if (i >= 0) els[i] = c.old; }
    }
    this.redoStack.push(op); this.sel = null; if (pg) this.pagesUndone(op, true); this.markChanged(); this.requestRender();
  },
  redo() {
    if (this.crop) return;
    const op = this.redoStack.pop(); if (!op) return; let pg = false;
    for (const c of op.changes) {
      if (c.k === 'tpl') { this.tplApply(c.b); continue; }
      if (c.k === 'pages') { this.note.pages = c.b.slice(); pg = true; continue; }
      const page = this.pageById(c.p); if (!page) continue; const els = page.elements;
      if (c.k === 'add') els.splice(Math.min(c.i, els.length), 0, c.el);
      else if (c.k === 'rem') { const i = els.findIndex((e) => e.id === c.el.id); if (i >= 0) els.splice(i, 1); }
      else { const i = els.findIndex((e) => e.id === c.old.id); if (i >= 0) els[i] = c.el; }
    }
    this.undoStack.push(op); this.sel = null; if (pg) this.pagesUndone(op, false); this.markChanged(); this.requestRender();
  },
  /* depois de desfazer/refazer uma mudança de páginas: refaz o layout e mostra a página que voltou (ou a vizinha da que saiu) */
  pagesUndone(op, undo) {
    const c = op.changes.find((x) => x.k === 'pages'), from = undo ? c.b : c.a, to = undo ? c.a : c.b;
    this.computeLayout(); this.clampCam();
    if (typeof PageManager !== 'undefined' && PageManager.root) PageManager.render();
    if (this.note.mode === 'infinite') return;
    const back = to.findIndex((p) => !from.includes(p)); // página que voltou
    if (back >= 0) { this.goToPage(back); toast(undo ? 'Página restaurada' : 'Página refeita', 1100); return; }
    const gone = from.findIndex((p) => !to.includes(p)); // página que saiu
    if (gone >= 0) { this.goToPage(Math.min(gone, to.length - 1)); toast(undo ? 'Página adicionada foi desfeita' : 'Página excluída de novo', 1100); return; }
  },
  updateUndoBtns() { const u = $('#btnUndo'), r = $('#btnRedo'); if (u) u.disabled = !this.undoStack.length; if (r) r.disabled = !this.redoStack.length; },

  /* ---------- Entrada ---------- */
  pt(e) { return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top }; },
  touchIds() { return [...this.pointers.entries()].filter(([, p]) => p.type === 'touch' && !p.ignored && !p.drawing).map(([id]) => id); },
  onDown(e) {
    this.lastInput = Date.now();
    if (!this.note) return;
    this.rect = this.stage.getBoundingClientRect();
    this.stopInertia(); if (this.flash && this.flash.hold === 'keep' && e.pointerType !== 'touch' && performance.now() - this.flash.t0 > 600) { this.flash = null; this.requestRender(); } /* tocou na página: a marca do PDF sai */
    if (this._eyedrop && !(e.target.closest && e.target.closest('#selBar,#textBar,#hbar'))) { e.preventDefault(); this.eyedropDown(e); return; } // conta-gotas (v0.32: prévia, solta para confirmar)
    if (this.textEl && this.textEl.contains(e.target)) { /* caixa de texto aberta: 1 dedo/caneta escreve nela; v0.34.5: 2 dedos (um deles nela) fazem zoom/rolagem */
      if (e.pointerType !== 'touch') return;
      const p = this.pt(e); this.pointers.set(e.pointerId, { ...p, sx: p.x, sy: p.y, type: 'touch', t0: performance.now(), onText: true });
      if (this.touchIds().length >= 2) this.startGesture();
      return;
    }
    if (e.target.closest && e.target.closest('#textBar,#hbar')) return;
    if (e.target.closest && e.target.closest('#selBar,#cropBar')) return; // botões da seleção não iniciam novo laço
    if (UI.panelOpen) UI.closePanel();
    try { this.stage.setPointerCapture(e.pointerId); } catch (_) {}
    const p = this.pt(e); const rec = { ...p, sx: p.x, sy: p.y, type: e.pointerType, t0: performance.now() };
    this.pointers.set(e.pointerId, rec);
    if (e.pointerType === 'pen') { this.penDown = true; this.lastPenSeen = performance.now(); if (this.gesture) this.endGesture(); }
    if (this.readOnly && e.pointerType !== 'touch') { rec.type = 'touch'; this.startGesture(); return; } // modo leitura: caneta só navega
    if (e.pointerType === 'pen' && this._hyArm && (e.buttons & 1) && !this.penClickHeld(e)) { const arm = this._hyArm; this._hyArm = null; if ((arm.panel || performance.now() - arm.t < 8000) && !this.readOnly) { rec.ignored = true; if (arm.panel) this.placeQuick(p); else if (arm.kind === 'bullet') this.placeBullet(p); else this.placeHyphen(p); return; } } /* v0.41: hífen (v0.44: ou tópico) armado pelo botão da caneta */
    if (e.pointerType === 'pen' && (!(e.buttons & 1) || this.penClickHeld(e))) { rec.ignored = true; return; } // sem encostar (só botão) ou botão com atalho de clique: não desenha
    if (this.crop && this.cropDown(e, p, rec)) return; // recorte na página: alças e moldura
    if (e.pointerType === 'touch') {
      const tr = this.action && ['move', 'scale', 'rotate', 'vnode'].includes(this.action.kind) && this.action.pid !== e.pointerId;
      if (tr && this.action.ptype === 'touch' && performance.now() - (this.action.t0 || 0) < 320) { /* v0.34.5: dois dedos quase juntos em cima da seleção (ex.: caixa de texto) = pinça de zoom, não mover */
        const ap = this.pointers.get(this.action.pid);
        if (!ap || Math.hypot(ap.x - ap.sx, ap.y - ap.sy) < 12) { this.cancelAction(); if (ap) ap.drawing = false; const p = this.pt(e); this.pointers.set(e.pointerId, { ...p, sx: p.x, sy: p.y, type: 'touch', t0: performance.now() }); try { this.stage.setPointerCapture(e.pointerId); } catch (_) {} this.startGesture(); return; }
      }
      if (tr) { // segundo dedo enquanto move/redimensiona: sem ajustes automáticos (palma grande é ignorada)
        rec.ignored = true;
        if (!(e.width > 48 || e.height > 48)) { rec.noSnap = true; this.action.noSnap = (this.action.noSnap || 0) + 1; const ap = this.pointers.get(this.action.pid); if (ap) this.moveAction([], { clientX: ap.x + this.rect.left, clientY: ap.y + this.rect.top }); }
        return;
      }
      if (Store.settings.palmGuard && (this.penDown || performance.now() - this.lastPenSeen < 300)) { rec.ignored = true; if (typeof BugRec !== 'undefined') BugRec.push('tch', { why: 'logo depois da caneta', ms: Math.round(performance.now() - this.lastPenSeen), pd: this.penDown ? 1 : 0 }); return; } /* v1.3.2: 500 → 300 ms; a palma grande já é barrada pelo tamanho (Palm) */
      const drawingTouch = this.action && this.action.ptype === 'touch';
      if (!this.gesture && !drawingTouch && this.touchIds().length === 1 && this.sel && !this.readOnly) { // dedo também move, redimensiona e gira a seleção
        const k = this.tableFingerLock() && this.selElements().some((x) => x.type === 'table') ? null : this.selHit(p); /* v1.4.1: tabela travada para o dedo no zoom alto */
        if (k) { rec.drawing = true; this.action = { pid: e.pointerId, ptype: 'touch', t0: performance.now(), tool: 'lasso', sx: p.x, sy: p.y, kind: k, hh: this._sh, start: p, box: this.selScreenBox() }; if (k === 'tableact') { this.action.th = this._thit; this.startTableAct(this.action); } return; }
      }
      if (Store.settings.fingerDraws && !this.readOnly && !this.gesture && !drawingTouch && this.touchIds().length === 1) { rec.drawing = true; this.startAction(e, p); return; }
      if (drawingTouch) { const ap = this.pointers.get(this.action.pid); this.cancelAction(); if (ap) ap.drawing = false; }
      this.startGesture(); return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) { rec.type = 'touch'; this.startGesture(); return; }
    if (this.action) return;
    this.startAction(e, p);
  },
  onRaw(e) {
    const a = this.action; if (!a || a.kind !== 'draw' || a.pid !== e.pointerId || e.pointerType !== 'pen' || !this.note) return;
    const rec = this.pointers.get(e.pointerId); if (!rec || rec.ignored) return;
    const p = this.pt(e); rec.x = p.x; rec.y = p.y; this.lastPenSeen = performance.now(); this.lastInput = Date.now(); a.raw2 = true;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    this.moveAction(evs && evs.length ? evs : [e], e);
  },
  onMove(e) {
    if (e.buttons || e.pressure) this.lastInput = Date.now();
    if (!this.note) return;
    if (e.pointerType === 'pen' && (e.buttons || e.pressure > 0)) this.lastPenSeen = performance.now(); /* v1.3.2: só a caneta ENCOSTADA conta (pairando perto da tela barrava o 1º arrasto do dedo) */
    const rec = this.pointers.get(e.pointerId);
    if (!rec) { if (e.pointerType === 'pen' && this.tool === 'eraser') this.hoverEraser(this.pt(e)); return; }
    const p = this.pt(e); rec.x = p.x; rec.y = p.y;
    if (rec.ignored) return;
    if (this.action && this.action.pid === e.pointerId) {
      if (this.action.raw2 && this.action.kind === 'draw') return; // já tratado no pointerrawupdate
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      this.moveAction(evs && evs.length ? evs : [e], e); return;
    }
    if (this.gesture) this.moveGesture();
  },
  onUp(e, cancel = false) {
    if (!this.note) return;
    const rec = this.pointers.get(e.pointerId); this.pointers.delete(e.pointerId);
    if (e.pointerType === 'pen') { this.penDown = false; this.lastPenSeen = performance.now(); Focus.writingEnd(); }
    if (!rec) return;
    if (rec.noSnap && this.action && this.action.noSnap) { this.action.noSnap--; const ap = this.pointers.get(this.action.pid); if (ap) this.moveAction([], { clientX: ap.x + this.rect.left, clientY: ap.y + this.rect.top }); }
    if (this.action && this.action.pid === e.pointerId) { if (cancel) this.cancelAction(); else this.endAction(e); return; }
    if (this.gesture) {
      if (!this.touchIds().length) this.endGesture(); else this.rebaseGesture();
    }
  },
  onWheel(e) {
    if (!this.note) return; e.preventDefault();
    if (e.ctrlKey || e.metaKey) { const p = this.pt(e); this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.01)); }
    else {
      const before = this.cam.y; this.cam.x += e.deltaX / this.cam.z; this.cam.y += e.deltaY / this.cam.z;
      const over = (this.cam.y - this.camMaxBase()) * this.cam.z; // roda do mouse/trackpad também puxa
      if (e.deltaY > 0 && over > 0 && before >= this.camMaxBase() - 0.5) { this.wheelPull = (this.wheelPull || 0) + e.deltaY * 0.6; this.setPull(this.wheelPull); }
      clearTimeout(this._wheelT); this._wheelT = setTimeout(() => { this.wheelPull = 0; if (this.pull) this.releasePull(); }, 260);
      this.clampCam(); this.requestRender();
    }
  },
  zoomAt(sx, sy, f) { const w = this.toWorld(sx, sy); this.cam.z *= f; this.clampCam(); this.cam.x = w.x - sx / this.cam.z; this.cam.y = w.y - sy / this.cam.z; this.clampCam(); this.requestRender(); Instruments.redraw(); },
  onKey(e) {
    if (!this.note || $('#editor').classList.contains('hidden')) return;
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
    const ksig = 'key:' + (e.code || e.key); if ((Store.settings.penMap || {})[ksig]) { e.preventDefault(); return this.firePenSig(ksig); }
    const k = e.key.toLowerCase();
    if (this.crop) { if (k === 'escape') this.cancelCrop(); else if (k === 'enter') this.applyCrop(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.redo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'c') this.copySel();
    else if ((e.ctrlKey || e.metaKey) && k === 'v') this.paste();
    else if ((k === 'delete' || k === 'backspace') && this.sel) this.deleteSel();
    else if (!e.ctrlKey && !e.metaKey) { const m = { p: 'pen', h: 'highlighter', e: 'eraser', l: 'lasso', s: 'shape', t: 'text' }[k]; if (m) UI.setTool(m); }
  },

  /* ---------- Gestos de navegação ---------- */
  startGesture() {
    if (this._natPend) { Native.inkClear(this._natPend); this._natPend = null; } /* v1.0: a tinta nativa fica presa à tela — sai antes de rolar/zoom */
    const f = this.pointers.get(this.touchIds()[0]); const g = this.gesture = { t0: performance.now(), moved: false, max: 0, p0: f ? { x: f.x, y: f.y } : null }; this.rebaseGesture();
    g.atEnd = !!(this.note && this.note.mode !== 'infinite' && !this._inertia && this.cam.y >= this.camMaxBase() - 4 / this.cam.z); // já parado no fim da nota
    /* v0.22: com o laço, segurar o dedo parado abre o painel de colar da biblioteca */
    /* v0.49: com a caneta, segurar o dedo parado 0,4 s numa palavra seleciona a palavra; arrastando, a faixa junta as palavras tocadas */
    /* v1.18: seleção de palavras com o dedo em TODAS as ferramentas; colar da biblioteca = segurar DOIS dedos parados (em rebaseGesture) */
    if (!this.readOnly && !this.crop && !this.textEl && g.p0 && g.n === 1) g.holdT = setTimeout(() => { if (this.gesture === g && !g.moved && g.n === 1 && g.max === 1) this.wordSelStart(g); }, 400);
  },
  rebaseGesture() {
    const g = this.gesture; if (!g) return;
    const ids = this.touchIds(); g.max = Math.max(g.max, ids.length); if (ids.length > 1) clearTimeout(g.holdT);
    if (ids.length === 2 && g.max === 2 && !g.moved && !this.readOnly && !this.crop && !this.textEl) { const Q = ids.map((id) => this.pointers.get(id)), at = { x: (Q[0].x + Q[1].x) / 2, y: (Q[0].y + Q[1].y) / 2 };
      g.holdT = setTimeout(() => { if (this.gesture === g && !g.moved && g.n === 2 && g.max === 2) { g.held = true; this.lassoHoldPaste(at); } }, 550); } /* v1.18: 2 dedos parados 0,55 s → colar da biblioteca (no meio dos dedos) */
    const P = ids.map((id) => this.pointers.get(id));
    for (const q of P) { g.minX = Math.min(g.minX ?? Infinity, q.sx ?? q.x); g.maxX = Math.max(g.maxX ?? -Infinity, q.sx ?? q.x); } /* onde os dedos encostaram (destro/canhoto) */
    g.cam = { ...this.cam }; g.n = P.length;
    if (P.length >= 2) { g.mid = { x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2 }; g.dist = Math.hypot(P[0].x - P[1].x, P[0].y - P[1].y) || 1; }
    else if (P.length === 1) g.mid = { x: P[0].x, y: P[0].y };
  },
  moveGesture() {
    const g = this.gesture, ids = this.touchIds(); if (!ids.length) return;
    if (g.wsel) { const q = this.pointers.get(ids[0]); if (q) this.wordSelMove(g, q); return; } /* v0.49: faixa de seleção de palavras */
    if (ids.length !== g.n) this.rebaseGesture();
    const P = ids.map((id) => this.pointers.get(id));
    for (const p of P) if (Math.hypot(p.x - p.sx, p.y - p.sy) > 10) { g.moved = true; clearTimeout(g.holdT); }
    if (P.length >= 2) {
      const mid = { x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2 }, dist = Math.hypot(P[0].x - P[1].x, P[0].y - P[1].y) || 1;
      const [a, b] = this.zoomLimits(); const z = clamp(g.cam.z * dist / g.dist, a, b);
      const wx = g.cam.x + g.mid.x / g.cam.z, wy = g.cam.y + g.mid.y / g.cam.z;
      this.cam = { z, x: wx - mid.x / z, y: wy - mid.y / z }; this._pinching = true;
    } else { // 1 dedo: prioriza o movimento vertical (o horizontal só entra quando o dedo vai claramente para o lado)
      const p = P[0], dx = p.x - g.mid.x, dy = p.y - g.mid.y;
      // v0.13: trava só quando o gesto começa quase reto na vertical (até ~22°) e solta fácil se o dedo for para o lado
      /* v0.23.2: trava vertical bem mais leve — só quando o dedo sai quase reto (até ~11°) e solta com 14 px para o lado (antes ~22° e 32 px: o horizontal parecia preso) */
      if (!g.lock && Math.hypot(dx, dy) > 10) { g.lock = Math.abs(dx) <= Math.abs(dy) * 0.2 ? 'v' : 'free'; g.xoff = 0; }
      if (g.lock === 'v' && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 0.18) { g.lock = 'free'; g.xoff = dx; } // foi para o lado de propósito
      const ex = g.lock === 'free' && this.hScrollable() ? dx - (g.xoff || 0) : 0; /* v0.25.1: folha cabe entre as margens → só rolagem vertical */
      this.cam = { z: g.cam.z, x: g.cam.x - ex / g.cam.z, y: g.cam.y - dy / g.cam.z };
    }
    if (P.length === 1) { const now = performance.now(); (g.vs = g.vs || []).push([now, this.cam.x, this.cam.y]); while (g.vs.length > 2 && now - g.vs[0][0] > 90) g.vs.shift(); } else g.vs = null;
    const over = P.length === 1 && g.atEnd ? (this.cam.y - this.camMaxBase()) * this.cam.z : 0; // passou do fim da última página (v0.23.6: só se o gesto começou já parado no fim)
    this.setPull(over > 0 ? over : 0);
    this.clampCam(); this._pinching = false; this.requestRender(); if (P.length >= 2) Instruments.redraw();
  },
  endGesture() {
    const g = this.gesture; this.gesture = null; if (!g) return; clearTimeout(g.holdT); if (g.wsel) return this.wordSelEnd(g); if (g.held) return;
    if (this.pull) this.releasePull();
    else if (g.moved && g.max === 1 && g.vs && g.vs.length >= 2 && performance.now() - g.vs[g.vs.length - 1][0] < 60) this.startInertia(g.vs, g.lock === 'v' || !this.hScrollable());
    const dt = performance.now() - g.t0;
    /* v0.23: destro → toques de 2/3 dedos só valem na metade esquerda (a palma apoia na direita); canhoto → o contrário */
    const hand = Store.settings.hand || 'right', half = this.W / 2, sideOk = hand === 'none' || (hand === 'right' ? g.maxX < half : g.minX > half);
    if (g.max >= 4 && dt < 800) { if (typeof BugRec !== 'undefined') BugRec.capture('4 dedos'); return; } /* v0.54: toque com 4 dedos = relatar problema visual */
    if (!g.moved && dt < 350 && g.max >= 2 && !sideOk) return;
    if (!g.moved && dt < 350) { if (g.max === 2) { this.undo();  } else if (g.max === 3) { this.redo();  } else if (g.max === 1 && g.p0 && !this.readOnly && !(typeof Focus !== 'undefined' && Focus._eatTap && performance.now() - Focus._eatTap < 300)) this.fingerTap(g.p0); } /* v1.36.5: toque que saiu da tela cheia não seleciona nada */
  },

  /* ---------- Ações de ferramenta ---------- */
  startAction(e, p) {
    const wasEditing = !!this.textEl;
    this.commitText();
    let tool = this.tool;
    if (e.pointerType === 'pen') { const h = this.penHoldTool(e.buttons); if (h) tool = h; }
    if (this._wordSel && this.sel && tool !== 'lasso') { if (this.selHit(p)) tool = 'lasso'; else { this.sel = null; this._wordSel = false; this.requestRender(); } } /* v0.49: seleção de palavras com a caneta ativa — caneta na seleção move; fora, desfaz e escreve */
    const w = this.toWorld(p.x, p.y);
    const base = { pid: e.pointerId, ptype: e.pointerType, tool, sx: p.x, sy: p.y };
    if (tool === 'pen' || tool === 'highlighter') return this.startDraw(base, e, p, w);
    if (tool === 'eraser') { this.action = { ...base, kind: 'erase', last: w }; this.eraseAt(w, w); this.drawEraserCursor(p); return; }
    if (tool === 'lasso') return this.startLasso(base, p, w);
    if (tool === 'shape') return this.startShape(base, w);
    if (tool === 'table') return this.startTable(base, w);
    if (tool === 'text' || tool === 'sticky') { if (wasEditing) return; this.action = { ...base, kind: 'text', w }; return; } // tocar fora só fecha a caixa
    const pt = Plugins.tools.find((t) => t.id === tool);
    if (pt) {
      const pi = this.pageIndexAt(w.x, w.y, this.note.mode === 'infinite'); if (pi < 0) return;
      this.action = { ...base, kind: 'plugin', plugin: pt, pi };
      this.callPlugin('onDown', e, p);
    }
  },
  moveAction(evs, e) {
    const a = this.action; if (!a) return;
    if (a.kind === 'draw') { for (const ev of evs) this.addDrawPoint(ev); this.drawLiveStroke(); return; }
    const p = this.pt(e), w = this.toWorld(p.x, p.y);
    if (a.kind === 'erase') { this.eraseAt(a.last, w); a.last = w; this.drawEraserCursor(p); return; }
    if (a.kind === 'crop') return this.cropMove(p);
    if (a.kind === 'cropout') return;
    if (a.kind === 'lasso') { if (a.mode === 'free') a.pts.push([p.x, p.y]); else a.pts = [a.pts[0], [p.x, p.y]]; this.drawLasso(); return; }
    if (a.kind === 'move' || a.kind === 'scale' || a.kind === 'rotate') { if (a.start) a.maxD = Math.max(a.maxD || 0, Math.hypot(p.x - a.start.x, p.y - a.start.y)); return this.moveSel(p); }
    if (a.kind === 'vnode') { if (a.start) a.maxD = Math.max(a.maxD || 0, Math.hypot(p.x - a.start.x, p.y - a.start.y)); if ((a.maxD || 0) < 1.2) return; return this.moveVNode(p); }
    if (a.kind === 'tableact') return this.moveTableAct(p);
    if (a.kind === 'shape') return this.moveShape(w);
    if (a.kind === 'table') return this.moveTable(w);
    if (a.kind === 'plugin') return this.callPlugin('onMove', e, p);
  },
  endAction(e) {
    const a = this.action; if (!a) return; this.action = null; this._lastAction = a;
    const rec = [...this.pointers.values()].find((r) => r.drawing); if (rec) rec.drawing = false;
    if (a.kind === 'tableact') return this.endTableAct();
    if (a.kind === 'crop') return this.cropEnd(a);
    if (a.kind === 'cropout') { const p = this.pt(e); if (Math.hypot(p.x - a.sx, p.y - a.sy) < 10) this.applyCrop(); return; } // tocar fora da imagem aplica
    if (a.kind === 'draw') { if (e && e.pointerType === 'pen' && e.clientX != null) { this.action = a; try { this.addDrawPoint(e); } catch (er) { console.warn(er); } this.action = null; } return this.endDraw(a); } /* v1.2.1: o ponto onde a caneta levantou também entra (a tinta nativa já ia até ele — sem isto o fim do traço "voltava" um pouco ao trocar) */
    if (a.kind === 'erase') { this.clearLive(); this.opCommit(); return; }
    if (a.kind === 'lasso') return this.endLasso(a);
    if (a.kind === 'move') { const p = this.pt(e), md = Math.max(a.maxD || 0, Math.hypot(p.x - a.start.x, p.y - a.start.y)), tap = this.isTapMove(a, md); /* v0.25.1: só é toque se quase não mexeu (antes < 8 px: arrastar um pouquinho voltava ao lugar) */ if (tap) { this.selTf = null; this.guides = null; this.ratioLabel = null; this.requestRender(); if (this.vEditEl()) return this.vTap(p, null); return this.tapOnSel(a, p); } }
    if (a.kind === 'vnode' && this.isTapMove(a, a.maxD || 0)) { this.selTf = null; this.requestRender(); return this.vTap(this.pt(e), a.node || this._vn); } /* toque num ponto (sem arrastar) */
    if (a.kind === 'move' || a.kind === 'scale' || a.kind === 'rotate' || a.kind === 'vnode') return this.endMoveSel();
    if (a.kind === 'shape') return this.endShape(a);
    if (a.kind === 'table') return this.endTable(a);
    if (a.kind === 'text') { const p = this.pt(e); if (Math.hypot(p.x - a.sx, p.y - a.sy) < 12) this.textAt(a.w); return; }
    if (a.kind === 'plugin') { this.action = a; this.callPlugin('onUp', e, this.pt(e)); this.action = null; this.opCommit(); }
  },
  cancelAction() {
    const a = this.action; this.action = null; if (!a) return;
    clearTimeout(a.holdT); clearTimeout(a.holdBk); this.clearLive(); if (this.inkOn) this.inkHide(); if (a.nat) Native.inkClear(a.nat);
    if (a.kind === 'crop' && this.crop) this.crop.c = a.fresh ? a.prev : a.c0;
    if (a.kind === 'erase' || a.kind === 'plugin') this.opCommit();
    if (a.kind === 'move' || a.kind === 'scale' || a.kind === 'rotate' || a.kind === 'vnode' || a.kind === 'tableact') { this.selTf = null; this.tPreview = null; this.guides = null; }
    this.requestRender();
  },

  /* --- Caneta e marca-texto --- */
  startDraw(base, e, p, w) {
    const inf = this.note.mode === 'infinite';
    const pi = this.pageIndexAt(w.x, w.y); if (pi < 0) return;
    const st = Store.settings.tools[base.tool];
    if (this._liveClear && this._drawnComplete) { this._liveClear = false; this.clearLive(); }
    const a = this.action = { ...base, kind: 'draw', pi, pts: [], color: st.color, width: st.width, opacity: base.tool === 'highlighter' ? st.opacity ?? 0.4 : 1, drawn: 0, snap: Instruments.snapFor(p), hold: { x: p.x, y: p.y } };
    a.dash = base.tool === 'pen' ? st.dash || 'solid' : 'solid';
    if (base.tool === 'pen') { a.pen = st.type || 'ball'; a.nib = st.nib ?? 45; a.inc = a.dash === 'solid' && (a.pen === 'ball' || a.pen === 'natural') && !colorHasAlpha(a.color); if (typeof Fades !== 'undefined') Fades.begin(a, st); } /* v0.38: cor em degradê */
    a.stab = stabLevel(base.tool, a.pen); a.inf = inf; if (e.pointerType === 'pen') Focus.writing(); // só a caneta esconde as barras do topo
    if (this.lowLat && !Native.inkOk() && e.pointerType === 'pen' && a.inc && a.tool === 'pen') this.inkBegin(); // baixa latência: tinta direto numa tela "rápida"
    this.addDrawPoint(e);
    if (base.tool === 'highlighter' && Store.settings.hlSnapPdf !== false) { const pg = this.note.pages[pi]; if (pg && pg.pdf) PdfText.prefetch(pg.pdf); } // lê o texto do PDF enquanto você passa o marca-texto
    const S0 = Store.settings;
    if (((base.tool === 'pen' && S0.straightAlways) || (base.tool === 'highlighter' && S0.hlStraight)) && !a.snap) { // sempre linhas retas
      const q = a.pts; a.straight = true;
      a.shape = { id: uid(), type: 'shape', kind: 'line', x1: q[0], y1: q[1], x2: q[0], y2: q[1], color: a.color, width: a.width, fill: null, dash: a.dash };
    }
    if (a.tool === 'pen' && e.pointerType === 'pen' && a.inc && !a.fade && !a.snap && !a.straight && Native.inkOk()) a.nat = Native.inkGo(this, a); /* v1.0: app nativo — a tinta ao vivo é desenhada pelo Android */
    this.drawLiveStroke();
  },
  addDrawPoint(ev) {
    const a = this.action; let p = this.pt(ev);
    if (a.snap) p = Instruments.project(a.snap, p);
    const w = this.toWorld(p.x, p.y), l = this.local(a.pi, w.x, w.y);
    let pr = 0.5;
    if (ev.pointerType === 'pen' && a.tool === 'pen' && (Store.settings.pressureSens ?? 0.6) > 0) pr = mapPressure(ev.pressure || 0.5);
    if (a.tool === 'pen' && !a.snap) (a.rawPts || (a.rawPts = [])).push(l.x, l.y, pr); /* v0.24.3: pontos crus (sem estabilização) para reconhecer o rabisco de apagar */
    const n = a.pts.length;
    if (n) {
      const lx = a.pts[n - 3], ly = a.pts[n - 2], lp = a.pts[n - 1];
      // "corda": nos níveis altos a ponta só puxa o traço depois de se afastar um pouquinho (some o tremido fino)
      const L = a.stab ?? 5, X = Math.max(0, L - 10), rope = a.snap ? 0 : Math.max(0, Math.min(L, 10) - 8) * 0.45 + X * 1.1; /* v0.22: "corda" só nos níveis 9–10 (antes desde o 6: arredondava e encolhia letras pequenas); v0.37.1: 11–20 corda maior (até ~12 px de tela) */
      if (rope) { const d = Math.hypot(l.x - lx, l.y - ly) * this.cam.z; if (d <= rope) { a.raw = l; return; } const t = (d - rope) / d; l.x = lx + (l.x - lx) * t; l.y = ly + (l.y - ly) * t; }
      // estabilização adaptativa: segura o tremido em movimentos lentos e acompanha os rápidos
      const sb = clamp(L / 10, 0, 1), kb = 1 - sb * 0.75 - X * 0.0145; /* 10 → 0,25; 20 → 0,105 */
      const spd = Math.hypot(l.x - lx, l.y - ly) * this.cam.z; // px de tela desde a última amostra
      const k = a.snap ? 1 : clamp(kb + spd / (40 + 80 * sb + X * 14), kb, 1);
      const x = lx + (l.x - lx) * k, y = ly + (l.y - ly) * k;
      if (Math.hypot(x - lx, y - ly) < 0.35 / this.cam.z) return;
      a.pts.push(x, y, lp + (pr - lp) * 0.45);
    } else a.pts.push(l.x, l.y, pr);
    a.raw = l;
    // reconhecimento de forma ao segurar
    if (((a.tool === 'pen' && Store.settings.shapeHold) || (a.tool === 'highlighter' && Store.settings.hlHold !== false)) && !a.snap && !a.shape) {
      if (Math.hypot(p.x - a.hold.x, p.y - a.hold.y) > 5) { a.hold = { x: p.x, y: p.y }; clearTimeout(a.holdT); clearTimeout(a.holdBk); a.holdBk = setTimeout(() => this.tryRecognize(true), 250); a.holdT = setTimeout(() => this.tryRecognize(), 600); } /* v0.34.6: colchete sai com 0,3 s parado; as outras formas continuam com 0,6 s */
    } else if (a.shape) { this.updateHeldShape(l); this.connectHeld(); }
  },
  tryRecognize(onlyBracket = false) {
    const a = this.action; if (!a || a.kind !== 'draw' || a.pts.length < 9 /* 3 pontos */ || a.shape) return;
    if (onlyBracket && a.tool !== 'pen') return;
    let r = recognizeShape(a.pts, this.cam.z);
    if (onlyBracket && !(r && r.bk)) return; /* tentativa cedo: só vale se for colchete */
    if (a.tool === 'highlighter') { // marca-texto: segurar só endireita a linha
      const n = a.pts.length; r = { kind: 'line', x1: a.pts[0], y1: a.pts[1], x2: a.pts[n - 3], y2: a.pts[n - 2] };
    }
    if (!r) return;
    if (r.kind === 'line') [r.x2, r.y2] = snapAngle(r.x1, r.y1, r.x2, r.y2);
    a.shape = { id: uid(), type: 'shape', color: a.color, width: a.width /* v0.31.1: sempre a espessura selecionada (antes 0,9×) */, fill: null, dash: a.dash, ...r };
    a.shapeAnchor = r.kind === 'line' ? null : { x1: r.x1, y1: r.y1 };
    if (a.shape.bk) { /* v0.31: colchete parecido com o último e ponto de partida para seguir a caneta sem entortar */
      a.shape = applyBracketStyle(a.shape, Store.settings.bracketStyle);
      const P = a.shape.pts, n = P.length / 2, k = n - 1, horiz = Math.abs(P[k * 2 + 1] - P[k * 2 - 1]) < 0.01;
      const l = a.raw || { x: a.pts[a.pts.length - 3], y: a.pts[a.pts.length - 2] }; /* posição real da caneta (a.pts é estabilizado e fica atrás) */
      a.bkBase = { horiz, px: l.x, py: l.y, len: Math.abs(P[k * 2] - P[k * 2 - 2]), y: P[k * 2 + 1], side: Math.sign(P[k * 2] - P[k * 2 - 2]) || 1 };
    }
    this.connectHeld();
    if (navigator.vibrate) navigator.vibrate(12);
    if (this.inkOn) this.inkHide(); // virou forma: a tinta rápida sai, a forma aparece na camada de prévia
    if (a.nat) { Native.inkClear(a.nat); a.nat = 0; }
    this.drawLiveStroke();
  },
  /* v0.31: conectar a forma do "segurar" às formas da página (connectShape em geom.js; desliga em S.shapeConnect) */
  connectHeld() {
    const a = this.action; if (!a || !a.shape || a.tool === 'highlighter' || Store.settings.shapeConnect === false) return;
    const page = this.note.pages[a.pi]; if (!page) return;
    let sh = connectShape(a.shape, page.elements, this.cam.z);
    if (sh._srcStyle) { /* v0.34.1: conectou noutro colchete → fica com o MESMO formato dele (ponta e curva), uma vez; depois a ponta ainda segue a caneta */
      const st = sh._srcStyle; delete sh._srcStyle;
      if (!a.bkSrc) { sh = applyBracketStyle(sh, { ...st, force: true }); a.bkSrc = true; const P = sh.pts, k = P.length / 2 - 1; if (a.bkBase) { a.bkBase.len = Math.abs(P[k * 2] - P[k * 2 - 2]) || a.bkBase.len; if (a.raw) { a.bkBase.px = a.raw.x; a.bkBase.py = a.raw.y; } } }
    }
    a.shape = sh;
  },
  hlLine(a) { const sh = a.shape; return { id: sh.id, type: 'stroke', tool: 'highlighter', color: a.color, width: a.width, opacity: a.opacity, cap: 'round', pts: [r2(sh.x1), r2(sh.y1), 0.5, r2(sh.x2), r2(sh.y2), 0.5] }; },
  updateHeldShape(l) {
    const a = this.action, s = a.shape;
    if (s.kind === 'path' && s.bk && a.bkBase) { /* v0.31: colchete — a ponta segue a caneta SEM sair do eixo (ponta horizontal / reta vertical) */
      const B = a.bkBase, P = s.pts.slice(), k = P.length / 2 - 1, prev = [P[k * 2 - 2], P[k * 2 - 1]];
      if (B.horiz) { const len = Math.max(4 / this.cam.z, B.len + (l.x - B.px) * B.side); P[k * 2] = r2(prev[0] + B.side * len); P[k * 2 + 1] = prev[1]; }
      else { P[k * 2] = prev[0]; P[k * 2 + 1] = r2(B.y + (l.y - B.py)); }
      a.shape = { ...s, pts: P }; return;
    }
    if (s.kind === 'path') { const P = s.pts.slice(); P[P.length - 2] = r2(l.x); P[P.length - 1] = r2(l.y); a.shape = { ...s, pts: P }; return; } /* v0.25.1: a ponta final acompanha a caneta (onde a linha termina) */
    if (s.kind === 'poly') { /* v0.25: forma reconhecida continua mudando enquanto segura a caneta */
      if (s.br) { /* colchete: a ponta onde a caneta está (fim do traço) acompanha a caneta — comprimento e o rabinho */
        const b = { ...s.br }, ax = b.v ? l.y : l.x, cr = b.v ? l.x : l.y, end = b.rev ? 'T' : 'B';
        if (end === 'B') { b.bot = Math.max(b.top + 8, ax); if (b.hB) b.hB = Math.abs(cr - b.sx) < 2 ? Math.sign(b.hB) * 2 : cr - b.sx; }
        else { b.top = Math.min(b.bot - 8, ax); if (b.hT) b.hT = Math.abs(cr - b.sx) < 2 ? Math.sign(b.hT) * 2 : cr - b.sx; }
        if (b.hT && b.hB && Math.sign(b.hT) !== Math.sign(b.hB)) { if (end === 'B') b.hB = Math.sign(b.hT) * 2; else b.hT = Math.sign(b.hB) * 2; } /* não vira "S" */
        a.shape = { ...s, ...bracketShape(b) }; return;
      }
      /* outras formas fechadas (triângulo, quadrilátero): crescem/encolhem a partir do centro, seguindo a distância da caneta */
      const P = s.pts, n = P.length / 2; let cx = 0, cy = 0; for (let i = 0; i < P.length; i += 2) { cx += P[i]; cy += P[i + 1]; } cx /= n; cy /= n;
      if (!a.polyBase) a.polyBase = { pts: P.slice(), cx, cy, d: Math.max(4, Math.hypot(l.x - cx, l.y - cy)) };
      const B = a.polyBase, k = clamp(Math.hypot(l.x - B.cx, l.y - B.cy) / B.d, 0.2, 6);
      a.shape = { ...s, pts: B.pts.map((v, i) => r2(i % 2 ? B.cy + (v - B.cy) * k : B.cx + (v - B.cx) * k)) }; return;
    }
    let x2 = l.x, y2 = l.y; if (s.kind === 'line') [x2, y2] = snapAngle(s.x1, s.y1, x2, y2);
    else { const w = Math.abs(x2 - s.x1), h = Math.abs(y2 - s.y1); if (w && h && Math.abs(w - h) / Math.max(w, h) < 0.1 && (s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'diamond')) { const m = Math.max(w, h); x2 = s.x1 + Math.sign(x2 - s.x1) * m; y2 = s.y1 + Math.sign(y2 - s.y1) * m; } }
    a.shape = { ...s, x2, y2 };
  },
  drawLiveStroke() {
    this.liveOn(); const a = this.action, c = this.lctx;
    if (a.shape) { this.clearLive(); this.pageTf(c, a.pi); drawElement(c, a.tool === 'highlighter' ? this.hlLine(a) : (a.fade ? { ...a.shape, fade: { c: a.fade.c, p: a.fade.p, o: a.fade.o } } : a.shape)); return; }
    this.pageTf(c, a.pi);
    if (a.fade) { this.clearLive(); this.pageTf(c, a.pi); drawElement(c, { type: 'stroke', tool: 'pen', pen: a.pen, nib: a.nib, color: a.color, width: a.width, dash: a.dash !== 'solid' ? a.dash : undefined, pts: a.pts, fade: a.fade }); return; } /* v0.38: degradê */
    if (a.tool === 'pen' && a.dash !== 'solid') {
      this.clearLive(); this.pageTf(c, a.pi);
      c.save(); c.strokeStyle = a.color; c.lineWidth = a.width; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash(dashPattern(a.dash, a.width));
      c.stroke(buildPolyPath(a.pts)); c.restore(); return;
    }
    if (a.tool === 'pen' && !a.inc) { // tinteiro, caligrafia, pincel e marcador fino: redesenha o traço inteiro
      this.clearLive(); this.pageTf(c, a.pi); drawElement(c, { type: 'stroke', tool: 'pen', pen: a.pen, nib: a.nib, color: a.color, width: a.width, pts: a.pts }); return;
    }
    if (a.tool === 'highlighter') {
      this.clearLive(); this.pageTf(c, a.pi);
      c.save(); c.globalAlpha = a.opacity; c.strokeStyle = a.color; c.lineWidth = a.width; c.lineCap = 'round'; c.lineJoin = 'round';
      c.stroke(buildPolyPath(a.pts)); c.restore(); return;
    }
    const n = a.pts.length / 3; const from = Math.max(0, a.drawn - 1);
    if (n - from < 1) return;
    if (a.nat) { a.drawn = n; return; } /* v1.0: o Android já desenhou */
    const tc = this.inkOn ? this.ictx : c; if (this.inkOn) this.pageTf(tc, a.pi);
    const seg = a.pts.slice(from * 3); tc.fillStyle = a.color; tc.fill(buildRadiiPath(seg, penRadii(seg, a.width, a.pen)));
    a.drawn = n;
  },
  endDraw(a) {
    clearTimeout(a.holdT); clearTimeout(a.holdBk); Focus.writingEnd();
    this._liveClear = true; this._liveT = performance.now(); this.requestRender(); // a prévia sai no próximo desenho completo (sem piscar)
    if (this.inkOn) { this._inkHide = true; this.requestRender(); } // some depois que os blocos já mostram o traço (sem piscar)
    if (a.nat) { (this._natPend || (this._natPend = [])).push(a.nat); this.requestRender(); } /* v1.0: tinta nativa sai junto, sem piscar */
    const page = this.note.pages[a.pi];
    if (a.shape && a.shape.bk) { const st = bracketStyleOf(a.shape); if (st) { Store.settings.bracketStyle = st; Store.saveSettings(); } const { bk, ...rest } = a.shape; a.shape = rest; } /* v0.31: lembra o estilo do colchete; a marca bk não fica salva */
    if (a.shape && !(a.straight && Math.hypot(a.shape.x2 - a.shape.x1, a.shape.y2 - a.shape.y1) < 2)) { this.recAdd(page, a.tool === 'highlighter' ? this.hlLine(a) : (a.fade && typeof Fades !== 'undefined' ? Fades.endShape(a, a.shape) : a.shape)); this.opCommit(); return; } /* v1.42.15: forma com degradê */
    if (a.nat && !a.shape && typeof Native !== 'undefined' && Native.inkAdopt) Native.inkAdopt(this, a); /* v1.43.2: grava os pontos que o Android desenhou */
    if (a.raw && !a.snap) { const n = a.pts.length; if (Math.hypot(a.pts[n - 3] - a.raw.x, a.pts[n - 2] - a.raw.y) > 0.5) a.pts.push(a.raw.x, a.raw.y, a.pts[n - 1]); }
    if (!a.pts.length) return;
    if (this.penTap(a, page)) return; // toque da caneta: caixinha ☐ ou toque duplo num texto
    const sp = a.rawPts && a.rawPts.length >= 24 /* 8 pontos */ ? a.rawPts : a.pts; // a estabilização arredonda o vai-e-vem rápido: o rabisco é lido nos pontos crus
    const scr = a.tool === 'pen' && !a.snap && Store.settings.scribbleErase ? isScribble(sp, this.cam.z) : 0;
    if (scr) {
      const targets = scribbleTargets(page.elements, sp, this.cam.z, scr);
      if (targets.length) { for (const e of targets) this.recRemove(page, e); this.sel = null; this.opCommit(); return; }
    }
    if (a.tool === 'highlighter' && !a.snap && ((page.pdf && Store.settings.hlSnapPdf !== false) || Store.settings.hlSnapInk !== false)) { // marca-texto no PDF: vira faixa reta exatamente sobre as linhas do texto
      const segs = (page.pdf && Store.settings.hlSnapPdf !== false ? PdfText.snap(page, a.pts) : null) || (Store.settings.hlSnapInk !== false ? PdfText.snapInk(page, a.pts) : null);
      if (segs) { for (const s of segs) { const sw = s.ink ? a.width : s.h, k = Math.min(sw * 0.4, (s.x2 - s.x1) / 2 - 0.5); this.recAdd(page, { id: uid(), type: 'stroke', tool: 'highlighter', color: a.color, width: r2(sw), opacity: a.opacity, cap: 'round', pts: [r2(s.x1 + k), r2(s.y), 0.5, r2(s.x2 - k), r2(s.y), 0.5] }); } /* pontas redondas, como o marca-texto à mão */ this.opCommit(); this.requestRender(); return; }
    }
    if (!a.snap) { /* v0.23: caneta → "melhorar escrita" automático (alisa por distância e guarda os cantos); marca-texto → alisamento leve de antes */
      const sg = a.tool === 'pen' && typeof smoothArc === 'function' ? autoBeautifySigma(this.cam.z) : 0;
      if (sg) a.pts = smoothArc(a.pts, sg * (1 + Math.max(0, (a.stab ?? 5) - 10) * 0.12)); /* v0.37.1: 11–20 também alisam mais no fim */ else if (a.tool !== 'pen') smoothStroke(a.pts, (a.stab ?? 5) / 20); /* v1.2.2: caneta com "melhorar escrita" desligado não alisa mais depois de levantar — o traço gravado fica igual ao que se viu escrevendo (a tinta nativa "voltava" um pouco na troca) */
    }
    const pts = a.pts.map((v, i) => (i % 3 === 2 ? Math.round(v * 100) / 100 : r2(v)));
    const el = { id: uid(), type: 'stroke', tool: a.tool, color: a.color, width: a.width, pts };
    if (a.tool === 'highlighter') { el.opacity = a.opacity; if (a.snap) el.cap = 'butt'; }
    if (a.tool === 'pen' && a.dash !== 'solid') el.dash = a.dash;
    if (a.tool === 'pen') { el.pen = a.pen; if (a.pen === 'calli') el.nib = a.nib; if (a.fade) Fades.end(a, el); }
    if (a.nat) Native.inkNote(this, a, el); /* v1.2.3: diagnóstico da tinta nativa (vai no relatório de problema visual) */
    this.recAdd(page, el); this.opCommit();
  },

  /* --- Borracha --- */
  eraseAt(from, to) {
    const st = Store.settings.tools.eraser, r = st.size / 2 / this.cam.z;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (r * 0.5)));
    let changed = false;
    for (let s = 1; s <= steps; s++) {
      const wx = from.x + (to.x - from.x) * (s / steps), wy = from.y + (to.y - from.y) * (s / steps);
      const pi = this.pageIndexAt(wx, wy); if (pi < 0) continue;
      const page = this.note.pages[pi], l = this.local(pi, wx, wy);
      for (let i = page.elements.length - 1; i >= 0; i--) {
        const e = page.elements[i];
        if (st.onlyHl && !(e.type === 'stroke' && e.tool === 'highlighter')) continue;
        if (e.type === 'table' || e.type === 'image' || e.lock) continue; // tabelas, imagens e bloqueados: apagar pelo laço (evita sumir ao apagar a escrita em cima)
        if (st.mode === 'area' && e.type === 'stroke') {
          const parts = eraseFromStroke(e, l.x, l.y, r);
          if (parts) { const idx = page.elements.indexOf(e); this.recRemove(page, e); parts.forEach((pp, k) => this.recAdd(page, pp, idx + k)); changed = true; }
        } else if (hitElement(e, l.x, l.y, r)) { this.recRemove(page, e); changed = true; }
      }
    }
    if (changed) { this.sel = null; this.requestRender(); }
  },
  drawEraserCursor(p) {
    this.clearLive(); const c = this.lctx, d = this.dpr; c.setTransform(d, 0, 0, d, 0, 0);
    c.beginPath(); c.arc(p.x, p.y, Store.settings.tools.eraser.size / 2, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fill(); c.strokeStyle = 'rgba(80,80,80,.8)'; c.lineWidth = 1; c.stroke();
  },
  hoverEraser(p) { this.drawEraserCursor(p); clearTimeout(this._hoverT); this._hoverT = setTimeout(() => { if (!this.action) this.clearLive(); }, 400); },

  /* --- Laço / seleção --- */
  startLasso(base, p, w) {
    const mode = (Store.settings.tools.lasso || {}).mode || 'free';
    const k = mode !== 'shot' && this.sel && this.selHit(p);
    if (k) { this.action = { ...base, kind: k, hh: this._sh, start: p, t0: performance.now(), box: this.selScreenBox(), penFree: base.ptype === 'pen' }; /* v0.25: com a caneta, mover/redimensionar/girar é sempre livre (sem grudar), como com o 2º dedo */ if (k === 'tableact') { this.action.th = this._thit; this.startTableAct(this.action); } return; }
    this.tsel = null;
    this.sel = null; this.vEdit = false; this.tEdit = false; this.requestRender();
    const pi = this.pageIndexAt(w.x, w.y, true);
    this.action = { ...base, kind: 'lasso', pi, pts: [[p.x, p.y]], mode };
  },
  lassoPoly(a) { // laço retangular/print: 4 cantos
    if (a.mode === 'free' || a.pts.length < 2) return a.pts;
    const [[x1, y1], [x2, y2]] = a.pts; return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
  },
  selLocked() { return this.selElements().some((e) => e.lock); },
  lockSel(on) {
    const page = this.pageById(this.sel.pageId);
    for (const e of this.selElements()) { const n = { ...e }; if (on) n.lock = true; else delete n.lock; this.recReplace(page, e, n); }
    this.opCommit(); toast(on ? 'Bloqueado: não move, não apaga e não é selecionado pelo laço comum' : 'Desbloqueado', 1800);
    if (on) this.sel = null; UI.buildSelBar(); this.requestRender();
  },
  /* print da área: recorta a página (com modelo, PDF e tudo) como imagem */
  async captureArea(pi, poly) {
    const page = this.note.pages[pi]; if (!page) return;
    const loc = poly.map(([x, y]) => { const w = this.toWorld(x, y); return this.local(pi, w.x, w.y); });
    let x1 = Math.min(...loc.map((q) => q.x)), y1 = Math.min(...loc.map((q) => q.y)), x2 = Math.max(...loc.map((q) => q.x)), y2 = Math.max(...loc.map((q) => q.y));
    if (this.note.mode !== 'infinite') { x1 = Math.max(0, x1); y1 = Math.max(0, y1); x2 = Math.min(page.w, x2); y2 = Math.min(page.h, y2); }
    if (x2 - x1 < 4 || y2 - y1 < 4) return hint('shot', 'Arraste para marcar a área do print');
    const area = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, sc = clamp(4096 / Math.max(area.w, area.h), 2, 8); // print nítido: até 4096 px no lado maior
    /* v1.11.1: a janela abre logo com uma prévia leve (600 px); o print nítido (render grande + PNG) e o salvar na biblioteca
       vão por trás em job.p — antes tudo isso (e mais um toDataURL do canvas grande) vinha antes da janela. job.cancel = descartado antes de salvar */
    const note = this.note, pv = await renderPageCanvas(note, page, Math.min(sc, 600 / Math.max(area.w, area.h)), { area });
    const job = { cancel: false };
    job.p = (async () => {
      const cv = await renderPageCanvas(note, page, sc, { area });
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); cv.width = cv.height = 1;
      if (job.cancel || !blob) return null;
      const id = await Store.putBlob(blob);
      const img = { id: uid(), type: 'image', x: area.x, y: area.y, w: area.w, h: area.h, blobId: id };
      const cid = await Clips.add([img], 'print');
      this.lastShot = { img, blob };
      return { img, blob, cid, blobId: id };
    })();
    UI.shotPop(pv, job);
  },
  /* alças de redimensionar: 4 cantos (proporcional) e 4 lados (estica um eixo). Sem alças dos lados em itens girados;
     no texto, só as laterais (a altura do texto acompanha o conteúdo); caixa pequena demais esconde as do meio */
  selHandles(box) {
    if (this.selElements().some((e) => e.folded)) return []; /* v1.8: post-it recolhido só move */
    const els = this.selElements(), x1 = box.x, y1 = box.y, x2 = box.x + box.w, y2 = box.y + box.h, xm = (x1 + x2) / 2, ym = (y1 + y2) / 2;
    const H = [['se', x2, y2], ['nw', x1, y1], ['ne', x2, y1], ['sw', x1, y2]];
    if (!els.some((e) => e.rot)) {
      const onlyText = els.length === 1 && els[0].type === 'text' && !els[0].sticky; /* v1.7: o post-it também tem alças em cima e embaixo */
      if (box.h > 46) H.push(['e', x2, ym], ['w', x1, ym]);
      if (box.w > 64 && !onlyText) H.push(['s', xm, y2], ['n', xm, y1]);
    }
    return H;
  },
  selHit(p) {
    const box = this.selScreenBox(); if (!box) return null;
    if (this.selLocked()) return null; // bloqueados não se movem
    /* v0.24.6: objeto pequeno (ponto, acento…): tocar DENTRO da caixa sempre move; as alças só pegam do lado de fora dos cantos.
       Antes o raio de 26 px das alças cobria a caixa inteira e não dava para arrastar coisas pequenas */
    const small = Math.min(box.w, box.h), inBox = p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
    if (this.vEditEl()) { const n = this.vHit(p); if (n) { this._vn = n; return 'vnode'; } return inBox ? 'move' : null; } /* v0.25: editar pontos da forma */
    { const tc = this.tableCells(); if (tc) { const h = this.tableHit(tc, p); this._thit = h; return h ? (h.k === 'tmove' ? 'move' : 'tableact') : null; } } /* v0.39: tabela no modo células */
    if (!(small < 70 && inBox)) { let best = null, bd = small < 70 ? 20 : 26; for (const [h, x, y] of this.selHandles(box)) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = h; } } if (best) { this._sh = best; return 'scale'; } }
    if (Math.hypot(p.x - (box.x + box.w / 2), p.y - (box.y - 34)) < 24) return 'rotate';
    if (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) return 'move';
    return null;
  },
  drawLasso() {
    this.liveOn(); const a = this.action, c = this.lctx, d = this.dpr; this.clearLive(); c.setTransform(d, 0, 0, d, 0, 0);
    c.beginPath(); this.lassoPoly(a).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    if (a.mode === 'shot') { c.fillStyle = 'rgba(236,72,153,.08)'; c.fill(); c.setLineDash([7, 4]); c.strokeStyle = '#ec4899'; c.lineWidth = 2; c.stroke(); c.setLineDash([]); return; }

    c.fillStyle = 'rgba(124,58,237,.08)'; c.fill(); c.setLineDash([5, 5]); c.strokeStyle = '#7c3aed'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
  },
  endLasso(a) {
    this.clearLive(); const page = this.note.pages[a.pi]; if (!page) return;
    if (a.mode === 'shot') { const L = Store.settings.tools.lasso; L.mode = 'free'; Store.saveSettings(); UI.renderOptions(); return this.captureArea(a.pi, this.lassoPoly(a)); } /* v0.25: depois do print o laço volta a ser o livre */
    const canSel = (e) => !e.lock || (Store.settings.tools.lasso || {}).locked;
    const toL = ([x, y]) => { const w = this.toWorld(x, y), l = this.local(a.pi, w.x, w.y); return [l.x, l.y]; };
    let len = 0; for (let i = 1; i < a.pts.length; i++) len += Math.hypot(a.pts[i][0] - a.pts[i - 1][0], a.pts[i][1] - a.pts[i - 1][1]);
    let ids = [];
    if (len < 14) { // toque: seleciona o elemento sob o dedo/caneta
      const [x, y] = toL(a.pts[0]);
      for (let i = page.elements.length - 1; i >= 0; i--) if (canSel(page.elements[i]) && hitElement(page.elements[i], x, y, 8 / this.cam.z)) { ids = [page.elements[i].id]; break; }
      if (a.ptype === 'touch' && this.tableFingerLock()) ids = ids.filter((id) => { const e = page.elements.find((x) => x.id === id); return !e || e.type !== 'table'; }); /* v1.4.1 */
      else if (!ids.length) { const t = [...page.elements].reverse().find((e) => e.type === 'table' && canSel(e) && x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h); if (t) ids = [t.id]; } // toque dentro da tabela
    } else if ((Store.settings.tools.lasso || {}).pick === 'touch') { /* v0.58: "passar por cima" */
      if (a.mode === 'rect') { /* retângulo: tudo que tiver alguma parte dentro */
        const poly = this.lassoPoly(a).map(toL), xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]), R = { x: Math.min(...xs), y: Math.min(...ys) }; R.w = Math.max(...xs) - R.x; R.h = Math.max(...ys) - R.y;
        ids = page.elements.filter((e) => { if (!canSel(e)) return false; const b = elBBox(e); if (!rectsHit(b, R)) return false; if (e.sticky && !e.folded && R.x > b.x && R.y > b.y && R.x + R.w < b.x + b.w && R.y + R.h < b.y + b.h) return false; /* v1.8: retângulo dentro do post-it não o pega */ if (e.type === 'stroke') { for (let i = 0; i < e.pts.length; i += 3) if (e.pts[i] >= R.x && e.pts[i] <= R.x + R.w && e.pts[i + 1] >= R.y && e.pts[i + 1] <= R.y + R.h) return true; return false; } return true; }).map((e) => e.id); /* formas, textos, imagens: a caixa encostar já basta */
      } else { /* v0.58.1 livre: o laço fechado de sempre, mas basta ENCOSTAR — entra o que tiver alguma parte dentro ou que o contorno do laço cruzar (a 4 px de tela) */
        const poly = this.lassoPoly(a).map(toL), tol = 4 / this.cam.z, P = [], C = [...poly, poly[0]];
        for (let i = 0; i + 1 < C.length; i++) { P.push(C[i]); const nx = C[i + 1], n = Math.min(30, Math.floor(Math.hypot(nx[0] - C[i][0], nx[1] - C[i][1]) / (tol * 0.8))); for (let k = 1; k < n; k++) P.push([C[i][0] + ((nx[0] - C[i][0]) * k) / n, C[i][1] + ((nx[1] - C[i][1]) * k) / n]); }
        const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]), R = { x: Math.min(...xs) - tol, y: Math.min(...ys) - tol }; R.w = Math.max(...xs) - R.x + tol; R.h = Math.max(...ys) - R.y + tol;
        ids = page.elements.filter((e) => {
          if (!canSel(e)) return false; const b = elBBox(e); if (!rectsHit(b, R)) return false;
          if (e.type === 'stroke') { for (let i = 0; i < e.pts.length; i += 3) if (pointInPoly(e.pts[i], e.pts[i + 1], poly)) return true; }
          else if (elInLasso(e, poly)) return true;
          if (e.sticky && !e.folded) return false; /* v1.8: post-it aberto só pela borda (como a tabela) */
          for (const [x, y] of P) if (x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol && hitElement(e, x, y, tol)) return true;
          return false;
        }).map((e) => e.id);
      }
    } else {
      const poly = this.lassoPoly(a).map(toL);
      ids = page.elements.filter((e) => canSel(e) && elInLasso(e, poly)).map((e) => e.id);
    }
    this.sel = ids.length ? { pageId: page.id, ids: new Set(ids) } : null;
    if (len < 14 && ids.length === 1) this._lastTap = { id: ids[0], t: performance.now() };
    this.requestRender();
  },
  deleteSel() { const page = this.pageById(this.sel.pageId); for (const e of this.selWithAtt()) if (!e.lock) this.recRemove(page, e); this.sel = null; this.opCommit(); }, /* v1.7: a escrita do post-it vai junto */
  copySel(record = true) { const els = this.selWithAtt(); if (!els.length) return; this.clip = clone(els); if (record) { Clips.add(els); toast(`${els.length} item(ns) copiado(s) · salvo na biblioteca`, 1400); } UI.renderOptions(); },
  cutSel() { this.copySel(); this.deleteSel(); },
  duplicateSel() { const keep = this.clip; this.copySel(false); this.paste(20); this.clip = keep || this.clip; },
  paste(offset) {
    if (!this.clip || !this.clip.length) return toast('Nada para colar');
    const pi = this.sel ? this.pageIdx(this.pageById(this.sel.pageId)) : this.currentPageIndex(); const page = this.note.pages[pi];
    const b = bboxUnion(this.clip); let dx, dy;
    if (offset) { dx = offset; dy = offset; }
    else { const c = this.toWorld(this.W / 2, this.H / 2), l = this.local(pi, c.x, c.y); dx = l.x - (b.x + b.w / 2); dy = l.y - (b.y + b.h / 2); }
    const ids = [];
    for (const e of this.clip) { const n = transformEl({ ...clone(e), id: uid() }, { ox: 0, oy: 0, sx: 1, sy: 1, dx, dy }); ids.push(n.id); this.recAdd(page, n); }
    this.opCommit(); this.sel = { pageId: page.id, ids: new Set(ids) }; if (this.tool !== 'lasso') UI.setTool('lasso', true); this.requestRender();
  },
  /* cola com o centro no ponto da tela (sx, sy), na página que está ali */
  pasteAt(els, sx, sy) {
    if (!els || !els.length || !this.note) return;
    const w = this.toWorld(sx, sy); let pi = this.pageIndexAt(w.x, w.y, true); if (pi < 0) pi = this.currentPageIndex();
    const page = this.note.pages[pi], l = this.local(pi, w.x, w.y), b = bboxUnion(els), dx = l.x - (b.x + b.w / 2), dy = l.y - (b.y + b.h / 2), ids = [];
    for (const e of els) { const n = transformEl({ ...clone(e), id: uid() }, { ox: 0, oy: 0, sx: 1, sy: 1, dx, dy }); delete n.lock; ids.push(n.id); this.recAdd(page, n); }
    this.opCommit(); this.sel = { pageId: page.id, ids: new Set(ids) }; if (this.tool !== 'lasso') UI.setTool('lasso', true); this.requestRender();
  },
  pasteElements(els) { const keep = this.clip; this.clip = clone(els); this.paste(); this.clip = keep; UI.renderOptions(); },
  /* recortar imagem: direto na página (js/crop.js) */
  recolorSel(color) {
    const page = this.pageById(this.sel.pageId);
    for (const e of this.selElements()) if (!e.lock && ['stroke', 'shape', 'text'].includes(e.type) && !e.sticky) { /* v1.7: post-it muda pela cor do papel */ const { fade, ...r } = e; this.recReplace(page, e, { ...r, color }); } /* v0.38: cor nova tira o degradê */
    this.opCommit();
  },
  /* v0.27: moldura de caixas de texto e imagens — fn(moldura atual ou null) → nova moldura (null = sem); cada mudança entra no desfazer */
  frameSel(fn) {
    const page = this.pageById(this.sel.pageId);
    for (const e of this.selElements()) if (!e.lock && ((e.type === 'text' && !e.sticky) || e.type === 'image')) { const f = fn(e.frame || null), n = { ...e }; if (f) n.frame = f; else delete n.frame; this.recReplace(page, e, n); }
    this.opCommit(); this.requestRender();
  },
  widthSel(fn) { // fn(largura atual) → nova largura; cada mudança entra no desfazer
    const page = this.pageById(this.sel.pageId);
    for (const e of this.selElements()) if (!e.lock && (e.type === 'stroke' || e.type === 'shape')) { const w = fn(e.width); if (w !== e.width) this.recReplace(page, e, { ...e, width: w }); }
    this.opCommit(); this.requestRender();
  },
  /* v0.34.2: tipo de linha da seleção (traços da caneta e formas; marca-texto fica como está) — um passo no desfazer */
  dashSel(k) {
    const page = this.pageById(this.sel.pageId);
    for (const e of this.selElements()) if (!e.lock && ((e.type === 'stroke' && e.tool === 'pen') || e.type === 'shape') && (e.dash || 'solid') !== k) { const n = { ...e }; if (k === 'solid') delete n.dash; else n.dash = k; this.recReplace(page, e, n); }
    this.opCommit(); this.requestRender();
  },
  orderSel(front) {
    const page = this.pageById(this.sel.pageId), els = this.selWithAtt(); /* v1.7: post-it leva a escrita junto (continua por cima dele) */
    for (const e of els) this.recRemove(page, e);
    els.forEach((e, k) => this.recAdd(page, e, front ? page.elements.length : k));
    this.opCommit();
  },

  /* --- Formas --- */
  startShape(base, w) {
    const pi = this.pageIndexAt(w.x, w.y, this.note.mode === 'infinite'); if (pi < 0) return;
    const st = Store.settings.tools.shape, l = this.local(pi, w.x, w.y);
    this.action = { ...base, kind: 'shape', pi, el: { id: uid(), type: 'shape', kind: st.kind, x1: l.x, y1: l.y, x2: l.x, y2: l.y, color: st.color, width: st.width, fill: st.fill ? st.fillColor : null, dash: st.dash || 'solid' } };
  },
  moveShape(w) {
    const a = this.action, l = this.local(a.pi, w.x, w.y); let { x, y } = l; const e = a.el;
    if (e.kind === 'line' || e.kind === 'arrow') [x, y] = snapAngle(e.x1, e.y1, x, y);
    else if (Store.settings.angleSnap !== false) { // quase quadrado/círculo/equilátero → exato, preso no canto inicial
      const w = Math.abs(x - e.x1), h = Math.abs(y - e.y1), sx = Math.sign(x - e.x1) || 1, sy = Math.sign(y - e.y1) || 1;
      if (e.kind === 'triangle') { const eq = w * 0.866; if (w && Math.abs(h - eq) / eq < 0.1) y = e.y1 + sy * eq; }
      else if (w && h && Math.abs(w - h) / Math.max(w, h) < 0.1) { const m = Math.max(w, h); x = e.x1 + sx * m; y = e.y1 + sy * m; }
    }
    a.el = { ...e, x2: x, y2: y };
    this.liveOn(); this.clearLive(); this.pageTf(this.lctx, a.pi); drawElement(this.lctx, a.el);
  },
  endShape(a) {
    this.clearLive(); const e = a.el;
    if (Math.hypot(e.x2 - e.x1, e.y2 - e.y1) * this.cam.z < 4) return;
    this.recAdd(this.note.pages[a.pi], e); this.opCommit();
  },

  /* --- Tabela --- */
  startTable(base, w) {
    const pi = this.pageIndexAt(w.x, w.y, this.note.mode === 'infinite'); if (pi < 0) return;
    const st = Store.settings.tools.table, l = this.local(pi, w.x, w.y);
    this.action = { ...base, kind: 'table', pi, l0: l, el: null };
  },
  tableFrom(st, x1, y1, x2, y2) { const { _w, _h, ...sp } = Tables.spec(st); return { id: uid(), type: 'table', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), ...sp }; }, /* v1.44: estrutura do painel ou modelo salvo */
  moveTable(w) {
    const a = this.action, l = this.local(a.pi, w.x, w.y);
    a.el = this.tableFrom(Store.settings.tools.table, a.l0.x, a.l0.y, l.x, l.y);
    this.liveOn(); this.clearLive(); this.pageTf(this.lctx, a.pi); drawElement(this.lctx, a.el);
  },
  endTable(a) {
    this.clearLive(); const st = Store.settings.tools.table, page = this.note.pages[a.pi];
    let el = a.el;
    if (!el || el.w * this.cam.z < 30 || el.h * this.cam.z < 20) { // toque: tamanho padrão
      const sp = Tables.spec(st), maxW = this.note.mode === 'infinite' ? 900 : page.w - 40; let W = Math.min(sp._w || sp.cols * 130, maxW), H = sp._h ? sp._h * (W / (sp._w || W)) : sp.rows * 40; /* v1.44: modelo salvo volta no tamanho em que foi salvo */
      el = this.tableFrom(st, a.l0.x, a.l0.y, a.l0.x + W, a.l0.y + H);
    }
    this.recAdd(page, el); this.opCommit();
    UI.setTool('lasso', true); this.sel = { pageId: page.id, ids: new Set([el.id]) }; this.requestRender();
  },

  /* --- Texto --- */
  /* textAt, openTextEditor, positionText e commitText ficam em richtext.js */

  /* --- Botões da caneta --- */
  penSigs(buttons) { const out = []; for (const bit of [2, 4, 8, 16, 32]) if (buttons & bit) out.push('pen:' + bit); return out; },
  penHoldTool(buttons) { const M = Store.settings.penMap || {}; for (const sg of this.penSigs(buttons)) { const a = M[sg]; if (a === 'eraser' || a === 'lasso' || a === 'highlighter') return a; } return null; },
  penClickHeld(e) { const M = Store.settings.penMap || {}; return this.penSigs(e.buttons).some((sg) => ['undo', 'redo', 'toggle', 'read', 'hyphen', 'hyphenDirect', 'gotoPage', 'stamps'].includes(M[sg]) || !!M[sg + ':2']); },
  penButtons(e) {
    if (e.pointerType !== 'pen') return;
    const b = e.type === 'pointerup' ? e.buttons & ~1 : e.buttons & ~1;
    if (PenCapture.active) { if (b) PenCapture.got(this.penSigs(b)[0]); this.penBtns = b; return; }
    if (!this.note || $('#editor').classList.contains('hidden')) { this.penBtns = b; return; }
    const rising = b & ~this.penBtns; this.penBtns = b;
    for (const sg of this.penSigs(rising)) this.firePenSig(sg);
  },
  firePenSig(sg) {
    if (PenCapture.active) return PenCapture.got(sg);
    const M = Store.settings.penMap || {}, now = performance.now();
    /* v1.42: dois toques rápidos no mesmo botão (penMap[sg + ':2']). Com ação de um toque no mesmo botão, ela espera 380 ms para ver se vem o 2º */
    if (M[sg + ':2']) {
      const pd = this._sigDbl;
      if (pd && pd.sg === sg && now - pd.t < 380) { if (now - pd.t < 40) return; clearTimeout(pd.timer); this._sigDbl = null; return this.penAction(M[sg + ':2'], true); }
      if (pd) clearTimeout(pd.timer);
      this._sigDbl = { sg, t: now, timer: M[sg] ? setTimeout(() => { this._sigDbl = null; this.penAction(M[sg]); }, 380) : null };
      return;
    }
    this.penAction(M[sg]);
  },
  penAction(a, force) {
    const now = performance.now();
    if (!force && now - (this._lastSig || 0) < 250) return; // evita disparo duplo (botão + menu de contexto)
    if (a === 'stamps') { this._lastSig = now; const t = 'pl:carimbo-texto'; if (typeof Plugins !== 'undefined' && !Plugins.tools.some((x) => x.id === t)) return toast('O carimbo de texto está desligado (Configurações → Ferramentas próprias)', 2500); if (this.tool === t) UI.setTool(this._preStamp && this._preStamp !== t ? this._preStamp : 'pen', true); else { this._preStamp = this.tool; UI.setTool(t, true); } return; } /* v1.42: ir para os carimbos (e voltar) */
    if (a === 'undo') { this._lastSig = now; this.undo();  }
    else if (a === 'redo') { this._lastSig = now; this.redo();  }
    else if (a === 'toggle') { this._lastSig = now; const t = this.tool === 'eraser' ? (this._prevTool || 'pen') : 'eraser'; if (t === 'eraser') this._prevTool = this.tool; UI.setTool(t, true); }
    else if (a === 'read') { this._lastSig = now; this.setReadOnly(!this.readOnly); }
    else if (a === 'hyphen') { this._lastSig = now; if (this._qk) this.closeQuick(); else this.openQuick(); } /* v0.45: telinha do atalho rápido (hífen / tópico / romano) */
    else if (a === 'gotoPage') { this._lastSig = now; if ($('#popRoot .gp-pop')) closePop(); else GoPage.open(); } /* v0.48 */
    else if (a === 'hyphenDirect') { this._lastSig = now; if (this._hyArm && this._hyArm.kind === 'hyphen' && !this._hyArm.panel) { this._hyArm = null;  } else { if (this._qk) this.closeQuick(); this._hyArm = { t: now, kind: 'hyphen' }; hint('hyphen', 'Hífen: toque no quadrado com a caneta', 1400); } } /* v0.47.1: hífen direto, sem telinha (antes 'bullet' = tópico) */
  },
  setReadOnly(v) {
    this.readOnly = v; this.commitText(); this.sel = null; $('#editor').classList.toggle('reading', v);
    const b = $('#btnRead'); if (b) b.classList.toggle('soft-on', v);
    toast(v ? 'Modo leitura: a caneta só rola a página' : 'Modo de edição', 1400); this.requestRender();
  },
  toggleBookmark() {
    if (this.note.mode === 'infinite') return toast('Notas em tela infinita não têm páginas');
    const p = this.note.pages[this.currentPageIndex()]; p.bookmark = !p.bookmark; this.markChanged(); this.updateHud();
    toast(p.bookmark ? 'Página marcada' : 'Marcador removido', 1000);
  },
  /* destaque amarelo da busca: flashRects(página, [retângulos], ir até lá) ou flashRects([[página, ret], …]) para vários */
  flashRects(pi, rects, go = false, hold = false) {
    if (pi == null) { this.flash = null; return this.requestRender(); }
    const items = Array.isArray(pi) ? pi : rects.map((r) => [pi, r]);
    this.flash = { items, t0: performance.now(), hold };
    if (go && items.length && this.note.mode !== 'infinite') {
      const [i, r] = items[0], o = this.layout[i]; if (o) {
        const z = this.cam.z < 0.6 ? 1 : this.cam.z; this.cam.z = z;
        this.cam.x = o.x + r.x + r.w / 2 - this.W / 2 / z; this.cam.y = o.y + r.y + r.h / 2 - this.H / 2 / z; this.clampCam();
      }
    } else if (go && items.length) { const [, r] = items[0]; this.cam.x = r.x + r.w / 2 - this.W / 2 / this.cam.z; this.cam.y = r.y + r.h / 2 - this.H / 2 / this.cam.z; }
    this.requestRender();
  },
  drawFlash(ctx) {
    const f = this.flash; if (!f) return;
    const age = performance.now() - f.t0, life = f.hold === 'keep' ? Infinity : f.hold ? 8000 : 4500; if (age > life) { this.flash = null; return; } /* v0.28: 'keep' = resultado do PDF fica marcado até tocar na página */
    const a = age < life - 1200 ? 1 : (life - age) / 1200, pulse = age < 900 ? 0.5 + 0.5 * Math.abs(Math.sin(age / 150)) : 1;
    ctx.save();
    for (const [pi, r] of f.items) {
      if (!this.layout[pi]) continue; this.pageTf(ctx, pi);
      ctx.globalAlpha = a; ctx.fillStyle = `rgba(255,213,0,${0.32 * pulse})`; ctx.strokeStyle = 'rgba(245,158,11,.95)'; ctx.lineWidth = 2 / this.cam.z;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(r.x, r.y, r.w, r.h, 4 / this.cam.z + 2) : ctx.rect(r.x, r.y, r.w, r.h); ctx.fill(); ctx.stroke();
    }
    ctx.restore(); if (life !== Infinity || age < 1200) this.requestRender();
  },
  focusElement(pi, id) {
    const page = this.note.pages[pi]; if (!page) return; const e = page.elements.find((x) => x.id === id);
    if (!e) return this.goToPage(pi);
    const b = elBBox(e), o = this.layout[pi];
    this.cam.x = o.x + b.x + b.w / 2 - this.W / 2 / this.cam.z; this.cam.y = o.y + b.y + b.h / 2 - this.H / 2 / this.cam.z; this.clampCam();
    if (this.tool !== 'lasso') UI.setTool('lasso', true);
    this.sel = { pageId: page.id, ids: new Set([id]) }; this.requestRender();
  },

  /* --- Imagens --- */
  async insertImage(file) {
    if (!file) return;
    try {
      let bmp = await createImageBitmap(file); let blob = file;
      const max = 2200;
      if (bmp.width > max || bmp.height > max || file.size > 2.5e6) {
        const s = Math.min(1, max / Math.max(bmp.width, bmp.height)); const cv = document.createElement('canvas');
        cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        blob = await new Promise((r) => cv.toBlob(r, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88));
        bmp = await createImageBitmap(blob);
      }
      const id = await Store.putBlob(blob); ImgCache.map.set(id, bmp);
      const pi = this.currentPageIndex(), page = this.note.pages[pi];
      const c = this.toWorld(this.W / 2, this.H / 2), l = this.local(pi, c.x, c.y);
      const maxW = (this.note.mode === 'infinite' ? this.W / this.cam.z : page.w) * 0.6;
      const w = Math.min(maxW, bmp.width), h = w * bmp.height / bmp.width;
      const el = { id: uid(), type: 'image', x: l.x - w / 2, y: l.y - h / 2, w, h, blobId: id };
      this.recAdd(page, el); this.opCommit();
      UI.setTool('lasso', true); this.sel = { pageId: page.id, ids: new Set([el.id]) }; this.requestRender();
    } catch (e) { console.error(e); toast('Não foi possível abrir a imagem'); }
  },

  /* --- Plugins --- */
  callPlugin(fn, e, p) {
    const a = this.action, t = a.plugin; if (!t[fn]) return;
    const w = this.toWorld(p.x, p.y), l = this.local(a.pi, w.x, w.y);
    try { t[fn]({ x: l.x, y: l.y, pressure: e.pressure || 0.5, pointerType: e.pointerType, screenX: p.x, screenY: p.y }, Plugins.api(a.pi, t.owner)); }
    catch (err) { console.error(err); toast('Erro no plugin ' + t.name + ': ' + err.message, 4000); }
  },

  /* ---------- Páginas ---------- */
  addPage(after = this.currentPageIndex(), page) {
    const ref = this.note.pages[after] || this.note.pages[0];
    const p = page || newPage(ref.pdf ? 794 : ref.w, ref.pdf ? 1123 : ref.h, ref.pdf ? null : ref.template ? clone(ref.template) : null);
    this.recPages(() => this.note.pages.splice(after + 1, 0, p)); this.afterPagesChanged(); this.goToPage(after + 1); return p;
  },
  deletePage(i) {
    if (this.note.pages.length <= 1) return toast('A nota precisa de pelo menos uma página');
    this.sel = null; this.recPages(() => this.note.pages.splice(i, 1)); this.afterPagesChanged();
  },
  duplicatePage(i) { const p = clone(this.note.pages[i]); p.id = uid(); p.elements.forEach((e) => (e.id = uid())); this.addPage(i, p); },
  movePage(i, d) { const j = i + d, P = this.note.pages; if (j < 0 || j >= P.length) return; this.recPages(() => { [P[i], P[j]] = [P[j], P[i]]; }); this.afterPagesChanged(); },
  afterPagesChanged() { this.computeLayout(); this.clampCam(); this.markChanged(); this.requestRender(); },
  goToPage(i) {
    if (this.note.mode === 'infinite') return; const o = this.layout[i]; if (!o) return;
    this.cam.y = o.y - 16 / this.cam.z; this.clampCam(); this.requestRender();
  },
};
