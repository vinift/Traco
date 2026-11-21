'use strict';
/* ===== v0.30 — tela de exportar (estilo Notewise), PDFs recentes e menu "⋯" da nota =====
   • ExportPanel.open(note, {share}): nota inteira ou páginas específicas (miniaturas com ✓, intervalo "2-5, 8", selecionar tudo),
     exportar como PDF ou imagens, qualidade (PDF_QUALITIES de pdfopen.js), e os PDFs gerados há pouco para compartilhar de novo.
   • RecentPdfs: os últimos PDFs gerados ficam no cache 'traco-recent-pdf' (não vão para o Drive), até 8 arquivos / 80 MB.
   • NoteMenu.open(âncora): menu do "⋯" no topo direito (cabeçalho da nota, Exportar/Renomear/Marcar, mover, ir para página, sumário,
     modelo, zoom, configurações, detalhes, excluir). Assim o topo fica com menos botões. */

const RecentPdfs = {
  C: 'traco-recent-pdf', MAX: 8, MAXB: 80 * 1024 * 1024,
  async list() {
    try { const c = await caches.open(this.C), out = []; for (const r of await c.keys()) { const res = await c.match(r); if (!res) continue; out.push({ key: r.url, name: decodeURIComponent(res.headers.get('x-name') || 'nota.pdf'), at: +res.headers.get('x-at') || 0, size: +res.headers.get('content-length') || +res.headers.get('x-size') || 0, note: res.headers.get('x-note') || '', type: res.headers.get('content-type') || 'application/pdf' }); } return out.sort((a, b) => b.at - a.at); }
    catch (_) { return []; }
  },
  async add(blob, name, noteId) {
    try {
      const c = await caches.open(this.C), at = Date.now();
      await c.put('./recent/' + at, new Response(blob, { headers: { 'content-type': blob.type || 'application/pdf', 'x-name': encodeURIComponent(name), 'x-at': String(at), 'x-size': String(blob.size), 'x-note': noteId || '' } }));
      const all = await this.list(); let tot = 0;
      for (const [i, f] of all.entries()) { tot += f.size; if (i >= this.MAX || tot > this.MAXB) await c.delete(f.key); }
    } catch (e) { console.warn('recentes', e); }
  },
  async file(f) { const res = await (await caches.open(this.C)).match(f.key); if (!res) return null; const b = await res.blob(); return new File([b], f.name, { type: f.type }); },
  async remove(f) { try { await (await caches.open(this.C)).delete(f.key); } catch (_) {} },
};

/* "2-5, 8" → conjunto de índices (0 a n-1) */
function parsePageRange(txt, n) {
  const out = new Set(); for (const part of String(txt).split(/[,;\s]+/)) { if (!part) continue; const m = part.match(/^(\d+)(?:-(\d+))?$/); if (!m) continue; let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a]; for (let i = Math.max(1, a); i <= Math.min(n, b); i++) out.add(i - 1); } return out;
}
function rangeText(sel, n) { const a = [...sel].sort((x, y) => x - y), parts = []; for (let i = 0; i < a.length; i++) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; parts.push(i === j ? String(a[i] + 1) : a[i] + 1 + '-' + (a[j] + 1)); i = j; } return parts.join(', '); }
function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
function fmtWhen(t) { const d = Date.now() - t; if (d < 60000) return 'agora'; if (d < 3600000) return Math.round(d / 60000) + ' min atrás'; if (d < 86400000) return Math.round(d / 3600000) + ' h atrás'; return new Date(t).toLocaleDateString('pt-BR'); }

const ExportPanel = {
  async open(note, { share = false } = {}) {
    if (!note) return;
    if (Editor.note && Editor.note.id === note.id) { try { await Editor.saveNow(); } catch (_) {} note = Editor.note; }
    const S = Store.settings, n = note.pages.length, cur = Editor.note === note ? Editor.currentPageIndex() : 0;
    let scope = 'all', sel = new Set(note.pages.map((_, i) => i)), fmt = S.exportFmt || 'pdf', q = S.pdfQuality || 'normal';
    const box = el('div', { class: 'xp' });
    const head = Store.heads[note.id] || {};
    const cimg = el('img', { src: head.thumb || '', alt: '' }); if (!head.thumb && note.pages[0]) pageThumb(note, note.pages[0]).then((u) => (cimg.src = u)).catch(() => {});
    const card = el('div', { class: 'xp-card' }, cimg, el('div', {}, el('b', {}, note.title || 'Nota'), el('small', {}, n + (n === 1 ? ' página' : ' páginas'))));
    const tabs = el('div', { class: 'xp-tabs' });
    const strip = el('div', { class: 'xp-strip' }), range = el('input', { class: 'xp-range', placeholder: 'Intervalo de páginas, ex.: 2-5, 8', inputmode: 'numeric' });
    const allSw = el('input', { type: 'checkbox' });
    const pages = el('div', { class: 'xp-pages' }, strip, el('div', { class: 'xp-box' }, range, el('label', { class: 'xp-row' }, el('span', {}, 'Selecionar tudo'), el('span', { class: 'xp-switch' }, allSw, el('i')))));
    const thumbs = [];
    const paintSel = () => { thumbs.forEach((t, i) => t.classList.toggle('on', sel.has(i))); allSw.checked = sel.size === n; if (document.activeElement !== range) range.value = sel.size === n ? '' : rangeText(sel, n); go.textContent = label(); };
    /* v0.30.1: miniaturas carregadas aos poucos (só as perto da tela, uma por vez). A faixa rola de forma nativa
       (a rolagem própria da v0.30.1–v0.30.3 foi desfeita na v0.30.4: o problema relatado era na tela de páginas). */
    const toggle = (i) => { sel.has(i) ? sel.delete(i) : sel.add(i); paintSel(); };
    const queue = [], pending = new Set(); let busyT = false;
    const pump = async () => { if (busyT) return; busyT = true; while (queue.length && box.isConnected !== false) { const i = queue.shift(); try { thumbs[i]._img.src = await pageThumb(note, note.pages[i]); } catch (_) {} } busyT = false; };
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const en of es) if (en.isIntersecting) { const i = +en.target.dataset.i; if (!pending.has(i)) { pending.add(i); queue.push(i); io.unobserve(en.target); } } queue.sort((a, b) => a - b); pump(); }, { root: strip, rootMargin: '0px 700px' }) : null;
    note.pages.forEach((p, i) => {
      const img = el('img', { alt: '', draggable: 'false' }), t = el('button', { class: 'xp-th' + (i === cur ? ' cur' : ''), 'data-i': i, onclick: () => toggle(i), style: { width: Math.round((150 * (p.w || 1000)) / (p.h || 1414)) + 'px' } }, img, el('span', { class: 'xp-ck' }, '✓'));
      t._img = img; thumbs.push(t); strip.append(el('div', { class: 'xp-thw' }, t, el('small', {}, String(i + 1))));
      if (io) io.observe(t); else if (i < 40) { queue.push(i); }
    });
    if (!io) pump();
    strip.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    range.addEventListener('input', () => { const s = parsePageRange(range.value, n); if (s.size) { sel = s; paintSel(); } });
    allSw.addEventListener('change', () => { sel = allSw.checked ? new Set(note.pages.map((_, i) => i)) : new Set([cur]); paintSel(); });
    const setScope = (k) => { scope = k; [...tabs.children].forEach((b) => b.classList.toggle('on', b.dataset.k === k)); pages.style.display = k === 'some' ? '' : 'none'; if (k === 'all') sel = new Set(note.pages.map((_, i) => i)); else if (sel.size === n) sel = new Set([cur]); paintSel(); setTimeout(() => thumbs[cur] && thumbs[cur].scrollIntoView({ inline: 'center', block: 'nearest' }), 30); };
    for (const [k, nm] of [['all', 'Nota inteira'], ['some', 'Páginas específicas']]) tabs.append(el('button', { class: 'xp-tab', 'data-k': k, onclick: () => setScope(k) }, nm));
    /* formato */
    const fmts = el('div', { class: 'xp-fmts' });
    const paintFmt = () => { [...fmts.children].forEach((b) => b.classList.toggle('on', b.dataset.k === fmt)); qrow.style.display = fmt === 'pdf' ? '' : 'none'; go.textContent = label(); };
    for (const [k, ic, nm] of [['pdf', 'file', 'PDF'], ['img', 'image', 'Imagens']]) { const b = el('button', { class: 'xp-fmt', 'data-k': k, onclick: () => { fmt = k; paintFmt(); } }); b.append(iconEl(ic), el('span', {}, nm)); fmts.append(b); }
    /* qualidade */
    const qrow = el('div', { class: 'xp-q' });
    const paintQ = () => [...qrow.children].forEach((b) => b.classList.toggle('on', b.dataset.k === q));
    for (const x of PDF_QUALITIES) qrow.append(el('button', { class: 'xp-chip', 'data-k': x.k, title: x.desc, onclick: () => { q = x.k; paintQ(); qhint.textContent = x.desc; } }, x.name));
    const qhint = el('small', { class: 'xp-hint' }, (PDF_QUALITIES.find((x) => x.k === q) || {}).desc || '');
    /* recentes */
    const rec = el('div', { class: 'xp-rec' });
    const fillRec = async () => {
      const list = await RecentPdfs.list(); rec.innerHTML = ''; if (!list.length) return;
      rec.append(el('div', { class: 'xp-sec' }, 'Gerados recentemente'));
      for (const f of list.slice(0, 5)) {
        const sh = el('button', { class: 'xp-mini primary', title: 'Compartilhar de novo' }), sv = el('button', { class: 'xp-mini', title: 'Salvar de novo' });
        sh.append(iconEl('external')); sv.append(iconEl('download'));
        let file = null; RecentPdfs.file(f).then((x) => (file = x));
        sh.onclick = () => { if (!file) return toast('Carregando…', 800); const fl = { files: [file], title: f.name }; if (navigator.canShare && navigator.canShare(fl)) navigator.share(fl).catch((e) => e && e.name !== 'AbortError' && toast('Não deu para compartilhar: ' + e.message, 3000)); else { downloadBlob(file, f.name); toast('Salvo em Downloads', 1500); } };
        sv.onclick = () => { if (file) { downloadBlob(file, f.name); toast('Salvo em Downloads', 1500); } };
        rec.append(el('div', { class: 'xp-ritem' }, iconEl('file'), el('div', {}, el('b', {}, f.name), el('small', {}, fmtWhen(f.at) + ' · ' + fmtSize(f.size))), sv, sh));
      }
    };
    fillRec();
    const label = () => (sel.size ? (fmt === 'pdf' ? 'PDF' : 'imagens') + ' · ' + (sel.size === n ? 'nota inteira' : sel.size + (sel.size === 1 ? ' página' : ' páginas')) : 'nenhuma página');
    const go = el('div', { class: 'xp-sum' });
    box.append(tabs, card, pages, el('div', { class: 'xp-sec' }, 'Exportar como'), fmts, el('div', { class: 'xp-qw' }, qrow, qhint), go, rec);
    setScope(scope); paintFmt(); paintQ();
    const act = await openModal({ title: share ? 'Compartilhar' : 'Exportar', body: box, wide: true, buttons: [
      { label: 'Cancelar', value: null },
      { label: 'Salvar', action: () => (sel.size ? 'save' : (toast('Escolha ao menos uma página', 1500), false)) },
      { label: 'Compartilhar', cls: 'primary', action: () => (sel.size ? 'share' : (toast('Escolha ao menos uma página', 1500), false)) },
    ] });
    if (!act) return;
    S.exportFmt = fmt; S.pdfQuality = q; Store.saveSettings();
    const idx = [...sel].sort((a, b) => a - b), sub = idx.length === n ? note : { ...note, pages: idx.map((i) => note.pages[i]) };
    const base = safeName(note.title) + (idx.length === n ? '' : ' (pág. ' + rangeText(sel, n) + ')');
    try {
      if (fmt === 'pdf') {
        const blob = await exportNotePdf(sub, (i, t) => toast(`Gerando PDF… ${i}/${t}`, 4000), (PDF_QUALITIES.find((x) => x.k === q) || PDF_QUALITIES[1]).opts);
        const name = base + '.pdf'; await RecentPdfs.add(blob, name, note.id);
        if (act === 'share') return sharePdfReady(blob, name, note.title);
        downloadBlob(blob, name); toast('PDF salvo em Downloads (também fica em "Gerados recentemente")', 2600);
      } else {
        const files = [];
        for (const [k, i] of idx.entries()) { toast(`Gerando imagens… ${k + 1}/${idx.length}`, 4000); const cv = await renderPageCanvas(note, note.pages[i], 2); const b = await new Promise((r) => cv.toBlob(r, 'image/png')); cv.width = cv.height = 0; files.push(new File([b], base + ' - página ' + (i + 1) + '.png', { type: 'image/png' })); }
        if (act === 'share') return shareFilesReady(files, note.title);
        for (const f of files) downloadBlob(f, f.name); toast(files.length + ' imagem(ns) salvas em Downloads', 2200);
      }
    } catch (e) { console.error(e); toast('Erro ao exportar: ' + e.message, 5000); }
  },
};
/* várias imagens: a janela "pronto" garante o toque recente que o Android exige para compartilhar */
function shareFilesReady(files, title) {
  const can = !!(navigator.share && navigator.canShare && navigator.canShare({ files }));
  if (!can) { for (const f of files) downloadBlob(f, f.name); return toast('Este aparelho não deixou compartilhar direto: salvei em Downloads', 3500); }
  return openModal({ title: 'Imagens prontas', body: el('p', {}, files.length + (files.length === 1 ? ' imagem' : ' imagens')), buttons: [
    { label: 'Salvar', action: () => { for (const f of files) downloadBlob(f, f.name); return true; } },
    { label: 'Compartilhar', cls: 'primary', action: () => { navigator.share({ files, title }).catch((e) => e && e.name !== 'AbortError' && toast('Não deu para compartilhar: ' + e.message, 3000)); return true; } },
  ] });
}

const NoteMenu = {
  open(anchor) {
    const note = Editor.note; if (!note) return;
    const h = Store.heads[note.id] || {}, folder = note.folderId ? (Store.folders.find((f) => f.id === note.folderId) || {}).name : '';
    const pg = Editor.note.pages[Editor.currentPageIndex()] || {};
    const close = () => closePop();
    const himg = el('img', { src: h.thumb || '', alt: '' }); if (!h.thumb && note.pages[0]) pageThumb(note, note.pages[0]).then((u) => (himg.src = u)).catch(() => {});
    const big = (ic, nm, fn, on) => { const b = el('button', { class: 'nm-big' + (on ? ' on' : ''), onclick: () => { close(); fn(); } }); b.append(iconEl(ic), el('span', {}, nm)); return b; };
    const item = (ic, nm, fn, sub, cls = '') => { const b = el('button', { class: 'nm-item ' + cls, onclick: () => { close(); fn(); } }); b.append(iconEl(ic), el('span', {}, nm, sub ? el('small', {}, sub) : null)); return b; };
    const box = el('div', { class: 'nmenu' },
      el('div', { class: 'nm-head' }, himg, el('div', {}, el('b', {}, note.title || 'Nota'), el('small', {}, (note.mode === 'infinite' ? 'tela infinita' : note.pages.length + (note.pages.length === 1 ? ' página' : ' páginas')) + (folder ? ' · ' + folder : '')))),
      el('div', { class: 'nm-bigs' },
        big('external', 'Exportar', () => ExportPanel.open(Editor.note)),
        big('edit', 'Renomear', async () => { const t = await askText('Renomear nota', note.title); if (t) { note.title = t; $('#noteTitle').value = t; Editor.markChanged(); } }),
        big('bookmark', pg.bookmark ? 'Desmarcar' : 'Marcar página', () => Editor.toggleBookmark(), pg.bookmark)),
      el('div', { class: 'nm-list' },
        item('folder', 'Mover para', async () => { const d = await Library.folderPicker('Mover nota', new Set(), note.folderId); if (d === undefined) return; note.folderId = d; Editor.markChanged(); toast('Nota movida', 1200); }, folder || 'Início'),
        note.mode === 'infinite' ? item('home', 'Voltar ao centro', () => Editor.goHome(), 'volta ao ponto onde a tela começa') : null,
        note.mode !== 'infinite' ? item('pages', 'Vá para página', () => GoPage.open(anchor), 'página ' + (Editor.currentPageIndex() + 1) + ' de ' + note.pages.length) : null,
        item('list', 'Sumário', () => Outline.open(anchor), 'marcadores e índice do PDF'),
        item('grid', 'Alterar modelo', () => templateModal()),
        item('search', 'Zoom', () => zoomMenu(anchor), Math.round(Editor.cam.z * 100) + '%'),
        item('settings', 'Definições', () => openSettings()),
        item('tune', 'Detalhes', () => noteDetails(note)),
        item('refresh', 'Verificar atualização', () => App.checkUpdate(null), 'volta nesta mesma página · v' + App.version),
        el('div', { class: 'nm-sep' }),
        item('trash', 'Excluir nota', async () => { if (!(await confirmBox('Excluir nota', `Mandar "${note.title}" para a Lixeira? (30 dias para restaurar)`, 'Excluir', true))) return; const id = note.id; await App.closeNote(); await Store.trashNote(id); Library.render(); toast('Nota na Lixeira', 2000); }, null, 'danger')));
    openPop(anchor, box);
  },
};
function zoomMenu(anchor) {
  menu(anchor, [
    { label: 'Ajustar à largura', icon: 'fit', run: () => Editor.fitWidth() },
    { label: 'Página inteira', icon: 'pages', run: () => Editor.fitPage() },
    '-',
    ...ZOOM_STEPS.filter((z) => { const [a, b] = Editor.zoomLimits(); return z >= a - 1e-6 && z <= b + 1e-6; }).map((z) => ({ label: (Math.abs(Editor.cam.z - z) < 0.005 ? '✓ ' : '') + Math.round(z * 100) + '%', icon: 'search', run: () => Editor.zoomTo(z) })),
  ]);
}
function noteDetails(note) {
  const dt = (t) => (t ? new Date(t).toLocaleString('pt-BR') : '—'); let els = 0; for (const p of note.pages) els += p.elements.length;
  const row = (a, b) => el('div', { class: 'nm-det' }, el('span', {}, a), el('b', {}, b));
  openModal({ title: 'Detalhes', body: el('div', {}, row('Título', note.title || '—'), row('Páginas', String(note.pages.length)), row('Itens (traços, textos…)', String(els)), row('PDFs importados', String(new Set(note.pages.filter((p) => p.pdf).map((p) => p.pdf.blobId)).size)), row('Criada', dt(note.created)), row('Modificada', dt(note.updated))), buttons: [{ label: 'Fechar', cls: 'primary', value: true }] });
}

/* ===== v0.48: ir para página rápido =====
   Toque no contador "1 / N" do topo (ou ⋯ → Vá para página, ou botão da caneta 'gotoPage'): teclado numérico grande.
   Vai sozinho quando o número digitado não pode mais crescer (ex.: "5" numa nota de 12 páginas); senão toque em Ir (ou Enter).
   Também: primeira / anterior / próxima / última, páginas marcadas e "Todas as páginas" (o painel de antes). */
const GoPage = {
  open(anchor) {
    const note = Editor.note; if (!note || note.mode === 'infinite') return toast('Notas em tela infinita não têm páginas', 1600);
    const N = note.pages.length, cur = Editor.currentPageIndex() + 1; let typed = '';
    const box = el('div', { class: 'gp-pop' }), disp = el('div', { class: 'gp-disp' }), hint = el('small', { class: 'gp-hint' });
    const close = () => { removeEventListener('keydown', onKey, true); closePop(); };
    const go = (k) => { k = clamp(k, 1, N); close(); Editor.goToPage(k - 1); toast('Página ' + k + ' de ' + N, 900); };
    const show = () => { disp.textContent = typed || String(cur); disp.classList.toggle('ph', !typed); const k = +typed; hint.textContent = typed ? (k >= 1 && k <= N ? (k * 10 <= N ? 'toque em Ir ou continue digitando' : '') : 'não existe (1–' + N + ')') : 'digite o número · ' + N + (N === 1 ? ' página' : ' páginas'); };
    const digit = (d) => { if (typed.length >= String(N).length && typed) return; typed = (typed + d).replace(/^0+/, ''); show(); const k = +typed; if (k >= 1 && k <= N && k * 10 > N) setTimeout(() => go(k), 120); };
    const back = () => { typed = typed.slice(0, -1); show(); };
    const ok = () => { const k = +typed; if (k >= 1 && k <= N) go(k); else if (!typed) close(); };
    const key = (lb, fn, cls = '') => el('button', { class: 'gp-key ' + cls, onclick: fn }, lb);
    const pad = el('div', { class: 'gp-pad' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => key(String(d), () => digit(String(d)))), key('⌫', back, 'gp-fn'), key('0', () => digit('0')), key('Ir', ok, 'gp-ok'));
    const nav = el('div', { class: 'gp-nav' }, key('⇤', () => go(1), 'gp-fn'), key('‹', () => go(cur - 1), 'gp-fn'), key('›', () => go(cur + 1), 'gp-fn'), key('⇥', () => go(N), 'gp-fn'));
    nav.children[0].title = 'Primeira'; nav.children[1].title = 'Anterior'; nav.children[2].title = 'Próxima'; nav.children[3].title = 'Última';
    const marks = note.pages.map((p, i) => (p.bookmark ? i + 1 : 0)).filter(Boolean);
    box.append(el('div', { class: 'gp-head' }, el('b', {}, 'Ir para a página'), el('span', {}, 'atual: ' + cur + ' de ' + N)), disp, hint, pad, nav,
      marks.length ? el('div', { class: 'gp-marks' }, el('small', {}, 'Marcadas'), ...marks.slice(0, 24).map((k) => el('button', { class: 'gp-mark' + (k === cur ? ' on' : ''), onclick: () => go(k) }, String(k)))) : null,
      el('button', { class: 'btn ghost gp-all', onclick: () => { close(); pagesPanel(); } }, 'Todas as páginas…'));
    const onKey = (e) => { if (!box.isConnected) return removeEventListener('keydown', onKey, true); if (/^[0-9]$/.test(e.key)) digit(e.key); else if (e.key === 'Backspace') back(); else if (e.key === 'Enter') ok(); else if (e.key === 'Escape') close(); else return; e.preventDefault(); e.stopPropagation(); };
    addEventListener('keydown', onKey, true);
    let a = anchor || $('#hudPage'); const r = a && a.getBoundingClientRect(); if (!r || !r.width) a = { getBoundingClientRect: () => ({ left: innerWidth / 2 - 1, right: innerWidth / 2 + 1, top: 60, bottom: 62, width: 2, height: 2 }) }; /* escondido (escrevendo/tela cheia): abre no alto, no meio */
    show(); openPop(a, box);
  },
};
