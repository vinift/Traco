'use strict';
/* ===== Ferramentas próprias (plugins em JavaScript) ===== */
const EXAMPLE_PLUGINS = [
  {
    id: 'ex-data', name: 'Carimbo de data', enabled: true, builtin: true, ver: 4,
    code: `// Toque na página para inserir a data. Personalize o texto no painel de ajustes da ferramenta.
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const PADRAO = { formato: 'Aula dia {dd}/{mm}/{aaaa}', size: 20, color: '#2563eb', bold: true, line: false, lineDash: 'solid', lineW: 1.5, lineColor: '#2563eb', lineLen: 'margem' };
const TRACOS = [['solid', 'Contínua'], ['short', 'Tracejada'], ['long', 'Traço longo'], ['dot', 'Pontilhada'], ['dashdot', 'Traço e ponto']];
const MODELOS = ['Aula dia {dd}/{mm}/{aaaa}', 'Aula {dd}/{mm} — {Dia}', '{Dia}, {dd} de {mes} de {aaaa}', '{dd}/{mm}/{aaaa}', 'Revisão — {dd} de {mes}'];
const cfg = (api) => Object.assign({}, PADRAO, api.store.get('cfg') || {});
function formatar(f, d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0'), cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const v = { Dia: cap(DIAS[d.getDay()]), dia: DIAS[d.getDay()], dd: pad(d.getDate()), d: d.getDate(), mm: pad(d.getMonth() + 1), m: d.getMonth() + 1,
    Mes: cap(MESES[d.getMonth()]), mes: MESES[d.getMonth()], aaaa: d.getFullYear(), aa: String(d.getFullYear()).slice(2), hh: pad(d.getHours()), min: pad(d.getMinutes()) };
  return f.replace(/\{(Dia|dia|dd|d|mm|m|Mes|mes|aaaa|aa|hh|min)\}/g, (_, k) => v[k]);
}
Traco.registerTool({
  id: 'carimbo-data', name: 'Carimbo de data', icon: '📅',
  onUp(p, api) {
    const c = cfg(api), txt = formatar(c.formato), w = Math.max(120, txt.length * c.size * 0.62), y = p.y - c.size * 0.6;
    const els = [{ type: 'text', x: p.x, y, w, text: txt, size: c.size, color: c.color, bold: !!c.bold }];
    if (c.line) { /* linha ACIMA da data, em cima da linha da grade/pauta logo acima do texto; ocupa a largura toda da página (ou só a do texto) */
      const g = api.gridLineAbove(y + 1), ly = g != null ? g : y - c.size * 0.3;
      const full = c.lineLen !== 'texto', pw = api.page.w || 0;
      const x1 = full ? (pw ? 0 : p.x - 60) : p.x, x2 = full ? (pw || p.x + 900) : p.x + Math.min(w, txt.length * c.size * 0.55);
      els.push({ type: 'shape', kind: 'line', x1, y1: ly, x2, y2: ly, color: c.lineColor, width: c.lineW, dash: c.lineDash, fill: null });
    }
    api.addElements(els); // data e linha num passo só do desfazer
  },
  renderOptions(box, api) {
    const { el, slider, switchRow, colorSection } = Traco.ui;
    const c = cfg(api), save = () => api.store.set('cfg', c);
    const prev = el('div', { style: { padding: '12px', borderRadius: '14px', background: 'var(--ch2)', margin: '4px 0 12px', fontWeight: c.bold ? 600 : 400, color: c.color, fontSize: Math.min(26, c.size) + 'px' } }, formatar(c.formato));
    const upd = () => { prev.textContent = formatar(c.formato); prev.style.color = c.color; prev.style.fontWeight = c.bold ? 600 : 400; prev.style.fontSize = Math.min(26, c.size) + 'px'; save(); };
    const inp = el('input', { class: 'tp-input', value: c.formato, spellcheck: 'false' });
    inp.addEventListener('input', () => { c.formato = inp.value; upd(); });
    const chips = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0' } });
    for (const m of MODELOS) chips.append(el('button', { class: 'btn', style: { height: '32px', fontSize: '12.5px', padding: '0 10px' }, onclick: () => { c.formato = m; inp.value = m; upd(); } }, formatar(m)));
    box.append(el('div', { class: 'tp-sec' }, 'Prévia'), prev, el('div', { class: 'tp-sec' }, 'Texto do carimbo'), inp, chips,
      el('p', { style: { fontSize: '12px', color: 'var(--chmuted)', margin: '4px 0 8px' } }, 'Códigos: {dd} dia · {mm} mês · {aaaa} ano · {aa} ano curto · {Dia}/{dia} dia da semana · {Mes}/{mes} mês por extenso · {hh}:{min} hora'),
      slider('Tamanho', c.size, 10, 60, 1, (v) => v, (v) => { c.size = v; upd(); }),
      switchRow('Negrito', null, c.bold, (v) => { c.bold = v; upd(); }),
      colorSection('Cor', c.color, (v) => { c.color = v; upd(); }));
    /* linha junto com a data */
    const lprev = el('div', { style: { height: '14px', margin: '6px 2px 10px', borderBottom: c.lineW + 'px ' + (c.lineDash === 'solid' ? 'solid' : c.lineDash === 'dot' ? 'dotted' : 'dashed') + ' ' + c.lineColor } });
    const lupd = () => { lprev.style.borderBottom = Math.max(1, c.lineW) + 'px ' + (c.lineDash === 'solid' ? 'solid' : c.lineDash === 'dot' ? 'dotted' : 'dashed') + ' ' + c.lineColor; lprev.style.display = c.line ? '' : 'none'; opts.style.display = c.line ? '' : 'none'; save(); };
    const dash = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '6px 0' } });
    const paintDash = () => [...dash.children].forEach((b) => b.classList.toggle('primary', b.dataset.k === c.lineDash));
    for (const [k, n] of TRACOS) dash.append(el('button', { class: 'btn', 'data-k': k, style: { height: '32px', fontSize: '12.5px', padding: '0 10px' }, onclick: () => { c.lineDash = k; paintDash(); lupd(); } }, n));
    paintDash();
    const len = el('div', { style: { display: 'flex', gap: '6px', margin: '6px 0' } });
    const paintLen = () => [...len.children].forEach((b) => b.classList.toggle('primary', b.dataset.k === c.lineLen));
    for (const [k, n] of [['margem', 'Linha inteira'], ['texto', 'Do tamanho do texto']]) len.append(el('button', { class: 'btn', 'data-k': k, style: { height: '32px', fontSize: '12.5px', padding: '0 10px' }, onclick: () => { c.lineLen = k; paintLen(); lupd(); } }, n));
    paintLen();
    const opts = el('div', {}, lprev, el('div', { class: 'tp-sec' }, 'Estilo da linha'), dash, el('div', { class: 'tp-sec' }, 'Comprimento'), len,
      slider('Espessura da linha', c.lineW, 0.5, 8, 0.5, (v) => String(v).replace('.', ','), (v) => { c.lineW = v; lupd(); }),
      colorSection('Cor da linha', c.lineColor, (v) => { c.lineColor = v; lupd(); }));
    box.append(el('div', { class: 'tp-sec' }, 'Linha'), switchRow('Adicionar uma linha acima da data (na linha da grade de cima)', null, c.line, (v) => { c.line = v; lupd(); }), opts);
    lupd();
  },
});`,
  },
  {
    id: 'ex-texto', name: 'Carimbo de texto', enabled: true, builtin: true, ver: 3,
    code: `// Toque na página para inserir o texto do carimbo. Crie vários carimbos (barra de baixo) e ajuste texto, tamanho, cor e fonte no painel de ajustes.
const NOVO = { txt: 'Importante!', size: 20, color: '#dc2626', font: 'sys', bold: true, i: false, u: false };
const pad = (n) => String(n).padStart(2, '0');
function formatar(f, d = new Date()) { /* aceita os mesmos códigos de data do carimbo de data */
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const v = { Dia: cap(DIAS[d.getDay()]), dia: DIAS[d.getDay()], dd: pad(d.getDate()), mm: pad(d.getMonth() + 1), Mes: cap(MESES[d.getMonth()]), mes: MESES[d.getMonth()], aaaa: d.getFullYear(), hh: pad(d.getHours()), min: pad(d.getMinutes()) };
  return String(f || '').replace(/\\{(Dia|dia|dd|mm|Mes|mes|aaaa|hh|min)\\}/g, (_, k) => v[k]);
}
function lista(api) {
  let l = api.store.get('lista');
  if (!Array.isArray(l) || !l.length) { l = [Object.assign({ id: Traco.uid() }, NOVO)]; api.store.set('lista', l); }
  return l;
}
function atual(api) { const l = lista(api), k = api.store.get('cur'); return l.find((x) => x.id === k) || l[0]; }
function elemento(c, x, y, page) {
  const text = formatar(c.txt) || ' ';
  const e = { type: 'text', x, y: y - c.size * 0.6, auto: true, maxW: page.w ? Math.max(60, page.w - x - 16) : 600, w: 20, text, size: c.size, color: c.color, bold: !!c.bold, font: c.font || 'sys' };
  if (c.i || c.u) e.spans = [{ n: text.length, i: c.i ? true : undefined, u: c.u ? true : undefined }];
  try { if (Store.settings.tools.text.ruled) Editor.applyRuled(page, e, true, y); } catch (_) {}
  try { e.w = Math.max(8, Math.ceil(layoutText(e).w * 10) / 10); } catch (_) { e.w = Math.max(60, text.length * c.size * 0.6); }
  return e;
}
function fonte(c) { return (c.i ? 'italic ' : '') + (c.bold ? 700 : 400) + ' 20px ' + Fonts.css(c.font || 'sys'); }
function carregar(c) { if (c.font && c.font !== 'sys') Fonts.link(c.font).then(() => document.fonts.load(fonte(c), 'Aa')).catch(() => {}); }
function amostra(c, el) {
  const s = el.style; s.fontFamily = Fonts.css(c.font || 'sys'); s.color = c.color; s.fontWeight = c.bold ? 700 : 400; s.fontStyle = c.i ? 'italic' : 'normal'; s.textDecoration = c.u ? 'underline' : 'none';
  el.textContent = formatar(c.txt) || '(vazio)';
}
Traco.registerTool({
  id: 'carimbo-texto', name: 'Carimbo de texto', icon: 'stamp', hint: 'Toque na página para inserir o texto.',
  onUp(p, api) { const c = atual(api); carregar(c); api.addElements([elemento(c, p.x, p.y, api.page)]); },
  /* barra de baixo: os carimbos salvos, para trocar com um toque */
  /* barra da esquerda: tamanhos de letra salvos (como as espessuras) */
  renderRail(rail, api) {
    const { el } = Traco.ui, c = atual(api), box = el('div', { class: 'scol' });
    let sz = api.store.get('sizes'); if (!Array.isArray(sz) || !sz.length) { sz = [12, 16, 20, 28, 40]; api.store.set('sizes', sz); }
    sz.forEach((w, i) => {
      const ch = el('button', { class: 'wchip' + (Math.abs(c.size - w) < 0.01 ? ' sel' : ''), title: Traco.fmtW(w) + ' · segure e arraste para reordenar' }); ch.dataset.i = i;
      ch.append(el('span', { style: { fontWeight: 600, fontSize: Math.min(20, 9 + w / 4) + 'px', lineHeight: 1 } }, 'A'), el('span', { class: 'n' }, Traco.fmtW(w)));
      if (Traco.editing()) ch.append(el('span', { class: 'xbadge', onclick: (e) => { e.stopPropagation(); if (sz.length < 2) return; sz.splice(i, 1); api.store.set('sizes', sz); Traco.refreshBar(); } }, '×'));
      box.append(ch);
    });
    Traco.sortable(box, '.wchip', sz, () => { api.store.set('sizes', sz); Traco.refreshBar(); }, {
      tap: (i) => { if (Traco.editing()) return; c.size = sz[i]; api.store.set('lista', lista(api)); Traco.refresh(); },
      long: () => Traco.toggleEditing(),
    });
    const add = el('button', { class: 'cbtn addb', title: 'Salvar o tamanho atual (' + Traco.fmtW(c.size) + ')', onclick: () => {
      if (sz.some((w) => Math.abs(w - c.size) < 0.01)) return Traco.ui.toast('Esse tamanho já está salvo', 1200);
      sz.push(c.size); sz.sort((a, b) => a - b); api.store.set('sizes', sz); Traco.refreshBar(); Traco.ui.toast('Tamanho ' + Traco.fmtW(c.size) + ' salvo', 1200);
    } });
    add.innerHTML = Traco.ui.icon('plus'); box.append(add); rail.append(box);
  },
  renderBar(bar, api) {
    const { el } = Traco.ui, l = lista(api), cur = atual(api), box = el('div', { class: 'scol' });
    l.forEach((c, i) => {
      carregar(c);
      const b = el('button', { class: 'stamp-chip' + (c === cur ? ' sel' : ''), title: formatar(c.txt) + ' · segure e arraste para reordenar' }); b.dataset.i = i;
      const t = el('span', { class: 'st' }); amostra(c, t); b.append(t);
      if (Traco.editing()) b.append(el('span', { class: 'xbadge', onclick: (e) => {
        e.stopPropagation();
        if (l.length < 2) return Traco.ui.toast('É preciso ter pelo menos um carimbo');
        l.splice(i, 1); if (c === cur) api.store.set('cur', l[0].id); api.store.set('lista', l); Traco.refresh();
      } }, '×'));
      box.append(b);
    });
    Traco.sortable(box, '.stamp-chip', l, () => { api.store.set('lista', l); Traco.refreshBar(); }, {
      tap: (i) => { if (Traco.editing()) return; api.store.set('cur', l[i].id); Traco.refresh(); },
      long: () => Traco.toggleEditing(),
    });
    const add = el('button', { class: 'cbtn addb', title: 'Novo carimbo', onclick: () => { const n = Object.assign({}, cur, { id: Traco.uid(), txt: 'Novo carimbo' }); l.push(n); api.store.set('lista', l); api.store.set('cur', n.id); Traco.openOptions(); } });
    add.innerHTML = Traco.ui.icon('plus'); box.append(add, Traco.editBtn('carimbos')); bar.append(box);
  },
  renderOptions(box, api) {
    const { el, slider, switchRow, colorSection, toast } = Traco.ui;
    const l = lista(api), c = atual(api), save = () => { api.store.set('lista', l); Traco.refreshBar(); };
    const prev = el('div', { class: 'stamp-prev' });
    const upd = () => { prev.style.fontSize = Math.min(30, c.size) + 'px'; amostra(c, prev); save(); };
    const inp = el('textarea', { class: 'tp-input', rows: 2, spellcheck: 'false', style: { height: 'auto', minHeight: '60px', resize: 'vertical', padding: '8px 10px' } });
    inp.value = c.txt; inp.addEventListener('input', () => { c.txt = inp.value; upd(); });
    const fl = el('div', { class: 'font-pop in-panel' }); let g = null;
    for (const f of FONTS) {
      if (f[3] !== g) { g = f[3]; fl.append(el('div', { class: 'fp-g' }, g)); }
      Fonts.link(f[0]);
      const b = el('button', { class: 'fp-i' + ((c.font || 'sys') === f[0] ? ' on' : ''), style: { fontFamily: f[2] }, onclick: () => { c.font = f[0]; [...fl.querySelectorAll('.fp-i')].forEach((x) => x.classList.toggle('on', x === b)); carregar(c); upd(); } }, f[1]);
      fl.append(b);
    }
    const del = el('button', { class: 'btn ghost danger', style: { marginTop: '12px' }, onclick: () => {
      if (l.length < 2) return toast('É preciso ter pelo menos um carimbo');
      l.splice(l.indexOf(c), 1); api.store.set('cur', l[0].id); save(); Traco.openOptions();
    } }, 'Excluir este carimbo');
    box.append(el('div', { class: 'tp-sec' }, 'Prévia'), prev,
      el('div', { class: 'tp-sec' }, 'Texto'), inp,
      el('p', { style: { fontSize: '12px', color: 'var(--chmuted)', margin: '4px 0 8px' } }, 'Pode usar códigos de data: {dd}/{mm}/{aaaa}, {Dia}, {mes}, {hh}:{min}. Os carimbos ficam na barra de baixo; o + cria outro.'),
      slider('Tamanho', c.size, 8, 80, 1, (v) => v, (v) => { c.size = v; upd(); }),
      switchRow('Negrito', null, !!c.bold, (v) => { c.bold = v; upd(); }),
      switchRow('Itálico', null, !!c.i, (v) => { c.i = v; upd(); }),
      switchRow('Sublinhado', null, !!c.u, (v) => { c.u = v; upd(); }),
      colorSection('Cor', c.color, (v) => { c.color = v; upd(); }),
      el('div', { class: 'tp-sec' }, 'Fonte'), fl, del);
    upd();
  },
});`,
  },
];

const PLUGIN_DOC = `Cada plugin é um trecho de JavaScript que recebe o objeto Traco.

Traco.registerTool({
  id: 'meu-id', name: 'Nome', icon: '⭐' (emoji) ou nome de ícone interno,
  hint: 'texto da barra de opções',
  onDown(p, api), onMove(p, api), onUp(p, api),   // p = {x, y, pressure, screenX, screenY}
  renderOptions(container, api)                     // opcional: conteúdo do painel de ajustes
  Traco.ui: el, icon, toast, openModal, askText, slider, switchRow, colorSection
})
  renderBar(barra, api)                             // opcional: itens na barra de baixo (ex.: carimbos salvos)
Traco.registerAction({ id, name, icon, run(api) })   // botão que executa uma vez
Traco.registerRenderer('meuTipo', (ctx, elemento) => {...}) // desenhar elementos próprios

api:
  api.page, api.note, api.color, api.width, api.zoom
  api.addText(x, y, texto, {size, color, bold, w})
  api.addStroke([[x,y,pressão], ...], {color, width, tool:'pen'|'highlighter'})
  api.addShape(tipo, x1, y1, x2, y2, {color, width, fill})  tipos: line, arrow, rect, ellipse, triangle, diamond
  api.addElement(elemento)  /  api.removeElement(id)  /  api.elements()
  api.preview(ctx => ...)        desenho temporário em coordenadas da página
  api.screenPreview(ctx => ...)  desenho temporário em coordenadas da tela
  api.clearPreview(), api.render(), api.toast(msg), await api.ask(pergunta)
  api.store.get(chave) / api.store.set(chave, valor)  (dados salvos do plugin)`;

const Plugins = {
  tools: [], actions: [], renderers: {}, errors: {},
  init() {
    const S = Store.settings;
    if (!S.pluginsSeeded) { S.plugins = EXAMPLE_PLUGINS.map((p) => ({ ...p })).concat(S.plugins || []); S.pluginsSeeded = true; Store.saveSettings(); }
    /* v1.11: o ponteiro laser saiu (o usuário não usava) e entrou o carimbo de texto, também para quem já tinha os exemplos */
    if (!S.pluginsV111) {
      S.plugins = S.plugins.filter((x) => !(x.id === 'ex-laser' && x.builtin));
      if (!S.plugins.some((x) => x.id === 'ex-texto')) { const ex = EXAMPLE_PLUGINS.find((x) => x.id === 'ex-texto'); const k = S.plugins.findIndex((x) => x.id === 'ex-data'); S.plugins.splice(k + 1, 0, { ...ex }); }
      S.pluginsV111 = true; Store.saveSettings();
    }
    for (const ex of EXAMPLE_PLUGINS) { // atualiza plugins de exemplo que você não editou
      const p = S.plugins.find((x) => x.id === ex.id);
      if (p && !p.edited && (p.ver || 1) < ex.ver) { p.code = ex.code; p.ver = ex.ver; p.name = ex.name; Store.saveSettings(); }
    }
    this.loadAll();
  },
  loadAll() {
    this.tools = []; this.actions = []; this.renderers = {}; this.errors = {};
    for (const p of Store.settings.plugins) if (p.enabled) this.run(p);
  },
  run(p) {
    const self = this;
    const T = {
      registerTool(def) { if (!def || !def.id) throw new Error('registerTool precisa de id'); def.id = 'pl:' + def.id; def.owner = p.id; self.tools = self.tools.filter((t) => t.id !== def.id); self.tools.push(def); },
      registerAction(def) { if (!def || !def.run) throw new Error('registerAction precisa de run()'); def.owner = p.id; self.actions.push(def); },
      registerRenderer(type, fn) { self.renderers[type] = fn; },
      uid, clamp,
      /* v1.11: redesenhar barras/painel da ferramenta (usado pelo carimbo de texto) */
      refresh: () => UI.refresh(), refreshBar: () => UI.renderOptions(), openOptions: () => { UI.openPanel(); },
      /* v1.11.2: reordenar/remover itens da barra igual às cores e espessuras */
      sortable: (box, sel, list, onDone, o) => makeSortable(box, sel, list, onDone, o), fmtW: (w) => fmtW(w), editing: () => UI.editMode,
      toggleEditing: () => { UI.editMode = !UI.editMode; UI.renderOptions(); if (UI.editMode) toast('Toque no × para remover; toque em ✓ para concluir', 1800); }, editBtn: (what) => UI.editBtn(what),
      ui: { el, icon, toast, openModal, askText, colorPop, PALETTE,
        slider: (label, val, min, max, step, fmt, on) => UI.sliderRows(label, val, min, max, step, fmt, on)[0],
        switchRow: (label, hint, val, on) => UI.switchRow(label, hint, val, on),
        colorSection: (label, cur, on) => UI.colorSection(label, cur, on, PALETTE, false) },
    };
    try { new Function('Traco', '"use strict";\n' + p.code)(T); }
    catch (e) { console.error(e); this.errors[p.id] = e.message; }
  },
  api(pi, owner = 'geral') {
    const note = Editor.note, page = note.pages[pi] || note.pages[0], S = Store.settings;
    const add = (e) => { e.id = e.id || uid(); Editor.recAdd(page, e); Editor.opCommit(); return e.id; };
    const all = (S.pluginData = S.pluginData || {}); const ownerData = (all[owner] = all[owner] && typeof all[owner] === 'object' ? all[owner] : {});
    return {
      note, page, pageIndex: pi, color: S.tools.pen.color, width: S.tools.pen.width, zoom: Editor.cam.z,
      addElement: add,
      addText: (x, y, text, o = {}) => add({ type: 'text', x, y, w: o.w || 320, text: String(text), size: o.size || S.tools.text.size, color: o.color || S.tools.text.color, bold: !!o.bold }),
      addStroke: (points, o = {}) => add({ type: 'stroke', tool: o.tool || 'pen', color: o.color || S.tools.pen.color, width: o.width || S.tools.pen.width, opacity: o.opacity, pts: points.flatMap((q) => [q[0], q[1], q[2] ?? 0.5]) }),
      addShape: (kind, x1, y1, x2, y2, o = {}) => add({ type: 'shape', kind, x1, y1, x2, y2, color: o.color || S.tools.shape.color, width: o.width ?? S.tools.shape.width, fill: o.fill || null, dash: o.dash || undefined }),
      /* y da linha da pauta/grade logo acima de y (null se a página não tem pauta/grade/pontos) */
      gridLineAbove: (y) => { let g = Editor.ruledFor(page); if (!g && note.mode === 'infinite') { const t = page.template || note.template; if (t && t.type !== 'blank') g = { o: 0, s: Math.max(4, +t.spacing || 32) }; } return g ? g.o + Math.floor((y - g.o) / g.s) * g.s : null; },
      addElements: (list) => { const ids = []; for (const e of list) { e.id = e.id || uid(); Editor.recAdd(page, e); ids.push(e.id); } Editor.opCommit(); return ids; }, // vários itens num passo só do desfazer
      removeElement: (id) => { const e = page.elements.find((x) => x.id === id); if (e) { Editor.recRemove(page, e); Editor.opCommit(); } },
      elements: () => page.elements,
      preview: (fn) => { Editor.liveOn(); Editor.clearLive(); Editor.pageTf(Editor.lctx, pi); Editor.lctx.save(); fn(Editor.lctx); Editor.lctx.restore(); },
      screenPreview: (fn) => { Editor.liveOn(); Editor.clearLive(); const d = Editor.dpr; Editor.lctx.setTransform(d, 0, 0, d, 0, 0); Editor.lctx.save(); fn(Editor.lctx); Editor.lctx.restore(); },
      clearPreview: () => Editor.clearLive(),
      render: () => Editor.requestRender(),
      toast, ask: (q, v) => askText(q, v),
      store: { get: (k) => ownerData[k], set: (k, v) => { ownerData[k] = v; Store.saveSettings(); } },
    };
  },
  runAction(a) { try { a.run(this.api(Editor.currentPageIndex(), a.owner)); } catch (e) { toast('Erro: ' + e.message, 4000); } },
};
