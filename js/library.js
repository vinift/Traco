'use strict';
/* ===== Biblioteca de notas e pastas ===== */
const Library = {
  folder: null, query: '',
  show() {
    $('#editor').classList.add('hidden'); $('#library').classList.remove('hidden'); this.render(); Drive.refreshStatus();
  },
  render() {
    const q = this.query.trim().toLowerCase();
    const crumbs = $('#crumbs'); crumbs.innerHTML = '';
    if (this.folder) { const f = Store.folders.find((x) => x.id === this.folder); crumbs.append(el('a', { onclick: () => { this.folder = null; this.render(); } }, 'Todas as notas'), ' / ', el('b', {}, f ? f.name : '')); }
    else crumbs.append(el('b', {}, q ? 'Resultados da busca' : 'Todas as notas'));
    const fg = $('#folderGrid'); fg.innerHTML = '';
    if (!this.folder && !q) for (const f of Store.folders) {
      const cnt = Object.values(Store.heads).filter((h) => h.folderId === f.id).length;
      const mb = el('button', { class: 'icon-btn', title: 'Opções', onclick: (e) => { e.stopPropagation(); this.folderMenu(mb, f); } }); mb.innerHTML = icon('more');
      fg.append(el('div', { class: 'folder', onclick: () => { this.folder = f.id; this.render(); } }, iconEl('folder'), el('span', { class: 'nm' }, f.name), el('span', { class: 'cnt' }, String(cnt)), mb));
    }
    const ng = $('#noteGrid'); ng.innerHTML = '';
    let heads = Object.values(Store.heads);
    if (q) heads = heads.filter((h) => h.title.toLowerCase().includes(q));
    else heads = heads.filter((h) => (h.folderId || null) === this.folder);
    heads.sort((a, b) => b.updated - a.updated);
    for (const h of heads) {
      const mb = el('button', { class: 'icon-btn', title: 'Opções', onclick: (e) => { e.stopPropagation(); this.noteMenu(mb, h); } }); mb.innerHTML = icon('more');
      const thumb = el('div', { class: 'thumb' }, h.thumb ? el('img', { src: h.thumb, alt: '' }) : null, el('span', { class: 'badge' }, h.mode === 'infinite' ? 'Infinita' : `${h.pages} pág.` + (h.hasPdf ? ' · PDF' : '')));
      ng.append(el('div', { class: 'card', onclick: () => App.openNote(h.id) }, thumb, el('div', { class: 'meta' }, el('div', { class: 't' }, el('div', { class: 'nm' }, h.title), el('div', { class: 'dt' }, fmtDate(h.updated))), mb)));
    }
    $('#libEmpty').classList.toggle('hidden', heads.length > 0 || (!this.folder && !q && Store.folders.length > 0));
  },
  folderMenu(anchor, f) {
    menu(anchor, [
      { label: 'Renomear', icon: 'pen', run: async () => { const n = await askText('Renomear pasta', f.name); if (n) { f.name = n; await Store.saveFolders(); Drive.schedule(); this.render(); } } },
      { label: 'Excluir pasta (as notas vão para "Todas")', icon: 'trash', danger: true, run: async () => {
        if (!(await confirmBox('Excluir pasta', `Excluir a pasta "${f.name}"? As notas dela não serão apagadas.`, 'Excluir', true))) return;
        for (const h of Object.values(Store.heads)) if (h.folderId === f.id) { const n = await Store.getNote(h.id); n.folderId = null; await Store.putNote(n); }
        Store.folders = Store.folders.filter((x) => x.id !== f.id); await Store.saveFolders(); Drive.schedule(); this.render();
      } },
    ]);
  },
  noteMenu(anchor, h) {
    menu(anchor, [
      { label: 'Renomear', icon: 'pen', run: async () => { const t = await askText('Renomear nota', h.title); if (t) { const n = await Store.getNote(h.id); n.title = t; n.updated = Date.now(); await Store.putNote(n); this.render(); } } },
      { label: 'Mover para pasta', icon: 'folder', run: () => this.moveDialog(h) },
      { label: 'Duplicar', icon: 'copy', run: async () => { const n = await Store.getNote(h.id); const c = clone(n); c.id = uid(); c.title = n.title + ' (cópia)'; c.created = c.updated = Date.now(); await Store.putNote(c); await Store.setThumb(c.id, h.thumb); this.render(); } },
      { label: 'Exportar PDF', icon: 'download', run: async () => exportPdfFlow(await Store.getNote(h.id)) },
      '-',
      { label: 'Excluir', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Excluir nota', `Excluir "${h.title}"? No Drive, o arquivo vai para a lixeira.`, 'Excluir', true)) { await Store.deleteNote(h.id); this.render(); } } },
    ]);
  },
  async moveDialog(h) {
    const sel = el('select', {}, el('option', { value: '' }, '— Sem pasta —'), ...Store.folders.map((f) => el('option', { value: f.id }, f.name)));
    sel.value = h.folderId || '';
    const ok = await openModal({ title: 'Mover para pasta', body: el('div', { class: 'field' }, el('label', {}, 'Pasta'), sel), buttons: [{ label: 'Cancelar', value: false }, { label: 'Mover', cls: 'primary', value: true }] });
    if (!ok) return; const n = await Store.getNote(h.id); n.folderId = sel.value || null; await Store.putNote(n); this.render();
  },
  async newFolder() { const n = await askText('Nova pasta', '', 'Nome da pasta (ex.: Direito Penal I)'); if (!n) return; Store.folders.push({ id: uid(), name: n }); await Store.saveFolders(); Drive.schedule(); this.render(); },
  async importPdf() {
    const f = await pickFile('application/pdf'); if (!f) return;
    toast('Importando PDF…', 10000);
    try {
      const pages = await importPdfFile(f);
      const note = newNote({ title: f.name.replace(/\.pdf$/i, ''), folderId: this.folder, mode: 'pages', template: { ...Store.settings.template, type: 'blank' } });
      note.pages = pages; await Store.putNote(note); toast(`PDF importado: ${pages.length} página(s)`);
      App.openNote(note.id);
    } catch (e) { console.error(e); toast('Não foi possível abrir o PDF: ' + e.message, 5000); }
  },
};

/* ===== Configurações ===== */
async function openSettings(focus) {
  const S = Store.settings, D = S.drive;
  const body = el('div', {});
  // --- Drive
  const cid = el('input', { type: 'text', value: D.clientId || '', placeholder: 'xxxxxxxx.apps.googleusercontent.com' });
  const sec = el('input', { type: 'password', value: D.clientSecret || '', placeholder: 'Opcional — evita ter que reconectar a cada hora' });
  const auto = el('input', { type: 'checkbox' }); auto.checked = D.enabled !== false;
  const status = el('p', {}, Drive.configured() ? (Drive.hasAuth() ? '✅ Conectado.' : '⚠️ Configurado, mas precisa conectar.') + (D.lastSync ? ' Último backup: ' + new Date(D.lastSync).toLocaleString('pt-BR') : '') : 'Backup no Drive desligado.');
  const saveDrive = () => { const changed = cid.value.trim() !== D.clientId || sec.value.trim() !== (D.clientSecret || ''); D.clientId = cid.value.trim(); D.clientSecret = sec.value.trim(); D.enabled = auto.checked && !!D.clientId; if (changed) { delete D.refreshToken; Drive.token = null; } Store.saveSettings.flush(); Drive.refreshStatus(); };
  const B = (label, cls, fn) => el('button', { class: 'btn ' + cls, onclick: fn }, label);
  const driveSec = el('div', { class: 'set-sec', id: 'set-drive' }, el('h3', {}, 'Backup automático no Google Drive'),
    el('p', {}, 'Suas notas ficam salvas no tablet e são copiadas automaticamente para a pasta "Traço Notas" do seu Drive alguns segundos depois de cada alteração. O Drive guarda o histórico de versões de cada arquivo.'),
    !Drive.canUse() ? el('p', { style: { color: 'var(--danger)' } }, 'Atenção: o backup só funciona quando o app está hospedado em um endereço https (veja o guia de instalação).') : null,
    el('div', { class: 'field' }, el('label', {}, 'Client ID (OAuth do Google Cloud)'), cid),
    el('div', { class: 'field' }, el('label', {}, 'Client Secret (opcional, recomendado)'), sec),
    el('div', { class: 'field' }, el('label', {}, 'URI de redirecionamento e origem para cadastrar no Google Cloud'), el('code', { class: 'k' }, Drive.redirectUri()), el('code', { class: 'k' }, location.origin)),
    el('label', { class: 'chk', style: { marginBottom: '10px' } }, auto, 'Backup automático ligado'),
    status,
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      B('Salvar e conectar', 'primary', () => { saveDrive(); if (D.clientId) Drive.connect(); else toast('Informe o Client ID'); }),
      B('Fazer backup agora', '', () => { saveDrive(); Drive.sync(true); }),
      B('Restaurar do Drive', '', async () => {
        saveDrive(); if (!(await confirmBox('Restaurar do Drive', 'Baixar as notas do Drive? Notas que estão mais novas no Drive substituem as do tablet; as demais ficam como estão.', 'Restaurar'))) return;
        try { const n = await Drive.restore((i, t) => toast(`Restaurando… ${i}/${t}`, 4000)); toast(`${n} nota(s) restauradas`); Library.render(); } catch (e) { toast(e.needAuth ? 'Conecte o Drive primeiro' : 'Erro: ' + e.message, 5000); }
      }),
      Drive.hasAuth() ? B('Desconectar', 'ghost danger', () => { Drive.disconnect(); toast('Drive desconectado'); }) : null));
  body.append(driveSec);
  // --- Escrita
  const chk = (label, key, after) => UI.check(label, S[key], (v) => { S[key] = v; Store.saveSettings(); after && after(v); });
  const pb = el('select', {}, el('option', { value: 'eraser' }, 'Borracha'), el('option', { value: 'lasso' }, 'Laço'), el('option', { value: 'none' }, 'Nada')); pb.value = S.penButton || 'eraser'; pb.addEventListener('change', () => { S.penButton = pb.value; Store.saveSettings(); });
  const th = el('select', {}, el('option', { value: 'auto' }, 'Automático'), el('option', { value: 'light' }, 'Claro'), el('option', { value: 'dark' }, 'Escuro')); th.value = S.theme || 'auto'; th.addEventListener('change', () => { S.theme = th.value; Store.saveSettings(); App.applyTheme(); });
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Escrita e caneta'),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      chk('Ignorar a palma da mão (toques são ignorados enquanto a caneta está perto da tela)', 'palmGuard'),
      chk('Escrever com o dedo (o mesmo que o botão de mão no editor)', 'fingerDraws'),
      chk('Sensibilidade à pressão da caneta', 'pressure'),
      chk('Reconhecer formas ao segurar a caneta parada no fim do traço', 'shapeHold'),
      UI.check('Modo de baixa latência (desligue se a tinta piscar ou aparecer atrás do papel)', S.lowLatency !== false, (v) => { S.lowLatency = v; Store.saveSettings(); toast('Reabra o app para aplicar'); }),
      UI.slider('Suavização do traço', 0, 0.9, 0.05, S.stabilizer, (v) => { S.stabilizer = v; Store.saveSettings(); }, (v) => Math.round(v * 100) + '%'),
      el('div', { class: 'row' }, el('div', { class: 'field' }, el('label', {}, 'Botão lateral da caneta'), pb), el('div', { class: 'field' }, el('label', {}, 'Tema do app'), th)))));
  // --- Modelo padrão
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Modelo padrão para novas notas'),
    el('button', { class: 'btn', onclick: async () => {
      const te = templateEditor(S.template);
      const ok = await openModal({ title: 'Modelo padrão', body: te.el, wide: true, buttons: [{ label: 'Cancelar', value: false }, { label: 'Salvar', cls: 'primary', value: true }] });
      if (ok) { S.template = te.get(); Store.saveSettings(); toast('Modelo padrão salvo'); }
    } }, 'Editar modelo padrão')));
  // --- Plugins
  const plist = el('div', {});
  const renderPlugins = () => {
    plist.innerHTML = '';
    for (const p of S.plugins) {
      const t = el('input', { type: 'checkbox' }); t.checked = p.enabled;
      t.addEventListener('change', () => { p.enabled = t.checked; Store.saveSettings(); Plugins.loadAll(); renderPlugins(); });
      const err = Plugins.errors[p.id];
      plist.append(el('div', { class: 'plugin-row' }, t, el('span', { class: 'nm' }, p.name, err ? el('div', { style: { color: 'var(--danger)', fontSize: '12px' } }, 'Erro: ' + err) : null),
        B('Editar', 'ghost', () => editPlugin(p).then(renderPlugins)),
        B('Excluir', 'ghost danger', async () => { if (await confirmBox('Excluir plugin', `Excluir "${p.name}"?`, 'Excluir', true)) { S.plugins = S.plugins.filter((x) => x !== p); Store.saveSettings(); Plugins.loadAll(); renderPlugins(); } })));
    }
    if (!S.plugins.length) plist.append(el('p', {}, 'Nenhum plugin instalado.'));
  };
  renderPlugins();
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Ferramentas próprias (plugins)'),
    el('p', {}, 'Crie suas próprias ferramentas em JavaScript. Elas aparecem na barra do editor. Use apenas código que você escreveu ou em que confia.'),
    plist,
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
      B('Novo plugin', 'primary', () => editPlugin(null).then(renderPlugins)),
      B('Carregar arquivo .js', '', async () => { const f = await pickFile('.js,text/javascript'); if (!f) return; S.plugins.push({ id: uid(), name: f.name.replace(/\.js$/, ''), code: await f.text(), enabled: true }); Store.saveSettings(); Plugins.loadAll(); renderPlugins(); }),
      B('Como criar (API)', 'ghost', () => openModal({ title: 'API de plugins', wide: true, body: el('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '12.5px' } }, PLUGIN_DOC), buttons: [{ label: 'Fechar', cls: 'primary' }] })))));
  // --- Backup local
  body.append(el('div', { class: 'set-sec' }, el('h3', {}, 'Cópia local'),
    el('p', {}, 'Um arquivo único com todas as notas, imagens e PDFs, para guardar onde quiser ou levar para outro aparelho.'),
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, B('Exportar tudo', '', exportAll), B('Importar arquivo de backup', '', importAll))));
  body.append(el('p', { class: 'lbl-sm', style: { textAlign: 'center' } }, 'Traço Notas · versão ' + App.version));
  const done = openModal({ title: 'Configurações', body, wide: true, buttons: [{ label: 'Fechar', cls: 'primary', action: () => { saveDrive(); if (Editor.note) { UI.buildToolbar(); UI.renderOptions(); } } }] });
  if (focus === 'drive') setTimeout(() => cid.focus(), 80);
  return done;
}
async function editPlugin(p) {
  const S = Store.settings;
  const name = el('input', { type: 'text', value: p ? p.name : 'Minha ferramenta' });
  const code = el('textarea', { spellcheck: 'false' }); code.value = p ? p.code : `Traco.registerTool({
  id: 'minha-ferramenta', name: 'Minha ferramenta', icon: '✨',
  hint: 'Toque na página',
  onUp(p, api) {
    api.addShape('ellipse', p.x - 10, p.y - 10, p.x + 10, p.y + 10, { color: '#dc2626', width: 2 });
  }
});`;
  code.style.height = '320px';
  const ok = await openModal({ title: p ? 'Editar plugin' : 'Novo plugin', wide: true, body: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Nome'), name), el('div', { class: 'field' }, el('label', {}, 'Código'), code), el('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '11.5px', color: 'var(--muted)' } }, PLUGIN_DOC)), buttons: [{ label: 'Cancelar', value: false }, { label: 'Salvar', cls: 'primary', value: true }] });
  if (!ok) return;
  if (p) { p.name = name.value; p.code = code.value; } else S.plugins.push({ id: uid(), name: name.value, code: code.value, enabled: true });
  Store.saveSettings(); Plugins.loadAll();
  const target = p || S.plugins[S.plugins.length - 1];
  toast(Plugins.errors[target.id] ? 'Plugin com erro: ' + Plugins.errors[target.id] : 'Plugin salvo', 4000);
}
async function exportAll() {
  toast('Preparando cópia…', 6000);
  const notes = await DB.all('notes'); const blobs = {};
  for (const k of await DB.keys('blobs')) { const b = await DB.get('blobs', k); if (b) blobs[k] = await blobToDataURL(b); }
  const data = { app: 'traco-notas', v: 1, exported: Date.now(), folders: Store.folders, notes, blobs, thumbs: Object.fromEntries(Object.values(Store.heads).map((h) => [h.id, h.thumb])) };
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `traco-backup-${new Date().toISOString().slice(0, 10)}.json`);
}
async function importAll() {
  const f = await pickFile('application/json,.json'); if (!f) return;
  try {
    const data = JSON.parse(await f.text()); if (data.app !== 'traco-notas') throw new Error('arquivo não é um backup do Traço');
    for (const [k, v] of Object.entries(data.blobs || {})) { await DB.put('blobs', dataURLToBlob(v), k); Store.dirty.blobs[k] = 1; }
    for (const fo of data.folders || []) if (!Store.folders.find((x) => x.id === fo.id)) Store.folders.push(fo);
    await Store.saveFolders();
    let n = 0;
    for (const note of data.notes || []) { const h = Store.heads[note.id]; if (!h || note.updated > h.updated) { await Store.putNote(note); if (data.thumbs && data.thumbs[note.id]) await Store.setThumb(note.id, data.thumbs[note.id]); n++; } }
    toast(`${n} nota(s) importadas`); Library.render();
  } catch (e) { toast('Erro ao importar: ' + e.message, 5000); }
}
