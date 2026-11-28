'use strict';
/* ===== v1.46.0 — Desenho nativo da nota, etapa 1 (só no Traço Nativo com APK ≥ 1.46) =====
   Problema: no WebView, os blocos da nota (canvas de 512 px, ~1 MB cada, até ~100) ficam na memória de desenho do próprio navegador
   e disputam espaço com a interface — quando aperta, o navegador descarta o desenho de botões/barras/janelas ("tudo pisca menos a nota").
   Etapa 1: a página continua DESENHANDO os blocos (mesmo código, mesma qualidade), mas em telas fora da página (willReadFrequently =
   memória comum, não da GPU). Os pixels vão para o Android por um MessagePort (ArrayBuffer: [id, w, h, 0] em int32 + RGBA) e uma
   camada nativa (PageView, atrás do WebView transparente) mostra as molduras, as miniaturas e os blocos com a mesma câmera.
   A página só manda: posição de cada bloco (pgPlace), miniatura de cada página (pgPrev), molduras (pgFrames) e a cena de cada quadro
   (pgScene: translação, zoom, níveis visíveis). O resto (seleção, prévia do traço, cMain/cLive) continua no WebView, por cima.
   Desliga com S.nativePage = false (Configurações → "Desenho nativo da nota") → tudo volta ao DOM como antes. */
const NatPage = {
  port: null, nid: 1, _bulk: false, _scene: '', _frames: '', sent: 0, _fq: [],
  init() {
    if (typeof Native === 'undefined' || !Native.on || !(Native.info && Native.info.page)) return;
    addEventListener('message', (e) => {
      if (e.data !== 'traco-pg' || !e.ports || !e.ports[0]) return;
      const had = this.on(); this.port = e.ports[0]; this._scene = ''; this._frames = '';
      if (!had && this.on() && typeof Editor !== 'undefined' && Editor.note) { Editor.resetTiles(); Editor.requestRender(); } /* o canal chegou com a nota já aberta: refaz os blocos no modo nativo */
    });
  },
  /* modo nativo ligado (canal pronto + configuração) */
  on() { return !!this.port && !!(Store.settings && Store.settings.nativePage !== false); },
  call(fn, ...a) { try { return TracoNative[fn](...a); } catch (e) { console.warn('natpage', fn, e); } },
  ctxOpt() { return this.on() ? { willReadFrequently: true } : undefined; },
  /* pixels de uma tela (bloco ou miniatura) para o Android */
  send(cv) {
    const w = cv.width, h = cv.height; if (!w || !h || !this.port) return;
    const id = cv._nid || (cv._nid = this.nid++);
    let im; try { im = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h); } catch (e) { return; }
    try {
      if (Native.info && Native.info.page2) { this.port.postMessage(new Int32Array([id, w, h, 3]).buffer); this.port.postMessage(im.data.buffer); } /* v1.46.6: cabeçalho + pixels em 2 mensagens, sem a cópia de 1 MB (APK ≥ 1.0.22) */
      else { const buf = new ArrayBuffer(16 + w * h * 4), hd = new Int32Array(buf, 0, 4); hd[0] = id; hd[1] = w; hd[2] = h; hd[3] = 0; new Uint8Array(buf, 16).set(im.data); this.port.postMessage(buf); }
      this.sent++;
    } catch (e) { console.warn('natpage send', e); }
    cv._ns = true; cv._nd = false;
  },
  /* v1.46.6: durante rolagem/zoom/inércia os envios vão para uma fila (_sq) e saem com até ~6 ms por quadro (benchmark no tablet:
     envio p95 16–24 ms no meio do gesto). O id é dado na hora (o pgPlace precisa dele); a camada nativa mostra o bloco anterior/a
     reserva até o novo chegar. Os apagar (_fq) só saem depois da fila vazia, para o bloco velho não sumir antes do novo chegar. */
  _sq: [], _sqT: 0,
  busy() { return typeof Editor !== 'undefined' && !!(Editor.gesture || Editor._inertia); },
  sync(cv) {
    if (cv._ns && !cv._nd) return; if (!cv._nid) cv._nid = this.nid++;
    if (this.busy() || this._sq.length) { if (!cv._nq) { cv._nq = 1; this._sq.push(cv); } this.drainLater(); return; }
    this.send(cv);
  },
  drainLater() { if (!this._sqT) this._sqT = requestAnimationFrame(() => { this._sqT = 0; this.drain(); }); },
  drain() {
    const t0 = performance.now(), lim = this.busy() ? 6 : 30;
    while (this._sq.length && performance.now() - t0 < lim) { const cv = this._sq.shift(); cv._nq = 0; if (cv._nid && cv.width && (!cv._ns || cv._nd)) this.send(cv); }
    if (this._sq.length) this.drainLater(); else { this.flush(); if (typeof Editor !== 'undefined' && Editor.note && Editor._fbLvl != null) Editor.requestRender(); } /* v1.46.11: fila vazia → a página pode tirar a reserva */
  },
  /* apagar vai pelo MESMO canal dos pixels e só depois deles (fila _fq, enviada no fim do quadro): o bloco velho continua na tela
     até o novo chegar — pela ponte, o apagar chegava antes dos pixels e o pedaço piscava (só a miniatura por um instante) */
  free(cv) { if (cv && cv._nid) { if (!this._bulk) this._fq.push(cv._nid); cv._nid = 0; cv._ns = false; } },
  ctl(kind, ids) { if (!this.port) return; const a = new Int32Array(4 + ids.length); a[3] = kind; a.set(ids, 4); try { this.port.postMessage(a.buffer); } catch (e) { console.warn('natpage ctl', e); } },
  flush() { if (this._fq.length && !this._sq.length) { this.ctl(1, this._fq); this._fq = []; } },
  /* bloco: posição (px CSS dentro do nível L, como o placeTile do DOM) — só chama o Android se mudou */
  place(t, left, top) {
    this.sync(t.cv); const k = t.lvl + '|' + left + '|' + top;
    if (t._np !== k) { t._np = k; this.call('pgPlace', t.cv._nid, t.lvl, left, top); }
  },
  preview(pid, cv) { this.sync(cv); if (cv._npid !== pid) { cv._npid = pid; this.call('pgPrev', pid, cv._nid); } },
  frames(list) { const s = JSON.stringify(list); if (s !== this._frames) { this._frames = s; this.call('pgFrames', s); } },
  scene(o) { this.flush(); const s = JSON.stringify(o); if (s !== this._scene) { this._scene = s; this.call('pgScene', s); } },
  /* limpar: a cena/molduras/posições saem na hora (ponte); os bitmaps com id < nid saem pelo canal, na ordem dos pixels */
  clear() { this._scene = ''; this._frames = ''; this._fq = []; for (const cv of this._sq) cv._nq = 0; this._sq = []; if (this.port) { this.call('pgClear'); this.ctl(2, [this.nid]); } },
  /* v1.46.16: resolve quando os blocos já enviados estão na tela nativa — fila vazia + resposta do Android (pgFence, APK ≥ 1.0.26), que passa
     pela mesma fila dos pixels e espera 2 quadros da PageView; APK antigo: 150 ms. Limite de 600 ms depois da fila vazia. */
  fence() {
    return new Promise((res) => {
      const t0 = performance.now(), step = () => {
        if (this._sq.length && performance.now() - t0 < 1500) return requestAnimationFrame(step);
        let done = false; const fin = () => { if (!done) { done = true; res(); } }; setTimeout(fin, 600);
        if (typeof TracoNative !== 'undefined' && TracoNative.pgFence) Native.ask('pgFence').then(fin, fin); else setTimeout(fin, 150);
      };
      step();
    });
  },
  stat() { try { return JSON.parse(TracoNative.pgStat()); } catch (_) { return null; } },
};
NatPage.init();

/* fechar/soltar a nota: a camada nativa some junto (senão ficaria a página velha atrás da biblioteca ou do lado passivo) */
(function () {
  if (typeof Editor === 'undefined') return;
  for (const fn of ['close', 'detach']) { const f0 = Editor[fn]; if (typeof f0 !== 'function') continue; Editor[fn] = function (...a) { if (NatPage.on()) NatPage.clear(); return f0.apply(this, a); }; }
})();
