'use strict';
/* ===== Armazenamento local (IndexedDB com reserva em memória) ===== */
const DB = {
  db: null, mem: null,
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('traco-notas', 1);
        r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('notes', { keyPath: 'id' }); d.createObjectStore('blobs'); d.createObjectStore('meta'); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch (e) {
      console.warn('IndexedDB indisponível, usando memória', e);
      this.mem = { notes: new Map(), blobs: new Map(), meta: new Map() };
    }
  },
  _req(store, mode, fn) {
    if (this.mem) return Promise.resolve(fn(null));
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode); const s = t.objectStore(store); const r = fn(s);
      t.oncomplete = () => res(r && 'result' in r ? r.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  get(store, key) { return this.mem ? Promise.resolve(this.mem[store].get(key)) : this._req(store, 'readonly', (s) => s.get(key)); },
  put(store, val, key) {
    if (this.mem) { this.mem[store].set(key ?? val.id, val); return Promise.resolve(); }
    return this._req(store, 'readwrite', (s) => (key === undefined ? s.put(val) : s.put(val, key)));
  },
  del(store, key) { if (this.mem) { this.mem[store].delete(key); return Promise.resolve(); } return this._req(store, 'readwrite', (s) => s.delete(key)); },
  all(store) { return this.mem ? Promise.resolve([...this.mem[store].values()]) : this._req(store, 'readonly', (s) => s.getAll()); },
  keys(store) { return this.mem ? Promise.resolve([...this.mem[store].keys()]) : this._req(store, 'readonly', (s) => s.getAllKeys()); },
};

const DEFAULT_TEMPLATE = { type: 'lines', spacing: 32, thickness: 1, color: '#a9bcd6', opacity: 1, paper: '#fbf9f3', margin: true, marginColor: '#f19a9a', top: 80 };
/* Modelo do Notewise (medido de um PDF exportado): folha 3480×4000, grade a cada 100 unidades,
   linha ~4,5 unidades em cinza bem claro, centralizada. No Traço a folha tem 1000 de largura. */
const NW_SCALE = 1000 / 3480;
const NW_BASE = { spacing: 100 * NW_SCALE, thickness: 0.95, color: '#f1f1f1', opacity: 1, paper: '#ffffff', margin: false, marginColor: '#f19a9a', top: 0, center: true, nw: true };
const NOTEWISE_TEMPLATES = { grid: { ...NW_BASE, type: 'grid', nwDensity: 6 }, grid7: { ...NW_BASE, type: 'grid', spacing: 80 * NW_SCALE, nwDensity: 7 }, lines: { ...NW_BASE, type: 'lines' }, dots: { ...NW_BASE, type: 'dots', thickness: 1.6, color: '#c9c9c9' }, blank: { ...NW_BASE, type: 'blank' } };
const NOTEWISE_PAPERS = [['#ffffff', 'Branco'], ['#f8f6e9', 'Creme'], ['#d8c5a4', 'Bege'], ['#dbe3ee', 'Azul-claro'], ['#2e2e2e', 'Cinza-escuro'], ['#000000', 'Preto']];
const isDarkPaper = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return false; const n = parseInt(m[1], 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 110; };
const PAGE_SIZES = {
  notewise: { label: 'Notewise (3480 × 4000)', w: 1000, h: 4000 * NW_SCALE },
  a4: { label: 'A4 retrato', w: 794, h: 1123 }, a4l: { label: 'A4 paisagem', w: 1123, h: 794 },
  letter: { label: 'Carta', w: 816, h: 1056 }, a5: { label: 'A5', w: 559, h: 794 },
  wide: { label: 'Widescreen 16:9', w: 1280, h: 720 }, custom: { label: 'Personalizado', w: 900, h: 1200 },
};
const DEFAULT_SETTINGS = {
  fingerDraws: false, palmGuard: true, pressure: true, pressureSens: 0.6, stabilizer: 0.55, shapeHold: true, scribbleErase: true, lowLatency: false, theme: 'auto',
  colorPresets: {
    pen: ['#111827', '#4b5563', '#2563eb', '#0d9488', '#16a34a', '#dc2626', '#ea580c', '#7c3aed'],
    highlighter: ['#fde047', '#86efac', '#7dd3fc', '#f9a8d4', '#fdba74', '#c4b5fd'],
  },
  widthPresets: {
    pen: [0.3, 0.5, 0.8, 1, 1.3, 1.6, 2, 2.5, 3, 4], highlighter: [6, 10, 14, 18, 24, 32], shape: [0.5, 1, 1.5, 2, 3, 4], text: [14, 18, 22, 28, 36], eraser: [8, 14, 24, 40, 64],
  },
  tools: {
    pen: { color: '#111827', width: 2.5, type: 'ball', nib: 45 },
    highlighter: { color: '#fde047', width: 18, opacity: 0.4 },
    eraser: { mode: 'stroke', size: 14, onlyHl: false },
    shape: { kind: 'rect', color: '#111827', width: 2.5, fill: false, fillColor: '#bfdbfe' },
    text: { color: '#111827', size: 22, bold: false, font: 'sys', align: 'left', ruled: false },
    sticky: { bg: '#fde68a', color: '#1f2937', size: 18 },
    lasso: { mode: 'free', locked: false },
    table: { cols: 3, rows: 6, hRow: true, hCol: true, bw: 2, bc: '#7c3aed', fill: null },
  },
  angleSnap: true, straightAlways: false, hlHold: true, hlStraight: false, barSize: 'compact',
  snapPage: true, snapObjects: true, snapAngle: true, snapRatio: true, userName: 'Vinicius', libSort: { by: 'name', dir: 1 }, libView: 'grid', sideClosed: false,
  penMap: { 'pen:2': 'eraser', 'pen:32': 'eraser' },
  presetGroups: null,
  presets: {
    pen: [{ color: '#111827', width: 2 }, { color: '#2563eb', width: 2.5 }, { color: '#dc2626', width: 2.5 }, { color: '#16a34a', width: 4 }],
    highlighter: [{ color: '#fde047', width: 18 }, { color: '#86efac', width: 18 }, { color: '#f9a8d4', width: 18 }],
  },
  template: { ...NOTEWISE_TEMPLATES.grid }, pageSize: 'notewise', layout: 'pages',
  myTemplates: [],
  drive: { clientId: '', clientSecret: '', enabled: false, folderId: null, lastSync: 0, auto: true, pdf: true, layout: 2 },
  plugins: [],
};

const Store = {
  settings: null, heads: {}, folders: [], driveMap: {}, dirty: { notes: {}, blobs: {}, deleted: {} },
  async init() {
    await DB.open();
    const s = await DB.get('meta', 'settings');
    this.settings = mergeDeep(clone(DEFAULT_SETTINGS), s || {});
    this.heads = (await DB.get('meta', 'heads')) || {};
    this.folders = (await DB.get('meta', 'folders')) || [];
    this.driveMap = (await DB.get('meta', 'driveMap')) || {};
    this.dirty = mergeDeep({ notes: {}, blobs: {}, deleted: {}, pdfs: {}, folders: {} }, (await DB.get('meta', 'dirty')) || {});
    const S = this.settings;
    if (!S.presetGroups || !S.presetGroups.length) { // migra predefinições antigas para o grupo "Geral"
      S.presetGroups = [{ id: 'default', name: 'Geral', colors: clone(S.colorPresets), widths: clone(S.widthPresets) }];
      this.saveSettings();
    }
    if (S.penButton && !S.penMapMigrated) { S.penMap = { 'pen:2': S.penButton === 'none' ? undefined : S.penButton, 'pen:32': 'eraser' }; if (!S.penMap['pen:2']) delete S.penMap['pen:2']; S.penMapMigrated = true; this.saveSettings(); }
    if (S.nwTplMap) { delete S.nwTplMap; this.saveSettings(); } // v0.8.6: modelos de PDF não são mais aplicados automaticamente nas importações
    if (!S.widthsV9) { // v0.9: espessuras mais próximas (só troca as listas que ainda eram as padrão antigas)
      const OLD = { pen: '1,1.5,2,2.5,3,4,6', highlighter: '8,12,18,24,32', shape: '1,2,3,5' };
      const fix = (w) => { if (!w) return; for (const k of Object.keys(OLD)) if (Array.isArray(w[k]) && w[k].join(',') === OLD[k]) w[k] = clone(DEFAULT_SETTINGS.widthPresets[k]); };
      fix(S.widthPresets); for (const g of S.presetGroups || []) fix(g.widths);
      S.widthsV9 = true; this.saveSettings();
    }
    if (!S.stabV8) { if ((S.stabilizer ?? 0) < 0.55) S.stabilizer = 0.55; S.stabV8 = true; this.saveSettings(); } // v0.8: estabilização mais forte por padrão
    for (const t of ['pen', 'shape']) if (!S.tools[t].dash) S.tools[t].dash = 'solid';
    if (S.nwDefaultSet && S.template && S.template.nw && (S.template.color === '#e8e8e8' || S.template.thickness === 1.25)) { S.template.color = '#f1f1f1'; S.template.thickness = 0.95; }
    if (!S.nwDefaultSet) { S.template = clone(NOTEWISE_TEMPLATES.grid); S.pageSize = 'notewise'; S.layout = 'pages'; S.nwDefaultSet = true; this.saveSettings(); } // modelo Notewise como padrão
  },
  saveSettings: debounce(function () { DB.put('meta', clone(Store.settings), 'settings'); }, 300),
  saveHeads() { return DB.put('meta', this.heads, 'heads'); },
  saveFolders() { this.markLib(); for (const f of this.folders) this.dirty.folders[f.id] = 1; this.saveDirty(); return DB.put('meta', this.folders, 'folders'); },
  group(id) { const G = this.settings.presetGroups; return G.find((g) => g.id === id) || G[0]; },
  folderOf(note) { return note && note.folderId ? this.folders.find((f) => f.id === note.folderId) : null; },
  folderChain(id) { const out = []; let f = this.folders.find((x) => x.id === id), guard = 0; while (f && guard++ < 50) { out.unshift(f); f = this.folders.find((x) => x.id === f.parentId); } return out; },
  activeGroup(note) { // grupo da nota → da pasta → das pastas acima → "Geral"
    if (note && note.groupId) return this.group(note.groupId);
    const chain = note && note.folderId ? this.folderChain(note.folderId) : [];
    for (let i = chain.length - 1; i >= 0; i--) if (chain[i].groupId) return this.group(chain[i].groupId);
    return this.group('default');
  },
  saveDriveMap() { return DB.put('meta', this.driveMap, 'driveMap'); },
  saveDirty() { return DB.put('meta', this.dirty, 'dirty'); },
  markLib() { this.dirty.lib = true; this.saveDirty(); },
  getNote(id) { return DB.get('notes', id); },
  async putNote(note, { sync = true } = {}) {
    note.updated = note.updated || Date.now();
    await DB.put('notes', note);
    const h = this.heads[note.id] || {};
    const texts = []; note.pages.forEach((pg, i) => { pg.elements.forEach((e) => { if (e.type === 'text' && e.text) texts.push([i, e.id, e.text.slice(0, 400)]); }); if (pg.ocr && pg.ocr.text) texts.push([i, '', pg.ocr.text.slice(0, 1500)]); });
    this.heads[note.id] = { id: note.id, title: note.title, folderId: note.folderId || null, created: note.created, updated: note.updated, mode: note.mode, pages: note.pages.length, thumb: h.thumb || null, hasPdf: note.pages.some((p) => p.pdf), texts: texts.slice(0, 300), bm: note.pages.filter((p) => p.bookmark).length };
    await this.saveHeads();
    if (sync) { this.dirty.notes[note.id] = 1; this.dirty.pdfs[note.id] = Date.now(); this.dirty.lib = true; await this.saveDirty(); Drive.schedule(); }
  },
  async setThumb(id, thumb) { if (this.heads[id]) { this.heads[id].thumb = thumb; await this.saveHeads(); } },
  async deleteNote(id) {
    await DB.del('notes', id); delete this.heads[id]; await this.saveHeads();
    delete this.dirty.notes[id]; this.dirty.deleted[id] = 1; this.dirty.lib = true; await this.saveDirty(); Drive.schedule();
  },
  async putBlob(blob, id = uid()) { await DB.put('blobs', blob, id); this.dirty.blobs[id] = 1; await this.saveDirty(); return id; },
  getBlob(id) { return DB.get('blobs', id); },
};
function mergeDeep(a, b) {
  for (const k of Object.keys(b || {})) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) mergeDeep(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}

/* ===== Modelo de nota ===== */
function newPage(w, h, template = null) { return { id: uid(), w, h, template, pdf: null, elements: [] }; }
function newNote({ title, folderId = null, mode = 'pages', w = 794, h = 1123, template }) {
  const now = Date.now();
  return { id: uid(), title: title || 'Nota sem título', folderId, mode, template: clone(template || DEFAULT_TEMPLATE), pages: [newPage(w, h)], created: now, updated: now, view: null, v: 1 };
}
