'use strict';
/* ===== v1.9: calibrar a palma =====
   Página inteira em 2 passos: (1) escrever normalmente com a mão apoiada — todo toque é palma; (2) só o dedo (rolar/zoom) — todo toque é dedo.
   Para cada toque: maior contato (px), tempo desde a última vez que a caneta foi vista (encostada ou pairando), posição em relação à ponta
   e se a caneta estava encostada quando ele começou. Resultado: S.palmSize (tamanho) e S.palmZone {on, ms, dx, dy} ("zona da mão",
   Palm.zoneHit) — com a simulação de quantos toques de palma seriam barrados e quantos de dedo passariam. Enquanto aberta, Palm.paused. */
const PalmCal = {
  pct(a, p) { a = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))] : null; },
  /* propõe os ajustes a partir das medidas */
  propose(palms, fingers, hand) {
    const sgn = hand === 'left' ? -1 : 1, fMax = fingers.length ? Math.max(...fingers.map((f) => f.max)) : null, pLow = this.pct(palms.map((p) => p.max), 0.2);
    let size;
    if (fMax != null && pLow != null && pLow > fMax + 4) size = Math.round((fMax + pLow) / 2);
    else if (fMax != null) size = Math.round(fMax + 6);
    else size = pLow != null ? Math.round(pLow - 2) : 40;
    size = clamp(size, 20, 90);
    const near = palms.filter((p) => p.dt < 2500), zone = { on: false, ms: 600, dx: -40, dy: -120 };
    if (near.length && hand !== 'none') {
      zone.ms = clamp(Math.round((this.pct(near.map((p) => p.dt), 0.9) || 0) + 200), 300, 1500);
      zone.dx = clamp(Math.round((this.pct(near.map((p) => p.dx * sgn), 0.05) || 0) - 30), -160, 60);
      zone.dy = clamp(Math.round((this.pct(near.map((p) => p.dy), 0.05) || 0) - 40), -300, 60);
      zone.on = true;
    }
    return { size, zone };
  },
  /* simulação: o que cada regra faria com os toques medidos */
  judge(t, size, zone, hand) {
    const sgn = hand === 'left' ? -1 : 1;
    if (t.max >= size) return 'tamanho';
    if (t.penDown) return 'caneta encostada';
    if (zone && zone.on && hand !== 'none' && t.dt <= zone.ms && t.dx * sgn >= zone.dx && t.dy >= zone.dy) return 'zona da mão';
    return null;
  },
  open() {
    const S = Store.settings, hand = S.hand || 'right';
    let step = 1, hover = false, pen = { t: -1e9, x: 0, y: 0, down: false };
    const palms = [], fingers = [], live = new Map(), strokes = [];
    let cur = null;
    const cv = el('canvas', { class: 'pc-cv' }), ctx = cv.getContext('2d'), paper = el('div', { class: 'pc-paper' }, cv);
    const title = el('h2', {}), info = el('p', { class: 'pc-info' }), count = el('div', { class: 'pc-count' }), result = el('div', { class: 'pc-result' });
    const next = el('button', { class: 'btn primary' }), redo = el('button', { class: 'btn ghost', onclick: () => { palms.length = fingers.length = strokes.length = 0; live.clear(); step = 1; paint(); ui(); } }, 'Recomeçar');
    const side = el('div', { class: 'pc-side' }, title, info, count, el('div', { class: 'pc-btns' }, redo, next), result);
    const dpr = () => devicePixelRatio || 1;
    const fit = () => { const r = paper.getBoundingClientRect(); cv.width = Math.max(1, Math.round(r.width * dpr())); cv.height = Math.max(1, Math.round(r.height * dpr())); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; paint(); };
    const box = () => cv.getBoundingClientRect();
    let sim = null; /* depois do resultado: cor de cada toque conforme os ajustes propostos */
    function paint() {
      const k = dpr(), W = cv.width, H = cv.height; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.strokeStyle = 'rgba(100,116,139,.25)'; ctx.lineWidth = 1; for (let y = 48; y < H / k; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W / k, y); ctx.stroke(); }
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2.2; ctx.lineCap = ctx.lineJoin = 'round';
      for (const s of strokes) { ctx.beginPath(); s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
      const r0 = box();
      for (const [list, base] of [[palms, '220,38,38'], [fingers, '37,99,235']]) for (const t of list) {
        let col = base; if (sim) col = (list === palms) === !!sim(t) ? '22,163,74' : '234,88,12'; /* verde = certo; laranja = erro */
        ctx.fillStyle = `rgba(${col},.18)`; ctx.strokeStyle = `rgba(${col},.8)`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(t.x - r0.left, t.y - r0.top, Math.max(6, t.max / 2), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      for (const t of live.values()) { ctx.fillStyle = step === 1 ? 'rgba(220,38,38,.3)' : 'rgba(37,99,235,.3)'; ctx.beginPath(); ctx.arc(t.cx - r0.left, t.cy - r0.top, Math.max(6, t.max / 2), 0, Math.PI * 2); ctx.fill(); }
    }
    function ui() {
      sim = null; result.innerHTML = '';
      if (step === 1) {
        title.textContent = '1 de 2 · Escreva';
        info.textContent = 'Escreva normalmente com a caneta, apoiando a mão como você faz no dia a dia, umas 3 ou 4 linhas. Não use o dedo agora: tudo o que encostar aqui além da caneta conta como palma.';
        next.textContent = 'Próximo'; next.disabled = strokes.length < 3; next.onclick = () => { step = 2; ui(); paint(); };
      } else if (step === 2) {
        title.textContent = '2 de 2 · Só o dedo';
        info.textContent = 'Agora sem escrever: role e dê zoom com o dedo do jeito que você faz (um dedo arrastando, dois dedos na pinça), umas 5 ou 6 vezes.';
        next.textContent = 'Ver resultado'; next.disabled = fingers.length < 3; next.onclick = () => { step = 3; ui(); };
      } else showResult();
      count.textContent = `Palma: ${palms.length} toque${palms.length === 1 ? '' : 's'} · Dedo: ${fingers.length} · Traços: ${strokes.length}`;
    }
    function showResult() {
      title.textContent = 'Resultado'; info.textContent = ''; next.textContent = 'Aplicar';
      const prop = PalmCal.propose(palms, fingers, hand); let size = prop.size; const zone = { ...prop.zone };
      const body = el('div', {});
      const render = () => {
        sim = (t) => PalmCal.judge(t, size, zone.on ? zone : null, hand); paint();
        const pc = palms.filter((t) => sim(t)).length, fc = fingers.filter((t) => sim(t)).length;
        const by = {}; for (const t of palms) { const r = sim(t); if (r) by[r] = (by[r] || 0) + 1; }
        body.innerHTML = '';
        body.append(
          el('div', { class: 'pc-score' }, el('b', {}, `${pc} de ${palms.length}`), ' toques da palma seriam ignorados', el('br'), el('b', {}, `${fingers.length - fc} de ${fingers.length}`), ' toques do dedo continuariam funcionando'),
          el('p', { class: 'pc-why' }, Object.entries(by).map(([k, v]) => `${v} ${{ 'tamanho': 'pelo tamanho', 'caneta encostada': 'pela caneta encostada', 'zona da mão': 'pela zona da mão' }[k]}`).join(' · ') || '—'),
          el('p', { class: 'pc-why' }, `Tamanho medido: palma ${PalmCal.pct(palms.map((t) => t.max), 0.5) ?? '—'} px (mediana), dedo até ${fingers.length ? Math.max(...fingers.map((t) => t.max)) : '—'} px.` + (hover ? '' : ' Sua caneta não avisou quando estava perto da tela: a zona da mão vale só logo depois de encostar.')),
          UI.slider('Palma a partir de', 20, 90, 1, size, (v) => { size = v; render(); }, (v) => v + ' px'),
          UI.check(`Zona da mão: toque logo depois da caneta (até ${(zone.ms / 1000).toFixed(1).replace('.', ',')} s) e do lado da mão que escreve`, zone.on, (v) => { zone.on = v; render(); }),
          el('p', { class: 'pc-why' }, 'No desenho: verde = acertou (palma ignorada / dedo funciona); laranja = errou.'));
      };
      render(); result.append(body);
      next.disabled = false;
      next.onclick = () => {
        S.palmGuard = true; S.palmSize = size; S.palmZone = { on: !!zone.on, ms: zone.ms, dx: zone.dx, dy: zone.dy }; Store.saveSettings();
         close();
      };
    }
    /* entrada (na captura da página; o Palm fica pausado enquanto ela está aberta) */
    const now = () => performance.now();
    const onDown = (e) => {
      if (!paper.contains(e.target)) return; e.preventDefault();
      if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
        pen = { t: now(), x: e.clientX, y: e.clientY, down: true };
        if (step === 1) { const r = box(); cur = [[e.clientX - r.left, e.clientY - r.top]]; strokes.push(cur); try { paper.setPointerCapture(e.pointerId); } catch (_) {} }
        return;
      }
      if (step > 2) return;
      const w = Math.max(e.width || 0, e.height || 0);
      live.set(e.pointerId, { x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, max: w, dt: now() - pen.t, dx: e.clientX - pen.x, dy: e.clientY - pen.y, penDown: pen.down });
      paint();
    };
    const onMove = (e) => {
      if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
        const down = !!(e.buttons & 1); if (!down && e.pointerType === 'pen') hover = true;
        pen = { t: now(), x: e.clientX, y: e.clientY, down };
        if (down && cur) { const r = box(); cur.push([e.clientX - r.left, e.clientY - r.top]); paint(); }
        return;
      }
      const t = live.get(e.pointerId); if (!t) return; e.preventDefault();
      t.max = Math.max(t.max, e.width || 0, e.height || 0); t.cx = e.clientX; t.cy = e.clientY; paint();
    };
    const onUp = (e) => {
      if (e.pointerType === 'pen' || e.pointerType === 'mouse') { pen = { t: now(), x: e.clientX, y: e.clientY, down: false }; if (cur) { cur = null; ui(); } return; }
      const t = live.get(e.pointerId); if (!t) return; live.delete(e.pointerId);
      t.max = Math.round(t.max); t.dt = Math.round(t.dt); t.dx = Math.round(t.dx); t.dy = Math.round(t.dy);
      (step === 1 ? palms : fingers).push(t); ui(); paint();
    };
    paper.addEventListener('pointerdown', onDown, true);
    addEventListener('pointermove', onMove, true); addEventListener('pointerup', onUp, true); addEventListener('pointercancel', onUp, true);
    paper.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    paper.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    const back = el('button', { class: 'cbtn round', title: 'Voltar', onclick: () => close() }); back.innerHTML = icon('arrowLeft');
    const page = el('div', { class: 'settings-page pc-page' }, el('header', { class: 'sp-head' }, back, el('h1', {}, 'Calibrar a palma')), el('div', { class: 'pc-body' }, side, paper));
    Palm.paused = true;
    let closed = false;
    function close() {
      if (closed) return; closed = true; Palm.paused = false; clearInterval(watch); removeEventListener('resize', fit);
      removeEventListener('pointermove', onMove, true); removeEventListener('pointerup', onUp, true); removeEventListener('pointercancel', onUp, true);
      page.remove();
    }
    const watch = setInterval(() => { if (!page.isConnected) close(); }, 500); /* fechada pelo voltar do Android */
    addEventListener('resize', fit);
    document.body.append(page); requestAnimationFrame(fit); ui();
    this._dbg = { palms, fingers, get hover() { return hover; }, close };
  },
};
