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
    const hh = Math.round(th) + 'px', tr = `translate3d(0,${Math.round(f * (H - th))}px,0)`;
    if (t.style.height !== hh) t.style.height = hh; if (t.style.transform !== tr) t.style.transform = tr; // escrever só quando muda
    if (this._lastScrollY !== undefined && Math.abs(this._lastScrollY - this.cam.y) > 0.01 && !this._vsShown) { this._vsShown = true; this.flashScroll(); }
    else if (this._lastScrollY !== undefined && Math.abs(this._lastScrollY - this.cam.y) > 0.01) { clearTimeout(this._vsT); this._vsT = setTimeout(() => { $('#vscroll').classList.remove('show'); this._vsShown = false; }, 1400); }
    this._lastScrollY = this.cam.y;
    if (vs.classList.contains('drag')) { const n = this.note.pages.length; t.firstChild.textContent = `${this.currentPageIndex() + 1} / ${n}`; }
  },
  /* v0.25: destro → barra de rolagem rápida do lado ESQUERDO (logo depois das barras de ferramentas e cores), longe da palma */
  placeScroll() {
    const vs = $('#vscroll'); if (!vs) return; const left = (Store.settings.hand || 'right') === 'right';
    vs.classList.toggle('vs-left', left); if (!left) { vs.style.left = ''; const ed = $('#editor').getBoundingClientRect(), st = this.stage.getBoundingClientRect(); vs.style.right = Math.max(2, Math.round(ed.right - st.right + 2)) + 'px'; return; }
    vs.style.right = '';
    const ed = $('#editor').getBoundingClientRect(), st = this.stage.getBoundingClientRect(); let x = st.left - ed.left; /* tela dividida: na borda do lado ativo */
    for (const id of ['rail', 'subrail']) { const n = document.getElementById(id); if (n && n.offsetParent && n.offsetWidth) { const r = n.getBoundingClientRect(); if (r.right > st.left && r.left < st.right) x = Math.max(x, r.right - ed.left); } }
    vs.style.left = Math.round(x + 2) + 'px';
  },
  flashScroll() { if (!this._vsPlaced) { this._vsPlaced = true; this.placeScroll(); } /* v0.25.1: não mede a cada rolagem (forçava layout e a barrinha piscava) */ const vs = $('#vscroll'); vs.classList.add('show'); this._vsShown = true; clearTimeout(this._vsT); this._vsT = setTimeout(() => { vs.classList.remove('show'); this._vsShown = false; }, 1400); },
  initScroll() {
    const vs = $('#vscroll'); if (!vs || vs._ok) return; vs._ok = true;
    const t = vs.firstChild; let drag = null;
    const toFrac = (clientY, grab) => { const R = vs.getBoundingClientRect(), th = t.offsetHeight; return clamp((clientY - R.top - grab) / Math.max(1, R.height - th), 0, 1); };
    const go = (f) => { const r = this.scrollRange(); this.cam.y = r.a + f * r.span; this.clampCam(); this.requestRender(); };
    vs.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      /* v0.25: palma não mexe na rolagem rápida — toque com área grande, ou com a caneta perto/escrevendo (até 1,5 s depois), é ignorado;
         e tocar no trilho não pula mais: só arrastar o marcador */
      const tr = t.getBoundingClientRect(), onThumb = e.clientY >= tr.top - 6 && e.clientY <= tr.bottom + 6;
      if (e.pointerType === 'touch' && (e.width > 34 || e.height > 34 || this.penDown || performance.now() - this.lastPenSeen < 1500)) return;
      if (!onThumb) return;
      this.stopInertia(); vs.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, grab: e.clientY - tr.top };
      vs.classList.add('drag', 'show');
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
      this.cam.x += vx * d; this.cam.y += vy * d; this.clampCam(); this.safeDraw(); // desenha neste mesmo quadro (sem 1 quadro de atraso)
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
  /* v0.14: o Chrome ignora (pula) entradas do histórico criadas sem um toque do usuário — por isso, às vezes, o
     "voltar" dentro de uma pasta saía do app. Agora as entradas extras só são criadas durante um toque (pointerup/tecla),
     e ficam 3 de reserva: dá para voltar várias telas seguidas sem tocar em nada. */
  RESERVE: 3, exitT: null, ignore: 0,
  depth() { const st = history.state; return st && st.traco === 'guard' ? st.n || 1 : 0; },
  init() {
    try { history.replaceState({ traco: 'base' }, '', /[?&]atualizar=/.test(location.search) ? location.pathname + location.hash : undefined); } catch (_) { return; }
    window.addEventListener('popstate', () => { if (this.ignore > 0) { this.ignore--; return; } this.onBack(); });
    const arm = () => { if (this.exitT) { clearTimeout(this.exitT); this.exitT = null; } this.arm(); }; // tocou em algo: cancela a saída e repõe a reserva
    window.addEventListener('pointerup', arm, true); window.addEventListener('keydown', arm, true);
  },
  arm() { try { let d = this.depth(); while (d < this.RESERVE) { d++; history.pushState({ traco: 'guard', n: d }, ''); } } catch (_) {} },
  push() {}, // compatibilidade (a reserva é reposta no próprio toque que abriu a nota)
  onBack() {
    let handled = false;
    try { handled = this.closeTop(); } catch (e) { logError(e, 'voltar'); handled = true; }
    if (handled) { clearTimeout(this.exitT); this.exitT = null; return; }
    // tela inicial: o 1º "voltar" avisa e descarta a reserva; o 2º (em até 2 s) sai do app
    if (this.exitT) return;
    toast('Volte de novo para sair', 2000);
    const d = this.depth(); if (d > 0) { this.ignore = 1; history.go(-d); }
    this.exitT = setTimeout(() => { this.exitT = null; }, 2000);
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
    // segurar o dedo: nada de menu do navegador (fora de campos de texto, onde copiar/colar continua funcionando)
    /* v0.22: campo de texto só aceita o menu/seleção de segurar se já estava em uso (tocado antes); segurar num campo parado, em botões, miniaturas etc. não abre nada */
    let focusAtDown = null; document.addEventListener('pointerdown', () => { focusAtDown = document.activeElement; }, true);
    const editable = (t, sel) => { const f = t && t.closest && t.closest(sel); return !!(f && focusAtDown && focusAtDown !== document.body && (f === focusAtDown || f.contains(focusAtDown))); };
    document.addEventListener('contextmenu', (e) => { if (editable(e.target, 'input,textarea,[contenteditable="true"],[contenteditable=""],.text-edit')) return; e.preventDefault(); }, true);
    document.addEventListener('selectstart', (e) => { const t = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement; if (t && t.closest && t.closest('.errlog')) return; if (editable(t, 'input,textarea,[contenteditable="true"],[contenteditable=""],.text-edit')) return; e.preventDefault(); }, true);
    document.addEventListener('dragstart', (e) => { if (e.target && e.target.tagName === 'IMG') e.preventDefault(); });
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

/* ===== Altura estável =====
   Puxar a barra de horário/bateria do Android encolhe a tela por um instante e o app inteiro se redimensionava
   (barras pulando, página redesenhando). Agora encolhidas pequenas e passageiras são ignoradas; teclado e giro da tela continuam valendo. */
/* ===== v0.26.3: barra do sistema sempre POR CIMA do app (sem empurrar a tela) =====
   O app instalado (TWA) abre em tela cheia, mas o Android às vezes tira o app desse modo (painel de volume, voltar de outro app…): a barra
   fica preta e a página inteira desce. Aqui o app entra no modo tela cheia "imersivo" do próprio Chrome (Fullscreen API), em que a barra do
   sistema só aparece por cima e some sozinha, e volta para ele no toque seguinte se sair. Pedir tela cheia exige um toque (pointerup).
   No Android, o botão voltar com tela cheia primeiro SAI da tela cheia (sem popstate): essa saída é tratada como um "voltar" normal
   (Nav.onBack), a não ser que o popstate chegue logo em seguida ou o app tenha ido para segundo plano. Desliga em Configurações (S.keepFull). */
const Immersive = {
  ok() { return Store.settings.keepFull !== false && !!document.documentElement.requestFullscreen && window.matchMedia && !matchMedia('(display-mode: browser)').matches; },
  init() {
    if (!document.documentElement.requestFullscreen) return;
    addEventListener('pointerup', () => this.ensure(), true); addEventListener('keyup', () => this.ensure(), true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.hiddenAt = Date.now(); });
    addEventListener('popstate', () => { this.lastPop = Date.now(); if (this.backT) { clearTimeout(this.backT); this.backT = null; } }, true);
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) { this.on = true; return; }
      const was = this.on; this.on = false; if (!was || this.leaving || !this.ok()) { this.leaving = false; return; }
      if (document.hidden || Date.now() - (this.hiddenAt || 0) < 1500 || Date.now() - (this.lastPop || 0) < 400) return;
      /* saiu sem a gente pedir com o app na tela: foi o botão voltar */
      this.backT = setTimeout(() => { this.backT = null; try { Nav.onBack(); } catch (e) { logError(e, 'voltar (tela cheia)'); } }, 250);
    });
  },
  ensure() {
    if (!this.ok() || document.fullscreenElement || this.pending) return;
    this.pending = true; document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}).finally(() => { this.pending = false; });
  },
  leave() { if (document.fullscreenElement) { this.leaving = true; document.exitFullscreen().catch(() => {}); } },
};
const StableVH = {
  h: 0, w: 0,
  init() { this.apply(innerHeight); addEventListener('resize', () => this.onResize()); },
  apply(h) { this.h = h; this.w = innerWidth; document.documentElement.style.setProperty('--appH', h + 'px'); },
  onResize() {
    const H = innerHeight, W = innerWidth; clearTimeout(this.t);
    if (Math.abs(W - this.w) > 2) return this.apply(H); // girou a tela
    const dh = this.h - H;
    if (dh <= 0) return this.apply(H); // cresceu (barra sumiu): volta ao normal
    if (dh < 140) { this.t = setTimeout(() => this.apply(innerHeight), 8000); return; } // barra do sistema: ignora (se ficar, ajusta depois de 8 s)
    this.apply(H); // teclado ou mudança grande
  },
};
/* ===== v0.19: barra de horário/bateria do Android =====
   1) Quando a barra do sistema aparece por cima (deslizar do topo), o Chrome aumenta a "área segura" do topo e todas as barras do app
      desciam ~30 px e voltavam. Agora as margens ficam congeladas: o app só aceita quando elas diminuem (barra sumiu) ou quando a tela gira.
   2) A cor da barra do sistema (theme-color) acompanha a tela atual, para não aparecer uma faixa cinza/roxa destoando. */
const SafeArea = {
  v: null, w: 0, last: 0,
  init() {
    this.p = el('div', { class: 'sa-probe', 'aria-hidden': 'true' }); document.body.append(this.p);
    this.measure(true);
    addEventListener('resize', () => this.measure());
    if (screen.orientation) screen.orientation.addEventListener('change', () => { setTimeout(() => this.measure(true), 250); setTimeout(() => this.measure(), 1500); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => this.measure(), 400); });
    addEventListener('pointerdown', () => { const t = Date.now(); if (t - this.last > 2500) { this.last = t; this.measure(); } }, { passive: true, capture: true });
    for (const ms of [800, 3000]) setTimeout(() => this.measure(), ms);
  },
  read() { const c = getComputedStyle(this.p); return { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0, b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 }; },
  measure(force) {
    if (!this.p) return; const m = this.read(), W = innerWidth;
    if (force || !this.v || Math.abs(W - this.w) > 2) { this.v = m; this.w = W; } // início ou giro da tela: vale o que o sistema diz
    else { let ch = false; for (const k of 'trbl') if (m[k] < this.v[k] - 0.5) { this.v[k] = m[k]; ch = true; } if (!ch) return; } // só diminui: barra passageira não empurra nada
    const st = document.documentElement.style; for (const k of 'trbl') st.setProperty('--sa' + k, this.v[k] + 'px');
  },
};
const SystemBar = {
  init() {
    this.meta = document.querySelector('meta[name=theme-color]'); if (!this.meta) return;
    const upd = () => this.update();
    const mo = new MutationObserver(upd);
    for (const id of ['editor', 'library']) { const n = document.getElementById(id); if (n) mo.observe(n, { attributes: true, attributeFilter: ['class'] }); }
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', upd);
    upd();
  },
  update() {
    const ed = document.getElementById('editor'), onEd = ed && !ed.classList.contains('hidden');
    const cs = getComputedStyle(document.documentElement), c = (cs.getPropertyValue(onEd ? '--desk' : '--home') || '').trim();
    if (c && this.meta.content !== c) this.meta.content = c;
  },
};
/* relógio discreto ao lado do nome da nota (v0.19: e a bateria do tablet) */
const NoteClock = {
  start() { this.battery(); const tick = () => { const c = $('#noteClock'); if (c) c.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); clearTimeout(this.t); this.t = setTimeout(tick, 60000 - (Date.now() % 60000) + 50); }; tick(); },
  /* bateria: Battery Status API do Chrome (no Android funciona no app instalado). Sem ela, o indicador fica escondido. */
  async battery() {
    if (!navigator.getBattery) return;
    let b; try { b = await navigator.getBattery(); } catch (e) { return; }
    const paint = () => {
      const s = $('#noteBat'); if (!s) return;
      const pct = Math.round((b.level || 0) * 100), low = pct <= 15 && !b.charging;
      const fill = Math.max(1.5, 13 * (b.level || 0));
      s.innerHTML = `<svg viewBox="0 0 22 12" width="20" height="11" aria-hidden="true"><rect x=".75" y=".75" width="17.5" height="10.5" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="19.4" y="3.6" width="1.9" height="4.8" rx=".9" fill="currentColor"/><rect x="2.6" y="2.6" width="${fill.toFixed(1)}" height="6.8" rx="1.2" fill="currentColor"/>${b.charging ? '<path d="M10.6 1.6 7 6.6h3l-1.2 3.8 3.9-5.2H9.7l.9-3.6Z" style="fill:var(--ch,#fff)" stroke="currentColor" stroke-width=".6"/>' : ''}</svg>${pct}%`;
      s.classList.remove('hidden'); s.classList.toggle('low', low); s.title = `Bateria: ${pct}%` + (b.charging ? ' (carregando)' : '');
    };
    for (const ev of ['levelchange', 'chargingchange']) b.addEventListener(ev, paint);
    paint();
  },
};
