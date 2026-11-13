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
    this.ctx = this.cMain.getContext('2d', this.lowLat ? { alpha: false, desynchronized: true } : { alpha: false });
    this.lctx = this.cLive.getContext('2d');
    const s = this.stage;
    s.addEventListener('pointerdown', (e) => this.onDown(e));
    s.addEventListener('pointermove', (e) => this.onMove(e));
    s.addEventListener('pointerup', (e) => this.onUp(e));
    s.addEventListener('pointercancel', (e) => this.onUp(e, true));
    s.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    new ResizeObserver(() => { if (this.note) { this.resize(); } }).observe(s);
    ImgCache.onReady = () => this.requestRender();
    PdfCache.onReady = () => this.requestRender();
    window.addEventListener('keydown', (e) => this.onKey(e));
    // atalhos dos botões da caneta (capturados antes de tudo)
    for (const t of ['pointerdown', 'pointermove', 'pointerup']) window.addEventListener(t, (e) => this.penButtons(e), true);
    window.addEventListener('contextmenu', (e) => { if (e.pointerType === 'pen' && (this.note || PenCapture.active)) { e.preventDefault(); this.firePenSig('pen:ctx'); } }, true);
    this.saveDebounced = debounce(() => this.saveNow(), 900);
    this.thumbDebounced = debounce(() => this.updateThumb(), 8000);
    this.ocrDebounced = debounce(() => OCR.scheduleNote(this.note), 12000);
  },

  /* ---------- Abrir / salvar ---------- */
  async open(id) {
    const note = await Store.getNote(id); if (!note) { toast('Nota não encontrada'); return false; }
    this.note = note; this.undoStack = []; this.redoStack = []; this.sel = null; this.selTf = null; this.action = null; this.editingId = null;
    this.readOnly = false; $('#editor').classList.remove('reading'); { const rb = $('#btnRead'); if (rb) rb.classList.remove('soft-on'); }
    $('#noteTitle').value = note.title;
    this.desk = getComputedStyle(document.documentElement).getPropertyValue('--desk').trim() || '#d9dde3';
    this.computeLayout(); this.resize(true);
    if (note.view) { this.cam = { ...note.view }; this.clampCam(); } else this.fitWidth();
    UI.buildToolbar(); UI.renderOptions(); this.updateUndoBtns(); Instruments.sync();
    this.requestRender();
    return true;
  },
  async close() {
    this.commitText(); this.ocrDebounced.cancel(); await this.saveNow(); await this.updateThumb(); OCR.scheduleNote(this.note);
    Instruments.hideAll(); this.note = null;
  },
  markChanged() {
    if (!this.note) return;
    this.note.updated = Date.now(); this.saveDebounced(); this.thumbDebounced(); this.ocrDebounced(); this.updateUndoBtns();
  },
  async saveNow() {
    if (!this.note) return; this.saveDebounced.cancel();
    this.note.view = { ...this.cam }; this.note.title = $('#noteTitle').value.trim() || 'Nota sem título';
    await Store.putNote(this.note);
  },
  async updateThumb() { if (!this.note) return; const t = await makeThumb(this.note); if (t) await Store.setThumb(this.note.id, t); },

  /* ---------- Layout e câmera ---------- */
  computeLayout() {
    const n = this.note;
    if (n.mode === 'infinite') { this.layout = [{ x: 0, y: 0 }]; this.maxW = 0; this.totalH = 0; return; }
    let y = 0, mw = 0;
    this.layout = n.pages.map((p) => { const o = { x: -p.w / 2, y }; y += p.h + GAP; mw = Math.max(mw, p.w); return o; });
    this.totalH = y - GAP; this.maxW = mw;
  },
  resize(silent) {
    const r = this.stage.getBoundingClientRect(); this.dpr = Math.min(3, devicePixelRatio || 1);
    this.W = r.width; this.H = r.height; this.rect = r;
    for (const c of [this.cMain, this.cLive]) { c.width = Math.round(r.width * this.dpr); c.height = Math.round(r.height * this.dpr); }
    if (!silent) { this.clampCam(); this.requestRender(); Instruments.redraw(); }
  },
  fitWidth() {
    if (this.note.mode === 'infinite') { this.cam = { x: -40, y: -40, z: 1 }; return this.requestRender(); }
    const z = clamp((this.W - 32) / this.maxW, 0.2, 3); this.cam.z = z;
    this.cam.x = -this.W / (2 * z); this.cam.y = -16 / z; this.clampCam(); this.requestRender();
  },
  zoomLimits() { return this.note.mode === 'infinite' ? [0.1, 8] : [0.2, 8]; },
  clampCam() {
    const [a, b] = this.zoomLimits(); const c = this.cam; c.z = clamp(c.z, a, b);
    if (this.note.mode === 'infinite') return;
    const vw = this.W / c.z, vh = this.H / c.z, L = -this.maxW / 2, R = this.maxW / 2, m = 60 / c.z;
    if (R - L <= vw) c.x = (L + R) / 2 - vw / 2; else c.x = clamp(c.x, L - m, R + m - vw);
    c.y = clamp(c.y, -vh + 120 / c.z, this.totalH - 120 / c.z);
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
  requestRender() { if (this.needs) return; this.needs = true; requestAnimationFrame(() => { this.needs = false; this.draw(); }); },
  draw() {
    if (!this.note) return;
    const ctx = this.ctx, z = this.cam.z, d = this.dpr, note = this.note, inf = note.mode === 'infinite';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = this.desk; ctx.fillRect(0, 0, this.cMain.width, this.cMain.height);
    const vis = { x: this.cam.x, y: this.cam.y, w: this.W / z, h: this.H / z };
    const skip = new Set(); if (this.editingId) skip.add(this.editingId);
    const selActive = this.sel && this.selTf; if (selActive) for (const id of this.sel.ids) skip.add(id);
    note.pages.forEach((page, i) => {
      const o = this.layout[i];
      const pr = inf ? vis : { x: o.x, y: o.y, w: page.w, h: page.h };
      if (!inf && !rectsHit(pr, vis)) return;
      this.pageTf(ctx, i); ctx.save();
      let lv = { x: vis.x - o.x, y: vis.y - o.y, w: vis.w, h: vis.h };
      if (!inf) {
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 10 * d; ctx.shadowOffsetY = 2 * d; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, page.w, page.h); ctx.restore();
        ctx.beginPath(); ctx.rect(0, 0, page.w, page.h); ctx.clip();
        const x1 = Math.max(0, lv.x), y1 = Math.max(0, lv.y); lv = { x: x1, y: y1, w: Math.min(page.w, lv.x + lv.w) - x1, h: Math.min(page.h, lv.y + lv.h) - y1 };
      }
      drawPageContent(ctx, note, page, lv, z, { dpr: d, skip });
      if (this.textEl && this.textCtx && this.textCtx.page === page && this.textCtx.el.sticky) drawElement(ctx, { ...this.textCtx.el, text: '' }); // post-it em edição
      if (selActive && this.sel.pageId === page.id) {
        const t = this.selTf;
        if (t.rot != null) { ctx.translate(t.cx, t.cy); ctx.rotate(t.rot); ctx.translate(-t.cx, -t.cy); }
        else { ctx.translate(t.ox + t.dx, t.oy + t.dy); ctx.scale(t.sx, t.sy); ctx.translate(-t.ox, -t.oy); }
        for (const e of page.elements) if (this.sel.ids.has(e.id)) drawElement(ctx, e);
      }
      ctx.restore();
    });
    const a = this.action;
    if (this.lowLat && a && a.kind === 'draw' && a.tool === 'pen' && a.dash === 'solid' && !a.shape && a.pts.length) { this.pageTf(ctx, a.pi); ctx.fillStyle = a.color; ctx.fill(buildPenPath(a.pts, a.width)); }
    this.drawSelection(); this.updateHud(); this.positionText();
  },
  selElements() { if (!this.sel) return []; const p = this.pageById(this.sel.pageId); return p ? p.elements.filter((e) => this.sel.ids.has(e.id)) : []; },
  selScreenBox() {
    const els = this.selElements(); if (!els.length) return null;
    const b = bboxUnion(els), pi = this.pageIdx(this.pageById(this.sel.pageId)), o = this.layout[pi], t = this.selTf;
    let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
    if (t && t.rot == null) { const f = (x, y) => [t.ox + (x - t.ox) * t.sx + t.dx, t.oy + (y - t.oy) * t.sy + t.dy]; [x1, y1] = f(x1, y1); [x2, y2] = f(x2, y2); }
    const a = this.toScreen(x1 + o.x, y1 + o.y), c = this.toScreen(x2 + o.x, y2 + o.y);
    return { x: a.x - 6, y: a.y - 6, w: c.x - a.x + 12, h: c.y - a.y + 12, local: b };
  },
  drawSelection() {
    const bar = $('#selBar');
    if (!this.sel) { bar.classList.add('hidden'); return; }
    const box = this.selScreenBox();
    if (!box) { this.sel = null; bar.classList.add('hidden'); return; }
    const ctx = this.ctx, d = this.dpr; ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.save(); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(box.x + box.w, box.y + box.h, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.arc(box.x + box.w, box.y + box.h, 4, 0, Math.PI * 2); ctx.fill();
    const rx = box.x + box.w / 2, ry = box.y - 34; // alça de rotação
    ctx.beginPath(); ctx.moveTo(rx, box.y); ctx.lineTo(rx, ry + 11); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(rx, ry, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(rx, ry, 5, -Math.PI * 0.9, Math.PI * 0.4); ctx.stroke();
    if (this.selTf && this.selTf.rot != null) { ctx.fillStyle = '#2563eb'; ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(Math.round(this.selTf.rot * 180 / Math.PI) + '°', rx, ry - 18); }
    ctx.restore();
    if (this.selTf) { bar.classList.add('hidden'); return; }
    if (bar.classList.contains('hidden') || bar.dataset.n !== String(this.sel.ids.size)) UI.buildSelBar();
    bar.classList.remove('hidden'); bar.dataset.n = this.sel.ids.size;
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    let y = box.y - bh - 52; if (y < 6) y = box.y + box.h + 16; if (y + bh > this.H - 6) y = clamp(box.y + 10, 6, this.H - bh - 6);
    bar.style.left = clamp(box.x + box.w / 2 - bw / 2, 6, this.W - bw - 6) + 'px'; bar.style.top = y + 'px';
  },
  updateHud() {
    $('#hudZoom').textContent = Math.round(this.cam.z * 100) + '%';
    const hp = $('#hudPage');
    if (this.note.mode === 'infinite') hp.classList.add('hidden');
    else { hp.classList.remove('hidden'); hp.textContent = `${this.currentPageIndex() + 1} / ${this.note.pages.length}`; }
    const bm = $('#btnBookmark'); if (bm) { const pg = this.note.pages[this.currentPageIndex()]; bm.classList.toggle('soft-on', !!(pg && pg.bookmark)); }
  },
  clearLive() { const c = this.lctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cLive.width, this.cLive.height); },

  /* ---------- Histórico (desfazer/refazer) ---------- */
  opBegin() { if (!this.curOp) this.curOp = { changes: [] }; },
  recAdd(page, el, i = page.elements.length) { this.opBegin(); page.elements.splice(i, 0, el); this.curOp.changes.push({ p: page.id, k: 'add', el, i }); },
  recRemove(page, el) { const i = page.elements.indexOf(el); if (i < 0) return; this.opBegin(); page.elements.splice(i, 1); this.curOp.changes.push({ p: page.id, k: 'rem', el, i }); },
  recReplace(page, old, el) { const i = page.elements.indexOf(old); if (i < 0) return; this.opBegin(); page.elements[i] = el; this.curOp.changes.push({ p: page.id, k: 'rep', old, el, i }); },
  opCommit() {
    const op = this.curOp; this.curOp = null;
    if (op && op.changes.length) { this.undoStack.push(op); if (this.undoStack.length > 300) this.undoStack.shift(); this.redoStack = []; this.markChanged(); }
    this.requestRender();
  },
  undo() {
    this.commitText(); const op = this.undoStack.pop(); if (!op) return;
    for (let j = op.changes.length - 1; j >= 0; j--) {
      const c = op.changes[j], page = this.pageById(c.p); if (!page) continue; const els = page.elements;
      if (c.k === 'add') { const i = els.findIndex((e) => e.id === c.el.id); if (i >= 0) els.splice(i, 1); }
      else if (c.k === 'rem') els.splice(Math.min(c.i, els.length), 0, c.el);
      else { const i = els.findIndex((e) => e.id === c.el.id); if (i >= 0) els[i] = c.old; }
    }
    this.redoStack.push(op); this.sel = null; this.markChanged(); this.requestRender();
  },
  redo() {
    const op = this.redoStack.pop(); if (!op) return;
    for (const c of op.changes) {
      const page = this.pageById(c.p); if (!page) continue; const els = page.elements;
      if (c.k === 'add') els.splice(Math.min(c.i, els.length), 0, c.el);
      else if (c.k === 'rem') { const i = els.findIndex((e) => e.id === c.el.id); if (i >= 0) els.splice(i, 1); }
      else { const i = els.findIndex((e) => e.id === c.old.id); if (i >= 0) els[i] = c.el; }
    }
    this.undoStack.push(op); this.sel = null; this.markChanged(); this.requestRender();
  },
  updateUndoBtns() { const u = $('#btnUndo'), r = $('#btnRedo'); if (u) u.disabled = !this.undoStack.length; if (r) r.disabled = !this.redoStack.length; },

  /* ---------- Entrada ---------- */
  pt(e) { return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top }; },
  touchIds() { return [...this.pointers.entries()].filter(([, p]) => p.type === 'touch' && !p.ignored && !p.drawing).map(([id]) => id); },
  onDown(e) {
    if (!this.note) return;
    this.rect = this.stage.getBoundingClientRect();
    if (this.textEl && e.target === this.textEl) return;
    if (e.target.closest && e.target.closest('#selBar')) return; // botões da seleção não iniciam novo laço
    if (UI.panelOpen) UI.closePanel();
    try { this.stage.setPointerCapture(e.pointerId); } catch (_) {}
    const p = this.pt(e); const rec = { ...p, sx: p.x, sy: p.y, type: e.pointerType, t0: performance.now() };
    this.pointers.set(e.pointerId, rec);
    if (e.pointerType === 'pen') { this.penDown = true; this.lastPenSeen = performance.now(); if (this.gesture) this.endGesture(); }
    if (this.readOnly && e.pointerType !== 'touch') { rec.type = 'touch'; this.startGesture(); return; } // modo leitura: caneta só navega
    if (e.pointerType === 'pen' && (!(e.buttons & 1) || this.penClickHeld(e))) { rec.ignored = true; return; } // sem encostar (só botão) ou botão com atalho de clique: não desenha
    if (e.pointerType === 'touch') {
      if (Store.settings.palmGuard && (this.penDown || performance.now() - this.lastPenSeen < 500)) { rec.ignored = true; return; }
      const drawingTouch = this.action && this.action.ptype === 'touch';
      if (!this.gesture && !drawingTouch && this.touchIds().length === 1 && this.sel && !this.readOnly) { // dedo também move, redimensiona e gira a seleção
        const k = this.selHit(p);
        if (k) { rec.drawing = true; this.action = { pid: e.pointerId, ptype: 'touch', tool: 'lasso', sx: p.x, sy: p.y, kind: k, start: p, box: this.selScreenBox() }; return; }
      }
      if (Store.settings.fingerDraws && !this.readOnly && !this.gesture && !drawingTouch && this.touchIds().length === 1) { rec.drawing = true; this.startAction(e, p); return; }
      if (drawingTouch) { const ap = this.pointers.get(this.action.pid); this.cancelAction(); if (ap) ap.drawing = false; }
      this.startGesture(); return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) { rec.type = 'touch'; this.startGesture(); return; }
    if (this.action) return;
    this.startAction(e, p);
  },
  onMove(e) {
    if (!this.note) return;
    if (e.pointerType === 'pen') this.lastPenSeen = performance.now();
    const rec = this.pointers.get(e.pointerId);
    if (!rec) { if (e.pointerType === 'pen' && this.tool === 'eraser') this.hoverEraser(this.pt(e)); return; }
    const p = this.pt(e); rec.x = p.x; rec.y = p.y;
    if (rec.ignored) return;
    if (this.action && this.action.pid === e.pointerId) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      this.moveAction(evs && evs.length ? evs : [e], e); return;
    }
    if (this.gesture) this.moveGesture();
  },
  onUp(e, cancel = false) {
    if (!this.note) return;
    const rec = this.pointers.get(e.pointerId); this.pointers.delete(e.pointerId);
    if (e.pointerType === 'pen') { this.penDown = false; this.lastPenSeen = performance.now(); }
    if (!rec) return;
    if (this.action && this.action.pid === e.pointerId) { if (cancel) this.cancelAction(); else this.endAction(e); return; }
    if (this.gesture) {
      if (!this.touchIds().length) this.endGesture(); else this.rebaseGesture();
    }
  },
  onWheel(e) {
    if (!this.note) return; e.preventDefault();
    if (e.ctrlKey || e.metaKey) { const p = this.pt(e); this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.01)); }
    else { this.cam.x += e.deltaX / this.cam.z; this.cam.y += e.deltaY / this.cam.z; this.clampCam(); this.requestRender(); }
  },
  zoomAt(sx, sy, f) { const w = this.toWorld(sx, sy); this.cam.z *= f; this.clampCam(); this.cam.x = w.x - sx / this.cam.z; this.cam.y = w.y - sy / this.cam.z; this.clampCam(); this.requestRender(); Instruments.redraw(); },
  onKey(e) {
    if (!this.note || $('#editor').classList.contains('hidden')) return;
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const ksig = 'key:' + (e.code || e.key); if ((Store.settings.penMap || {})[ksig]) { e.preventDefault(); return this.firePenSig(ksig); }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.redo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'c') this.copySel();
    else if ((e.ctrlKey || e.metaKey) && k === 'v') this.paste();
    else if ((k === 'delete' || k === 'backspace') && this.sel) this.deleteSel();
    else if (!e.ctrlKey && !e.metaKey) { const m = { p: 'pen', h: 'highlighter', e: 'eraser', l: 'lasso', s: 'shape', t: 'text' }[k]; if (m) UI.setTool(m); }
  },

  /* ---------- Gestos de navegação ---------- */
  startGesture() { this.gesture = { t0: performance.now(), moved: false, max: 0 }; this.rebaseGesture(); },
  rebaseGesture() {
    const g = this.gesture; if (!g) return;
    const ids = this.touchIds(); g.max = Math.max(g.max, ids.length);
    const P = ids.map((id) => this.pointers.get(id));
    g.cam = { ...this.cam }; g.n = P.length;
    if (P.length >= 2) { g.mid = { x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2 }; g.dist = Math.hypot(P[0].x - P[1].x, P[0].y - P[1].y) || 1; }
    else if (P.length === 1) g.mid = { x: P[0].x, y: P[0].y };
  },
  moveGesture() {
    const g = this.gesture, ids = this.touchIds(); if (!ids.length) return;
    if (ids.length !== g.n) this.rebaseGesture();
    const P = ids.map((id) => this.pointers.get(id));
    for (const p of P) if (Math.hypot(p.x - p.sx, p.y - p.sy) > 10) g.moved = true;
    if (P.length >= 2) {
      const mid = { x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2 }, dist = Math.hypot(P[0].x - P[1].x, P[0].y - P[1].y) || 1;
      const [a, b] = this.zoomLimits(); const z = clamp(g.cam.z * dist / g.dist, a, b);
      const wx = g.cam.x + g.mid.x / g.cam.z, wy = g.cam.y + g.mid.y / g.cam.z;
      this.cam = { z, x: wx - mid.x / z, y: wy - mid.y / z };
    } else {
      const p = P[0]; this.cam = { z: g.cam.z, x: g.cam.x - (p.x - g.mid.x) / g.cam.z, y: g.cam.y - (p.y - g.mid.y) / g.cam.z };
    }
    this.clampCam(); this.requestRender(); if (P.length >= 2) Instruments.redraw();
  },
  endGesture() {
    const g = this.gesture; this.gesture = null; if (!g) return;
    const dt = performance.now() - g.t0;
    if (!g.moved && dt < 350) { if (g.max === 2) { this.undo(); toast('Desfeito', 900); } else if (g.max === 3) { this.redo(); toast('Refeito', 900); } }
  },

  /* ---------- Ações de ferramenta ---------- */
  startAction(e, p) {
    const wasEditing = !!this.textEl;
    this.commitText();
    let tool = this.tool;
    if (e.pointerType === 'pen') { const h = this.penHoldTool(e.buttons); if (h) tool = h; }
    const w = this.toWorld(p.x, p.y);
    const base = { pid: e.pointerId, ptype: e.pointerType, tool, sx: p.x, sy: p.y };
    if (tool === 'pen' || tool === 'highlighter') return this.startDraw(base, e, p, w);
    if (tool === 'eraser') { this.action = { ...base, kind: 'erase', last: w }; this.eraseAt(w, w); this.drawEraserCursor(p); return; }
    if (tool === 'lasso') return this.startLasso(base, p, w);
    if (tool === 'shape') return this.startShape(base, w);
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
    if (a.kind === 'lasso') { a.pts.push([p.x, p.y]); this.drawLasso(); return; }
    if (a.kind === 'move' || a.kind === 'scale' || a.kind === 'rotate') return this.moveSel(p);
    if (a.kind === 'shape') return this.moveShape(w);
    if (a.kind === 'plugin') return this.callPlugin('onMove', e, p);
  },
  endAction(e) {
    const a = this.action; if (!a) return; this.action = null;
    const rec = [...this.pointers.values()].find((r) => r.drawing); if (rec) rec.drawing = false;
    if (a.kind === 'draw') return this.endDraw(a);
    if (a.kind === 'erase') { this.clearLive(); this.opCommit(); return; }
    if (a.kind === 'lasso') return this.endLasso(a);
    if (a.kind === 'move' || a.kind === 'scale' || a.kind === 'rotate') return this.endMoveSel();
    if (a.kind === 'shape') return this.endShape(a);
    if (a.kind === 'text') { const p = this.pt(e); if (Math.hypot(p.x - a.sx, p.y - a.sy) < 12) this.textAt(a.w); return; }
    if (a.kind === 'plugin') { this.action = a; this.callPlugin('onUp', e, this.pt(e)); this.action = null; this.opCommit(); }
  },
  cancelAction() {
    const a = this.action; this.action = null; if (!a) return;
    clearTimeout(a.holdT); this.clearLive();
    if (a.kind === 'erase' || a.kind === 'plugin') this.opCommit();
    if (a.kind === 'move' || a.kind === 'scale' || a.kind === 'rotate') { this.selTf = null; }
    this.requestRender();
  },

  /* --- Caneta e marca-texto --- */
  startDraw(base, e, p, w) {
    const inf = this.note.mode === 'infinite';
    const pi = this.pageIndexAt(w.x, w.y); if (pi < 0) return;
    const st = Store.settings.tools[base.tool];
    const a = this.action = { ...base, kind: 'draw', pi, pts: [], color: st.color, width: st.width, opacity: base.tool === 'highlighter' ? st.opacity ?? 0.4 : 1, drawn: 0, snap: Instruments.snapFor(p), hold: { x: p.x, y: p.y } };
    a.dash = base.tool === 'pen' ? st.dash || 'solid' : 'solid';
    a.inf = inf; this.addDrawPoint(e);
    if (base.tool === 'pen' && Store.settings.straightAlways && !a.snap) { // sempre linhas retas
      const q = a.pts; a.straight = true;
      a.shape = { id: uid(), type: 'shape', kind: 'line', x1: q[0], y1: q[1], x2: q[0], y2: q[1], color: a.color, width: a.width, fill: null, dash: a.dash };
    }
    this.drawLiveStroke();
  },
  addDrawPoint(ev) {
    const a = this.action; let p = this.pt(ev);
    if (a.snap) p = Instruments.project(a.snap, p);
    const w = this.toWorld(p.x, p.y), l = this.local(a.pi, w.x, w.y);
    let pr = 0.5;
    if (ev.pointerType === 'pen' && a.tool === 'pen' && (Store.settings.pressureSens ?? 0.6) > 0) pr = mapPressure(ev.pressure || 0.5);
    const n = a.pts.length;
    if (n) {
      const lx = a.pts[n - 3], ly = a.pts[n - 2], lp = a.pts[n - 1];
      const k = a.snap ? 1 : 1 - clamp(Store.settings.stabilizer, 0, 0.95) * 0.8;
      const x = lx + (l.x - lx) * k, y = ly + (l.y - ly) * k;
      if (Math.hypot(x - lx, y - ly) < 0.35 / this.cam.z) return;
      a.pts.push(x, y, lp + (pr - lp) * 0.45);
    } else a.pts.push(l.x, l.y, pr);
    a.raw = l;
    // reconhecimento de forma ao segurar
    if (a.tool === 'pen' && Store.settings.shapeHold && !a.snap && !a.shape) {
      if (Math.hypot(p.x - a.hold.x, p.y - a.hold.y) > 5) { a.hold = { x: p.x, y: p.y }; clearTimeout(a.holdT); a.holdT = setTimeout(() => this.tryRecognize(), 600); }
    } else if (a.shape) this.updateHeldShape(l);
  },
  tryRecognize() {
    const a = this.action; if (!a || a.kind !== 'draw' || a.pts.length < 12) return;
    const r = recognizeShape(a.pts); if (!r) return;
    if (r.kind === 'line') [r.x2, r.y2] = snapAngle(r.x1, r.y1, r.x2, r.y2);
    a.shape = { id: uid(), type: 'shape', color: a.color, width: Math.max(1, a.width * 0.9), fill: null, dash: a.dash, ...r };
    a.shapeAnchor = r.kind === 'line' ? null : { x1: r.x1, y1: r.y1 };
    if (navigator.vibrate) navigator.vibrate(12);
    if (this.lowLat) this.requestRender();
    this.drawLiveStroke();
  },
  updateHeldShape(l) {
    const a = this.action, s = a.shape;
    if (s.kind === 'poly') return;
    let x2 = l.x, y2 = l.y; if (s.kind === 'line') [x2, y2] = snapAngle(s.x1, s.y1, x2, y2);
    a.shape = { ...s, x2, y2 };
  },
  drawLiveStroke() {
    const a = this.action, c = this.lctx;
    if (a.shape) { this.clearLive(); this.pageTf(c, a.pi); drawElement(c, a.shape); return; }
    this.pageTf(c, a.pi);
    if (a.tool === 'pen' && a.dash !== 'solid') {
      this.clearLive(); this.pageTf(c, a.pi);
      c.save(); c.strokeStyle = a.color; c.lineWidth = a.width; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash(dashPattern(a.dash, a.width));
      c.stroke(buildPolyPath(a.pts)); c.restore(); return;
    }
    if (a.tool === 'highlighter') {
      this.clearLive(); this.pageTf(c, a.pi);
      c.save(); c.globalAlpha = a.opacity; c.strokeStyle = a.color; c.lineWidth = a.width; c.lineCap = 'round'; c.lineJoin = 'round';
      c.stroke(buildPolyPath(a.pts)); c.restore(); return;
    }
    const n = a.pts.length / 3; const from = Math.max(0, a.drawn - 1);
    if (n - from < 1) return;
    const tc = this.lowLat ? this.ctx : c; if (this.lowLat) this.pageTf(tc, a.pi);
    tc.fillStyle = a.color; tc.fill(buildPenPath(a.pts.slice(from * 3), a.width));
    a.drawn = n;
  },
  endDraw(a) {
    clearTimeout(a.holdT); this.clearLive();
    const page = this.note.pages[a.pi];
    if (a.shape && !(a.straight && Math.hypot(a.shape.x2 - a.shape.x1, a.shape.y2 - a.shape.y1) < 2)) { this.recAdd(page, a.shape); this.opCommit(); return; }
    if (a.raw && !a.snap) { const n = a.pts.length; if (Math.hypot(a.pts[n - 3] - a.raw.x, a.pts[n - 2] - a.raw.y) > 0.5) a.pts.push(a.raw.x, a.raw.y, a.pts[n - 1]); }
    if (!a.pts.length) return;
    if (a.tool === 'pen' && !a.snap && Store.settings.scribbleErase && isScribble(a.pts)) {
      const targets = scribbleTargets(page.elements, a.pts);
      if (targets.length) { for (const e of targets) this.recRemove(page, e); this.sel = null; this.opCommit(); return; }
    }
    const pts = a.pts.map((v, i) => (i % 3 === 2 ? Math.round(v * 100) / 100 : r2(v)));
    const el = { id: uid(), type: 'stroke', tool: a.tool, color: a.color, width: a.width, pts };
    if (a.tool === 'highlighter') { el.opacity = a.opacity; if (a.snap) el.cap = 'butt'; }
    if (a.tool === 'pen' && a.dash !== 'solid') el.dash = a.dash;
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
    const k = this.sel && this.selHit(p);
    if (k) { this.action = { ...base, kind: k, start: p, box: this.selScreenBox() }; return; }
    this.sel = null; this.requestRender();
    const pi = this.pageIndexAt(w.x, w.y, true);
    this.action = { ...base, kind: 'lasso', pi, pts: [[p.x, p.y]] };
  },
  selHit(p) {
    const box = this.selScreenBox(); if (!box) return null;
    if (Math.hypot(p.x - (box.x + box.w), p.y - (box.y + box.h)) < 28) return 'scale';
    if (Math.hypot(p.x - (box.x + box.w / 2), p.y - (box.y - 34)) < 24) return 'rotate';
    if (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) return 'move';
    return null;
  },
  drawLasso() {
    const a = this.action, c = this.lctx, d = this.dpr; this.clearLive(); c.setTransform(d, 0, 0, d, 0, 0);
    c.beginPath(); a.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    c.fillStyle = 'rgba(37,99,235,.08)'; c.fill(); c.setLineDash([5, 5]); c.strokeStyle = '#2563eb'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
  },
  endLasso(a) {
    this.clearLive(); const page = this.note.pages[a.pi]; if (!page) return;
    const toL = ([x, y]) => { const w = this.toWorld(x, y), l = this.local(a.pi, w.x, w.y); return [l.x, l.y]; };
    let len = 0; for (let i = 1; i < a.pts.length; i++) len += Math.hypot(a.pts[i][0] - a.pts[i - 1][0], a.pts[i][1] - a.pts[i - 1][1]);
    let ids = [];
    if (len < 14) { // toque: seleciona o elemento sob o dedo/caneta
      const [x, y] = toL(a.pts[0]);
      for (let i = page.elements.length - 1; i >= 0; i--) if (hitElement(page.elements[i], x, y, 8 / this.cam.z)) { ids = [page.elements[i].id]; break; }
    } else {
      const poly = a.pts.map(toL);
      ids = page.elements.filter((e) => elInLasso(e, poly)).map((e) => e.id);
    }
    this.sel = ids.length ? { pageId: page.id, ids: new Set(ids) } : null;
    this.requestRender();
  },
  moveSel(p) {
    const a = this.action, z = this.cam.z;
    const b = bboxUnion(this.selElements());
    if (a.kind === 'move') this.selTf = { ox: b.x, oy: b.y, sx: 1, sy: 1, dx: (p.x - a.start.x) / z, dy: (p.y - a.start.y) / z };
    else if (a.kind === 'rotate') {
      const c = { x: a.box.x + a.box.w / 2, y: a.box.y + a.box.h / 2 };
      let ang = Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(a.start.y - c.y, a.start.x - c.x);
      const sn = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12); if (Math.abs(ang - sn) < 0.05) ang = sn; // gruda a cada 15°
      this.selTf = { ox: b.x, oy: b.y, sx: 1, sy: 1, dx: 0, dy: 0, rot: ang, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
    } else {
      const bw = a.box.w, bh = a.box.h;
      const s = Math.max(0.05, Math.max((bw + (p.x - a.start.x)) / bw, (bh + (p.y - a.start.y)) / bh));
      this.selTf = { ox: b.x, oy: b.y, sx: s, sy: s, dx: 0, dy: 0 };
    }
    this.requestRender();
  },
  endMoveSel() {
    const t = this.selTf; this.selTf = null; if (!t) return this.requestRender();
    const page = this.pageById(this.sel.pageId);
    for (const e of this.selElements()) this.recReplace(page, e, t.rot != null ? rotateEl(e, t.rot, t.cx, t.cy) : transformEl(e, t));
    this.opCommit();
  },
  deleteSel() { const page = this.pageById(this.sel.pageId); for (const e of this.selElements()) this.recRemove(page, e); this.sel = null; this.opCommit(); },
  copySel() { const els = this.selElements(); if (!els.length) return; this.clip = clone(els); toast(`${els.length} item(ns) copiado(s)`, 1200); UI.renderOptions(); },
  cutSel() { this.copySel(); this.deleteSel(); },
  duplicateSel() { this.copySel(); this.paste(20); },
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
  recolorSel(color) {
    const page = this.pageById(this.sel.pageId);
    for (const e of this.selElements()) if (['stroke', 'shape', 'text'].includes(e.type)) this.recReplace(page, e, { ...e, color });
    this.opCommit();
  },
  orderSel(front) {
    const page = this.pageById(this.sel.pageId), els = this.selElements();
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
    a.el = { ...e, x2: x, y2: y };
    this.clearLive(); this.pageTf(this.lctx, a.pi); drawElement(this.lctx, a.el);
  },
  endShape(a) {
    this.clearLive(); const e = a.el;
    if (Math.hypot(e.x2 - e.x1, e.y2 - e.y1) * this.cam.z < 4) return;
    this.recAdd(this.note.pages[a.pi], e); this.opCommit();
  },

  /* --- Texto --- */
  textAt(w) {
    const pi = this.pageIndexAt(w.x, w.y, this.note.mode === 'infinite'); if (pi < 0) return;
    const page = this.note.pages[pi], l = this.local(pi, w.x, w.y);
    const hit = [...page.elements].reverse().find((e) => e.type === 'text' && hitElement(e, l.x, l.y, 4));
    const st = Store.settings.tools.text, sk = Store.settings.tools.sticky;
    let el;
    if (hit) el = hit;
    else if (this.tool === 'sticky') el = { id: uid(), type: 'text', sticky: true, bg: sk.bg, x: l.x - 20, y: l.y - 20, w: 220, minH: 200, text: '', size: sk.size, color: sk.color, bold: false };
    else el = { id: uid(), type: 'text', x: l.x, y: l.y - st.size * 0.6, w: Math.min(360, this.note.mode === 'infinite' ? 360 : Math.max(80, page.w - l.x - 30)), text: '', size: st.size, color: st.color, bold: st.bold };
    this.openTextEditor(page, el, !hit);
  },
  openTextEditor(page, el, isNew) {
    this.commitText();
    const ta = document.createElement('textarea'); ta.className = 'text-edit'; ta.spellcheck = true;
    ta.value = el.text; this.textEl = ta; this.textCtx = { page, el, isNew }; this.editingId = isNew ? null : el.id;
    ta.style.color = el.color; ta.style.font = textFont({ ...el, size: el.size });
    this.overlay.append(ta); this.positionText();
    ta.addEventListener('input', () => this.positionText());
    ta.addEventListener('blur', () => setTimeout(() => this.commitText(), 0));
    setTimeout(() => ta.focus(), 30); this.requestRender();
  },
  positionText() {
    const ta = this.textEl; if (!ta) return;
    const { page, el } = this.textCtx; const pi = this.pageIdx(page), o = this.layout[pi], z = this.cam.z;
    const pad = el.sticky ? STICKY_PAD : 0;
    const s = this.toScreen(el.x + pad + o.x, el.y + pad + o.y);
    ta.style.left = s.x + 'px'; ta.style.top = s.y + 'px'; ta.style.width = el.w - 2 * pad + 'px';
    ta.style.background = el.sticky ? 'transparent' : '';
    ta.style.transform = `scale(${z})`; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px';
  },
  commitText() {
    const ta = this.textEl; if (!ta) return; this.textEl = null; this.editingId = null;
    const { page, el, isNew } = this.textCtx; const text = ta.value.replace(/\s+$/, ''); ta.remove();
    if (isNew) { if (text || el.sticky) this.recAdd(page, { ...el, text }); }
    else if (!text && !el.sticky) this.recRemove(page, el);
    else if (text !== el.text) this.recReplace(page, el, { ...el, text });
    this.opCommit();
  },

  /* --- Botões da caneta --- */
  penSigs(buttons) { const out = []; for (const bit of [2, 4, 8, 16, 32]) if (buttons & bit) out.push('pen:' + bit); return out; },
  penHoldTool(buttons) { const M = Store.settings.penMap || {}; for (const sg of this.penSigs(buttons)) { const a = M[sg]; if (a === 'eraser' || a === 'lasso' || a === 'highlighter') return a; } return null; },
  penClickHeld(e) { const M = Store.settings.penMap || {}; return this.penSigs(e.buttons).some((sg) => ['undo', 'redo', 'toggle', 'read'].includes(M[sg])); },
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
    const a = (Store.settings.penMap || {})[sg]; const now = performance.now();
    if (now - (this._lastSig || 0) < 250) return; // evita disparo duplo (botão + menu de contexto)
    if (a === 'undo') { this._lastSig = now; this.undo(); toast('Desfeito', 700); }
    else if (a === 'redo') { this._lastSig = now; this.redo(); toast('Refeito', 700); }
    else if (a === 'toggle') { this._lastSig = now; const t = this.tool === 'eraser' ? (this._prevTool || 'pen') : 'eraser'; if (t === 'eraser') this._prevTool = this.tool; UI.setTool(t, true); }
    else if (a === 'read') { this._lastSig = now; this.setReadOnly(!this.readOnly); }
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
    this.note.pages.splice(after + 1, 0, p); this.afterPagesChanged(); this.goToPage(after + 1); return p;
  },
  deletePage(i) {
    if (this.note.pages.length <= 1) return toast('A nota precisa de pelo menos uma página');
    this.note.pages.splice(i, 1); this.undoStack = []; this.redoStack = []; this.sel = null; this.afterPagesChanged();
  },
  duplicatePage(i) { const p = clone(this.note.pages[i]); p.id = uid(); p.elements.forEach((e) => (e.id = uid())); this.addPage(i, p); },
  movePage(i, d) { const j = i + d, P = this.note.pages; if (j < 0 || j >= P.length) return; [P[i], P[j]] = [P[j], P[i]]; this.afterPagesChanged(); },
  afterPagesChanged() { this.computeLayout(); this.clampCam(); this.markChanged(); this.requestRender(); },
  goToPage(i) {
    if (this.note.mode === 'infinite') return; const o = this.layout[i]; if (!o) return;
    this.cam.y = o.y - 16 / this.cam.z; this.clampCam(); this.requestRender();
  },
};
