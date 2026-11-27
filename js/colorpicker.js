'use strict';
/* ===== Seletor de cores: paleta, espectro, roda, conta-gotas, opacidade, recentes e paletas prontas ===== */
const READY_PALETTES = [ /* v1.45: Vibrante, Terra, Marca-texto e a básica sem nome saíram; novas paletas harmoniosas */
  ['Notewise', ['#000000', '#5f6368', '#d10000', '#ff7d2e', '#fec800', '#6ea300', '#008939', '#0081ff', '#0009d1', '#9700ff', '#d1005e', '#ff0073']],
  ['Canetas de estudo', ['#0f172a', '#1e3a8a', '#0f766e', '#14532d', '#7f1d1d', '#9d174d', '#4c1d95', '#78350f', '#334155', '#1d4ed8', '#0e7490', '#15803d', '#b91c1c', '#c2410c', '#6d28d9', '#a16207']],
  ['Suaves', ['#5b7b8f', '#6f8f8a', '#7d9a85', '#c9a96e', '#c08068', '#b07a8c', '#8a7fa8', '#9b8577', '#a9bccb', '#b3cbc6', '#b7c9bb', '#e6d2a8', '#e4b8a5', '#dcb6c2', '#c4bdd9', '#cbbfb5']],
  ['Natureza / Outono', ['#e0a526', '#c47a2c', '#a8442a', '#7a2e1f', '#8a8a2e', '#4f6b2a', '#2f4f3a', '#6b4a2f']],
  ['Pastel', ['#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#a5f3fc', '#bfdbfe', '#ddd6fe', '#fbcfe8']],
  ['Tons de cinza', ['#000000', '#1f2937', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#ffffff']],
];
/* conversões */
function hexToRgba(h) {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(h || '').trim()); if (!m) return null;
  const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
}
function rgbaToHex({ r, g, b, a = 1 }) {
  const h = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b) + (a < 0.995 ? h(a * 255) : '');
}
function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: mx ? d / mx : 0, v: mx };
}
function hsvToRgb({ h, s, v }) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
const colorHasAlpha = (c) => /^#[0-9a-f]{8}$/i.test(c || '');
function pushRecentColor(c) {
  const S = Store.settings; const l = (S.recentColors || []).filter((x) => x.toLowerCase() !== c.toLowerCase());
  l.unshift(c); S.recentColors = l.slice(0, 14); Store.saveSettings();
}

/* colorPop(âncora, cor atual, ao escolher, paleta, { alpha, tool }) */
function colorPop(anchor, current, onPick, palette = PALETTE, opts = {}) {
  const S = Store.settings;
  const rgba = hexToRgba(current) || { r: 0, g: 0, b: 0, a: 1 };
  const st = { ...rgbToHsv(rgba), a: opts.alpha ? rgba.a : 1 };
  const hex = () => rgbaToHex({ ...hsvToRgb(st), a: st.a });
  const pick = (c, close = true) => { pushRecentColor(c); onPick(c); if (close) closePop(); };
  const root = el('div', { class: 'cpk' });
  // topo: prévia, hex, conta-gotas
  const prev = el('div', { class: 'cpk-prev' }, el('i'));
  const hexIn = el('input', { type: 'text', class: 'cpk-hex', spellcheck: false, maxlength: 9 });
  hexIn.addEventListener('change', () => { const c = hexToRgba(hexIn.value.startsWith('#') ? hexIn.value : '#' + hexIn.value); if (!c) return sync(); Object.assign(st, rgbToHsv(c)); if (opts.alpha) st.a = c.a; sync(); });
  const canDrop = typeof Editor !== 'undefined' && Editor.note && !$('#editor').classList.contains('hidden');
  const drop = canDrop ? el('button', { class: 'icon-btn', title: 'Conta-gotas: toque na página para pegar uma cor', onclick: () => { closePop(); Editor.startEyedrop((c) => pick(c, false)); } }) : null;
  if (drop) drop.innerHTML = icon('eyedrop');
  const use = el('button', { class: 'btn primary cpk-use', onclick: () => pick(hex()) }, 'Usar');
  root.append(el('div', { class: 'cpk-top' }, prev, hexIn, drop, use));
  // abas
  const tabs = el('div', { class: 'seg cpk-tabs' }), body = el('div', { class: 'cpk-body' });
  const TABS = [['pal', 'Paleta'], ['spec', 'Espectro'], ['wheel', 'Roda']];
  let tab = S.pickerTab || 'pal';
  for (const [k, n] of TABS) tabs.append(el('button', { class: k === tab ? 'on' : '', onclick: (ev) => { tab = k; S.pickerTab = k; Store.saveSettings(); $$('button', tabs).forEach((b) => b.classList.toggle('on', b === ev.currentTarget)); build(); } }, n));
  root.append(tabs, body);
  // opacidade
  let alphaR = null;
  if (opts.alpha) { alphaR = el('input', { type: 'range', min: 5, max: 100, step: 1, class: 'cpk-alpha' }); alphaR.addEventListener('input', () => { st.a = +alphaR.value / 100; sync(); }); root.append(el('div', { class: 'cpk-row' }, el('span', { class: 'lbl-sm' }, 'Opacidade'), alphaR)); }
  /* v1.45: cada grupo de cores num cartão com título; a cor atual marcada em todos */
  const cur = (current || '').toLowerCase();
  const card = (title, cols, extra, cls = '') => {
    const g = el('div', { class: 'cpk-sw' }); for (const c of cols) g.append(el('button', { class: 'cdot' + (c.toLowerCase() === cur ? ' sel' : ''), style: { background: c }, title: c, onclick: () => pick(c) }));
    return el('div', { class: 'cpk-card ' + cls }, el('div', { class: 'cpk-pal' }, title, extra || null), g);
  };
  const rec = (S.recentColors || []).slice(0, 16);
  const recCard = () => rec.length ? card(el('span', { class: 'lbl-sm' }, 'Recentes'), rec, null, 'rec') : null;
  const recOut = el('div', { class: 'cpk-recout' }); root.append(recOut);

  let draw = () => {};
  function sync() {
    const h = hex(); hexIn.value = h.toUpperCase(); prev.firstChild.style.background = h;
    if (alphaR) { alphaR.value = Math.round(st.a * 100); alphaR.style.setProperty('--c', rgbaToHex({ ...hsvToRgb(st), a: 1 })); }
    draw();
  }
  const dragOn = (cv, fn) => {
    const go = (e) => { const r = cv.getBoundingClientRect(); fn((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); sync(); };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); go(e); });
    cv.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch' || e.pressure) go(e); });
  };
  function build() {
    body.innerHTML = ''; draw = () => {};
    recOut.innerHTML = ''; if (tab !== 'pal') { const r = recCard(); if (r) recOut.append(r); }
    if (tab === 'pal') {
      const gc = typeof UI !== 'undefined' && UI.groupColors ? UI.groupColors() : []; /* v0.28: cores do grupo atual primeiro */
      if (gc.length) { let gn = ''; try { gn = (UI.group() || {}).name || ''; } catch (_) {}
        body.append(card(el('span', { class: 'lbl-sm' }, 'Grupo atual', gn ? el('b', {}, ' · ' + gn) : null), gc, null, 'grp')); }
      { const r = recCard(); if (r) body.append(r); }
      if (palette !== PALETTE && palette.length) body.append(card(el('span', { class: 'lbl-sm' }, 'Sugestões'), palette)); /* paletas próprias de quem chamou (pasta, post-it, células…) */
      for (const [name, cols] of READY_PALETTES) {
        const add = opts.tool && UI.colorList ? el('button', { class: 'btn ghost cpk-addall', title: 'Adicionar todas estas cores à barra', onclick: () => { let n = 0; for (const c of cols) n += UI.addColorTo(opts.tool, c) ? 1 : 0; UI.save(); UI.renderOptions(); toast(n ? `${n} cor(es) adicionadas à barra` : 'Essas cores já estão na barra', 1500); } }, '+ barra') : null;
        body.append(card(el('span', { class: 'lbl-sm' }, name), cols, add));
      }
    } else if (tab === 'spec') {
      const sv = el('canvas', { class: 'cpk-sv', width: 260, height: 170 }), hue = el('canvas', { class: 'cpk-hue', width: 260, height: 18 });
      body.append(sv, hue);
      draw = () => {
        const c = sv.getContext('2d'), w = sv.width, h = sv.height, base = hsvToRgb({ h: st.h, s: 1, v: 1 });
        c.fillStyle = `rgb(${base.r},${base.g},${base.b})`; c.fillRect(0, 0, w, h);
        let gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
        gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
        ring(c, st.s * w, (1 - st.v) * h);
        const hc = hue.getContext('2d'); const hg = hc.createLinearGradient(0, 0, hue.width, 0);
        for (let i = 0; i <= 6; i++) { const q = hsvToRgb({ h: (i * 60) % 360 || (i === 6 ? 359.9 : 0), s: 1, v: 1 }); hg.addColorStop(i / 6, `rgb(${q.r},${q.g},${q.b})`); }
        hc.fillStyle = hg; hc.fillRect(0, 0, hue.width, hue.height); ring(hc, (st.h / 360) * hue.width, hue.height / 2, 7);
      };
      dragOn(sv, (x, y) => { st.s = clamp(x, 0, 1); st.v = clamp(1 - y, 0, 1); });
      dragOn(hue, (x) => { st.h = clamp(x, 0, 0.9999) * 360; });
    } else {
      const wh = el('canvas', { class: 'cpk-wheel', width: 220, height: 220 }), val = el('input', { type: 'range', min: 0, max: 100, step: 1, class: 'cpk-val' });
      body.append(wh, el('div', { class: 'cpk-row' }, el('span', { class: 'lbl-sm' }, 'Brilho'), val));
      val.addEventListener('input', () => { st.v = +val.value / 100; sync(); });
      let img = null;
      draw = () => {
        const c = wh.getContext('2d'), R = wh.width / 2;
        if (!img || img.v !== st.v) { // pinta a roda (matiz no ângulo, saturação no raio) para o brilho atual
          const id = c.createImageData(wh.width, wh.height);
          for (let y = 0; y < wh.height; y++) for (let x = 0; x < wh.width; x++) {
            const dx = x - R + 0.5, dy = y - R + 0.5, d = Math.hypot(dx, dy), k = (y * wh.width + x) * 4; if (d > R) continue;
            const q = hsvToRgb({ h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, s: d / R, v: st.v }); id.data[k] = q.r; id.data[k + 1] = q.g; id.data[k + 2] = q.b; id.data[k + 3] = d > R - 1 ? 128 : 255;
          }
          img = { v: st.v, id };
        }
        c.clearRect(0, 0, wh.width, wh.height); c.putImageData(img.id, 0, 0);
        const a = (st.h * Math.PI) / 180; ring(c, R + Math.cos(a) * st.s * R, R + Math.sin(a) * st.s * R);
        val.value = Math.round(st.v * 100); const top = hsvToRgb({ ...st, v: 1 }); val.style.setProperty('--c', `rgb(${top.r},${top.g},${top.b})`);
      };
      dragOn(wh, (x, y) => { const dx = x - 0.5, dy = y - 0.5; st.h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360; st.s = clamp(Math.hypot(dx, dy) * 2, 0, 1); if (st.v < 0.05) st.v = 1; });
    }
    sync();
  }
  function ring(c, x, y, r = 8) { c.save(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1.2; c.strokeStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.arc(x, y, r + 1.8, 0, Math.PI * 2); c.stroke(); c.restore(); }
  build();
  if (opts.allGroups && UI.allGroupsRow) { const r = UI.allGroupsRow(); if (r) root.append(r); } /* v1.20 */
  return openPop(anchor, root);
}

/* conta-gotas (v0.32): encostar na página mostra uma lupa com a cor embaixo do dedo/caneta; arrastar troca a cor na prévia;
   SOLTAR confirma (soltar fora da página cancela). */
Object.assign(Editor, {
  startEyedrop(cb) { this._eyedrop = cb; this.stage.classList.add('eyedrop'); hint('eyedrop', 'Encoste na página, arraste até a cor e solte', 2600); },
  readColorAt(p) {
    const d = this.dpr;
    try { /* desenha só um quadradinho da página em volta do ponto e fica com o pixel mais "forte" */
      const wp = this.toWorld(p.x, p.y), pi = this.pageIndexAt(wp.x, wp.y, true); if (pi < 0) return null;
      const page = this.note.pages[pi], l = this.local(pi, wp.x, wp.y), s = this.cam.z * d, R = Math.round(3 * d), w = 2 * R + 1, h = w;
      const cv = this._edCv || (this._edCv = document.createElement('canvas')); cv.width = w; cv.height = h; const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.setTransform(s, 0, 0, s, R - l.x * s, R - l.y * s);
      drawPageContent(cx, this.note, page, { x: l.x - R / s, y: l.y - R / s, w: w / s, h: h / s }, this.cam.z, { dpr: d });
      const px = cx.getImageData(0, 0, w, h).data; let bright = 0;
      for (let i = 0; i < px.length; i += 4) bright = Math.max(bright, px[i] + px[i + 1] + px[i + 2]);
      let best = (R * w + R) * 4, bd = -1;
      for (let i = 0; i < px.length; i += 4) { const dd = bright - (px[i] + px[i + 1] + px[i + 2]) + (Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2])); if (dd > bd) { bd = dd; best = i; } }
      return rgbaToHex({ r: px[best], g: px[best + 1], b: px[best + 2] });
    } catch (e) { return null; }
  },
  /* chamado no onDown com o conta-gotas ligado */
  eyedropDown(e) {
    const id = e.pointerId; let col = null, raf = 0, last = null;
    const lp = el('div', { class: 'ed-loupe' }, el('i'), el('b'));
    document.body.append(lp);
    const show = (cx, cy) => {
      const p = { x: cx - this.rect.left, y: cy - this.rect.top }; col = this.readColorAt(p);
      lp.style.left = cx + 'px'; lp.style.top = Math.max(60, cy - 90) + 'px'; lp.classList.toggle('none', !col);
      lp.firstChild.style.background = col || 'transparent'; lp.lastChild.textContent = col ? col.toUpperCase() : 'fora da página';
    };
    const move = (ev) => { if (ev.pointerId !== id) return; ev.preventDefault(); last = ev; if (!raf) raf = requestAnimationFrame(() => { raf = 0; show(last.clientX, last.clientY); }); };
    const up = (ev) => {
      if (ev.pointerId !== id) return; removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
      cancelAnimationFrame(raf); if (ev.type === 'pointerup') show(ev.clientX, ev.clientY); lp.remove();
      const cb = this._eyedrop; this._eyedrop = null; this.stage.classList.remove('eyedrop');
      if (ev.type !== 'pointerup' || !col || !cb) return toast(col ? 'Conta-gotas cancelado' : 'Soltou fora da página: conta-gotas cancelado', 1600);
      cb(col); 
    };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
    show(e.clientX, e.clientY);
  },
  takeEyedrop(p) { const c = this.readColorAt(p), cb = this._eyedrop; this._eyedrop = null; this.stage.classList.remove('eyedrop'); if (c && cb) cb(c); },
});
