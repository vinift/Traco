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
    if (!note || this._no.has(note.id) || this._busy.has(note.id)) return;
    this.bankBar(note && note.bank ? note : null); /* v1.26 */
    if (note.tec) { this.reg(note); this.reconcile(note); if (!(note.tec.v >= 2)) await this.upgrade(note); if (!note.bank) this.repeats(note); return; } /* v1.27: no caderno de erros tudo já foi feito — sem etiquetas */ if (note.tec !== undefined) return;
    const P = note.pages.filter((p) => p.pdf); if (!P.length) return;
    this._busy.add(note.id);
    try {
      const first = await PdfFind.readPage(P[0].pdf), last = await PdfFind.readPage(P[P.length - 1].pdf), txt = (L) => L.map((l) => l[0]).join('\n');
      if (!/tecconcursos\.com\.br/i.test(txt(first)) || !/^\s*Gabarito\s*$/m.test(txt(last))) { this._no.add(note.id); return; }
      const T = await this.scan(note); if (!T || !Object.keys(T.q).length) { this._no.add(note.id); return; }
      if (Editor.note !== note) return; /* fechou no meio: tenta de novo na próxima vez */
      note.tec = T; this.cover(note); Editor.markChanged(); Editor.requestRender();
      const n = Object.keys(T.q).length, ce = Object.values(T.q).filter((q) => q.c && q.e).length, r = this.repeats(note, true);
      toast(`📝 Caderno do TEC: ${n} questões${ce < n ? ` (${ce} de Certo/Errado)` : ''}.${r ? ` ${r}` : ''} Toque em Certo ou Errado com a caneta para responder; no número da questão para marcar dúvida.`, r ? 8000 : 6500);
    } catch (e) { logError(e, 'caderno do TEC'); this._no.add(note.id); }
    finally { this._busy.delete(note.id); }
  },
  /* lê todas as páginas e monta as questões + gabarito */
  async scan(note) {
    const P = note.pages.filter((p) => p.pdf), blob = P[0].pdf.blobId, pages = [];
    for (const p of P) { if (p.pdf.blobId !== blob) continue; let lines; try { lines = await PdfFind.readPage(p.pdf); } catch (e) { lines = []; } pages.push({ pg: p.pdf.index, lines }); }
    const R = this.parse(pages);
    return { v: 2, blob, gab: R.gab, q: R.q, ans: {}, d: {}, gb: R.gb };
  },
  /* v1.23: lê as linhas ([{pg, lines}] na ordem) → {q, gab, gb, pm: {pg: {hb, ft}}} — hb = fim do cabeçalho da página
     (data/hora), ft = começo do rodapé (link do caderno); cada questão tem top (linha do link), nr (número) e end (última linha) */
  parse(pages) {
    const q = {}, gab = {}, pm = {}; let cur = null, inGab = false, gabBox = null;
    const rect = (pg, L, k0 = 0, k1) => { const [t, y, h, segs] = L, at = (i) => { let sg = segs[0]; for (const s of segs) if (s[0] <= i) sg = s; const f = Math.min(1, Math.max(0, (i - sg[0]) / Math.max(1, sg[3]))); return sg[1] + sg[2] * f; }; const x1 = at(k0), x2 = at(k1 == null ? t.length : k1); return [pg, Math.round(x1 * 10) / 10, Math.round(y * 10) / 10, Math.round((x2 - x1) * 10) / 10, Math.round(h * 10) / 10]; };
    const finish = () => {
      if (cur && cur.num) { const hd = cur.hdr.filter(Boolean), bi = Math.max(0, hd.findIndex((t) => /\/\d{4}$/.test(t))), banca = hd.slice(0, bi + 1).join(' '), ms = hd.slice(bi + 1).join(' '), k = ms.indexOf(' - '); /* v1.26: a banca pode quebrar em 2 linhas — termina na que acaba com o ano */
        q[cur.num] = { id: cur.id, banca, mat: k > 0 ? ms.slice(0, k).trim() : ms.trim(), ass: k > 0 ? ms.slice(k + 3).trim() : '', c: cur.c || null, e: cur.e || null, nr: cur.nr || null, top: cur.top, end: cur.end }; }
      cur = null;
    };
    for (const { pg, lines } of pages) {
      const M = pm[pg] = { hb: 0, ft: Infinity };
      for (const L of lines) {
        const t = L[0].trim(); if (!t) continue;
        if (/^\d{2}\/\d{2}\/\d{4},\s*\d{1,2}:\d{2}/.test(t)) { M.hb = Math.max(M.hb, L[1] + L[2]); continue; }
        if (/^https?:\/\/www\.tecconcursos\.com\.br\/questoes\/cadernos/.test(t)) { M.ft = Math.min(M.ft, L[1]); continue; }
        if (inGab) { let hit = 0; for (const m of t.matchAll(/(\d+)\)\s*(Certo|Errado|Anulada|Desatualizada|[A-E])\b/g)) { gab[m[1]] = /^(Anulada|Desatualizada)$/.test(m[2]) ? 'X' : m[2][0]; hit++; }
          if (hit && pg === gabBox.pg) { const sg = L[3][L[3].length - 1]; gabBox.y2 = Math.max(gabBox.y2, L[1] + L[2]); gabBox.x1 = Math.min(gabBox.x1, L[3][0][1]); gabBox.x2 = Math.max(gabBox.x2, sg[1] + sg[2]); } continue; }
        if (/^Gabarito$/.test(t)) { finish(); inGab = true; gabBox = { pg, x1: L[3][0][1], y1: L[1], x2: L[3][0][1] + 200, y2: L[1] + L[2] }; continue; }
        const m = t.match(/^www\.tecconcursos\.com\.br\/questoes\/(\d+)/); if (m) { finish(); cur = { id: m[1], hdr: [], top: [pg, Math.round(L[1] * 10) / 10] }; continue; }
        if (!cur) continue;
        if (cur.num) cur.end = [pg, Math.round((L[1] + L[2]) * 10) / 10];
        if (!cur.num) { const n = t.match(/^(\d+)\)\s?/); if (n && cur.hdr.length >= 2) { cur.num = n[1]; cur.nr = rect(pg, L, 0, n[1].length + 1); cur.end = [pg, Math.round((L[1] + L[2]) * 10) / 10]; } else if (cur.hdr.length < 4) cur.hdr.push(t); continue; }
        if (t === 'Certo' && !cur.c) cur.c = rect(pg, L); else if (t === 'Errado' && !cur.e) { cur.e = rect(pg, L); if (cur.c) finish(); }
      }
    }
    finish();
    return { q, gab, pm, gb: gabBox ? [gabBox.pg, gabBox.x1 - 8, gabBox.y1 - 6, gabBox.x2 - gabBox.x1 + 16, gabBox.y2 - gabBox.y1 + 12] : null };
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
    const hid = page.elements.find((e) => e.tqh && e.type === 'shape' && x >= e.x1 && x <= e.x2 && y >= e.y1 && y <= e.y2); /* v1.22: faixa "já acertada" → mostra a questão */
    const cx = page.elements.find((e) => e.tqx != null && (() => { const b = elBBox(e); return b && x >= b.x - 8 && x <= b.x + b.w + 8 && y >= b.y - 8 && y <= b.y + b.h + 8; })()); /* v1.24: "↺ limpar" (v1.25: área maior) */
    if (cx) { const num = String(cx.tqx); this.clear(note, page, num, true); toast(`Questão ${num} limpa — como se nunca tivesse sido feita`, 2200); return true; }
    if (hid) { const num = String(hid.tqh); for (const e of this.marks(page, num, 'tqh')) Editor.recRemove(page, e); Editor.opCommit(); (T.shown || (T.shown = {}))[num] = 1; Editor.markChanged(); return true; }
    for (const [num, q] of Object.entries(T.q)) {
      if (q.hd && q.hd[0] === idx && x >= q.hd[1] + q.hd[3] - 110 && x <= q.hd[1] + q.hd[3] && y >= q.hd[2] && y <= q.hd[2] + q.hd[4]) { window.open(this.url(q.id), '_blank'); return true; } /* v1.23: "abrir no TEC" da faixa */
      if (q.c && q.c[0] === idx && this.near(q.c, x, y, pad)) { this.answer(note, page, num, 'C'); return true; }
      if (q.e && q.e[0] === idx && this.near(q.e, x, y, pad)) { this.answer(note, page, num, 'E'); return true; }
      if (q.nr && q.nr[0] === idx && this.near(q.nr, x, y, pad)) { this.doubt(note, page, num); return true; }
    }
    return false;
  },
  ring(r, color, num, extra = {}) { const px = 7, py = 3; return { id: uid(), type: 'shape', kind: 'ellipse', x1: r[1] - px, y1: r[2] - py, x2: r[1] + r[3] + px, y2: r[2] + r[4] + py, color, width: 2, fill: null, ...extra }; },
  /* v1.23: etiqueta em pílula (texto com fundo e moldura arredondados, como as pílulas do app) */
  PILL: { ok: ['#dcfce7', '#15803d', '#86efac'], no: ['#fee2e2', '#b91c1c', '#fca5a5'], warn: ['#ffedd5', '#c2410c', '#fdba74'], gray: ['#f1f5f9', '#64748b', '#e2e8f0'] },
  /* v1.25: pílulas menores (o usuário achou a correção grande e "suja") — 10,5 px e folga 3 */
  pill(x, y, text, kind, extra = {}) { const [bg, fg, bd] = this.PILL[kind] || this.PILL.gray; return { id: uid(), type: 'text', x, y, w: 300, auto: true, text, size: 10.5, color: fg, bold: true, bg, frame: { color: bd, w: 0.8, r: 7, pad: 3 }, ...extra }; },
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
    /* dados primeiro: a resposta, o registro (log.qa) e o erro anotado ficam também no círculo (e.tqa) — assim o desfazer/refazer
       do editor mantém tudo em sincronia (Tec.reconcile) */
    let x = null, er = null;
    if (ok != null && typeof StudyTimer !== 'undefined' && StudyTimer.log) {
      const L = StudyTimer.log, QA = L.qa || (L.qa = []); x = [t, ok ? 1 : 0, note.id, this.subjFor(note), q.ass || q.mat || null, d ? 1 : 0, 'tec', num, q.id]; this._seen = null; QA.push(x); if (QA.length > 30000) QA.splice(0, QA.length - 30000);
      if (!ok || d) er = this.addErr(note, num, x);
      StudyTimer.saveLog(); if (typeof QuizPad !== 'undefined') QuizPad.sync(true);
    }
    T.ans[num] = { a: v, ok, d: d ? 1 : 0, t }; Editor.markChanged();
    if (note.bank && ok != null && typeof StudyTimer !== 'undefined' && StudyTimer.log) { for (const y of StudyTimer.log.errs || []) if (y.tec && y.tec.id === q.id && !y.done && y.t !== t) { if (ok && !d) { y.done = true; y.doneAt = t; } else { y.miss = (y.miss || 0) + 1; y.tryAt = t; } } StudyTimer.saveLog(); } /* v1.27: refez no caderno de erros → acertou sai da lista de refazer */
    /* v1.23: seleção e correção separadas — a sua resposta é sempre um círculo roxo; o resultado vem numa pílula ao lado.
       v1.24: + pílula "↺ limpar" (tqx). A etiqueta "já feita" (tqr) sai: a resposta nova substitui. */
    for (const e of this.marks(page, num, 'tqr')) Editor.recRemove(page, e);
    const c = q.c, e2 = q.e, lab = ok == null ? 'sem gabarito' : ok ? '✓' : `✗ ${g === 'C' ? 'Certo' : 'Errado'}`, top0 = Math.min(c[2], e2[2]), bot0 = Math.max(c[2] + c[4], e2[2] + e2[4]), px = Math.max(c[1] + c[3], e2[1] + e2[3]) + (q.btn ? 10 : 16), py = top0 + (bot0 - top0) / 2 - 7; /* v1.25: só ✓ / ✗ + o gabarito */
    const tqa = { a: v, ok, d: d ? 1 : 0, t, x, er }, R0 = v === 'C' ? c : e2;
    const sel = q.btn ? (() => { const lab2 = v === 'C' ? 'Certo' : 'Errado', base = { type: 'text', text: lab2, size: 12, bold: true, auto: true, w: 200, x: 0, y: 0 }, L = layoutText(base); return { ...base, id: uid(), x: R0[1] + (R0[3] - L.w) / 2, y: R0[2] + (R0[4] - L.h) / 2, color: '#ffffff', bg: '#7c3aed', pbox: [R0[1], R0[2], R0[3], R0[4]], tq: num, tqa }; })() : this.ring(R0, '#7c3aed', num, { tq: num, width: 2.2, tqa }); /* v1.27: botão vira roxo cheio */
    const els = [sel, this.pill(px, py, lab, ok == null ? 'gray' : ok ? 'ok' : 'no', { tq: num }),
      this.pill(px + this.pillW(lab) + 8, py, '↺', 'gray', { tq: num, tqx: num })];
    for (const el2 of els) this.recAdd(page, el2); Editor.opCommit();
    try { navigator.vibrate && navigator.vibrate(ok === false ? [18, 50, 18] : 8); } catch (_) {}
    if (ok == null) toast(`Questão ${num} sem gabarito (anulada ou desatualizada)`, 2200); else if (!ok) toast(`✗ Questão ${num}: gabarito ${g === 'C' ? 'Certo' : 'Errado'} — foi para o caderno de erros`, 2400); else if (d) toast('✓ Acertou, mas com dúvida — foi para a revisão', 1800);
  },
  recAdd(page, e) { Editor.recAdd(page, e); },
  addErr(note, num, x) {
    const L = StudyTimer.log, E = L.errs || (L.errs = []), q = note.tec.q[num], sb = StudyTimer.ansSubj(x);
    const er = { id: uid(), t: x[0], f: sb.key, n: note.id, aula: null, q: num, txt: q.ass || q.mat || 'TEC', tec: { id: q.id, num, blob: note.tec.blob, pg: (q.c || q.nr || [0])[0] }, duv: x[1] ? 1 : 0, done: false }; E.push(er); if (E.length > 5000) E.splice(0, E.length - 5000); return er;
  },
  /* tira a resposta: marcas da página, o registro em log.qa e a anotação no caderno de erros */
  clear(note, page, num, full) {
    const T = note.tec, A = T.ans[num]; if (!A && !full) return; const ms = [...this.marks(page, num), ...(full ? this.marks(page, num, 'tqd') : [])];
    if (ms.length) { for (const e of ms) Editor.recRemove(page, e); Editor.opCommit(); }
    if (full) delete T.d[num];
    this.forget(note, num, A); Editor.requestRender();
  },
  /* tira a resposta dos dados (sem mexer nas marcas): T.ans, log.qa e o caderno de erros */
  forget(note, num, A) {
    const T = note.tec; delete T.ans[num]; Editor.markChanged(); this._seen = null; if (!A || typeof StudyTimer === 'undefined' || !StudyTimer.log) return;
    const L = StudyTimer.log; if (L.qa) L.qa = L.qa.filter((x) => !(x[0] === A.t && x[6] === 'tec')); if (L.errs) L.errs = L.errs.filter((x) => !(x.t === A.t && x.tec)); StudyTimer.saveLog(); if (typeof QuizPad !== 'undefined') QuizPad.sync(true);
  },
  /* v1.24: deixa os dados iguais às marcas da página — o desfazer tira o círculo → a resposta some do relatório e do caderno de
     erros; o refazer devolve o círculo (com e.tqa) → volta tudo. Chamado depois de desfazer/refazer, ao abrir e no resumo. */
  reconcile(note) {
    const T = note && note.tec; if (!T) return; const seen = new Map();
    const dv = new Set(); for (const p of note.pages) for (const e of p.elements) { if (e.tqa && e.tq != null) seen.set(String(e.tq), e.tqa); if (e.tqd != null) dv.add(String(e.tqd)); }
    let ch = 0; for (const k of Object.keys(T.d)) if (!dv.has(k)) { delete T.d[k]; ch++; } for (const k of dv) if (!T.d[k]) { T.d[k] = 1; ch++; } /* dúvida = marca laranja */
    for (const num of Object.keys(T.ans)) { const r = seen.get(num); if (!r || r.t !== T.ans[num].t) { if (r) continue; this.forget(note, num, T.ans[num]); ch++; } }
    for (const [num, r] of seen) if (!T.ans[num]) { T.ans[num] = { a: r.a, ok: r.ok, d: r.d, t: r.t }; ch++;
      if (typeof StudyTimer !== 'undefined' && StudyTimer.log) { const L = StudyTimer.log; if (r.x && !(L.qa || []).some((y) => y[0] === r.t && y[6] === 'tec')) (L.qa = L.qa || []).push(r.x); if (r.er && !(L.errs || []).some((y) => y.id === r.er.id)) (L.errs = L.errs || []).push(r.er); StudyTimer.saveLog(); } }
    if (ch) { this._seen = null; Editor.markChanged(); if (typeof QuizPad !== 'undefined') QuizPad.sync(true); }
  },
  pillW(t) { try { return layoutText(this.pill(0, 0, t, 'gray')).w + 6; } catch (_) { return [...t].length * 6.2; } },
  /* dúvida: elipse laranja no número; vale para a resposta já dada também (acerto com dúvida vai para a revisão) */
  doubt(note, page, num) {
    const T = note.tec, q = T.q[num], on = !T.d[num], ms = this.marks(page, num, 'tqd');
    if (on) { T.d[num] = 1; Editor.recAdd(page, this.ring(q.nr, '#f59e0b', num, { tqd: num, width: 2.2 })); } else { delete T.d[num]; for (const e of ms) Editor.recRemove(page, e); }
    Editor.opCommit(); Editor.markChanged();
    const A = T.ans[num];
    if (A && A.ok != null && typeof StudyTimer !== 'undefined' && StudyTimer.log) {
      A.d = on ? 1 : 0; const L = StudyTimer.log, x = (L.qa || []).find((y) => y[0] === A.t && y[6] === 'tec'); if (x) x[5] = A.d;
      if (A.ok) { if (on && x) this.addErr(note, num, x); else if (!on && L.errs) L.errs = L.errs.filter((y) => !(y.t === A.t && y.tec)); }
      const ring = this.marks(page, num).find((e) => e.tqa); if (ring) { ring.tqa.d = A.d; ring.tqa.er = (L.errs || []).find((y) => y.t === A.t && y.tec) || null; } /* v1.24: o círculo guarda o estado atual */
      StudyTimer.saveLog();
    }
    toast(on ? `Questão ${num}: dúvida marcada${A ? '' : ' — agora responda'}` : `Questão ${num}: sem dúvida`, 1400);
  },
  /* v1.22: questões do TEC já respondidas, em qualquer caderno — id do TEC → última resposta {t, ok, d, n (nota)}.
     Lê log.qa (qa[8] = id do TEC, a partir da v1.22); para respostas da v1.21 (sem id), procura o id na nota quando ela é a aberta. */
  seen() {
    const QA = (typeof StudyTimer !== 'undefined' && StudyTimer.log && StudyTimer.log.qa) || []; if (this._seen && this._seen.len === QA.length) return this._seen.m;
    const m = new Map(); for (const x of QA) { if (x[6] !== 'tec' || !x[8]) continue; const o = m.get(x[8]); if (!o || o.t < x[0]) m.set(x[8], { t: x[0], ok: x[1], d: x[5] ? 1 : 0, n: x[2] }); }
    this._seen = { len: QA.length, m }; return m;
  },
  /* v1.21 → v1.22: lê de novo para guardar o topo de cada questão (top) e põe o id do TEC nas respostas já dadas */
  async upgrade(note) {
    try { const T2 = await this.scan(note), T = note.tec; for (const [k, q] of Object.entries(T.q)) if (T2.q[k]) q.top = T2.q[k].top; T.v = 2;
      const QA = (StudyTimer.log && StudyTimer.log.qa) || []; for (const x of QA) if (x[6] === 'tec' && x[2] === note.id && !x[8] && T.q[x[7]]) x[8] = T.q[x[7]].id; this._seen = null; StudyTimer.saveLog(); Editor.markChanged();
    } catch (e) { logError(e, 'caderno do TEC'); }
  },
  /* v1.22: repetidas — questões deste caderno que já foram respondidas em OUTRO caderno: etiqueta "já feita em …" ao lado de
     Certo/Errado; as acertadas sem dúvida ficam atrás de uma faixa (S.tecHideOk, padrão ligado; tocar mostra). Uma vez por
     questão (T.rep). Devolve o texto do aviso (ou '') quando `say`. */
  repeats(note, say) {
    const T = note.tec; if (!T || Editor.note !== note) return ''; const M = this.seen(); if (!M.size) return '';
    const R = T.rep || (T.rep = {}), hide = Store.settings.tecHideOk !== false, fd = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    let n = 0, nok = 0, nno = 0, nh = 0; const touched = new Set();
    for (const [num, q] of Object.entries(T.q)) {
      const s = M.get(q.id); if (!s || (s.n === note.id && !note.bank)) continue; /* v1.26: no caderno de respostas, o que foi feito em montagens anteriores também conta */ n++; if (s.ok) nok++; else nno++;
      if (R[num] || T.ans[num] || !q.c || !q.e) continue; R[num] = { t: s.t, ok: s.ok, d: s.d };
      const page = this.pageOf(note, q.e[0]); if (!page) continue; touched.add(page);
      if (hide && s.ok && !s.d && q.top && q.top[0] === q.e[0] && !(T.shown && T.shown[num])) {
        const pw = page.pdfW || page.w, x1 = Math.max(4, q.nr ? q.nr[1] - 10 : 20), y1 = q.top[1] - 6, y2 = q.e[2] + q.e[4] + 6;
        Editor.recAdd(page, { id: uid(), type: 'shape', kind: 'rect', x1, y1, x2: pw - x1, y2, color: '#ddd6fe', width: 1, fill: '#faf8ff', tqh: num });
        Editor.recAdd(page, { id: uid(), type: 'text', x: x1 + 12, y: (y1 + y2) / 2 - 10, w: pw - 2 * x1 - 24, text: `✓ Questão ${num} já acertada em ${fd(s.t)} — toque para mostrar`, size: 13, color: '#6d28d9', bold: false, tqh: num });
        nh++;
      } else {
        const c = q.c, txt = `já feita ${fd(s.t)} · ${s.ok ? (s.d ? 'certa c/ dúvida' : 'certa') : 'errada'}`;
        Editor.recAdd(page, this.pill(c[1] + Math.max(c[3], q.e[3]) + 16, c[2] + (q.e[2] + q.e[4] - c[2]) / 2 - 7, txt, s.ok ? (s.d ? 'warn' : 'ok') : 'no', { tqr: num }));
      }
    }
    if (touched.size) { Editor.opCommit(); Editor.markChanged(); Editor.requestRender(); }
    if (!say || !n) return '';
    const pl = (k, a, b) => `${k} ${k === 1 ? a : b}`;
    return `${n} de ${Object.keys(T.q).length} você já fez em outros cadernos (${pl(nok, 'certa', 'certas')}, ${pl(nno, 'errada', 'erradas')})${nh ? ` — ${pl(nh, 'acertada ficou escondida', 'acertadas ficaram escondidas')}` : ''}.`;
  },
  /* mostra todas as acertadas escondidas deste caderno */
  showHidden(note) {
    const T = note.tec; let n = 0; for (const p of note.pages) { const hs = p.elements.filter((e) => e.tqh); for (const e of hs) { Editor.recRemove(p, e); (T.shown || (T.shown = {}))[e.tqh] = 1; n++; } }
    if (n) { Editor.opCommit(); Editor.markChanged(); Editor.requestRender(); } return n / 2;
  },
  /* resumo (menu ⋯ da nota) */
  summary(note) {
    this.reconcile(note);
    const T = note.tec, all = Object.keys(T.q).filter((k) => T.q[k].c && T.q[k].e), A = T.ans, done = all.filter((k) => A[k]);
    const ok = done.filter((k) => A[k].ok === true).length, no = done.filter((k) => A[k].ok === false).length, dv = done.filter((k) => A[k].d).length;
    const R = T.rep || {}, hid = (k) => R[k] && R[k].ok && !R[k].d && !(T.shown && T.shown[k]) && Store.settings.tecHideOk !== false, next = all.map((k) => [k, T.q[k]]).find(([k]) => !A[k] && !hid(k));
    const rep = Object.keys(R).length, hcb = el('input', { type: 'checkbox' }); hcb.checked = Store.settings.tecHideOk !== false; hcb.onchange = () => { Store.settings.tecHideOk = hcb.checked; Store.saveSettings(); };
    const by = new Map(); for (const k of done) { const a = T.q[k].ass || T.q[k].mat || '—', o = by.get(a) || { ok: 0, n: 0 }; if (A[k].ok != null) { o.n++; if (A[k].ok) o.ok++; } by.set(a, o); }
    const rows = [...by.entries()].filter(([, o]) => o.n).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
    const body = el('div', { class: 'tec-sum' },
      rep ? el('p', { class: 'tm-hint' }, `↺ ${rep} ${rep === 1 ? 'questão já feita' : 'questões já feitas'} em outros cadernos.`) : null,
      el('label', { class: 'cpk-allg' }, hcb, el('span', {}, 'Esconder as repetidas que já acertei (nos próximos cadernos)')),
      el('div', { class: 'rp-tiles' }, ...[['Respondidas', `${done.length} de ${all.length}`], ['Acertos', ok + no ? Math.round((ok / (ok + no)) * 100) + '%' : '—', `✓ ${ok} · ✗ ${no}`], ['Com dúvida', String(dv)]].map(([l, v, s]) => el('div', { class: 'rp-tile' }, el('small', {}, l), el('b', {}, v), s ? el('span', {}, s) : null))),
      rows.length ? el('div', { class: 'tec-ass' }, el('div', { class: 'rp-h' }, 'Por assunto (piores primeiro)'), ...rows.map(([a, o]) => el('div', { class: 'tec-arow' }, el('span', {}, a), el('b', { class: o.ok / o.n < 0.6 ? 'bad' : o.ok / o.n >= 0.8 ? 'good' : '' }, `${o.ok}/${o.n}`)))) : el('p', { class: 'tm-hint' }, 'Toque em Certo ou Errado com a caneta para responder. Tocar no número da questão marca dúvida.'));
    openModal({ title: '📝 Caderno do TEC', body, buttons: [
      ...(note.pages.some((p) => p.elements.some((e) => e.tqh)) ? [{ label: 'Mostrar as acertadas escondidas', action: () => { const n = this.showHidden(note); toast(`${n} questões mostradas`, 1500); return true; } }] : []),
      ...(next ? [{ label: `Ir para a ${next[0]}`, cls: 'primary', action: () => { this.goTo(note.id, next[1], note.tec.blob); return true; } }] : []),
      { label: 'Fechar', action: () => true }] });
  },
  /* ===== v1.23: montar um caderno novo a partir de PDFs do TEC =====
     srcs = [{name, blobId}] (PDFs guardados como blob). Junta as questões, tira repetidas (id do TEC), embaralha (ou mantém a
     ordem de `keep` = {id: número}), aplica o filtro ('all' | 'new' = nunca respondidas | 'newwrong' = nunca respondidas ou a
     última resposta errada/com dúvida) e gera um PDF: cada questão recortada do original (embedPage, continua vetor) com uma
     faixa de cabeçalho própria (número · assunto · banca) e o número novo por cima do antigo. Devolve {bytes, tec} — tec já
     com os retângulos no PDF novo (não precisa reconhecer de novo). */
  async build(srcs, { filter = 'all', keep = null, mats = null, skip = null, only = null, order = 'mix' } = {}, onStep = () => {}) {
    const lib = await PdfCache.loadLib(), PL = await loadPdfLib(), out = await PL.PDFDocument.create(), seen = this.seen();
    const font = await out.embedFont(PL.StandardFonts.Helvetica), bold = await out.embedFont(PL.StandardFonts.HelveticaBold);
    const items = [], byId = new Set();
    for (let si = 0; si < srcs.length; si++) {
      const S0 = srcs[si], blob = await Store.getBlob(S0.blobId); if (!blob) throw new Error(`o PDF "${S0.name}" não está mais no aparelho`);
      const buf = await blob.arrayBuffer(), doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise, pages = [];
      for (let i = 0; i < doc.numPages; i++) { onStep(`Lendo ${S0.name}: página ${i + 1} de ${doc.numPages}`); pages.push({ pg: i, lines: await PdfFind.pageLines(await doc.getPage(i + 1)) }); }
      const R = this.parse(pages); if (!Object.keys(R.q).length) throw new Error(`"${S0.name}" não parece um caderno impresso do TEC (precisa do cabeçalho "Com matéria e assunto")`);
      const pdl = await PL.PDFDocument.load(buf, { ignoreEncryption: true });
      for (const [num, q] of Object.entries(R.q)) { if (byId.has(q.id)) continue; byId.add(q.id); items.push({ q, num, g: R.gab[num] || null, R, pdl, doc, si }); }
      doc.destroy && doc.destroy();
    }
    /* v1.27: 'redo' = última resposta errada ou com dúvida (caderno de erros); 'everwrong' = já errou alguma vez */
    const ever = new Set(); if (filter === 'everwrong') for (const x of (StudyTimer.log && StudyTimer.log.qa) || []) if (x[6] === 'tec' && x[8] && !x[1]) ever.add(x[8]);
    const stOk = ({ q }) => { const s = seen.get(q.id); return filter === 'new' ? !s : filter === 'newwrong' ? !s || !s.ok || s.d : filter === 'redo' ? !!s && (!s.ok || !!s.d) : filter === 'everwrong' ? ever.has(q.id) || (!!s && !!s.d) : true; };
    const matCount = {}; for (const it of items) if (stOk(it)) matCount[it.q.mat || '—'] = (matCount[it.q.mat || '—'] || 0) + 1; /* v1.26: matérias (para os chips do caderno de erros), já com o filtro de situação */
    let list = items.filter((it) => { if (skip && skip.has(it.q.id)) return false; if (only && !only.has(it.q.id)) return false; if (mats && mats.length && !mats.includes(it.q.mat || '—')) return false; return stOk(it); });
    if (keep) list.sort((a, b) => (keep[a.q.id] || 1e9) - (keep[b.q.id] || 1e9)); else if (order === 'seq') list.sort((a, b) => a.si - b.si || +a.num - +b.num); /* v1.37: em ordem = a ordem dos PDFs (os novos no fim) e a de dentro de cada um */ else for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    if (!list.length) return { matCount, n: 0, empty: true };
    const ansi = (t) => String(t || '').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
    const fit = (t, f, sz, w) => { t = ansi(t); if (f.widthOfTextAtSize(t, sz) <= w) return t; while (t.length > 3 && f.widthOfTextAtSize(t + '...', sz) > w) t = t.slice(0, -1); return t + '...'; };
    const K = 0.75, M = 22, HB = 24, GAP = 14, TOP = 24;
    /* largura útil: a do original (margem esquerda do número espelhada) */
    const p0 = list[0].pdl.getPage(list[0].q.nr[0]).getSize(), left0 = Math.max(8, list[0].q.nr[1] - 8), cwPt = p0.width - 2 * left0 * K, W = cwPt + 2 * M, H = Math.round(W * 1.414);
    let page = null, pgN = -1, y = 0; const embC = new Map(), vis = {}, tq = {}, gab = {}, newPage = () => { page = out.addPage([W, H]); pgN++; y = TOP; };
    for (let k = 0; k < list.length; k++) {
      const { q, num, g, R, pdl } = list[k], n = keep ? String(keep[q.id] || k + 1) : String(k + 1); if (k % 10 === 0) onStep(`Montando a questão ${k + 1} de ${list.length}`);
      const PH = (pg) => pdl.getPage(pg).getSize().height / K, pm = (pg) => R.pm[pg] || { hb: 0, ft: PH(pg) }, ftOf = (pg) => Math.min(PH(pg), pm(pg).ft) - 4, hbOf = (pg) => pm(pg).hb + 4;
      const a = q.nr, z = q.e || q.end || a, y0 = a[2] - 6, y1 = (q.e ? z[2] + z[4] : z[1]) + 7, parts = [];
      if (a[0] === z[0]) parts.push([a[0], y0, y1]); else { parts.push([a[0], y0, ftOf(a[0])]); for (let pg = a[0] + 1; pg < z[0]; pg++) parts.push([pg, hbOf(pg), ftOf(pg)]); parts.push([z[0], hbOf(z[0]), y1]); }
      const left = Math.max(8, a[1] - 8), hTot = HB + 6 + parts.reduce((s, [, u, v]) => s + (v - u) * K, 0);
      if (!page || (y + hTot + 18 > H - 24 && y > TOP)) newPage();
      /* v1.23: cartão no estilo do app — borda suave arredondada, cabeçalho em pílula lilás, número em etiqueta roxa
         (tocar nela = dúvida), assunto · banca e "abrir no TEC ›" em roxo */
      const yTop = y, cx = M - 8, cw = cwPt + 16, hdY = yTop + 5, hdH = HB - 2, ACC = PL.rgb(0.486, 0.227, 0.929);
      const rr = (x0, y0, w, h, r) => `M ${x0 + r} ${y0} H ${x0 + w - r} Q ${x0 + w} ${y0} ${x0 + w} ${y0 + r} V ${y0 + h - r} Q ${x0 + w} ${y0 + h} ${x0 + w - r} ${y0 + h} H ${x0 + r} Q ${x0} ${y0 + h} ${x0} ${y0 + h - r} V ${y0 + r} Q ${x0} ${y0} ${x0 + r} ${y0} Z`;
      const cardH = HB + 10 + parts.reduce((s2, [, u, v]) => s2 + (v - u) * K, 0) + 8;
      page.drawSvgPath(rr(0, 0, cw, cardH, 10), { x: cx, y: H - yTop, color: PL.rgb(1, 1, 1), borderColor: PL.rgb(0.88, 0.89, 0.92), borderWidth: 0.8 });
      page.drawSvgPath(rr(0, 0, cw - 10, hdH, 7), { x: cx + 5, y: H - hdY, color: PL.rgb(0.953, 0.937, 0.992) });
      const nT = n, nW = bold.widthOfTextAtSize(nT, 9), bW = nW + 14, bx = cx + 10, by = hdY + 3.5, bH = hdH - 7;
      page.drawSvgPath(rr(0, 0, bW, bH, bH / 2), { x: bx, y: H - by, color: ACC });
      page.drawText(nT, { x: bx + 7, y: H - by - bH + 3.6, size: 9, font: bold, color: PL.rgb(1, 1, 1) });
      const bs = (q.banca || '').split(' ')[0] + ' · ' + ((q.banca || '').split(' - ').slice(1).join(' - ').split('/').slice(-2).join('/')), tecT = `TEC nº ${num}  >`, /* v1.24: posição da questão no caderno impresso do TEC (o número original) */ tecW = font.widthOfTextAtSize(tecT, 8);
      page.drawText(fit(`${q.ass || q.mat}  ·  ${bs}`, font, 8.5, cw - bW - tecW - 50), { x: bx + bW + 9, y: H - hdY - hdH + 6.6, size: 8.5, font, color: PL.rgb(0.29, 0.33, 0.39) });
      page.drawText(tecT, { x: cx + cw - 14 - tecW, y: H - hdY - hdH + 6.6, size: 8, font: bold, color: ACC });
      const badge = [pgN, Math.round(bx / K * 10) / 10, Math.round(by / K * 10) / 10, Math.round(bW / K * 10) / 10, Math.round(bH / K * 10) / 10];
      y += HB + 10;
      const map = {}, put = (r) => { if (!r) return null; const P = map[r[0]]; if (!P) return null; for (const [u, v, yy] of P) if (r[2] >= u - 2 && r[2] <= v + 2) return [pgN, Math.round((M / K + r[1] - left) * 10) / 10, Math.round((yy / K + r[2] - u) * 10) / 10, r[3], r[4]]; return null; };
      for (const [pg, u, v] of parts) {
        /* a página de origem é embutida UMA vez (cache por documento) e só o recorte aparece (clip) — embutir por recorte repetia a página inteira (30 MB) */
        const sp = pdl.getPage(pg), Hs = sp.getSize().height, emb = (embC.get(pdl) || (embC.set(pdl, await out.embedPages(pdl.getPages())), embC.get(pdl)))[pg], hp = (v - u) * K, by = H - y - hp;
        page.pushOperators(PL.pushGraphicsState(), PL.rectangle(M, by, cwPt, hp), PL.clip(), PL.endPath());
        page.drawPage(emb, { x: M - left * K, y: by - (Hs - v * K) });
        page.pushOperators(PL.popGraphicsState());
        (map[pg] = map[pg] || []).push([u, v, y]); (vis[pgN] = vis[pgN] || []).push([list[k].si, pg, u, v, left, Math.round(y / K * 10) / 10]); y += (v - u) * K;
      }
      const onr = put(q.nr); if (onr) { const [, x, yy, w, h] = onr; page.drawRectangle({ x: x * K - 1, y: H - (yy + h) * K, width: w * K + 3, height: h * K, color: PL.rgb(1, 1, 1) }); } /* o número antigo some: o novo está na etiqueta */
      const nr = badge;
      /* v1.27: Certo/Errado viram dois botões lado a lado (pílulas brancas com borda); c/e passam a ser os retângulos dos botões */
      let cB = put(q.c), eB = put(q.e);
      if (cB && eB && cB[0] === eB[0]) {
        const x0 = cB[1], y0 = cB[2], hh = eB[2] + eB[4] - y0; page.drawRectangle({ x: x0 * K - 2, y: H - (y0 + hh) * K - 1, width: Math.max(cB[3], eB[3]) * K + 4, height: hh * K + 2, color: PL.rgb(1, 1, 1) });
        const bh = 15, by0 = (y0 + hh / 2) * K - bh / 2, mk = (lab, bx) => { const tw = bold.widthOfTextAtSize(lab, 9), bw = tw + 22; page.drawSvgPath(rr(0, 0, bw, bh, 7.5), { x: bx, y: H - by0, color: PL.rgb(1, 1, 1), borderColor: PL.rgb(0.78, 0.8, 0.85), borderWidth: 0.9 }); page.drawText(lab, { x: bx + 11, y: H - by0 - bh + 4.4, size: 9, font: bold, color: PL.rgb(0.2, 0.24, 0.3) }); return [pgN, Math.round(bx / K * 10) / 10, Math.round(by0 / K * 10) / 10, Math.round(bw / K * 10) / 10, Math.round(bh / K * 10) / 10]; };
        cB = mk('Certo', x0 * K - 2); eB = mk('Errado', cB[1] * K + cB[3] * K + 8); cB.push(1); eB.push(1);
      }
      tq[n] = { bot: Math.round((yTop + cardH) / K * 10) / 10, id: q.id, banca: q.banca, mat: q.mat, ass: q.ass, c: cB, e: eB, btn: cB && cB[5] ? 1 : 0, nr, top: [pgN, Math.round(yTop / K * 10) / 10], hd: [pgN, (cx + 5) / K, hdY / K, (cw - 10) / K, hdH / K], on: num }; if (Tec._dbg) tq[n]._d = { parts, src: [q.nr, q.c, q.e], map: JSON.parse(JSON.stringify(map)) };
      gab[n] = g; y = yTop + cardH + GAP;
    }
    return { matCount, bytes: await out.save(), tec: { v: 3, built: 1, gab, q: tq, ans: {}, d: {}, gb: null, vis, mx: M / K, srcs: srcs.map((x) => ({ name: x.name, blobId: x.blobId })) }, total: items.length, n: list.length };
  },
  /* cria a nota com o PDF montado (pasta: a pasta-matéria com o nome da matéria, senão a pasta aberta) */
  async makeNote(R, title, folderId) {
    const file = new File([R.bytes], (title || 'caderno') + '.pdf', { type: 'application/pdf' }), pages = await importPdfFile(file);
    const note = newNote({ title, folderId, mode: 'pages', template: { ...Store.settings.template, type: 'blank' } });
    note.pages = pages; note.tec = { ...R.tec, blob: pages[0].pdf.blobId }; this.reg(note); await Store.putNote(note); return note;
  },
  /* v1.23: o PDF montado guarda, fora dos recortes, o texto invisível das páginas de origem — a busca e o marca-texto leem
     o texto pelos recortes (vis: página nova → [origem, página, y0, y1, esquerda, y na página nova]) direto dos PDFs de origem */
  _virt: new Map(),
  reg(note) { const T = note && note.tec; if (T && T.built && T.vis && T.srcs) this._virt.set(T.blob, T); },
  async virtLines(ref) {
    const T = this._virt.get(ref.blobId); if (!T) return null; const out = (T.rt && T.rt[ref.index] || []).map((L) => L.slice()); /* cadernos montados na v1.30.0 (texto refeito, desfeito na v1.30.1) continuam com busca */
    for (const [si, pg, u, v, left, yy] of T.vis[ref.index] || []) { const S0 = T.srcs[si]; if (!S0) continue; let L; try { L = await PdfFind.readPage({ blobId: S0.blobId, index: pg }); } catch (e) { continue; }
      for (const [t, y, h, segs] of L) if (y >= u - 1 && y + h <= v + 1) out.push([t, Math.round((y - u + yy) * 10) / 10, h, segs.map(([st, x, w, n]) => [st, Math.round((x - left + T.mx) * 10) / 10, w, n])]); }
    return out.sort((a, b) => a[1] - b[1]);
  },
  /* biblioteca → "Importar questões do TEC": escolhe 1 ou mais PDFs */
  /* ⋯ da nota → "Reorganizar questões": monta OUTRO caderno com um filtro, a partir dos mesmos PDFs (o atual não muda) */
  /* v1.35: ⋯ → "Reorganizar questões" remonta ESTE caderno (antes criava outro) */
  reorgPop(note, anchor) {
    const T = note.tec, srcs = T.srcs || [{ name: note.title, blobId: T.blob }], keep = {}; if (T.built) for (const [n, q] of Object.entries(T.q)) keep[q.id] = +n;
    const go = async (filter, lab) => {
      closePop(); if (this._mounting) return;
      if (!(await confirmBox('Reorganizar este caderno', filter === 'new' ? 'As questões que você já fez saem deste caderno (continuam no histórico e no caderno de erros). O que você escreveu nas que ficam vai junto com elas.' : 'As que você já respondeu aqui voltam limpas, para fazer de novo (o histórico continua). O que você escreveu nas não respondidas vai junto com elas.', 'Reorganizar'))) return;
      this._mounting = true;
      try { const r = await this.remount(note, srcs, { filter, keep: filter === 'all' || !T.built ? null : keep });
        toast(r.empty ? 'Nenhuma questão nesse filtro — você já fez todas 🎉' : `${r.R.n} questões no caderno (${lab})`, 3000);
      } catch (e) { logError(e, 'reorganizar caderno'); toast('Não deu para reorganizar: ' + e.message, 6000); }
      finally { this._mounting = false; }
    };
    const M = this.seen(), ids = Object.values(T.q).map((q) => q.id), nNew = ids.filter((id) => !M.get(id)).length, nWrong = ids.filter((id) => { const s = M.get(id); return s && (!s.ok || s.d); }).length;
    const b = (lab, sub, fn) => { const x = el('button', { class: 'nm-item', onclick: fn }); x.append(iconEl('refresh'), el('span', {}, lab, el('small', {}, sub))); return x; };
    openPop(anchor, el('div', { class: 'nmenu' }, el('div', { class: 'nm-head' }, el('div', {}, el('b', {}, 'Reorganizar questões'), el('small', {}, 'remonta este caderno'))),
      el('div', { class: 'nm-list' }, b('Só as que não fiz', `${nNew} questões`, () => go('new', 'só as não feitas')), b('As que não fiz + as que errei', `${nNew + nWrong} questões (erradas ou com dúvida: ${nWrong})`, () => go('newwrong', 'não feitas e erradas')), b('Todas, embaralhadas de novo', `${ids.length} questões`, () => go('all', 'embaralhadas')))));
  },
  /* ===== v1.26: caderno de respostas (nota "inteligente") =====
     note.bank = {mats: [matérias] | null (todas), st: 'all'|'new'|'newwrong', all: {matéria: nº}, ink: {idTEC: [elementos com y
     relativo ao topo do cartão]}}. Junta as questões de TODOS os cadernos do TEC (notas com note.tec, menos outros cadernos de
     respostas) e se remonta na MESMA nota quando o filtro muda; o que foi escrito em cada cartão é guardado por questão e volta
     com ela. As respostas ficam no histórico (log.qa): uma questão já feita aparece com a etiqueta "já feita" (ou escondida, se
     acertada sem dúvida). */
  async bankSources() {
    const out = [], seenB = new Set();
    for (const id of Object.keys(Store.heads)) { let n; try { n = await DB.get('notes', id); } catch (_) { n = null; } const T = n && n.tec; if (!T || n.bank) continue;
      for (const s0 of T.built ? T.srcs || [] : [{ name: n.title, blobId: T.blob }]) if (s0 && s0.blobId && !seenB.has(s0.blobId)) { seenB.add(s0.blobId); out.push({ name: s0.name, blobId: s0.blobId }); } }
    return out;
  },
  TAGS: ['tq', 'tqd', 'tqr', 'tqh', 'tqx', 'tqg'],
  isTag(e) { return this.TAGS.some((k) => e[k] != null); },
  /* v1.28: um caderno de erros fixo (S.tecErrNote) — o + da biblioteca abre o mesmo; na 1ª vez pergunta a pasta. Um caderno
     criado nas versões 1.26/1.27 (note.bank) é adotado. */
  async bankFind() {
    const S = Store.settings, id = S.tecErrNote; if (id && Store.heads[id]) return id;
    for (const k of Object.keys(Store.heads)) { let n; try { n = await DB.get('notes', k); } catch (_) { n = null; } if (n && n.bank) { S.tecErrNote = k; Store.saveSettings(); return k; } }
    return null;
  },
  async bankCreate() {
    const have = await this.bankFind(); if (have) { App.openNote(have); return; }
    const folder = typeof Library !== 'undefined' ? await Library.folderPicker('Onde fica o caderno de erros?', new Set(), Library.folder) : null; if (folder === undefined) return;
    try {
      toast('Juntando os cadernos do TEC…', 60000); const srcs = await this.bankSources(); if (!srcs.length) { toast('Nenhum caderno do TEC ainda — importe ou abra um PDF do TEC primeiro', 4000); return; }
      const R = await this.build(srcs, { filter: 'redo' }, (m) => toast(m, 60000)); if (R.empty) { toast('Nenhum erro para refazer nos cadernos do TEC 🎉', 3500); return; }
      const note = await this.makeNote(R, 'Caderno de erros', folder);
      note.bank = { mats: null, st: 'redo', all: R.matCount, ink: {} }; await Store.putNote(note); Store.settings.tecErrNote = note.id; Store.saveSettings(); toast(`📕 Caderno de erros: ${R.n} questões para refazer`, 3500);
      if (typeof Library !== 'undefined') Library.render(); App.openNote(note.id);
    } catch (e) { logError(e, 'caderno de respostas'); toast('Não deu para montar: ' + e.message, 6000); }
  },
  /* remonta com o filtro: guarda a escrita por questão, gera o PDF novo, põe a escrita de volta e reabre a nota */
  async bankMount(note, mats, st) {
    if (this._mounting) return; this._mounting = true;
    try {
      this.reconcile(note); const T = note.tec, B = note.bank, ink = {};
      /* v1.31.2: sem spoiler — o caderno de erros não traz escrita antiga (nem da origem nem de tentativa anterior aqui); só
         fica a escrita das questões ainda NÃO respondidas nesta montagem (rascunho em andamento ao tocar em Atualizar) */
      const answered = new Set(Object.keys(T.ans).map((n) => T.q[n] && T.q[n].id).filter(Boolean)), pk = this.inkPack(note), loose = pk.loose;
      for (const [id, els] of Object.entries(pk.byId)) if (!answered.has(id)) ink[id] = els;
      const srcs = await this.bankSources(); toast('Montando o caderno…', 60000);
      const R = await this.build(srcs, { filter: st, mats }, (m) => toast(m, 60000));
      if (R.empty) { B.all = R.matCount; await Store.putNote(note); toast('Nenhuma questão nesse filtro 🎉', 3500); return; }
      const oldBlob = T.blob, file = new File([R.bytes], 'caderno.pdf', { type: 'application/pdf' }), pages = await importPdfFile(file);
      const T2 = { ...R.tec, blob: pages[0].pdf.blobId };
      this.inkPlace(pages, T2, ink); this.keepScratch(note.pages, pages); this.fitScratch(pages);
      if (loose.length && pages[0]) pages[0].elements.push(...loose);
      await Editor.close();
      note.pages = pages; note.tec = T2; note.bank = { mats: mats && mats.length ? mats : null, st, all: R.matCount, ink: {} }; this.reg(note);
      await Store.putNote(note); try { await DB.del('blobs', oldBlob); } catch (_) {}
      App._busy = false; await App.openNote(note.id); toast(`📕 ${R.n} questões no caderno de erros`, 2500);
    } catch (e) { logError(e, 'remontar caderno de respostas'); toast('Não deu para remontar: ' + e.message, 6000); }
    finally { this._mounting = false; }
  },
  /* barra do caderno de respostas: pílula no alto ("📚 Informática · não feitas · 120 ▾") → janela com os filtros */
  bankBar(note) {
    let bar = document.getElementById('tecBank'), rf = document.getElementById('tecBankRf'); if (!note || !note.bank) { if (bar) bar.remove(); if (rf) rf.remove(); return; }
    if (!rf) { rf = el('button', { id: 'tecBankRf', class: 'tec-bank-rf', title: 'Atualizar: tira as que você já acertou de novo e traz os erros novos' }); rf.innerHTML = icon('refresh') + '<span>Atualizar</span>'; $('#editor').append(rf); }
    rf.onclick = () => this.bankMount(note, note.bank.mats, note.bank.st === 'everwrong' ? 'everwrong' : 'redo'); /* v1.28 */
    const B = note.bank, ST = { all: 'todas', new: 'não feitas', newwrong: 'não feitas + erradas', redo: 'para refazer', everwrong: 'todas que já errei' }, n = Object.keys(note.tec.q).length;
    if (!bar) { bar = el('button', { id: 'tecBank', class: 'tec-bank' }); $('#editor').append(bar); }
    bar.textContent = `📕 ${B.mats ? B.mats.join(' + ') : 'Todas as matérias'} · ${ST[B.st] || 'todas'} · ${n} ▾`;
    bar.onclick = () => this.bankPop(note, bar);
  },
  bankPop(note, anchor) {
    const B = note.bank, all = B.all || {}, names = Object.keys(all).sort((a, b) => a.localeCompare(b)), sel = new Set(B.mats || []); let st = B.st === 'everwrong' ? 'everwrong' : 'redo';
    const box = el('div', { class: 'tec-bpop' }), paint = () => {
      box.innerHTML = '';
      const chip = (lab, on, fn, sub) => el('button', { class: 'tm-chip' + (on ? ' on' : ''), onclick: () => { fn(); paint(); } }, lab, sub != null ? el('small', {}, ' ' + sub) : null);
      box.append(el('div', { class: 'er-head' }, el('b', {}, '📕 Caderno de erros'), el('small', {}, 'as questões que você errou ou acertou com dúvida, de todos os cadernos do TEC')),
        el('div', { class: 'tm-hint' }, 'Matérias'),
        el('div', { class: 'pl-chips' }, chip('Todas', !sel.size, () => sel.clear(), names.reduce((s, k) => s + all[k], 0)), ...names.map((k) => chip(k, sel.has(k), () => (sel.has(k) ? sel.delete(k) : sel.add(k)), all[k]))),
        el('div', { class: 'tm-hint' }, 'Situação'),
        el('div', { class: 'pl-chips' }, ...[['redo', 'Para refazer'], ['everwrong', 'Todas que já errei']].map(([k, l]) => chip(l, st === k, () => { st = k; }))),
        el('div', { class: 'pl-btns' }, el('button', { class: 'btn ghost', onclick: () => closePop() }, 'Cancelar'), el('button', { class: 'btn primary', onclick: () => { closePop(); this.bankMount(note, [...sel], st); } }, 'Montar (embaralhado)')),
        el('small', { class: 'tm-hint' }, 'O que você escreveu em cada questão fica guardado e volta quando ela aparecer de novo.'));
    };
    paint(); openPop(anchor, box);
  },
  /* do caderno de erros: abre a nota na questão */
  async goErr(x) { if (!Store.heads[x.n]) return toast('A nota deste caderno não existe mais', 2000); if (!Editor.note || Editor.note.id !== x.n) await App.openNote(x.n); const T = Editor.note && Editor.note.tec; if (!T) return;
    let num = x.tec.num; if (x.tec.id && (!T.q[num] || T.q[num].id !== x.tec.id)) { num = Object.keys(T.q).find((k) => T.q[k].id === x.tec.id); if (!num) return toast('Essa questão já saiu deste caderno (foi respondida antes de adicionar questões) — use o botão TEC', 3500); } /* v1.31: o caderno pode ter sido remontado */
    this.goTo(x.n, T.q[num], T.blob); },
  /* v1.31.1: escrita por questão ("margem separada por questão") — cada questão é dona de tudo que está entre o topo dela e o
     topo da próxima (cartão, vão entre cartões e margem de rascunho; páginas seguintes sem cartão = continuação). Guardado
     com y relativo ao topo do cartão (somando as alturas das páginas do meio); x fica igual (mesma largura do caderno). */
  inkPack(note, tags) {
    const T = note.tec, cards = Object.values(T.q).filter((q) => q.top).sort((a, b) => a.top[0] - b.top[0] || a.top[1] - b.top[1]), byId = {}, loose = [];
    const pgOf = (idx) => note.pages.findIndex((p) => p.pdf && p.pdf.blobId === T.blob && p.pdf.index === idx);
    const cp = cards.map((q) => ({ q, pi: pgOf(q.top[0]) }));
    note.pages.forEach((p, pi) => { for (const e of p.elements) { if (this.isTag(e) && !(tags && e.tqg == null)) continue; const b = elBBox(e); if (!b) continue; const cy = b.y + b.h / 2;
      let own = null; for (const c of cp) { if (c.pi < 0) continue; if (c.pi < pi || (c.pi === pi && c.q.top[1] <= cy + 0.5)) own = c; else break; }
      if (!own) { loose.push(e); continue; }
      let off = 0; for (let k = own.pi; k < pi; k++) off += note.pages[k].h;
      (byId[own.q.id] = byId[own.q.id] || []).push(transformEl(e, { sx: 1, sy: 1, ox: 0, oy: 0, dx: 0, dy: off - own.q.top[1] })); } });
    return { byId, loose };
  },
  /* põe a escrita guardada (y relativo) no cartão novo; se passar do fim da página, continua na(s) seguinte(s) */
  inkPlace(pages, T2, byId) {
    for (const q of Object.values(T2.q)) { const els = byId[q.id]; if (!els || !q.top) continue; let pi = q.top[0]; if (!pages[pi]) continue;
      for (const e of els) { let k = pi, y = q.top[1]; const b = elBBox(e); let cy = b ? b.y + b.h / 2 + y : y; while (pages[k + 1] && cy > pages[k].h) { cy -= pages[k].h; y -= pages[k].h; k++; } pages[k].elements.push(transformEl(e, { sx: 1, sy: 1, ox: 0, oy: 0, dx: 0, dy: y })); } }
  },
  /* v1.31.1: y (unidades da página) dos topos das questões de uma página — linhas que separam a margem por questão */
  marginTops(note, page) { const n = note || (typeof Editor !== 'undefined' && Editor.note), T = n && n.tec; if (!T || !page.pdf || page.pdf.blobId !== T.blob) return null;
    if (!T._mt || T._mt.n !== Object.keys(T.q).length) { const m = {}; for (const q of Object.values(T.q)) if (q.top) (m[q.top[0]] = m[q.top[0]] || []).push(q.top[1] - 2); Object.defineProperty(T, '_mt', { value: { n: Object.keys(T.q).length, m }, configurable: true, writable: true }); }
    return T._mt.m[page.pdf.index] || null; },
  /* mantém a largura da margem de rascunho do caderno antigo nas páginas novas */
  keepScratch(oldPages, pages) { const P = oldPages.find((p) => p.pdf && p.pdfW && p.pdfW < p.w); if (!P) return; const k = P.w / P.pdfW; for (const p of pages) { if (!p.pdf) continue; p.pdfW = p.w; p.w = Math.round(p.w * k); } },
  /* escrita que veio de uma margem e ficou fora da página → liga/aumenta o rascunho ao lado (40/60/80/100%) para ela aparecer */
  fitScratch(pages) {
    let need = 0; for (const p of pages) { if (!p.pdf) continue; const w0 = p.pdfW || p.w; for (const e of p.elements) { const b = elBBox(e); if (b && b.x + b.w > w0) need = Math.max(need, (b.x + b.w + 12 - w0) / w0); } }
    if (!need) return; const k = [0.4, 0.6, 0.8, 1, 1.5].find((v) => v >= need) || 1.5;
    for (const p of pages) { if (!p.pdf) continue; const w0 = p.pdfW || p.w; if (p.pdfW && p.w >= Math.round(w0 * (1 + k))) continue; p.pdfW = w0; p.w = Math.round(w0 * (1 + k)); }
  },
  /* v1.32: caderno de questões da matéria — criado junto com a pasta-matéria (f.qNote), vazio até o 1º PDF */
  qbookOf(f) { return f && f.qNote && Store.heads[f.qNote] ? f.qNote : null; },
  async qbook(f) {
    const id = this.qbookOf(f); if (id) return id;
    const note = newNote({ title: `Questões — ${f.name}`, folderId: f.id, mode: 'pages', template: { ...Store.settings.template, type: 'blank' } });
    const pg = note.pages[0]; if (pg) pg.elements.push({ id: uid(), type: 'text', x: 60, y: 80, w: Math.max(300, (pg.w || 794) - 120), text: `Caderno de questões de ${f.name}.\n\nPara pôr questões: ⋯ (em cima, à direita) → "Adicionar questões (PDF)", ou o botão "Adicionar questões" dentro da pasta da matéria. Pode escolher vários PDFs do TEC de uma vez; a cada vez, as que você já respondeu saem e as novas entram embaralhadas.`, size: 18, color: '#475569', tqg: 1 });
    note.tec = { v: 3, built: 1, gab: {}, q: {}, ans: {}, d: {}, gb: null, vis: {}, srcs: [], blob: null };
    await Store.putNote(note); f.qNote = note.id; await Store.saveFolders(); if (typeof Drive !== 'undefined') Drive.schedule(); return note.id;
  },
  /* botão "Adicionar questões" (dentro da pasta-matéria / ⋯ da pasta) */
  async addToSubject(f) {
    try { const id = await this.qbook(f); if (typeof Library !== 'undefined' && Editor && !Editor.note) Library.render(); /* v1.37.1: o caderno aparece na pasta já agora */ const note = await Store.getNote(id); if (note) await this.addFlow(note); } catch (e) { logError(e, 'adicionar questões'); toast('Não deu para abrir o caderno de questões: ' + e.message, 5000); }
  },
  /* v1.33: janela antes de escolher os PDFs — mostra até onde você imprimiu da última vez e pergunta até onde vai o de agora */
  async askTopic(note) {
    const L = (note.tec && note.tec.topics) || [], last = L[L.length - 1], fd = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const inp = el('input', { type: 'text', placeholder: 'ex.: Pronomes demonstrativos (opcional)' });
    const body = el('div', { class: 'tec-topic' },
      last ? el('div', { class: 'tt-last' }, el('small', {}, 'Da última vez você parou em'), el('b', {}, last.txt), el('span', {}, `${fd(last.t)}${last.n != null ? ` · ${last.n} questões novas` : ''}`)) : el('p', { class: 'lbl-sm' }, 'Ainda não há tópico anotado neste caderno.'),
      L.length > 1 ? el('div', { class: 'tt-hist' }, el('small', {}, 'Antes:'), ...L.slice(-5, -1).reverse().map((x) => el('div', {}, `${fd(x.t)} · ${x.txt}`))) : null,
      el('div', { class: 'field' }, el('label', {}, 'Até qual tópico vai o PDF de agora?'), inp),
      el('p', { class: 'lbl-sm' }, 'Fica guardado neste caderno para você saber de onde continuar no TEC na próxima vez.'));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') body.closest('.modal').querySelector('.btn.primary').click(); });
    const r = await openModal({ title: `Adicionar questões — ${note.title.replace(/^Questões — /, '')}`, body, focus: true, buttons: [{ label: 'Cancelar' }, { label: 'Escolher PDFs', cls: 'primary', action: () => ({ txt: inp.value.trim() }) }] });
    return r && typeof r === 'object' ? r.txt : null;
  },
  /* v1.31: ⋯ → "Adicionar questões (PDF)": junta PDFs novos ao caderno montado (um caderno por matéria que vai crescendo).
     As já respondidas NESTA nota saem; as que faltam + as novas são embaralhadas (sem repetidas, por id); a escrita de cada
     questão que continua volta para o cartão dela (mesmo esquema do bankMount); os PDFs de origem viram T.srcs. */
  /* v1.35: remonta o caderno NA MESMA nota (usado por "Adicionar questões" e "Reorganizar"). Respondidas nesta nota: a escrita
     vai para note.tecOut e, se voltarem pelo filtro, voltam limpas (ans zerado); as não respondidas levam a escrita junto. */
  async remount(note, srcs, bopts, after) {
    const T = note.tec; this.reconcile(note);
    const done = new Set(Object.keys(T.ans).map((n) => T.q[n] && T.q[n].id).filter(Boolean)), oldIds = new Set(Object.values(T.q).map((q) => q.id));
    const { byId: ink, loose } = this.inkPack(note), out = { ...(note.tecOut || {}) };
    for (const id of done) if (ink[id]) { out[id] = ink[id]; delete ink[id]; } /* v1.31.1: a escrita das que saem vai junto com elas */
    const R = await this.build(srcs, bopts, (m) => toast(m, 60000));
    if (!R || R.empty) return { empty: true };
    const novas = Object.values(R.tec.q).filter((q) => !oldIds.has(q.id)).length;
    const oldBlob = T.blob, file = new File([R.bytes], 'caderno.pdf', { type: 'application/pdf' }), pages = await importPdfFile(file);
    const T2 = { ...R.tec, blob: pages[0].pdf.blobId, topics: (T.topics || []).slice(), ord: bopts.order || T.ord }; if (after) after(T2, novas);
    this.inkPlace(pages, T2, ink); this.keepScratch(note.pages, pages); this.fitScratch(pages);
    if (loose.length && pages[0]) pages[0].elements.push(...loose);
    await Editor.close();
    note.pages = pages; note.tec = T2; note.tecOut = out; this.reg(note);
    await Store.putNote(note); if (oldBlob && !srcs.some((x) => x.blobId === oldBlob)) { try { await DB.del('blobs', oldBlob); } catch (_) {} }
    App._busy = false; await App.openNote(note.id);
    return { R, novas, done };
  },
  /* v1.37: ordem do caderno (interruptor no ⋯): 'seq' = como o TEC imprimiu (PDFs na ordem em que entraram), 'mix' = embaralhado.
     Sem T.ord: caderno com questões = 'mix' (era assim até a v1.36), vazio = 'seq'. Vale para o "Adicionar questões" também. */
  ordOf(T) { return T.ord || (Object.keys((T && T.q) || {}).length ? 'mix' : 'seq'); },
  /* troca a ordem SEM perder nada: mesmas questões (only), respostas, dúvidas, marcas e escrita vão junto (números trocados) */
  async setOrder(note, ord) {
    const T = note && note.tec; if (!T || !T.built || this._mounting || this.ordOf(T) === ord) return;
    if (!Object.keys(T.q).length) { T.ord = ord; Editor.markChanged(); return; }
    this._mounting = true;
    try {
      this.reconcile(note);
      const idOf = {}; for (const [n, q] of Object.entries(T.q)) idOf[n] = q.id;
      const { byId: ink, loose } = this.inkPack(note, true), srcs = T.srcs || [{ name: note.title, blobId: T.blob }];
      const R = await this.build(srcs, { order: ord, only: new Set(Object.values(idOf)) }, (m) => toast(m, 60000));
      if (!R || R.empty) return;
      const numOf = {}; for (const [n, q] of Object.entries(R.tec.q)) numOf[q.id] = n;
      const map = (k) => (idOf[k] != null && numOf[idOf[k]] != null ? numOf[idOf[k]] : null), remap = (o) => { const r = {}; for (const [k, v] of Object.entries(o || {})) { const n = map(k); if (n != null) r[n] = v; } return r; };
      for (const els of Object.values(ink)) for (const e of els) for (const k of this.TAGS) if (k !== 'tqg' && e[k] != null) { const n = map(String(e[k])); if (n != null) e[k] = typeof e[k] === 'number' ? +n : n; }
      const oldBlob = T.blob, pages = await importPdfFile(new File([R.bytes], 'caderno.pdf', { type: 'application/pdf' }));
      const T2 = { ...R.tec, blob: pages[0].pdf.blobId, topics: (T.topics || []).slice(), ord, ans: remap(T.ans), d: remap(T.d), rep: remap(T.rep), shown: remap(T.shown) };
      this.inkPlace(pages, T2, ink); this.keepScratch(note.pages, pages);
      if (loose.length && pages[0]) pages[0].elements.push(...loose);
      await Editor.close();
      note.pages = pages; note.tec = T2; this.reg(note);
      await Store.putNote(note); if (oldBlob && !srcs.some((x) => x.blobId === oldBlob)) { try { await DB.del('blobs', oldBlob); } catch (_) {} }
      App._busy = false; await App.openNote(note.id);
      toast(ord === 'seq' ? 'Questões em ordem' : 'Questões embaralhadas', 1600);
    } catch (e) { logError(e, 'ordem do caderno'); toast('Não deu para mudar a ordem: ' + e.message, 6000); }
    finally { this._mounting = false; }
  },
  async addFlow(note) {
    const T = note && note.tec; if (!T || !T.built || this._mounting) return;
    const topic = await this.askTopic(note); if (topic == null) return; /* v1.33: até onde vai este PDF (fica guardado) */
    const files = await pickFile('application/pdf', true); if (!files || !files.length) return;
    this._mounting = true;
    try {
      toast('Lendo os PDFs…', 60000); const add = [];
      for (const f of files) add.push({ name: f.name.replace(/\.pdf$/i, ''), blobId: await Store.putBlob(new Blob([await f.arrayBuffer()], { type: 'application/pdf' })) });
      const done = new Set(Object.keys(T.ans).map((n) => T.q[n] && T.q[n].id).filter(Boolean));
      const r = await this.remount(note, [...(T.srcs || [{ name: note.title, blobId: T.blob }]), ...add], { skip: done, order: this.ordOf(T) }, (T2, novas) => { if (topic) T2.topics = [...T2.topics, { t: Date.now(), txt: topic, n: novas }].slice(-30); });
      if (r.empty) { toast('Nenhuma questão para o caderno: as dos PDFs novos já estão nele ou já foram respondidas', 4000); return; }
      toast(`➕ ${r.novas} questões novas · ${r.R.n} no caderno${this.ordOf(T) === 'seq' ? ', em ordem' : ', embaralhadas'}${r.done.size ? ` (as ${r.done.size} já respondidas saíram)` : ''}`, 5000);
    } catch (e) { logError(e, 'adicionar questões'); toast('Não deu para adicionar: ' + e.message, 6000); }
    finally { this._mounting = false; }
  },
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

/* v1.24: desfazer/refazer no editor → as respostas do TEC acompanham as marcas (Tec.reconcile) */
(() => { for (const k of ['undo', 'redo']) { const f = Editor[k]; if (typeof f !== 'function') continue; Editor[k] = function (...a) { const r = f.apply(this, a); try { if (this.note && this.note.tec) Tec.reconcile(this.note); } catch (e) { console.warn(e); } return r; }; } })();
