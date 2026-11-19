'use strict';
/* ===== Seletor de cores: paleta, espectro, roda, conta-gotas, opacidade, recentes e paletas prontas ===== */
const READY_PALETTES = [
  ['Notewise', ['#000000', '#5f6368', '#d10000', '#ff7d2e', '#fec800', '#6ea300', '#008939', '#0081ff', '#0009d1', '#9700ff', '#d1005e', '#ff0073']],
  ['Pastel', ['#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#a5f3fc', '#bfdbfe', '#ddd6fe', '#fbcfe8']],
  ['Vibrante', ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']],
  ['Tons de cinza', ['#000000', '#1f2937', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#ffffff']],
  ['Terra', ['#7c2d12', '#9a3412', '#a16207', '#4d7c0f', '#365314', '#78350f', '#57534e', '#292524']],
  ['Marca-texto', ['#fde047', '#fdba74', '#f9a8d4', '#86efac', '#7dd3fc', '#c4b5fd', '#fca5a5', '#d4d4d8']],
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
  // recentes
  const rec = (S.recentColors || []).slice(0, 14);
  if (rec.length) { const r = el('div', { class: 'cpk-sw' }); for (const c of rec) r.append(el('button', { class: 'cdot', style: { background: c }, title: c, onclick: () => pick(c) })); root.append(el('div', { class: 'lbl-sm cpk-lab' }, 'Recentes'), r); }

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
    if (tab === 'pal') {
      { const gc = typeof UI !== 'undefined' && UI.groupColors ? UI.groupColors() : []; /* v0.28: cores do grupo atual primeiro */
        if (gc.length) { const r = el('div', { class: 'cpk-sw' }); for (const c of gc) r.append(el('button', { class: 'cdot' + (c === (current || '').toLowerCase() ? ' sel' : ''), style: { background: c }, title: c, onclick: () => pick(c) })); body.append(el('div', { class: 'cpk-pal' }, el('span', { class: 'lbl-sm' }, 'Grupo atual')), r); } }
      const g = el('div', { class: 'cpk-sw' }); for (const c of palette) g.append(el('button', { class: 'cdot' + (c.toLowerCase() === (current || '').toLowerCase() ? ' sel' : ''), style: { background: c }, title: c, onclick: () => pick(c) }));
      body.append(g);
      for (const [name, cols] of READY_PALETTES) {
        const row = el('div', { class: 'cpk-sw' }); for (const c of cols) row.append(el('button', { class: 'cdot', style: { background: c }, title: c, onclick: () => pick(c) }));
        const head = el('div', { class: 'cpk-pal' }, el('span', { class: 'lbl-sm' }, name));
        if (opts.tool && UI.colorList) head.append(el('button', { class: 'btn ghost cpk-addall', title: 'Adicionar todas estas cores à barra', onclick: () => { const list = UI.colorList(opts.tool); let n = 0; for (const c of cols) if (!list.some((x) => x.toLowerCase() === c)) { list.push(c); n++; } UI.save(); UI.renderOptions(); toast(n ? `${n} cor(es) adicionadas à barra` : 'Essas cores já estão na barra', 1500); } }, '+ barra'));
        body.append(head, row);
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
  return openPop(anchor, root);
}

/* conta-gotas: o próximo toque na página pega a cor daquele ponto */
Object.assign(Editor, {
  startEyedrop(cb) { this._eyedrop = cb; this.stage.classList.add('eyedrop'); toast('Toque na página para pegar a cor', 2500); },
  takeEyedrop(p) {
    const cb = this._eyedrop; this._eyedrop = null; this.stage.classList.remove('eyedrop'); if (!cb) return;
    const d = this.dpr;
    try { // v0.16: desenha só um quadradinho da página em volta do toque (a tela de cima agora é transparente) e fica com o pixel mais "forte"
      const wp = this.toWorld(p.x, p.y), pi = this.pageIndexAt(wp.x, wp.y, true); if (pi < 0) throw new Error('fora da página');
      const page = this.note.pages[pi], l = this.local(pi, wp.x, wp.y), s = this.cam.z * d, R = Math.round(3 * d), w = 2 * R + 1, h = w, x = R, y = R, x0 = 0, y0 = 0;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.setTransform(s, 0, 0, s, R - l.x * s, R - l.y * s);
      drawPageContent(cx, this.note, page, { x: l.x - R / s, y: l.y - R / s, w: w / s, h: h / s }, this.cam.z, { dpr: d });
      const px = cx.getImageData(0, 0, w, h).data; let bright = 0;
      for (let i = 0; i < px.length; i += 4) bright = Math.max(bright, px[i] + px[i + 1] + px[i + 2]);
      const ci = ((Math.min(y - y0, h - 1)) * w + Math.min(x - x0, w - 1)) * 4; let best = ci, bd = -1;
      for (let i = 0; i < px.length; i += 4) { const dd = bright - (px[i] + px[i + 1] + px[i + 2]) + (Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2])); if (dd > bd) { bd = dd; best = i; } }
      const c = rgbaToHex({ r: px[best], g: px[best + 1], b: px[best + 2] }); cb(c); toast('Cor ' + c.toUpperCase() + ' escolhida', 1500);
    }
    catch (e) { toast('Não consegui ler a cor deste ponto'); }
  },
});
