/* ===== v1.21: cadernos do TEC Concursos =====
   O PDF impresso do TEC ("Caderno …", tecconcursos.com.br) tem texto de verdade: para cada questão o link
   (www.tecconcursos.com.br/questoes/<id>), a banca/órgão/ano, "Matéria - Assunto", o número "10)" e as palavras
   "Certo"/"Errado"; no fim, o "Gabarito" (10) Certo 11) Errado …). Ao abrir a nota, Tec.check reconhece o caderno,
   lê tudo (PdfFind.readPage, com cache) e guarda em note.tec:
     {v, blob, gab: {num: 'C'|'E'|letra|'X'}, q: {num: {id, banca, mat, ass, c/e/nr: [pdfIndex, x, y, w, h]}}, ans: {num: {a, ok, d, t}}, d: {num: 1}}
   Tocar com a caneta em Certo/Errado responde e corrige na hora (elipse verde/vermelha; errou → a certa em verde tracejado);
   tocar no número marca dúvida (elipse laranja). Cada resposta vai para log.qa (com o assunto) e o erro (ou acerto com dúvida)
   vai sozinho para o caderno de erros. As marcas são elementos da página com e.tq / e.tqd = número (desfazer tira a marca e a
   resposta é esquecida no próximo toque). */
const Tec = {
  _no: new Set(), _busy: new Set(),
  url(id) { return 'https://www.tecconcursos.com.br/questoes/' + id; },
  /* reconhece (uma vez por nota) — barato: lê a 1ª e a última página com PDF */
  async check(note) {
    if (!note || note.tec !== undefined || this._no.has(note.id) || this._busy.has(note.id)) return;
    const P = note.pages.filter((p) => p.pdf); if (!P.length) return;
    this._busy.add(note.id);
    try {
      const first = await PdfFind.readPage(P[0].pdf), last = await PdfFind.readPage(P[P.length - 1].pdf), txt = (L) => L.map((l) => l[0]).join('\n');
      if (!/tecconcursos\.com\.br/i.test(txt(first)) || !/^\s*Gabarito\s*$/m.test(txt(last))) { this._no.add(note.id); return; }
      const T = await this.scan(note); if (!T || !Object.keys(T.q).length) { this._no.add(note.id); return; }
      if (Editor.note !== note) return; /* fechou no meio: tenta de novo na próxima vez */
      note.tec = T; this.cover(note); Editor.markChanged(); Editor.requestRender();
      const n = Object.keys(T.q).length, ce = Object.values(T.q).filter((q) => q.c && q.e).length;
      toast(`📝 Caderno do TEC: ${n} questões${ce < n ? ` (${ce} de Certo/Errado)` : ''}. Toque em Certo ou Errado com a caneta para responder; no número da questão para marcar dúvida.`, 6500);
    } catch (e) { logError(e, 'caderno do TEC'); this._no.add(note.id); }
    finally { this._busy.delete(note.id); }
  },
  /* lê todas as páginas e monta as questões + gabarito */
  async scan(note) {
    const P = note.pages.filter((p) => p.pdf), blob = P[0].pdf.blobId, q = {}, gab = {}; let cur = null, inGab = false, gabBox = null;
    const skip = (t) => /^\d{2}\/\d{2}\/\d{4},\s*\d{1,2}:\d{2}/.test(t) || /^https?:\/\/www\.tecconcursos\.com\.br\/questoes\/cadernos/.test(t);
    const rect = (pg, L, k0 = 0, k1) => { const [t, y, h, segs] = L, at = (i) => { let sg = segs[0]; for (const s of segs) if (s[0] <= i) sg = s; const f = Math.min(1, Math.max(0, (i - sg[0]) / Math.max(1, sg[3]))); return sg[1] + sg[2] * f; }; const x1 = at(k0), x2 = at(k1 == null ? t.length : k1); return [pg, Math.round(x1 * 10) / 10, Math.round(y * 10) / 10, Math.round((x2 - x1) * 10) / 10, Math.round(h * 10) / 10]; };
    const finish = () => {
      if (cur && cur.num) { const hd = cur.hdr.filter(Boolean), ms = hd.slice(1).join(' '), k = ms.indexOf(' - ');
        q[cur.num] = { id: cur.id, banca: hd[0] || '', mat: k > 0 ? ms.slice(0, k).trim() : ms.trim(), ass: k > 0 ? ms.slice(k + 3).trim() : '', c: cur.c || null, e: cur.e || null, nr: cur.nr || null }; }
      cur = null;
    };
    for (let i = 0; i < P.length; i++) {
      if (P[i].pdf.blobId !== blob) continue;
      const pg = P[i].pdf.index; let lines; try { lines = await PdfFind.readPage(P[i].pdf); } catch (e) { lines = []; }
      for (const L of lines) {
        const t = L[0].trim(); if (!t || skip(t)) continue;
        if (inGab) { let hit = 0; for (const m of t.matchAll(/(\d+)\)\s*(Certo|Errado|Anulada|Desatualizada|[A-E])\b/g)) { gab[m[1]] = /^(Anulada|Desatualizada)$/.test(m[2]) ? 'X' : m[2][0]; hit++; }
          if (hit && pg === gabBox.pg) { const sg = L[3][L[3].length - 1]; gabBox.y2 = Math.max(gabBox.y2, L[1] + L[2]); gabBox.x1 = Math.min(gabBox.x1, L[3][0][1]); gabBox.x2 = Math.max(gabBox.x2, sg[1] + sg[2]); } continue; }
        if (/^Gabarito$/.test(t)) { finish(); inGab = true; gabBox = { pg, x1: L[3][0][1], y1: L[1], x2: L[3][0][1] + 200, y2: L[1] + L[2] }; continue; }
        const m = t.match(/^www\.tecconcursos\.com\.br\/questoes\/(\d+)/); if (m) { finish(); cur = { id: m[1], hdr: [] }; continue; }
        if (!cur) continue;
        if (!cur.num) { const n = t.match(/^(\d+)\)\s?/); if (n && cur.hdr.length >= 2) { cur.num = n[1]; cur.nr = rect(pg, L, 0, n[1].length + 1); } else if (cur.hdr.length < 4) cur.hdr.push(t); continue; }
        if (t === 'Certo' && !cur.c) cur.c = rect(pg, L); else if (t === 'Errado' && !cur.e) { cur.e = rect(pg, L); if (cur.c) finish(); }
      }
    }
    finish();
    return { v: 1, blob, gab, q, ans: {}, d: {}, gb: gabBox ? [gabBox.pg, gabBox.x1 - 8, gabBox.y1 - 6, gabBox.x2 - gabBox.x1 + 16, gabBox.y2 - gabBox.y1 + 12] : null };
  },
  /* página da nota que mostra a página `idx` do PDF do caderno */
  pageOf(note, idx) { const T = note.tec; return note.pages.find((p) => p.pdf && p.pdf.blobId === T.blob && p.pdf.index === idx) || null; },
  /* esconde o gabarito do PDF atrás de um bloco (dá para apagar o bloco se quiser ver) */
  cover(note) {
    const T = note.tec, g = T.gb, page = g && this.pageOf(note, g[0]); if (!page) return;
    const els = [{ id: uid(), type: 'shape', kind: 'rect', x1: g[1], y1: g[2], x2: g[1] + g[3], y2: g[2] + g[4], color: '#94a3b8', width: 1, fill: '#e2e8f0', tqg: 1 },
      { id: uid(), type: 'text', x: g[1] + 14, y: g[2] + 12, w: Math.max(200, g[3] - 28), text: 'Gabarito guardado pelo Traço — ele corrige cada questão quando você toca em Certo ou Errado. (Apague este bloco para ver o gabarito.)', size: 15, color: '#475569', bold: false, tqg: 1 }];
    for (const e of els) Editor.recAdd(page, e); Editor.opCommit();
  },
  near(r, x, y, pad) { return r && x >= r[1] - pad && x <= r[1] + r[3] + pad && y >= r[2] - pad * 0.6 && y <= r[2] + r[4] + pad * 0.6; },
  /* toque da caneta (Editor.penTap) — true = tratado (não vira ponto) */
  tap(note, page, x, y) {
    const T = note && note.tec; if (!T || !page.pdf || page.pdf.blobId !== T.blob) return false;
    const idx = page.pdf.index, pad = Math.max(3, 7 / Editor.cam.z);
    for (const [num, q] of Object.entries(T.q)) {
      if (q.c && q.c[0] === idx && this.near(q.c, x, y, pad)) { this.answer(note, page, num, 'C'); return true; }
      if (q.e && q.e[0] === idx && this.near(q.e, x, y, pad)) { this.answer(note, page, num, 'E'); return true; }
      if (q.nr && q.nr[0] === idx && this.near(q.nr, x, y, pad)) { this.doubt(note, page, num); return true; }
    }
    return false;
  },
  ring(r, color, num, extra = {}) { const px = 7, py = 3; return { id: uid(), type: 'shape', kind: 'ellipse', x1: r[1] - px, y1: r[2] - py, x2: r[1] + r[3] + px, y2: r[2] + r[4] + py, color, width: 2, fill: null, ...extra }; },
  marks(page, num, key = 'tq') { return page.elements.filter((e) => String(e[key]) === String(num)); },
  subjFor(note) { const sb = subjectOfNote(note.id), st = typeof StudyTimer !== 'undefined' && StudyTimer.st; return /^[_~?]/.test(sb.key) && st && st.subj ? st.subj : null; },
  async answer(note, page, num, v) {
    const T = note.tec, q = T.q[num], A = T.ans[num];
    if (A) {
      const had = this.marks(page, num).length; /* sem marcas = o desfazer tirou: esquece a resposta antiga e responde de novo */
      if (had && !(await confirmBox('Apagar resposta', `Apagar a resposta da questão ${num} (e o registro dela no relatório)?`, 'Apagar', true))) return;
      this.clear(note, page, num); if (had && A.a === v) return; /* tocou de novo na mesma: só apagou */
    }
    const g = T.gab[num], d = !!T.d[num], ok = g === 'C' || g === 'E' ? g === v : null, t = Date.now();
    const els = [this.ring(v === 'C' ? q.c : q.e, ok == null ? '#64748b' : ok ? '#16a34a' : '#dc2626', num, { tq: num })];
    if (ok === false) els.push(this.ring(v === 'C' ? q.e : q.c, '#16a34a', num, { tq: num, dash: 'dash', width: 1.6 }));
    for (const e of els) this.recAdd(page, e); Editor.opCommit();
    T.ans[num] = { a: v, ok, d: d ? 1 : 0, t }; Editor.markChanged();
    if (ok != null && typeof StudyTimer !== 'undefined' && StudyTimer.log) {
      const L = StudyTimer.log, QA = L.qa || (L.qa = []), x = [t, ok ? 1 : 0, note.id, this.subjFor(note), q.ass || q.mat || null, d ? 1 : 0, 'tec', num]; QA.push(x); if (QA.length > 30000) QA.splice(0, QA.length - 30000);
      if (!ok || d) this.addErr(note, num, x);
      StudyTimer.saveLog(); if (typeof QuizPad !== 'undefined') QuizPad.sync(true);
    }
    try { navigator.vibrate && navigator.vibrate(ok === false ? [18, 50, 18] : 8); } catch (_) {}
    if (ok == null) toast(`Questão ${num} sem gabarito (anulada ou desatualizada)`, 2200); else if (!ok) toast(`✗ Questão ${num}: gabarito ${g === 'C' ? 'Certo' : 'Errado'} — foi para o caderno de erros`, 2400); else if (d) toast('✓ Acertou, mas com dúvida — foi para a revisão', 1800);
  },
  recAdd(page, e) { Editor.recAdd(page, e); },
  addErr(note, num, x) {
    const L = StudyTimer.log, E = L.errs || (L.errs = []), q = note.tec.q[num], sb = StudyTimer.ansSubj(x);
    E.push({ id: uid(), t: x[0], f: sb.key, n: note.id, aula: null, q: num, txt: q.ass || q.mat || 'TEC', tec: { id: q.id, num, blob: note.tec.blob, pg: (q.c || q.nr || [0])[0] }, duv: x[1] ? 1 : 0, done: false }); if (E.length > 5000) E.splice(0, E.length - 5000);
  },
  /* tira a resposta: marcas da página, o registro em log.qa e a anotação no caderno de erros */
  clear(note, page, num) {
    const T = note.tec, A = T.ans[num]; if (!A) return; const ms = this.marks(page, num);
    if (ms.length) { for (const e of ms) Editor.recRemove(page, e); Editor.opCommit(); }
    delete T.ans[num]; Editor.markChanged();
    if (typeof StudyTimer !== 'undefined' && StudyTimer.log) { const L = StudyTimer.log; if (L.qa) L.qa = L.qa.filter((x) => !(x[0] === A.t && x[6] === 'tec')); if (L.errs) L.errs = L.errs.filter((x) => !(x.t === A.t && x.tec)); StudyTimer.saveLog(); if (typeof QuizPad !== 'undefined') QuizPad.sync(true); }
  },
  /* dúvida: elipse laranja no número; vale para a resposta já dada também (acerto com dúvida vai para a revisão) */
  doubt(note, page, num) {
    const T = note.tec, q = T.q[num], on = !T.d[num], ms = this.marks(page, num, 'tqd');
    if (on) { T.d[num] = 1; Editor.recAdd(page, this.ring(q.nr, '#f59e0b', num, { tqd: num, width: 2.2 })); } else { delete T.d[num]; for (const e of ms) Editor.recRemove(page, e); }
    Editor.opCommit(); Editor.markChanged();
    const A = T.ans[num];
    if (A && A.ok != null && typeof StudyTimer !== 'undefined' && StudyTimer.log) {
      A.d = on ? 1 : 0; const L = StudyTimer.log, x = (L.qa || []).find((y) => y[0] === A.t && y[6] === 'tec'); if (x) x[5] = A.d;
      if (A.ok) { if (on && x) this.addErr(note, num, x); else if (!on && L.errs) L.errs = L.errs.filter((y) => !(y.t === A.t && y.tec)); }
      StudyTimer.saveLog();
    }
    toast(on ? `Questão ${num}: dúvida marcada${A ? '' : ' — agora responda'}` : `Questão ${num}: sem dúvida`, 1400);
  },
  /* resumo (menu ⋯ da nota) */
  summary(note) {
    const T = note.tec, all = Object.keys(T.q).filter((k) => T.q[k].c && T.q[k].e), A = T.ans, done = all.filter((k) => A[k]);
    const ok = done.filter((k) => A[k].ok === true).length, no = done.filter((k) => A[k].ok === false).length, dv = done.filter((k) => A[k].d).length;
    const next = all.map((k) => [k, T.q[k]]).find(([k]) => !A[k]);
    const by = new Map(); for (const k of done) { const a = T.q[k].ass || T.q[k].mat || '—', o = by.get(a) || { ok: 0, n: 0 }; if (A[k].ok != null) { o.n++; if (A[k].ok) o.ok++; } by.set(a, o); }
    const rows = [...by.entries()].filter(([, o]) => o.n).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
    const body = el('div', { class: 'tec-sum' },
      el('div', { class: 'rp-tiles' }, ...[['Respondidas', `${done.length} de ${all.length}`], ['Acertos', ok + no ? Math.round((ok / (ok + no)) * 100) + '%' : '—', `✓ ${ok} · ✗ ${no}`], ['Com dúvida', String(dv)]].map(([l, v, s]) => el('div', { class: 'rp-tile' }, el('small', {}, l), el('b', {}, v), s ? el('span', {}, s) : null))),
      rows.length ? el('div', { class: 'tec-ass' }, el('div', { class: 'rp-h' }, 'Por assunto (piores primeiro)'), ...rows.map(([a, o]) => el('div', { class: 'tec-arow' }, el('span', {}, a), el('b', { class: o.ok / o.n < 0.6 ? 'bad' : o.ok / o.n >= 0.8 ? 'good' : '' }, `${o.ok}/${o.n}`)))) : el('p', { class: 'tm-hint' }, 'Toque em Certo ou Errado com a caneta para responder. Tocar no número da questão marca dúvida.'));
    openModal({ title: '📝 Caderno do TEC', body, buttons: [
      ...(next ? [{ label: `Ir para a ${next[0]}`, cls: 'primary', action: () => { this.goTo(note.id, next[1], note.tec.blob); return true; } }] : []),
      { label: 'Fechar', action: () => true }] });
  },
  /* do caderno de erros: abre a nota na questão */
  async goErr(x) { if (!Store.heads[x.n]) return toast('A nota deste caderno não existe mais', 2000); if (!Editor.note || Editor.note.id !== x.n) await App.openNote(x.n); const T = Editor.note && Editor.note.tec, q = T && T.q[x.tec.num]; if (q) this.goTo(x.n, q, T.blob); },
  /* vai até a questão (abre a nota se precisar) e pisca o retângulo */
  async goTo(noteId, q, blob) {
    const r = q && (q.nr || q.c); if (!r) return;
    if (!Editor.note || Editor.note.id !== noteId) { closePop(); await App.openNote(noteId); }
    const note = Editor.note; if (!note || note.id !== noteId) return;
    const pi = note.pages.findIndex((p) => p.pdf && p.pdf.blobId === blob && p.pdf.index === r[0]); if (pi < 0) return;
    const p = note.pages[pi], pw = p.pdfW || p.w, b = q.e && q.e[0] === r[0] ? q.e : r, y1 = r[2] - 48, y2 = b[2] + b[4] + 6;
    Editor.flashRects(pi, [{ x: r[1] - 10, y: y1, w: pw - 2 * (r[1] - 10), h: y2 - y1 }], true);
  },
  /* v1.21: margem de rascunho à direita das páginas do PDF (menu ⋯) — page.pdfW guarda a largura original */
  scratchPop(anchor) {
    const note = Editor.note; if (!note) return; const P = note.pages.filter((p) => p.pdf); if (!P.length) return;
    const cur = P[0].pdfW && P[0].pdfW < P[0].w ? Math.round(((P[0].w - P[0].pdfW) / P[0].pdfW) * 100) : 0;
    const set = (k) => {
      closePop(); const lost = k ? 0 : P.reduce((s, p) => s + (p.pdfW ? p.elements.filter((e) => { const b = elBBox(e); return b && b.x > p.pdfW; }).length : 0), 0);
      const go = () => { for (const p of P) { const w0 = p.pdfW || p.w; if (k) { p.pdfW = w0; p.w = Math.round(w0 * (1 + k / 100)); } else { p.w = w0; delete p.pdfW; } } Editor.computeLayout(); Editor.clampCam(); };
      if (lost) confirmBox('Tirar o rascunho', `${lost} ${lost === 1 ? 'item escrito' : 'itens escritos'} na margem vão ficar escondidos (voltam se você ligar o rascunho de novo). Continuar?`, 'Tirar').then((y) => { if (y) { go(); Editor.markChanged(); Editor.requestRender(); } });
      else { go(); Editor.markChanged(); Editor.requestRender(); toast(k ? `Rascunho ao lado: ${k}% da largura da página` : 'Rascunho tirado', 1600); }
    };
    const box = el('div', { class: 'nmenu tec-scr' }, el('div', { class: 'nm-head' }, el('div', {}, el('b', {}, 'Rascunho ao lado'), el('small', {}, 'faixa em branco à direita de cada página do PDF, com a grade da nota'))),
      el('div', { class: 'pl-chips' }, ...[[0, 'Sem'], [40, '40%'], [60, '60%'], [80, '80%'], [100, '100%']].map(([k, l]) => el('button', { class: 'tm-chip' + (k === cur ? ' on' : ''), onclick: () => set(k) }, l))));
    openPop(anchor, box);
  },
};
