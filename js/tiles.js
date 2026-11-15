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
  tileMax: (navigator.deviceMemory || 4) >= 8 ? 90 : 60, previewMax: 12, tileBudgetMs: 10,
  freeCanvas(c) { if (c) { c.width = 0; c.height = 0; } }, // devolve a memória na hora (sem esperar a coleta de lixo)
  resetTiles() {
    if (this.tiles) for (const t of this.tiles.values()) this.freeCanvas(t.cv);
    if (this.pcache) for (const pc of this.pcache.values()) if (pc.preview) this.freeCanvas(pc.preview.cv);
    this.tiles = new Map(); this.pcache = new Map(); this.imgEpoch = (this.imgEpoch || 0) + 1;
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
      let area = null;
      if (pc.rs === rs && pc.els) {
        const now = this.elMap(page); let changed = 0;
        for (const [k, e] of now) if (!pc.els.has(k)) { area = unionBox(area, elBBox(e)); changed++; }
        for (const [k, e] of pc.els) if (!now.has(k)) { area = unionBox(area, elBBox(e)); changed++; }
        if (!changed) area = null; // só mudou a ordem: redesenha tudo
        pc.els = now;
      } else pc.els = this.elMap(page);
      const m = 14; if (area) area = { x: area.x - m, y: area.y - m, w: area.w + 2 * m, h: area.h + 2 * m };
      for (const [lvl, lv] of pc.levels) for (const [key, t] of lv) {
        if (area) { const [tx, ty] = key.split(',').map(Number); if (!rectsHit(area, { x: (tx * TILE) / lvl, y: (ty * TILE) / lvl, w: TILE / lvl, h: TILE / lvl })) continue; }
        t.stale = true;
      }
      if (pc.preview) pc.preview.stale = true; pc.es = es; pc.rs = rs; pc.changed = true;
    }
    return pc;
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
  renderPreview(page) { // miniatura da página inteira (fundo provisório enquanto os blocos nítidos ficam prontos)
    const s = Math.min(1.2, 640 / Math.max(page.w, page.h)), cv = this.newCanvas(Math.ceil(page.w * s), Math.ceil(page.h * s)), c = cv.getContext('2d');
    c.setTransform(s, 0, 0, s, 0, 0); drawPageContent(c, this.note, page, { x: 0, y: 0, w: page.w, h: page.h }, s / this.dpr, { dpr: this.dpr });
    return { cv, s, used: 0 };
  },
  evictTiles() {
    if (this.tiles.size <= this.tileMax) return;
    const arr = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < arr.length - this.tileMax; i++) { const [k, t] = arr[i]; if (t.used === this.frameNo) break; this.tiles.delete(k); this.freeCanvas(t.cv); const pc = this.pcache.get(t.pid); if (pc) { const lv = pc.levels.get(t.lvl); if (lv) { lv.delete(t.key); if (!lv.size) pc.levels.delete(t.lvl); } } }
    const prev = [...this.pcache.values()].filter((pc) => pc.preview).sort((a, b) => a.preview.used - b.preview.used);
    for (let i = 0; i < prev.length - this.previewMax; i++) { this.freeCanvas(prev[i].preview.cv); prev[i].preview = null; }
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
    // blocos que faltam: renderiza agora (página alterada = sempre na hora, para nada "piscar"), ou dentro do orçamento do quadro
    const mustSync = pc.changed && !st.zooming;
    for (const w of want) {
      if (lvl == null) { complete = false; break; }
      if (!mustSync && (performance.now() - st.t0 > this.tileBudgetMs || st.rendered >= 3)) { complete = false; break; }
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
  /* depois do quadro: prepara os blocos em volta da tela (rolagem sem espera) */
  schedulePrefetch() {
    clearTimeout(this._pfT);
    this._pfT = setTimeout(() => {
      if (!this.note || this.gesture || this._inertia || this.action) return this.schedulePrefetch();
      const s = this.cam.z * this.dpr, lvl = +s.toFixed(5), z = this.cam.z, m = 0.6; // 60% de uma tela acima e abaixo
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
          this.putTile(lv, nt); n++;
        }
      });
      if (n < 4 && performance.now() - t0 < 12) { // miniaturas das páginas vizinhas (fundo provisório no zoom rápido)
        const ci = Math.max(0, this.currentPageIndex());
        for (let d = 0; d <= 3 && n < 4; d++) for (const i of [ci + d, ci - d]) { const pg = this.note.pages[i]; if (!pg || performance.now() - t0 > 12) continue; const pc = this.pageCache(pg); if (!pc.preview || pc.preview.stale) { if (pc.preview) this.freeCanvas(pc.preview.cv); pc.preview = this.renderPreview(pg); pc.preview.used = this.frameNo - 1; n++; } }
      }
      this.evictTiles();
      if (n) this.schedulePrefetch();
    }, 60);
  },
});
