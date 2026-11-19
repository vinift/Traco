'use strict';
/* ===== v0.25: Tela dividida com "lado ativo" =====
   As duas metades são notas de verdade, mas só uma por vez é o editor (o "lado ativo", com contorno roxo): ferramentas, cores,
   desfazer e barras agem nela. Encostar a caneta na outra metade troca o lado ativo na hora — o traço já começa ali (os pontos
   ficam guardados enquanto o editor troca e são entregues a ele). As notas não mudam de lugar.
   O lado passivo é um leitor leve: páginas inteiras numa "folha" movida por transform (rolagem com inércia e pinça como no editor,
   sem redesenhar a cada quadro) + um recorte nítido da parte visível quando o zoom passa da resolução da página.
   Ao trocar, a imagem que estava na tela fica por baixo até a nova ficar pronta (sem tela branca nem piscar).
   Botão de cadeado: o lado direito não vira ativo (nem pela caneta nem pela palma) e ignora toques perto da caneta. */
const SV_BASE_W = 1100; /* resolução máxima da página inteira no lado passivo (px de largura) */
const svQ = (k) => Math.pow(2, Math.round(Math.log2(Math.max(k, 0.05)) * 2) / 2); /* degraus de √2: não redesenha por pouca diferença */

function svPane(note) {
  const P = {
    note, cam: { x: 0, y: 0, z: 1 }, hs: [], W: 0, H: 0, dead: false, pts: new Map(), g: null, inert: null, adopted: null,
    build() {
      this.el = el('div', { class: 'sv-pane' }); this.world = el('div', { class: 'sv-world' }); this.el.append(this.world);
      this.layoutPages(); this.wire();
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.el);
      this._live = setInterval(() => { /* mesma nota dos dois lados: o que você escreve aparece aqui também */
        if (this.dead || this.note !== Editor.note) return; for (const h of this.hs) if (h.cv && h.sig !== this.sig(h.page)) { h.stale = true; this.schedule(); }
      }, 1500);
      return this;
    },
    sig(p) { return Store.pageSigOf(p) + '|' + oid(p.template) + '|' + oid(p.pdf) + '|' + oid(this.note.template); },
    layoutPages() {
      const n = this.note, inf = n.mode === 'infinite'; this.world.innerHTML = ''; this.hs = []; this.inf = inf; let y = 0;
      n.pages.forEach((page, i) => {
        let o;
        if (inf) { const b = bboxUnion(page.elements) || { x: 0, y: 0, w: 800, h: 1000 }, m = 40; o = { x: b.x - m, y: b.y - m, w: Math.max(400, b.w + 2 * m), h: Math.max(300, b.h + 2 * m) }; }
        else { o = { x: -page.w / 2, y, w: page.w, h: page.h }; y += page.h + GAP; }
        const tpl = page.template || n.template, f = el('div', { class: 'sv-pg' });
        Object.assign(f.style, { left: o.x + 'px', top: o.y + 'px', width: o.w + 'px', height: o.h + 'px' }); f.style.setProperty('--pbg', page.pdf ? '#fff' : (tpl && tpl.paper) || '#fff');
        this.world.append(f); this.hs.push({ page, i, o, f, cv: null, k: 0, det: null, sig: null });
      });
      this.top = this.hs.length ? this.hs[0].o.y : 0; this.bot = this.hs.length ? Math.max(...this.hs.map((h) => h.o.y + h.o.h)) : 1000;
      this.L = Math.min(...this.hs.map((h) => h.o.x)); this.R = Math.max(...this.hs.map((h) => h.o.x + h.o.w));
    },
    resize() { if (this.dead) return; const r = this.el.getBoundingClientRect(); if (!r.width) return; this.W = r.width; this.H = r.height; this.rect = r; const bx = Editor.barsOver(r); this.mg = { mL: Math.max(12, Math.round(bx ? bx + 8 : 12)), mR: 12 }; this.clamp(); this.apply(); this.schedule(); },
    fit() { if (!this.W) this.resize(); const m = this.mg || { mL: 12, mR: 12 }, z = clamp((this.W - m.mL - m.mR) / Math.max(1, this.R - this.L), 0.15, 3); this.cam = { z, x: 0, y: this.top - 16 / z }; this.clamp(); this.apply(); this.schedule(); },
    clamp(loose) {
      const c = this.cam; if (!this.W) return; c.z = clamp(c.z, 0.15, 8);
      const vw = this.W / c.z, vh = this.H / c.z, L = this.L, R = this.R;
      const m = this.mg || { mL: 12, mR: 12 }, pw = (R - L) * c.z; /* v0.25.1: mesmas margens do editor (barras por cima deste lado + 12 px) */
      if (pw > this.W - m.mL - m.mR) c.x = clamp(c.x, L - m.mL / c.z, R + m.mR / c.z - vw); else c.x = L - Math.max(m.mL, (this.W - pw) / 2) / c.z;
      c.y = clamp(c.y, this.top - 16 / c.z - (loose ? vh * 0.3 : 0), Math.max(this.top - 16 / c.z, this.bot - vh + 90 / c.z));
    },
    apply() {
      const c = this.cam, d = devicePixelRatio || 1;
      this.world.style.transform = `translate3d(${Math.round(-c.x * c.z * d) / d}px,${Math.round(-c.y * c.z * d) / d}px,0) scale(${c.z})`;
      clearTimeout(this._hT); this._hT = setTimeout(() => SplitView.hud(), 120);
    },
    view() { const c = this.cam; return { x: c.x, y: c.y, w: this.W / c.z, h: this.H / c.z }; },
    pageIndex() { const v = this.view(), cy = v.y + v.h / 2; let best = 0, bd = Infinity; for (const h of this.hs) { const d = cy < h.o.y ? h.o.y - cy : cy > h.o.y + h.o.h ? cy - h.o.y - h.o.h : 0; if (d < bd) { bd = d; best = h.i; } } return best; },
    /* ---------- desenho: uma página por vez, em ocioso, sem tirar a imagem velha antes da nova ficar pronta ---------- */
    schedule(ms) { if (this.dead || this._rq) return; this._rq = setTimeout(() => { this._rq = null; this.renderStep(); }, ms ?? 40); },
    busyGesture() { return this.pts.size || this.inert || performance.now() - (this._movedAt || 0) < 140; },
    async renderStep() {
      if (this.dead || !this.W || this._rendering) return;
      if (this.busyGesture()) { const vis0 = this.view(); if (!this.hs.some((h) => !h.cv && rectsHit(h.o, vis0))) return this.schedule(120); } /* no gesto só desenha página que está em branco */
      const vis = this.view(), z = this.cam.z, d = devicePixelRatio || 1, far = { x: vis.x - vis.w, y: vis.y - vis.h * 1.5, w: vis.w * 3, h: vis.h * 4 };
      const near = { x: vis.x, y: vis.y - vis.h * 0.6, w: vis.w, h: vis.h * 2.2 }, cy = vis.y + vis.h / 2;
      for (const h of this.hs) if (!rectsHit(h.o, far)) this.freeH(h); /* longe: devolve a memória */
      const cand = this.hs.filter((h) => rectsHit(h.o, near)).sort((a, b) => Math.abs(a.o.y + a.o.h / 2 - cy) - Math.abs(b.o.y + b.o.h / 2 - cy));
      let job = null;
      for (const h of cand) { const k = Math.min(svQ(Math.min(z * d, SV_BASE_W / h.o.w)), SV_BASE_W / h.o.w); if (!h.cv || h.stale || h.k !== k) { job = { h, k }; break; } }
      if (!job && !this.busyGesture()) for (const h of cand) { /* zoom acima da resolução da página: recorte nítido da parte visível */
        if (!rectsHit(h.o, vis)) { if (h.det) this.freeDet(h); continue; }
        const kd = svQ(z * d); if (kd <= h.k * 1.25) { if (h.det) this.freeDet(h); continue; }
        const ix = Math.max(vis.x, h.o.x), iy = Math.max(vis.y, h.o.y), ex = Math.min(vis.x + vis.w, h.o.x + h.o.w), ey = Math.min(vis.y + vis.h, h.o.y + h.o.h);
        const D = h.det, covers = D && D.k === kd && !h.stale && D.a.x <= ix && D.a.y <= iy && D.a.x + D.a.w >= ex && D.a.y + D.a.h >= ey;
        if (!covers) { const mx = (ex - ix) * 0.06, my = (ey - iy) * 0.06; let a = { x: Math.max(h.o.x, ix - mx), y: Math.max(h.o.y, iy - my) }; a.w = Math.min(h.o.x + h.o.w, ex + mx) - a.x; a.h = Math.min(h.o.y + h.o.h, ey + my) - a.y; a.w = Math.min(a.w, 4096 / kd); a.h = Math.min(a.h, 4096 / kd); job = { h, k: kd, a }; break; }
      }
      if (!job) { this.checkAdopted(); return; }
      this._rendering = true;
      try {
        const { h, k, a } = job, page = h.page, sig = this.sig(page);
        if (a) {
          const area = this.inf ? a : { x: a.x - h.o.x, y: a.y - h.o.y, w: a.w, h: a.h };
          const cv = await renderPageCanvas(this.note, page, k, { area }); if (this.dead) { cv.width = 0; return; }
          cv.className = 'sv-det'; Object.assign(cv.style, { left: a.x - h.o.x + 'px', top: a.y - h.o.y + 'px', width: a.w + 'px', height: a.h + 'px' });
          h.f.append(cv); if (h.det) Editor.freeCanvas(h.det.cv); h.det = { cv, k, a };
        } else {
          const cv = await renderPageCanvas(this.note, page, k); if (this.dead) { cv.width = 0; return; }
          cv.className = 'sv-cv'; h.f.prepend(cv); if (h.cv) Editor.freeCanvas(h.cv); if (h.stale && h.det) this.freeDet(h);
          h.cv = cv; h.k = k; h.sig = sig; h.stale = false; h.f.classList.add('ready');
        }
      } catch (e) { logError(e, 'tela dividida'); } finally { this._rendering = false; }
      this.schedule(16);
    },
    freeDet(h) { if (h.det) { Editor.freeCanvas(h.det.cv); h.det = null; } },
    freeH(h) { if (h.cv) { Editor.freeCanvas(h.cv); h.cv = null; h.k = 0; h.f.classList.remove('ready'); } this.freeDet(h); },
    freeAll() { for (const h of this.hs) this.freeH(h); this.dropAdopted(); },
    destroy() { this.dead = true; clearInterval(this._live); clearTimeout(this._rq); this.stopInertia(); if (this.ro) this.ro.disconnect(); this.freeAll(); this.el.remove(); },
    /* imagem do editor (blocos nítidos) aproveitada como fundo até as páginas daqui ficarem prontas */
    adopt(w) { if (!w) return; this.adopted = w; w.classList.add('sv-adopted'); this.el.prepend(w); this.el.classList.add('adopting'); setTimeout(() => this.dropAdopted(), 3000); },
    checkAdopted() { if (!this.adopted) return; const vis = this.view(); if (this.hs.every((h) => !rectsHit(h.o, vis) || h.cv)) this.dropAdopted(); },
    dropAdopted() { const w = this.adopted; if (!w) return; this.adopted = null; this.el.classList.remove('adopting'); for (const c of w.querySelectorAll('canvas')) Editor.freeCanvas(c); w.remove(); },
    /* ---------- entrada: dedo rola/dá zoom; caneta torna este lado o ativo ---------- */
    wire() {
      const E = this.el, pt = (e) => ({ x: e.clientX - this.rect.left, y: e.clientY - this.rect.top });
      E.addEventListener('pointerdown', (e) => {
        if (this.dead || this.cover) return; e.preventDefault(); if (!this.rect) this.resize(); this.rect = E.getBoundingClientRect();
        const locked = SplitView.lockedPane(this), now = performance.now();
        if (e.pointerType === 'pen' || (e.pointerType === 'mouse' && e.button === 0)) { if (locked) return; SplitView.activateFrom(e); return; }
        if (e.pointerType === 'mouse') return;
        if (Editor.penDown || now - Editor.lastPenSeen < (locked ? 1500 : 500)) return; /* palma */
        if (locked && (e.width > 34 || e.height > 34)) return;
        try { E.setPointerCapture(e.pointerId); } catch (_) {}
        this.stopInertia(); this.pts.set(e.pointerId, pt(e)); this.gStart();
      });
      E.addEventListener('pointermove', (e) => { if (!this.pts.has(e.pointerId)) return; this.pts.set(e.pointerId, pt(e)); this.gMove(); });
      const up = (e) => { if (!this.pts.has(e.pointerId)) return; this.pts.delete(e.pointerId); if (this.pts.size) this.gStart(); else this.gEnd(); };
      E.addEventListener('pointerup', up); E.addEventListener('pointercancel', up);
      E.addEventListener('wheel', (e) => {
        e.preventDefault(); if (!this.rect) this.resize(); const c = this.cam;
        if (e.ctrlKey) { const p = pt(e), wx = c.x + p.x / c.z, wy = c.y + p.y / c.z; c.z = clamp(c.z * Math.exp(-e.deltaY * 0.01), 0.15, 8); c.x = wx - p.x / c.z; c.y = wy - p.y / c.z; }
        else { c.y += e.deltaY / c.z; c.x += e.deltaX / c.z; }
        this._movedAt = performance.now(); this.dropAdopted(); this.clamp(); this.apply(); this.schedule(160);
      }, { passive: false });
    },
    gStart() {
      const ps = [...this.pts.values()]; const m = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
      this.g = { cam: { ...this.cam }, m, d: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0, n: ps.length, s: [[performance.now(), this.cam.x, this.cam.y]] };
    },
    gMove() {
      const g = this.g; if (!g) return; const ps = [...this.pts.values()]; if (ps.length !== g.n) return this.gStart();
      const c = this.cam, c0 = g.cam;
      if (ps.length > 1) {
        const m = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 }, d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        const wx = c0.x + g.m.x / c0.z, wy = c0.y + g.m.y / c0.z; c.z = clamp(c0.z * d / Math.max(1, g.d), 0.15, 8); c.x = wx - m.x / c.z; c.y = wy - m.y / c.z; this.clamp(true);
      } else { const p = ps[0]; c.x = c0.x - (p.x - g.m.x) / c.z; c.y = c0.y - (p.y - g.m.y) / c.z; this.clamp(); }
      this.dropAdopted(); g.s.push([performance.now(), c.x, c.y]); if (g.s.length > 6) g.s.shift();
      this._movedAt = performance.now(); this.apply();
    },
    gEnd() {
      const g = this.g; this.g = null; if (!g) return;
      if (g.n > 1) { const z = this.cam.z, vw = this.W / z; this.clamp(); this.apply(); this.schedule(160); return; }
      const a = g.s[0], b = g.s[g.s.length - 1], dt = Math.max(8, b[0] - a[0]);
      if (performance.now() - b[0] > 80 || g.s.length < 3) { this.schedule(160); return; }
      let vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt; /* unidades da folha por ms */
      const step = () => {
        if (!this.inert) return; vx *= 0.95; vy *= 0.95; this.cam.x += vx * 16; this.cam.y += vy * 16; this.clamp(); this.apply(); this._movedAt = performance.now();
        if (Math.hypot(vx, vy) * this.cam.z < 0.02) { this.inert = null; this.schedule(120); return; }
        this.inert = requestAnimationFrame(step);
      };
      this.inert = requestAnimationFrame(step);
    },
    stopInertia() { if (this.inert) { cancelAnimationFrame(this.inert); this.inert = null; } },
  };
  return P.build();
}

const SplitView = {
  pv: null, act: 'L', shown: false, mem: new Map(), fwd: null, switching: false,
  get S() { return Store.settings; },
  get note() { return this.pv && this.pv.note; },
  ed() { return $('#editor'); },
  /* ---------- montagem ---------- */
  ensureChrome() {
    if (this._chrome) return; this._chrome = true; const ed = this.ed();
    const B = (ic, title, fn, cls = 'cbtn') => { const b = el('button', { class: cls, title, onclick: (e) => { e.stopPropagation(); fn(e); } }); b.innerHTML = icon(ic); return b; };
    const head = (s) => el('div', { class: 'chrome sv-head', id: 'svHead' + s },
      el('button', { class: 'sv-ttl', title: 'Trocar a nota deste lado', onclick: (e) => QuickSwitch.open(e.currentTarget, s === this.act ? 'open' : 'split') }, el('span', { class: 'sv-tname' }, ''), el('i', { html: '▾' })),
      el('button', { class: 'sv-chip sv-pgn', title: 'Página', onclick: () => this.headTap(s) }, ''),
      el('button', { class: 'sv-chip sv-zm', title: 'Zoom (toque: ajustar à largura)', onclick: () => this.zoomTap(s) }, ''),
      el('span', { class: 'sv-lockb', title: 'Lado travado', html: icon('lock') }));
    ed.append(el('div', { class: 'sv-div', id: 'svDiv', title: 'Arraste para mudar o tamanho' }), el('div', { class: 'sv-ring', id: 'svRing' }), head('L'), head('R'),
      el('div', { class: 'chrome sv-mid', id: 'svMid' },
        B('swapSides', 'Trocar as notas de lado', () => this.swap()),
        B('lockSide', 'Travar o lado direito (a palma ou a caneta não o ativam sem querer)', () => this.toggleLock()),
        B('x', 'Fechar a tela dividida', () => this.close())));
    for (const s of ['L', 'R']) $('#svHead' + s).addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; this.headTap(s); });
    this.wireDivider($('#svDiv'));
    /* caneta que encostou no lado passivo: os eventos seguintes vão para o editor (guardados enquanto ele troca de nota) */
    const snap = (ev, type) => ({ type, clientX: ev.clientX, clientY: ev.clientY, pointerId: ev.pointerId, pointerType: ev.pointerType, pressure: ev.pressure, buttons: ev.buttons, button: ev.button, width: ev.width, height: ev.height, tiltX: ev.tiltX, tiltY: ev.tiltY, timeStamp: ev.timeStamp });
    this._snap = snap;
    for (const t of ['pointermove', 'pointerrawupdate', 'pointerup', 'pointercancel']) window.addEventListener(t, (ev) => {
      const f = this.fwd; if (!f || ev.pointerId !== f.id) return; ev.stopPropagation();
      const end = t === 'pointerup' || t === 'pointercancel';
      if (!f.live) {
        if (t === 'pointermove') { const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : []; for (const c of (evs.length ? evs : [ev])) f.q.push(snap(c, 'move')); if (Math.hypot(ev.clientX - f.x0, ev.clientY - f.y0) > 3) f.moved = true; }
        if (end) { f.q.push(snap(ev, t === 'pointerup' ? 'up' : 'cancel')); f.ended = true; }
        if (f.ready) this.flush(); return;
      }
      if (t === 'pointerrawupdate') Editor.onRaw(ev); else if (t === 'pointermove') Editor.onMove(ev); else { Editor.onUp(ev, t === 'pointercancel'); this.fwd = null; }
    }, true);
  },
  sides() {
    const ed = this.ed(), W = ed.clientWidth || innerWidth, f = clamp((this.S.split && this.S.split.w) || 0.5, 0.25, 0.75), X = Math.round(W * (1 - f));
    return { L: { x: 0, w: X - 3 }, R: { x: X + 3, w: W - X - 3 }, X, W };
  },
  applyLayout() {
    const ed = this.ed(), on = this.shown && !!this.pv; ed.classList.toggle('split-on', on);
    if (!on) { for (const k of ['--stL', '--stW', '--pvL', '--pvW', '--divX']) ed.style.removeProperty(k); requestAnimationFrame(() => Editor.note && Editor.resize()); return; }
    this.ensureChrome();
    const r = this.sides(), A = r[this.act], P = r[this.act === 'L' ? 'R' : 'L'];
    ed.style.setProperty('--stL', A.x + 'px'); ed.style.setProperty('--stW', A.w + 'px'); ed.style.setProperty('--pvL', P.x + 'px'); ed.style.setProperty('--pvW', P.w + 'px'); ed.style.setProperty('--divX', r.X + 'px');
    ed.dataset.act = this.act; ed.classList.toggle('sv-lockR', !!(this.S.split && this.S.split.lockR));
    if (Editor.note) { Editor.resize(); Editor.placeScroll(); }
    this.hud();
  },
  lockedPane(p) { return !!(this.S.split && this.S.split.lockR) && p === this.pv && this.act === 'L'; },
  saveState() { if (!this.pv) return; const s = this.S.split || {}; this.S.split = { id: this.pv.note.id, w: s.w || 0.5, act: this.act, lockR: !!s.lockR, cam: { ...this.pv.cam } }; Store.saveSettings(); },
  mount(node) { this.ed().insertBefore(node, $('#stage').nextSibling); },
  /* ---------- abrir / fechar ---------- */
  async open(id) {
    const n = Editor.note && Editor.note.id === id ? Editor.note : (this.mem.get(id) || {}).note || (await Store.getNote(id)); if (!n) return toast('Nota não encontrada');
    const st = this.S.split || {}, same = st.id === id && st.cam;
    if (this.pv) this.pv.destroy();
    this.act = st.act === 'R' && !st.lockR ? 'R' : 'L';
    this.S.split = { id, w: st.w || 0.5, act: this.act, lockR: !!st.lockR, cam: same ? st.cam : null };
    const fitted = !this.shown && Editor.note && Editor.note.mode !== 'infinite' && Editor.W && (() => { const m = Editor.barMargins(); return Math.abs(Editor.cam.z - (Editor.W - m.mL - m.mR) / Editor.maxW) < 0.03; })(); /* estava ajustada à largura: continua ajustada na metade */
    this.ensureChrome(); this.pv = svPane(n); this.mount(this.pv.el);
    this.shown = !this.ed().classList.contains('hidden'); this.applyLayout(); if (fitted) Editor.fitWidth();
    this.pv.resize(); if (same) { this.pv.cam = { ...st.cam }; this.pv.clamp(); this.pv.apply(); this.pv.schedule(); } else this.pv.fit();
    this.prune(); this.saveState(); this.hud();
  },
  close() { if (this.pv) this.pv.destroy(); this.pv = null; this.mem.clear(); this.S.split = null; Store.saveSettings(); this.shown = false; this.applyLayout(); },
  restore() { const s = this.S.split; if (s && Store.heads[s.id]) this.open(s.id); },
  visible(on) {
    /* reabriu justamente a nota que estava ao lado: a que estava no editor vai para o lado passivo */
    if (on && this.pv && Editor.note && this.pv.note.id === Editor.note.id && this._lastAct && this._lastAct !== Editor.note.id && Store.heads[this._lastAct]) { const id = this._lastAct; this._lastAct = null; this.shown = true; return this.open(id); }
    this.shown = on && !!this.pv; if (this.pv) { this.pv.el.classList.toggle('hidden', !this.shown); if (!this.shown) this.pv.freeAll(); }
    this.applyLayout(); if (this.shown) { this.pv.resize(); this.pv.schedule(); } this.prune();
  },
  prune() { const keep = new Set([Editor.note && Editor.note.id, this.pv && this.pv.note.id]); for (const k of [...this.mem.keys()]) if (!keep.has(k)) this.mem.delete(k); },
  async openFromLibrary(id) { /* biblioteca → "Abrir ao lado": a última nota usada fica à esquerda e esta à direita */
    const other = (this.S.recent || []).find((x) => x !== id && Store.heads[x]);
    if (!other) { await App.openNote(id); return QuickSwitch.open($('#btnSplit'), 'split'); }
    await App.openNote(other); await this.open(id); this.visible(true);
  },
  /* ---------- trocar o lado ativo ---------- */
  activateFrom(e) {
    if (this.switching) return;
    this.fwd = { id: e.pointerId, q: [this._snap(e, 'down')], x0: e.clientX, y0: e.clientY, t0: performance.now(), live: false, ready: false, moved: false, ended: false };
    this.activate();
  },
  async activate() {
    if (this.switching || !this.pv || !Editor.note || this.lockedPane(this.pv)) { this.fwd = null; return; }
    this.switching = true;
    try {
      const A = Editor.note, cover = this.pv, B = cover.note, camA = { ...Editor.cam }, camB = { ...cover.cam };
      this.mem.set(A.id, { note: A, undo: Editor.undoStack, redo: Editor.redoStack });
      const world = Editor.detach();
      cover.cover = true; cover.el.classList.add('sv-cover'); cover.stopInertia(); Editor.stage.append(cover.el); Editor.stage.classList.add('sv-covering'); /* por baixo da tinta ao vivo (z-index) */
      this.act = this.act === 'L' ? 'R' : 'L';
      this.pv = svPane(A); this.mount(this.pv.el); this.applyLayout(); this.pv.resize();
      this.pv.cam = camA; this.pv.clamp(); this.pv.adopt(world); this.pv.apply(); this.pv.schedule(60);
      const m = this.mem.get(B.id) || {};
      await Editor.open(B.id, { note: B, cam: camB, undo: m.undo, redo: m.redo, fast: true });
      try { localStorage.setItem('traco-last-note', B.id); } catch (_) {}
      Editor.onDone(() => { cover.destroy(); if (!Editor.stage.querySelector('.sv-cover')) Editor.stage.classList.remove('sv-covering'); }, 1500);
      this.saveState(); this.hud();
    } catch (err) { logError(err, 'tela dividida: trocar lado'); this.fwd = null; }
    finally { this.switching = false; }
    if (this.fwd) { this.fwd.ready = true; this.flush(); }
  },
  /* entrega ao editor os pontos guardados (um toque rápido só troca o lado, não desenha um ponto) */
  flush() {
    const f = this.fwd; if (!f || f.live || !f.ready) return;
    const tap = !f.moved && f.ended && performance.now() - f.t0 < 350;
    if (tap) { this.fwd = null; return; }
    if (!f.moved && !f.ended && performance.now() - f.t0 < 250) return; /* ainda não dá para saber: espera mexer ou soltar */
    const st = Editor.stage, fake = (s) => ({ ...s, target: st, getCoalescedEvents: () => [], preventDefault() {}, stopPropagation() {} });
    f.live = true; const q = f.q; f.q = [];
    for (const s of q) { if (s.type === 'down') Editor.onDown(fake(s)); else if (s.type === 'move') Editor.onMove(fake(s)); else { Editor.onUp(fake(s), s.type === 'cancel'); this.fwd = null; return; } }
  },
  swap() { if (!this.pv) return; this.act = this.act === 'L' ? 'R' : 'L'; if (this.S.split && this.S.split.lockR && this.act === 'R') { this.S.split.lockR = false; toast('Trava do lado direito desligada', 1400); } this.applyLayout(); this.pv.resize(); this.saveState(); },
  toggleLock() {
    const s = this.S.split; if (!s) return; s.lockR = !s.lockR; Store.saveSettings();
    if (s.lockR && this.act === 'R') this.swap(); /* o editor sai do lado travado: as notas trocam de lado */
    this.applyLayout(); toast(s.lockR ? 'Lado direito travado: a caneta e a palma não o ativam (o dedo ainda rola)' : 'Lado direito destravado', 2200);
  },
  headTap(s) { if (s !== this.act && !this.lockedPane(this.pv)) this.activate(); },
  zoomTap(s) { if (s === this.act) Editor.fitWidth(); else if (this.pv) this.pv.fit(); },
  hud() {
    if (!this.shown || !this.pv || !this._chrome) return; const P = this.act === 'L' ? 'R' : 'L';
    if (Editor.note) this._lastAct = Editor.note.id;
    const set = (s, n, pi, z) => { const h = $('#svHead' + s); if (!h) return; const t = n ? n.title || 'Nota sem título' : '', pg = n && n.mode !== 'infinite' ? `${pi + 1} / ${n.pages.length}` : '', zz = Math.round(z * 100) + '%';
      const q = (c) => h.querySelector(c); if (q('.sv-tname').textContent !== t) q('.sv-tname').textContent = t; if (q('.sv-pgn').textContent !== pg) q('.sv-pgn').textContent = pg; if (q('.sv-zm').textContent !== zz) q('.sv-zm').textContent = zz; h.classList.toggle('act', s === this.act); };
    if (Editor.note) set(this.act, { ...Editor.note, title: $('#noteTitle').value.trim() || Editor.note.title }, Editor.currentPageIndex(), Editor.cam.z);
    set(P, this.pv.note, this.pv.pageIndex(), this.pv.cam.z);
    clearTimeout(this._sT); this._sT = setTimeout(() => this.saveState(), 2500);
  },
  wireDivider(dv) {
    dv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); dv.setPointerCapture(e.pointerId); dv.classList.add('drag');
      /* v0.25.1: enquanto arrasta só a divisória anda (prévia); os lados mudam de tamanho uma vez, ao soltar — redimensionar a cada
         movimento refazia as telas de desenho e as barras piscavam */
      const W = this.ed().clientWidth, x0 = this.sides().X; let w = (this.S.split && this.S.split.w) || 0.5;
      const move = (ev) => { w = clamp((W - ev.clientX) / W, 0.25, 0.75); dv.style.transform = `translateX(${Math.round(W * (1 - w)) - x0}px)`; };
      const up = () => { dv.removeEventListener('pointermove', move); dv.removeEventListener('pointerup', up); dv.removeEventListener('pointercancel', up); dv.classList.remove('drag'); dv.style.transform = '';
        this.S.split = { ...(this.S.split || {}), w }; this.applyLayout(); this.saveState(); if (this.pv) this.pv.resize(); };
      dv.addEventListener('pointermove', move); dv.addEventListener('pointerup', up); dv.addEventListener('pointercancel', up);
    });
    dv.addEventListener('dblclick', () => { this.S.split = { ...(this.S.split || {}), w: 0.5 }; this.applyLayout(); this.saveState(); });
  },
};
