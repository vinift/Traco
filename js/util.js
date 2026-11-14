'use strict';
/* ===== Utilidades gerais ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function debounce(fn, ms) {
  let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t);
  return d;
}
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
function fmtDate(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? 'Hoje, ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Falha ao carregar ' + src)); document.head.append(s); });
}
function blobToDataURL(b) { return new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }
function dataURLToBlob(u) {
  const [h, d] = u.split(','); const mime = h.match(/:(.*?);/)[1]; const bin = atob(d);
  const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: mime });
}
function downloadBlob(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function pickFile(accept, multiple = false) {
  return new Promise((res) => {
    const inp = $('#filePick'); inp.value = ''; inp.accept = accept; inp.multiple = multiple;
    inp.onchange = () => res(multiple ? Array.from(inp.files) : inp.files[0] || null);
    inp.click();
  });
}
function safeName(s) { return (s || 'nota').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80); }

/* ===== Ícones (traço, 24x24) ===== */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  pen: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/><path d="m15 5 3 3"/>',
  highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  eraser: '<path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21"/><path d="M22 21H7M5 11l9 9"/>',
  lasso: '<path d="M7 22a5 5 0 0 1-2-4"/><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1"/><circle cx="5" cy="16" r="2"/>',
  shapes: '<rect x="3" y="3" width="8" height="8" rx="1"/><circle cx="17" cy="17" r="4"/><path d="M17 3l4 7h-8z"/>',
  text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
  protractor: '<path d="M2 19h20"/><path d="M4 19a8 8 0 0 1 16 0"/><path d="M12 19l4-6"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
  paste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.6-1.7h2A5.6 5.6 0 0 0 22 11c0-5-4.5-9-10-9Z"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>',
  cloudOff: '<path d="m2 2 20 20"/><path d="M5.8 5.8A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.3-.2M21.5 15.5A4.5 4.5 0 0 0 17.5 10h-1.8A7 7 0 0 0 10 5.1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  front: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  line: '<path d="M5 19 19 5"/>',
  arrow: '<path d="M5 19 19 5M9 5h10v10"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  triangle: '<path d="M12 4 21 20H3Z"/>',
  diamond: '<path d="M12 3 21 12 12 21 3 12Z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z"/>',
  fit: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z"/>',
  move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  pages: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  addPage: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>',
  chevLeft: '<path d="m15 18-6-6 6-6"/>',
  chevRight: '<path d="m9 18 6-6-6-6"/>',
  tune: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  minus: '<path d="M5 12h14"/>',
  scribble: '<path d="M3 17c2-6 4-6 5 0s3 6 4 0 3-6 4 0 3 6 5 0"/>',
  sticky: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2h-3"/><path d="M14 21v-5a2 2 0 0 1 2-2h5"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  checkSq: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  ocr: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 16l2.5-8L13 16M9 13h3M15 9h3M15 13h3"/>',
  align: '<path d="M3 6c4-2 8 2 12 0M3 12h18M3 18h14"/><path d="m18 4 3 2-3 2"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14.5h18M9 4v16M15 4v16"/>',
  folderFill: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sortUp: '<path d="M12 19V5M5 12l7-7 7 7"/>', sortDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  library: '<path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"/>',
  rowAbove: '<rect x="3" y="11" width="18" height="9" rx="1.5"/><path d="M12 2.5v6M9 5.5h6"/>',
  rowBelow: '<rect x="3" y="4" width="18" height="9" rx="1.5"/><path d="M12 15.5v6M9 18.5h6"/>',
  colLeft: '<rect x="11" y="3" width="9" height="18" rx="1.5"/><path d="M2.5 12h6M5.5 9v6"/>',
  colRight: '<rect x="4" y="3" width="9" height="18" rx="1.5"/><path d="M15.5 12h6M18.5 9v6"/>',
  merge: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 12h11M9.5 9.5 7 12l2.5 2.5M14.5 9.5 17 12l-2.5 2.5"/>',
  split: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M8 10l-2 2 2 2M16 10l2 2-2 2"/>',
  delRow: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M9 12h6"/>',
  delCol: '<rect x="7" y="3" width="10" height="18" rx="1.5"/><path d="M10 9.5l4 5M14 9.5l-4 5"/>',
  distribute: '<path d="M4 4h16M4 20h16"/><rect x="6" y="8" width="12" height="8" rx="1.5"/>',
  fillCell: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/><rect x="3.8" y="3.8" width="7.4" height="7.4" fill="currentColor" stroke="none"/>',
  laser: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
};
function icon(name) {
  const s = ICONS[name] || ICONS.star;
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${s}</svg>`;
}
function iconEl(name) { const t = document.createElement('template'); t.innerHTML = icon(name); return t.content.firstChild; }
function hydrateIcons(root = document) { $$('[data-icon]', root).forEach((s) => { if (!s.firstChild) s.innerHTML = icon(s.dataset.icon); }); }

/* ===== Toast ===== */
let toastT;
function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms);
}

/* ===== Modais ===== */
function openModal({ title, body, buttons = [], wide = false, onClose, focus = false }) {
  return new Promise((resolve) => {
    const back = el('div', { class: 'modal-back' });
    const m = el('div', { class: 'modal' + (wide ? ' wide' : '') });
    const mb = el('div', { class: 'mb' }); if (body) mb.append(body);
    const mf = el('div', { class: 'mf' });
    const close = (v) => { back.remove(); onClose && onClose(v); resolve(v); };
    for (const b of buttons) {
      mf.append(el('button', { class: 'btn ' + (b.cls || ''), onclick: async () => {
        if (b.action) { const r = await b.action(); if (r === false) return; close(r === undefined ? b.value : r); }
        else close(b.value);
      } }, b.label));
    }
    m.append(el('h2', {}, title), mb); if (buttons.length) m.append(mf);
    back.append(m);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(undefined); });
    $('#modalRoot').append(back);
    if (focus) { const f = m.querySelector('input,select,textarea'); if (f) setTimeout(() => f.focus(), 50); }
  });
}
async function askText(title, value = '', label = '') {
  const inp = el('input', { type: 'text', value });
  const body = el('div', { class: 'field' }, label ? el('label', {}, label) : null, inp);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') body.closest('.modal').querySelector('.btn.primary').click(); });
  return openModal({ title, body, focus: true, buttons: [{ label: 'Cancelar' }, { label: 'OK', cls: 'primary', action: () => inp.value.trim() || false }] });
}
function confirmBox(title, msg, okLabel = 'Confirmar', danger = false) {
  return openModal({ title, body: el('p', {}, msg), buttons: [{ label: 'Cancelar', value: false }, { label: okLabel, cls: danger ? 'primary danger-bg' : 'primary', value: true }] });
}
/* ===== Popover ===== */
function openPop(anchor, content, { onClose } = {}) {
  closePop();
  const back = el('div', { class: 'pop-back' });
  const pop = el('div', { class: 'pop' }, content);
  const root = $('#popRoot'); root.append(back, pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = r.left + r.width / 2 - pw / 2, y = r.bottom + 8;
  if (anchor.closest && anchor.closest('#subrail,#rail')) { x = r.right + 12; y = clamp(r.top - 12, 8, innerHeight - ph - 8); } // barras laterais: abre à direita
  else if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 8);
  pop.style.left = clamp(x, 8, innerWidth - pw - 8) + 'px'; pop.style.top = y + 'px';
  back.addEventListener('pointerdown', () => closePop());
  openPop._close = onClose;
  return pop;
}
function closePop() { const root = $('#popRoot'); if (root.firstChild) { root.innerHTML = ''; const c = openPop._close; openPop._close = null; c && c(); } }
function menu(anchor, items) {
  const m = el('div', { class: 'menu' });
  for (const it of items) {
    if (it === '-') { m.append(el('hr')); continue; }
    m.append(el('button', { class: it.danger ? 'danger' : '', onclick: () => { closePop(); it.run(); } }, it.icon ? iconEl(it.icon) : null, it.label));
  }
  openPop(anchor, m);
}
const PALETTE = ['#111827', '#4b5563', '#9ca3af', '#ffffff', '#dc2626', '#ea580c', '#d97706', '#facc15', '#16a34a', '#0d9488', '#0284c7', '#2563eb', '#4f46e5', '#7c3aed', '#c026d3', '#db2777', '#92400e', '#065f46'];
const HL_PALETTE = ['#fde047', '#fdba74', '#f9a8d4', '#86efac', '#7dd3fc', '#c4b5fd', '#fca5a5', '#d4d4d8'];
function colorPop(anchor, current, onPick, palette = PALETTE) {
  const wrap = el('div', {});
  const grid = el('div', { class: 'palette' });
  for (const c of palette) grid.append(el('div', { class: 'swatch' + (c.toLowerCase() === (current || '').toLowerCase() ? ' sel' : ''), style: { background: c }, onclick: () => { onPick(c); closePop(); } }));
  const custom = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(current) ? current : '#000000', style: { width: '100%', height: '36px', border: '0', background: 'transparent' } });
  custom.addEventListener('change', () => { onPick(custom.value); closePop(); });
  wrap.append(grid, el('div', { class: 'lbl-sm', style: { margin: '10px 0 4px' } }, 'Cor personalizada'), custom);
  openPop(anchor, wrap);
}
