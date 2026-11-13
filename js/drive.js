'use strict';
/* ===== Backup automático no Google Drive (OAuth por redirecionamento + API REST v3) ===== */
const Drive = {
  token: null, exp: 0, state: 'off', msg: '', running: false, again: false,
  SCOPE: 'https://www.googleapis.com/auth/drive.file',
  FOLDER: 'Traço Notas',
  get cfg() { return Store.settings.drive; },
  redirectUri() { return location.origin + location.pathname; },
  canUse() { return location.protocol === 'https:' || location.hostname === 'localhost'; },
  configured() { return !!(this.cfg.clientId && this.cfg.enabled); },
  hasAuth() { return !!(this.cfg.refreshToken || (this.token && Date.now() < this.exp)); },

  setStatus(state, msg = '') {
    this.state = state; this.msg = msg;
    const labels = { off: 'Drive desligado', need: 'Toque para conectar', ok: 'Salvo no Drive', busy: 'Sincronizando…', pending: 'Aguardando envio', err: 'Erro no backup' };
    for (const id of ['libSync', 'edSync']) {
      const p = document.getElementById(id); if (!p) continue;
      p.className = 'sync-pill ' + ({ ok: 'ok', busy: 'busy', err: 'err', need: 'err' }[state] || '') + (id === 'edSync' ? ' small' : '');
      p.innerHTML = icon(state === 'off' ? 'cloudOff' : state === 'ok' ? 'check' : state === 'busy' ? 'refresh' : 'cloud') + `<span class="txt">${labels[state]}</span>`;
      p.title = labels[state] + (msg ? ' — ' + msg : '') + (this.cfg.lastSync ? '\nÚltimo backup: ' + new Date(this.cfg.lastSync).toLocaleString('pt-BR') : '');
    }
  },
  refreshStatus() {
    if (!this.configured()) return this.setStatus('off');
    if (!this.hasAuth()) return this.setStatus('need');
    const d = Store.dirty; const pend = Object.keys(d.notes).length + Object.keys(d.blobs).length + Object.keys(d.deleted).length + (d.lib ? 1 : 0);
    this.setStatus(pend ? 'pending' : 'ok');
  },
  onPillClick() {
    if (!this.configured()) return openSettings('drive');
    if (!this.hasAuth()) return this.connect();
    this.sync(true);
  },

  /* ---- OAuth ---- */
  b64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  async connect() {
    if (!this.cfg.clientId) { toast('Informe o Client ID nas configurações'); return openSettings('drive'); }
    if (!this.canUse()) { toast('O Drive só funciona com o app hospedado em https'); return; }
    if (window.Editor && Editor.note) await Editor.saveNow();
    const state = uid() + uid();
    const verifier = this.b64url(crypto.getRandomValues(new Uint8Array(48)));
    const useCode = !!this.cfg.clientSecret;
    await DB.put('meta', { state, verifier, useCode, back: window.Editor && Editor.note ? Editor.note.id : null }, 'oauth');
    const p = new URLSearchParams({ client_id: this.cfg.clientId, redirect_uri: this.redirectUri(), scope: this.SCOPE, state, include_granted_scopes: 'true', response_type: useCode ? 'code' : 'token' });
    if (useCode) {
      const ch = this.b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      p.set('access_type', 'offline'); p.set('prompt', 'consent'); p.set('code_challenge', ch); p.set('code_challenge_method', 'S256');
    }
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
  },
  async handleRedirect() { // chamado na inicialização; retorna id de nota para reabrir
    const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
    const state = q.get('state') || h.get('state'); if (!state) return null;
    const saved = await DB.get('meta', 'oauth'); history.replaceState(null, '', this.redirectUri());
    if (!saved || saved.state !== state) { toast('Resposta de login inválida, tente novamente'); return null; }
    await DB.del('meta', 'oauth');
    const err = q.get('error') || h.get('error'); if (err) { toast('Login no Google cancelado: ' + err); return saved.back; }
    try {
      if (h.get('access_token')) { this.token = h.get('access_token'); this.exp = Date.now() + (+h.get('expires_in') - 60) * 1000; }
      else if (q.get('code')) {
        const r = await this.tokenReq({ code: q.get('code'), grant_type: 'authorization_code', redirect_uri: this.redirectUri(), code_verifier: saved.verifier });
        if (r.refresh_token) this.cfg.refreshToken = r.refresh_token;
      }
      this.cfg.enabled = true; Store.saveSettings.flush();
      toast('Google Drive conectado ✓'); setTimeout(() => this.sync(true), 500);
    } catch (e) { console.error(e); toast('Falha ao conectar: ' + e.message, 5000); }
    return saved.back;
  },
  async tokenReq(params) {
    const body = new URLSearchParams({ client_id: this.cfg.clientId, ...(this.cfg.clientSecret ? { client_secret: this.cfg.clientSecret } : {}), ...params });
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error_description || j.error || res.status);
    this.token = j.access_token; this.exp = Date.now() + ((j.expires_in || 3600) - 60) * 1000;
    return j;
  },
  async getToken() {
    if (this.token && Date.now() < this.exp) return this.token;
    if (this.cfg.refreshToken) {
      try { await this.tokenReq({ refresh_token: this.cfg.refreshToken, grant_type: 'refresh_token' }); return this.token; }
      catch (e) { if (/invalid_grant/i.test(e.message)) { delete this.cfg.refreshToken; Store.saveSettings(); } throw e; }
    }
    const err = new Error('Precisa conectar'); err.needAuth = true; throw err;
  },
  disconnect() {
    const t = this.cfg.refreshToken || this.token;
    if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST' }).catch(() => {});
    delete this.cfg.refreshToken; this.token = null; this.exp = 0; this.cfg.enabled = false; this.cfg.folderId = null; Store.saveSettings();
    this.refreshStatus();
  },

  /* ---- API ---- */
  async api(method, url, { body, headers = {}, raw = false } = {}, retry = true) {
    const tok = await this.getToken();
    const res = await fetch(url, { method, body, headers: { Authorization: 'Bearer ' + tok, ...headers } });
    if (res.status === 401 && retry) { this.token = null; this.exp = 0; return this.api(method, url, { body, headers, raw }, false); }
    if (!res.ok) { const t = await res.text(); const e = new Error(`Drive ${res.status}: ${t.slice(0, 200)}`); e.status = res.status; throw e; }
    return raw ? res : res.status === 204 ? null : res.json();
  },
  async ensureFolder() { // pasta raiz "Traço Notas"
    if (this.cfg.folderId) {
      try { const f = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${this.cfg.folderId}?fields=id,trashed`); if (!f.trashed) return this.cfg.folderId; } catch (e) { if (e.status !== 404) throw e; }
    }
    const q = encodeURIComponent(`name='${this.FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const l = await this.api('GET', `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
    let id = l.files && l.files[0] && l.files[0].id;
    if (!id) id = (await this.createFolder(this.FOLDER, null, { traco: 'root' })).id;
    this.cfg.folderId = id; Store.saveSettings(); return id;
  },
  createFolder(name, parent, appProperties) {
    return this.api('POST', 'https://www.googleapis.com/drive/v3/files?fields=id', { body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}), appProperties }), headers: { 'Content-Type': 'application/json' } });
  },
  entry(key) { const v = Store.driveMap[key]; return !v ? null : typeof v === 'string' ? { id: v } : v; },
  async setEntry(key, v) { Store.driveMap[key] = v; await Store.saveDriveMap(); },
  async ensureDataFolder() { // arquivos internos (imagens, PDFs originais, índice) ficam fora da vista
    const root = await this.ensureFolder(), e = this.entry('data');
    if (e) { try { const f = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${e.id}?fields=id,trashed`); if (!f.trashed) return e.id; } catch (er) { if (er.status !== 404) throw er; } }
    const f = await this.createFolder('_arquivos do app (não mexer)', root, { traco: 'data' });
    await this.setEntry('data', { id: f.id, parent: root }); return f.id;
  },
  async ensureNoteFolder(folderId) { // Traço Notas › nome da pasta
    const root = await this.ensureFolder(); if (!folderId) return root;
    const f = Store.folders.find((x) => x.id === folderId); if (!f) return root;
    const name = safeName(f.name), e = this.entry('f:' + folderId);
    if (e) {
      try {
        const g = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${e.id}?fields=id,name,trashed`);
        if (!g.trashed) { if (g.name !== name) await this.api('PATCH', `https://www.googleapis.com/drive/v3/files/${e.id}`, { body: JSON.stringify({ name }), headers: { 'Content-Type': 'application/json' } }); return e.id; }
      } catch (er) { if (er.status !== 404) throw er; }
    }
    const nf = await this.createFolder(name, root, { traco: 'folder', folderId });
    await this.setEntry('f:' + folderId, { id: nf.id, parent: root, name }); return nf.id;
  },
  /* cria ou atualiza um arquivo; renomeia e move de pasta quando preciso */
  async upsert(key, { name, mime, data, parent, props }) {
    const e = this.entry(key); const b = 'traco' + uid();
    const send = async (method, url, meta) => {
      const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`, data, `\r\n--${b}--`]);
      return this.api(method, url, { body, headers: { 'Content-Type': 'multipart/related; boundary=' + b } });
    };
    if (e) {
      try {
        let oldParent = e.parent;
        if (!oldParent) { const g = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${e.id}?fields=parents`); oldParent = (g.parents || [])[0]; }
        const mv = oldParent && oldParent !== parent ? `&addParents=${parent}&removeParents=${oldParent}` : '';
        await send('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${e.id}?uploadType=multipart&fields=id${mv}`, { name, appProperties: props });
        await this.setEntry(key, { id: e.id, parent, name }); return;
      } catch (er) { if (er.status !== 404) throw er; }
    }
    const f = await send('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { name, parents: [parent], mimeType: mime, appProperties: props });
    await this.setEntry(key, { id: f.id, parent, name });
  },
  async uploadResumable(key, name, blob, parent, props) {
    const res = await this.api('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      raw: true, body: JSON.stringify({ name, parents: [parent], appProperties: props }),
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': blob.type || 'application/octet-stream' },
    });
    const loc = res.headers.get('Location'); if (!loc) throw new Error('Upload sem Location');
    const up = await fetch(loc, { method: 'PUT', body: blob });
    if (!up.ok) throw new Error('Falha no envio do arquivo: ' + up.status);
    const j = await up.json(); await this.setEntry(key, { id: j.id, parent, name });
  },
  async trash(key) {
    const e = this.entry(key); if (!e) return;
    try { await this.api('PATCH', `https://www.googleapis.com/drive/v3/files/${e.id}`, { body: JSON.stringify({ trashed: true }), headers: { 'Content-Type': 'application/json' } }); } catch (er) { if (er.status !== 404) throw er; }
    delete Store.driveMap[key]; await Store.saveDriveMap();
  },
  async migrateLayout() { // organização antiga (tudo solto na raiz) → nova
    if (this.cfg.layoutV === 3) return;
    const root = await this.ensureFolder(), data = await this.ensureDataFolder();
    for (const key of Object.keys(Store.driveMap)) {
      const v = Store.driveMap[key]; if (typeof v !== 'string') continue;
      if (key.startsWith('b:') || key === 'lib') {
        try { await this.api('PATCH', `https://www.googleapis.com/drive/v3/files/${v}?addParents=${data}&removeParents=${root}`, { body: JSON.stringify({ appProperties: key === 'lib' ? { traco: 'lib' } : { traco: 'blob', blobId: key.slice(2) } }), headers: { 'Content-Type': 'application/json' } }); await this.setEntry(key, { id: v, parent: data }); }
        catch (er) { if (er.status === 404) { delete Store.driveMap[key]; } else throw er; }
      }
    }
    for (const id of Object.keys(Store.heads)) { Store.dirty.notes[id] = 1; Store.dirty.pdfs[id] = 1; } // reenvia com nomes legíveis
    Store.dirty.lib = true; await Store.saveDirty();
    this.cfg.layoutV = 3; Store.saveSettings();
  },

  /* ---- Sincronização ---- */
  schedule: debounce(() => Drive.sync(), 4000),
  async sync(manual = false) {
    if (!this.configured()) { this.refreshStatus(); return; }
    if (!navigator.onLine) { this.setStatus('pending', 'sem internet'); return; }
    if (this.running) { this.again = true; return; }
    this.running = true; this.setStatus('busy');
    try {
      await this.migrateLayout();
      const d = Store.dirty; d.pdfs = d.pdfs || {}; d.folders = d.folders || {};
      const data = await this.ensureDataFolder();
      for (const id of Object.keys(d.folders)) { if (Store.folders.find((f) => f.id === id)) await this.ensureNoteFolder(id); delete d.folders[id]; await Store.saveDirty(); }
      for (const key of Object.keys(Store.driveMap)) if (key.startsWith('f:') && !Store.folders.find((f) => f.id === key.slice(2))) { /* pasta apagada no app: as notas já foram movidas */ await this.trash(key); }
      for (const id of Object.keys(d.blobs)) {
        if (!this.entry('b:' + id)) { const blob = await Store.getBlob(id); if (blob) await this.uploadResumable('b:' + id, 'arquivo-' + id + (blob.type === 'application/pdf' ? '.pdf' : '.img'), blob, data, { traco: 'blob', blobId: id }); }
        delete d.blobs[id]; await Store.saveDirty();
      }
      for (const id of Object.keys(d.notes)) {
        const note = await Store.getNote(id);
        if (note) await this.upsert('n:' + id, { name: safeName(note.title) + '.traco', mime: 'application/json', data: JSON.stringify(note), parent: await this.ensureNoteFolder(note.folderId), props: { traco: 'nota', noteId: id } });
        delete d.notes[id]; await Store.saveDirty();
      }
      let pdfWait = false;
      for (const id of Object.keys(d.pdfs)) {
        if (this.cfg.pdf === false) { delete d.pdfs[id]; continue; }
        const editing = window.Editor && Editor.note && Editor.note.id === id;
        if (editing && Date.now() - (Editor.note.updated || 0) < 120000) { pdfWait = true; continue; } // espera você parar de escrever
        const note = await Store.getNote(id);
        if (note) { this.setStatus('busy', 'gerando PDF'); const pdf = await exportNotePdf(note); await this.upsert('p:' + id, { name: safeName(note.title) + '.pdf', mime: 'application/pdf', data: pdf, parent: await this.ensureNoteFolder(note.folderId), props: { traco: 'pdf', noteId: id } }); }
        delete d.pdfs[id]; await Store.saveDirty();
      }
      for (const id of Object.keys(d.deleted)) { await this.trash('n:' + id); await this.trash('p:' + id); delete d.deleted[id]; await Store.saveDirty(); }
      if (d.lib) {
        const heads = {}; for (const [k, v] of Object.entries(Store.heads)) heads[k] = { ...v, thumb: undefined, texts: undefined };
        await this.upsert('lib', { name: 'biblioteca.json', mime: 'application/json', data: JSON.stringify({ v: 1, folders: Store.folders, heads, groups: Store.settings.presetGroups, saved: Date.now() }), parent: data, props: { traco: 'lib' } });
        d.lib = false; await Store.saveDirty();
      }
      this.cfg.lastSync = Date.now(); Store.saveSettings();
      this.refreshStatus(); if (manual) toast('Backup no Drive concluído');
      if (pdfWait) { clearTimeout(this._pdfT); this._pdfT = setTimeout(() => this.sync(), 130000); }
    } catch (e) {
      console.error(e);
      if (e.needAuth) this.setStatus('need'); else this.setStatus('err', e.message);
      if (manual && !e.needAuth) toast('Erro no backup: ' + e.message, 5000);
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.schedule(); }
    }
  },
  async query(q) {
    const out = []; let pageToken = '';
    do {
      const r = await this.api('GET', `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q + ' and trashed=false')}&fields=nextPageToken,files(id,name,parents,appProperties)&pageSize=1000${pageToken ? '&pageToken=' + pageToken : ''}`);
      out.push(...r.files); pageToken = r.nextPageToken || '';
    } while (pageToken);
    return out;
  },
  async restore(onProgress) {
    const root = await this.ensureFolder();
    const prop = (v) => `appProperties has { key='traco' and value='${v}' }`;
    const [libs, blobs, notes, legacy] = await Promise.all([this.query(prop('lib')), this.query(prop('blob')), this.query(prop('nota')), this.query(`'${root}' in parents and name contains 'nota-'`)]);
    const legacyLib = libs.length ? [] : await this.query(`'${root}' in parents and name = 'biblioteca.json'`);
    const lib = libs[0] || legacyLib[0]; let n = 0, done = 0;
    if (lib) {
      const j = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${lib.id}?alt=media`);
      for (const f of j.folders || []) if (!Store.folders.find((x) => x.id === f.id)) Store.folders.push(f);
      if (j.groups) for (const g of j.groups) if (!Store.settings.presetGroups.find((x) => x.id === g.id)) Store.settings.presetGroups.push(g);
      await DB.put('meta', Store.folders, 'folders'); Store.saveSettings();
    }
    const noteFiles = notes.concat(legacy.filter((f) => /^nota-.+\.json$/.test(f.name)));
    const total = blobs.length + noteFiles.length; const localBlobs = new Set(await DB.keys('blobs'));
    for (const f of blobs) {
      const id = (f.appProperties && f.appProperties.blobId) || f.name.replace(/^arquivo-/, '').replace(/\.(pdf|img)$/, '');
      if (!this.entry('b:' + id)) Store.driveMap['b:' + id] = { id: f.id, parent: (f.parents || [])[0] };
      if (!localBlobs.has(id)) { const res = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { raw: true }); await DB.put('blobs', await res.blob(), id); }
      onProgress && onProgress(++done, total);
    }
    for (const f of noteFiles) {
      const remote = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`);
      const id = remote.id; if (!id) continue;
      if (!this.entry('n:' + id)) Store.driveMap['n:' + id] = { id: f.id, parent: (f.parents || [])[0] };
      const local = Store.heads[id];
      if (!local || (remote.updated || 0) > (local.updated || 0)) { await Store.putNote(remote, { sync: false }); n++; const t = await makeThumb(remote); if (t) await Store.setThumb(id, t); }
      onProgress && onProgress(++done, total);
    }
    await Store.saveDriveMap();
    return n;
  },
};
window.addEventListener('online', () => Drive.schedule());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Drive.configured() && Drive.hasAuth()) Drive.schedule.flush(); });
setInterval(() => { if (Drive.configured() && Drive.state !== 'busy' && Drive.state !== 'ok' && Drive.hasAuth()) Drive.sync(); }, 120000);
