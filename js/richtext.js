'use strict';
/* ===== Texto rico: fontes, trechos formatados, layout no canvas e edição ===== */
/* [chave, nome, família CSS, grupo, especificação do Google Fonts (null = fonte do sistema)] */
const FONTS = [
  ['sys', 'Sistema', 'system-ui,-apple-system,Roboto,sans-serif', 'Clássicas', null],
  ['inter', 'Inter', '"Inter",system-ui,sans-serif', 'Clássicas', 'Inter:wght@400;700'],
  ['lora', 'Lora', '"Lora",Georgia,serif', 'Clássicas', 'Lora:ital,wght@0,400;0,700;1,400;1,700'],
  ['merri', 'Merriweather', '"Merriweather",Georgia,serif', 'Clássicas', 'Merriweather:ital,wght@0,400;0,700;1,400;1,700'],
  ['mono', 'Roboto Mono', '"Roboto Mono",ui-monospace,monospace', 'Clássicas', 'Roboto+Mono:ital,wght@0,400;0,700;1,400;1,700'],
  ['caveat', 'Caveat', '"Caveat",cursive', 'Manuscritas', 'Caveat:wght@400;700'],
  ['patrick', 'Patrick Hand', '"Patrick Hand",cursive', 'Manuscritas', 'Patrick+Hand'],
  ['dancing', 'Dancing Script', '"Dancing Script",cursive', 'Cursivas', 'Dancing+Script:wght@400;700'],
  ['vibes', 'Great Vibes', '"Great Vibes",cursive', 'Cursivas', 'Great+Vibes'],
  ['bebas', 'Bebas Neue', '"Bebas Neue",Impact,sans-serif', 'Títulos', 'Bebas+Neue'],
  ['playfair', 'Playfair Display', '"Playfair Display",Georgia,serif', 'Títulos', 'Playfair+Display:ital,wght@0,400;0,700;1,400;1,700'],
];
const FONT_MAP = Object.fromEntries(FONTS.map((f) => [f[0], f]));

/* Carrega as fontes do Google Fonts sob demanda; o service worker guarda os arquivos para uso offline */
const Fonts = {
  ver: 0, ready: {}, state: {},
  css(k) { return (FONT_MAP[k] || FONT_MAP.sys)[2]; },
  keyFromFamily(fam) {
    const first = String(fam || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    const f = FONTS.find((x) => x[2].split(',')[0].replace(/"/g, '').toLowerCase() === first);
    return f ? f[0] : 'sys';
  },
  link(k) {
    if (this.ready[k]) return this.ready[k];
    const f = FONT_MAP[k]; if (!f || !f[4]) return (this.ready[k] = Promise.resolve());
    this.ready[k] = new Promise((res) => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + f[4] + '&display=swap';
      l.onload = res; l.onerror = res; document.head.append(l); setTimeout(res, 6000);
    });
    return this.ready[k];
  },
  /* garante a fonte de uma string de fonte do canvas; ao terminar, redesenha */
  need(font, k) {
    if (!k || k === 'sys' || this.state[font]) return;
    this.state[font] = 'loading';
    this.link(k).then(() => document.fonts.load(font, 'AaÇçãé')).then((l) => {
      this.state[font] = 'ok';
      if (l && l.length) { this.ver++; if (typeof Editor !== 'undefined' && Editor.note) Editor.requestRender(); }
    }).catch(() => { this.state[font] = 'fail'; });
  },
  async ensure(els) { // antes de exportar/miniatura: espera as fontes usadas (até 3 s)
    const ps = [];
    for (const e of els) if (e.type === 'text') for (const r of rtRuns(e)) { if (r.st.f && r.st.f !== 'sys') { const f = rtFont(r.st, e.size); ps.push(this.link(r.st.f).then(() => document.fonts.load(f, r.t.slice(0, 20) || 'A'))); } }
    if (ps.length) { await Promise.race([Promise.allSettled(ps), new Promise((r) => setTimeout(r, 3000))]); this.ver++; }
  },
  prewarm() { // com internet, baixa todas as fontes uma vez para funcionarem offline depois
    if (!navigator.onLine) return;
    for (const f of FONTS) if (f[4]) for (const v of ['400 20px ', '700 20px ', 'italic 400 20px ']) this.need(v + f[2], f[0]);
  },
};

/* ---------- trechos ---------- */
const RT_KEYS = ['b', 'i', 'u', 's', 'f', 'c', 'hl'];
function rtDefault(e) { return { b: !!e.bold, i: false, u: false, s: false, f: e.font || 'sys', c: (e.color || '#111827').toLowerCase(), hl: null }; }
function rtSame(a, b) { return RT_KEYS.every((k) => (a[k] || null) === (b[k] || null)); }
function rtRuns(e) {
  const d = rtDefault(e), text = e.text || '';
  if (!e.spans || !e.spans.length) return [{ t: text, st: d }];
  const out = []; let p = 0;
  for (const s of e.spans) {
    const t = text.slice(p, p + s.n); p += s.n; if (!t) continue;
    const st = { ...d }; for (const k of RT_KEYS) if (s[k] !== undefined) st[k] = s[k];
    out.push({ t, st });
  }
  if (p < text.length) out.push({ t: text.slice(p), st: d });
  return out;
}
function rtCompress(e, runs) { // runs completos → e.spans só com o que difere do padrão da caixa
  const d = rtDefault(e), spans = []; let any = false;
  for (const r of runs) {
    const s = { n: r.t.length };
    for (const k of RT_KEYS) if ((r.st[k] || null) !== (d[k] || null) && !(k === 'c' && String(r.st.c).toLowerCase() === d.c)) { s[k] = r.st[k] || (k === 'hl' ? null : false); any = true; }
    const last = spans[spans.length - 1];
    if (last && RT_KEYS.every((k) => last[k] === s[k])) last.n += s.n; else spans.push(s);
  }
  return any ? spans : undefined;
}
function rtFont(st, size) { return `${st.i ? 'italic ' : ''}${st.b ? 700 : 400} ${size}px ${Fonts.css(st.f)}`; }
function textFont(e) { return rtFont({ ...rtDefault(e), b: !!e.bold }, e.size); }

/* ---------- layout (mesmo modelo de linha do CSS, para o editor e o canvas coincidirem) ---------- */
const LIST_RE = /^(• |☐ |☑ |\d{1,3}[.)] )/;
const _mw = new Map();
function rtMeasure(font, t) {
  const k = font + '\u0001' + t; let w = _mw.get(k); if (w !== undefined) return w;
  measureCtx.font = font; w = measureCtx.measureText(t).width; if (_mw.size > 6000) _mw.clear(); _mw.set(k, w); return w;
}
function rtLineHeight(e) { if (e.ruled) { const s = e.ruled; return s * Math.max(1, Math.ceil((e.size * 1.15) / s - 0.05)); } return e.size * 1.3; }
function rtMetrics(e) {
  const d = rtDefault(e), f = rtFont({ ...d, b: false, i: false }, e.size); Fonts.need(f, d.f);
  measureCtx.font = f; const m = measureCtx.measureText('Hg');
  const A = m.fontBoundingBoxAscent ?? e.size * 0.92, D = m.fontBoundingBoxDescent ?? e.size * 0.24;
  const LH = rtLineHeight(e), normal = (LH - (A + D)) / 2 + A;
  const base = e.ruled ? LH - Math.max(0.5, e.ruled * 0.05) : normal;
  return { A, D, LH, base, shift: base - normal, rootFont: f };
}
function layoutText(e) {
  let L = _textCache.get(e); if (L && L.ver === Fonts.ver) return L;
  const pad = e.sticky ? STICKY_PAD : 0, size = e.size, M = rtMetrics(e), LH = M.LH;
  const avail = Math.max(8, (e.auto ? e.maxW || 600 : e.w) - 2 * pad);
  const paras = [[]];
  for (const r of rtRuns(e)) r.t.split('\n').forEach((t, k) => { if (k) paras.push([]); if (t) paras[paras.length - 1].push({ t, st: r.st }); });
  const lines = [], checks = []; let maxW = 0, off = 0;
  paras.forEach((pr) => {
    const ptext = pr.map((x) => x.t).join(''), m = ptext.match(LIST_RE);
    const indent = m ? rtMeasure(M.rootFont, m[1]) : 0;
    const toks = [];
    for (const r of pr) {
      const f = rtFont(r.st, size); Fonts.need(f, r.st.f);
      for (const t of r.t.split(/(\s+)/)) if (t) toks.push({ t, st: r.st, f, w: rtMeasure(f, t), sp: /^\s/.test(t) });
    }
    let line = { items: [], x: 0, indent: 0, first: true };
    const flush = (last) => {
      let w = line.x; for (let i = line.items.length - 1; i >= 0 && line.items[i].sp; i--) w -= line.items[i].w;
      line.w = Math.max(0, w); line.last = last; lines.push(line); maxW = Math.max(maxW, line.indent + line.w);
      line = { items: [], x: 0, indent, first: false };
    };
    for (let tok of toks) {
      const lim = avail - line.indent;
      if (!tok.sp && line.x + tok.w > lim + 0.5 && line.items.some((it) => !it.sp)) flush(false);
      if (!tok.sp && tok.w > avail - line.indent + 0.5 && line.x === 0) { // palavra maior que a caixa: quebra por letra
        let cur = '';
        for (const ch of tok.t) { if (cur && rtMeasure(tok.f, cur + ch) > avail - line.indent) { line.items.push({ ...tok, t: cur, w: rtMeasure(tok.f, cur), x: 0 }); line.x = rtMeasure(tok.f, cur); flush(false); cur = ch; } else cur += ch; }
        tok = { ...tok, t: cur, w: rtMeasure(tok.f, cur) };
      }
      line.items.push({ ...tok, x: line.x }); line.x += tok.w;
    }
    flush(true);
    if (m && (m[1] === '☐ ' || m[1] === '☑ ')) checks.push({ li: lines.length - 0, ci: off, on: m[1] === '☑ ' });
    off += ptext.length + 1;
  });
  // posição de cada caixa de seleção (primeira linha do parágrafo)
  let ci = 0;
  for (let i = 0, para = 0; i < lines.length; i++) { if (lines[i].first) { lines[i].para = para++; } }
  const boxW = e.auto ? maxW : avail, align = e.align || 'left';
  lines.forEach((ln, i) => {
    ln.base = i * LH + M.base; const lim = boxW - ln.indent;
    let dx = ln.indent;
    if (align === 'center') dx += (lim - ln.w) / 2; else if (align === 'right') dx += lim - ln.w;
    let extra = 0, nsp = 0;
    if (align === 'justify' && !ln.last && !e.auto) { let end = ln.items.length; while (end > 0 && ln.items[end - 1].sp) end--; for (let k = 0; k < end; k++) if (ln.items[k].sp) nsp++; if (nsp) extra = (lim - ln.w) / nsp; }
    let acc = 0; ln.items.forEach((it) => { it.x += dx + acc; if (it.sp && extra) { it.w += extra; acc += extra; } });
  });
  for (const c of checks) { // a 1ª linha do parágrafo de cada caixinha
    while (ci < lines.length && !(lines[ci].first && lines[ci].items.length && lines[ci].items[0].t[0] === (c.on ? '☑' : '☐'))) ci++;
    const ln = lines[ci]; if (!ln) break; const it = ln.items[0];
    c.x = it.x; c.y = ln.base - M.A; c.w = rtMeasure(it.f, it.t[0]); c.h = M.A + M.D; ci++;
  }
  const th = Math.max(1, lines.length) * LH;
  L = { lines, lh: LH, A: M.A, D: M.D, shift: M.shift, base: M.base, checks, ver: Fonts.ver, w: (e.auto ? maxW : avail) + 2 * pad, maxLineW: maxW, h: e.sticky ? Math.max(e.minH || e.w, th + 2 * pad) : th };
  _textCache.set(e, L); return L;
}
function drawRichText(ctx, e, L, ox, oy) {
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const th = Math.max(0.6, e.size / 15);
  for (const ln of L.lines) {
    const by = oy + ln.base;
    for (const it of ln.items) {
      const x = ox + it.x, col = it.st.c || e.color;
      if (it.st.hl) { ctx.fillStyle = it.st.hl; ctx.fillRect(x, by - L.A, it.w + 0.4, L.A + L.D); }
      if (!it.sp) { ctx.font = it.f; ctx.fillStyle = col; ctx.fillText(it.t, x, by); }
      if (it.st.u) { ctx.fillStyle = col; ctx.fillRect(x, by + e.size * 0.13, it.w, th); }
      if (it.st.s) { ctx.fillStyle = col; ctx.fillRect(x, by - e.size * 0.3, it.w, th); }
    }
  }
}
/* toque numa caixinha ☐/☑ (coordenadas locais da página) → índice do caractere ou -1 */
function rtCheckAt(e, x, y) {
  if (e.type !== 'text' || e.lock) return -1; const L = layoutText(e), pad = e.sticky ? STICKY_PAD : 0;
  const ox = e.x + pad, oy = e.y + pad;
  for (const c of L.checks) if (c.w && x >= ox + c.x - 4 && x <= ox + c.x + c.w + 4 && y >= oy + c.y - 4 && y <= oy + c.y + c.h + 4) return c.ci;
  return -1;
}

/* ---------- DOM ⇄ trechos (editor contenteditable) ---------- */
function rtEsc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function rtSpanCss(st, d) {
  const c = [];
  if (st.b !== d.b) c.push('font-weight:' + (st.b ? 700 : 400));
  if (st.i) c.push('font-style:italic');
  if (st.u || st.s) c.push('text-decoration-line:' + [st.u && 'underline', st.s && 'line-through'].filter(Boolean).join(' '));
  if (st.f !== d.f) c.push('font-family:' + Fonts.css(st.f).replace(/"/g, "'"));
  if (st.c && st.c.toLowerCase() !== d.c) c.push('color:' + st.c);
  if (st.hl) c.push('background-color:' + st.hl);
  return c.join(';');
}
function rtToHtml(e) {
  const d = rtDefault(e), paras = [[]];
  for (const r of rtRuns(e)) r.t.split('\n').forEach((t, k) => { if (k) paras.push([]); if (t) paras[paras.length - 1].push({ t, st: r.st }); });
  return paras.map((p) => '<div>' + (p.length ? p.map((r) => { const css = rtSpanCss(r.st, d); return css ? `<span style="${css}">${rtEsc(r.t)}</span>` : rtEsc(r.t); }).join('') : '<br>') + '</div>').join('');
}
function rtHex(c) {
  const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return String(c).toLowerCase();
  const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x)); if (a === 0) return null;
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function rtFromDom(root, e) {
  const d = rtDefault(e), runs = []; let text = '';
  const add = (t, st) => { if (!t) return; text += t; const last = runs[runs.length - 1]; if (last && rtSame(last.st, st)) last.t += t; else runs.push({ t, st }); };
  const styleOf = (node) => {
    const elx = node.nodeType === 1 ? node : node.parentElement; const cs = getComputedStyle(elx);
    const dec = new Set(); let hl = null;
    for (let p = elx; p; p = p.parentElement) {
      const c = getComputedStyle(p); (c.textDecorationLine || '').split(' ').forEach((x) => dec.add(x));
      if (p === root) break;
      if (!hl) { const bg = rtHex(c.backgroundColor); if (bg) hl = bg; }
    }
    return { b: +cs.fontWeight >= 600, i: /italic|oblique/.test(cs.fontStyle), u: dec.has('underline'), s: dec.has('line-through'), f: Fonts.keyFromFamily(cs.fontFamily), c: rtHex(cs.color) || d.c, hl };
  };
  const BLOCK = /^(DIV|P|LI|UL|OL|H\d|BLOCKQUOTE|PRE)$/;
  const walk = (node) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) add(ch.data.replace(/ /g, ' ').replace(/​/g, ''), styleOf(ch));
      else if (ch.nodeName === 'BR') { if (!(ch === ch.parentNode.lastChild && ch.parentNode !== root)) add('\n', runs.length ? runs[runs.length - 1].st : d); }
      else if (ch.nodeType === 1) {
        if (BLOCK.test(ch.nodeName) && text.length && !text.endsWith('\n')) add('\n', runs.length ? runs[runs.length - 1].st : d);
        walk(ch);
      }
    }
  };
  walk(root);
  // tira espaços e quebras do fim
  while (runs.length) { const r = runs[runs.length - 1], t = r.t.replace(/[\s\n]+$/, ''); if (t === r.t) break; text = text.slice(0, text.length - (r.t.length - t.length)); if (t) { r.t = t; break; } runs.pop(); }
  return { text, spans: rtCompress(e, runs) };
}

/* ===== Editor: caixa de texto com formatação (contenteditable) ===== */
const TB_ICONS = {
  alignL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', alignC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>', alignJ: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  listB: '<circle cx="5" cy="7" r="1.3"/><circle cx="5" cy="12" r="1.3"/><circle cx="5" cy="17" r="1.3"/><path d="M9 7h11M9 12h11M9 17h11"/>',
  listC: '<rect x="3" y="4.5" width="5" height="5" rx="1"/><path d="m3.8 15.8 1.6 1.6 2.8-3"/><path d="M11 7h9M11 16h9"/>',
  listN: '<path d="M4 5h1.5v4M4 9h3M4 14.2c.3-.8 2.6-.9 2.6.4 0 1-2.6 1.6-2.6 3h2.8"/><path d="M10 7h10M10 16h10"/>',
  ruled: '<path d="M3 15h18M3 21h18" opacity=".5"/><path d="m6 15 4-11 4 11M7.5 11h5"/><path d="M17 4v11" opacity=".5"/>',
  hl: '<path d="m9 11 6-6 4 4-6 6"/><path d="m9 11-3 3 4 4 3-3"/><path d="M4 21h8" stroke-width="3" opacity=".55"/>',
};
function tbIcon(k) { return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TB_ICONS[k]}</svg>`; }

Object.assign(Editor, {
  textAt(w) {
    const pi = this.pageIndexAt(w.x, w.y, this.note.mode === 'infinite'); if (pi < 0) return;
    const page = this.note.pages[pi], l = this.local(pi, w.x, w.y);
    const hit = [...page.elements].reverse().find((e) => e.type === 'text' && !e.lock && hitElement(e, l.x, l.y, 4));
    if (hit) return this.openTextEditor(page, hit, false);
    const st = Store.settings.tools.text, sk = Store.settings.tools.sticky, inf = this.note.mode === 'infinite';
    let el;
    if (this.tool === 'sticky') el = { id: uid(), type: 'text', sticky: true, bg: sk.bg, x: l.x - 20, y: l.y - 20, w: 220, minH: 200, text: '', size: sk.size, color: sk.color, bold: false, font: st.font || 'sys' };
    else {
      el = { id: uid(), type: 'text', x: l.x, y: l.y - st.size * 0.6, auto: true, maxW: inf ? 600 : Math.max(60, page.w - l.x - 16), w: 20, text: '', size: st.size, color: st.color, bold: !!st.bold, font: st.font || 'sys', align: st.align || 'left' };
      if (st.ruled) this.applyRuled(page, el, true, l.y);
    }
    this.openTextEditor(page, el, true);
  },
  ruledFor(page) { const tpl = page.template || this.note.template; if (!tpl || tpl.type === 'blank' || this.note.mode === 'infinite') return null; return this.gridLines(tpl, page, 1); },
  /* liga/desliga "alinhar às linhas do modelo": entrelinha = espaçamento do modelo e base das letras sobre as linhas */
  applyRuled(page, el, on, nearY) {
    if (!on) { delete el.ruled; return true; }
    const g = this.ruledFor(page); if (!g) { toast('Esta página não tem pauta, grade ou pontos'); return false; }
    const was = nearY ?? el.y + rtMetrics(el).base;
    el.ruled = g.s; const LH = rtLineHeight(el);
    const k = Math.round((was - g.o) / g.s); el.y = g.o + k * g.s - LH; // a 1ª linha de texto fica sobre a linha mais próxima
    return true;
  },
  openTextEditor(page, el, isNew) {
    this.commitText();
    const work = { ...el }, ed = document.createElement('div');
    ed.className = 'text-edit'; ed.contentEditable = 'true'; ed.spellcheck = true;
    ed.innerHTML = rtToHtml(work);
    this.textEl = ed; this.textCtx = { page, el: work, orig: isNew ? null : el, isNew }; this.editingId = isNew ? null : el.id;
    this.overlay.append(ed); this.styleTextEditor(); this.normalizeParas(); this.positionText();
    ed.addEventListener('input', (ev) => this.onTextInput(ev));
    ed.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ed.blur(); this.commitText(); } });
    ed.addEventListener('blur', () => setTimeout(() => {
      if (this.textEl !== ed || this._rtHold) return;
      const a = document.activeElement; if (a === ed || (a && a.closest && a.closest('#textBar,#popRoot'))) return;
      this.commitText();
    }, 0));
    document.addEventListener('selectionchange', this._rtSelFn || (this._rtSelFn = () => this.onTextSel()));
    setTimeout(() => {
      if (this.textEl !== ed) return; ed.focus();
      try { document.execCommand('styleWithCSS', false, true); document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (_) {}
      const r = document.createRange(), last = ed.lastElementChild || ed; r.selectNodeContents(last); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }, 30);
    this.buildTextBar(); this.requestRender();
  },
  styleTextEditor() {
    const ed = this.textEl, e = this.textCtx.el, M = rtMetrics(e), pad = e.sticky ? STICKY_PAD : 0;
    ed.style.font = textFont(e); ed.style.lineHeight = M.LH + 'px'; ed.style.color = e.color; ed.style.textAlign = e.align || 'left';
    if (e.auto) { ed.style.width = 'max-content'; ed.style.maxWidth = (e.maxW || 600) - 2 * pad + 'px'; }
    else { ed.style.width = e.w - 2 * pad + 'px'; ed.style.maxWidth = ''; }
    ed.style.background = 'transparent';
    ed.classList.toggle('ruled', !!e.ruled);
  },
  positionText() {
    const ed = this.textEl; if (!ed) return;
    const { page, el } = this.textCtx; const pi = this.pageIdx(page), o = this.layout[pi], z = this.cam.z;
    const pad = el.sticky ? STICKY_PAD : 0, M = rtMetrics(el);
    const s = this.toScreen(el.x + pad + o.x, el.y + pad + M.shift + o.y);
    ed.style.left = s.x + 'px'; ed.style.top = s.y + 'px'; ed.style.transform = `scale(${z})`;
    this.placeTextBar();
  },
  /* recuo pendurado das listas (igual ao desenho no canvas) */
  normalizeParas() {
    const ed = this.textEl; if (!ed) return; const M = rtMetrics(this.textCtx.el);
    // texto solto na raiz vai para dentro de um parágrafo (mantendo o cursor)
    if ([...ed.childNodes].some((n) => n.nodeType === 3 || (n.nodeType === 1 && !/^(DIV|P)$/.test(n.nodeName)))) {
      const s = getSelection(), an = s.anchorNode, ao = s.anchorOffset;
      const blocks = []; let cur = null;
      for (const n of [...ed.childNodes]) { if (n.nodeType === 1 && /^(DIV|P)$/.test(n.nodeName)) { cur = null; blocks.push(n); } else { if (!cur) { cur = document.createElement('div'); ed.insertBefore(cur, n); blocks.push(cur); } cur.append(n); } }
      if (an && ed.contains(an)) try { s.collapse(an, ao); } catch (_) {}
    }
    for (const d of ed.children) {
      const m = d.textContent.replace(/ /g, ' ').match(LIST_RE);
      if (m) { const w = rtMeasure(M.rootFont, m[1]); d.style.paddingLeft = w + 'px'; d.style.textIndent = -w + 'px'; }
      else { d.style.paddingLeft = ''; d.style.textIndent = ''; }
    }
  },
  curPara() { const s = getSelection(); let n = s.anchorNode; if (!n || !this.textEl || !this.textEl.contains(n)) return null; while (n && n.parentNode !== this.textEl) n = n.parentNode; return n && n.nodeType === 1 ? n : null; },
  onTextInput(ev) {
    const ed = this.textEl; if (!ed) return;
    if (ev && ev.inputType === 'insertParagraph') { // Enter numa lista continua a lista
      const p = this.curPara(), prev = p && p.previousElementSibling;
      const m = prev && prev.textContent.replace(/ /g, ' ').match(LIST_RE);
      if (m) {
        if (prev.textContent.replace(/ /g, ' ').trim() === m[1].trim()) { prev.innerHTML = '<br>'; p.remove(); const r = document.createRange(); r.setStart(prev, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }
        else { const nm = /^\d/.test(m[1]) ? (parseInt(m[1], 10) + 1) + m[1].replace(/^\d+/, '') : m[1] === '☑ ' ? '☐ ' : m[1]; document.execCommand('insertText', false, nm); }
      }
    }
    this.normalizeParas();
    const e = this.textCtx.el;
    if (e.sticky) { const r = rtFromDom(ed, e); e.text = r.text; e.spans = r.spans; this.requestRender(); }
    this.positionText();
  },
  onTextSel() { if (!this.textEl) return; const s = getSelection(); if (s.rangeCount && this.textEl.contains(s.anchorNode)) { this._rtRange = s.getRangeAt(0).cloneRange(); this.updateTextBar(); } },
  restoreTextSel() { const ed = this.textEl; if (!ed) return; ed.focus(); if (this._rtRange && ed.contains(this._rtRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(this._rtRange); } },
  textCmd(cmd, val) { this.restoreTextSel(); try { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); } catch (_) {} this.onTextInput(); this.updateTextBar(); },
  /* listas: põe ou tira o prefixo nos parágrafos selecionados */
  toggleList(kind) {
    this.restoreTextSel(); const ed = this.textEl, s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0); let paras;
    if (r.collapsed) { let n = r.startContainer; if (n === ed) n = ed.children[Math.max(0, r.startOffset - 1)]; else while (n && n.parentNode !== ed) n = n.parentNode; paras = n && n.nodeType === 1 ? [n] : []; }
    else paras = [...ed.children].filter((d) => r.intersectsNode(d));
    if (!paras.length) return;
    const pre = (i) => (kind === 'b' ? '• ' : kind === 'c' ? '☐ ' : i + 1 + '. ');
    const isK = (m) => m && (kind === 'b' ? m[1] === '• ' : kind === 'c' ? /^[☐☑] $/.test(m[1]) : /^\d/.test(m[1]));
    const all = paras.every((d) => isK(d.textContent.replace(/ /g, ' ').match(LIST_RE)));
    paras.forEach((d, i) => {
      const m = d.textContent.replace(/ /g, ' ').match(LIST_RE);
      const tw = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let tn = tw.nextNode();
      if (m && tn) { let left = m[1].length; while (tn && left > 0) { const k = Math.min(left, tn.data.length); tn.data = tn.data.slice(k); left -= k; tn = tw.nextNode(); } }
      if (!all) { const first = document.createTreeWalker(d, NodeFilter.SHOW_TEXT).nextNode(); if (first) first.data = pre(i) + first.data; else d.innerHTML = rtEsc(pre(i)); }
    });
    const last = paras[paras.length - 1], rr = document.createRange(); rr.selectNodeContents(last); rr.collapse(false); s.removeAllRanges(); s.addRange(rr);
    this.onTextInput();
  },
  setBoxStyle(patch) { // propriedades da caixa toda (alinhamento, tamanho, linhas do modelo)
    const e = this.textCtx.el; Object.assign(e, patch); _textCache.delete(e);
    this.styleTextEditor(); this.normalizeParas(); this.positionText(); this.updateTextBar(); this.requestRender();
    this.restoreTextSel();
  },
  commitText() {
    const ed = this.textEl; if (!ed) return; this.textEl = null; this.editingId = null;
    document.removeEventListener('selectionchange', this._rtSelFn);
    const tb = $('#textBar'); if (tb) tb.remove();
    const { page, el, orig, isNew } = this.textCtx; const r = rtFromDom(ed, el); ed.remove();
    const n = { ...el, text: r.text }; if (r.spans) n.spans = r.spans; else delete n.spans;
    if (n.auto) { _textCache.delete(n); n.w = Math.max(8, Math.ceil(layoutText(n).w * 10) / 10); }
    if (isNew) { if (n.text || n.sticky) this.recAdd(page, n); }
    else if (!n.text && !n.sticky) this.recRemove(page, orig);
    else if (JSON.stringify(n) !== JSON.stringify(orig)) this.recReplace(page, orig, n);
    this.opCommit(); this.requestRender();
  },

  /* ---------- barra de formatação ---------- */
  buildTextBar() {
    let bar = $('#textBar'); if (bar) bar.remove();
    bar = el('div', { id: 'textBar', class: 'sel-bar text-bar' }); this.stage.append(bar);
    bar.addEventListener('mousedown', (ev) => { if (ev.target.closest('button')) ev.preventDefault(); }); // mantém o cursor no texto
    bar.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    const B = (html, title, fn, cls = '') => { const b = el('button', { class: 'icon-btn ' + cls, title, onclick: (ev) => { ev.preventDefault(); fn(b); } }); b.innerHTML = html; bar.append(b); return b; };
    const sep = () => bar.append(el('span', { class: 'tb-sep' }));
    const hold = (fn) => { this._rtHold = true; fn(() => { this._rtHold = false; setTimeout(() => this.restoreTextSel(), 0); }); };
    this._tb = {};
    // alternar para "seleção da caixa": mover, redimensionar, mudar cor da caixa inteira
    B(icon('lassoRect'), 'Selecionar a caixa (mover/redimensionar)', () => { const id = this.textCtx && (this.textCtx.isNew ? this.textCtx.el.id : this.textCtx.orig.id), pg = this.textCtx && this.textCtx.page; this.commitText(); if (pg && pg.elements.some((x) => x.id === id)) { this.sel = { pageId: pg.id, ids: new Set([id]) }; this._lastTap = null; } this.requestRender(); });
    sep();
    this._tb.font = B('<span class="tb-font">Aa</span>', 'Fonte', (b) => hold((done) => this.fontPop(b, done)), 'wide');
    sep();
    this._tb.b = B('<b>B</b>', 'Negrito', () => this.textCmd('bold'));
    this._tb.i = B('<i style="font-family:Georgia,serif">I</i>', 'Itálico', () => this.textCmd('italic'));
    this._tb.u = B('<u>U</u>', 'Sublinhado', () => this.textCmd('underline'));
    this._tb.s = B('<s>S</s>', 'Tachado', () => this.textCmd('strikeThrough'));
    this._tb.c = B('<span class="tb-a">A<i></i></span>', 'Cor do texto', (b) => hold((done) => { colorPop(b, '#111827', (c) => { this._rtHold = false; this.restoreTextSel(); this.textCmd('foreColor', c); }); openPop._close = done; }));
    this._tb.hl = B(tbIcon('hl'), 'Realce (marca-texto)', (b) => hold((done) => { const box = el('div', { class: 'hl-pop' }); for (const c of HL_PALETTE) box.append(el('button', { class: 'cdot', style: { background: c }, onclick: () => { closePop(); this.textCmd('hiliteColor', c); } })); box.append(el('button', { class: 'btn', onclick: () => { closePop(); this.textCmd('hiliteColor', 'transparent'); } }, 'Sem realce')); openPop(b, box, { onClose: done }); }));
    sep();
    const AL = [['left', 'alignL', 'Alinhar à esquerda'], ['center', 'alignC', 'Centralizar'], ['right', 'alignR', 'Alinhar à direita'], ['justify', 'alignJ', 'Justificar']];
    this._tb.al = B(tbIcon('alignL'), 'Alinhamento', (b) => { const e = this.textCtx.el; const i = AL.findIndex((a) => a[0] === (e.align || 'left')); const nx = AL[(i + 1) % AL.length]; this.setBoxStyle({ align: nx[0] }); toast(nx[2], 800); });
    this._tb.lb = B(tbIcon('listB'), 'Lista com marcadores', () => this.toggleList('b'));
    this._tb.lc = B(tbIcon('listC'), 'Lista de tarefas (☐)', () => this.toggleList('c'));
    this._tb.ln = B(tbIcon('listN'), 'Lista numerada', () => this.toggleList('n'));
    sep();
    this._tb.ru = B(tbIcon('ruled'), 'Alinhar às linhas do modelo', () => { const e = this.textCtx.el; const on = !e.ruled; const tmp = { ...e }; if (this.applyRuled(this.textCtx.page, tmp, on)) this.setBoxStyle({ ruled: tmp.ruled, y: tmp.y }); if (!on) { delete this.textCtx.el.ruled; this.setBoxStyle({}); } });
    B(icon('minus'), 'Diminuir letra', () => this.setBoxStyle({ size: Math.max(6, Math.round((this.textCtx.el.size - 1) * 2) / 2) }));
    this._tb.sz = el('span', { class: 'tb-size' }); bar.append(this._tb.sz);
    B(icon('plus'), 'Aumentar letra', () => this.setBoxStyle({ size: Math.min(200, Math.round((this.textCtx.el.size + 1) * 2) / 2) }));
    sep();
    B(icon('check'), 'Concluir', () => { this.textEl && this.textEl.blur(); this.commitText(); });
    this.updateTextBar(); this.placeTextBar();
  },
  fontPop(anchor, done) {
    const box = el('div', { class: 'font-pop' }); let g = null;
    for (const f of FONTS) {
      if (f[3] !== g) { g = f[3]; box.append(el('div', { class: 'fp-g' }, g)); }
      Fonts.link(f[0]);
      box.append(el('button', { class: 'fp-i', style: { fontFamily: f[2] }, onclick: () => { closePop(); this._rtHold = false; this.textCmd('fontName', f[2].replace(/"/g, "'")); } }, f[1]));
    }
    openPop(anchor, box, { onClose: done });
  },
  updateTextBar() {
    const t = this._tb; if (!t || !this.textEl) return; const e = this.textCtx.el;
    const q = (c) => { try { return document.queryCommandState(c); } catch (_) { return false; } };
    t.b.classList.toggle('on', q('bold')); t.i.classList.toggle('on', q('italic')); t.u.classList.toggle('on', q('underline')); t.s.classList.toggle('on', q('strikeThrough'));
    let fam = e.font || 'sys', col = e.color; const s = getSelection();
    if (s.anchorNode && this.textEl.contains(s.anchorNode)) { const n = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement; const cs = getComputedStyle(n); fam = Fonts.keyFromFamily(cs.fontFamily); col = rtHex(cs.color) || col; }
    const fs = t.font.querySelector('.tb-font'); fs.style.fontFamily = Fonts.css(fam); fs.textContent = (FONT_MAP[fam] || FONT_MAP.sys)[1];
    t.c.querySelector('i').style.background = col;
    const al = { left: 'alignL', center: 'alignC', right: 'alignR', justify: 'alignJ' }[e.align || 'left']; t.al.innerHTML = tbIcon(al);
    t.ru.classList.toggle('on', !!e.ruled); t.sz.textContent = fmtW(e.size);
  },
  placeTextBar() {
    const bar = $('#textBar'), ed = this.textEl; if (!bar || !ed) return;
    const r = ed.getBoundingClientRect(), sr = this.stage.getBoundingClientRect(), bw = bar.offsetWidth, bh = bar.offsetHeight;
    let y = r.top - sr.top - bh - 14; if (y < 6) y = r.bottom - sr.top + 14;
    bar.style.left = clamp(r.left - sr.left, 6, this.W - bw - 6) + 'px'; bar.style.top = clamp(y, 6, this.H - bh - 6) + 'px';
  },
});

/* ===== Toques: dedo seleciona objetos, toque duplo edita texto, caixinhas ☐ ===== */
Object.assign(Editor, {
  toggleCheck(page, e, ci) {
    const ch = e.text[ci], n = { ...e, text: e.text.slice(0, ci) + (ch === '☐' ? '☑' : '☐') + e.text.slice(ci + 1) };
    this.recReplace(page, e, n); this.opCommit(); if (navigator.vibrate) navigator.vibrate(8);
  },
  hitAt(p, noTable) { // página e item (não-traço) sob um ponto da tela (v1.4.1: noTable = pula tabelas)
    const w = this.toWorld(p.x, p.y), pi = this.pageIndexAt(w.x, w.y, true); if (pi < 0) return {};
    const page = this.note.pages[pi], l = this.local(pi, w.x, w.y), tol = 10 / this.cam.z;
    const canLocked = (Store.settings.tools.lasso || {}).locked;
    const els = [...page.elements].reverse().filter((e) => e.type !== 'stroke' && (!e.lock || canLocked) && !(noTable && e.type === 'table'));
    let hit = els.find((e) => hitElement(e, l.x, l.y, tol));
    if (!hit) hit = els.find((e) => { const b = elBBox(e); return l.x >= b.x && l.x <= b.x + b.w && l.y >= b.y && l.y <= b.y + b.h; });
    return { page, l, hit };
  },
  checkAt(page, l) { for (const e of [...page.elements].reverse()) { const ci = rtCheckAt(e, l.x, l.y); if (ci >= 0) return { e, ci }; } return null; },
  fingerTap(p) {
    if (this.crop) return this.applyCrop(); // recorte na página: tocar fora da imagem aplica
    if (this.textEl) return this.commitText();
    const { page, l, hit } = this.hitAt(p, this.tableFingerLock()); /* v1.4.1: no zoom alto o dedo não seleciona tabela */
    if (!page) { this.sel = null; return this.requestRender(); }
    const ck = this.checkAt(page, l); if (ck) return this.toggleCheck(page, ck.e, ck.ci);
    const now = performance.now();
    if (!hit) { // toque duplo numa área vazia: v0.29 liga/desliga a tela cheia (antes era zoom rápido)
      const e0 = this._emptyTap; this._emptyTap = { t: now, x: p.x, y: p.y };
      if (e0 && now - e0.t < 380 && Math.hypot(p.x - e0.x, p.y - e0.y) < 40) { this._emptyTap = null; return Focus.toggle(); }
    }
    // texto: 1º toque seleciona; tocar de novo no texto já selecionado abre a edição (sem pressa)
    if (hit && hit.type === 'text' && !hit.lock && ((this.sel && this.sel.ids.size === 1 && this.sel.ids.has(hit.id)) || (this._lastTap && this._lastTap.id === hit.id && now - this._lastTap.t < 450))) { this._lastTap = null; this.sel = null; return this.openTextEditor(page, hit, false); }
    // ferramenta de texto/post-it: toque com o dedo num espaço vazio cria uma caixa nova
    if (!hit && (this.tool === 'text' || this.tool === 'sticky')) { this._emptyTap = null; this.sel = null; return this.textAt(this.toWorld(p.x, p.y)); }
    this._lastTap = hit ? { id: hit.id, t: now } : null; this.tsel = null;
    this.sel = hit ? { pageId: page.id, ids: new Set([hit.id]) } : null; // seleciona e continua na ferramenta atual
    this.requestRender();
  },
  tapOnSel(a, p) { // toque (sem arrastar) sobre a seleção: toque duplo num texto abre a edição; caixinha ☐ alterna
    const { page, l } = this.hitAt(p); if (!page) return;
    const ck = this.checkAt(page, l); if (ck && this.sel.ids.has(ck.e.id)) return this.toggleCheck(page, ck.e, ck.ci);
    const els = this.selElements(), now = performance.now();
    if (els.length === 1 && els[0].type === 'text' && !els[0].lock && (a.ptype === 'touch' || (this._lastTap && this._lastTap.id === els[0].id && now - this._lastTap.t < 450))) { this._lastTap = null; const e = els[0]; this.sel = null; return this.openTextEditor(page, e, false); }
    if (els.length === 1 && els[0].type === 'table' && !els[0].lock && !this.tEdit && (a.ptype === 'touch' || (this._lastTap && this._lastTap.id === els[0].id && now - this._lastTap.t < 450))) { this._lastTap = null; return this.toggleTableCells(true); } /* v0.39: toque (dedo) ou toque duplo (caneta) na tabela → editar células */
    if (els.length === 1) this._lastTap = { id: els[0].id, t: now };
  },
  /* toque curto da caneta: alterna ☐, ou toque duplo num texto abre a edição (o pontinho só entra se não for toque duplo) */
  penTap(a, page) {
    if (a.tool !== 'pen' || a.shape || a.snap) return false;
    const b = bboxUnion([{ type: 'stroke', tool: 'pen', width: 0, pts: a.pts }]); if (!b || Math.max(b.w, b.h) * this.cam.z > 4) return false;
    const x = a.pts[0], y = a.pts[1];
    const ck = this.checkAt(page, { x, y }); if (ck) { this.toggleCheck(page, ck.e, ck.ci); return true; }
    const hit = [...page.elements].reverse().find((e) => e.type === 'text' && !e.lock && hitElement(e, x, y, 2)); if (!hit) return false;
    const now = performance.now(), last = this._penDot;
    if (last && last.id === hit.id && now - last.t < 450) { clearTimeout(last.timer); this._penDot = null; this.openTextEditor(page, hit, false); return true; }
    this.flushPenDot();
    const dot = { id: uid(), type: 'stroke', tool: 'pen', color: a.color, width: a.width, pts: a.pts.map((v, i) => (i % 3 === 2 ? v : r2(v))), pen: a.pen };
    this._penDot = { id: hit.id, t: now, page, dot, timer: setTimeout(() => this.flushPenDot(), 460) };
    return true;
  },
  flushPenDot() { const d = this._penDot; if (!d) return; this._penDot = null; clearTimeout(d.timer); if (this.note && this.note.pages.includes(d.page)) { this.recAdd(d.page, d.dot); this.opCommit(); } },

  /* ===== Conta-gotas: copia o estilo do item selecionado para a ferramenta ===== */
  pickStyle() {
    const e = this.selElements()[0]; if (!e) return;
    const S = Store.settings, T = S.tools, src = e.type === 'stroke' ? e.tool : e.type === 'shape' ? 'shape' : e.type === 'text' ? (e.sticky ? 'sticky' : 'text') : null;
    if (!src) return toast('Esse item não tem estilo para copiar');
    let tool = ['pen', 'highlighter', 'shape', 'text', 'sticky'].includes(this.tool) ? this.tool : src;
    const t = T[tool], color = e.color;
    if (color) { t.color = color; t.fade = null; }
    if (tool === src) { // mesma ferramenta: copia tudo
      if (src === 'pen') Object.assign(t, { width: e.width, type: e.pen || 'natural', nib: e.nib ?? t.nib, dash: e.dash || 'solid' });
      if (src === 'highlighter') Object.assign(t, { width: e.width, opacity: e.opacity ?? t.opacity });
      if (src === 'shape') Object.assign(t, { width: e.width, dash: e.dash || 'solid', fill: !!e.fill, fillColor: e.fill || t.fillColor });
      if (src === 'text') Object.assign(t, { size: e.size, font: e.font || 'sys', bold: !!e.bold, align: e.align || 'left' });
      if (src === 'sticky') Object.assign(t, { bg: e.bg, size: e.size });
    } else if (e.width && ['pen', 'highlighter', 'shape'].includes(tool)) t.width = tool === 'highlighter' ? Math.max(t.width, e.width) : e.width;
    UI.save(); this.sel = null; UI.setTool(tool, true); UI.refresh(); this.requestRender();
    toast('Estilo copiado para: ' + (TOOLS.find((x) => x.id === tool) || { name: tool }).name, 1600);
  },
});
