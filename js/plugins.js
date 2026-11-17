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
    id: 'ex-laser', name: 'Ponteiro laser', enabled: true, builtin: true, ver: 1,
    code: `// Rastro vermelho que some sozinho — ótimo para apresentar ou explicar.
let trail = [], timer = null;
function loop(api) {
  const now = performance.now();
  trail = trail.filter(t => now - t.t < 900);
  api.screenPreview(ctx => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], age = (now - b.t) / 900;
      ctx.strokeStyle = 'rgba(239,68,68,' + (1 - age) + ')'; ctx.lineWidth = 6 * (1 - age) + 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  });
  timer = trail.length ? requestAnimationFrame(() => loop(api)) : (api.clearPreview(), null);
}
Traco.registerTool({
  id: 'laser', name: 'Ponteiro laser', icon: 'laser', hint: 'Desenhe: o traço desaparece em seguida e nada é salvo.',
  onDown(p, api) { trail.push({ x: p.screenX, y: p.screenY, t: performance.now() }); if (!timer) loop(api); },
  onMove(p, api) { trail.push({ x: p.screenX, y: p.screenY, t: performance.now() }); },
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
      preview: (fn) => { Editor.clearLive(); Editor.pageTf(Editor.lctx, pi); Editor.lctx.save(); fn(Editor.lctx); Editor.lctx.restore(); },
      screenPreview: (fn) => { Editor.clearLive(); const d = Editor.dpr; Editor.lctx.setTransform(d, 0, 0, d, 0, 0); Editor.lctx.save(); fn(Editor.lctx); Editor.lctx.restore(); },
      clearPreview: () => Editor.clearLive(),
      render: () => Editor.requestRender(),
      toast, ask: (q, v) => askText(q, v),
      store: { get: (k) => ownerData[k], set: (k, v) => { ownerData[k] = v; Store.saveSettings(); } },
    };
  },
  runAction(a) { try { a.run(this.api(Editor.currentPageIndex(), a.owner)); } catch (e) { toast('Erro: ' + e.message, 4000); } },
};
