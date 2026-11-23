'use strict';
/* ===== v1.0: ponte com o app nativo "Traço Nativo" (pasta android/) =====
   No navegador / no app atual (TWA) não existe window.TracoNative: Native.on = false e nada aqui muda o comportamento.
   No app nativo (WebView + partes nativas) a parte web continua vindo do site; o Android cuida de:
   • tinta ao vivo de baixa latência (camada nativa por cima da página, só enquanto a caneta escreve — Native.inkGo/inkClear);
   • login do Drive pela conta do Android (Native.driveToken; o login do site é bloqueado pelo Google dentro de apps);
   • compartilhar/salvar arquivos (navigator.share e downloadBlob trocados aqui), manter a tela acesa (navigator.wakeLock);
   • notificações e alarme do cronômetro (Native.notify/alarm — o alarme toca mesmo com o app fechado);
   • "Abrir com"/"Compartilhar" de PDFs (Native.inbox). */
const Native = {
  on: !!window.TracoNative,
  info: {},
  _n: 0, _wait: new Map(), _late: [],
  init() {
    if (!this.on) return;
    try { this.info = JSON.parse(TracoNative.info()) || {}; } catch (_) { this.info = {}; }
    document.documentElement.classList.add('native');
    this.polyfill();
  },
  /* chamada com resposta: o Android responde com Native._cb(id, json) */
  ask(fn, ...args) { return new Promise((res) => { const id = ++this._n; this._wait.set(id, res); if (fn === 'driveAuth' && !args[0]) setTimeout(() => this._cb(id, { error: 'sem resposta do Android' }), 20000); /* renovação silenciosa não pode travar o backup */ try { TracoNative[fn](id, ...args); } catch (e) { this._wait.delete(id); res({ error: e.message }); } }); },
  _cb(id, s) { const w = this._wait.get(id); if (!w) return; this._wait.delete(id); let r; try { r = typeof s === 'string' ? JSON.parse(s) : s; } catch (_) { r = { error: String(s) }; } w(r || {}); },
  /* avisos do Android (notificação tocada, arquivo recebido…) — esperam o app terminar de abrir */
  _ev(type, data) {
    const ready = () => typeof Store !== 'undefined' && Store.settings && typeof StudyTimer !== 'undefined';
    if (!ready()) { setTimeout(() => this._ev(type, data), 400); return; }
    try {
      if (type === 'timer') StudyTimer.onSysAction(data);
      else if (type === 'inbox') this.inbox();
    } catch (e) { console.warn('nativo', type, e); }
  },

  /* ---- tinta nativa ---- */
  inkOk() { return this.on && !!this.info.ink && !!(Store.settings && Store.settings.nativeInk !== false); },
  /* começa a tinta do traço atual (o Android já guardou os pontos desde que a caneta encostou). Devolve o id ou 0 (= a web desenha). */
  inkGo(ed, a) {
    try {
      const z = ed.cam.z, r = ed.stage.getBoundingClientRect(); let cl = [r.left, r.top, r.right, r.bottom];
      if (!a.inf) { const o = ed.layout[a.pi], pg = ed.note.pages[a.pi]; const x1 = r.left + (o.x - ed.cam.x) * z, y1 = r.top + (o.y - ed.cam.y) * z; cl = [Math.max(cl[0], x1), Math.max(cl[1], y1), Math.min(cl[2], x1 + pg.w * z), Math.min(cl[3], y1 + pg.h * z)]; }
      const S = Store.settings;
      return TracoNative.inkGo(JSON.stringify({ color: a.color, w: a.width * z, pen: a.pen, sens: S.pressureSens ?? 0.6, stab: a.stab ?? 10, dpr: devicePixelRatio || 1, clip: cl })) | 0;
    } catch (e) { console.warn('tinta nativa', e); return 0; }
  },
  /* v1.2.3: diagnóstico — os últimos traços como a página gravou (px CSS da tela) para comparar com os que o Android desenhou */
  inkLog: [],
  inkNote(ed, a, el) {
    try {
      const z = ed.cam.z, r = ed.stage.getBoundingClientRect(), o = ed.layout[a.pi], P = el.pts, out = [];
      for (let i = 0; i < P.length; i += 3) out.push(Math.round((r.left + (o.x + P[i] - ed.cam.x) * z) * 10) / 10, Math.round((r.top + (o.y + P[i + 1] - ed.cam.y) * z) * 10) / 10);
      this.inkLog.push({ id: a.nat, z: Math.round(z * 1000) / 1000, stab: a.stab, pen: a.pen, w: Math.round(a.width * z * 100) / 100, pts: out }); if (this.inkLog.length > 5) this.inkLog.shift();
    } catch (e) { console.warn('tinta: diagnóstico', e); }
  },
  inkReport() {
    let nat = []; try { nat = JSON.parse(TracoNative.inkDebug ? TracoNative.inkDebug() : '[]') || []; } catch (_) { nat = 'sem dados (APK antigo?)'; }
    const cmp = [];
    if (Array.isArray(nat)) for (const w of this.inkLog) {
      const n = nat.find((x) => x.id === w.id); if (!n || !n.pts || n.pts.length < 2) { cmp.push({ id: w.id, nativo: 'não achado' }); continue; }
      const W = w.pts, N = n.pts, near = (x, y, A) => { let b = 1e9, bi = 0; for (let i = 0; i < A.length; i += 2) { const d = Math.hypot(A[i] - x, A[i + 1] - y); if (d < b) { b = d; bi = i; } } return [b, bi]; };
      let sum = 0, mx = 0, sdx = 0, sdy = 0, k = 0; for (let i = 0; i < W.length; i += 2) { const [d, j] = near(W[i], W[i + 1], N); sum += d; mx = Math.max(mx, d); sdx += W[i] - N[j]; sdy += W[i + 1] - N[j + 1]; k++; }
      const r1 = (v) => Math.round(v * 10) / 10;
      cmp.push({ id: w.id, pontosPagina: W.length / 2, pontosNativo: N.length / 2, mediaDist: r1(sum / k), maxDist: r1(mx), desvioMedio: [r1(sdx / k), r1(sdy / k)],
        inicio: [r1(W[0] - N[0]), r1(W[1] - N[1])], fim: [r1(W[W.length - 2] - N[N.length - 2]), r1(W[W.length - 1] - N[N.length - 1])] });
    }
    return { comparacao: cmp, pagina: this.inkLog, nativo: nat };
  },
  inkClear(ids) { if (!this.on) return; try { TracoNative.inkClear(Array.isArray(ids) ? ids.join(',') : String(ids)); } catch (_) {} },

  /* ---- arquivos para fora (compartilhar / salvar em Downloads) ---- */
  b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  async put(blob, name) {
    const id = TracoNative.fileBegin(name || 'arquivo', blob.type || 'application/octet-stream'), CH = 3 * 256 * 1024;
    for (let o = 0; o < blob.size; o += CH) TracoNative.fileChunk(id, this.b64(new Uint8Array(await blob.slice(o, o + CH).arrayBuffer())));
    return id;
  },
  async share(files, title) { const ids = []; for (const f of files) ids.push(await this.put(f, f.name)); const err = TracoNative.shareFiles(ids.join(','), title || ''); if (err) throw new Error(err); },
  async save(blob, name) { const id = await this.put(blob, name); const err = TracoNative.saveFile(id); if (err) { toast('Não deu para salvar: ' + err, 4000); return false; } toast('Salvo em Downloads: ' + name, 2600); return true; },
  polyfill() {
    const me = this;
    try {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => !!(d && ((d.files && d.files.length) || d.text || d.url)) });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (d = {}) => {
        if (d.files && d.files.length) return me.share(d.files, d.title);
        const err = TracoNative.shareText([d.text, d.url].filter(Boolean).join('\n'), d.title || ''); if (err) throw new Error(err);
      } });
    } catch (e) { console.warn('share', e); }
    try { downloadBlob = (blob, name) => { me.save(blob, name); }; } catch (e) { console.warn('downloadBlob', e); }
    try { /* manter a tela acesa (cronômetro) */
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
        TracoNative.keepScreen(true); const s = new EventTarget(); s.released = false;
        s.release = async () => { if (s.released) return; s.released = true; TracoNative.keepScreen(false); s.dispatchEvent(new Event('release')); };
        return s;
      } } });
    } catch (e) { console.warn('wakeLock', e); }
  },

  /* ---- notificações e alarme do cronômetro ---- */
  notifyOk() { try { return this.on && TracoNative.notifyOk(); } catch (_) { return false; } },
  notifyAsk() { try { TracoNative.notifyAsk(); } catch (_) {} },
  notify(tag, title, o = {}) { try { TracoNative.notify(tag, title, o.body || '', JSON.stringify({ silent: !!o.silent, sticky: !!o.requireInteraction, actions: (o.actions || []).map((x) => [x.action, x.title]) })); } catch (e) { console.warn('notificação', e); } },
  notifyClose(tag) { try { TracoNative.notifyCancel(tag); } catch (_) {} },
  /* alarme marcado no Android: toca na hora mesmo com o app fechado (at = 0 desmarca) */
  alarm(at, title, body) { try { if (at > Date.now()) TracoNative.alarmAt(at, title, body || ''); else TracoNative.alarmCancel(); } catch (_) {} },

  /* ---- Drive: chave de acesso pela conta do Android ---- */
  async driveToken(interactive) {
    const r = await this.ask('driveAuth', !!interactive);
    if (r && r.token) return r.token;
    const err = new Error(r && r.error === 'needAuth' ? 'Precisa conectar' : 'Login do Google: ' + ((r && r.error) || 'falhou')); if (r && r.error === 'needAuth') err.needAuth = true; throw err;
  },

  /* ---- PDFs recebidos pelo "Abrir com" / "Compartilhar" ---- */
  async inbox() {
    let list = []; try { list = JSON.parse(TracoNative.inbox()) || []; } catch (_) {}
    for (const f of list) {
      try {
        const res = await fetch(new URL('__native/inbox/' + encodeURIComponent(f.id), location.origin + location.pathname.replace(/[^/]*$/, '')));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const b = await res.blob(); TracoNative.inboxDone(f.id);
        if (typeof PdfOpen !== 'undefined') await PdfOpen.open(new File([b], f.name || 'documento.pdf', { type: f.mime || b.type || 'application/pdf' }));
      } catch (e) { console.warn('recebido', e); toast('Não consegui abrir o arquivo recebido: ' + e.message, 4000); try { TracoNative.inboxDone(f.id); } catch (_) {} }
    }
  },
  appUpdate() { try { TracoNative.openExternal('https://github.com/vinift/Traco/releases/latest/download/traco-nativo.apk'); } catch (_) {} },
};
window.Native = Native; /* v1.0.2: o Android chama window.Native._cb/_ev — const global não fica em window (sem isto a resposta do login nunca chegava) */
Native.init();
