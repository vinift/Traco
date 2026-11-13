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
const PAGE_SIZES = {
  a4: { label: 'A4 retrato', w: 794, h: 1123 }, a4l: { label: 'A4 paisagem', w: 1123, h: 794 },
  letter: { label: 'Carta', w: 816, h: 1056 }, a5: { label: 'A5', w: 559, h: 794 },
  wide: { label: 'Widescreen 16:9', w: 1280, h: 720 }, custom: { label: 'Personalizado', w: 900, h: 1200 },
};
const DEFAULT_SETTINGS = {
  fingerDraws: false, palmGuard: true, pressure: true, pressureSens: 0.6, stabilizer: 0.35, shapeHold: true, scribbleErase: true, lowLatency: false, theme: 'auto',
  colorPresets: {
    pen: ['#111827', '#4b5563', '#2563eb', '#0d9488', '#16a34a', '#dc2626', '#ea580c', '#7c3aed'],
    highlighter: ['#fde047', '#86efac', '#7dd3fc', '#f9a8d4', '#fdba74', '#c4b5fd'],
  },
  widthPresets: {
    pen: [1, 1.5, 2, 2.5, 3, 4, 6], highlighter: [8, 12, 18, 24, 32], shape: [1, 2, 3, 5], text: [14, 18, 22, 28, 36], eraser: [8, 14, 24, 40, 64],
  },
  tools: {
    pen: { color: '#111827', width: 2.5 },
    highlighter: { color: '#fde047', width: 18, opacity: 0.4 },
    eraser: { mode: 'stroke', size: 14, onlyHl: false },
    shape: { kind: 'rect', color: '#111827', width: 2.5, fill: false, fillColor: '#bfdbfe' },
    text: { color: '#111827', size: 22, bold: false },
  },
  presets: {
    pen: [{ color: '#111827', width: 2 }, { color: '#2563eb', width: 2.5 }, { color: '#dc2626', width: 2.5 }, { color: '#16a34a', width: 4 }],
    highlighter: [{ color: '#fde047', width: 18 }, { color: '#86efac', width: 18 }, { color: '#f9a8d4', width: 18 }],
  },
  template: { ...DEFAULT_TEMPLATE }, pageSize: 'a4', layout: 'pages',
  myTemplates: [],
  drive: { clientId: '', clientSecret: '', enabled: false, folderId: null, lastSync: 0, auto: true },
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
    this.dirty = mergeDeep({ notes: {}, blobs: {}, deleted: {} }, (await DB.get('meta', 'dirty')) || {});
  },
  saveSettings: debounce(function () { DB.put('meta', clone(Store.settings), 'settings'); }, 300),
  saveHeads() { return DB.put('meta', this.heads, 'heads'); },
  saveFolders() { this.markLib(); return DB.put('meta', this.folders, 'folders'); },
  saveDriveMap() { return DB.put('meta', this.driveMap, 'driveMap'); },
  saveDirty() { return DB.put('meta', this.dirty, 'dirty'); },
  markLib() { this.dirty.lib = true; this.saveDirty(); },
  getNote(id) { return DB.get('notes', id); },
  async putNote(note, { sync = true } = {}) {
    note.updated = note.updated || Date.now();
    await DB.put('notes', note);
    const h = this.heads[note.id] || {};
    this.heads[note.id] = { id: note.id, title: note.title, folderId: note.folderId || null, created: note.created, updated: note.updated, mode: note.mode, pages: note.pages.length, thumb: h.thumb || null, hasPdf: note.pages.some((p) => p.pdf) };
    await this.saveHeads();
    if (sync) { this.dirty.notes[note.id] = 1; this.dirty.lib = true; await this.saveDirty(); Drive.schedule(); }
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
