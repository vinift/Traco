'use strict';
/* ===== v0.43 — Relatório de estudo (página inteira com abas) =====
   Lê as SESSÕES do cronômetro (StudyTimer.allSess(): log.sessions + trecho em andamento). Período: Dia / Semana (seg–dom) / Mês / Ano,
   com ‹ › para andar e "Hoje". Abas: Visão geral (resumo + gráfico empilhado por matéria; tocar numa barra mostra o detalhe e abre o
   dia/mês), Calendário (mapa de calor pela meta), Matérias (rosca + lista; tocar abre as notas), Horários (por hora e dia × hora),
   Sessões (lista editável: matéria, horário, excluir, adicionar) e Notas. Registros antigos (antes da v0.43) não têm horário (lg). */
const StudyReport = {
  unit: 'week', anchor: null, tab: 'geral', sel: null, openSubj: null,
  /* v0.50: meta de segunda a sexta (S.studyGoal, mín. 5) e de sábado (S.studyGoalWE) e domingo (S.studyGoalSun, v0.50.1); vazio = igual; 0 = descanso.
     t = instante (ms) ou chave 'AAAA-MM-DD'; sem t = hoje */
  goalMs(t = Date.now()) {
    const S = Store.settings, d = typeof t === 'string' ? new Date(t + 'T12:00') : new Date(t), wd = Math.max(5, +S.studyGoal || 60) * 60000;
    if ((S.pauseDays || []).includes(StudyTimer.dayKey(d.getTime()))) return 0; /* v0.50: dia de pausa (feriado etc.) = descanso */
    /* v0.50.1: sábado (S.studyGoalWE) e domingo (S.studyGoalSun) separados; domingo nunca definido (undefined) segue o sábado (como na v0.50.0) */
    const g = d.getDay() === 6 ? S.studyGoalWE : d.getDay() === 0 ? (S.studyGoalSun === undefined ? S.studyGoalWE : S.studyGoalSun) : null;
    if (g != null && g !== '') return Math.max(0, +g) * 60000;
    return wd;
  },
  /* 1 = bateu a meta (ou estudou num dia de descanso), 0 = descanso sem estudo (não quebra nem conta), −1 = não bateu */
  dayHit(k, v) { const g = this.goalMs(k); return g === 0 ? (v > 0 ? 1 : 0) : v >= g ? 1 : -1; },
  sum(d) { let v = 0; for (const x in d || {}) v += d[x]; return v; },
  subjectOf(id) { return subjectOfNote(id); },
  /* dia → { chave: ms } (chave = nota, 'f:<pasta>' se a matéria foi escolhida, '_' fora das notas) — usado também pela tela inicial */
  /* v0.43.1: só o tempo de MATÉRIAS entra no relatório (fora das notas, sem matéria e notas apagadas ficam de fora) */
  countable(x) { const k = this.subj(x).key; return k !== '_' && k !== '~' && k !== '?'; },
  dayMap() {
    const T = StudyTimer, out = {};
    for (const x of T.allSess()) if (this.countable(x)) this.split(x, x.s, x.e, (a, b) => { const k = T.dayKey(a), d = out[k] || (out[k] = {}), key = T.sessKey(x); d[key] = (d[key] || 0) + (b - a); });
    return out;
  },
  /* corta [a, b) na meia-noite */
  split(x, a, b, fn) { while (a < b) { const d = new Date(a); d.setHours(24, 0, 0, 0); const e = Math.min(b, d.getTime()); fn(a, e); a = e; } },
  subj(x) { return subjectOfNote(StudyTimer.sessKey(x)); },
  dayStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); },
  addDays(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); },
  /* período atual */
  range(unit = this.unit, anchor = this.anchor) {
    const d = new Date(anchor); d.setHours(0, 0, 0, 0); let a, b, label;
    const M = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const dm = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
    if (unit === 'day') { a = d.getTime(); b = this.addDays(a, 1); label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); }
    else if (unit === 'week') { const wd = (d.getDay() + 6) % 7; a = this.addDays(d.getTime(), -wd); b = this.addDays(a, 7); label = `${dm(a)} – ${dm(b - 1)}`; }
    else if (unit === 'month') { a = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); b = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); label = `${M[d.getMonth()]} de ${d.getFullYear()}`; }
    else { a = new Date(d.getFullYear(), 0, 1).getTime(); b = new Date(d.getFullYear() + 1, 0, 1).getTime(); label = String(d.getFullYear()); }
    return { a, b, label: label.charAt(0).toUpperCase() + label.slice(1) };
  },
  shift(n) { const d = new Date(this.anchor); if (this.unit === 'day') d.setDate(d.getDate() + n); else if (this.unit === 'week') d.setDate(d.getDate() + 7 * n); else if (this.unit === 'month') d.setMonth(d.getMonth() + n, 1); else d.setFullYear(d.getFullYear() + n); this.anchor = d.getTime(); this.sel = null; },
  /* colunas do gráfico do período */
  buckets(r) {
    const out = [], WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    if (this.unit === 'day') for (let h = 0; h < 24; h++) { const a = r.a + h * 3600000; out.push({ a, b: a + 3600000, lab: h % 3 === 0 ? h + 'h' : '', tip: `${h}h–${h + 1}h` }); }
    else if (this.unit === 'year') for (let m = 0; m < 12; m++) { const a = new Date(new Date(r.a).getFullYear(), m, 1).getTime(), b = new Date(new Date(r.a).getFullYear(), m + 1, 1).getTime(); out.push({ a, b, lab: new Date(a).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), tip: new Date(a).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), drill: ['month', a] }); }
    else for (let t = r.a; t < r.b; t = this.addDays(t, 1)) { const d = new Date(t); out.push({ a: t, b: this.addDays(t, 1), lab: this.unit === 'week' ? WD[d.getDay()] + ' ' + d.getDate() : d.getDate() === 1 || d.getDate() % 5 === 0 ? String(d.getDate()) : '', tip: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }), drill: ['day', t], day: 1 }); }
    return out;
  },
  /* v1.10: sessões "abrangentes" — trechos seguidos da mesma matéria com pausa de até S.sessGap min (padrão 10) viram um bloco.
     Bloco = {parts, s, e, study (soma dos trechos), pause (soma das pausas), key}. Registros antigos sem horário ficam sozinhos. */
  gapMs() { const g = Store.settings.sessGap; return (g == null ? 10 : +g) * 60000; },
  blocks(xs) {
    const gap = this.gapMs(), out = []; let b = null;
    for (const x of xs.slice().sort((p, q) => p.s - q.s)) {
      const key = this.subj(x).key + (this.countable(x) ? '' : '#off');
      if (b && !x.lg && !b.lg && key === b.key && x.s - b.e <= gap && x.s >= b.e - 1000) { b.parts.push(x); b.pause += Math.max(0, x.s - b.e); b.e = Math.max(b.e, x.e); b.study += x.e - x.s; if (x.live) b.live = 1; continue; }
      b = { parts: [x], s: x.s, e: x.e, study: x.e - x.s, pause: 0, key, lg: !!x.lg, live: !!x.live }; out.push(b);
    }
    return out;
  },
  /* sessões que tocam [a, b) com o tempo cortado */
  within(a, b, all) { const out = []; for (const x of StudyTimer.allSess()) { if (!all && !this.countable(x)) continue; const v = Math.min(b, x.e) - Math.max(a, x.s); if (v > 0) out.push([x, v]); } return out; },
  bySubj(list) { const m = new Map(); for (const [x, v] of list) { const s = this.subj(x), c = m.get(s.key) || { ...s, v: 0, n: 0 }; c.v += v; c.n++; m.set(s.key, c); } return [...m.values()].sort((p, q) => q.v - p.v); },
  /* sequência atual e melhor (dias seguidos na meta) */
  streaks(map) { /* v0.50: meta por dia (dias úteis/fim de semana); dia de descanso sem estudo não quebra; hoje só conta se já bateu */
    const T = StudyTimer, t0 = this.dayStart(Date.now()), key = (i) => T.dayKey(this.addDays(t0, -i) + 43200000); let cur = 0;
    for (let i = 0; i < 800; i++) { const k = key(i), h = this.dayHit(k, this.sum(map[k])); if (h === 1) cur++; else if (h === -1) { if (i === 0) continue; break; } }
    const keys = Object.keys(map).sort(); let best = 0, run = 0;
    if (keys.length) { const first = new Date(keys[0] + 'T12:00').getTime(); for (let t = first; t <= t0 + 43200000; t = this.addDays(t, 1)) { const k = T.dayKey(t), h = this.dayHit(k, this.sum(map[k])); if (h === 1) { run++; best = Math.max(best, run); } else if (h === -1 && k !== T.dayKey(Date.now())) run = 0; } }
    return { cur, best: Math.max(best, cur) };
  },

  open(opt = {}) {
    if (this._page && this._page.isConnected) this._page.remove();
    this.anchor = opt.anchor || Date.now(); if (opt.unit) this.unit = opt.unit; if (opt.tab) this.tab = opt.tab; this.sel = null; this.openSubj = null;
    const T = StudyTimer, body = el('div', { class: 'rp-body' }), close = () => { clearInterval(this._iv); page.remove(); this._page = null; };
    const back = el('button', { class: 'cbtn round', title: 'Voltar', onclick: close }); back.innerHTML = icon('arrowLeft');
    const units = el('div', { class: 'xp-tabs rp-units' }), nav = el('div', { class: 'rp-nav' }), tabs = el('div', { class: 'rp-tabs' });
    const reload = el('button', { class: 'btn rp-reload', title: 'Recarregar informações', onclick: async () => {
      reload.classList.add('spin');
      try { if (T.st && T.st.running) T.boundary(Date.now()); await new Promise((r) => setTimeout(r, 120)); const l = await DB.get('meta', 'studyLog'); if (l && l.days) { T.log = l; T.migrate(); } } catch (e) { console.warn('relatório', e); }
      render(); reload.classList.remove('spin'); toast('Relatório atualizado', 1500);
    } }, iconEl('refresh'), el('span', {}, 'Recarregar'));
    const page = el('div', { class: 'settings-page rp-page' }, el('header', { class: 'sp-head rp-head' }, back, el('h1', {}, 'Relatório de estudo'), units, nav, reload), tabs, body);
    const TABS = [['geral', 'Visão geral'], ['cal', 'Calendário'], ['subj', 'Matérias'], ['hours', 'Horários'], ['sess', 'Sessões'], ['notes', 'Notas']];
    const render = () => {
      const r = this.range();
      units.innerHTML = ''; for (const [k, n] of [['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês'], ['year', 'Ano']]) units.append(el('button', { class: 'xp-tab' + (this.unit === k ? ' on' : ''), onclick: () => { this.unit = k; this.sel = null; render(); } }, n));
      const isNow = Date.now() >= r.a && Date.now() < r.b;
      nav.innerHTML = ''; nav.append(...[el('button', { class: 'btn ghost rp-arrow', title: 'Anterior', onclick: () => { this.shift(-1); render(); } }, '‹'), el('b', { class: 'rp-label' }, r.label), el('button', { class: 'btn ghost rp-arrow', title: 'Próximo', disabled: isNow || r.a > Date.now(), onclick: () => { this.shift(1); render(); } }, '›'),
        isNow ? null : el('button', { class: 'btn ghost rp-today', onclick: () => { this.anchor = Date.now(); this.sel = null; render(); } }, 'Hoje')].filter(Boolean));
      tabs.innerHTML = ''; for (const [k, n] of TABS) tabs.append(el('button', { class: 'rp-tab' + (this.tab === k ? ' on' : ''), onclick: () => { this.tab = k; render(); } }, n));
      body.innerHTML = '';
      const fn = { geral: 'viewGeral', cal: 'viewCal', subj: 'viewSubj', hours: 'viewHours', sess: 'viewSess', notes: 'viewNotes' }[this.tab] || 'viewGeral';
      try { body.append(this[fn](r, render, close)); } catch (e) { console.error(e); body.append(el('p', { class: 'tm-hint' }, 'Erro ao montar esta aba: ' + e.message)); }
    };
    this._render = render; render();
    this._iv = setInterval(() => { if (!page.isConnected) return clearInterval(this._iv); if (T.st && T.st.running && !document.hidden && this.tab !== 'sess') render(); }, 60000); /* com o cronômetro rodando, atualiza sozinho a cada minuto */
    document.body.append(page); this._page = page;
  },
  go(unit, anchor, tab) { this.unit = unit; this.anchor = anchor; this.sel = null; if (tab) this.tab = tab; this._render && this._render(); },

  /* ---------- Visão geral ---------- */
  viewGeral(r, render) {
    const T = StudyTimer, goal = this.goalMs(this.unit === 'day' ? r.a + 43200000 : Date.now()), now = Date.now(), list = this.within(r.a, r.b), total = list.reduce((a, [, v]) => a + v, 0);
    const map = this.dayMap(), days = []; for (let t = r.a; t < r.b && t <= now; t = this.addDays(t, 1)) days.push(T.dayKey(t + 43200000));
    const dv = days.map((k) => this.sum(map[k])), studied = dv.filter((v) => v > 0).length, hs = days.map((k, i) => this.dayHit(k, dv[i])), hit = hs.filter((h) => h === 1).length, nGoal = hs.filter((h) => h !== 0).length;
    const nSess = list.filter(([x]) => !x.lg).length, real = list.filter(([x]) => !x.lg).reduce((a, [, v]) => a + v, 0);
    const prev = (() => { const d = new Date(r.a); if (this.unit === 'day') d.setDate(d.getDate() - 1); else if (this.unit === 'week') d.setDate(d.getDate() - 7); else if (this.unit === 'month') d.setMonth(d.getMonth() - 1); else d.setFullYear(d.getFullYear() - 1); const p = this.range(this.unit, d.getTime()), cut = Math.min(p.b, p.a + (Math.min(now, r.b) - r.a)); return this.within(p.a, cut).reduce((a, [, v]) => a + v, 0); })();
    const cmp = prev > 0 ? Math.round(((total - prev) / prev) * 100) : null;
    const aw = (T.log.away || {}), awTot = days.reduce((a, k) => a + (aw[k] || 0), 0), st = this.streaks(map);
    const tile = (lab, val, sub, cls = '') => el('div', { class: 'rp-tile ' + cls }, el('small', {}, lab), el('b', {}, val), sub ? el('span', {}, sub) : null);
    const tiles = el('div', { class: 'rp-tiles' },
      tile('Total', T.fmtDur(total), cmp == null ? (studied ? `em ${studied} ${studied === 1 ? 'dia' : 'dias'}` : 'nada ainda') : `${cmp >= 0 ? '▲' : '▼'} ${Math.abs(cmp)}% vs. período anterior`, cmp == null ? '' : cmp >= 0 ? 'up' : 'down'),
      this.unit === 'day' ? (goal ? tile('Meta do dia', `${Math.min(999, Math.round((total / goal) * 100))}%`, `${T.fmtDur(total)} de ${T.fmtDur(goal)}`, total >= goal ? 'up' : '') : tile('Meta do dia', 'Descanso', total ? `${T.fmtDur(total)} estudados (conta na sequência)` : 'não quebra a sequência', total ? 'up' : '')) : tile('Média por dia', T.fmtDur(days.length ? total / days.length : 0), studied ? `${T.fmtDur(total / Math.max(1, studied))} nos dias estudados` : ''),
      this.unit === 'day' ? tile('Sessões', String(nSess), nSess ? `média ${T.fmtDur(real / nSess)}` : '') : tile('Dias na meta', `${hit} de ${nGoal}`, this.goalTxt()),
      tile('Sequência', `${st.cur} ${st.cur === 1 ? 'dia' : 'dias'}`, `melhor: ${st.best} ${st.best === 1 ? 'dia' : 'dias'}`),
      awTot >= 60000 ? tile('Não contado', T.fmtDur(awTot), 'app fora da tela', 'down') : this.unit === 'day' ? null : tile('Sessões', String(nSess), nSess ? `média ${T.fmtDur(real / nSess)}` : ''));
    /* gráfico empilhado por matéria */
    const B = this.buckets(r); for (const b of B) { b.list = list.filter(([x]) => x.e > b.a && x.s < b.b).map(([x]) => [x, Math.min(b.b, x.e) - Math.max(b.a, x.s)]); b.v = b.list.reduce((a, [, v]) => a + v, 0); b.parts = this.bySubj(b.list); }
    for (const b of B) if (b.day) b.g = this.goalMs(b.a + 43200000); const gl = B[0].day ? this.goalMs(Date.parse('2024-01-03T12:00')) : 0, max = Math.max(...B.map((b) => b.v), ...B.map((b) => (b.g || 0) * 1.1), gl * 1.1, this.unit === 'day' ? 3600000 : 1); /* linha tracejada = meta de seg–sex; fim de semana com meta própria ganha um tracinho na coluna */
    const detail = el('div', { class: 'rp-detail' });
    const showB = (b, i) => {
      this.sel = i; detail.innerHTML = '';
      detail.append(el('div', { class: 'rp-dhead' }, el('b', {}, `${b.tip}: ${T.fmtDur(b.v)}${b.day && b.g === 0 ? ' · descanso' : b.day && b.v >= b.g ? ' ✓ meta' : ''}`), b.drill ? el('button', { class: 'btn ghost', onclick: () => this.go(b.drill[0], b.drill[1]) }, b.drill[0] === 'day' ? 'Abrir o dia →' : 'Abrir o mês →') : null));
      detail.append(b.parts.length ? this.subjRows(b.parts, b.v) : el('p', { class: 'tm-hint' }, 'Nada registrado.'));
      if (b.day && aw[T.dayKey(b.a + 43200000)] >= 30000) detail.append(el('p', { class: 'tm-hint rp-warn' }, `Não contado (app fora da tela com o cronômetro rodando): ${T.fmtDur(aw[T.dayKey(b.a + 43200000)])}`));
      [...plot.querySelectorAll('.rp-col.on')].forEach((c) => c.classList.remove('on')); plot.children[i + (gl ? 1 : 0)] && plot.children[i + (gl ? 1 : 0)].classList.add('on');
    };
    const plot = el('div', { class: 'rp-plot' + (B.length > 14 ? ' dense' : '') }, gl ? el('div', { class: 'rp-goal', style: { bottom: `calc(20px + (100% - 20px) * ${gl / max})` } }, el('span', {}, 'meta')) : null,
      ...B.map((b, i) => el('button', { class: 'rp-col' + (b.day && (b.g === 0 ? b.v > 0 : b.v >= b.g) ? ' hit' : '') + (b.day && b.g === 0 ? ' rest' : '') + (now >= b.a && now < b.b ? ' now' : ''), title: `${b.tip}: ${T.fmtDur(b.v)}`, onclick: () => showB(b, i) },
        b.day && b.g !== gl && b.g > 0 ? el('i', { class: 'rp-gtick', style: { bottom: `calc(${(b.g / max) * 100}% - 1px)` } }) : null, el('div', { class: 'rp-stack', style: { height: b.v ? Math.max(1.5, (b.v / max) * 100) + '%' : '0' } }, ...b.parts.map((p) => el('i', { style: { flex: String(p.v), background: p.color } }))), el('small', {}, b.lab))));
    const side = el('div', { class: 'rp-card' }, el('div', { class: 'rp-h' }, 'Matérias no período'), list.length ? this.subjRows(this.bySubj(list), total) : el('p', { class: 'tm-hint' }, 'Sem tempo registrado. O tempo conta com o cronômetro rodando e o app na tela.'));
    const S = Store.settings, goalIn = el('input', { type: 'number', min: 5, max: 900, step: 15, value: Math.round(Math.max(5, +S.studyGoal || 60)), class: 'sr-goalin', onchange: () => { S.studyGoal = clamp(Math.round(+goalIn.value || 60), 5, 900); Store.saveSettings(); render(); } });
    const dayIn = (key) => { const v = S[key] === undefined && key === 'studyGoalSun' ? S.studyGoalWE : S[key], i = el('input', { type: 'number', min: 0, max: 900, step: 15, value: v != null && v !== '' ? v : '', placeholder: 'igual', class: 'sr-goalin', onchange: () => { const t = i.value.trim(); S[key] = t === '' ? null : clamp(Math.round(+t || 0), 0, 900); Store.saveSettings(); render(); } }); return i; };
    const satIn = dayIn('studyGoalWE'), sunIn = dayIn('studyGoalSun');
    const hint = !Store.folders.some((f) => f.subject) ? el('p', { class: 'tm-hint' }, 'Dica: marque pastas como matéria (menu ⋯ da pasta → "Marcar como matéria") para ver o tempo por matéria.') : null;
    const pauseRow = this.unit === 'day' ? el('div', { class: 'rp-pause' }, el('button', { class: 'btn' + (this.isPause(r.a + 43200000) ? ' primary' : ''), onclick: () => { const on = this.togglePause(r.a + 43200000); toast(on ? 'Dia de pausa: não quebra a sequência' : 'Dia de pausa removido', 1800); render(); } }, this.isPause(r.a + 43200000) ? '⏸ Dia de pausa (tocar para tirar)' : '⏸ Marcar como dia de pausa'), el('small', {}, 'Feriado, viagem… o dia não quebra a sequência; se estudar, conta.')) : null;
    const out = el('div', { class: 'rp-geral' }, tiles, pauseRow,
      el('div', { class: 'rp-grid' }, el('div', { class: 'rp-card' }, el('div', { class: 'rp-h' }, this.unit === 'day' ? 'Tempo por hora' : this.unit === 'year' ? 'Tempo por mês' : 'Tempo por dia', el('span', { class: 'rp-hs' }, 'toque numa barra')), plot, detail,
        el('div', { class: 'rp-goalrow' }, el('label', {}, 'Meta seg–sex', goalIn, 'min'), el('label', {}, 'Sábado', satIn, 'min'), el('label', {}, 'Domingo', sunIn, 'min'), el('small', {}, 'vazio = igual a seg–sex · 0 = descanso (não quebra a sequência)'))), side), hint);
    const ci = B.findIndex((b) => now >= b.a && now < b.b), si = this.sel != null && B[this.sel] ? this.sel : ci >= 0 ? ci : B.length - 1;
    if (B[si]) showB(B[si], si); /* v0.43.1: na hora (antes num setTimeout → a tela mudava depois de aparecer) */
    return out;
  },
  /* lista de matérias com barra; tocar abre as notas daquela matéria no período */
  isPause(t) { return (Store.settings.pauseDays || []).includes(StudyTimer.dayKey(typeof t === 'string' ? new Date(t + 'T12:00').getTime() : t)); },
  togglePause(t) { const S = Store.settings, k = StudyTimer.dayKey(typeof t === 'string' ? new Date(t + 'T12:00').getTime() : t), had = (S.pauseDays || []).includes(k); S.pauseDays = (S.pauseDays || []).filter((x) => x !== k); if (!had) S.pauseDays = [...S.pauseDays, k].sort().slice(-120); Store.saveSettings(); return !had; },
  goalTxt() {
    const S = Store.settings, f = StudyTimer.fmtDur.bind(StudyTimer), wd = Math.max(5, +S.studyGoal || 60) * 60000, sat = this.goalMs('2024-01-06'), sun = this.goalMs('2024-01-07'), g = (v) => v ? f(v) : 'descanso';
    if (sat === wd && sun === wd) return `meta ${f(wd)}/dia`;
    return sat === sun ? `meta ${f(wd)} seg–sex · ${g(sat)} fim de semana` : `meta ${f(wd)} seg–sex · sáb ${g(sat)} · dom ${g(sun)}`;
  },
  subjRows(parts, total) {
    const T = StudyTimer, mx = Math.max(1, ...parts.map((p) => p.v));
    return el('div', { class: 'rp-list' }, ...parts.map((p) => el('div', { class: 'rp-row' }, el('span', { class: 'rp-name' }, el('i', { class: 'sr-dot', style: { background: p.color } }), p.name), el('span', { class: 'rp-track' }, el('i', { style: { width: (p.v / mx) * 100 + '%', background: p.color } })), el('b', {}, T.fmtDur(p.v)), el('small', {}, Math.round((p.v / Math.max(1, total)) * 100) + '%'))));
  },

  /* ---------- Calendário ---------- */
  viewCal(r) {
    const T = StudyTimer, map = this.dayMap(), now = Date.now();
    const lvl = (v, k) => { const goal = this.goalMs(k); return v <= 0 ? 0 : !goal || v >= goal ? 4 : v >= goal * 0.6 ? 3 : v >= goal * 0.3 ? 2 : 1; };
    const month = (y, m, big) => {
      const first = new Date(y, m, 1), pad = (first.getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate(), cells = [];
      for (let i = 0; i < pad; i++) cells.push(el('i', { class: 'rp-cell empty' }));
      for (let d = 1; d <= n; d++) {
        const t = new Date(y, m, d, 12).getTime(), v = this.sum(map[T.dayKey(t)]), fut = t > now + 43200000;
        cells.push(el('button', { class: `rp-cell l${lvl(v, T.dayKey(t))}` + (fut ? ' fut' : '') + (!this.goalMs(t) && !v ? ' rest' : '') + (T.dayKey(t) === T.dayKey(now) ? ' today' : ''), title: `${new Date(t).toLocaleDateString('pt-BR')}: ${T.fmtDur(v)}`, onclick: () => this.go('day', t, 'geral') },
          el('span', {}, String(d) + (this.isPause(t) ? ' ⏸' : '')), big && v > 0 ? el('small', {}, T.fmtDur(v)) : null));
      }
      const tot = Object.entries(map).filter(([k]) => k.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).reduce((a, [, d]) => a + this.sum(d), 0);
      return el('div', { class: 'rp-month' + (big ? ' big' : '') }, el('div', { class: 'rp-mh' }, el('button', { class: 'rp-mname', onclick: () => this.go('month', new Date(y, m, 1).getTime(), 'geral') }, first.toLocaleDateString('pt-BR', { month: 'long' })), el('small', {}, T.fmtDur(tot))),
        el('div', { class: 'rp-wd' }, ...['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x) => el('i', {}, x))), el('div', { class: 'rp-days' }, ...cells));
    };
    const d = new Date(r.a), legend = el('div', { class: 'rp-legend' }, el('span', {}, 'menos'), ...[0, 1, 2, 3, 4].map((l) => el('i', { class: 'rp-cell l' + l })), el('span', {}, 'meta batida'));
    if (this.unit === 'year') return el('div', { class: 'rp-cal' }, legend, el('div', { class: 'rp-year' }, ...Array.from({ length: 12 }, (_, m) => month(d.getFullYear(), m, false))));
    return el('div', { class: 'rp-cal' }, legend, month(d.getFullYear(), d.getMonth(), true), el('p', { class: 'tm-hint' }, 'Toque num dia para abrir (lá dá para marcar dia de pausa ⏸). A cor mostra quanto da meta do dia foi cumprido.'));
  },

  /* ---------- Matérias (rosca + lista com notas) ---------- */
  viewSubj(r, render) {
    const T = StudyTimer, list = this.within(r.a, r.b), total = list.reduce((a, [, v]) => a + v, 0), parts = this.bySubj(list);
    if (!parts.length) return el('p', { class: 'tm-hint rp-empty' }, 'Sem tempo registrado neste período.');
    const R = 70, C = 2 * Math.PI * R; let off = 0, svg = `<svg viewBox="0 0 180 180" class="rp-donut"><circle cx="90" cy="90" r="${R}" fill="none" stroke="var(--panel2)" stroke-width="26"/>`;
    for (const p of parts) { const L = (p.v / total) * C; svg += `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${p.color}" stroke-width="26" stroke-dasharray="${Math.max(0, L - 1.5).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 90 90)"/>`; off += L; }
    svg += '</svg>'; const donut = el('div', { class: 'rp-dwrap' }); donut.innerHTML = svg; donut.append(el('div', { class: 'rp-dc' }, el('b', {}, T.fmtDur(total)), el('small', {}, `${parts.length} ${parts.length === 1 ? 'matéria' : 'matérias'}`)));
    const rows = el('div', { class: 'rp-list' }, ...parts.map((p) => {
      const open = this.openSubj === p.key, real = list.filter(([x]) => this.subj(x).key === p.key && !x.lg), ns = this.blocks(real.map(([x]) => x)).length; /* v1.10: pausas curtas não partem a sessão */
      const row = el('button', { class: 'rp-row link' + (open ? ' open' : ''), onclick: () => { this.openSubj = open ? null : p.key; render(); } }, el('span', { class: 'rp-name' }, el('i', { class: 'sr-dot', style: { background: p.color } }), p.name), el('span', { class: 'rp-track' }, el('i', { style: { width: (p.v / parts[0].v) * 100 + '%', background: p.color } })), el('b', {}, T.fmtDur(p.v)), el('small', {}, Math.round((p.v / total) * 100) + '%'));
      if (!open) return row;
      const notes = new Map(); for (const [x, v] of list) if (this.subj(x).key === p.key) { const k = x.n || '_'; notes.set(k, (notes.get(k) || 0) + v); }
      return el('div', { class: 'rp-sub' }, row, el('div', { class: 'rp-subin' }, el('small', {}, ns ? `${ns} ${ns === 1 ? 'sessão' : 'sessões'} · média ${T.fmtDur(real.reduce((a, [, v]) => a + v, 0) / ns)}` : ''),
        ...[...notes.entries()].sort((a, b) => b[1] - a[1]).map(([id, v]) => this.noteRow(id, v))));
    }));
    return el('div', { class: 'rp-grid rp-subj' }, el('div', { class: 'rp-card rp-center' }, donut), el('div', { class: 'rp-card' }, el('div', { class: 'rp-h' }, 'Por matéria', el('span', { class: 'rp-hs' }, 'toque para ver as notas')), rows));
  },
  noteTitle(id) { const T = StudyTimer; return id === '_' ? 'Fora das notas / sem nota' : (Store.heads[id] && Store.heads[id].title) || (T.log.titles || {})[id] || 'Nota apagada'; },
  noteRow(id, v) { const ok = !!Store.heads[id]; return el('div', { class: 'rp-nrow' + (ok ? ' link' : ''), onclick: () => { if (ok) { this._page && this._page.remove(); App.openNote(id); } } }, el('span', {}, this.noteTitle(id)), el('b', {}, StudyTimer.fmtDur(v))); },

  /* ---------- Horários ---------- */
  viewHours(r) {
    const T = StudyTimer, list = this.within(r.a, r.b), H = new Array(24).fill(0), G = Array.from({ length: 7 }, () => new Array(24).fill(0)); let lg = 0;
    for (const [x] of list) {
      if (x.lg) { lg += Math.min(r.b, x.e) - Math.max(r.a, x.s); continue; }
      let a = Math.max(r.a, x.s); const b = Math.min(r.b, x.e);
      while (a < b) { const d = new Date(a), e = Math.min(b, new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime()); H[d.getHours()] += e - a; G[(d.getDay() + 6) % 7][d.getHours()] += e - a; a = e; }
    }
    const tot = H.reduce((a, b) => a + b, 0);
    if (!tot) return el('div', {}, el('p', { class: 'tm-hint rp-empty' }, 'Sem sessões com horário neste período.'), lg ? el('p', { class: 'tm-hint' }, `${T.fmtDur(lg)} são registros antigos (de antes desta versão), sem horário.`) : null);
    const mx = Math.max(...H); let best = 0, bi = 0; for (let h = 0; h < 24; h++) { const w = H[h] + (H[(h + 1) % 24] || 0); if (w > best) { best = w; bi = h; } }
    const part = (h) => (h < 6 ? 'madrugada' : h < 12 ? 'manhã' : h < 18 ? 'tarde' : 'noite');
    const P = { madrugada: 0, manhã: 0, tarde: 0, noite: 0 }; H.forEach((v, h) => { P[part(h)] += v; });
    const plot = el('div', { class: 'rp-hplot' }, ...H.map((v, h) => el('div', { class: 'rp-hcol', title: `${h}h–${h + 1}h: ${T.fmtDur(v)}` }, el('i', { style: { height: v ? Math.max(2, (v / mx) * 100) + '%' : '0' } }), el('small', {}, h % 3 === 0 ? h + 'h' : ''))));
    const gm = Math.max(1, ...G.flat()), WD = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
    const grid = el('div', { class: 'rp-heat' }, ...G.map((row, i) => el('div', { class: 'rp-hrow' }, el('small', {}, WD[i]), ...row.map((v, h) => el('i', { title: `${WD[i]} ${h}h: ${T.fmtDur(v)}`, style: { opacity: v ? 0.18 + 0.82 * (v / gm) : 1, background: v ? 'var(--accent)' : 'var(--panel2)' } })))),
      el('div', { class: 'rp-hrow rp-haxis' }, el('small', {}, ''), ...Array.from({ length: 24 }, (_, h) => el('span', {}, h % 6 === 0 ? h + 'h' : ''))));
    return el('div', { class: 'rp-hours' },
      el('div', { class: 'rp-tiles' }, ...Object.entries(P).map(([k, v]) => el('div', { class: 'rp-tile' + (v === Math.max(...Object.values(P)) && v ? ' up' : '') }, el('small', {}, k.charAt(0).toUpperCase() + k.slice(1)), el('b', {}, T.fmtDur(v)), el('span', {}, Math.round((v / tot) * 100) + '%')))),
      el('div', { class: 'rp-card' }, el('div', { class: 'rp-h' }, 'Por hora do dia', el('span', { class: 'rp-hs' }, `pico: ${bi}h–${(bi + 2) % 24}h`)), plot),
      this.unit === 'day' ? null : el('div', { class: 'rp-card' }, el('div', { class: 'rp-h' }, 'Dia da semana × hora'), grid),
      lg ? el('p', { class: 'tm-hint' }, `${T.fmtDur(lg)} deste período são registros antigos, sem horário, e ficam fora destes gráficos.`) : null);
  },

  /* ---------- Sessões (editar / excluir / adicionar) ---------- */
  viewSess(r, render) {
    const T = StudyTimer, S = Store.settings, list = this.within(r.a, r.b, true).map(([x]) => x), groups = new Map();
    for (const b of this.blocks(list).sort((p, q) => q.s - p.s)) { const k = T.dayKey(b.s); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
    const hm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const add = el('button', { class: 'btn primary', onclick: () => this.editSess(null, render, r) }, '+ Adicionar sessão');
    const cur = S.sessGap == null ? 10 : +S.sessGap;
    const gapRow = el('div', { class: 'rp-gap' }, el('span', { class: 'tm-hint' }, 'Juntar na mesma sessão pausas de até'), ...[0, 5, 10, 15, 30].map((m) => el('button', { class: 'seg-b' + (cur === m ? ' on' : ''), onclick: () => { S.sessGap = m; Store.saveSettings(); render(); } }, m ? m + ' min' : 'não juntar')));
    const out = el('div', { class: 'rp-sess' }, el('div', { class: 'rp-shead' }, el('p', { class: 'tm-hint' }, 'Toque numa sessão para mudar a matéria, o horário ou excluir (sessões com pausas abrem os trechos). Use "Adicionar" para um estudo que não foi registrado. Só o tempo de matérias entra no relatório: sessões sem matéria aparecem apagadas.'), add), gapRow);
    if (!list.length) out.append(el('p', { class: 'tm-hint rp-empty' }, 'Nenhuma sessão neste período.'));
    const row = (x, sub) => { const s = this.subj(x); return el('button', { class: 'rp-srow' + (sub ? ' sub' : '') + (x.live ? ' live' : '') + (this.countable(x) ? '' : ' off'), disabled: !!x.live, onclick: () => this.editSess(x, render, r) },
      el('span', { class: 'rp-stime' }, x.lg ? 'sem horário' : `${hm(x.s)}–${x.live ? 'agora' : hm(x.e)}`), el('b', {}, T.fmtDur(x.e - x.s)),
      el('span', { class: 'rp-name' }, el('i', { class: 'sr-dot', style: { background: s.color } }), s.name), el('span', { class: 'rp-snote' }, (this.countable(x) ? '' : 'não conta (sem matéria) · ') + (x.n ? this.noteTitle(x.n) : x.m ? 'adicionada à mão' : x.lg ? 'registro antigo' : '—'))); };
    for (const [k, bs] of groups) {
      const d = new Date(k + 'T12:00'), tot = bs.reduce((a, b) => a + b.parts.filter((x) => this.countable(x)).reduce((c, x) => c + (x.e - x.s), 0), 0);
      const items = [];
      for (const b of bs) {
        if (b.parts.length === 1) { items.push(row(b.parts[0])); continue; }
        const x0 = b.parts[0], s = this.subj(x0), id = x0.id, open = this.openBlock === id, notes = new Set(b.parts.map((x) => x.n).filter(Boolean));
        const note = notes.size > 1 ? `${notes.size} notas` : notes.size ? this.noteTitle([...notes][0]) : x0.m ? 'adicionada à mão' : '';
        items.push(el('button', { class: 'rp-srow blk' + (open ? ' open' : '') + (b.live ? ' live' : '') + (this.countable(x0) ? '' : ' off'), onclick: () => { this.openBlock = open ? null : id; render(); } },
          el('span', { class: 'rp-stime' }, `${hm(b.s)}–${b.live ? 'agora' : hm(b.e)}`), el('b', {}, T.fmtDur(b.study)),
          el('span', { class: 'rp-name' }, el('i', { class: 'sr-dot', style: { background: s.color } }), s.name),
          el('span', { class: 'rp-snote' }, `${this.countable(x0) ? '' : 'não conta (sem matéria) · '}${note ? note + ' · ' : ''}${b.parts.length} trechos` + (b.pause >= 60000 ? ` · pausas ${T.fmtDur(b.pause)}` : ''))));
        if (open) for (const x of b.parts) items.push(row(x, true));
      }
      out.append(el('div', { class: 'rp-sday' }, el('div', { class: 'rp-h' }, ((t) => t.charAt(0).toUpperCase() + t.slice(1))(d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })), el('span', { class: 'rp-hs' }, T.fmtDur(tot))), ...items));
    }
    return out;
  },
  editSess(x, render, r) {
    const T = StudyTimer, L = T.log, isNew = !x, now = Date.now();
    const pad = (n) => String(n).padStart(2, '0'), dstr = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }, tstr = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const base = x ? x.s : Math.min(now - 3600000, r.b - 3600000);
    const dIn = el('input', { type: 'date', value: dstr(base), max: dstr(now), class: 'rp-in' });
    const sIn = el('input', { type: 'time', value: tstr(base), class: 'rp-in' }), eIn = el('input', { type: 'time', value: tstr(x ? x.e : base + 30 * 60000), class: 'rp-in' });
    const mIn = el('input', { type: 'number', min: 1, max: 900, value: x ? Math.round((x.e - x.s) / 60000) : 30, class: 'rp-in' });
    const subs = Store.folders.filter((f) => f.subject).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const cur = x ? (x.f ? 'f:' + x.f : '') : '', auto = x && x.n ? subjectOfNote(x.n) : null;
    const sel = el('select', { class: 'rp-in' }, x && x.n ? el('option', { value: '' }, `Pela nota (${auto.name})`) : null, ...subs.map((f) => el('option', { value: 'f:' + f.id }, f.name)), el('option', { value: 'f:~' }, 'Sem matéria'), !x || !x.n ? el('option', { value: '_' }, 'Fora das notas') : null);
    sel.value = cur || (x && x.n ? '' : x && !x.f ? '_' : subs[0] ? 'f:' + subs[0].id : 'f:~');
    const lg = x && x.lg, fields = [el('label', {}, 'Dia', dIn)];
    if (lg) fields.push(el('label', {}, 'Minutos', mIn)); else fields.push(el('label', {}, 'Início', sIn), el('label', {}, 'Fim', eIn));
    fields.push(el('label', {}, 'Matéria', sel));
    const body = el('div', { class: 'rp-edit' }, x && x.n ? el('p', { class: 'tm-hint' }, 'Nota: ' + this.noteTitle(x.n)) : null, lg ? el('p', { class: 'tm-hint' }, 'Registro de antes desta versão: só tem a duração do dia, sem horário.') : null, ...fields);
    const save = () => {
      const [y, m, d] = dIn.value.split('-').map(Number); if (!y) { toast('Escolha o dia'); return false; }
      let s, e;
      if (lg) { s = x.s; const k = T.dayKey(x.s), day = new Date(y, m - 1, d).getTime(); if (T.dayKey(day + 43200000) !== k) s = day + 8 * 3600000; e = s + clamp(Math.round(+mIn.value || 0), 1, 900) * 60000; }
      else { const [sh, sm] = sIn.value.split(':').map(Number), [eh, em] = eIn.value.split(':').map(Number); s = new Date(y, m - 1, d, sh, sm).getTime(); e = new Date(y, m - 1, d, eh, em).getTime(); if (e <= s) e += 86400000; }
      if (!(e > s) || e - s > 16 * 3600000) { toast('Horário inválido'); return false; }
      if (e > now + 60000) { toast('A sessão não pode terminar no futuro'); return false; }
      const o = x || { id: uid(), n: null, m: 1 }; o.s = s; o.e = e; delete o.f;
      if (sel.value.startsWith('f:')) o.f = sel.value.slice(2); else if (sel.value === '_') o.n = o.m ? null : o.n;
      if (isNew) L.sessions.push(o); L.sessions.sort((p, q) => p.s - q.s); T.saveLog();
      toast(isNew ? 'Sessão adicionada' : 'Sessão alterada', 1500); render();
    };
    const del = async () => { if (!(await confirmBox('Excluir sessão', 'O tempo dela sai do relatório.', 'Excluir', true))) return false; L.sessions = L.sessions.filter((y) => y !== x); T.saveLog(); toast('Sessão excluída', 1500); render(); };
    openModal({ title: isNew ? 'Adicionar sessão' : 'Editar sessão', body, buttons: [...(isNew ? [] : [{ label: 'Excluir', cls: 'danger', action: del }]), { label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', action: save }] });
  },

  /* ---------- Notas ---------- */
  viewNotes(r) {
    const list = this.within(r.a, r.b), m = new Map(); for (const [x, v] of list) if (x.n) m.set(x.n, (m.get(x.n) || 0) + v);
    const L = [...m.entries()].sort((a, b) => b[1] - a[1]); if (!L.length) return el('p', { class: 'tm-hint rp-empty' }, 'Nenhuma nota estudada neste período.');
    const mx = L[0][1];
    return el('div', { class: 'rp-card' }, el('div', { class: 'rp-h' }, 'Notas mais estudadas', el('span', { class: 'rp-hs' }, 'toque para abrir')), el('div', { class: 'rp-list' }, ...L.slice(0, 40).map(([id, v]) => {
      const s = subjectOfNote(id), ok = !!Store.heads[id];
      return el('div', { class: 'rp-row' + (ok ? ' link' : ''), onclick: () => { if (ok) { this._page && this._page.remove(); App.openNote(id); } } }, el('span', { class: 'rp-name' }, el('i', { class: 'sr-dot', style: { background: s.color } }), this.noteTitle(id)), el('span', { class: 'rp-track' }, el('i', { style: { width: (v / mx) * 100 + '%', background: s.color } })), el('b', {}, StudyTimer.fmtDur(v)), el('small', {}, s.name));
    })));
  },
};
