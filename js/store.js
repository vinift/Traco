'use strict';
/* ===== Armazenamento local (IndexedDB com reserva em memória) ===== */
const DB = {
  db: null, mem: null,
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('traco-notas', 2);
        r.onupgradeneeded = () => { // v2: a escrita de cada página fica num registro separado (salvar só o que mudou)
          const d = r.result, has = (n) => d.objectStoreNames.contains(n);
          if (!has('notes')) d.createObjectStore('notes', { keyPath: 'id' }); if (!has('blobs')) d.createObjectStore('blobs'); if (!has('meta')) d.createObjectStore('meta'); if (!has('pages')) d.createObjectStore('pages');
        };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch (e) {
      console.warn('IndexedDB indisponível, usando memória', e);
      this.mem = { notes: new Map(), blobs: new Map(), meta: new Map(), pages: new Map() };
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
  getMany(store, keys) { // várias chaves numa transação só
    if (this.mem) return Promise.resolve(keys.map((k) => this.mem[store].get(k)));
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, 'readonly'), s = t.objectStore(store), out = new Array(keys.length);
      keys.forEach((k, i) => { const r = s.get(k); r.onsuccess = () => { out[i] = r.result; }; });
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  /* grava a nota (sem a escrita) e só as páginas indicadas, tudo numa transação */
  writeNote(meta, pages, removeKeys, wipePrefix) {
    if (this.mem) {
      if (wipePrefix) for (const k of [...this.mem.pages.keys()]) if (k.startsWith(wipePrefix)) this.mem.pages.delete(k);
      this.mem.notes.set(meta.id, meta); for (const [k, v] of pages) this.mem.pages.set(k, v); for (const k of removeKeys) this.mem.pages.delete(k); return Promise.resolve();
    }
    return new Promise((res, rej) => {
      const t = this.db.transaction(['notes', 'pages'], 'readwrite'), P = t.objectStore('pages');
      if (wipePrefix) P.delete(IDBKeyRange.bound(wipePrefix, wipePrefix + '\uffff'));
      t.objectStore('notes').put(meta); for (const [k, v] of pages) P.put(v, k); for (const k of removeKeys) P.delete(k);
      t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  delNote(id) {
    const pre = id + '/';
    if (this.mem) { this.mem.notes.delete(id); for (const k of [...this.mem.pages.keys()]) if (k.startsWith(pre)) this.mem.pages.delete(k); return Promise.resolve(); }
    return new Promise((res, rej) => {
      const t = this.db.transaction(['notes', 'pages'], 'readwrite'); t.objectStore('notes').delete(id); t.objectStore('pages').delete(IDBKeyRange.bound(pre, pre + '\uffff'));
      t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
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
    this.trash = mergeDeep({ notes: {}, folders: {} }, (await DB.get('meta', 'trash')) || {});
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
  /* ---------- Lixeira: itens excluídos ficam 30 dias e podem ser restaurados ---------- */
  TRASH_DAYS: 30,
  saveTrash() { return DB.put('meta', this.trash, 'trash'); },
  async trashNote(id, group = uid()) {
    const h = this.heads[id]; if (!h) return;
    this.trash.notes[id] = { head: h, at: Date.now(), group }; delete this.heads[id];
    await this.saveHeads(); await this.saveTrash();
  },
  async trashFolders(list, group = uid()) {
    const ids = new Set(list.map((f) => f.id));
    for (const f of list) this.trash.folders[f.id] = { folder: clone(f), at: Date.now(), group };
    this.folders = this.folders.filter((x) => !ids.has(x.id)); await this.saveFolders(); await this.saveTrash();
  },
  trashCount() { return Object.keys(this.trash.notes).length + Object.keys(this.trash.folders).length; },
  async restoreTrash(group) { // restaura tudo o que foi excluído junto
    const F = Object.entries(this.trash.folders).filter(([, x]) => x.group === group), N = Object.entries(this.trash.notes).filter(([, x]) => x.group === group);
    const back = new Set(F.map(([id]) => id));
    for (const [id, x] of F) { const f = x.folder; if (f.parentId && !back.has(f.parentId) && !this.folders.some((y) => y.id === f.parentId)) f.parentId = null; this.folders.push(f); delete this.trash.folders[id]; }
    for (const [id, x] of N) {
      const h = x.head; const exists = !h.folderId || back.has(h.folderId) || this.folders.some((y) => y.id === h.folderId);
      if (!exists) { h.folderId = null; const n = await DB.get('notes', id); if (n) { n.folderId = null; await DB.put('notes', n); } }
      this.heads[id] = h; delete this.trash.notes[id];
    }
    await this.saveFolders(); await this.saveHeads(); await this.saveTrash(); this.dirty.lib = true; await this.saveDirty();
    return { folders: F.length, notes: N.length };
  },
  async purgeTrash(filter = () => true) { // exclui de vez (no Drive, vai para a lixeira do Drive)
    let n = 0;
    for (const [id, x] of Object.entries(this.trash.notes)) if (filter(x)) { await DB.delNote(id); delete this.trash.notes[id]; delete this.dirty.notes[id]; this.dirty.deleted[id] = 1; n++; }
    for (const [id, x] of Object.entries(this.trash.folders)) if (filter(x)) { delete this.trash.folders[id]; n++; }
    if (n) { this.dirty.lib = true; await this.saveDirty(); await this.saveTrash(); Drive.schedule(); }
    return n;
  },
  purgeOldTrash() { const lim = Date.now() - this.TRASH_DAYS * 864e5; return this.purgeTrash((x) => x.at < lim); },
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
  /* ---- notas: o "cabeçalho" (título, páginas, modelos) num registro e a escrita de cada página em outro.
     Ao salvar, só vão as páginas que mudaram (antes a nota inteira era regravada a cada traço: segundos em notas grandes). ---- */
  _sigs: new WeakMap(), // nota → (página → assinatura do que foi gravado)
  pageSigOf(pg) { let h = 2166136261 ^ pg.elements.length; for (const e of pg.elements) h = Math.imul(h ^ oid(e), 16777619) >>> 0; return h + ':' + oid(pg.elements); },
  async getNote(id) {
    let n = await DB.get('notes', id); if (!n) return n;
    if (DB.mem) n = { ...n, pages: n.pages.map((p) => ({ ...p })) }; // reserva em memória: não mexe no registro guardado
    if (n.split) {
      const els = await DB.getMany('pages', n.pages.map((p) => id + '/' + p.id));
      n.pages.forEach((p, i) => { p.elements = els[i] || []; }); delete n.split;
      this._sigs.set(n, new Map(n.pages.map((p) => [p.id, this.pageSigOf(p)])));
      const conv = new Set(); for (const p of n.pages) { let c = false; for (const e of p.elements) if (toPts32(e)) c = true; if (c) conv.add(p.id); }
      if (conv.size) this._conv.set(n, conv); // páginas ainda no formato antigo: regravadas aos poucos (compactLater)
    } else for (const p of n.pages) for (const e of p.elements) toPts32(e); // formato antigo (nota inteira num registro): o próximo salvamento grava tudo no formato novo
    return n;
  },
  _conv: new WeakMap(),
  compactLater(note) { // regrava, uma página por vez e só quando você não está escrevendo, as páginas convertidas para o formato compacto
    const conv = this._conv.get(note); if (!conv || !conv.size) return;
    clearTimeout(this._cT);
    this._cT = setTimeout(async () => {
      if (typeof Editor === 'undefined' || Editor.note !== note) return;
      if (Date.now() - (Editor.lastInput || 0) < 4000) return this.compactLater(note);
      const id = conv.values().next().value; conv.delete(id);
      const p = note.pages.find((x) => x.id === id);
      if (p) try { await DB.put('pages', p.elements, note.id + '/' + p.id); } catch (e) { console.warn(e); }
      this.compactLater(note);
    }, 600);
  },
  async putNote(note, { sync = true } = {}) {
    note.updated = note.updated || Date.now();
    const prev = this._sigs.get(note), cur = new Map(), writes = [];
    for (const p of note.pages) { const s = this.pageSigOf(p); cur.set(p.id, s); if (!prev || prev.get(p.id) !== s) { for (const e of p.elements) toPts32(e); writes.push([note.id + '/' + p.id, p.elements]); } }
    const removed = prev ? [...prev.keys()].filter((k) => !cur.has(k)).map((k) => note.id + '/' + k) : [];
    const meta = { ...note, split: true, pages: note.pages.map((p) => { const { elements, ...m } = p; return m; }) };
    await DB.writeNote(meta, writes, removed, prev ? null : note.id + '/'); // nota sem histórico: grava tudo e limpa páginas antigas
    this._sigs.set(note, cur);
    const h = this.heads[note.id] || {};
    const texts = []; note.pages.forEach((pg, i) => { pg.elements.forEach((e) => { if (e.type === 'text' && e.text) texts.push([i, e.id, e.text.slice(0, 400)]); }); if (pg.ocr && pg.ocr.text) texts.push([i, '', pg.ocr.text.slice(0, 1500)]); });
    this.heads[note.id] = { id: note.id, title: note.title, folderId: note.folderId || null, created: note.created, updated: note.updated, mode: note.mode, pages: note.pages.length, thumb: h.thumb || null, hasPdf: note.pages.some((p) => p.pdf), texts: texts.slice(0, 300), bm: note.pages.filter((p) => p.bookmark).length };
    await this.saveHeads();
    if (sync) { this.dirty.notes[note.id] = 1; this.dirty.pdfs[note.id] = Date.now(); this.dirty.lib = true; await this.saveDirty(); Drive.schedule(); }
  },
  async setThumb(id, thumb) { if (this.heads[id]) { this.heads[id].thumb = thumb; await this.saveHeads(); } },
  async deleteNote(id) {
    await DB.delNote(id); delete this.heads[id]; await this.saveHeads();
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
