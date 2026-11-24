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
    try { this.migrate(); this.cleanSess(); } catch (e) { console.warn('histórico', e); }
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

  /* v0.43: histórico por SESSÃO em log.sessions [{id, s, e, n (nota|null), f? (matéria escolhida: id da pasta | '~'), lg? (registro antigo,
     sem horário), m? (sessão adicionada à mão)}]. log.days continua sendo gravado (compatibilidade), mas o relatório lê as sessões. */
  migrate() {
    const L = this.log; if (Array.isArray(L.sessions)) return;
    const S = [];
    for (const [d, map] of Object.entries(L.days || {})) {
      const [y, m, dd] = d.split('-').map(Number), d0 = new Date(y, m - 1, dd).getTime(), subj = (k) => (k.startsWith('f:') || k === '_' ? k : subjectOfNote(k).key);
      const pos = Object.entries(map).filter(([, v]) => v > 0).map(([k, v]) => [k, v]);
      for (const [k, v] of Object.entries(map)) if (v < 0) { let r = -v; for (const p of pos) if (r > 0 && subj(p[0]) === subj(k)) { const t = Math.min(r, p[1]); p[1] -= t; r -= t; } } /* ajustes "Tirar" da v0.42.1 */
      const tot = pos.reduce((a, p) => a + Math.max(0, p[1]), 0); let cur = Math.max(d0, Math.min(d0 + 8 * 3600000, d0 + 86400000 - tot - 1000));
      for (const [k, v] of pos) { if (v < 1000) continue; const x = { id: uid(), s: cur, e: cur + v, n: null, lg: 1 }; if (k.startsWith('f:')) x.f = k.slice(2); else if (k !== '_') x.n = k; S.push(x); cur += v; }
    }
    S.sort((a, b) => a.s - b.s); L.sessions = S; L.v = 2; this.saveLog();
  },
  /* v1.10: sessões sobrepostas = tempo contado duas vezes (ex.: histórico antigo convertido em dois aparelhos e juntado pela restauração
     do Drive, que só compara o id). Varre em ordem: a que está inteira dentro de outra sai; a que entra em parte é cortada. Registro
     antigo sem horário (lg) cede para sessão real. Antes da 1ª limpeza com mudança guarda uma cópia em meta 'studyLogBak'. */
  cleanSess() {
    const L = this.log, S = L.sessions; if (!Array.isArray(S) || !S.length) return { removed: 0, trimmed: 0 };
    const before = S.length, out = []; let removed = 0, trimmed = 0, end = -Infinity;
    const list = S.slice().sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s) || (a.lg ? 1 : 0) - (b.lg ? 1 : 0));
    for (const x0 of list) {
      const x = { ...x0 }; if (!(x.e > x.s)) { removed++; continue; }
      let prev = out[out.length - 1], ch = false;
      while (prev && prev.lg && !x.lg && prev.e > x.s) { /* registro antigo cede */ if (prev.s >= x.s) { out.pop(); removed++; } else { prev.e = x.s; trimmed++; } ch = true; prev = out[out.length - 1]; }
      if (ch) end = out.length ? Math.max(...out.slice(-50).map((y) => y.e)) : -Infinity;
      if (x.s >= end) { out.push(x); end = x.e; continue; }
      if (x.e <= end) { removed++; continue; }
      x.s = end; trimmed++; out.push(x); end = x.e;
    }
    if (removed || trimmed) {
      if (!L.cleanedAt) DB.put('meta', clone({ ...L, sessions: S }), 'studyLogBak').catch(() => {});
      L.sessions = out; L.cleanedAt = Date.now(); this.saveLog();
      console.info(`histórico: ${removed} sessão(ões) repetida(s) removida(s), ${trimmed} cortada(s) (${before} → ${out.length})`);
    }
    return { removed, trimmed };
  },
  addSess(a, b, n, f) {
    const S = this.log.sessions || (this.log.sessions = []), last = S[S.length - 1]; n = n || null; f = f || null;
    if (last && !last.lg && !last.m && Math.abs(last.e - a) < 3000 && last.n === n && (last.f || null) === f) last.e = Math.max(last.e, b);
    else { const x = { id: uid(), s: a, e: b, n }; if (f) x.f = f; S.push(x); }
    if (S.length > 8000) S.splice(0, S.length - 8000);
  },
  /* sessões + o trecho em andamento (para o relatório e os painéis) */
  allSess() {
    const s = this.st, out = (this.log.sessions || []).slice();
    if (s && this.counts() && s.segStart && !s.segAway) { const t = Date.now(); if (t > s.segStart) out.push({ id: '_live', s: s.segStart, e: t, n: s.segNote || null, f: s.segSubj || undefined, live: 1 }); }
    return out;
  },
  sessKey(x) { return x.f ? 'f:' + x.f : x.n || '_'; },
  /* matéria escolhida no cronômetro (null = pela nota aberta) */
  setSubj(v) { const s = this.st; if (s.running) this.boundary(Date.now()); s.subj = v || null; if (!s.running) s.segSubj = s.subj; this.save(); this.renderPanel(); this.paint(); },
  autoSubj() { const n = this.curNote(); return n ? subjectOfNote(n.id) : subjectOfNote('_'); },
  curSubj() { const s = this.st; return s.subj ? subjectOfNote('f:' + s.subj) : this.autoSubj(); },
  /* soma no histórico o trecho [a, b), separando na meia-noite */
  addLog(a, b, noteId, title, subj) {
    this.addSess(a, b, noteId, subj);
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
    if (this.counts() && s.segStart && !s.segAway) this.addLog(s.segStart, t, s.segNote, s.segTitle, s.segSubj);
    const n = this.curNote(); s.segStart = t; s.segNote = n ? n.id : null; s.segTitle = n ? n.title : ''; s.segSubj = s.subj || null; this.save();
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
    this.pause(); const s = this.st; s.acc = 0; s.cycle = 0; s.phase = 'focus'; s.subj = null; s.segSubj = null; this.resetPhase(); this.save(); this.paint(); this.renderPanel();
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
    if (this.pop && this.pop.isConnected) { const b = this.pop.querySelector('.tm-big'); if (b) b.textContent = txt; this.paintRing(); const st = this.pop.querySelector('.tm-stats'); if (st && (!this._statT || Date.now() - this._statT > 15000)) { this._statT = Date.now(); st.replaceWith(this.statsEl()); } }
  },

  /* ---------- painel ---------- */
  open(anchor) { const box = el('div', { class: 'tm-pop' }); this.pop = box; this.renderPanel(true); openPop(anchor, box, { onClose: () => { if (this.pop === box) this.pop = null; } }); this.pop = box; this.fitPop(); },
  /* mantém o painel dentro da tela (largura e altura) */
  fitPop() {
    const box = this.pop, pop = box && box.closest('.pop'); if (!pop) return;
    const H = innerHeight, W = innerWidth; let r = pop.getBoundingClientRect();
    if (r.bottom > H - 8) { pop.style.top = Math.max(8, H - 8 - r.height) + 'px'; r = pop.getBoundingClientRect(); }
    box.style.maxHeight = Math.max(200, H - r.top - 36) + 'px'; /* 36 = padding do .pop + folga */
    if (r.right > W - 8 || r.left < 8) pop.style.left = clamp(r.left, 8, Math.max(8, W - r.width - 8)) + 'px';
  },
  /* v0.43: painel com anel grande, matéria da sessão e meta do dia */
  renderPanel(force) {
    const box = this.pop; if (!box || (!force && !box.isConnected)) return;
    const s = this.st, P = s.pomo, idle = !s.running && s.acc === 0, brk = s.mode === 'pomodoro' && s.phase !== 'focus';
    const tab = (m, label) => el('button', { class: 'tm-tab' + (s.mode === m ? ' on' : ''), onclick: () => this.setMode(m) }, label);
    const btn = (label, fn, cls = '') => el('button', { class: 'btn ' + cls, onclick: fn }, label);
    const sub = s.mode === 'pomodoro' ? `${this.phaseName()} · ${s.cycle % P.every}/${P.every} focos` : s.mode === 'stopwatch' ? 'anel = meta do dia' : this.phaseName();
    const R = 92, C = 2 * Math.PI * R, ring = el('div', { class: 'tm-ring' + (brk ? ' brk' : '') + (s.running ? ' run' : '') });
    ring.innerHTML = `<svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="${R}" class="tm-rbg"/><circle cx="110" cy="110" r="${R}" class="tm-prog" stroke-dasharray="0 ${C.toFixed(1)}" transform="rotate(-90 110 110)"/></svg>`;
    ring.append(el('div', { class: 'tm-rin' }, el('div', { class: 'tm-big' }, this.display()), el('div', { class: 'tm-sub' }, sub + (!s.running && s.acc > 0 ? ' · pausado' : '')),
      s.mode === 'pomodoro' ? el('div', { class: 'tm-dots' }, ...Array.from({ length: P.every }, (_, i) => el('i', { class: i < s.cycle % P.every ? 'on' : '' }))) : null));
    /* matéria */
    const cs = this.curSubj(), subjBtn = el('button', { class: 'tm-subjbtn' + (this._subjOpen ? ' open' : ''), onclick: () => { this._subjOpen = !this._subjOpen; this.renderPanel(); } },
      el('i', { class: 'sr-dot', style: { background: cs.color } }), el('span', {}, cs.name), el('small', {}, s.subj ? 'escolhida' : 'pela nota aberta'), el('b', {}, '▾'));
    let subjList = null;
    if (this._subjOpen) {
      const pick = (v) => { this._subjOpen = false; this.setSubj(v); };
      const subs = Store.folders.filter((f) => f.subject).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), auto = this.autoSubj();
      subjList = el('div', { class: 'tm-subjlist' },
        el('button', { class: 'tm-chip' + (!s.subj ? ' on' : ''), onclick: () => pick(null) }, `Pela nota (${auto.name})`),
        ...subs.map((f) => el('button', { class: 'tm-chip' + (s.subj === f.id ? ' on' : ''), onclick: () => pick(f.id) }, el('i', { class: 'sr-dot', style: { background: f.color || FOLDER_COLORS[0] } }), f.name)),
        el('button', { class: 'tm-chip' + (s.subj === '~' ? ' on' : ''), onclick: () => pick('~') }, 'Sem matéria'),
        subs.length ? null : el('p', { class: 'tm-hint' }, 'Marque pastas como matéria (menu ⋯ da pasta) para escolher aqui.'));
    }
    const ck = cs.key, noSubj = ck === '_' || ck === '~' || ck === '?';
    const kids = [
      el('div', { class: 'tm-tabs' }, tab('stopwatch', 'Cronômetro'), tab('countdown', 'Temporizador'), tab('pomodoro', 'Pomodoro')),
      ring, subjBtn, subjList, noSubj ? el('p', { class: 'tm-hint tm-away' }, 'Sem matéria: este tempo não entra no relatório. Escolha uma matéria acima.') : null,
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
      kids.push(el('p', { class: 'tm-hint' }, 'A pausa começa sozinha quando o foco acaba; o próximo foco espera você tocar em Iniciar. As pausas não entram no tempo de estudo.'));
    }
    const colA = kids.splice(0), colB = [this.statsEl()]; this._statT = Date.now();
    { /* v0.24: avisos pelo sistema */
      const perm = 'Notification' in window ? Notification.permission : 'denied', on = Store.settings.timerNotify !== false;
      const cb = el('input', { type: 'checkbox', checked: on && perm === 'granted', onchange: () => { Store.settings.timerNotify = cb.checked; Store.saveSettings(); if (cb.checked) { if (perm === 'default') this.askNotify(); else if (perm === 'denied') toast('As notificações estão bloqueadas para o Traço nas configurações do Android (Apps → Traço → Notificações)', 4200); } this._sysKey = null; this.sysSync(); this.renderPanel(); } });
      colB.push(el('label', { class: 'tm-sys' }, cb, el('span', {}, 'Avisar pelas notificações do tablet', el('small', {}, perm === 'denied' ? 'bloqueadas no Android — libere em Apps → Traço → Notificações' : 'tempo na tela de bloqueio e alarme ao terminar'))));
    }
    /* v0.43.1: duas colunas (controles | números) e altura limitada à tela — antes a parte de baixo saía da tela */
    box.innerHTML = ''; box.append(el('div', { class: 'tm-colA' }, ...colA.filter(Boolean)), el('div', { class: 'tm-colB' }, ...colB.filter(Boolean))); this.paintRing(); this.fitPop();
  },
  /* tempo registrado num dia (sessões + trecho em andamento) */
  dayMs(t = Date.now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); const a = d.getTime(), b = a + 86400000; let v = 0; for (const x of this.allSess()) if (StudyReport.countable(x)) v += Math.max(0, Math.min(b, x.e) - Math.max(a, x.s)); return v; },
  ringFrac(t = Date.now()) { const s = this.st; if (this.hasTarget()) return s.target > 0 ? clamp(1 - this.remaining(t) / s.target, 0, 1) : 0; const g = StudyReport.goalMs(t); return g ? clamp(this.dayMs(t) / g, 0, 1) : this.dayMs(t) > 0 ? 1 : 0; },
  paintRing() {
    const b = this.pop, p = b && b.querySelector('.tm-prog'); if (!p) return;
    const C = 2 * Math.PI * 92, f = this.ringFrac(); p.setAttribute('stroke-dasharray', `${(C * f).toFixed(1)} ${C.toFixed(1)}`);
    const g = b.querySelector('.tm-goalbar i'), gt = b.querySelector('.tm-goaltxt'); if (g) { const v = this.dayMs(), goal = StudyReport.goalMs(); g.style.width = (goal ? Math.min(100, (v / goal) * 100) : v > 0 ? 100 : 0) + '%'; if (gt) gt.textContent = goal ? `${this.fmtDur(v)} de ${this.fmtDur(goal)}` : `${this.fmtDur(v)} · descanso`; b.querySelector('.tm-goal').classList.toggle('hit', v >= goal); }
  },
  /* hoje (barra da meta), 7 dias e matérias da semana */
  statsEl() {
    const t = Date.now(), map = StudyReport.dayMap(), goal = StudyReport.goalMs(), today = this.dayMs(t), aw = ((this.log.away || {})[this.dayKey(t)]) || 0;
    const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(t); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ k: this.dayKey(d.getTime()), d }); }
    const R = StudyReport, gl = R.goalMs(Date.parse('2024-01-03T12:00')), vals = days.map((x) => R.sum(map[x.k])), max = Math.max(...vals, gl, 1), week = vals.reduce((a, b) => a + b, 0);
    const subj = new Map(); for (const { k } of days) for (const [id, v] of Object.entries(map[k] || {})) { const sb = subjectOfNote(id), c = subj.get(sb.key) || { ...sb, v: 0 }; c.v += v; subj.set(sb.key, c); }
    const top = [...subj.values()].sort((a, b) => b.v - a.v).slice(0, 5);
    const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const rep = el('button', { class: 'btn primary sr-open', onclick: () => { closePop(); StudyReport.open(); } }, 'Abrir relatório');
    return el('div', { class: 'tm-stats' },
      el('div', { class: 'tm-goal' + ((goal ? today >= goal : today > 0) ? ' hit' : '') }, el('div', { class: 'tm-tot' }, el('span', {}, 'Hoje'), el('b', { class: 'tm-goaltxt' }, goal ? `${this.fmtDur(today)} de ${this.fmtDur(goal)}` : `${this.fmtDur(today)} · descanso`)), el('div', { class: 'tm-goalbar' }, el('i', { style: { width: (goal ? Math.min(100, (today / goal) * 100) : today > 0 ? 100 : 0) + '%' } })),
        /* v0.50: dia de pausa (feriado etc.) — não quebra a sequência */
        el('button', { class: 'tm-pausebtn' + (R.isPause(t) ? ' on' : ''), onclick: () => { const on = R.togglePause(t); toast(on ? 'Hoje é dia de pausa: não quebra a sequência' : 'Dia de pausa removido', 1800); this.renderPanel(); } }, R.isPause(t) ? '⏸ Hoje é dia de pausa · tirar' : '⏸ Marcar hoje como dia de pausa'),
        aw >= 60000 ? el('small', { class: 'tm-away' }, `${this.fmtDur(aw)} hoje com o app fora da tela não contaram`) : null),
      el('div', { class: 'tm-tot' }, el('span', {}, 'Últimos 7 dias'), el('b', {}, this.fmtDur(week))),
      el('div', { class: 'tm-bars' }, el('div', { class: 'tm-gl', style: { bottom: `calc(14px + (100% - 14px) * ${gl / max})` } }), ...days.map((x, i) => el('div', { class: 'tm-bar' + (i === 6 ? ' today' : '') + (R.dayHit(x.k, vals[i]) === 1 ? ' hit' : ''), title: `${x.d.toLocaleDateString('pt-BR')}: ${this.fmtDur(vals[i])}` }, el('i', { style: { height: Math.round((vals[i] / max) * 100) + '%' } }), el('small', {}, WD[x.d.getDay()])))),
      top.length ? el('div', { class: 'tm-notes' }, ...top.map((x) => el('div', { class: 'tm-row' }, el('span', { class: 'tm-subj' }, el('i', { class: 'sr-dot', style: { background: x.color } }), x.name), el('b', {}, this.fmtDur(x.v))))) : el('p', { class: 'tm-hint' }, 'O tempo estudado aparece aqui, por dia e por matéria.'),
      rep);
  },
};

/* ===== v0.24 — cronômetro integrado às notificações do sistema (Android) =====
   • Enquanto roda: notificação fixa e silenciosa ("Foco · termina às 14:32") na cortina e na tela de bloqueio, com Pausar/Abrir.
   • Ao terminar: alarme do sistema com vibração, que fica até você tocar (com o app em segundo plano ou a tela apagada).
   Limite do Android/Chrome: um site não consegue tocar alarme com o app totalmente encerrado; nesse caso o aviso aparece ao voltar.
   Em segundo plano por muito tempo o Chrome pode atrasar o alarme em até ~1 min. Desligável no painel do cronômetro. */
Object.assign(StudyTimer, {
  sysOn() { if (Native.on) return Store.settings.timerNotify !== false && Native.notifyOk(); /* v1.0: notificações do Android */ return Store.settings.timerNotify !== false && 'Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator; },
  askNotify() {
    if (Native.on) { if (Store.settings.timerNotify !== false && !Native.notifyOk()) Native.notifyAsk(); return; }
    if (Store.settings.timerNotify === false || !('Notification' in window) || Notification.permission !== 'default') return;
    try { Notification.requestPermission().then((p) => { if (p === 'granted') { toast('Avisos do cronômetro ligados nas notificações do tablet', 2200); this._sysKey = null; this.sysSync(); } }); } catch (_) {}
  },
  async sysShow(tag, title, opts) {
    if (Native.on) return Native.notify(tag, title, opts);
    try { const r = await navigator.serviceWorker.ready; await r.showNotification(title, { tag, icon: 'icons/icon-192.png', lang: 'pt-BR', ...opts }); } catch (e) { console.warn('notificação', e); }
  },
  async sysClose(tag) { if (Native.on) return Native.notifyClose(tag); try { const r = await navigator.serviceWorker.ready; for (const n of await r.getNotifications({ tag })) n.close(); } catch (_) {} },
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
    if (Native.on) { /* v1.0: alarme marcado no Android — toca mesmo com o app fechado */
      const on = s.running && this.hasTarget() && this.sysOn(), brk = s.mode === 'pomodoro' && s.phase !== 'focus';
      Native.alarm(on ? Date.now() + this.remaining(Date.now()) : 0, '⏰ ' + (s.mode === 'countdown' ? 'Tempo esgotado!' : brk ? 'Hora de voltar ao foco' : 'Hora da pausa'), s.segTitle || 'Traço');
    }
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
