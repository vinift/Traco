'use strict';
/* ===== v0.29 — qualidade do PDF e abrir PDFs de fora =====
   • pdfQualityAsk(): escolha da qualidade a cada exportação/compartilhamento (lembra a última em S.pdfQuality).
   • PdfOpen: o Traço como app para abrir PDFs — "Abrir com" (manifest file_handlers + launchQueue) e "Compartilhar para"
     (manifest share_target → o service worker guarda o arquivo no cache 'traco-inbox' e abre ./?recebido=1).
     Abre a página "Abrir PDF": nota nova (nome + pasta, com criar pasta) ou inserir no fim de uma nota existente. */

const PDF_QUALITIES = [
  { k: 'leve', name: 'Leve', desc: 'Arquivo pequeno, bom para mandar no WhatsApp (150 dpi)', opts: { dpi: 150, jpegQ: 0.85, maxPx: 3000 } },
  { k: 'normal', name: 'Normal', desc: 'Nítido na tela e no papel (300 dpi)', opts: { dpi: 300, jpegQ: 0.93, maxPx: 6000 } },
  { k: 'alta', name: 'Alta', desc: 'Mais detalhe nos traços finos (400 dpi, quase sem perda)', opts: { dpi: 400, jpegQ: 0.97, maxPx: 7000 } },
  { k: 'max', name: 'Máxima', desc: 'Impressão: imagem sem perda (450 dpi, PNG) — arquivo grande e mais lento', opts: { dpi: 450, png: true, maxPx: 7000 } },
  { k: 'ultra', name: 'Ultra', desc: 'O mais nítido: 600 dpi sem perda (PNG, desenhado em faixas) — arquivo muito grande e bem mais lento', opts: { dpi: 600, png: true, maxPx: 9000 } }, /* v0.57 */
];
function pdfQualityAsk(share) {
  const S = Store.settings; let cur = S.pdfQuality || 'normal';
  const list = el('div', { class: 'pq-list' });
  const paint = () => [...list.children].forEach((b) => b.classList.toggle('on', b.dataset.k === cur));
  for (const q of PDF_QUALITIES) list.append(el('button', { class: 'pq-item', 'data-k': q.k, onclick: () => { cur = q.k; paint(); } }, el('b', {}, q.name), el('small', {}, q.desc)));
  paint();
  return openModal({ title: share ? 'Compartilhar PDF' : 'Exportar PDF', body: el('div', {}, el('p', { class: 'lbl-sm' }, 'Qualidade das páginas e da escrita (as páginas de PDFs importados continuam iguais ao original):'), list), buttons: [
    { label: 'Cancelar', value: null },
    { label: share ? 'Gerar e compartilhar' : 'Gerar PDF', cls: 'primary', action: () => { S.pdfQuality = cur; Store.saveSettings(); return PDF_QUALITIES.find((q) => q.k === cur); } },
  ] }).then((v) => v || null);
}

const PdfOpen = {
  init() {
    /* "Abrir com Traço" (Android/Chrome entrega o arquivo pela launchQueue) */
    if ('launchQueue' in window) launchQueue.setConsumer(async (p) => { for (const h of (p && p.files) || []) { try { const f = await h.getFile(); if (f) await this.open(f); } catch (e) { console.warn('abrir arquivo', e); } } });
    /* "Compartilhar para Traço": o service worker guardou o arquivo no cache */
    if (/[?&]recebido=/.test(location.search)) { history.replaceState(null, '', location.pathname); setTimeout(() => this.inbox(), 300); }
  },
  async inbox() {
    try {
      const c = await caches.open('traco-inbox'), keys = await c.keys();
      for (const r of keys) { const res = await c.match(r); await c.delete(r); if (!res) continue; const b = await res.blob(), name = decodeURIComponent(res.headers.get('x-name') || 'documento.pdf'); await this.open(new File([b], name, { type: b.type || 'application/pdf' })); }
    } catch (e) { console.warn('caixa de entrada', e); toast('Não consegui abrir o arquivo recebido: ' + e.message, 4000); }
  },
  /* página "Abrir PDF": escolher o caminho */
  async open(file) {
    if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) return toast('Por enquanto o Traço abre só PDF', 2600);
    const title0 = file.name.replace(/\.pdf$/i, '');
    let mode = 'new', folder = Library.folder || null, target = null, q = '';
    const box = el('div', { class: 'po' });
    const render = () => {
      box.innerHTML = '';
      const tab = (k, n) => el('button', { class: 'po-tab' + (mode === k ? ' on' : ''), onclick: () => { mode = k; render(); } }, n);
      box.append(el('div', { class: 'po-file' }, iconEl('file'), el('span', {}, file.name), el('small', {}, Math.max(1, Math.round(file.size / 1024)) + ' KB')), el('div', { class: 'po-tabs' }, tab('new', 'Nota nova'), tab('add', 'Inserir em nota existente')));
      if (mode === 'new') {
        const name = el('input', { class: 'po-name', value: box._name ?? title0, oninput: () => { box._name = name.value; } });
        const tree = el('div', { class: 'po-list' });
        const row = (id, label, depth) => el('button', { class: 'po-row' + (folder === id ? ' on' : ''), style: { paddingLeft: 10 + depth * 18 + 'px' }, onclick: () => { folder = id; render(); } }, iconEl(id ? 'folder' : 'home'), el('span', {}, label));
        tree.append(row(null, 'Início (sem pasta)', 0));
        const walk = (pid, d) => { for (const f of Store.folders.filter((x) => (x.parentId || null) === pid && !x.deleted).sort((a, b) => a.name.localeCompare(b.name))) { tree.append(row(f.id, f.name, d)); walk(f.id, d + 1); } };
        walk(null, 1);
        const addF = el('button', { class: 'btn ghost', onclick: async () => { const n = await askText('Nova pasta' + (folder ? ' dentro de "' + ((Store.folders.find((f) => f.id === folder) || {}).name || '') + '"' : ''), ''); if (!n) return; const f = { id: uid(), name: n, parentId: folder, color: FOLDER_COLORS[Store.folders.length % FOLDER_COLORS.length], created: Date.now() }; Store.folders.push(f); await Store.saveFolders(); Drive.schedule(); folder = f.id; render(); } }, '+ Nova pasta aqui');
        box.append(el('label', { class: 'lbl-sm' }, 'Nome da nota'), name, el('label', { class: 'lbl-sm' }, 'Pasta'), tree, addF);
      } else {
        const s = el('input', { class: 'po-name', placeholder: 'Buscar nota…', value: q, oninput: () => { q = s.value; fill(); } });
        const list = el('div', { class: 'po-list' });
        const fill = () => {
          list.innerHTML = ''; const nq = q.trim().toLowerCase();
          const heads = Object.values(Store.heads).filter((h) => !h.deleted && h.mode !== 'infinite' && (!nq || (h.title || '').toLowerCase().includes(nq))).sort((a, b) => b.updated - a.updated).slice(0, 80);
          for (const h of heads) { const fname = h.folderId ? (Store.folders.find((f) => f.id === h.folderId) || {}).name : ''; const b = el('button', { class: 'po-row' + (target === h.id ? ' on' : '') }, iconEl('file'), el('span', {}, h.title || 'Sem título'), el('small', {}, (fname ? fname + ' · ' : '') + (h.pages || 0) + ' pág.')); b.onclick = () => { target = h.id; [...list.children].forEach((x) => x.classList.toggle('on', x === b)); }; list.append(b); }
          if (!heads.length) list.append(el('p', { class: 'lbl-sm' }, 'Nenhuma nota encontrada.'));
        };
        fill(); box.append(s, list, el('p', { class: 'lbl-sm' }, 'As páginas do PDF entram no fim da nota escolhida (dá para desfazer).'));
      }
    };
    render();
    const ok = await openModal({ title: 'Abrir PDF no Traço', body: box, wide: true, buttons: [{ label: 'Cancelar', value: false }, { label: 'Abrir', cls: 'primary', action: () => { if (mode === 'add' && !target) { toast('Escolha a nota', 1500); return false; } return true; } }] });
    if (!ok) return;
    toast('Importando PDF…', 15000);
    try {
      const pages = await importPdfFile(file);
      if (mode === 'new') {
        const note = newNote({ title: (box._name ?? title0).trim() || title0, folderId: folder, mode: 'pages', template: { ...Store.settings.template, type: 'blank' } });
        note.pages = pages; await Store.putNote(note); toast(`PDF aberto: ${pages.length} página(s)`, 2000);
        Library.folder = folder; Library.view = 'home'; await App.openNote(note.id);
      } else {
        let first;
        if (Editor.note && Editor.note.id === target) { first = Editor.note.pages.length; Editor.recPages(() => Editor.note.pages.push(...pages)); Editor.afterPagesChanged(); }
        else { const n = await Store.getNote(target); if (!n) throw new Error('nota não encontrada'); first = n.pages.length; n.pages.push(...pages); n.updated = Date.now(); await Store.putNote(n); await App.openNote(target); }
        setTimeout(() => Editor.goToPage(first), 120); toast(`${pages.length} página(s) inseridas no fim`, 2000);
      }
    } catch (e) { console.error(e); toast('Erro ao abrir o PDF: ' + e.message, 5000); }
  },
};
