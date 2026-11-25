'use strict';
/* ===== v1.14 — Plano de estudos (o cronograma da semana vira as metas) e caderno de erros =====
   Fica em StudyTimer.log.plan (vai junto do histórico de estudo no backup, estudo.json):
     plans:  [{id, name, days: {0..6 (getDay): [{id, f: idDaPastaMatéria, k: 'e' estudo | 'q' questões, min}]}, hist: [{until, days}]}]
     cycle:  {start: 'AAAA-MM-DD' (segunda), seq: [idDoPlano…] (ex.: Foco, Foco, Foco, Recuperação), anchors: [{from: segunda, pos}]}
     weeks:  {'segunda': {plan: id | '-' (descanso), days?: {…} (cópia editada só para aquela semana)}}
   A semana do ciclo = (pos da âncora mais recente) + semanas desde ela; "esta semana é a semana N" grava uma âncora (as semanas
   anteriores não mudam). Editar um plano vale da semana atual em diante (o que valia antes fica em hist).
   Caderno de erros: StudyTimer.log.errs = [{id, t, f (matéria), n (nota), aula, q, txt, done}] — perguntado a cada ✗. */
const PL_DOW = [1, 2, 3, 4, 5, 6, 0], PL_DN = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 0: 'Dom' };
const StudyPlan = {
  data() { const L = typeof StudyTimer !== 'undefined' && StudyTimer.log; return (L && L.plan) || null; },
  ensure() {
    const L = StudyTimer.log;
    if (!L.plan) { const f = { id: uid(), name: 'Foco', days: {} }, r = { id: uid(), name: 'Recuperação', days: {} }; L.plan = { plans: [f, r], cycle: { start: null, seq: [f.id, f.id, f.id, r.id], anchors: [] }, weeks: {} }; }
    return L.plan;
  },
  save() { StudyTimer.saveLog(); },
  dk(t) { return StudyTimer.dayKey(typeof t === 'string' ? Date.parse(t + 'T12:00') : t); },
  dateOf(t) { return typeof t === 'string' ? new Date(t + 'T12:00') : new Date(t); },
  monOf(t) { const d = this.dateOf(t); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return StudyTimer.dayKey(d.getTime()); },
  addW(mon, n) { const d = this.dateOf(mon); d.setDate(d.getDate() + 7 * n); return StudyTimer.dayKey(d.getTime()); },
  weeksBetween(a, b) { return Math.round((Date.parse(b + 'T12:00') - Date.parse(a + 'T12:00')) / 6048e5); },
  plan(id) { const P = this.data(); return (P && P.plans.find((p) => p.id === id)) || null; },
  planDays(p, mon) { const h = (p.hist || []).find((x) => mon <= x.until); return h ? h.days : p.days; },
  active() { const P = this.data(); return !!(P && P.cycle && P.cycle.start && P.cycle.seq.length); },
  subjects() { return Store.folders.filter((f) => f.subject).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); },
  /* informação da semana de t: {mon, pos, n, pid, name, days, custom} — null = sem plano (valem as metas antigas) */
  week(t) {
    const P = this.data(); if (!P || !P.plans.length) return null;
    const mon = this.monOf(t), C = P.cycle || {}, W = (P.weeks || {})[mon], n = (C.seq || []).length;
    let pos = null, pid = null;
    if (C.start && n && mon >= C.start) {
      const A = [{ from: C.start, pos: 0 }, ...(C.anchors || [])].filter((a) => a.from <= mon && a.from >= C.start).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)).pop();
      pos = (((A.pos + this.weeksBetween(A.from, mon)) % n) + n) % n; pid = C.seq[pos];
    }
    if (W && W.plan) pid = W.plan;
    if (!pid && !(W && W.days)) return null;
    const p = pid && pid !== '-' ? this.plan(pid) : null;
    return { mon, pos, n, pid, custom: !!(W && W.days), days: W && W.days ? W.days : p ? this.planDays(p, mon) : {}, name: pid === '-' ? 'Descanso' : p ? p.name : 'Só esta semana' };
  },
  dayItems(t) { const w = this.week(t); return w ? w.days[this.dateOf(t).getDay()] || [] : null; },
  goalFor(key, t, k) { const it = this.dayItems(t); return it ? it.filter((x) => x.f === key && x.k === k).reduce((s, x) => s + x.min, 0) * 60000 : null; },
  /* antes de mudar um plano: guarda como ele era até o domingo passado (as semanas que já passaram não mudam) */
  keepHist(p) {
    const P = this.data(), cur = this.monOf(Date.now()); if (!P.cycle.start || P.cycle.start >= cur) return;
    const until = StudyTimer.dayKey(Date.parse(cur + 'T12:00') - 864e5), H = (p.hist = p.hist || []);
    if (H.length && H[H.length - 1].until >= until) return; H.push({ until, days: clone(p.days) }); if (H.length > 60) H.shift();
  },
  /* metas × feito por matéria no intervalo [a, b): {key, name, color, e, q, ge, gq, ok, no}; null se o plano não vale no intervalo */
  stats(a, b) {
    const R = StudyReport, m = new Map(); let any = false;
    const get = (sb) => { let c = m.get(sb.key); if (!c) m.set(sb.key, (c = { ...sb, e: 0, q: 0, ge: 0, gq: 0, ok: 0, no: 0 })); return c; };
    for (let t = a; t < b; t = R.addDays(t, 1)) { const it = this.dayItems(t + 43200000); if (!it) continue; any = true; for (const x of it) { if (x.k === 'r') { get(RV_SUBJ).ge += x.min * 60000; continue; } const c = get(subjectOfNote('f:' + x.f)); if (x.k === 'q') c.gq += x.min * 60000; else c.ge += x.min * 60000; } }
    if (!any) return null;
    for (const [x, v] of R.within(a, b)) { if (x.r) { get(RV_SUBJ).e += v; continue; } /* v1.15: o tempo do caderno de erros vai para a linha própria */ const c = get(R.subj(x)); if (x.q) c.q += v; else c.e += v; }
    for (const r of StudyTimer.log.qa || []) if (r[0] >= a && r[0] < b) { const c = m.get(StudyTimer.ansSubj(r).key); if (c) { if (r[1]) c.ok++; else c.no++; } }
    return [...m.values()].sort((p, q) => q.ge + q.gq - (p.ge + p.gq) || q.e + q.q - (p.e + p.q));
  },
  /* linhas compactas: matéria · 📖 feito/meta · ✍️ feito/meta (barras finas na cor da matéria e no tom escuro) */
  rows(list) {
    const T = StudyTimer, sd = (v) => StudyReport.shortDur(v) || '0m';
    const cell = (ic, v, g, col) => el('span', { class: 'pl-cell' + (g && v >= g ? ' hit' : '') + (!g && !v ? ' nil' : '') }, el('small', {}, `${ic} ${sd(v)}${g ? ' / ' + sd(g) : ''}${g && v >= g ? ' ✓' : ''}`), g ? el('i', { class: 'pl-bar' }, el('b', { style: { width: Math.min(100, (v / g) * 100) + '%', background: col } })) : null);
    return el('div', { class: 'pl-rows' }, ...list.map((c) => el('div', { class: 'pl-row' }, el('span', { class: 'rp-name' }, el('i', { class: 'sr-dot', style: { background: c.color } }), c.name),
      c.key === '_r' ? cell('🔁', c.e, c.ge, c.color) : cell('📖', c.e, c.ge, c.color), c.key === '_r' ? el('span', { class: 'pl-cell' }, el('small', { class: 'pl-pend' }, `${this.pending().length} para refazer`)) : cell('✍️', c.q, c.gq, StudyReport.qColor(c.color)),
      el('small', { class: 'pl-ans' }, c.ok + c.no ? `✓${c.ok} ✗${c.no}` : ''))));
  },
  /* "Semana 2/4 · Foco" */
  label(w) { return w ? (w.pos != null && !w.custom && !(this.data().weeks[w.mon] || {}).plan ? `Semana ${w.pos + 1}/${w.n} · ${w.name}` : w.name + (w.custom ? ' (só esta semana)' : '')) : ''; },
  /* painel do cronômetro: hoje no plano */
  todayEl() {
    const d = new Date(); d.setHours(0, 0, 0, 0); const a = d.getTime(), list = this.stats(a, a + 864e5); if (!list) return null;
    const rows = list.filter((c) => c.ge || c.gq || c.e || c.q), w = this.week(Date.now());
    return el('div', { class: 'tm-qday' }, el('div', { class: 'tm-tot' }, el('span', {}, '📅 Hoje no plano'), el('b', {}, this.label(w))),
      rows.length ? this.rows(rows) : el('p', { class: 'tm-hint' }, 'Nada planejado para hoje.'));
  },

  /* ---------- editor (página inteira) ---------- */
  open(onClose) {
    this.ensure(); const P = this.data(); if (this._page && this._page.isConnected) this._page.remove();
    const body = el('div', { class: 'pl-body' }), close = () => { page.remove(); this._page = null; this.save(); onClose && onClose(); };
    const back = el('button', { class: 'cbtn round', title: 'Voltar', onclick: close }); back.innerHTML = icon('arrowLeft');
    const page = el('div', { class: 'settings-page pl-page' }, el('header', { class: 'sp-head' }, back, el('h1', {}, 'Plano de estudos')), body);
    if (!this._sel || !P.plans.find((p) => p.id === this._sel)) this._sel = P.plans[0] && P.plans[0].id; this._wk = null;
    const render = () => { body.innerHTML = ''; body.append(this.cycleCard(render), this.gridCard(render)); };
    render(); document.body.append(page); this._page = page;
    const iv = setInterval(() => { if (!page.isConnected) { clearInterval(iv); this.save(); onClose && onClose(); } }, 500); /* fechou pelo voltar do Android */
  },
  /* o que está sendo editado: um plano ou a cópia de uma semana */
  target() {
    const P = this.data();
    if (this._wk) { const W = P.weeks[this._wk]; if (W && W.days) return { days: W.days, week: this._wk, title: `Só a semana de ${this.dateOf(this._wk).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` }; this._wk = null; }
    const p = this.plan(this._sel); return p ? { p, days: p.days, title: p.name } : null;
  },
  change(tg, fn) { if (tg.p) this.keepHist(tg.p); fn(); this.save(); },
  gridCard(render) {
    const P = this.data(), tg = this.target(), T = StudyTimer, subs = this.subjects(), sd = (m) => StudyReport.shortDur(m * 60000) || '0m';
    const tabs = el('div', { class: 'pl-tabs' }, ...P.plans.map((p) => el('button', { class: 'pl-tab' + (!this._wk && p.id === this._sel ? ' on' : ''), onclick: () => { this._sel = p.id; this._wk = null; render(); } }, p.name)),
      el('button', { class: 'pl-tab add', onclick: async () => { const n = await askText('Nome do plano', 'Novo plano'); if (!n) return; const p = { id: uid(), name: n.trim(), days: tg && tg.days ? clone(tg.days) : {} }; P.plans.push(p); this._sel = p.id; this._wk = null; this.save(); render(); } }, '+ Novo'));
    if (!tg) return el('div', { class: 'rp-card' }, tabs);
    const head = el('div', { class: 'pl-thead' }, el('b', {}, tg.title),
      tg.week ? el('button', { class: 'btn ghost', onclick: () => { delete P.weeks[tg.week]; this._wk = null; this.save(); render(); } }, 'Voltar ao plano do ciclo') : null,
      tg.p ? el('button', { class: 'btn ghost', onclick: async () => { const n = await askText('Renomear plano', tg.p.name); if (n) { tg.p.name = n.trim(); this.save(); render(); } } }, 'Renomear') : null,
      tg.p && P.plans.length > 1 ? el('button', { class: 'btn ghost danger', onclick: async () => { if (!(await confirmBox('Excluir plano', `Excluir "${tg.p.name}"? As semanas do ciclo que usam este plano ficam sem meta.`, 'Excluir', true))) return; P.plans = P.plans.filter((x) => x !== tg.p); P.cycle.seq = P.cycle.seq.filter((id) => id !== tg.p.id); this._sel = P.plans[0].id; this.save(); render(); } }, 'Excluir') : null);
    if (!subs.length) return el('div', { class: 'rp-card' }, tabs, head, el('p', { class: 'tm-hint' }, 'Marque pastas como matéria (menu ⋯ da pasta → "Marcar como matéria") para montar o plano.'));
    const tot = { e: 0, q: 0, r: 0 }, per = new Map();
    const cols = PL_DOW.map((d) => {
      const list = tg.days[d] || [], dt = list.reduce((s, x) => s + x.min, 0);
      for (const x of list) { tot[x.k] += x.min; const c = per.get(x.f) || { e: 0, q: 0, r: 0 }; c[x.k] += x.min; per.set(x.f, c); }
      const add = el('button', { class: 'pl-add', title: 'Adicionar', onclick: () => { const lf = (list[list.length - 1] || {}).f, x = { id: uid(), f: lf && lf !== '*' ? lf : subs[0].id, k: 'e', min: 60 }; this.change(tg, () => { (tg.days[d] = tg.days[d] || []).push(x); }); render(); this.itemPop(add, tg, d, x, render, true); } }, '+');
      const dh = el('button', { class: 'pl-dh', onclick: () => this.dayPop(dh, tg, d, render) }, el('b', {}, PL_DN[d]), el('small', {}, dt ? sd(dt) : 'livre'));
      return el('div', { class: 'pl-col' }, dh, ...list.map((x) => { const f = Store.folders.find((y) => y.id === x.f), col = x.k === 'r' ? RV_SUBJ.color : (f && (f.color || FOLDER_COLORS[0])) || 'var(--muted)';
        const b = el('button', { class: 'pl-item' + (x.k === 'q' ? ' q' : x.k === 'r' ? ' r' : ''), onclick: () => this.itemPop(b, tg, d, x, render) }, el('span', {}, x.k === 'r' ? '🔁 Caderno de erros' : (x.k === 'q' ? '✍️ ' : '📖 ') + (f ? f.name : 'matéria apagada')), el('small', {}, sd(x.min)));
        b.style.setProperty('--c', x.k === 'q' ? StudyReport.qColor(col) : col); /* el() não grava variáveis CSS pelo objeto style */
        return b; }), add);
    });
    const sum = el('div', { class: 'pl-sum' }, el('b', {}, `Semana: ${sd(tot.e + tot.q)}`), el('small', {}, `📖 ${sd(tot.e)} · ✍️ ${sd(tot.q)}${tot.r ? ' · 🔁 ' + sd(tot.r) : ''}`),
      ...[...per.entries()].map(([fid, c]) => { if (fid === '*') return el('span', { class: 'pl-sumi' }, el('i', { class: 'sr-dot', style: { background: RV_SUBJ.color } }), `Caderno de erros 🔁${sd(c.r)}`); const f = Store.folders.find((y) => y.id === fid); return el('span', { class: 'pl-sumi' }, el('i', { class: 'sr-dot', style: { background: (f && f.color) || FOLDER_COLORS[0] } }), `${f ? f.name : '—'} ${c.e ? '📖' + sd(c.e) : ''} ${c.q ? '✍️' + sd(c.q) : ''}`); }));
    return el('div', { class: 'rp-card' }, tabs, head, el('div', { class: 'pl-grid' }, ...cols), sum,
      el('p', { class: 'tm-hint' }, tg.week ? 'Mudanças aqui valem só para esta semana.' : 'Toque num item para mudar a matéria, o tipo ou o tempo; toque no dia para copiar ou limpar. Mudanças valem desta semana em diante (as semanas que passaram não mudam).'));
  },
  itemPop(anchor, tg, d, x, render, isNew) {
    const subs = this.subjects(), box = el('div', { class: 'pl-pop' });
    const sel = el('select', { class: 'rp-in' }, ...subs.map((f) => el('option', { value: f.id }, f.name))); if (x.f !== '*') sel.value = x.f; sel.onchange = () => this.change(tg, () => { x.f = sel.value; });
    const kind = UI.seg([['e', '📖 Estudo'], ['q', '✍️ Questões'], ['r', '🔁 Caderno de erros']], x.k, (v) => { this.change(tg, () => { x.k = v; x.f = v === 'r' ? '*' : x.f === '*' ? sel.value || subs[0].id : x.f; }); subjL.classList.toggle('hidden', v === 'r'); });
    const min = el('input', { type: 'number', min: 5, max: 600, step: 5, value: x.min, class: 'sr-goalin', onchange: () => this.change(tg, () => { x.min = clamp(Math.round(+min.value || 30), 5, 600); }) });
    const chips = el('div', { class: 'pl-chips' }, ...[15, 30, 45, 60, 90, 120].map((m) => el('button', { class: 'tm-chip', onclick: () => { min.value = m; this.change(tg, () => { x.min = m; }); } }, StudyReport.shortDur(m * 60000))));
    const subjL = el('label', { class: x.k === 'r' ? 'hidden' : '' }, 'Matéria', sel);
    box.append(subjL, kind, el('label', {}, 'Tempo', min, 'min'), chips,
      el('div', { class: 'pl-btns' }, el('button', { class: 'btn ghost danger', onclick: () => { this.change(tg, () => { tg.days[d] = (tg.days[d] || []).filter((y) => y !== x); }); closePop(); } }, 'Excluir'), el('button', { class: 'btn primary', onclick: () => closePop() }, 'Pronto')));
    openPop(anchor, box, { onClose: () => render() });
  },
  dayPop(anchor, tg, d, render) {
    const box = el('div', { class: 'pl-pop' }, el('b', {}, `${PL_DN[d]}: copiar para…`),
      el('div', { class: 'pl-chips' }, ...PL_DOW.filter((x) => x !== d).map((x) => el('button', { class: 'tm-chip', onclick: (ev) => { this.change(tg, () => { tg.days[x] = clone(tg.days[d] || []).map((y) => ({ ...y, id: uid() })); }); ev.currentTarget.classList.add('on'); } }, PL_DN[x]))),
      el('div', { class: 'pl-btns' }, el('button', { class: 'btn ghost danger', onclick: () => { this.change(tg, () => { tg.days[d] = []; }); closePop(); } }, 'Limpar o dia'), el('button', { class: 'btn primary', onclick: () => closePop() }, 'Pronto')));
    openPop(anchor, box, { onClose: () => render() });
  },
  cycleCard(render) {
    const P = this.data(), C = P.cycle, now = Date.now(), mon = this.monOf(now), w = this.week(now);
    const start = el('input', { type: 'date', value: C.start || '', class: 'rp-in', onchange: () => { C.start = start.value ? this.monOf(start.value) : null; C.anchors = []; this.save(); render(); } });
    const seq = el('div', { class: 'pl-seq' }, ...C.seq.map((id, i) => { const s = el('select', { class: 'rp-in' }, ...P.plans.map((p) => el('option', { value: p.id }, p.name))); s.value = id; s.onchange = () => { C.seq[i] = s.value; this.save(); render(); }; return el('label', {}, `${i + 1}ª`, s); }),
      el('button', { class: 'tm-chip', title: 'Mais uma semana no ciclo', onclick: () => { C.seq.push(C.seq[C.seq.length - 1] || P.plans[0].id); this.save(); render(); } }, '+'),
      C.seq.length > 1 ? el('button', { class: 'tm-chip', title: 'Uma semana a menos', onclick: () => { C.seq.pop(); this.save(); render(); } }, '−') : null);
    /* ajustes desta semana: em que semana do ciclo estou, plano só desta semana, editar só esta semana */
    const W = P.weeks[mon] || {}, posSel = el('select', { class: 'rp-in' }, ...C.seq.map((id, i) => el('option', { value: i }, `${i + 1}ª (${(this.plan(id) || {}).name || '—'})`)));
    if (w && w.pos != null) posSel.value = w.pos;
    posSel.onchange = () => { C.anchors = (C.anchors || []).filter((a) => a.from !== mon); C.anchors.push({ from: mon, pos: +posSel.value }); this.save(); render(); };
    const only = el('select', { class: 'rp-in' }, el('option', { value: '' }, 'Pelo ciclo'), ...P.plans.map((p) => el('option', { value: p.id }, p.name)), el('option', { value: '-' }, 'Descanso (sem meta)'));
    only.value = W.plan || ''; only.onchange = () => { const v = only.value; if (!v && !W.days) delete P.weeks[mon]; else P.weeks[mon] = { ...W, plan: v || undefined }; this.save(); render(); };
    const editWeek = el('button', { class: 'btn ghost', onclick: () => { const cur = this.week(now); P.weeks[mon] = { ...(P.weeks[mon] || {}), days: clone(cur ? cur.days : {}) }; this._wk = mon; this.save(); render(); } }, W.days ? 'Editando só esta semana' : 'Editar só esta semana…');
    if (W.days) editWeek.onclick = () => { this._wk = mon; render(); };
    return el('div', { class: 'rp-card pl-cycle' },
      el('div', { class: 'pl-now' }, el('b', {}, w ? this.label(w) : C.start ? 'Esta semana: sem plano' : 'Defina o início do ciclo'), el('small', {}, w ? 'esta semana' : 'enquanto não houver ciclo, valem as metas antigas')),
      el('div', { class: 'pl-line' }, el('label', {}, 'Início do ciclo (segunda)', start), el('div', {}, el('span', { class: 'tm-hint' }, 'Ordem das semanas'), seq)),
      C.start ? el('div', { class: 'pl-line' }, el('label', {}, 'Esta semana é a', posSel), el('label', {}, 'Plano só desta semana', only), editWeek) : null,
      C.start ? el('small', { class: 'tm-hint' }, 'Falhou uma semana ou precisa descansar antes? Mude "esta semana é a" e o ciclo segue a partir dela (as semanas que passaram não mudam).') : null);
  },

  /* ---------- caderno de erros ---------- */
  /* chamado a cada ✗: pergunta aula e número da questão (teclado numérico), ou um texto livre ("Simulado 3, Q15") */
  askErr(ans) {
    const T = StudyTimer, E = T.log.errs || (T.log.errs = []), sb = T.ansSubj(ans), last = [...E].reverse().find((x) => x.f === sb.key && x.aula);
    const st = { aula: last ? String(last.aula) : '', q: '', field: last ? 'q' : 'aula' };
    const fld = (k, lab) => el('button', { class: 'er-fld', onclick: () => { st.field = k; paint(); } }, el('small', {}, lab), el('b', {}, ''));
    const fa = fld('aula', 'Aula'), fq = fld('q', 'Questão'), txt = el('input', { class: 'tp-input er-txt hidden', placeholder: 'Ex.: Simulado 3, questão 15' });
    const paint = () => { fa.classList.toggle('on', st.field === 'aula'); fq.classList.toggle('on', st.field === 'q'); fa.querySelector('b').textContent = st.aula || '—'; fq.querySelector('b').textContent = st.q || '—'; };
    const key = (k) => { const v = st[st.field]; st[st.field] = k === '⌫' ? v.slice(0, -1) : (v + k).slice(0, 4); paint(); };
    const pad = el('div', { class: 'er-pad' }, ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'].map((k) => el('button', { class: 'er-k', onclick: () => key(k) }, k)),
      el('button', { class: 'er-k ok', onclick: () => saveIt() }, '✓'));
    const saveIt = () => {
      const t = txt.value.trim(); if (!st.q && !st.aula && !t) { closePop(); return; }
      E.push({ id: uid(), t: ans[0], f: sb.key, n: ans[2] || null, aula: st.aula || null, q: st.q || null, txt: t || null, done: false }); if (E.length > 5000) E.splice(0, E.length - 5000);
      T.saveLog(); closePop(); toast('Anotado no caderno de erros', 1200);
    };
    const box = el('div', { class: 'er-pop' }, el('div', { class: 'er-head' }, el('b', {}, '✗ Anotar o erro'), el('small', {}, sb.name)),
      el('div', { class: 'er-flds' }, fa, fq), pad, txt,
      el('div', { class: 'pl-btns' }, el('button', { class: 'btn ghost', onclick: () => { txt.classList.toggle('hidden'); if (!txt.classList.contains('hidden')) txt.focus(); } }, 'Outro…'), el('button', { class: 'btn ghost', onclick: () => closePop() }, 'Pular'), el('button', { class: 'btn primary', onclick: () => saveIt() }, 'Salvar')));
    paint();
    const a = QuizPad.el && !QuizPad.el.classList.contains('hidden') ? QuizPad.el : null, r = a ? a.getBoundingClientRect() : { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2, width: 0, height: 0 };
    openPop({ getBoundingClientRect: () => r }, box);
  },
  /* v1.15: erros ainda não refeitos (mais antigos primeiro) */
  pending() { const L = typeof StudyTimer !== 'undefined' && StudyTimer.log; return ((L && L.errs) || []).filter((x) => !x.done).sort((a, b) => a.t - b.t); },
  /* lista para refazer: ✓ acertei (sai da lista) / ✗ errei de novo (continua, conta as vezes) */
  redoPop(anchor) {
    const T = StudyTimer, box = el('div', { class: 'er-pop rv-pop' }), cs = T.st ? T.curSubj() : null;
    let flt = cs && this.pending().some((x) => x.f === cs.key) ? cs.key : '';
    const sb = (k) => subjectOfNote(k === '_' || k === '~' || k === '?' ? k : 'f:' + k);
    const paint = () => {
      const P = this.pending(), keys = [...new Set(P.map((x) => x.f))]; if (flt && !keys.includes(flt)) flt = '';
      const L = flt ? P.filter((x) => x.f === flt) : P;
      const chip = (k, lab, n) => el('button', { class: 'tm-chip' + (flt === k ? ' on' : ''), onclick: () => { flt = k; paint(); } }, `${lab} ${n}`);
      box.innerHTML = '';
      box.append(el('div', { class: 'er-head' }, el('b', { class: 'rv-t' }, '🔁 Refazer erros'), el('small', {}, P.length ? `${P.length} pendentes` : 'tudo refeito ✓')),
        keys.length > 1 ? el('div', { class: 'pl-chips' }, chip('', 'Todas', P.length), ...keys.map((k) => chip(k, sb(k).name, P.filter((x) => x.f === k).length))) : null,
        L.length ? el('div', { class: 'rv-list' }, ...L.map((x) => el('div', { class: 'rv-row' },
          el('span', { class: 'rv-lab' }, el('i', { class: 'sr-dot', style: { background: sb(x.f).color } }), el('b', {}, this.errLabel(x) || 'sem número'),
            el('small', {}, `${flt ? '' : sb(x.f).name + ' · '}${new Date(x.t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}${x.miss ? ` · errou de novo ${x.miss}×` : ''}`)),
          el('button', { class: 'rv-b ok', title: 'Acertei (sai da lista)', onclick: () => { x.done = true; x.doneAt = Date.now(); T.saveLog(); QuizPad.sync(true); paint(); } }, '✓'),
          el('button', { class: 'rv-b no', title: 'Errei de novo (continua na lista)', onclick: () => { x.miss = (x.miss || 0) + 1; x.tryAt = Date.now(); T.saveLog(); paint(); toast('Continua na lista', 900); } }, '✗'))))
          : el('p', { class: 'tm-hint' }, 'Nenhum erro para refazer. Os erros entram aqui quando você toca em ✗ no modo Questões.'),
        el('div', { class: 'pl-btns' }, el('button', { class: 'btn primary', onclick: () => closePop() }, 'Pronto')));
    };
    paint();
    const a = anchor || (QuizPad.el && !QuizPad.el.classList.contains('hidden') ? QuizPad.el : null), r = a ? a.getBoundingClientRect() : { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 3, bottom: innerHeight / 3, width: 0, height: 0 };
    openPop({ getBoundingClientRect: () => r }, box);
  },
  /* desfazer o último ✗ também tira a anotação dele */
  dropErr(t) { const L = StudyTimer.log; if (L.errs) L.errs = L.errs.filter((x) => x.t !== t); },
  errLabel(x) { return x.txt ? x.txt + (x.aula || x.q ? ` · ${x.aula ? 'Aula ' + x.aula : ''}${x.q ? ' Q' + x.q : ''}` : '') : `${x.aula ? 'Aula ' + x.aula : ''}${x.aula && x.q ? ' · ' : ''}${x.q ? 'Questão ' + x.q : ''}`; },
  /* lista do caderno de erros no período (aba Questões): por matéria, com ✓ refeita e ✕ */
  errCard(a, b, render) {
    const L = StudyTimer.log, E = (L.errs || []).filter((x) => x.t >= a && x.t < b); if (!E.length) return el('div', { class: 'rp-card' }, el('div', { class: 'rp-h' }, 'Caderno de erros'), el('p', { class: 'tm-hint' }, 'Nenhum erro anotado neste período. Ao tocar em ✗, o app pergunta a aula e o número da questão.'));
    const by = new Map(); for (const x of E) { const k = x.f; if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
    const pend = E.filter((x) => !x.done).length;
    return el('div', { class: 'rp-card' }, el('div', { class: 'rp-h' }, 'Caderno de erros', el('span', { class: 'rp-hs' }, pend ? `${pend} para refazer` : 'tudo refeito ✓')),
      ...[...by.entries()].map(([k, xs]) => { const sb = subjectOfNote(k === '_' || k === '~' || k === '?' ? k : 'f:' + k);
        return el('div', { class: 'er-grp' }, el('div', { class: 'er-gh' }, el('i', { class: 'sr-dot', style: { background: sb.color } }), sb.name, el('small', {}, `${xs.filter((x) => !x.done).length} de ${xs.length}`)),
          ...xs.sort((p, q) => (+p.aula || 0) - (+q.aula || 0) || (+p.q || 0) - (+q.q || 0) || p.t - q.t).map((x) => el('div', { class: 'er-row' + (x.done ? ' done' : '') },
            el('button', { class: 'er-chk', title: x.done ? 'Marcar como não refeita' : 'Marcar como refeita', onclick: () => { x.done = !x.done; StudyTimer.saveLog(); render(); } }, x.done ? '✓' : ''),
            el('span', {}, this.errLabel(x) || 'sem número'), el('small', {}, (x.miss ? `errou de novo ${x.miss}× · ` : '') + new Date(x.t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
            el('button', { class: 'er-del', title: 'Excluir', onclick: () => { L.errs = L.errs.filter((y) => y !== x); StudyTimer.saveLog(); render(); } }, '✕')))); }));
  },
};
