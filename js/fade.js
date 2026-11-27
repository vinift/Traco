'use strict';
/* ===== v0.38 — cores em degradê ("fading") =====
   Um degradê fica na lista de cores da caneta como uma bolinha comum ('fade:<id>' em UI.colorList('pen')); a definição mora em
   S.fades[id] = { c: [cores], m: 'len' | 'stroke', p: comprimento de cada troca (px da página, modo 'len'), s: traços por troca
   (modo 'stroke'), o: posição atual no degradê (modo 'len'), n: contador de traços (modo 'stroke') }.
   Selecionar: st.fade = id e st.color = st.fadeBase = 1ª cor (o resto do app continua vendo uma cor normal). Qualquer outra cor
   escolhida muda st.color e o degradê deixa de valer (Fades.active confere st.color === st.fadeBase).
   - 'len' (dentro do traço): o traço guarda e.fade = {c, p, o} e é desenhado em pedaços com a cor do comprimento acumulado
     (drawElement → Fades.draw); o próximo traço continua de onde o anterior parou (o += comprimento), então letras seguidas
     vão mudando de cor. Volta ao início no fim da lista (cíclico).
   - 'stroke' (uma cor por traço/letra): cada traço sai de uma cor sólida, andando 1/s do caminho entre duas cores. */
const Fades = {
  all() { const S = Store.settings; return S.fades || (S.fades = {}); },
  get(id) { return this.all()[id]; },
  isKey(c) { return typeof c === 'string' && c.startsWith('fade:'); },
  idOf(c) { return String(c).slice(5); },
  rgba(h) {
    h = String(h || '#000').replace('#', '');
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    const v = (i) => parseInt(h.slice(i, i + 2), 16) || 0; return [v(0), v(2), v(4), h.length >= 8 ? v(6) / 255 : 1];
  },
  /* cor no ponto t do ciclo (t = 0 → 1ª cor, 1 → 2ª, …; cíclico) */
  mix(c, t) {
    const n = c.length; if (n < 2) return c[0] || '#000000';
    const fl = Math.floor(t), f = t - fl; let i = fl % n; if (i < 0) i += n;
    const A = this.rgba(c[i]), B = this.rgba(c[(i + 1) % n]), hx = (x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0');
    const a = A[3] + (B[3] - A[3]) * f;
    return '#' + hx(A[0] + (B[0] - A[0]) * f) + hx(A[1] + (B[1] - A[1]) * f) + hx(A[2] + (B[2] - A[2]) * f) + (a < 0.995 ? hx(a * 255) : '');
  },
  css(f) { return f && f.c && f.c.length ? `linear-gradient(135deg, ${f.c.join(', ')})` : '#888'; },
  active(st) { const f = st && st.fade && this.get(st.fade); return f && st.color === st.fadeBase ? f : null; },
  select(st, id) { const f = this.get(id); if (!f) return; st.fade = id; st.color = st.fadeBase = f.c[0]; },
  /* startDraw: prepara a cor do traço */
  begin(a, st) {
    if (a.tool !== 'pen') return; const f = this.active(st); if (!f) return;
    if (f.m === 'stroke') { a.color = this.mix(f.c, (f.n || 0) / Math.max(1, f.s || 3)); f.n = ((f.n || 0) + 1) % (Math.max(1, f.s || 3) * f.c.length); Store.saveSettings(); return; }
    a.fade = { c: f.c.slice(), p: Math.max(10, f.p || 200), o: f.o || 0 }; a.fadeDef = f; a.color = this.mix(a.fade.c, a.fade.o / a.fade.p); a.inc = false;
  },
  len(P) { let l = 0; for (let i = 3; i < P.length; i += 3) l += Math.hypot(P[i] - P[i - 3], P[i + 1] - P[i - 2]); return l; },
  /* endDraw: grava o degradê no traço e avança a posição para o próximo traço */
  end(a, el) {
    if (!a.fade) return; el.fade = { c: a.fade.c, p: a.fade.p, o: Math.round(a.fade.o * 10) / 10 };
    const cyc = a.fade.p * a.fade.c.length; a.fadeDef.o = (a.fade.o + this.len(el.pts)) % cyc; Store.saveSettings();
  },
  /* desenha um traço da caneta com degradê. v1.42.12: o contorno (curva suavizada + espessura) é calculado UMA vez para o traço
     inteiro e cortado em pedaços de 1/64 da troca, cada um com a sua cor — antes eram pedaços de 1/12, cada um refeito como um
     traço à parte (a curva e as pontas mudavam nas emendas e a troca de cor aparecia em degraus). */
  _geo: new WeakMap(),
  geo(e) {
    let g = this._geo.get(e); if (g && g.pts === e.pts) return g;
    const P = e.pts, kind = penKind(e), r = penRadii(P, e.width, kind), q = Array.from(P); for (let i = 0; i < r.length; i++) q[i * 3 + 2] = r[i];
    const sp = splinePts(q), n = sp.length / 3, d = new Float32Array(n); let same = true;
    for (let i = 1; i < n; i++) { d[i] = d[i - 1] + Math.hypot(sp[i * 3] - sp[i * 3 - 3], sp[i * 3 + 1] - sp[i * 3 - 2]); if (Math.abs(sp[i * 3 + 2] - sp[2]) > 1e-6) same = false; }
    g = { pts: e.pts, sp, d, n, same, k: d[n - 1] / Math.max(1e-6, this.len(P)) }; this._geo.set(e, g); return g;
  },
  draw(ctx, e) {
    const f = e.fade, o = f.o || 0, kind = penKind(e);
    if (kind === 'fine' || kind === 'calli') return this.drawOld(ctx, e);
    const g = this.geo(e), { sp, d, n } = g, band = Math.max(0.4, f.p / 64);
    ctx.globalAlpha = e.opacity ?? 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const piece = (s, t) => { /* pontos s..t da curva, cor no meio do pedaço (distância medida no traço original) */
      ctx.fillStyle = ctx.strokeStyle = this.mix(f.c, (o + (d[s] + d[t]) / 2 / g.k) / f.p);
      if (g.same) { const p = new Path2D(); p.moveTo(sp[s * 3], sp[s * 3 + 1]); for (let i = s + 1; i <= t; i++) p.lineTo(sp[i * 3], sp[i * 3 + 1]); if (t === s) p.lineTo(sp[s * 3] + 0.01, sp[s * 3 + 1]); ctx.lineWidth = sp[2] * 2; ctx.stroke(p); }
      else { const q = sp.slice(s * 3, (t + 1) * 3), rr = []; for (let i = 2; i < q.length; i += 3) rr.push(q[i]); ctx.fill(buildRadiiPath(q, rr), 'nonzero'); }
    };
    let start = 0, cur = Math.floor((o + 0) / band);
    for (let i = 1; i < n; i++) { const b = Math.floor((o + d[i] / g.k) / band); if (b !== cur) { piece(start, i); start = i; cur = b; } }
    if (start < n - 1 || n === 1) piece(start, n - 1);
  },
  /* caneta fina/caligrafia: pedaços como antes (agora de 1/48 da troca) */
  drawOld(ctx, e) {
    const P = e.pts, n = P.length / 3, f = e.fade, band = Math.max(0.75, f.p / 48);
    const { fade, rot, ...base } = e;
    const seg = (s, t, d) => drawElement(ctx, { ...base, color: this.mix(f.c, d / f.p), pts: P.slice(s * 3, (t + 1) * 3) });
    let d = f.o || 0, start = 0, cur = Math.floor(d / band);
    for (let i = 1; i < n; i++) {
      d += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2]);
      const b = Math.floor(d / band); if (b !== cur) { seg(start, i, (cur + 0.5) * band); start = i; cur = b; }
    }
    if (start < n - 1 || n === 1) seg(start, n - 1, (cur + 0.5) * band);
  },
  /* janela de configurar um degradê */
  async edit(id, onChange) {
    const f = this.get(id); if (!f) return;
    const prev = el('canvas', { class: 'fd-prev', width: 760, height: 120 });
    const paintPrev = () => {
      const g = prev.getContext('2d'); g.clearRect(0, 0, 760, 120); g.save(); g.scale(2, 2);
      if (f.m === 'stroke') { let k = 0; for (let x = 20; x < 360; x += 34, k++) { g.fillStyle = this.mix(f.c, k / Math.max(1, f.s || 3)); g.beginPath(); g.arc(x, 30, 11, 0, Math.PI * 2); g.fill(); } }
      else { const pts = []; for (let x = 12; x <= 368; x += 2) pts.push(x, 30 + Math.sin(x / 18) * 14, 0.5); drawElement(g, { type: 'stroke', tool: 'pen', pen: 'ball', width: 5, color: f.c[0], pts, fade: { c: f.c, p: Math.max(10, f.p || 200), o: 0 } }); }
      g.restore();
    };
    const chips = el('div', { class: 'fd-chips' });
    const paintChips = () => {
      chips.innerHTML = '';
      f.c.forEach((c, i) => {
        const b = el('button', { class: 'fd-chip', style: { background: c }, title: 'Trocar esta cor', onclick: () => colorPop(b, c, (nc) => { f.c[i] = nc; changed(); }, PALETTE, { alpha: true }) });
        if (f.c.length > 2) b.append(el('span', { class: 'xbadge', onclick: (ev) => { ev.stopPropagation(); f.c.splice(i, 1); changed(); } }, '×'));
        chips.append(b);
      });
      if (f.c.length < 8) { const add = el('button', { class: 'cbtn addb fd-add', title: 'Adicionar cor' }); add.innerHTML = icon('plus'); add.onclick = () => colorPop(add, f.c[f.c.length - 1], (nc) => { f.c.push(nc); changed(); }, PALETTE, { alpha: true }); chips.append(add); }
    };
    const speed = el('div', {});
    const paintSpeed = () => {
      speed.innerHTML = '';
      speed.append(f.m === 'stroke'
        ? UI.slider('Traços para trocar de cor', 1, 12, 1, f.s || 3, (v) => { f.s = v; f.n = 0; changed(true); }, (v) => (v === 1 ? '1 (a cada traço)' : String(v)))
        : UI.slider('Tamanho de cada troca', 20, 800, 10, f.p || 200, (v) => { f.p = v; changed(true); }, (v) => (v < 120 ? v + ' · rápido' : v > 400 ? v + ' · lento' : String(v))));
    };
    const changed = (keepChips) => { if (!keepChips) paintChips(); paintPrev(); Store.saveSettings(); onChange && onChange(); };
    const mode = UI.seg([['len', 'Dentro do traço'], ['stroke', 'Uma cor por traço/letra']], f.m || 'len', (v) => { f.m = v; paintSpeed(); changed(true); });
    const body = el('div', { class: 'fd-edit' }, prev, el('p', { class: 'lbl-sm' }, 'Cores (na ordem em que vão aparecer; depois da última volta para a primeira):'), chips,
      el('p', { class: 'lbl-sm' }, 'Como alternar:'), mode, speed,
      el('p', { class: 'lbl-sm muted' }, '"Dentro do traço": a cor muda aos poucos enquanto você escreve e continua no traço seguinte. "Uma cor por traço/letra": cada traço sai de uma cor, mudando aos poucos de um para o outro.'));
    paintChips(); paintSpeed(); paintPrev();
    const r = await openModal({ title: 'Cor em degradê', body, buttons: [{ label: 'Excluir', cls: 'ghost danger', value: 'del' }, { label: 'Pronto', cls: 'primary', value: true }] });
    if (r === 'del') return 'del';
    return true;
  },
  /* v1.11.4: excluir tira a bolinha de TODAS as listas (outros grupos ficavam com uma bolinha cinza) */
  purge(id) {
    const key = 'fade:' + id, S = Store.settings;
    const walk = (o) => { if (Array.isArray(o)) { for (let i = o.length - 1; i >= 0; i--) if (o[i] === key) o.splice(i, 1); else walk(o[i]); } else if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k]); };
    walk(S.presetGroups); walk(S.colorPresets); delete this.all()[id];
  },
  create(firstColor) {
    const id = 'f' + uid().slice(0, 8);
    this.all()[id] = { c: [firstColor && !this.isKey(firstColor) ? firstColor : '#7c3aed', '#e11d48', '#2563eb'], m: 'len', p: 200, s: 3, o: 0, n: 0 };
    return id;
  },
};
