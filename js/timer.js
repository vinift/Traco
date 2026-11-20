'use strict';
/* ===== v0.21 — Cronômetro de estudo =====
   Três modos: cronômetro (conta para cima), temporizador (contagem regressiva) e Pomodoro (foco/pausa automáticos).
   Fica no topo, ao lado do horário e da bateria (e na biblioteca, ao lado do backup); tocar no horário ou no tempo abre o painel.
   O tempo é calculado por horários (Date.now), então continua certo com o app em segundo plano ou fechado.
   Histórico: o tempo de estudo (não conta as pausas do Pomodoro) é somado por dia e pela nota que estava aberta.
   Guardado em meta 'studyTimer' (estado) e meta 'studyLog' ({ days: { 'AAAA-MM-DD': { idDaNota | '_': ms } }, titles: { id: título } }). */

const StudyTimer = {
  DEF: { mode: 'stopwatch', running: false, acc: 0, runStart: 0, target: 25 * 60000, phase: 'focus', cycle: 0, segStart: 0, segNote: null, segTitle: '', cdMin: 25, pomo: { focus: 25, short: 5, long: 15, every: 4 } },
  st: null, log: null,

  async init() {
    let s = null, l = null;
    try { s = await DB.get('meta', 'studyTimer'); l = await DB.get('meta', 'studyLog'); } catch (e) { console.warn('cronômetro', e); }
    this.st = { ...clone(this.DEF), ...(s || {}) }; this.st.pomo = { ...this.DEF.pomo, ...(this.st.pomo || {}) };
    this.log = l && l.days ? l : { days: {}, titles: {} };
    if (this._on) return this.tick(); this._on = true; // eventos só uma vez
    for (const id of ['noteClock', 'noteTimer', 'libTimer']) { const n = document.getElementById(id); if (n) { n.classList.add('tm-click'); n.addEventListener('click', (e) => { e.stopPropagation(); this.open(n); }); } }
    { const c = document.getElementById('noteClock'); if (c) c.title = 'Horário · toque para o cronômetro de estudo'; }
    /* v0.22: o histórico só soma o tempo com o app aberto na tela (fechado, em segundo plano ou com a tela apagada não conta) */
    /* v0.42: o tempo fora da tela (com o cronômetro contando) fica registrado à parte em log.away, para o relatório mostrar o que não contou */
    const away = () => { const t = Date.now(); if (this.st.running) this.boundary(t); if (this.counts() && !this.st.awayAt) this.st.awayAt = t; this.st.segAway = true; this.save(); };
    const back = () => { this.closeAway(Date.now()); if (this.st.segAway) { this.st.segAway = false; this.st.segStart = Date.now(); this.save(); } this.tick(); };
    document.addEventListener('visibilitychange', () => (document.hidden ? away() : back()));
    addEventListener('pagehide', away);
    this.closeAway(Date.now());
    if (this.st.running) { this.st.segAway = false; this.st.segStart = Date.now(); this.save(); } // app reaberto: o tempo fechado fica de fora
    setInterval(() => this.tick(), 1000);
    this.tick();
  },

  /* ---------- contas ---------- */
  now() { return Date.now(); },
  elapsed(t = Date.now()) { const s = this.st; return s.acc + (s.running ? t - s.runStart : 0); },
  hasTarget() { return this.st.mode !== 'stopwatch'; },
  remaining(t) { return this.st.target - this.elapsed(t); },
  counts() { const s = this.st; return s.running && (s.mode !== 'pomodoro' || s.phase === 'focus'); }, // pausa do Pomodoro não é estudo
  idle() { const s = this.st; return !s.running && s.acc === 0 && !(s.mode === 'pomodoro' && (s.cycle > 0 || s.phase !== 'focus')); },
  curNote() { const ed = document.getElementById('editor'); return typeof Editor !== 'undefined' && Editor.note && ed && !ed.classList.contains('hidden') ? Editor.note : null; },
  dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },

  /* soma no histórico o trecho [a, b), separando na meia-noite */
  addLog(a, b, noteId, title) {
    if (!(b > a)) return; const L = this.log, k = noteId || '_';
    while (a < b) {
      const d = new Date(a); d.setHours(24, 0, 0, 0); const e = Math.min(b, d.getTime()), key = this.dayKey(a);
      const day = L.days[key] || (L.days[key] = {}); day[k] = (day[k] || 0) + (e - a); a = e;
    }
    if (noteId && title) L.titles[noteId] = title;
    const keys = Object.keys(L.days).sort(); while (keys.length > 400) delete L.days[keys.shift()]; // guarda ~1 ano e pouco
    this.saveLog();
  },
  /* fecha o trecho atual (troca de nota, pausa, fim de fase ou a cada minuto) e começa outro */
  boundary(t) {
    const s = this.st;
    if (this.counts() && s.segStart && !s.segAway) this.addLog(s.segStart, t, s.segNote, s.segTitle);
    const n = this.curNote(); s.segStart = t; s.segNote = n ? n.id : null; s.segTitle = n ? n.title : ''; this.save();
  },
  /* v0.42: fecha o trecho fora da tela [awayAt, t) — só até o fim do temporizador/fase, se acabou nesse meio-tempo */
  closeAway(t) {
    const s = this.st, a = s.awayAt; if (!a) return; s.awayAt = 0;
    let e = t; if (s.running && this.hasTarget()) e = Math.min(t, t + this.remaining(t));
    if (!(e > a)) return; const L = this.log, k = this.dayKey(a); L.away = L.away || {}; L.away[k] = (L.away[k] || 0) + (e - a); this.saveLog();
  },
  /* v0.42: tela acesa enquanto o cronômetro roda (o Android apagava a tela lendo sem tocar e o tempo parava de contar) */
  wake() {
    const want = this.st && this.st.running && !document.hidden && 'wakeLock' in navigator;
    if (want && !this._wl && !this._wlBusy) { this._wlBusy = true; navigator.wakeLock.request('screen').then((l) => { this._wl = l; l.addEventListener('release', () => { if (this._wl === l) this._wl = null; }); }).catch(() => {}).finally(() => { this._wlBusy = false; }); }
    else if (!want && this._wl) { const l = this._wl; this._wl = null; l.release().catch(() => {}); }
  },
  save() { DB.put('meta', clone(this.st), 'studyTimer').catch(() => {}); },
  saveLog() { DB.put('meta', this.log, 'studyLog').catch(() => {}); },

  tick() {
    const s = this.st; if (!s) return; const t = Date.now();
    if (s.running) {
      if (this.hasTarget()) { const left = this.remaining(t); if (left <= 0) { this.phaseEnd(t + left); return this.tick(); } }
      const n = this.curNote();
      if ((n ? n.id : null) !== s.segNote || t - s.segStart > 60000) this.boundary(t);
    }
    this.wake(); this.paint();
  },

  /* ---------- controles ---------- */
  start() {
    const s = this.st, t = Date.now(); if (s.running) return;
    if (this.hasTarget() && this.remaining(t) <= 0) this.resetPhase();
    s.running = true; s.runStart = t; this.boundary(t); this.unlockAudio(); this.askNotify(); this.paint(); this.renderPanel();
  },
  pause() {
    const s = this.st, t = Date.now(); if (!s.running) return;
    this.boundary(t); s.acc += t - s.runStart; s.running = false; this.save(); this.paint(); this.renderPanel();
  },
  reset() {
    this.pause(); const s = this.st; s.acc = 0; s.cycle = 0; s.phase = 'focus'; this.resetPhase(); this.save(); this.paint(); this.renderPanel();
  },
  resetPhase() {
    const s = this.st, P = s.pomo; s.acc = 0;
    s.target = s.mode === 'countdown' ? s.cdMin * 60000 : s.mode === 'pomodoro' ? (s.phase === 'focus' ? P.focus : s.phase === 'long' ? P.long : P.short) * 60000 : 0;
  },
  setMode(m) {
    const s = this.st; if (s.mode === m) return; this.pause();
    s.mode = m; s.acc = 0; s.cycle = 0; s.phase = 'focus'; this.resetPhase(); this.save(); this.paint(); this.renderPanel();
  },
  setCountdown(min) { const s = this.st; min = clamp(Math.round(min), 1, 600); s.cdMin = min; if (!s.running && s.acc === 0) s.target = min * 60000; this.save(); this.paint(); this.renderPanel(); },
  setPomo(k, v) { const s = this.st; s.pomo[k] = clamp(Math.round(v) || 1, 1, k === 'every' ? 12 : 180); if (this.idle() || (!s.running && s.acc === 0)) this.resetPhase(); this.save(); this.paint(); },
  /* Pomodoro: pula para a próxima fase */
  skip() { const t = Date.now(), s = this.st; if (s.mode !== 'pomodoro') return; if (!s.running) { s.running = true; s.runStart = t; s.segStart = t; } /* pausado: o tempo parado não vira estudo */ this.phaseEnd(t, true); this.renderPanel(); },

  /* fim do temporizador ou de uma fase do Pomodoro (endT = quando acabou de verdade, pode ser no passado) */
  phaseEnd(endT, skipped) {
    const s = this.st, P = s.pomo; this.boundary(endT);
    if (s.mode === 'countdown') { s.running = false; s.acc = 0; s.target = s.cdMin * 60000; this.save(); this.alert('Tempo esgotado! ' + this.fmtDur(s.cdMin * 60000) + ' de estudo', endT, skipped); this.paint(); this.renderPanel(); return; }
    if (s.phase === 'focus') { // foco acabou: a pausa começa sozinha
      s.cycle++; s.phase = s.cycle % P.every === 0 ? 'long' : 'short'; this.resetPhase(); s.running = true; s.runStart = endT; s.segStart = endT;
      this.alert(`Foco concluído (${s.cycle}º). Pausa ${s.phase === 'long' ? 'longa ' : ''}de ${s.phase === 'long' ? P.long : P.short} min`, endT, skipped);
    } else { // pausa acabou: espera você tocar para começar o próximo foco
      s.phase = 'focus'; this.resetPhase(); s.running = false;
      this.alert('Pausa terminou. Toque em Iniciar para o próximo foco', endT, skipped);
    }
    this.save(); this.paint(); this.renderPanel();
  },
  alert(msg, endT, quiet) {
    if (quiet) return toast(msg, 2500);
    const late = Date.now() - endT > 5000; // terminou enquanto o app estava fechado/em segundo plano
    this.sysAlarm(msg, endT, late); // v0.24: alarme também como notificação do sistema
    this.alarmShow(msg, endT, late);
  },
  /* v0.42: alarme chamativo — tela por cima de tudo piscando, som e vibração repetindo a cada 2 s até tocar em "Parar" (no máximo 1 min).
     Terminou com o app fora (late): mostra a tela sem som. */
  alarmShow(msg, endT, late) {
    clearInterval(this._alarmT); if (this._alarm) this._alarm.remove(); this._alarm = null; const s = this.st, brk = s.mode === 'pomodoro' && s.phase !== 'focus';
    const head = s.mode === 'countdown' ? 'Tempo esgotado!' : brk ? 'Hora da pausa' : 'Hora de voltar ao foco';
    const stop = () => this.alarmStop();
    const btns = [el('button', { class: 'btn primary tma-stop', onclick: stop }, 'Parar')];
    if (s.mode === 'countdown') btns.push(el('button', { class: 'btn tma-more', onclick: () => { stop(); s.acc = 0; s.target = 5 * 60000; s.running = true; s.runStart = Date.now(); this.boundary(s.runStart); this.save(); this.paint(); this.renderPanel(); } }, '+5 min'));
    else if (s.mode === 'pomodoro' && !s.running) btns.push(el('button', { class: 'btn tma-more', onclick: () => { stop(); this.start(); } }, 'Iniciar foco'));
    const ov = el('div', { class: 'tm-alarm' + (late ? ' late' : '') },
      el('div', { class: 'tma-box' }, el('div', { class: 'tma-ic' }, '⏰'), el('b', { class: 'tma-h' }, head), el('div', { class: 'tma-msg' }, (late ? `Terminou às ${this.hhmm(endT)} · ` : '') + msg), el('div', { class: 'tma-btns' }, ...btns)));
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) stop(); });
    document.body.append(ov); this._alarm = ov;
    if (late) return;
    const ring = () => { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 700]); this.beep(true); };
    ring(); let n = 0; this._alarmT = setInterval(() => { if (++n >= 30 || !this._alarm) return this.alarmStop(true); ring(); }, 2000);
  },
  alarmStop(keep) {
    clearInterval(this._alarmT); this._alarmT = null; if (navigator.vibrate) navigator.vibrate(0);
    if (this._alarm && !keep) { this._alarm.remove(); this._alarm = null; this.sysClose && this.sysClose('traco-timer-end'); }
    if (this._alarm && keep) this._alarm.classList.add('late'); // tocou 1 min: para o som, a tela fica até tocar
  },
  unlockAudio() { try { if (!this.ac) this.ac = new (window.AudioContext || window.webkitAudioContext)(); if (this.ac.state === 'suspended') this.ac.resume(); } catch (_) {} },
  beep(loud) {
    try {
      this.unlockAudio(); const ac = this.ac; if (!ac) return; const t0 = ac.currentTime;
      /* v0.42 (loud): 4 bipes alternando 880/1320 Hz, onda triangular e volume maior — mais fácil de ouvir */
      const n = loud ? 4 : 3, vol = loud ? 0.7 : 0.35;
      for (let i = 0; i < n; i++) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = loud && i % 2 ? 1320 : 880; o.type = loud ? 'triangle' : 'sine'; o.connect(g); g.connect(ac.destination); const a = t0 + i * (loud ? 0.28 : 0.35); g.gain.setValueAtTime(0.0001, a); g.gain.exponentialRampToValueAtTime(vol, a + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.22); o.start(a); o.stop(a + 0.24); }
    } catch (_) {}
  },

  /* ---------- tela ---------- */
  fmt(ms) { ms = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(ms / 3600), m = Math.floor((ms % 3600) / 60), s = ms % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0'); },
  fmtDur(ms) { const m = Math.round(ms / 60000); if (m < 1) return ms > 0 ? '<1 min' : '0 min'; const h = Math.floor(m / 60); return h ? `${h}h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') + 'min' : ''}` : m + ' min'; },
  display(t = Date.now()) { return this.fmt(this.hasTarget() ? this.remaining(t) : this.elapsed(t)); },
  phaseName() { const s = this.st; return s.mode === 'stopwatch' ? 'Cronômetro' : s.mode === 'countdown' ? 'Temporizador' : s.phase === 'focus' ? 'Foco' : s.phase === 'long' ? 'Pausa longa' : 'Pausa'; },
  paint() {
    this.sysSync(); this.armEnd();
    const s = this.st, show = !this.idle(), txt = this.display(), brk = s.mode === 'pomodoro' && s.phase !== 'focus';
    for (const id of ['noteTimer', 'libTimer']) {
      const n = document.getElementById(id); if (!n) continue;
      n.classList.toggle('hidden', !show); if (!show) continue;
      const key = txt + '|' + s.running + '|' + brk; if (n._k === key) continue; n._k = key;
      n.innerHTML = icon('timer') + '<b>' + txt + '</b>'; n.classList.toggle('paused', !s.running); n.classList.toggle('brk', brk);
      n.title = `${this.phaseName()}${s.running ? '' : ' (pausado)'} · toque para abrir`;
    }
    const ct = document.querySelector('.ch-title'); if (ct) ct.classList.toggle('has-timer', show);
    if (this.pop && this.pop.isConnected) { const b = this.pop.querySelector('.tm-big'); if (b) b.textContent = txt; const st = this.pop.querySelector('.tm-stats'); if (st && (!this._statT || Date.now() - this._statT > 15000)) { this._statT = Date.now(); st.replaceWith(this.statsEl()); } }
  },

  /* ---------- painel ---------- */
  open(anchor) { const box = el('div', { class: 'tm-pop' }); this.pop = box; this.renderPanel(true); openPop(anchor, box, { onClose: () => { if (this.pop === box) this.pop = null; } }); this.pop = box; },
  renderPanel(force) {
    const box = this.pop; if (!box || (!force && !box.isConnected)) return;
    const s = this.st, P = s.pomo, idle = !s.running && s.acc === 0;
    const tab = (m, label) => el('button', { class: 'tm-tab' + (s.mode === m ? ' on' : ''), onclick: () => this.setMode(m) }, label);
    const btn = (label, fn, cls = '') => el('button', { class: 'btn ' + cls, onclick: fn }, label);
    const sub = s.mode === 'pomodoro' ? `${this.phaseName()} · 🍅 ${s.cycle % P.every}/${P.every}${s.cycle >= P.every ? ` (${s.cycle} no total)` : ''}` : this.phaseName();
    const kids = [
      el('div', { class: 'tm-tabs' }, tab('stopwatch', 'Cronômetro'), tab('countdown', 'Temporizador'), tab('pomodoro', 'Pomodoro')),
      el('div', { class: 'tm-face' + (s.mode === 'pomodoro' && s.phase !== 'focus' ? ' brk' : '') }, el('div', { class: 'tm-big' }, this.display()), el('div', { class: 'tm-sub' }, sub + (!s.running && s.acc > 0 ? ' · pausado' : ''))),
      el('div', { class: 'tm-ctrl' },
        s.running ? btn('Pausar', () => this.pause()) : btn(s.acc > 0 ? 'Continuar' : 'Iniciar', () => this.start(), 'primary'),
        !this.idle() ? btn(s.mode === 'pomodoro' ? 'Parar' : 'Zerar', () => this.reset()) : null,
        s.mode === 'pomodoro' && !this.idle() ? btn(s.phase === 'focus' ? 'Pular para a pausa' : 'Pular pausa', () => this.skip()) : null),
    ];
    if (s.mode === 'countdown' && idle) {
      const inp = el('input', { type: 'number', min: 1, max: 600, value: s.cdMin, class: 'tm-num', onchange: () => this.setCountdown(+inp.value || s.cdMin) });
      kids.push(el('div', { class: 'tm-chips' }, ...[5, 10, 15, 25, 30, 45, 60, 90].map((m) => el('button', { class: 'tm-chip' + (s.cdMin === m ? ' on' : ''), onclick: () => this.setCountdown(m) }, m + ' min')), el('label', { class: 'tm-own' }, inp, 'min')));
    }
    if (s.mode === 'pomodoro' && this.idle()) {
      const f = (label, k, unit) => { const i = el('input', { type: 'number', min: 1, value: P[k], class: 'tm-num', onchange: () => { this.setPomo(k, +i.value); this.renderPanel(); } }); return el('label', { class: 'tm-field' }, el('span', {}, label), i, unit); };
      kids.push(el('div', { class: 'tm-pomo' }, f('Foco', 'focus', 'min'), f('Pausa', 'short', 'min'), f('Pausa longa', 'long', 'min'), f('Longa a cada', 'every', 'focos')));
    }
    if (s.mode === 'pomodoro') kids.push(el('p', { class: 'tm-hint' }, 'A pausa começa sozinha quando o foco acaba; o próximo foco espera você tocar em Iniciar. As pausas não entram no tempo de estudo.'));
    { /* v0.24: avisos pelo sistema */
      const perm = 'Notification' in window ? Notification.permission : 'denied', on = Store.settings.timerNotify !== false;
      const cb = el('input', { type: 'checkbox', checked: on && perm === 'granted', onchange: () => { Store.settings.timerNotify = cb.checked; Store.saveSettings(); if (cb.checked) { if (perm === 'default') this.askNotify(); else if (perm === 'denied') toast('As notificações estão bloqueadas para o Traço nas configurações do Android (Apps → Traço → Notificações)', 4200); } this._sysKey = null; this.sysSync(); this.renderPanel(); } });
      kids.push(el('label', { class: 'tm-sys' }, cb, el('span', {}, 'Avisar pelas notificações do tablet', el('small', {}, perm === 'denied' ? 'bloqueadas no Android — libere em Apps → Traço → Notificações' : 'tempo na tela de bloqueio e alarme ao terminar'))));
    }
    kids.push(this.statsEl()); this._statT = Date.now();
    box.innerHTML = ''; box.append(...kids.filter(Boolean));
  },
  /* totais: hoje, 7 dias (barrinhas) e as notas da semana */
  statsEl() {
    const L = this.log, s = this.st, t = Date.now(), pend = this.counts() && s.segStart && !s.segAway ? t - s.segStart : 0, today = this.dayKey(t);
    const dayTotal = (k) => { const d = L.days[k] || {}; let v = 0; for (const x in d) v += d[x]; return v + (k === today ? pend : 0); };
    const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(t); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ k: this.dayKey(d.getTime()), d }); }
    const vals = days.map((x) => dayTotal(x.k)), max = Math.max(...vals, 1), week = vals.reduce((a, b) => a + b, 0);
    const per = {}; for (const { k } of days) { const d = L.days[k] || {}; for (const x in d) per[x] = (per[x] || 0) + d[x]; }
    if (pend) { const k = s.segNote || '_'; per[k] = (per[k] || 0) + pend; }
    const subj = new Map(); for (const [id, v] of Object.entries(per)) { const sb = subjectOfNote(id), c = subj.get(sb.key) || { ...sb, v: 0 }; c.v += v; subj.set(sb.key, c); } /* v0.35: por matéria */
    const top = [...subj.values()].sort((a, b) => b.v - a.v).slice(0, 6);
    const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const curTitle = (id) => (id === s.segNote && s.segTitle) || L.titles[id] || (typeof Store !== 'undefined' && Store.heads[id] && Store.heads[id].title) || 'Nota apagada';
    const rep = el('button', { class: 'btn sr-open', onclick: () => { closePop(); StudyReport.open(); } }, 'Ver relatório completo'); /* v0.34 */
    return el('div', { class: 'tm-stats' }, rep,
      el('div', { class: 'tm-tot' }, el('span', {}, 'Hoje ', el('b', {}, this.fmtDur(vals[6]))), el('span', {}, '7 dias ', el('b', {}, this.fmtDur(week)))),
      el('div', { class: 'tm-bars' }, ...days.map((x, i) => el('div', { class: 'tm-bar' + (i === 6 ? ' today' : ''), title: `${x.d.toLocaleDateString('pt-BR')}: ${this.fmtDur(vals[i])}` }, el('i', { style: { height: Math.round((vals[i] / max) * 100) + '%' } }), el('small', {}, WD[x.d.getDay()])))),
      top.length ? el('div', { class: 'tm-notes' }, el('div', { class: 'tm-h' }, 'Matérias nos últimos 7 dias'), ...top.map((x) => el('div', { class: 'tm-row' }, el('span', { class: 'tm-subj' }, el('i', { class: 'sr-dot', style: { background: x.color } }), x.name), el('b', {}, this.fmtDur(x.v))))) : el('p', { class: 'tm-hint' }, 'O tempo estudado aparece aqui, por dia e por matéria.'));
  },
};

/* ===== v0.24 — cronômetro integrado às notificações do sistema (Android) =====
   • Enquanto roda: notificação fixa e silenciosa ("Foco · termina às 14:32") na cortina e na tela de bloqueio, com Pausar/Abrir.
   • Ao terminar: alarme do sistema com vibração, que fica até você tocar (com o app em segundo plano ou a tela apagada).
   Limite do Android/Chrome: um site não consegue tocar alarme com o app totalmente encerrado; nesse caso o aviso aparece ao voltar.
   Em segundo plano por muito tempo o Chrome pode atrasar o alarme em até ~1 min. Desligável no painel do cronômetro. */
Object.assign(StudyTimer, {
  sysOn() { return Store.settings.timerNotify !== false && 'Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator; },
  askNotify() {
    if (Store.settings.timerNotify === false || !('Notification' in window) || Notification.permission !== 'default') return;
    try { Notification.requestPermission().then((p) => { if (p === 'granted') { toast('Avisos do cronômetro ligados nas notificações do tablet', 2200); this._sysKey = null; this.sysSync(); } }); } catch (_) {}
  },
  async sysShow(tag, title, opts) {
    try { const r = await navigator.serviceWorker.ready; await r.showNotification(title, { tag, icon: 'icons/icon-192.png', lang: 'pt-BR', ...opts }); } catch (e) { console.warn('notificação', e); }
  },
  async sysClose(tag) { try { const r = await navigator.serviceWorker.ready; for (const n of await r.getNotifications({ tag })) n.close(); } catch (_) {} },
  hhmm(t) { return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); },
  /* notificação fixa: só é refeita quando algo muda (não a cada segundo) */
  sysSync() {
    const s = this.st; if (!s) return;
    if (!this.sysOn()) { if (this._sysKey) { this._sysKey = null; this.sysClose('traco-timer'); } return; }
    const t = Date.now(), endAt = this.hasTarget() && s.running ? t + this.remaining(t) : 0;
    const key = this.idle() ? '' : `${s.mode}|${s.phase}|${s.running}|${Math.round(endAt / 30000)}|${s.running ? 0 : Math.round(this.elapsed(t) / 1000)}`;
    if (key === this._sysKey) return; this._sysKey = key;
    if (!key) return this.sysClose('traco-timer');
    const name = this.phaseName(), note = s.segTitle ? ' · ' + s.segTitle : '';
    let title, body;
    if (!s.running) { title = `⏸ ${name} pausado`; body = (this.hasTarget() ? `Faltam ${this.fmt(this.remaining(t))}` : `${this.fmt(this.elapsed(t))} até agora`) + note; }
    else if (endAt) { title = `⏱ ${name} · termina às ${this.hhmm(endAt)}`; body = `Começou às ${this.hhmm(t - this.elapsed(t))}` + (s.mode === 'pomodoro' ? ` · 🍅 ${s.cycle % s.pomo.every}/${s.pomo.every}` : '') + note; }
    else { title = `⏱ Cronômetro rodando desde ${this.hhmm(t - this.elapsed(t))}`; body = 'Toque para abrir' + note; }
    this.sysShow('traco-timer', title, { body, silent: true, renotify: false, requireInteraction: true, data: { timer: true },
      actions: s.running ? [{ action: 'timer-pause', title: 'Pausar' }, { action: 'open', title: 'Abrir' }] : [{ action: 'timer-start', title: 'Continuar' }, { action: 'open', title: 'Abrir' }] });
  },
  /* alarme no instante exato do fim (o tick de 1 s pode ser atrasado pelo Chrome com o app em segundo plano) */
  armEnd() {
    const s = this.st; clearTimeout(this._endT); this._endT = null;
    if (!s.running || !this.hasTarget()) return;
    const left = this.remaining(Date.now()); if (left > 0) this._endT = setTimeout(() => this.tick(), left + 30);
  },
  sysAlarm(msg, endT, late) {
    if (!this.sysOn()) return;
    const s = this.st, brk = s.mode === 'pomodoro' && s.phase !== 'focus';
    this.sysShow('traco-timer-end', late ? `⏰ Terminou às ${this.hhmm(endT)}` : '⏰ ' + (s.mode === 'countdown' ? 'Tempo esgotado!' : brk ? 'Hora da pausa' : 'Hora de voltar ao foco'), {
      body: msg, silent: false, renotify: true, requireInteraction: true, vibrate: [300, 150, 300, 150, 600], timestamp: endT, data: { timer: true },
      actions: s.mode === 'pomodoro' && !s.running ? [{ action: 'timer-start', title: 'Iniciar foco' }, { action: 'open', title: 'Abrir' }] : [{ action: 'open', title: 'Abrir' }],
    });
    this._sysKey = null; this.sysSync();
  },
  /* botões das notificações (o service worker repassa para cá) */
  onSysAction(a) {
    if (!this.st) return setTimeout(() => this.onSysAction(a), 800); // app acabou de abrir pela notificação
    if (a === 'timer-pause') this.pause();
    else if (a === 'timer-start') this.start();
    this.sysClose('traco-timer-end');
  },
});
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'traco-timer') StudyTimer.onSysAction(e.data.action); });

/* ===== v0.34 — Relatório de estudo =====
   Lê o histórico do cronômetro (meta 'studyLog': ms por dia e por nota). Períodos: 7 dias, 30 dias (barras por dia) e
   12 semanas (barras por semana). Meta diária em minutos (S.studyGoal, padrão 60): linha tracejada no gráfico, "dias na meta"
   e sequência (dias seguidos batendo a meta, contando hoje só se já bateu). Por matéria = pasta de cima da nota (cor da pasta);
   "Fora das notas" = tempo com o cronômetro rodando fora de uma nota. Tocar numa barra mostra o valor. */
const StudyReport = {
  period: '7',
  goalMs() { return Math.max(5, +Store.settings.studyGoal || 60) * 60000; },
  dayMap() { /* dia → { nota: ms }, incluindo o trecho em andamento */
    const T = StudyTimer, L = T.log || { days: {} }, s = T.st || {}, out = {};
    for (const k in L.days) out[k] = { ...L.days[k] };
    const pend = T.counts && T.counts() && s.segStart && !s.segAway ? Date.now() - s.segStart : 0;
    if (pend > 0) { const k = T.dayKey(Date.now()), n = s.segNote || '_'; const d = out[k] || (out[k] = {}); d[n] = (d[n] || 0) + pend; }
    return out;
  },
  /* v0.42.1: ajuste manual — soma (ou tira) minutos numa matéria num dia. Gravado em log.days[dia]['f:<pasta>'] ('_' = fora das notas,
     'f:~' = sem matéria) e listado em log.manual [{id, d, k, ms, at}] para poder desfazer. */
  manualAdd(d, k, ms) {
    const L = StudyTimer.log; if (!ms) return; const day = L.days[d] || (L.days[d] = {});
    day[k] = (day[k] || 0) + ms; if (Math.abs(day[k]) < 1) delete day[k];
    if (!Object.keys(day).length) delete L.days[d];
  },
  adjust(done) {
    const T = StudyTimer, L = T.log; L.manual = L.manual || [];
    const today = T.dayKey(Date.now());
    const subs = Store.folders.filter((f) => f.subject && !(Store.trash && Store.trash.folders && Store.trash.folders[f.id])).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const dIn = el('input', { type: 'date', value: today, max: today, class: 'sr-in' });
    const sIn = el('select', { class: 'sr-in' }, ...subs.map((f) => el('option', { value: 'f:' + f.id }, f.name)), el('option', { value: 'f:~' }, 'Sem matéria'), el('option', { value: '_' }, 'Fora das notas'));
    const mIn = el('input', { type: 'number', min: 1, max: 900, step: 5, value: 15, class: 'sr-in sr-min' });
    let sign = 1; const seg = el('div', { class: 'seg sr-sign' });
    const mk = (v, t) => el('button', { class: v === sign ? 'on' : '', onclick: () => { sign = v; [...seg.children].forEach((b, i) => b.classList.toggle('on', (i === 0 ? 1 : -1) === v)); } }, t);
    seg.append(mk(1, 'Adicionar'), mk(-1, 'Tirar'));
    const list = el('div', { class: 'sr-list sr-manual' });
    const name = (k) => (k === '_' ? 'Fora das notas' : subjectOfNote(k).name);
    const fmtD = (d) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}`; };
    const draw = () => {
      list.innerHTML = ''; const M = L.manual.slice(-12).reverse();
      if (!M.length) return list.append(el('p', { class: 'tm-hint' }, 'Nenhum ajuste feito ainda.'));
      list.append(el('div', { class: 'sr-sec' }, 'Ajustes feitos'), ...M.map((x) => el('div', { class: 'sr-row' }, el('span', { class: 'sr-name' }, `${fmtD(x.d)} · ${name(x.k)}`), el('b', { class: x.ms < 0 ? 'neg' : '' }, (x.ms < 0 ? '−' : '+') + T.fmtDur(Math.abs(x.ms))),
        el('button', { class: 'btn sr-undo', title: 'Desfazer este ajuste', onclick: () => { this.manualAdd(x.d, x.k, -x.ms); L.manual = L.manual.filter((y) => y.id !== x.id); T.saveLog(); draw(); done && done(); } }, 'Desfazer'))));
    };
    draw();
    const add = () => {
      const d = dIn.value || today, k = sIn.value, min = clamp(Math.round(+mIn.value || 0), 0, 900); if (!min || d > today) { toast('Escolha um dia até hoje e os minutos.'); return false; }
      let ms = min * 60000 * sign;
      if (sign < 0) { /* não tira mais do que a matéria tem naquele dia */ const key = k === '_' ? '_' : subjectOfNote(k).key; let have = 0; for (const [id, v] of Object.entries((StudyReport.dayMap()[d]) || {})) if ((id === '_' ? '_' : subjectOfNote(id).key) === key) have += v; ms = -Math.min(-ms, Math.max(0, have)); if (!ms) { toast('Não há tempo dessa matéria nesse dia.'); return false; } }
      this.manualAdd(d, k, ms); L.manual.push({ id: uid(), d, k, ms, at: Date.now() }); if (L.manual.length > 200) L.manual.shift(); T.saveLog();
      toast(`${ms < 0 ? 'Tirado' : 'Adicionado'}: ${T.fmtDur(Math.abs(ms))} em ${name(k)} (${fmtD(d)})`); draw(); done && done(); return false;
    };
    const body = el('div', { class: 'sr-adjbox' },
      el('p', { class: 'tm-hint' }, 'Use quando o relatório não registrou (ou registrou a mais) algum estudo.'),
      seg, el('label', {}, 'Dia', dIn), el('label', {}, 'Matéria', sIn), el('label', {}, 'Minutos', mIn), list);
    openModal({ title: 'Ajustar tempo de estudo', body, buttons: [{ label: 'Fechar' }, { label: 'Salvar ajuste', cls: 'primary', action: add }] });
  },
  sum(d) { let v = 0; for (const x in d || {}) v += d[x]; return v; },
  subjectOf(id) { return subjectOfNote(id); }, /* v0.35: pasta-matéria mais próxima (antes: pasta de cima) */
  open() {
    const box = el('div', { class: 'sr' });
    const render = () => {
      const T = StudyTimer, map = this.dayMap(), goal = this.goalMs(), today = new Date(); today.setHours(12, 0, 0, 0);
      const dayK = (back) => { const d = new Date(today); d.setDate(d.getDate() - back); return [T.dayKey(d.getTime()), d]; };
      const nDays = this.period === '7' ? 7 : this.period === '30' ? 30 : 84;
      const keys = []; for (let i = nDays - 1; i >= 0; i--) keys.push(dayK(i));
      /* barras: por dia (7/30) ou por semana (12 semanas, começando na segunda) */
      let bars;
      if (this.period !== '84') bars = keys.map(([k, d]) => ({ v: this.sum(map[k]), lab: this.period === '7' ? ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()] : d.getDate() % 5 === 0 || d.getDate() === 1 ? String(d.getDate()) : '', tip: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }), goal, ks: [k] }));
      else { bars = []; for (let w = 0; w < 12; w++) { const part = keys.slice(w * 7, w * 7 + 7); const v = part.reduce((a, [k]) => a + this.sum(map[k]), 0), d0 = part[0][1], d1 = part[part.length - 1][1]; bars.push({ ks: part.map((x) => x[0]), v, lab: w % 2 === 0 ? d0.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '', tip: d0.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + '–' + d1.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), goal: goal * 7 }); } }
      const aw = (T.log && T.log.away) || {}, awTot = keys.reduce((a, [k]) => a + (aw[k] || 0), 0);
      const vals = keys.map(([k]) => this.sum(map[k])), total = vals.reduce((a, b) => a + b, 0), studied = vals.filter((v) => v > 0).length;
      const hit = vals.filter((v) => v >= goal).length;
      let streak = 0; { let i = 0; if (this.sum(map[dayK(0)[0]]) < goal) i = 1; for (; i < 400; i++) { if (this.sum(map[dayK(i)[0]]) >= goal) streak++; else break; } }
      const best = keys.reduce((b, [k, d], i) => (vals[i] > b.v ? { v: vals[i], d } : b), { v: 0, d: null });
      /* tiles */
      const tile = (lab, val, sub) => el('div', { class: 'sr-tile' }, el('small', {}, lab), el('b', {}, val), sub ? el('span', {}, sub) : null);
      const tiles = el('div', { class: 'sr-tiles' },
        tile('Total', T.fmtDur(total), studied ? `em ${studied} ${studied === 1 ? 'dia' : 'dias'}` : 'nada ainda'),
        tile('Média por dia', T.fmtDur(total / nDays), studied ? `${T.fmtDur(total / studied)} nos dias estudados` : ''),
        tile('Dias na meta', `${hit} de ${nDays}`, `meta ${T.fmtDur(goal)}/dia`),
        tile('Sequência', `${streak} ${streak === 1 ? 'dia' : 'dias'}`, best.d ? `melhor dia: ${T.fmtDur(best.v)}` : ''));
      /* gráfico (uma série: altura = tempo; linha tracejada = meta) */
      const max = Math.max(...bars.map((b) => b.v), bars[0].goal * 1.1, 1), tipEl = el('div', { class: 'sr-tip' }, 'Toque numa barra para ver o tempo');
      const gl = el('div', { class: 'sr-goal', style: { bottom: (bars[0].goal / max) * 100 + '%' } }, el('span', {}, 'meta'));
      /* v0.39.2: tocar na barra mostra as matérias daquele dia (ou semana) com o tempo de cada uma */
      const showBar = (b) => {
        const m = new Map(); for (const k of b.ks || []) for (const [id, v] of Object.entries(map[k] || {})) { const sj = this.subjectOf(id), cur = m.get(sj.key) || { ...sj, v: 0 }; cur.v += v; m.set(sj.key, cur); }
        const L = [...m.values()].sort((x, y) => y.v - x.v), mx = Math.max(1, ...L.map((x) => x.v));
        tipEl.innerHTML = ''; tipEl.append(el('b', {}, `${b.tip}: ${T.fmtDur(b.v)}${b.v >= b.goal ? ' ✓ meta' : ''}`));
        if (L.length) tipEl.append(el('div', { class: 'sr-list sr-daylist' }, ...L.map((x) => el('div', { class: 'sr-row' }, el('span', { class: 'sr-name' }, el('i', { class: 'sr-dot', style: { background: x.color } }), x.name), el('span', { class: 'sr-track' }, el('i', { style: { width: (x.v / mx) * 100 + '%' } })), el('b', {}, T.fmtDur(x.v))))));
        else tipEl.append(el('div', { class: 'tm-hint' }, 'Nada registrado.'));
        const a = (b.ks || []).reduce((x, k) => x + (aw[k] || 0), 0); if (a >= 30000) tipEl.append(el('div', { class: 'tm-hint sr-away' }, `Não contado (app fora da tela com o cronômetro rodando): ${T.fmtDur(a)}`));
      };
      const plot = el('div', { class: 'sr-plot' + (bars.length > 14 ? ' dense' : '') }, gl, ...bars.map((b) => {
        const c = el('button', { class: 'sr-col', title: `${b.tip}: ${T.fmtDur(b.v)}`, onclick: () => { [...plot.querySelectorAll('.sr-col.on')].forEach((x) => x.classList.remove('on')); c.classList.add('on'); showBar(b); } },
          el('i', { class: b.v >= b.goal ? 'hit' : '', style: { height: b.v ? Math.max(2, (b.v / max) * 100) + '%' : '0' } }), el('small', {}, b.lab));
        return c;
      }));
      /* por matéria e por nota */
      const subj = new Map(), notes = new Map();
      for (const [k] of keys) for (const [id, v] of Object.entries(map[k] || {})) { const s = this.subjectOf(id), cur = subj.get(s.key) || { ...s, v: 0 }; cur.v += v; subj.set(s.key, cur); notes.set(id, (notes.get(id) || 0) + v); }
      const sl = [...subj.values()].sort((a, b) => b.v - a.v), smax = Math.max(1, ...sl.map((x) => x.v));
      const subjBox = el('div', { class: 'sr-list' }, ...sl.map((x) => el('div', { class: 'sr-row' }, el('span', { class: 'sr-name' }, el('i', { class: 'sr-dot', style: { background: x.color } }), x.name), el('span', { class: 'sr-track' }, el('i', { style: { width: (x.v / smax) * 100 + '%' } })), el('b', {}, T.fmtDur(x.v)), el('small', {}, Math.round((x.v / Math.max(1, total)) * 100) + '%'))));
      const title = (id) => (id === '_' ? 'Fora das notas' : (Store.heads[id] && Store.heads[id].title) || (T.log.titles || {})[id] || 'Nota apagada');
      const nl = [...notes.entries()].filter(([id, v]) => !id.startsWith('f:') && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const noteBox = el('div', { class: 'sr-list' }, ...nl.map(([id, v]) => el('div', { class: 'sr-row note' + (Store.heads[id] ? ' link' : ''), onclick: () => { if (Store.heads[id]) { closeModalTop(); App.openNote(id); } } }, el('span', { class: 'sr-name' }, title(id)), el('b', {}, T.fmtDur(v)))));
      /* meta */
      const goalIn = el('input', { type: 'number', min: 5, max: 900, step: 15, value: Math.round(goal / 60000), class: 'sr-goalin', onchange: () => { Store.settings.studyGoal = clamp(Math.round(+goalIn.value || 60), 5, 900); Store.saveSettings(); render(); } });
      const per = el('div', { class: 'xp-tabs sr-per' }, ...[['7', '7 dias'], ['30', '30 dias'], ['84', '12 semanas']].map(([k, n]) => el('button', { class: 'xp-tab' + (this.period === k ? ' on' : ''), onclick: () => { this.period = k; render(); } }, n)));
      box.innerHTML = '';
      box.append(...[per, tiles, awTot >= 60000 ? el('p', { class: 'tm-hint sr-away' }, `${T.fmtDur(awTot)} com o cronômetro rodando e o app fora da tela (tela apagada ou outro app) — não contou. Toque numa barra para ver o dia.`) : null, el('div', { class: 'sr-sec' }, this.period === '84' ? 'Tempo por semana' : 'Tempo por dia'), plot, tipEl,
        el('div', { class: 'sr-goalrow' }, el('label', {}, 'Meta diária ', goalIn, ' min'), el('button', { class: 'btn sr-adj', onclick: () => this.adjust(render) }, 'Ajustar tempo')),
        el('div', { class: 'sr-sec' }, 'Por matéria'), sl.length ? subjBox : el('p', { class: 'tm-hint' }, 'Sem tempo registrado neste período. O tempo conta com o cronômetro rodando e o app aberto.'), !Store.folders.some((f) => f.subject) ? el('p', { class: 'tm-hint' }, 'Dica: marque pastas como matéria (menu ⋯ da pasta → "Marcar como matéria" ou "Transformar as subpastas em matérias").') : null,
        nl.length ? el('div', { class: 'sr-sec' }, 'Notas mais estudadas') : null, nl.length ? noteBox : null].filter(Boolean));
    };
    render();
    const closeModalTop = () => { const b = box.closest('.modal-back'); if (b) b.remove(); };
    openModal({ title: 'Relatório de estudo', body: box, wide: true, buttons: [{ label: 'Fechar', cls: 'primary', value: true }] });
  },
};
