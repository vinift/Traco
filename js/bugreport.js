'use strict';
/* ===== v0.54 — Relatório de problema visual =====
   BugRec grava continuamente (leve) os últimos ~40 s do editor: gestos (pinça/rolagem) com os quadros lentos, mudanças de classe do #editor
   (escrevendo, tela cheia), barras visíveis/escondidas, memória de desenho (telas canvas) a cada segundo, tarefas longas, tamanho da janela
   e erros. Ao relatar (⋯ da nota → "Relatar problema visual" ou toque com 4 dedos) congela os últimos 30 s + o estado atual, pede uma frase
   e guarda em meta 'bugReports' (até 20). Lista em Configurações → Avançado → Diagnóstico com Compartilhar (.json) / Copiar / Excluir. */
const BugRec = {
  ev: [], KEEP: 40000, MAX: 900, _fr: null, _t0: performance.now(),
  BARS: [['topL', '.ch-topleft'], ['topR', '.ch-topright'], ['title', '.ch-title'], ['rail', '#rail'], ['sub', '#subrail'], ['hbar', '#hbar'], ['exit', '#btnFullExit']],
  push(k, d) {
    const t = Date.now(); this.ev.push(Object.assign({ t, k }, d || {}));
    if (this.ev.length > this.MAX || (this.ev.length && t - this.ev[0].t > this.KEEP)) { const lim = t - this.KEEP; let i = 0; while (i < this.ev.length - 1 && (this.ev[i].t < lim || this.ev.length - i > this.MAX)) i++; this.ev.splice(0, i); }
  },
  edOpen() { return typeof Editor !== 'undefined' && !!Editor.note; },
  canvasMB() {
    const r = {}; let tot = 0;
    for (const c of document.querySelectorAll('canvas')) { if (!c.isConnected || c.width * c.height <= 1) continue; const mb = (c.width * c.height * 4) / 1048576, k = c.id || (c.className || 'canvas').split(' ')[0]; r[k] = (r[k] || 0) + mb; tot += mb; }
    for (const k in r) r[k] = Math.round(r[k] * 10) / 10; return { tot: Math.round(tot * 10) / 10, by: r };
  },
  /* barras: 1 = visível, 0 = escondida (opacidade ~0, display none, visibility hidden ou fora da tela) */
  bars() {
    let s = '';
    for (const [k, sel] of this.BARS) {
      const e = document.querySelector(sel); if (!e) { s += k + ':-,'; continue; }
      const cs = getComputedStyle(e), r = e.getBoundingClientRect(), vis = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 0 && r.bottom > 0 && r.top < innerHeight;
      s += k + ':' + (vis ? 1 : 0) + ',';
    }
    return s.slice(0, -1);
  },
  sample() {
    if (document.hidden || !this.edOpen()) return;
    const m = this.canvasMB(), ed = document.getElementById('editor');
    this.push('s', { mb: m.tot, tiles: Editor.tiles ? Editor.tiles.size : null, z: Math.round(Editor.cam.z * 1000) / 1000, bars: this.bars(), cls: ed ? ed.className : '', heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null });
  },
  /* amostra com barra escondida SEM motivo (fora de "escrevendo"/tela cheia; o botão de sair da tela cheia não conta) */
  oddHidden(x) { return !/\b(writing|immersive)\b/.test(x.cls || '') && /:0/.test((x.bars || '').replace(/exit:\S+/, '')); },
  /* quadros durante o gesto (e 1,2 s depois, para pegar a inércia): intervalo máximo e quantos passaram de 50 ms */
  frames(on) {
    if (on) { this._frEnd = 0; if (this._fr) return; const f = this._fr = { n: 0, slow: 0, max: 0, last: performance.now(), t0: performance.now() };
      const loop = (now) => { if (this._fr !== f) return; const d = now - f.last; f.last = now; f.n++; if (d > 50) f.slow++; if (d > f.max) f.max = d; if (this._frEnd && now > this._frEnd) { this.push('fr', { ms: Math.round(now - f.t0), n: f.n, slow: f.slow, max: Math.round(f.max), bars: this.bars() }); this._fr = null; return; } requestAnimationFrame(loop); };
      requestAnimationFrame(loop); }
    else if (this._fr) this._frEnd = performance.now() + 1200;
  },
  init() {
    if (this._init || typeof Editor === 'undefined') return; this._init = true;
    const E = Editor, s0 = E.startGesture, e0 = E.endGesture;
    E.startGesture = function (...a) { const r = s0.apply(this, a); try { BugRec.push('g+', { n: this.gesture ? this.gesture.n : null, z: Math.round(this.cam.z * 1000) / 1000 }); BugRec.frames(true); } catch (_) {} return r; };
    E.endGesture = function (...a) { const g = this.gesture; const r = e0.apply(this, a); try { BugRec.push('g-', { max: g ? g.max : null, moved: g ? !!g.moved : null, z: Math.round(this.cam.z * 1000) / 1000, bars: BugRec.bars() }); BugRec.frames(false); } catch (_) {} return r; };
    const ed = document.getElementById('editor');
    if (ed) { let last = ed.className; new MutationObserver(() => { const c = ed.className; if (c === last) return; const a = new Set(last.split(' ')), b = new Set(c.split(' ')); last = c; BugRec.push('cls', { add: [...b].filter((x) => x && !a.has(x)).join(' '), rem: [...a].filter((x) => x && !b.has(x)).join(' ') }); }).observe(ed, { attributes: true, attributeFilter: ['class'] }); }
    try { new PerformanceObserver((l) => { for (const x of l.getEntries()) if (x.duration >= 80) this.push('long', { ms: Math.round(x.duration) }); }).observe({ type: 'longtask', buffered: false }); } catch (_) {}
    addEventListener('resize', () => this.push('rs', { w: innerWidth, h: innerHeight, vv: window.visualViewport ? [Math.round(visualViewport.width), Math.round(visualViewport.height)] : null }));
    document.addEventListener('visibilitychange', () => this.push('vis', { hidden: document.hidden }));
    addEventListener('error', (e) => this.push('err', { msg: String(e.message || e).slice(0, 200) }));
    addEventListener('unhandledrejection', (e) => this.push('err', { msg: String((e.reason && e.reason.message) || e.reason).slice(0, 200) }));
    setInterval(() => this.sample(), 1000);
  },
  state() {
    const S = Store.settings, E = typeof Editor !== 'undefined' ? Editor : null, n = E && E.note, m = this.canvasMB(), mm = (q) => { try { return matchMedia(q).matches; } catch (_) { return null; } };
    return {
      versao: App.version, quando: new Date().toISOString(), ua: navigator.userAgent, memAparelho: navigator.deviceMemory || null,
      tela: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, vv: window.visualViewport ? [Math.round(visualViewport.width), Math.round(visualViewport.height)] : null, modo: mm('(display-mode: fullscreen)') ? 'fullscreen' : mm('(display-mode: standalone)') ? 'standalone' : 'browser', safe: ['--sat', '--sar', '--sab', '--sal'].map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()) },
      nota: n ? { paginas: n.pages.length, pagina: E.currentPageIndex ? E.currentPageIndex() + 1 : null, modo: n.mode || 'pages', elementos: n.pages.reduce((a, p) => a + ((p.elements && p.elements.length) || 0), 0), pdf: n.pages.some((p) => !!p.pdf) } : null,
      editor: E && n ? { z: E.cam.z, cam: [Math.round(E.cam.x), Math.round(E.cam.y)], ferramenta: E.tool, classes: document.getElementById('editor').className, blocos: E.tiles ? E.tiles.size : null, dividida: !!(S.split && S.split.id) } : null,
      memoria: m, nos: document.getElementsByTagName('*').length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, barras: this.bars(),
      config: { zoomQuality: S.zoomQuality || 'eco', barSize: S.barSize, barScale: S.barScale, hideWhileWriting: S.hideWhileWriting !== false, writeHideSec: S.writeHideSec, lowLatency: !!S.lowLatency, palmGuard: S.palmGuard, theme: S.theme },
      erros: typeof readErrors === 'function' ? readErrors().slice(-10) : [],
      marcaTexto: typeof PdfText !== 'undefined' && PdfText._last ? PdfText._last : undefined, /* v1.18.1: última marcação grudada na escrita (palavras + traços em volta) */
      tinta: typeof Native !== 'undefined' && Native.on ? Native.inkReport() : undefined, /* v1.2.3: últimos traços da tinta nativa × da página */
    };
  },
  /* dispara: congela os últimos 30 s e o estado, depois pergunta o que aconteceu */
  async capture(src) {
    this.sample(); const now = Date.now(), ev = this.ev.filter((x) => x.t >= now - 30000).map((x) => Object.assign({}, x, { t: x.t - now }));
    const rep = { id: uid(), at: now, src, desc: '', estado: this.state(), eventos: ev };
    const g = ev.filter((x) => x.k === 'fr'), slow = g.reduce((a, x) => a + x.slow, 0), hid = ev.filter((x) => x.k === 's' && this.oddHidden(x)).length;
    const ta = el('textarea', { class: 'br-desc', rows: 3, placeholder: 'O que você viu? (ex.: a barra da direita sumiu ao dar zoom)' });
    const ok = await openModal({ title: 'Relatar problema visual', body: el('div', { class: 'br-new' },
      el('p', {}, `Gravado: últimos 30 s (${ev.length} registros, ${g.length} gesto${g.length === 1 ? '' : 's'}, ${slow} quadro${slow === 1 ? '' : 's'} lento${slow === 1 ? '' : 's'}${hid ? `, barra escondida em ${hid} amostra${hid === 1 ? '' : 's'}` : ''}) + estado atual.`),
      ta, el('small', {}, 'Fica em Configurações → Avançado → Diagnóstico, para compartilhar ou copiar.')),
      buttons: [{ label: 'Descartar', value: false }, { label: 'Salvar', cls: 'primary', value: true }] });
    if (!ok) return;
    rep.desc = ta.value.trim();
    const list = (await DB.get('meta', 'bugReports')) || []; list.unshift(rep); await DB.put('meta', list.slice(0, 20), 'bugReports');
    toast('Relatório salvo · Configurações → Avançado → Diagnóstico', 2600);
  },
  fname(r) { const d = new Date(r.at), f = (x) => String(x).padStart(2, '0'); return `traco-bug-${d.getFullYear()}-${f(d.getMonth() + 1)}-${f(d.getDate())}-${f(d.getHours())}${f(d.getMinutes())}.json`; },
  async share(r) {
    const txt = JSON.stringify(r, null, 1), file = new File([txt], this.fname(r), { type: 'application/json' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Traço — problema visual' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    downloadBlob(file, file.name);
  },
  async copy(r) { const txt = JSON.stringify(r); try { await navigator.clipboard.writeText(txt); toast('Relatório copiado — cole na conversa', 2000); } catch (_) { openModal({ title: 'Relatório', wide: true, body: el('textarea', { style: { width: '100%', height: '300px' } }, txt), buttons: [{ label: 'Fechar', cls: 'primary' }] }); } },
  /* lista para as Configurações */
  listEl() {
    const box = el('div', { class: 'br-list' });
    const render = async () => {
      const list = (await DB.get('meta', 'bugReports')) || []; box.innerHTML = '';
      box.append(el('h4', { class: 'set-sub' }, 'Relatórios de problema visual'));
      if (!list.length) { box.append(el('p', {}, 'Nenhum ainda. Na nota: ⋯ → "Relatar problema visual" ou toque com 4 dedos na hora em que notar algo.')); return; }
      for (const r of list) {
        const ev = r.eventos || [], slow = ev.filter((x) => x.k === 'fr').reduce((a, x) => a + x.slow, 0);
        box.append(el('div', { class: 'br-row' },
          el('div', { class: 'br-info' }, el('b', {}, new Date(r.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ' · v' + (r.estado && r.estado.versao)), el('span', {}, r.desc || '(sem descrição)'), el('small', {}, `${ev.length} registros · ${slow} quadros lentos · ${r.estado && r.estado.memoria ? r.estado.memoria.tot + ' MB de telas' : ''}`)),
          el('div', { class: 'br-btns' },
            el('button', { class: 'btn', onclick: () => this.share(r) }, 'Compartilhar'),
            el('button', { class: 'btn', onclick: () => this.copy(r) }, 'Copiar'),
            el('button', { class: 'btn ghost danger', onclick: async () => { const l = ((await DB.get('meta', 'bugReports')) || []).filter((x) => x.id !== r.id); await DB.put('meta', l, 'bugReports'); render(); } }, 'Excluir'))));
      }
    };
    render(); return box;
  },
};
BugRec.init();
