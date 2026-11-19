'use strict';
/* ===== Cache de desenho em blocos (tiles) =====
   Cada página é desenhada em blocos de 512 px na resolução exata da tela e guardada. Ao rolar, o app só copia os blocos prontos;
   ao dar zoom, usa os blocos que já tem (esticados) e, quando o zoom para, redesenha os visíveis em resolução exata.
   Uma página só é redesenhada quando muda (a "assinatura" do conteúdo muda). A qualidade final é a mesma do desenho direto. */
const TILE = 512;
function unionBox(a, b) { if (!b) return a; if (!a) return { ...b }; const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; }
const _oid = new WeakMap(); let _oidN = 1;
function oid(o) { if (!o || typeof o !== 'object') return 0; let n = _oid.get(o); if (!n) { n = _oidN++; _oid.set(o, n); } return n; }

Object.assign(Editor, {
  // memória: cada bloco tem 1 MB; o Chrome do Android derruba a tela (barras somem) se a memória de desenho estoura
  /* v0.23.3: limite de blocos (cada um ~1 MB). "Alta" (padrão) dá espaço para a página atual inteira ficar nítida ao tirar o zoom; "econômica" = limite antigo */
  /* v0.24.1: "Econômica" (padrão) volta à memória de antes da v0.23.1 — as barras piscavam no zoom com dois dedos (memória de desenho cheia no Android).
     Os extras (mais blocos, mais miniaturas, camada afastada e miniaturas montadas durante o gesto) ficam só na "Alta" */
  hiQ() { return Store.settings.zoomQuality === 'high'; },
  tileCap() { const big = (navigator.deviceMemory || 4) >= 8, n = this.hiQ() ? (big ? 200 : 110) : (big ? 90 : 60); /* v0.25.1: tela dividida = editor menor e o outro lado também usa memória */ const k = innerWidth ? clamp(this.W / innerWidth, 0.5, 1) : 1; return Math.round(n * (k < 0.95 ? Math.max(0.55, k) : 1)); },
  previewCap() { const n = this.hiQ() && (navigator.deviceMemory || 4) >= 8 ? 18 : 10; return innerWidth && this.W < innerWidth * 0.95 ? Math.min(n, 6) : n; },
  pfMargin: 0.35, tileBudgetMs: 10,
  freeCanvas(c) { if (c) { if (c.parentNode) c.remove(); c.width = 0; c.height = 0; } }, // devolve a memória na hora (sem esperar a coleta de lixo)
  resetTiles() {
    if (this.tiles) for (const t of this.tiles.values()) this.freeCanvas(t.cv);
    if (this.pcache) for (const pc of this.pcache.values()) { if (pc.preview) this.freeCanvas(pc.preview.cv); if (pc.pjob) this.freeCanvas(pc.pjob.cv); }
    this.tiles = new Map(); this.pcache = new Map(); this.imgEpoch = (this.imgEpoch || 0) + 1;
    if (this.wLevels) { for (const b of this.wLevels.values()) b.remove(); this.wLevels.clear(); }
    if (this.wFrames) { this.wFrames.innerHTML = ''; this._frSig = null; this._frDivs = new Map(); }
    this._curLvl = null; this._fbLvl = null; this._ovLvl = null; this._ovNext = null;
  },
  putTile(lv, t) { // guarda um bloco novo e libera o antigo que ele substitui
    const k = t.pid + '|' + t.lvl + '|' + t.key, prev = this.tiles.get(k);
    if (prev && prev !== t) this.freeCanvas(prev.cv);
    lv.set(t.key, t); this.tiles.set(k, t);
  },
  /* assinatura do conteúdo da página: muda quando qualquer item, o modelo, o tamanho, as fontes ou as imagens mudam */
  pageSig(page) {
    let h = 2166136261 ^ page.elements.length;
    for (const e of page.elements) h = Math.imul(h ^ oid(e), 16777619) >>> 0;
    return [h, `${oid(page.template)}|${oid(this.note.template)}|${page.w}|${page.h}|${oid(page.pdf)}|${Fonts.ver}|${this.imgEpoch}`];
  },
  pageCache(page) {
    if (!this.pcache) this.resetTiles();
    let pc = this.pcache.get(page.id); const [es, rs] = this.pageSig(page);
    if (!pc) { pc = { es, rs, levels: new Map(), preview: null, lastLevel: null, els: this.elMap(page) }; this.pcache.set(page.id, pc); }
    else if (pc.es !== es || pc.rs !== rs) {
      // só itens adicionados/removidos/alterados: invalida apenas os blocos da área mexida; o resto (modelo, tamanho…) invalida tudo
      let area = null, added = [], removed = 0;
      if (pc.rs === rs && pc.els) {
        const now = this.elMap(page); let changed = 0;
        for (const [k, e] of now) if (!pc.els.has(k)) { area = unionBox(area, elBBox(e)); changed++; added.push(e); }
        for (const [k, e] of pc.els) if (!now.has(k)) { area = unionBox(area, elBBox(e)); changed++; removed++; }
        if (!changed) area = null; // só mudou a ordem: redesenha tudo
        pc.els = now;
      } else pc.els = this.elMap(page);
      const m = 14; if (area) area = { x: area.x - m, y: area.y - m, w: area.w + 2 * m, h: area.h + 2 * m };
      /* v0.22: só itens novos no fim da lista (o caso de cada traço): pinta só eles por cima dos blocos que já existem.
         O resultado é igual a redesenhar (a ordem de desenho é a mesma), mas leva microssegundos em vez de redesenhar a página inteira entre um traço e outro */
      const E = page.elements, tail = added.length && !removed && added.length <= 64 ? E.slice(E.length - added.length) : null;
      const addSet = new Set(added), appendOnly = !!(tail && area && tail.every((e) => addSet.has(e)));
      for (const [lvl, lv] of pc.levels) for (const [key, t] of lv) {
        if (area) { const [tx, ty] = key.split(',').map(Number); if (!rectsHit(area, { x: (tx * TILE) / lvl, y: (ty * TILE) / lvl, w: TILE / lvl, h: TILE / lvl })) continue; }
        if (appendOnly && !t.stale && t.cv && t.cv.width) { try { this.paintOnTile(t, page, lvl, key, tail); continue; } catch (e) { console.warn(e); } }
        t.stale = true;
      }
      /* v0.23.1: miniatura também recebe só os itens novos (não fica "velha" a cada traço — ela é o fundo que aparece ao tirar o zoom) */
      let prevOk = false;
      if (appendOnly && pc.preview && !pc.preview.stale) { try { this.paintOnPreview(pc.preview, page, tail); prevOk = true; } catch (e) { console.warn(e); } }
      if (pc.preview && !prevOk) pc.preview.stale = true;
      if (pc.pjob && !appendOnly) { this.freeCanvas(pc.pjob.cv); pc.pjob = null; }
      pc.es = es; pc.rs = rs; pc.changed = true;
    }
    return pc;
  },
  paintOnTile(t, page, lvl, key, els) {
    const [tx, ty] = key.split(',').map(Number), c = t.cv.getContext('2d'), vis = { x: (tx * TILE) / lvl, y: (ty * TILE) / lvl, w: TILE / lvl, h: TILE / lvl };
    c.save(); c.setTransform(lvl, 0, 0, lvl, -tx * TILE, -ty * TILE);
    if (this.note.mode !== 'infinite') { c.beginPath(); c.rect(0, 0, page.w, page.h); c.clip(); }
    for (const e of els) if (rectsHit(elBBox(e), vis)) drawElement(c, e);
    c.restore();
  },
  paintOnPreview(pv, page, els) {
    const c = pv.cv.getContext('2d'); c.save(); c.setTransform(pv.s, 0, 0, pv.s, 0, 0);
    if (this.note.mode !== 'infinite') { c.beginPath(); c.rect(0, 0, page.w, page.h); c.clip(); }
    for (const e of els) drawElement(c, e);
    c.restore();
  },
  elMap(page) { const m = new Map(); for (const e of page.elements) m.set(oid(e), e); return m; },
  newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
  renderTile(page, pi, s, tx, ty) {
    const cv = this.newCanvas(TILE, TILE), c = cv.getContext('2d'), inf = this.note.mode === 'infinite';
    c.setTransform(s, 0, 0, s, -tx * TILE, -ty * TILE);
    const vis = { x: (tx * TILE) / s, y: (ty * TILE) / s, w: TILE / s, h: TILE / s };
    if (!inf) { c.beginPath(); c.rect(0, 0, page.w, page.h); c.clip(); }
    drawPageContent(c, this.note, page, vis, s / this.dpr, { dpr: this.dpr });
    return { cv, pdfB: page.pdf ? PdfCache.bitmap(page.pdf, s) : null, used: 0 };
  },
  /* miniatura em pedaços: fundo e modelo primeiro, depois os traços aos poucos (no máx. ~budget ms por vez).
     Antes a página inteira era desenhada de uma vez (0,3–1 s parado em notas cheias). Devolve true quando terminou. */
  previewStep(page, pc, budget) {
    const t0 = performance.now(), n = page.elements.length;
    let J = pc.pjob;
    if (!J) {
      const s = Math.min(1.2, 960 / Math.max(page.w, page.h)), cv = this.newCanvas(Math.ceil(page.w * s), Math.ceil(page.h * s)), c = cv.getContext('2d');
      c.setTransform(s, 0, 0, s, 0, 0); drawPageContent(c, this.note, page, { x: 0, y: 0, w: page.w, h: page.h }, s, { dpr: 1, range: [0, 0] });
      J = pc.pjob = { cv, c, s, i: 0 };
    }
    while (J.i < n && performance.now() - t0 < budget) { const to = Math.min(n, J.i + 24); drawPageContent(J.c, this.note, page, { x: 0, y: 0, w: page.w, h: page.h }, J.s, { dpr: 1, range: [J.i, to], noBg: true }); J.i = to; }
    if (J.i < n) return false;
    if (pc.preview) this.freeCanvas(pc.preview.cv);
    pc.preview = { cv: J.cv, s: J.s, used: this.frameNo - 1 }; pc.pjob = null; return true;
  },
  renderPreview(page) { // miniatura da página inteira (fundo provisório enquanto os blocos nítidos ficam prontos)
    const s = Math.min(1.2, 960 / Math.max(page.w, page.h)), cv = this.newCanvas(Math.ceil(page.w * s), Math.ceil(page.h * s)), c = cv.getContext('2d');
    c.setTransform(s, 0, 0, s, 0, 0); drawPageContent(c, this.note, page, { x: 0, y: 0, w: page.w, h: page.h }, s, { dpr: 1 }); // grade com 1 px da miniatura (não engrossa quando esticada)
    return { cv, s, used: 0 };
  },
  evictTiles() {
    if (this.tiles.size <= this.tileCap()) return;
    const arr = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < arr.length - this.tileCap(); i++) { const [k, t] = arr[i]; if (t.used === this.frameNo) break; this.tiles.delete(k); this.freeCanvas(t.cv); const pc = this.pcache.get(t.pid); if (pc) { const lv = pc.levels.get(t.lvl); if (lv) { lv.delete(t.key); if (!lv.size) pc.levels.delete(t.lvl); } } }
    const prev = [...this.pcache.values()].filter((pc) => pc.preview).sort((a, b) => a.preview.used - b.preview.used);
    for (let i = 0; i < prev.length - this.previewCap(); i++) { this.freeCanvas(prev[i].preview.cv); prev[i].preview = null; }
  },
  /* desenha uma página usando os blocos; devolve false se precisou adiar algo (pede outro quadro) */
  drawPageTiled(ctx, page, pi, o, vis, st) {
    const s = this.cam.z * this.dpr, inf = this.note.mode === 'infinite', pc = this.pageCache(page);
    const lvl = st.zooming ? null : +s.toFixed(5);
    const ox = Math.round((o.x - this.cam.x) * s), oy = Math.round((o.y - this.cam.y) * s); // origem da página em pixels inteiros
    const x0 = Math.max(inf ? -Infinity : 0, vis.x - o.x), y0 = Math.max(inf ? -Infinity : 0, vis.y - o.y);
    const x1 = Math.min(inf ? Infinity : page.w, vis.x - o.x + vis.w), y1 = Math.min(inf ? Infinity : page.h, vis.y - o.y + vis.h);
    if (x1 <= x0 || y1 <= y0) return true;
    const tx0 = Math.floor((x0 * s) / TILE), tx1 = Math.floor((x1 * s - 0.001) / TILE), ty0 = Math.floor((y0 * s) / TILE), ty1 = Math.floor((y1 * s - 0.001) / TILE);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; // blocos nítidos vão 1:1; o esticado é só durante o zoom
    if (!inf) { ctx.beginPath(); ctx.rect(ox, oy, Math.round(page.w * s), Math.round(page.h * s)); ctx.clip(); }
    const lv = lvl != null ? pc.levels.get(lvl) || (pc.levels.set(lvl, new Map()), pc.levels.get(lvl)) : null;
    const want = [];
    let complete = true;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const key = tx + ',' + ty, t = lv && lv.get(key);
      const fresh = t && !t.stale && (!page.pdf || t.pdfB === PdfCache.bitmap(page.pdf, s));
      if (!fresh) want.push([tx, ty, key]);
    }
    if (want.length > 1) { const cx = this.cMain.width / 2 - ox, cy = this.cMain.height / 2 - oy, d = (w) => Math.hypot((w[0] + 0.5) * TILE - cx, (w[1] + 0.5) * TILE - cy); want.sort((a, b) => d(a) - d(b)); } // do centro da tela para fora
    // blocos que faltam: renderiza agora (página alterada = sempre na hora, para nada "piscar"), ou dentro do orçamento do quadro
    const mustSync = pc.changed && !st.zooming;
    for (const w of want) {
      if (lvl == null) { complete = false; break; }
      const idle = !this.gesture && !this._inertia && !this.action; // parado: pode caprichar mais por quadro (some o borrão mais rápido)
      if (!mustSync && (performance.now() - st.t0 > (idle ? 28 : this.tileBudgetMs) || st.rendered >= (idle ? 10 : 3))) { complete = false; break; }
      const t = this.renderTile(page, pi, s, w[0], w[1]); t.pid = page.id; t.lvl = lvl; t.key = w[2];
      this.putTile(lv, t); st.rendered++;
    }
    if (lvl != null && complete) { pc.changed = false; pc.lastLevel = lvl; }
    // fundo provisório onde ainda falta bloco nítido: miniatura da página + blocos do último zoom esticados
    const missing = lvl == null || want.some((w) => { const t = lv.get(w[2]); return !t || t.stale; });
    if (missing) {
      let oldLvl = pc.lastLevel != null && pc.lastLevel !== lvl && pc.levels.has(pc.lastLevel) ? pc.lastLevel : null;
      if (oldLvl == null) for (const k of pc.levels.keys()) if (k !== lvl && pc.levels.get(k).size && (oldLvl == null || Math.abs(k - s) < Math.abs(oldLvl - s))) oldLvl = k;
      const old = oldLvl != null ? pc.levels.get(oldLvl) : null;
      // blocos antigos que caem na tela; se não cobrem toda a parte visível da página, a miniatura vai por baixo
      const vx0 = Math.max(ox, 0), vy0 = Math.max(oy, 0), vx1 = Math.min(ox + page.w * s, this.cMain.width), vy1 = Math.min(oy + page.h * s, this.cMain.height);
      const olds = []; let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, area = 0;
      if (old) { const k = s / oldLvl; for (const [key, t] of old) { if (t.stale) continue; const [tx, ty] = key.split(',').map(Number); const dx = ox + tx * TILE * k, dy = oy + ty * TILE * k, dw = TILE * k; if (dx > this.cMain.width || dy > this.cMain.height || dx + dw < 0 || dy + dw < 0) continue; olds.push([t, dx, dy, dw]); cx0 = Math.min(cx0, dx); cy0 = Math.min(cy0, dy); cx1 = Math.max(cx1, dx + dw); cy1 = Math.max(cy1, dy + dw); area += dw * dw; } }
      const covered = olds.length && cx0 <= vx0 + 1 && cy0 <= vy0 + 1 && cx1 >= vx1 - 1 && cy1 >= vy1 - 1 && area >= (vx1 - vx0) * (vy1 - vy0) * 0.98;
      if (!covered && pc.preview && !pc.preview.stale) { pc.preview.used = this.frameNo; ctx.drawImage(pc.preview.cv, ox, oy, page.w * s, page.h * s); } // miniatura (preparada em segundo plano)
      if (olds.length) { ctx.imageSmoothingQuality = s / oldLvl < 0.6 ? 'medium' : 'low'; /* afastando muito: suaviza de verdade para as linhas finas da grade não sumirem */ for (const [t, dx, dy, dw] of olds) { t.used = this.frameNo; ctx.drawImage(t.cv, dx, dy, dw, dw); } ctx.imageSmoothingQuality = 'low'; }
    }
    if (lv) for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const t = lv.get(tx + ',' + ty); if (t && !t.stale) { t.used = this.frameNo; ctx.drawImage(t.cv, ox + tx * TILE, oy + ty * TILE); } }
    ctx.restore();
    return !missing;
  },
  /* ======== Camada de composição (v0.13) ========
     Os blocos prontos ficam como elementos na tela, dentro de uma "folha" que só é movida/ampliada com transform CSS.
     Rolar e dar zoom viram trabalho da placa de vídeo (como num app nativo): nada é redesenhado a cada quadro. */
  domInit() {
    if (this.world) return;
    const w = document.createElement('div'); w.className = 'world'; this.stage.insertBefore(w, this.cMain);
    const fr = document.createElement('div'); fr.className = 'w-frames'; w.append(fr);
    this.world = w; this.wFrames = fr; this.wLevels = new Map(); this._frDivs = new Map();
  },
  domMode() { return !this.noTiles; },
  /* baixa latência: copia o que está na tela para a tela rápida e passa a desenhar a tinta nela */
  inkKey() { const c = this.cam; return `${c.x}|${c.y}|${c.z}|${this.note && this.note.updated}|${this.W}x${this.H}|${this._layoutVer || 0}|${this.sel ? 'S' : ''}${this.flash ? 'F' : ''}${this.guides ? 'G' : ''}${this.textEl ? 'T' : ''}`; },
  /* fundo da tela rápida pronto antes de a caneta encostar (quando a tela está parada e os blocos prontos) */
  inkPrepLater() {
    if (!this.cInk || this.inkOn || this._inkPrepT) return;
    const go = () => { this._inkPrepT = null; if (!this.note || this.inkOn || this.action || !this._drawnComplete || this._inkKey === this.inkKey()) return; this.inkPaint(); };
    this._inkPrepT = window.requestIdleCallback ? requestIdleCallback(go, { timeout: 400 }) : setTimeout(go, 120);
  },
  inkBegin() {
    const c = this.cInk; if (!c || !this.note) return;
    if (c.width === this.cMain.width && c.height === this.cMain.height && this._inkKey === this.inkKey()) { c.style.display = 'block'; this.inkOn = true; return; } // já pronto
    this.inkPaint(); c.style.display = 'block'; this.inkOn = true;
  },
  inkPaint() {
    const c = this.cInk, x = this.ictx; if (!c || !this.note) return;
    if (c.width !== this.cMain.width || c.height !== this.cMain.height) { c.width = this.cMain.width; c.height = this.cMain.height; }
    const z = this.cam.z, vis = { x: this.cam.x, y: this.cam.y, w: this.W / z, h: this.H / z }, st = { t0: performance.now(), rendered: 0, zooming: false }, inf = this.note.mode === 'infinite';
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = inf ? (this.note.template && this.note.template.paper) || '#fff' : this.desk; x.fillRect(0, 0, c.width, c.height);
    this.note.pages.forEach((page, i) => {
      const o = this.layout[i]; if (!inf && !rectsHit({ x: o.x, y: o.y, w: page.w, h: page.h }, vis)) return;
      if (!inf) { this.pageTf(x, i); x.fillStyle = '#fff'; x.fillRect(0, 0, page.w, page.h); }
      this.drawPageTiled(x, page, i, o, vis, st);
    });
    x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(this.cMain, 0, 0); // seleção, destaques etc.
    this._inkKey = this.inkKey();
  },
  inkHide() { if (this.cInk) this.cInk.style.display = 'none'; this.inkOn = false; this._inkKey = null; /* tinta ao vivo ficou nela: prepara de novo */ },
  levelBox(lvl) { let b = this.wLevels.get(lvl); if (!b) { b = document.createElement('div'); b.className = 'w-lvl'; this.world.append(b); this.wLevels.set(lvl, b); } return b; },
  placeTile(t, pi) { // posição do bloco em px de tela no nível em que foi desenhado (alinhado aos pixels)
    const o = this.layout[pi]; if (!o) return; const L = t.lvl, d = this.dpr, inf = this.note.mode === 'infinite';
    const [tx, ty] = t.key.split(',').map(Number), bx = inf ? 0 : Math.round(o.x * L), by = inf ? 0 : Math.round(o.y * L);
    const st = t.cv.style; st.left = (bx + tx * TILE) / d + 'px'; st.top = (by + ty * TILE) / d + 'px'; st.width = st.height = TILE / d + 'px';
    t.cv.className = 'wt'; if (t.cv.parentNode !== this.levelBox(L)) this.levelBox(L).append(t.cv);
  },
  /* molduras das páginas (papel + sombra) e miniaturas por baixo dos blocos */
  syncFrames() {
    const n = this.note, inf = n.mode === 'infinite';
    const sig = (this._layoutVer || 0) + '|' + n.pages.length + '|' + oid(n.template) + '|' + n.pages.map((p) => p.id + oid(p.template) + p.w + 'x' + p.h).join(',');
    if (sig !== this._frSig) {
      this._frSig = sig; this.wFrames.innerHTML = ''; this._frDivs = new Map();
      this.stage.style.background = inf ? (n.template && n.template.paper) || '#fff' : '';
      if (!inf) n.pages.forEach((p, i) => {
        const o = this.layout[i], tpl = p.template || n.template, f = document.createElement('div'); f.className = 'pgf';
        Object.assign(f.style, { left: o.x + 'px', top: o.y + 'px', width: p.w + 'px', height: p.h + 'px', background: p.pdf ? '#fff' : (tpl && tpl.paper) || '#fff' });
        this.wFrames.append(f); this._frDivs.set(p.id, f);
      });
      for (const t of this.tiles.values()) { const pi = n.pages.findIndex((p) => p.id === t.pid); if (pi >= 0) this.placeTile(t, pi); } // páginas mudaram de lugar
    }
  },
  attachPreview(page, pc) { const f = this._frDivs.get(page.id); if (!f || !pc.preview) return; pc.preview.used = this.frameNo; const cv = pc.preview.cv; if (cv.parentNode !== f) { cv.className = 'pgprev'; f.append(cv); } }, // a velha fica até a nova ficar pronta
  /* um quadro na camada de composição: só ajusta transformações e encaixa os blocos que faltam (dentro do orçamento) */
  drawDom(vis, st, skipPages) {
    this.domInit(); this.world.style.display = '';
    const z = this.cam.z, d = this.dpr, s = z * d, n = this.note, inf = n.mode === 'infinite';
    this.syncFrames();
    this.world.style.transform = `translate3d(${Math.round(-this.cam.x * s) / d}px,${Math.round(-this.cam.y * s) / d}px,0)`;
    this.wFrames.style.transform = `scale(${z})`;
    const lvl = st.zooming ? null : +s.toFixed(5);
    /* v0.23.1: a reserva (blocos esticados durante/depois do zoom) é sempre o último nível que ficou COMPLETO.
       Antes, uma pausa no meio do gesto fazia um nível pela metade virar reserva e o completo sumia (partes da página desapareciam) */
    if (lvl != null && lvl !== this._curLvl) { if (this._curLvl != null && (this._curDone || this._fbLvl == null)) this._fbLvl = this._curLvl; this._curLvl = lvl; this._curDone = false; }
    for (const [L, b] of this.wLevels) {
      const show = L === this._curLvl || L === this._fbLvl || L === this._ovLvl; // + camada "afastada" por baixo de tudo
      b.style.display = show ? '' : 'none';
      if (show) { b.style.transform = Math.abs(s / L - 1) < 1e-6 ? '' : `scale(${s / L})`; b.style.zIndex = L === this._curLvl && lvl != null ? 3 : L === this._curLvl || L === this._fbLvl ? 2 : 1; }
      if (!b.childElementCount && L !== this._curLvl && L !== this._fbLvl && L !== this._ovLvl && L !== this._ovNext) { b.remove(); this.wLevels.delete(L); }
    }
    let allDone = true, fbNeeded = false; const needPrev = [];
    n.pages.forEach((page, i) => {
      const o = this.layout[i]; if (!inf && !rectsHit({ x: o.x, y: o.y, w: page.w, h: page.h }, vis)) return;
      const pc = this.pageCache(page); this.attachPreview(page, pc); this.keepVisible(pc, page, o, vis);
      if (this.hiQ() && !inf && (!pc.preview || pc.preview.stale) && (lvl == null || this.gesture || this._inertia)) needPrev.push([page, pc]); // só na qualidade alta: criar miniatura no meio do gesto aloca memória
      const f = this._frDivs.get(page.id); if (f) f.classList.toggle('direct', skipPages.has(page.id));
      if (skipPages.has(page.id)) return; // esta página está sendo desenhada direto na camada de cima
      if (lvl == null) { allDone = false; fbNeeded = true; return; }
      const lv = pc.levels.get(lvl) || (pc.levels.set(lvl, new Map()), pc.levels.get(lvl));
      const x0 = Math.max(inf ? -Infinity : 0, vis.x - o.x), y0 = Math.max(inf ? -Infinity : 0, vis.y - o.y), x1 = Math.min(inf ? Infinity : page.w, vis.x - o.x + vis.w), y1 = Math.min(inf ? Infinity : page.h, vis.y - o.y + vis.h);
      if (x1 <= x0 || y1 <= y0) return;
      const want = [];
      for (let ty = Math.floor((y0 * s) / TILE); ty <= Math.floor((y1 * s - 0.001) / TILE); ty++) for (let tx = Math.floor((x0 * s) / TILE); tx <= Math.floor((x1 * s - 0.001) / TILE); tx++) {
        const key = tx + ',' + ty, t = lv.get(key);
        if (t && !t.stale && (!page.pdf || t.pdfB === PdfCache.bitmap(page.pdf, s))) { t.used = this.frameNo; if (!t.cv.parentNode) this.placeTile(t, i); } else want.push([tx, ty, key]);
      }
      if (want.length > 1) { const cx = (vis.x + vis.w / 2 - o.x) * s, cy = (vis.y + vis.h / 2 - o.y) * s, dd = (w) => Math.hypot((w[0] + 0.5) * TILE - cx, (w[1] + 0.5) * TILE - cy); want.sort((a, b) => dd(a) - dd(b)); }
      const mustSync = pc.changed, moving = !!(this.gesture || this._inertia);
      for (const w of want) {
        if (!mustSync && (performance.now() - st.t0 > (moving ? 5 : 24) || st.rendered >= (moving ? 1 : 10))) { allDone = false; fbNeeded = true; break; }
        const t = this.renderTile(page, i, s, w[0], w[1]); t.pid = page.id; t.lvl = lvl; t.key = w[2]; t.used = this.frameNo;
        this.putTile(lv, t); this.placeTile(t, i); st.rendered++;
      }
      if (!want.length || want.every((w) => { const t = lv.get(w[2]); return t && !t.stale; })) { pc.changed = false; pc.lastLevel = lvl; } else { allDone = false; fbNeeded = true; }
    });
    if (!fbNeeded && lvl != null) this._curDone = true;
    if (!fbNeeded && this._fbLvl != null && lvl != null) { const b = this.wLevels.get(this._fbLvl); if (b) b.style.display = 'none'; this._fbLvl = null; } // nível novo completo: some o antigo
    /* E) durante zoom/rolagem: monta aos poucos a miniatura das páginas que entram na tela sem ter uma (fundo para não aparecer página em branco) */
    if (needPrev.length) { const t0 = performance.now(); for (const [page, pc] of needPrev) { const left = 4 - (performance.now() - t0); if (left <= 0.5) { allDone = false; break; } if (this.previewStep(page, pc, left)) this.attachPreview(page, pc); else allDone = false; } }
    return allDone;
  },
  /* camada "afastada": blocos com METADE do zoom atual cobrindo 2× a largura e a altura da tela, feitos aos poucos quando a tela está parada.
     Ao tirar o zoom, as bordas que aparecem já têm conteúdo nítido (no máximo 2× esticado), em vez da miniatura borrada da página.
     Só troca a camada visível quando a nova está completa. */
  prefetchOverview(t0) {
    if (!this.hiQ()) { if (this._ovLvl != null || this._ovNext != null) { this._ovLvl = null; this._ovNext = null; this.requestRender(); } return 0; } // camada afastada só na qualidade alta
    /* v0.23.3: cobre a PÁGINA ATUAL INTEIRA (mais 2× a área da tela em volta), com ~71% do zoom atual (esticada no máx. 1,4× no começo do gesto).
       Se a página pedir blocos demais (zoom muito alto), cai para 50% do zoom, para não pesar */
    const d = this.dpr, s = this.cam.z * d, inf = this.note.mode === 'infinite';
    const z = this.cam.z, vw = this.W / z, vh = this.H / z, view2 = { x: this.cam.x - vw / 2, y: this.cam.y - vh / 2, w: vw * 2, h: vh * 2 };
    const ci = inf ? -1 : this.currentPageIndex(), cp = ci >= 0 ? this.note.pages[ci] : null, co = cp ? this.layout[ci] : null;
    const tilesFor = (L) => (cp ? Math.ceil((cp.w * L) / TILE) * Math.ceil((cp.h * L) / TILE) : 0);
    /* orçamento de memória: o que sobra do limite depois dos blocos do zoom atual (tela + margem de pré-carga) */
    const tiles = (L, a) => Math.max(0, Math.ceil((a.w * L) / TILE) + 1) * Math.max(0, Math.ceil((a.h * L) / TILE) + 1);
    const curNeed = tiles(s, { w: vw * 1.3, h: vh * (1 + 2 * this.pfMargin) }), budget = this.tileCap() - curNeed - 8;
    const need = (L) => tilesFor(L) + (inf ? tiles(L, view2) : Math.round(tiles(L, view2) * 0.5)); // página atual inteira + parte das vizinhas
    let L = null; for (const f of [0.7071, 0.5, 0.3536]) { const c = +(s * f).toFixed(5); if (need(c) <= budget) { L = c; break; } }
    if (L == null || L < 0.45 * d) return 0; // sem espaço, ou já bem afastado (a página inteira cabe na tela e os blocos normais dão conta)
    if (this._ovNext !== L && this._ovLvl !== L) this._ovNext = L;
    let n = 0, missing = 0;
    this.note.pages.forEach((page, i) => {
      const o = this.layout[i], isCur = i === ci;
      const area = isCur ? { x: o.x, y: o.y, w: page.w, h: page.h } : view2;
      if (!inf && !rectsHit({ x: o.x, y: o.y, w: page.w, h: page.h }, view2) && !isCur) return;
      const pc = this.pageCache(page), lv = pc.levels.get(L) || (pc.levels.set(L, new Map()), pc.levels.get(L));
      const x0 = Math.max(inf ? -Infinity : 0, area.x - o.x), y0 = Math.max(inf ? -Infinity : 0, area.y - o.y), x1 = Math.min(inf ? Infinity : page.w, area.x - o.x + area.w), y1 = Math.min(inf ? Infinity : page.h, area.y - o.y + area.h);
      if (x1 <= x0 || y1 <= y0) return;
      /* da tela para fora: os blocos mais perto do centro da tela primeiro */
      const want = [], cx = (this.cam.x + vw / 2 - o.x) * L, cy = (this.cam.y + vh / 2 - o.y) * L;
      for (let ty = Math.floor((y0 * L) / TILE); ty <= Math.floor((y1 * L - 0.001) / TILE); ty++) for (let tx = Math.floor((x0 * L) / TILE); tx <= Math.floor((x1 * L - 0.001) / TILE); tx++) {
        const key = tx + ',' + ty, t = lv.get(key); if (t && !t.stale) { t.used = this.frameNo; continue; }
        want.push([tx, ty, key, Math.hypot((tx + 0.5) * TILE - cx, (ty + 0.5) * TILE - cy)]);
      }
      want.sort((a, b) => a[3] - b[3]);
      for (const [tx, ty, key] of want) {
        if (performance.now() - t0 > 12 || n >= 4) { missing++; continue; }
        const nt = this.renderTile(page, i, L, tx, ty); nt.pid = page.id; nt.lvl = L; nt.key = key; nt.used = this.frameNo;
        this.putTile(lv, nt); if (this.domMode()) this.placeTile(nt, i); n++;
      }
    });
    if (!missing && !n && this._ovLvl !== L) { this._ovLvl = L; this._ovNext = null; this.requestRender(); } // completa: passa a ser a camada de baixo
    return n || (missing ? 1 : 0);
  },
  /* blocos da reserva que estão na tela e a miniatura não podem ser descartados da memória enquanto aparecem */
  keepVisible(pc, page, o, vis) {
    if (pc.preview) pc.preview.used = this.frameNo;
    const inf = this.note.mode === 'infinite';
    for (const L of [this._fbLvl, this._curLvl, this._ovLvl, this._ovNext]) {
      const lv = L != null && pc.levels.get(L); if (!lv) continue;
      if ((L === this._ovLvl || L === this._ovNext) && L !== this._curLvl) { for (const t of lv.values()) t.used = this.frameNo; continue; } // camada afastada: inteira (é pequena e é ela que cobre ao tirar o zoom)
      for (const [key, t] of lv) { const [tx, ty] = key.split(',').map(Number), r = { x: (inf ? 0 : o.x) + (tx * TILE) / L, y: (inf ? 0 : o.y) + (ty * TILE) / L, w: TILE / L, h: TILE / L }; if (rectsHit(r, vis)) t.used = this.frameNo; }
    }
  },
  /* depois do quadro: prepara os blocos em volta da tela (rolagem sem espera) */
  schedulePrefetch() {
    clearTimeout(this._pfT);
    this._pfT = setTimeout(() => {
      if (!this.note || this.gesture || this._inertia || this.action) return this.schedulePrefetch();
      const s = this.cam.z * this.dpr, lvl = +s.toFixed(5), z = this.cam.z, m = this.pfMargin; // v0.23.3: 35% de uma tela acima e abaixo (antes 60%; a camada afastada cobre a rolagem)
      const vis = { x: this.cam.x - (this.W / z) * 0.15, y: this.cam.y - (this.H / z) * m, w: (this.W / z) * 1.3, h: (this.H / z) * (1 + 2 * m) };
      const t0 = performance.now(); let n = 0;
      this.note.pages.forEach((page, i) => {
        if (performance.now() - t0 > 12 || n >= 4) return;
        const o = this.layout[i], inf = this.note.mode === 'infinite';
        if (!inf && !rectsHit({ x: o.x, y: o.y, w: page.w, h: page.h }, vis)) return;
        const pc = this.pageCache(page); const lv = pc.levels.get(lvl) || (pc.levels.set(lvl, new Map()), pc.levels.get(lvl));
        const x0 = Math.max(inf ? -Infinity : 0, vis.x - o.x), y0 = Math.max(inf ? -Infinity : 0, vis.y - o.y), x1 = Math.min(inf ? Infinity : page.w, vis.x - o.x + vis.w), y1 = Math.min(inf ? Infinity : page.h, vis.y - o.y + vis.h);
        if (x1 <= x0 || y1 <= y0) return;
        for (let ty = Math.floor((y0 * s) / TILE); ty <= Math.floor((y1 * s - 0.001) / TILE); ty++) for (let tx = Math.floor((x0 * s) / TILE); tx <= Math.floor((x1 * s - 0.001) / TILE); tx++) {
          if (performance.now() - t0 > 12 || n >= 4) return;
          const key = tx + ',' + ty, t = lv.get(key); if (t && !t.stale) continue;
          const nt = this.renderTile(page, i, s, tx, ty); nt.pid = page.id; nt.lvl = lvl; nt.key = key; nt.used = this.frameNo - 1;
          this.putTile(lv, nt); if (this.domMode()) this.placeTile(nt, i); n++;
        }
      });
      if (!n) n += this.prefetchOverview(t0); // v0.23.2: camada afastada (metade do zoom, área 2×) para tirar o zoom sem desfoque
      if (n < 4 && performance.now() - t0 < 12) { // miniaturas das páginas vizinhas (fundo provisório no zoom rápido)
        const ci = Math.max(0, this.currentPageIndex());
        for (let d = 0; d <= 4 && n < 4; d++) for (const i of [ci + d, ci - d]) { const pg = this.note.pages[i]; const left = 12 - (performance.now() - t0); if (!pg || left <= 1) continue; const pc = this.pageCache(pg); if (!pc.preview || pc.preview.stale) { if (this.previewStep(pg, pc, left) && this.domMode()) this.attachPreview(pg, pc); n++; } }
      }
      this.evictTiles();
      if (n) this.schedulePrefetch();
    }, 60);
  },
});
