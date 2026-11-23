'use strict';
/* ===== Backup automático no Google Drive (OAuth por redirecionamento + API REST v3) ===== */
const Drive = {
  token: null, exp: 0, state: 'off', msg: '', running: false, again: false,
  SCOPE: 'https://www.googleapis.com/auth/drive.file',
  FOLDER: 'Traço Notas',
  get cfg() { return (Store.settings && Store.settings.drive) || {}; }, /* v0.58.3: voltar ao app antes do Store.init terminar dava "Cannot read properties of null (reading 'drive')" */
  redirectUri() { return location.origin + location.pathname; },
  canUse() { return location.protocol === 'https:' || location.hostname === 'localhost'; },
  native() { return typeof Native !== 'undefined' && Native.on; }, /* v1.0: app nativo — login pela conta do Android, sem Client ID */
  configured() { return !!((this.cfg.clientId || this.native()) && this.cfg.enabled); },
  hasAuth() { return !!(this.cfg.refreshToken || (this.token && Date.now() < this.exp) || (this.native() && this.cfg.enabled && this.cfg.nativeAuth)); },

  setStatus(state, msg = '') {
    this.state = state; this.msg = msg;
    const labels = { off: 'Drive desligado', need: 'Toque para conectar', ok: 'Salvo no Drive', busy: 'Sincronizando…', pending: 'Aguardando envio', err: 'Erro no backup' };
    for (const id of ['libSync', 'edSync']) {
      const p = document.getElementById(id); if (!p) continue;
      p.className = 'sync-pill ' + ({ ok: 'ok', busy: 'busy', err: 'err', need: 'err' }[state] || '') + (id === 'edSync' ? ' small' : '');
      const pg = state === 'busy' && this.pg && this.pg.total ? this.pg : null, sub = pg && pg.sub != null ? pg.sub : null;
      const pct = pg ? Math.min(100, Math.round(((pg.done + (sub || 0) / 100) / pg.total) * 100)) : 0; // barra: progresso geral
      const step = pg ? `${Math.min(pg.done + 1, pg.total)}/${pg.total}` : '';
      const txt = pg ? (pg.label ? `${step} · ${pg.label}` : `Enviando ${step}`) : labels[state];
      p.innerHTML = icon(state === 'off' ? 'cloudOff' : state === 'ok' ? 'check' : state === 'busy' ? 'refresh' : 'cloud') + `<span class="txt">${esc(txt)}</span>` + (pg ? `<span class="pct">${sub != null ? sub : pct}%</span><i class="sbar"><i style="width:${pct}%"></i></i>` : '');
      p.classList.toggle('prog', !!pg);
      if (state === 'busy') { const ic = p.querySelector('svg'); if (ic) ic.style.animationDelay = -(performance.now() % 1200) + 'ms'; } /* v0.48.1: o ícone é recriado a cada atualização do progresso — continua o giro de onde estava (antes recomeçava e parecia voltar) */
      p.title = (pg ? txt + ` (${pct}%)` + (pg.label ? '\n' + pg.label : '') : labels[state]) + (msg ? ' — ' + msg : '') + (this.cfg.lastSync ? '\nÚltimo backup: ' + new Date(this.cfg.lastSync).toLocaleString('pt-BR') : '');
    }
  },
  refreshStatus() {
    if (!this.configured()) return this.setStatus('off');
    if (!this.hasAuth()) return this.setStatus('need');
    const d = Store.dirty; const pend = Object.keys(d.notes).length + Object.keys(d.blobs).length + Object.keys(d.deleted).length + (d.lib ? 1 : 0);
    this.setStatus(pend ? 'pending' : 'ok');
  },
  pillMenu(anchor, noteId) {
    if (!this.configured()) return openSettings('drive');
    if (!this.hasAuth()) return this.connect();
    const fid = !noteId && window.Library && Library.folder ? Library.folder : null;
    const where = noteId ? 'Abrir esta nota no Google Drive' : fid ? 'Abrir esta pasta no Google Drive' : 'Abrir "Traço Notas" no Google Drive';
    const st = { ok: 'Tudo salvo no Drive', busy: 'Sincronizando…', pending: 'Alterações aguardando envio', err: 'Erro no último backup', need: 'Precisa conectar' }[this.state] || '';
    menu(anchor, [
      { label: where, icon: 'external', run: () => (noteId ? this.openInDrive(noteId) : this.openFolderInDrive(fid)) },
      { label: 'Fazer backup agora', icon: 'refresh', run: () => this.sync(true) },
      '-',
      { label: st + (this.cfg.lastSync ? ' · ' + fmtDate(this.cfg.lastSync) : ''), icon: this.state === 'ok' ? 'check' : 'cloud', run: () => openSettings('drive') },
    ]);
  },
  openUrl(id) { const u = 'https://drive.google.com/drive/folders/' + id; const w = window.open(u, '_blank'); if (!w) location.href = u; },
  openInDrive(noteId) {
    const e = this.entry('d:' + noteId);
    if (e) return this.openUrl(e.id);
    toast('Esta nota ainda não foi enviada ao Drive — fazendo backup agora…', 3000); this.sync(true).then(() => { const e2 = this.entry('d:' + noteId); if (e2) this.openUrl(e2.id); });
  },
  openFolderInDrive(folderId) {
    const e = folderId ? this.entry('f:' + folderId) : null; const id = e ? e.id : this.cfg.folderId;
    if (id) return this.openUrl(id);
    toast('A pasta ainda não está no Drive — fazendo backup agora…', 3000); this.sync(true).then(() => { const e2 = folderId ? this.entry('f:' + folderId) : null; const id2 = e2 ? e2.id : this.cfg.folderId; if (id2) this.openUrl(id2); });
  },
  onPillClick() {
    if (!this.configured()) return openSettings('drive');
    if (!this.hasAuth()) return this.connect();
    this.sync(true);
  },

  /* ---- OAuth ---- */
  b64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  async connect() {
    if (this.native()) { /* v1.0: conta do Android (o Google bloqueia o login do site dentro de apps) */
      this.lastErr = '';
      try { this.token = await Native.driveToken(true); this.exp = Date.now() + 55 * 60000; this.persistTok(); this.cfg.enabled = true; this.cfg.nativeAuth = true; Store.saveSettings.flush(); this.refreshStatus(); toast('Google Drive conectado ✓'); setTimeout(() => this.sync(true), 500); return true; }
      catch (e) { this.lastErr = e.message; toast(e.message, 8000); return false; } /* v1.0.1: o erro também aparece nas Configurações */
    }
    if (!this.cfg.clientId) { toast('Informe o Client ID nas configurações'); return openSettings('drive'); }
    if (!this.canUse()) { toast('O Drive só funciona com o app hospedado em https'); return; }
    if (typeof Editor !== 'undefined' && Editor.note) await Editor.saveNow();
    const state = uid() + uid();
    const verifier = this.b64url(crypto.getRandomValues(new Uint8Array(48)));
    const useCode = !!this.cfg.clientSecret;
    await DB.put('meta', { state, verifier, useCode, back: typeof Editor !== 'undefined' && Editor.note ? Editor.note.id : null }, 'oauth');
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
      if (h.get('access_token')) { this.token = h.get('access_token'); this.exp = Date.now() + (+h.get('expires_in') - 60) * 1000; this.persistTok(); }
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
    this.token = j.access_token; this.exp = Date.now() + ((j.expires_in || 3600) - 60) * 1000; this.persistTok();
    return j;
  },
  /* a chave de acesso (vale ~1 h) fica guardada no aparelho: o backup em segundo plano e o app reaberto continuam sem pedir login */
  persistTok() { DB.put('meta', { token: this.token, exp: this.exp }, 'driveTok').catch(() => {}); },
  async loadTok() { if (this.token && Date.now() < this.exp) return; try { const t = await DB.get('meta', 'driveTok'); if (t && t.exp > Date.now()) { this.token = t.token; this.exp = t.exp; } } catch (_) {} },
  async getToken() {
    if (this.token && Date.now() < this.exp) return this.token;
    await this.loadTok(); if (this.token && Date.now() < this.exp) return this.token;
    if (this.native() && this.cfg.nativeAuth) { /* v1.0: renova sem tela pela conta do Android */
      try { this.token = await Native.driveToken(false); this.exp = Date.now() + 55 * 60000; this.persistTok(); return this.token; }
      catch (e) { if (e.needAuth) { this.cfg.nativeAuth = false; Store.saveSettings(); } throw e; }
    }
    if (this.cfg.refreshToken) {
      try { await this.tokenReq({ refresh_token: this.cfg.refreshToken, grant_type: 'refresh_token' }); return this.token; }
      catch (e) { if (/invalid_grant/i.test(e.message)) { delete this.cfg.refreshToken; Store.saveSettings(); } throw e; }
    }
    const err = new Error('Precisa conectar'); err.needAuth = true; throw err;
  },
  disconnect() {
    const t = this.cfg.refreshToken || this.token;
    if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST' }).catch(() => {});
    delete this.cfg.refreshToken; this.cfg.nativeAuth = false; this.token = null; this.exp = 0; this.cfg.enabled = false; this.cfg.folderId = null; Store.saveSettings();
    this.refreshStatus();
  },

  /* ---- API ---- */
  async api(method, url, { body, headers = {}, raw = false } = {}, retry = true) {
    const tok = await this.getToken();
    let res;
    for (let k = 0; ; k++) { // internet instável: tenta de novo (3×) antes de desistir
      try { res = await fetch(url, { method, body, headers: { Authorization: 'Bearer ' + tok, ...headers } }); break; }
      catch (e) { const safe = method !== 'POST' || /uploadType=resumable/.test(url); if (!safe || k >= 2 || !navigator.onLine) throw e; await sleep(1500 * (k + 1)); } // criar arquivo (POST) não repete: evitaria cópia dupla
    }
    if (res.status === 401 && retry) {
      if (this.native() && tok) { try { await Native.ask('driveForget', tok); } catch (_) {} } /* v1.3.1: senão o Android devolve a mesma chave vencida */
      this.token = null; this.exp = 0; this.persistTok(); return this.api(method, url, { body, headers, raw }, false);
    }
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
  async ensureNoteFolder(folderId, depth = 0) { // Traço Notas › pasta › subpasta…
    const root = await this.ensureFolder(); if (!folderId || depth > 20) return root;
    const f = Store.folders.find((x) => x.id === folderId); if (!f) return root;
    const parent = f.parentId ? await this.ensureNoteFolder(f.parentId, depth + 1) : root;
    const name = safeName(f.name), key = 'f:' + folderId, e = this.entry(key);
    if (e) {
      if (e.parent === parent && e.name === name && e.checked && Date.now() - e.checked < 60000) return e.id; // cache curto
      try {
        const g = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${e.id}?fields=id,name,parents,trashed`);
        if (!g.trashed) {
          const cur = (g.parents || [])[0], meta = {}; if (g.name !== name) meta.name = name;
          const mv = cur && cur !== parent ? `?addParents=${parent}&removeParents=${cur}` : '';
          if (meta.name || mv) await this.api('PATCH', `https://www.googleapis.com/drive/v3/files/${e.id}${mv}`, { body: JSON.stringify(meta), headers: { 'Content-Type': 'application/json' } });
          await this.setEntry(key, { id: e.id, parent, name, checked: Date.now() }); return e.id;
        }
      } catch (er) { if (er.status !== 404) throw er; }
    }
    const nf = await this.createFolder(name, parent, { traco: 'folder', folderId });
    await this.setEntry(key, { id: nf.id, parent, name, checked: Date.now() }); return nf.id;
  },
  async ensureNoteDir(note) { // Traço Notas › pasta › título da nota (pasta) › arquivos
    const parent = await this.ensureNoteFolder(note.folderId), name = safeName(note.title), key = 'd:' + note.id, e = this.entry(key);
    if (e) {
      try {
        const g = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${e.id}?fields=id,name,parents,trashed`);
        if (!g.trashed) {
          const cur = (g.parents || [])[0], meta = {}; if (g.name !== name) meta.name = name;
          const mv = cur && cur !== parent ? `?addParents=${parent}&removeParents=${cur}` : '';
          if (meta.name || mv) await this.api('PATCH', `https://www.googleapis.com/drive/v3/files/${e.id}${mv}`, { body: JSON.stringify(meta), headers: { 'Content-Type': 'application/json' } });
          if (mv || meta.name) await this.setEntry(key, { id: e.id, parent, name });
          return e.id;
        }
      } catch (er) { if (er.status !== 404) throw er; }
    }
    const f = await this.createFolder(name, parent, { traco: 'notedir', noteId: note.id });
    await this.setEntry(key, { id: f.id, parent, name }); return f.id;
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
    // envio em pedaços de 4 MB: se a internet cair no meio, continua de onde parou em vez de recomeçar (e dar "Failed to fetch")
    const total = blob.size, CH = 4 * 1024 * 1024; let off = 0, j = null, fails = 0;
    const range = (r) => { const g = r.headers.get('Range'); return g ? +g.split('-')[1] + 1 : null; };
    while (!j) {
      const end = Math.min(off + CH, total);
      let r;
      try { r = await fetch(loc, { method: 'PUT', headers: { 'Content-Range': total ? `bytes ${off}-${end - 1}/${total}` : 'bytes */0' }, body: blob.slice(off, end) }); }
      catch (e) {
        if (++fails > 4 || !navigator.onLine) throw e; await sleep(2000 * fails);
        const st = await fetch(loc, { method: 'PUT', headers: { 'Content-Range': `bytes */${total}` } }).catch(() => null); // até onde o Drive recebeu?
        if (st && st.ok) { j = await st.json(); break; }
        if (st && st.status === 308) { const nx = range(st); off = nx ?? 0; }
        continue;
      }
      if (r.ok) { j = await r.json(); break; }
      if (r.status === 308) { const nx = range(r); off = nx ?? end; fails = 0; this.pg && (this.pg.sub = Math.round((off / total) * 100), this.setStatus('busy')); continue; }
      throw new Error('Falha no envio do arquivo: ' + r.status);
    }
    await this.setEntry(key, { id: j.id, parent, name });
  },
  async trash(key) {
    const e = this.entry(key); if (!e) return;
    try { await this.api('PATCH', `https://www.googleapis.com/drive/v3/files/${e.id}`, { body: JSON.stringify({ trashed: true }), headers: { 'Content-Type': 'application/json' } }); } catch (er) { if (er.status !== 404) throw er; }
    delete Store.driveMap[key]; await Store.saveDriveMap();
  },
  async migrateLayout() { // organização antiga (tudo solto na raiz) → nova
    if (this.cfg.layoutV === 3) { // v3 → v4: cada nota ganha a própria pasta
      for (const id of Object.keys(Store.heads)) { Store.dirty.notes[id] = 1; if (this.entry('p:' + id)) Store.dirty.pdfs[id] = Store.dirty.pdfs[id] || 1; }
      await Store.saveDirty(); this.cfg.layoutV = 4; Store.saveSettings(); return;
    }
    if (this.cfg.layoutV === 4) return;
    const root = await this.ensureFolder(), data = await this.ensureDataFolder();
    for (const key of Object.keys(Store.driveMap)) {
      const v = Store.driveMap[key]; if (typeof v !== 'string') continue;
      if (key.startsWith('b:') || key === 'lib') {
        try { await this.api('PATCH', `https://www.googleapis.com/drive/v3/files/${v}?addParents=${data}&removeParents=${root}`, { body: JSON.stringify({ appProperties: key === 'lib' ? { traco: 'lib' } : { traco: 'blob', blobId: key.slice(2) } }), headers: { 'Content-Type': 'application/json' } }); await this.setEntry(key, { id: v, parent: data }); }
        catch (er) { if (er.status === 404) { delete Store.driveMap[key]; } else throw er; }
      }
    }
    for (const id of Object.keys(Store.heads)) { Store.dirty.notes[id] = 1; Store.dirty.pdfs[id] = 1; } // reenvia com nomes legíveis
    Store.dirty.lib = Date.now(); await Store.saveDirty();
    this.cfg.layoutV = 4; Store.saveSettings();
  },

  /* ---- Sincronização ---- */
  schedule: debounce(() => Drive.sync(), 4000),
  /* enquanto você escreve, o backup espera: enviar uma nota grande ou gerar PDF trava a escrita e pode estourar a memória */
  writingAgo() { return typeof Editor !== 'undefined' && Editor.note ? Date.now() - (Editor.lastInput || 0) : Infinity; },
  userBusy() { return this.writingAgo() < 25000; },          // escreveu nos últimos 25 s
  pdfAllowed() { return this.writingAgo() > 180000; },        // PDF só com a nota fechada ou 3 min sem mexer
  /* PDF automático: qualidade do backup (padrão 200 dpi). Se o app fechou gerando o PDF de uma nota (memória do tablet),
     a próxima tentativa usa 120 dpi; se fechar de novo, o PDF dessa nota deixa de ser gerado sozinho (dá para exportar à mão). */
  HEAVY: 'traco-heavy',
  heavyStart(info) { try { localStorage.setItem(this.HEAVY, JSON.stringify({ ...info, at: Date.now() })); } catch (_) {} },
  heavyEnd() { try { localStorage.removeItem(this.HEAVY); } catch (_) {} },
  checkCrash() {
    if (this.cfg.pdfCrashV !== 3) { this.cfg.pdfCrash = {}; this.cfg.pdfCrashV = 3; Store.saveSettings(); } // v0.10.1: o PDF ficou leve (de ~500 MB para ~100 MB de memória); religa o PDF automático das notas que tinham falhado
    let h = null; try { h = JSON.parse(localStorage.getItem(this.HEAVY) || 'null'); } catch (_) {} this.heavyEnd();
    if (!h || Date.now() - h.at > 864e5) return;
    logError(`O app fechou enquanto ${h.kind === 'pdf' ? 'gerava o PDF' : 'enviava'} de "${h.title}" (${h.pages} pág.${h.dpi ? ', ' + h.dpi + ' dpi' : ''})`, 'travamento');
    if (h.kind === 'pdf') { const c = (this.cfg.pdfCrash = this.cfg.pdfCrash || {}); c[h.id] = (c[h.id] || 0) + 1; Store.saveSettings(); }
    setTimeout(() => toast(h.kind === 'pdf' && this.cfg.pdfCrash[h.id] >= 2 ? `O PDF automático de "${h.title}" foi desligado: a nota é grande demais para gerar no tablet. Use Exportar PDF quando precisar.` : 'O app fechou durante o backup; vou tentar de um jeito mais leve.', 6000), 1500);
  },
  pdfDpi(id) { const c = (this.cfg.pdfCrash || {})[id] || 0; return c >= 2 ? 0 : c === 1 ? 120 : +this.cfg.pdfDpi || 200; },
  later(ms = 10000) { clearTimeout(this._waitT); this._waitT = setTimeout(() => this.sync(), ms); },
  /* um backup por vez entre o app e o segundo plano (service worker): trava compartilhada */
  /* v0.57: PDF exportado (qualidade escolhida) vai para a pasta da nota no Drive no lugar do PDF do backup (mesma chave 'p:<id>').
     Tira o PDF pendente do backup dessa nota para ele não sobrescrever logo em seguida; na próxima edição o backup gera de novo
     com a qualidade das Configurações (escolha do usuário). Arquivo > 5 MB → envio em partes (uploadResumable cria um novo e o antigo vai para a lixeira). */
  async uploadExportPdf(note, blob) {
    if (!this.configured() || !this.hasAuth()) throw new Error('Drive não conectado');
    const job = async () => {
      const key = 'p:' + note.id, parent = await this.ensureNoteDir(note), name = safeName(note.title) + '.pdf', props = { traco: 'pdf', noteId: note.id };
      if (blob.size <= 5 * 1024 * 1024) await this.upsert(key, { name, mime: 'application/pdf', data: blob, parent, props });
      else {
        const old = this.entry(key); await this.uploadResumable(key, name, blob, parent, props);
        if (old) try { await this.api('PATCH', `https://www.googleapis.com/drive/v3/files/${old.id}`, { body: JSON.stringify({ trashed: true }), headers: { 'Content-Type': 'application/json' } }); } catch (_) {}
      }
      if (Store.dirty && Store.dirty.pdfs && Store.dirty.pdfs[note.id]) { delete Store.dirty.pdfs[note.id]; await Store.saveDirty(); }
    };
    return navigator.locks ? navigator.locks.request('traco-drive', job) : job();
  },
  async sync(manual = false, opts = {}) {
    if (!navigator.locks) return this._sync(manual, opts);
    return navigator.locks.request('traco-drive', { ifAvailable: true }, async (lock) => {
      if (!lock) { if (!opts.sw) this.later(20000); return; } // o segundo plano está enviando agora: tenta depois
      if (!opts.sw) await Store.reloadSyncState(); // pega o que o segundo plano já enviou (evita enviar de novo / duplicar)
      return this._sync(manual, opts);
    });
  },
  /* pede ao Android para terminar o backup mesmo com o app fechado (Background Sync) */
  async requestBgSync() {
    try {
      if (!('serviceWorker' in navigator) || !this.configured()) return;
      const reg = await navigator.serviceWorker.ready;
      if (reg.sync) await reg.sync.register('traco-backup');
      if (reg.periodicSync && !this._periodic) { this._periodic = true; const st = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => null); if (st && st.state === 'granted') await reg.periodicSync.register('traco-backup', { minInterval: 6 * 3600e3 }); }
    } catch (e) { console.warn('bg sync', e); }
  },
  async _sync(manual = false, { background = false, noPdf = false, sw = false } = {}) {
    if (!this.configured()) { this.refreshStatus(); return; }
    if (!navigator.onLine) { this.setStatus('pending', 'sem internet'); return; }
    if (this.running) { this.again = true; return; }
    if (!manual && !background && this.userBusy()) { this.setStatus('pending', 'esperando você parar de escrever'); this.later(); return; }
    this.running = true; this.pg = null; this.setStatus('busy');
    try {
      await this.migrateLayout();
      const d = Store.dirty; d.pdfs = d.pdfs || {}; d.folders = d.folders || {};
      // progresso: conta tudo o que vai subir e avança a cada item
      const pg = this.pg = { done: 0, total: Object.keys(d.folders).length + Object.keys(d.blobs).filter((id) => !this.entry('b:' + id)).length + Object.keys(d.notes).length + (this.cfg.pdf === false ? 0 : Object.keys(d.pdfs).length) + Object.keys(d.deleted).length + (d.lib ? 1 : 0), label: '' };
      const at = (label) => { pg.label = label; pg.sub = null; this.setStatus('busy'); }, done = () => { pg.done = Math.min(pg.total, pg.done + 1); pg.sub = null; this.setStatus('busy'); };
      const subP = (i, t) => { const v = Math.round((i / t) * 100); if (v !== pg.sub) { pg.sub = v; this.setStatus('busy'); } }; // % dentro da nota atual
      this.setStatus('busy');
      const data = await this.ensureDataFolder();
      for (const id of Object.keys(d.folders)) { at('Pasta'); if (Store.folders.find((f) => f.id === id)) await this.ensureNoteFolder(id); delete d.folders[id]; await Store.saveDirty(); done(); }
      for (const key of Object.keys(Store.driveMap)) if (key.startsWith('f:') && !Store.folders.find((f) => f.id === key.slice(2))) { /* pasta apagada no app: as notas já foram movidas */ await this.trash(key); }
      for (const id of Object.keys(d.blobs)) {
        if (!this.entry('b:' + id)) { at('Imagem/PDF anexado'); const blob = await Store.getBlob(id); if (blob) await this.uploadResumable('b:' + id, 'arquivo-' + id + (blob.type === 'application/pdf' ? '.pdf' : '.img'), blob, data, { traco: 'blob', blobId: id }); }
        const wasNew = pg.label === 'Imagem/PDF anexado'; delete d.blobs[id]; await Store.saveDirty(); if (wasNew) { pg.label = ''; done(); }
      }
      for (const id of Object.keys(d.notes)) {
        if (!manual && !background && this.userBusy()) { this.again = false; this.later(); throw Object.assign(new Error('adiado'), { deferred: true }); } // voltou a escrever: continua depois
        const note = typeof Editor !== 'undefined' && Editor.note && Editor.note.id === id ? Editor.note : await Store.getNote(id); at('Nota “' + (note ? note.title : '') + '”'); // nota aberta: usa a da tela (já é a mais nova; ler do banco de novo pesa)
        if (note) { this.heavyStart({ kind: 'note', id, title: note.title, pages: note.pages.length }); const nb = await noteFileBlob(note, subP); this.heavyEnd(); await this.upsert('n:' + id, { name: safeName(note.title) + '.traco', mime: nb.mime, data: nb.blob, parent: await this.ensureNoteDir(note), props: { traco: 'nota', noteId: id } }); }
        delete d.notes[id]; await Store.saveDirty(); done();
      }
      let pdfWait = false;
      for (const id of Object.keys(d.pdfs)) {
        if (this.cfg.pdf === false) { delete d.pdfs[id]; continue; }
        if (noPdf) { pdfWait = !sw; continue; } // segundo plano: PDF fica para quando o app estiver aberto
        if (!manual && !this.pdfAllowed()) { pdfWait = true; continue; } // com nota aberta e em uso: PDF fica para depois (pesa muito)
        const note = typeof Editor !== 'undefined' && Editor.note && Editor.note.id === id ? Editor.note : await Store.getNote(id);
        const dpi = this.pdfDpi(id);
        if (note && dpi) { at('PDF “' + note.title + '”'); let pdf;
          this.heavyStart({ kind: 'pdf', id, title: note.title, pages: note.pages.length, dpi });
          try { pdf = await exportNotePdf(note, subP, { dpi, shouldStop: () => !manual && !this.pdfAllowed() && this.userBusy() }); }
          catch (er) { this.heavyEnd(); if (er.deferred) { pdfWait = true; continue; } throw er; }
          this.heavyEnd(); await this.upsert('p:' + id, { name: safeName(note.title) + '.pdf', mime: 'application/pdf', data: pdf, parent: await this.ensureNoteDir(note), props: { traco: 'pdf', noteId: id } }); }
        delete d.pdfs[id]; await Store.saveDirty(); done();
      }
      for (const id of Object.keys(d.deleted)) { at('Removendo nota apagada'); await this.trash('n:' + id); await this.trash('p:' + id); await this.trash('d:' + id); delete d.deleted[id]; await Store.saveDirty(); done(); }
      if (d.lib && !(Store.folders.length || Object.keys(Store.heads).length)) { d.lib = false; await Store.saveDirty(); } /* v1.0.3: app recém-instalado (vazio) não manda uma lista vazia por cima da do backup */
      if (d.lib) {
        at('Lista de pastas e notas'); const heads = {}; for (const [k, v] of Object.entries(Store.heads)) heads[k] = { ...v, thumb: undefined, texts: undefined };
        await this.upsert('lib', { name: 'biblioteca.json', mime: 'application/json', data: JSON.stringify({ v: 1, folders: Store.folders, heads, groups: Store.settings.presetGroups, saved: Date.now() }), parent: data, props: { traco: 'lib' } });
        d.lib = false; await Store.saveDirty(); done();
      }
      try { /* v1.0.4: histórico de estudo também no backup (estudo.json na pasta de dados), só quando mudou */
        const L = await DB.get('meta', 'studyLog');
        if (L && (L.sessions || L.days)) { const js = JSON.stringify(L); let h = 0; for (let i = 0; i < js.length; i++) h = (h * 31 + js.charCodeAt(i)) | 0; const sig = js.length + ':' + h;
          if (sig !== this.cfg.studySig) { at('Histórico de estudo'); await this.upsert('study', { name: 'estudo.json', mime: 'application/json', data: JSON.stringify({ v: 1, log: L, saved: Date.now() }), parent: data, props: { traco: 'study' } }); this.cfg.studySig = sig; } }
      } catch (e) { console.warn('backup do estudo', e); }
      this.cfg.lastSync = Date.now(); if (sw) this.cfg.lastBgSync = this.cfg.lastSync; Store.saveSettings(); this.pg = null;
      this.refreshStatus(); if (manual) toast(pg.total ? `Backup no Drive concluído (${pg.total} ${pg.total === 1 ? 'item' : 'itens'})` : 'Backup no Drive concluído');
      if (pdfWait) { clearTimeout(this._pdfT); this._pdfT = setTimeout(() => this.sync(), 60000); }
    } catch (e) {
      if (e.deferred) { this.setStatus('pending', 'esperando você parar de escrever'); return; }
      console.error(e); logError(e, 'backup Drive');
      if (e.needAuth) this.setStatus('need'); else this.setStatus('err', e.message);
      if (manual && !e.needAuth) toast('Erro no backup: ' + e.message, 5000);
    } finally {
      this.running = false; this.pg = null;
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
  /* ===== v1.3.0: "Arrumar o Drive" — junta pastas repetidas (nomes iguais no mesmo lugar) e manda cópias antigas para a lixeira.
     K = tudo que o app usa (ids em Store.driveMap + a raiz): nunca vai para a lixeira; ao mover um item de K, o `parent` do mapa é
     atualizado (senão o próximo backup tentaria tirar o arquivo da pasta antiga). Notas diferentes com o mesmo título (arquivos de K
     com o mesmo nome) não são juntadas. tidyPlan só lê e simula; tidyRun executa o plano. */
  async tidyList(id) {
    const out = []; let pageToken = '';
    do {
      const r = await this.api('GET', `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${id}' in parents and trashed=false`)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&pageSize=1000${pageToken ? '&pageToken=' + pageToken : ''}`);
      out.push(...r.files); pageToken = r.nextPageToken || '';
    } while (pageToken);
    return out;
  },
  async tidyPlan(onProg) {
    const root = await this.ensureFolder(), K = new Map();
    for (const [k, v] of Object.entries(Store.driveMap)) { const e = typeof v === 'string' ? { id: v } : v; if (e && e.id) K.set(e.id, k); }
    K.set(root, 'root');
    const rootN = { id: root, name: this.FOLDER, folder: true, parent: null, kids: [], mod: 0 }, queue = [rootN]; let seen = 0;
    while (queue.length) {
      const F = queue.shift();
      for (const f of await this.tidyList(F.id)) { const n = { id: f.id, name: f.name, folder: f.mimeType === 'application/vnd.google-apps.folder', parent: F, kids: [], mod: Date.parse(f.modifiedTime) || 0 }; F.kids.push(n); if (n.folder) queue.push(n); }
      onProg && onProg(++seen);
    }
    const ops = [], kept = [], isK = (n) => K.has(n.id);
    const path = (n) => { const a = []; for (let x = n; x && x !== rootN; x = x.parent) a.unshift(x.name); return a.join(' › '); };
    const detach = (n) => { const i = n.parent.kids.indexOf(n); if (i >= 0) n.parent.kids.splice(i, 1); };
    const move = (n, to) => { ops.push({ op: 'move', id: n.id, name: n.name, folder: n.folder, from: n.parent.id, to: to.id, path: path(n), dest: path(to) || this.FOLDER, key: K.get(n.id) }); detach(n); n.parent = to; to.kids.push(n); };
    const trash = (n, why) => { ops.push({ op: 'trash', id: n.id, name: n.name, folder: n.folder, path: path(n), why }); detach(n); };
    const kk = (A, B) => B.kids.some((b) => !b.folder && isK(b) && A.kids.some((x) => !x.folder && isK(x) && x.name === b.name));
    const tidy = (F) => {
      const groups = new Map();
      for (const n of F.kids) { const g = (n.folder ? 'd|' : 'f|') + n.name; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(n); }
      for (const g of groups.values()) {
        if (g.length < 2) continue;
        const ks = g.filter(isK), newest = g.slice().sort((a, b) => b.mod - a.mod)[0];
        if (g[0].folder) {
          const target = ks[0] || newest;
          for (const b of g) {
            if (b === target || isK(b)) continue; /* duas pastas em uso (ex.: notas diferentes com o mesmo título): ficam */
            if (kk(target, b)) { kept.push(path(b)); continue; }
            for (const c of b.kids.slice()) move(c, target);
            trash(b, 'pasta repetida — o que tinha dentro foi para a outra "' + b.name + '"');
          }
        } else {
          const keep = ks.length ? null : newest;
          for (const b of g) if (!isK(b) && b !== keep) trash(b, ks.length ? 'cópia antiga (o app usa a outra)' : 'cópia mais antiga');
        }
      }
      for (const n of F.kids.slice()) if (n.folder) tidy(n);
    };
    tidy(rootN);
    return { ops, kept, scanned: seen };
  },
  async tidyRun(plan, onProg) {
    const job = (async () => {
      let i = 0;
      for (const o of plan.ops) {
        if (o.op === 'move') {
          await this.api('PATCH', `https://www.googleapis.com/drive/v3/files/${o.id}?addParents=${o.to}&removeParents=${o.from}&fields=id`, { body: '{}', headers: { 'Content-Type': 'application/json' } });
          if (o.key && Store.driveMap[o.key] && typeof Store.driveMap[o.key] === 'object') { Store.driveMap[o.key].parent = o.to; delete Store.driveMap[o.key].checked; }
        } else await this.api('PATCH', `https://www.googleapis.com/drive/v3/files/${o.id}?fields=id`, { body: JSON.stringify({ trashed: true }), headers: { 'Content-Type': 'application/json' } });
        onProg && onProg(++i, plan.ops.length);
      }
      await Store.saveDriveMap();
      return i;
    });
    return navigator.locks ? navigator.locks.request('traco-drive', job) : job(); /* não roda junto com o backup */
  },
  async restore(onProgress) {
    const root = await this.ensureFolder();
    const prop = (v) => `appProperties has { key='traco' and value='${v}' }`;
    /* v1.0.3: além das marcas (appProperties — podem ser invisíveis para outro cliente do mesmo projeto, ex.: o app nativo), procura também pelo NOME dos arquivos */
    const uniq = (...ls) => { const m = new Map(); for (const l of ls) for (const f of l) m.set(f.id, f); return [...m.values()]; };
    const [libsP, blobsP, notesP, legacy, libsN, blobsN, notesN] = await Promise.all([this.query(prop('lib')), this.query(prop('blob')), this.query(prop('nota')), this.query(`'${root}' in parents and name contains 'nota-'`),
      this.query(`name = 'biblioteca.json'`), this.query(`name contains 'arquivo-'`), this.query(`mimeType = 'application/gzip' or mimeType = 'application/json'`)]);
    const blobs = uniq(blobsP, blobsN.filter((f) => /^arquivo-.+\.(pdf|img)$/.test(f.name))), notes = uniq(notesP, notesN.filter((f) => /\.traco$/.test(f.name)));
    let lib = null, best = -1, n = 0, done = 0, fail = 0;
    for (const f of uniq(libsP, libsN)) { try { const j = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`); const sc = (j.folders || []).length + Object.keys(j.heads || {}).length; if (sc > best) { best = sc; lib = { j }; } } catch (e) { console.warn('biblioteca', e); } } /* a lista mais completa */
    if (lib) {
      const j = lib.j;
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
      let remote; try { remote = await readNoteFile(await this.api('GET', `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { raw: true })); } catch (e) { console.warn('restaurar nota', f.name, e); fail++; onProgress && onProgress(++done, total); continue; }
      const id = remote && remote.id; if (!id) { onProgress && onProgress(++done, total); continue; }
      if (!this.entry('n:' + id)) Store.driveMap['n:' + id] = { id: f.id, parent: (f.parents || [])[0] };
      const local = Store.heads[id];
      if (!local || (remote.updated || 0) > (local.updated || 0)) { await Store.putNote(remote, { sync: false }); n++; const t = await makeThumb(remote); if (t) await Store.setThumb(id, t); }
      onProgress && onProgress(++done, total);
    }
    await Store.saveDriveMap();
    let study = 0; /* v1.0.4: histórico de estudo — junta as sessões (pelo id) com as daqui */
    try {
      for (const f of uniq(await this.query(prop('study')), await this.query(`name = 'estudo.json'`))) {
        const R = (await this.api('GET', `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).log; if (!R) continue;
        const T = typeof StudyTimer !== 'undefined' ? StudyTimer : null, L = (T && T.log) || (await DB.get('meta', 'studyLog')) || {};
        if (R.sessions) { const have = new Set((L.sessions || []).map((x) => x.id)); const add = R.sessions.filter((x) => !have.has(x.id)); study += add.length; L.sessions = (L.sessions || []).concat(add).sort((a, b) => a.s - b.s); if (!L.v) L.v = 2; }
        for (const k of ['days', 'away']) if (R[k]) { L[k] = L[k] || {}; for (const [d, v] of Object.entries(R[k])) { if (v && typeof v === 'object') { const o = L[k][d] || (L[k][d] = {}); for (const [kk, ms] of Object.entries(v)) o[kk] = Math.max(o[kk] || 0, ms); } else L[k][d] = Math.max(L[k][d] || 0, v || 0); } }
        if (R.titles) L.titles = { ...R.titles, ...(L.titles || {}) };
        if (T) T.log = L; await DB.put('meta', L, 'studyLog');
      }
    } catch (e) { console.warn('restaurar estudo', e); }
    this.lastRestore = { notes: noteFiles.length, blobs: blobs.length, fail, lib: best, study }; /* v1.0.3: resumo para a mensagem */
    return n;
  },
};
if (typeof importScripts !== 'function') { // só no app (no service worker este arquivo é usado sem tela)
  window.addEventListener('online', () => Drive.schedule());
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      if (!Drive.configured()) return;
      Drive.requestBgSync(); // se o app for pausado no meio, o Android termina o envio depois
      if (Drive.hasAuth()) { Drive.schedule.cancel(); Drive.sync(false, { background: true }); } // saindo do app: salva as notas (PDF continua esperando)
    } else { const before = Drive.cfg.lastBgSync; await Store.reloadSyncState(); Drive.refreshStatus(); if (Drive.cfg.lastBgSync && Drive.cfg.lastBgSync !== before) toast('Backup concluído em segundo plano ✓', 2200); }
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', async (e) => { if (e.data && e.data.type === 'traco-synced') { await Store.reloadSyncState(); Drive.refreshStatus(); } });
  setInterval(() => { if (Drive.configured() && Drive.state !== 'busy' && Drive.state !== 'ok' && Drive.hasAuth()) Drive.sync(); }, 120000);
}

/* arquivo .traco da nota: JSON montado página por página (sem um texto gigante na memória) e compactado (gzip, ~4× menor) */
async function noteFileBlob(note, onProgress) {
  const { pages, ...rest } = note, head = JSON.stringify({ ...rest, pages: [] }), k = head.lastIndexOf('"pages":[]');
  const chunks = (function* () { yield head.slice(0, k) + '"pages":['; for (let i = 0; i < pages.length; i++) { onProgress && onProgress(i + 1, pages.length); yield (i ? ',' : '') + JSON.stringify(pages[i], ptsJSON); } yield ']' + head.slice(k + 10); })();
  const pause = () => new Promise((r) => setTimeout(r, 0)); // entre uma página e outra: a tela não trava
  if (typeof CompressionStream === 'undefined') { const parts = []; for (const c of chunks) { parts.push(c); await pause(); } return { blob: new Blob(parts, { type: 'application/json' }), mime: 'application/json' }; }
  const cs = new CompressionStream('gzip'), out = new Response(cs.readable).blob(), w = cs.writable.getWriter(), enc = new TextEncoder();
  for (const c of chunks) for (let o = 0; o < c.length; o += 262144) { await w.write(enc.encode(c.slice(o, o + 262144))); await pause(); } // pedaços pequenos: compactar não segura a tela
  await w.close();
  return { blob: await out, mime: 'application/gzip' };
}
async function readNoteFile(res) { // aceita o formato antigo (JSON puro) e o novo (compactado)
  const buf = new Uint8Array(await res.arrayBuffer());
  const text = buf[0] === 0x1f && buf[1] === 0x8b ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(buf);
  return JSON.parse(text);
}
