'use strict';
/* ===== Navegação: barra de rolagem lateral (precisa, sem inércia), inércia ao rolar com o dedo e zoom rápido ===== */
Object.assign(Editor, {
  /* ---------- barra de rolagem à direita ---------- */
  scrollRange() { // de "início da 1ª página no topo" até "fim da última página embaixo"
    const z = this.cam.z, a = -16 / z, b = this.camMaxBase(); return { a, b, span: b - a };
  },
  updateScroll() {
    const vs = $('#vscroll'); if (!vs || !this.note) return;
    const r = this.scrollRange(), show = this.note.mode !== 'infinite' && r.span > 40 / this.cam.z;
    vs.classList.toggle('hidden', !show); if (!show) return;
    const H = vs.clientHeight, vh = this.H / this.cam.z, th = Math.max(46, Math.min(H * 0.5, (H * vh) / (this.totalH + vh)));
    const f = clamp((this.cam.y - r.a) / r.span, 0, 1), t = vs.firstChild;
    t.style.height = th + 'px'; t.style.transform = `translateY(${f * (H - th)}px)`;
    if (this._lastScrollY !== undefined && Math.abs(this._lastScrollY - this.cam.y) > 0.01) this.flashScroll();
    this._lastScrollY = this.cam.y;
    if (vs.classList.contains('drag')) { const n = this.note.pages.length; t.firstChild.textContent = `${this.currentPageIndex() + 1} / ${n}`; }
  },
  flashScroll() { const vs = $('#vscroll'); vs.classList.add('show'); clearTimeout(this._vsT); this._vsT = setTimeout(() => vs.classList.remove('show'), 1400); },
  initScroll() {
    const vs = $('#vscroll'); if (!vs || vs._ok) return; vs._ok = true;
    const t = vs.firstChild; let drag = null;
    const toFrac = (clientY, grab) => { const R = vs.getBoundingClientRect(), th = t.offsetHeight; return clamp((clientY - R.top - grab) / Math.max(1, R.height - th), 0, 1); };
    const go = (f) => { const r = this.scrollRange(); this.cam.y = r.a + f * r.span; this.clampCam(); this.requestRender(); };
    vs.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); this.stopInertia(); vs.setPointerCapture(e.pointerId);
      const tr = t.getBoundingClientRect(), onThumb = e.clientY >= tr.top && e.clientY <= tr.bottom;
      drag = { id: e.pointerId, grab: onThumb ? e.clientY - tr.top : t.offsetHeight / 2 };
      vs.classList.add('drag', 'show'); if (!onThumb) go(toFrac(e.clientY, drag.grab)); // tocar no trilho pula para o ponto
    });
    vs.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; e.preventDefault(); go(toFrac(e.clientY, drag.grab)); });
    const end = (e) => { if (!drag || e.pointerId !== drag.id) return; drag = null; vs.classList.remove('drag'); this.flashScroll(); };
    vs.addEventListener('pointerup', end); vs.addEventListener('pointercancel', end);
  },

  /* ---------- inércia: ao soltar o dedo, a folha continua deslizando e desacelera ---------- */
  startInertia(samples) {
    const a = samples[0], b = samples[samples.length - 1], dt = Math.max(8, b[0] - a[0]);
    let vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt; // unidades da página por ms
    const z = this.cam.z; if (Math.hypot(vx, vy) * z < 0.35) return; // movimento lento: para na hora
    const maxV = 6 / z; const sp = Math.hypot(vx, vy); if (sp > maxV) { vx *= maxV / sp; vy *= maxV / sp; }
    this.stopInertia(); let last = performance.now();
    const step = (now) => {
      const d = Math.min(40, now - last); last = now;
      const k = Math.exp(-d / 325); // atrito (parecido com Android/iOS)
      const x0 = this.cam.x, y0 = this.cam.y;
      this.cam.x += vx * d; this.cam.y += vy * d; this.clampCam(); this.requestRender();
      vx *= k; vy *= k;
      const hitX = Math.abs(this.cam.x - x0) < Math.abs(vx * d) * 0.2, hitY = Math.abs(this.cam.y - y0) < Math.abs(vy * d) * 0.2; // bateu no limite
      if (hitX) vx = 0; if (hitY) vy = 0;
      if (Math.hypot(vx, vy) * this.cam.z < 0.02) { this._inertia = null; return; }
      this._inertia = requestAnimationFrame(step);
    };
    this._inertia = requestAnimationFrame(step);
  },
  stopInertia() { if (this._inertia) { cancelAnimationFrame(this._inertia); this._inertia = null; } },

  /* ---------- zoom ---------- */
  zoomTo(z, sx = this.W / 2, sy = this.H / 2) { this.stopInertia(); this.zoomAt(sx, sy, z / this.cam.z); },
  fitPage() { // página inteira na tela
    if (this.note.mode === 'infinite') return this.fitWidth();
    const i = Math.max(0, this.currentPageIndex()), p = this.note.pages[i], o = this.layout[i];
    const z = clamp(Math.min((this.W - 32) / p.w, (this.H - 32) / p.h), ...this.zoomLimits());
    this.cam.z = z; this.cam.x = o.x + p.w / 2 - this.W / (2 * z); this.cam.y = o.y + p.h / 2 - this.H / (2 * z); this.clampCam(); this.requestRender();
  },
  /* toque duplo com o dedo numa área vazia: ajusta à largura ↔ volta ao zoom anterior */
  doubleTapZoom(p) {
    this.stopInertia();
    const fitZ = clamp((this.W - 32) / (this.maxW || 1000), 0.2, 3);
    const atFit = this.note.mode !== 'infinite' && Math.abs(this.cam.z - fitZ) / fitZ < 0.03;
    if (atFit) { // na largura: volta ao zoom anterior (ou aproxima 2×) no ponto tocado
      const prev = this._zoomPrev && Math.abs(this._zoomPrev.z - fitZ) / fitZ > 0.05 ? this._zoomPrev : { z: fitZ * 2 }; this._zoomPrev = null; const w = this.toWorld(p.x, p.y);
      this.cam.z = prev.z; this.cam.x = w.x - p.x / prev.z; this.cam.y = w.y - p.y / prev.z;
    } else {
      this._zoomPrev = { ...this.cam }; const w = this.toWorld(p.x, p.y);
      this.cam.z = this.note.mode === 'infinite' ? 1 : fitZ; this.cam.x = -this.W / (2 * this.cam.z); this.cam.y = w.y - p.y / this.cam.z;
    }
    this.clampCam(); this.requestRender(); Instruments.redraw(); toast(Math.round(this.cam.z * 100) + '%', 700);
  },
});
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
