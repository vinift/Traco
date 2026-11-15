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
  startInertia(samples, vertical = false) {
    const a = samples[0], b = samples[samples.length - 1], dt = Math.max(8, b[0] - a[0]);
    let vx = vertical ? 0 : (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt; // unidades da página por ms
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
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16];

/* ===== Botão/gesto "voltar" do Android dentro do app =====
   Mantém uma entrada extra no histórico: cada "voltar" do sistema cai aqui, fecha a camada de cima
   (menu → janela → painel → seleção → nota → pasta) e a entrada é recolocada. Na tela inicial: voltar 2× para sair. */
const Nav = {
  armed: false, exitT: null,
  init() {
    try { history.replaceState({ traco: 'base' }, '', /[?&]atualizar=/.test(location.search) ? location.pathname + location.hash : undefined); this.arm(); } catch (_) { return; }
    window.addEventListener('popstate', () => { this.armed = false; this.onBack(); });
    // se a entrada extra foi gasta (saída cancelada), recoloca no próximo toque
    window.addEventListener('pointerdown', () => { if (!this.armed) { clearTimeout(this.exitT); this.exitT = null; this.arm(); } }, true); // tocou em algo: cancela a saída
  },
  arm() { if (this.armed) return; try { history.pushState({ traco: 'guard' }, ''); this.armed = true; } catch (_) {} },
  push() { this.arm(); }, // compatibilidade: abrir nota garante a entrada extra
  onBack() {
    let handled = false;
    try { handled = this.closeTop(); } catch (e) { logError(e, 'voltar'); handled = true; }
    if (handled) { clearTimeout(this.exitT); this.exitT = null; this.arm(); return; }
    // tela inicial: primeiro "voltar" avisa, o segundo (em até 2 s) sai do app
    if (this.exitT) return; // já avisou: deixa o sistema sair
    toast('Volte de novo para sair', 2000);
    this.exitT = setTimeout(() => { this.exitT = null; this.arm(); }, 2000);
  },
  closeTop() {
    const pop = $('#popRoot'); if (pop && pop.firstChild) { closePop(); return true; }
    const mr = $('#modalRoot'), top = mr && mr.lastElementChild;
    if (top) {
      if (top.classList.contains('pm-back')) PageManager.close();
      else if (top.classList.contains('modal-back')) top.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      else top.remove();
      return true;
    }
    const sp = $$('.settings-page').pop(); if (sp) { const b = sp.querySelector('.sp-head .cbtn'); b ? b.click() : sp.remove(); return true; }
    if (typeof PenCapture !== 'undefined' && PenCapture.active && PenCapture.stop) { PenCapture.stop(); return true; }
    const ed = !$('#editor').classList.contains('hidden') && Editor.note;
    if (ed) {
      if (Editor.editingId) { Editor.commitText(); Editor.requestRender(); return true; }
      if (UI.panelOpen) { UI.closePanel(); return true; }
      if (Editor.sel) { Editor.sel = null; Editor.updateSelBar && Editor.updateSelBar(); Editor.requestRender(); return true; }
      App.closeNote(); return true;
    }
    const L = Library;
    if (L.selecting) { L.selecting = false; L.selected.clear(); L.render(); return true; }
    if (L.query) { L.query = ''; $('#libSearch').value = ''; L.render(); return true; }
    if (L.folder) { const f = Store.folders.find((x) => x.id === L.folder); L.folder = (f && f.parentId) || null; L.render(); return true; }
    if (L.view !== 'home') { L.view = 'home'; L.render(); return true; }
    return false;
  },
};

/* ===== Bloqueio do zoom do navegador =====
   Com "Forçar ativação do zoom" (acessibilidade do Chrome) o navegador ignora o bloqueio da página e amplia a tela inteira:
   as barras saem da tela e parecem sumir. Aqui a pinça fora da folha é cancelada; se mesmo assim a tela ficar ampliada,
   o app avisa e libera a pinça na folha para você afastar e voltar ao normal. */
const ZoomGuard = {
  init() {
    const block = (e) => { if (e.touches && e.touches.length > 1 && e.cancelable) e.preventDefault(); };
    document.addEventListener('touchstart', block, { passive: false, capture: true });
    document.addEventListener('touchmove', block, { passive: false, capture: true });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    window.addEventListener('wheel', (e) => { if ((e.ctrlKey || e.metaKey) && !(e.target.closest && e.target.closest('#stage'))) e.preventDefault(); }, { passive: false });
    const vv = window.visualViewport; if (!vv) return;
    const check = () => {
      const z = vv.scale > 1.02; document.body.classList.toggle('vv-zoomed', z);
      let b = document.getElementById('vvFix');
      if (z && !b) {
        b = el('button', { id: 'vvFix', class: 'vv-fix', onclick: () => { this.reset(); } }, 'A tela foi ampliada pelo navegador — faça pinça para afastar (ou toque aqui)');
        document.body.append(b); logError('zoom do navegador ' + vv.scale.toFixed(2) + '×', 'zoom');
      } else if (!z && b) b.remove();
      if (b) { b.style.transform = `translateX(-50%) scale(${1 / vv.scale})`; b.style.left = vv.offsetLeft + vv.width / 2 + 'px'; b.style.top = vv.offsetTop + 12 / vv.scale + 'px'; b.style.transformOrigin = 'top center'; }
    };
    vv.addEventListener('resize', check); vv.addEventListener('scroll', check); check();
  },
  reset() { // tenta voltar à escala 1 regravando a configuração da tela
    const m = document.querySelector('meta[name=viewport]'); if (!m) return; const c = m.content;
    m.content = c.replace(/maximum-scale=[^,]*/, 'maximum-scale=1.0001'); setTimeout(() => { m.content = c; }, 60);
    setTimeout(() => { if (window.visualViewport && visualViewport.scale > 1.02) toast('Faça o gesto de pinça (afastar os dedos ao contrário) na folha para voltar ao normal', 4000); }, 400);
  },
};
