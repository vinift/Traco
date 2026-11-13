'use strict';
/* ===== Ferramentas próprias (plugins em JavaScript) ===== */
const EXAMPLE_PLUGINS = [
  {
    id: 'ex-data', name: 'Carimbo de data', enabled: true, builtin: true,
    code: `// Toque na página para inserir a data de hoje.
Traco.registerTool({
  id: 'carimbo-data', name: 'Carimbo de data', icon: '📅',
  hint: 'Toque na página para inserir a data de hoje.',
  onUp(p, api) {
    const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    api.addText(p.x, p.y - 12, d.charAt(0).toUpperCase() + d.slice(1), { size: 18, color: '#2563eb', bold: true });
  }
});`,
  },
  {
    id: 'ex-laser', name: 'Ponteiro laser', enabled: true, builtin: true,
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
  renderOptions(container, api)                     // opcional
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
    };
    try { new Function('Traco', '"use strict";\n' + p.code)(T); }
    catch (e) { console.error(e); this.errors[p.id] = e.message; }
  },
  api(pi) {
    const note = Editor.note, page = note.pages[pi] || note.pages[0], S = Store.settings;
    const add = (e) => { e.id = e.id || uid(); Editor.recAdd(page, e); Editor.opCommit(); return e.id; };
    const ownerData = (S.pluginData = S.pluginData || {});
    return {
      note, page, pageIndex: pi, color: S.tools.pen.color, width: S.tools.pen.width, zoom: Editor.cam.z,
      addElement: add,
      addText: (x, y, text, o = {}) => add({ type: 'text', x, y, w: o.w || 320, text: String(text), size: o.size || S.tools.text.size, color: o.color || S.tools.text.color, bold: !!o.bold }),
      addStroke: (points, o = {}) => add({ type: 'stroke', tool: o.tool || 'pen', color: o.color || S.tools.pen.color, width: o.width || S.tools.pen.width, opacity: o.opacity, pts: points.flatMap((q) => [q[0], q[1], q[2] ?? 0.5]) }),
      addShape: (kind, x1, y1, x2, y2, o = {}) => add({ type: 'shape', kind, x1, y1, x2, y2, color: o.color || S.tools.shape.color, width: o.width ?? S.tools.shape.width, fill: o.fill || null }),
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
  runAction(a) { try { a.run(this.api(Editor.currentPageIndex())); } catch (e) { toast('Erro: ' + e.message, 4000); } },
};
