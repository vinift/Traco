/* ===== v0.19 — recorte de imagem direto na página =====
   "Recortar imagem" (barra do laço) mostra a imagem inteira, apagadinha, no próprio lugar, com a moldura do recorte e 8 alças.
   Arraste as alças (caneta ou dedo) ou o meio da moldura; tocar na parte apagada desenha uma moldura nova.
   Fora da imagem o dedo continua rolando e dando zoom.
   Aplicar: ✓, Enter ou tocar fora da imagem. Cancelar: ✕, Esc ou desfazer.
   O recorte fica em frações da imagem original (e.crop), então dá para desfazer ou mudar depois sem perder nada. */

const CROP_RATIOS = [['Livre', 0], ['Original', -1], ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9]];

/* arrasto de uma alça: c0 = moldura no início, h = alça (n, ne, e… ou move), dx/dy em frações, ratio = largura/altura em px (0 = livre) */
function cropDragMath(c0, h, dx, dy, IW, IH, ratio, mw, mh) {
  if (h === 'move') return { ...c0, x: clamp(c0.x + dx, 0, 1 - c0.w), y: clamp(c0.y + dy, 0, 1 - c0.h) };
  let x1 = c0.x, y1 = c0.y, x2 = c0.x + c0.w, y2 = c0.y + c0.h;
  if (h.includes('w')) x1 = clamp(x1 + dx, 0, x2 - mw);
  if (h.includes('e')) x2 = clamp(x2 + dx, x1 + mw, 1);
  if (h.includes('n')) y1 = clamp(y1 + dy, 0, y2 - mh);
  if (h.includes('s')) y2 = clamp(y2 + dy, y1 + mh, 1);
  if (ratio > 0) { /* mantém a proporção: o lado arrastado manda, o outro acompanha */
    let w = (x2 - x1) * IW, hh = (y2 - y1) * IH;
    if (h === 'n' || h === 's') w = hh * ratio; else if (h === 'e' || h === 'w') hh = w / ratio; else if (w / hh > ratio) hh = w / ratio; else w = hh * ratio;
    w = Math.min(w, (h.includes('w') ? x2 : 1 - x1) * IW); hh = w / ratio;
    hh = Math.min(hh, (h.includes('n') ? y2 : 1 - y1) * IH); w = hh * ratio;
    if (h.includes('w')) x1 = x2 - w / IW; else x2 = x1 + w / IW;
    if (h.includes('n')) y1 = y2 - hh / IH; else y2 = y1 + hh / IH;
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
/* aplica uma proporção mantendo o centro da moldura */
function cropFitRatio(c, ratio, IW, IH) {
  if (!(ratio > 0)) return c;
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2; let w = c.w * IW, h = c.h * IH;
  if (w / h > ratio) w = h * ratio; else h = w / ratio;
  const nw = w / IW, nh = h / IH;
  return { x: clamp(cx - nw / 2, 0, 1 - nw), y: clamp(cy - nh / 2, 0, 1 - nh), w: nw, h: nh };
}

Object.assign(Editor, {
  crop: null,
  async cropSel() {
    const els = this.selElements(); if (els.length !== 1 || els[0].type !== 'image' || els[0].lock) return;
    const e = els[0], page = this.pageById(this.sel.pageId);
    const bmp = await ImgCache.load(e.blobId); if (!bmp) return toast('A imagem ainda não carregou. Tente de novo.', 2500);
    if (!this.sel || !this.sel.ids.has(e.id) || !page.elements.includes(e)) return;
    this.commitText();
    const oc = e.crop || { x: 0, y: 0, w: 1, h: 1 }, fw = e.w / oc.w, fh = e.h / oc.h;
    this.crop = {
      pageId: page.id, id: e.id, bmp, IW: bmp.width, IH: bmp.height, oc, c: { ...oc }, ratio: 0,
      F: { x: e.x - oc.x * fw, y: e.y - oc.y * fh, w: fw, h: fh }, // imagem inteira, no referencial sem giro
      pc: { x: e.x + e.w / 2, y: e.y + e.h / 2 }, rot: e.rot || 0, // o giro é em torno do centro da caixa visível atual
    };
    $('#selBar').classList.add('hidden'); this.buildCropBar(); this.requestRender();
  },
  cropPi() { return this.crop ? this.pageIdx(this.pageById(this.crop.pageId)) : -1; },
  /* tela → frações (u, v) da imagem inteira */
  cropUV(p) {
    const K = this.crop, pi = this.cropPi(); if (pi < 0) return { u: -1, v: -1 };
    const w = this.toWorld(p.x, p.y), l = this.local(pi, w.x, w.y);
    const [x, y] = K.rot ? rotPt(l.x, l.y, K.pc.x, K.pc.y, -K.rot) : [l.x, l.y];
    return { u: (x - K.F.x) / K.F.w, v: (y - K.F.y) / K.F.h };
  },
  /* frações (u, v) → tela */
  cropScr(u, v) {
    const K = this.crop, o = this.layout[this.cropPi()]; let x = K.F.x + u * K.F.w, y = K.F.y + v * K.F.h;
    if (K.rot) [x, y] = rotPt(x, y, K.pc.x, K.pc.y, K.rot);
    return this.toScreen(x + o.x, y + o.y);
  },
  cropHandles() {
    const c = this.crop.c, x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h, xm = (x1 + x2) / 2, ym = (y1 + y2) / 2;
    return [['nw', x1, y1], ['ne', x2, y1], ['se', x2, y2], ['sw', x1, y2], ['n', xm, y1], ['e', x2, ym], ['s', xm, y2], ['w', x1, ym]].map(([h, u, v]) => { const s = this.cropScr(u, v); return [h, s.x, s.y]; });
  },
  cropHit(p) {
    let best = null, bd = 26;
    for (const [h, x, y] of this.cropHandles()) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = h; } }
    if (best) return best;
    const { u, v } = this.cropUV(p), c = this.crop.c;
    if (u >= c.x && u <= c.x + c.w && v >= c.y && v <= c.y + c.h) return 'move';
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return 'img';
    return null;
  },
  /* chamado no onDown: true = o toque/caneta foi usado pelo recorte */
  cropDown(e, p, rec) {
    if (this.action) { if (this.action.kind === 'crop' || this.action.kind === 'cropout') { rec.ignored = true; return true; } return false; }
    if (e.pointerType === 'mouse' && e.button !== 0) return false;
    if (e.pointerType === 'touch') {
      if (this.gesture || this.touchIds().length > 1) return false; // pinça: zoom normal
      if (Store.settings.palmGuard && (this.penDown || performance.now() - this.lastPenSeen < 500)) return false;
    }
    const k = this.cropHit(p);
    if (!k) { if (e.pointerType === 'touch') return false; rec.drawing = true; this.action = { pid: e.pointerId, ptype: e.pointerType, kind: 'cropout', sx: p.x, sy: p.y }; return true; }
    rec.drawing = true; const K = this.crop, uv = this.cropUV(p);
    this.action = { pid: e.pointerId, ptype: e.pointerType, kind: 'crop', h: k, c0: { ...K.c }, p0: [uv.u, uv.v] };
    if (k === 'img') { const u = clamp(uv.u, 0, 1), v = clamp(uv.v, 0, 1); K.c = { x: u, y: v, w: 0, h: 0 }; Object.assign(this.action, { h: 'se', c0: { ...K.c }, p0: [u, v], fresh: true, prev: this.action.c0 }); }
    return true;
  },
  cropMove(p) {
    const a = this.action, K = this.crop; if (!K) return;
    const uv = this.cropUV(p), z = this.cam.z, mw = 16 / (z * K.F.w), mh = 16 / (z * K.F.h);
    const dx = (a.h === 'move' ? uv.u : clamp(uv.u, 0, 1)) - a.p0[0], dy = (a.h === 'move' ? uv.v : clamp(uv.v, 0, 1)) - a.p0[1];
    K.c = cropDragMath(a.c0, a.h, dx, dy, K.IW, K.IH, K.ratio, mw, mh); this.requestRender();
  },
  cropEnd(a) {
    const K = this.crop; if (!K) return;
    const z = this.cam.z; if (K.c.w * K.F.w * z < 12 || K.c.h * K.F.h * z < 12) K.c = a.fresh ? { ...a.prev } : a.c0; // moldura pequena demais: volta
    this.requestRender();
  },
  setCropRatio(r) {
    const K = this.crop; if (!K) return;
    if (r === -1) { K.ratio = K.IW / K.IH; K.c = { x: 0, y: 0, w: 1, h: 1 }; } else { K.ratio = r; K.c = cropFitRatio(K.c, r, K.IW, K.IH); }
    K.ratioKey = r; this.paintCropBar(); this.requestRender();
  },
  cropReset() { const K = this.crop; if (!K) return; K.ratio = 0; K.ratioKey = 0; K.c = { x: 0, y: 0, w: 1, h: 1 }; this.paintCropBar(); this.requestRender(); },
  cancelCrop() { if (!this.crop) return; this.crop = null; this.removeCropBar(); if (this.action && /^crop/.test(this.action.kind)) this.action = null; this.requestRender(); },
  applyCrop() {
    const K = this.crop; if (!K) return; this.cancelCrop();
    const page = this.pageById(K.pageId), cur = page && page.elements.find((x) => x.id === K.id); if (!cur) return;
    const r5 = (v) => Math.round(v * 1e5) / 1e5, nc = { x: r5(K.c.x), y: r5(K.c.y), w: r5(K.c.w), h: r5(K.c.h) }, oc = K.oc;
    if (Math.abs(nc.x - oc.x) < 1e-5 && Math.abs(nc.y - oc.y) < 1e-5 && Math.abs(nc.w - oc.w) < 1e-5 && Math.abs(nc.h - oc.h) < 1e-5) return; // nada mudou
    const F = K.F; let nw = nc.w * F.w, nh = nc.h * F.h, nx = F.x + nc.x * F.w, ny = F.y + nc.y * F.h;
    if (cur.rot) { const q = rotPt(nx + nw / 2, ny + nh / 2, K.pc.x, K.pc.y, cur.rot); nx = q[0] - nw / 2; ny = q[1] - nh / 2; }
    const n = { ...cur, x: nx, y: ny, w: nw, h: nh };
    if (nc.x < 1e-4 && nc.y < 1e-4 && nc.w > 0.9999 && nc.h > 0.9999) delete n.crop; else n.crop = nc;
    this.recReplace(page, cur, n); this.opCommit();
    this.sel = { pageId: page.id, ids: new Set([cur.id]) }; UI.buildSelBar(); this.requestRender();
  },

  /* desenho (dentro do laço das páginas, com a transformação da página): imagem inteira apagada + parte recortada nítida */
  drawCropImage(ctx) {
    const K = this.crop, F = K.F, c = K.c, W = K.IW, H = K.IH;
    ctx.save();
    if (K.rot) { ctx.translate(K.pc.x, K.pc.y); ctx.rotate(K.rot); ctx.translate(-K.pc.x, -K.pc.y); }
    ctx.globalAlpha = 0.3; ctx.drawImage(K.bmp, F.x, F.y, F.w, F.h); ctx.globalAlpha = 1;
    if (c.w > 0 && c.h > 0) ctx.drawImage(K.bmp, c.x * W, c.y * H, Math.max(1e-3, c.w * W), Math.max(1e-3, c.h * H), F.x + c.x * F.w, F.y + c.y * F.h, c.w * F.w, c.h * F.h);
    ctx.restore();
  },
  /* moldura, linhas dos terços e alças (em pixels da tela) */
  drawCropUI() {
    const K = this.crop, ctx = this.ctx, d = this.dpr, c = K.c; ctx.save(); ctx.setTransform(d, 0, 0, d, 0, 0);
    const P = (u, v) => { const s = this.cropScr(u, v); return [s.x, s.y]; };
    const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
    poly([P(0, 0), P(1, 0), P(1, 1), P(0, 1)]); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(124,58,237,.55)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    const x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h;
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
    for (const t of [1 / 3, 2 / 3]) {
      ctx.beginPath(); ctx.moveTo(...P(x1 + c.w * t, y1)); ctx.lineTo(...P(x1 + c.w * t, y2)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(...P(x1, y1 + c.h * t)); ctx.lineTo(...P(x2, y1 + c.h * t)); ctx.stroke();
    }
    poly([P(x1, y1), P(x2, y1), P(x2, y2), P(x1, y2)]); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 3.5; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    for (const [h, x, y] of this.cropHandles()) {
      ctx.beginPath(); if (h.length === 2) ctx.arc(x, y, 8, 0, Math.PI * 2); else ctx.roundRect(x - 6, y - 6, 12, 12, 3);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
    /* barra do recorte perto da imagem (em cima, ou embaixo se não couber) */
    const bar = $('#cropBar'); if (!bar) return;
    const hs = this.cropHandles(), xs = hs.map((q) => q[1]), ys = hs.map((q) => q[2]);
    const bx1 = Math.min(...xs), bx2 = Math.max(...xs), by1 = Math.min(...ys), by2 = Math.max(...ys), bw = bar.offsetWidth, bh = bar.offsetHeight;
    let y = by1 - bh - 22; if (y < 6) y = by2 + 22; if (y + bh > this.H - 6) y = clamp(by1 + 10, 6, this.H - bh - 6);
    bar.style.left = clamp((bx1 + bx2) / 2 - bw / 2, 6, Math.max(6, this.W - bw - 6)) + 'px'; bar.style.top = y + 'px';
  },
  buildCropBar() {
    this.removeCropBar();
    const bar = el('div', { id: 'cropBar', class: 'sel-bar crop-pbar' });
    for (const [n, r] of CROP_RATIOS) bar.append(el('button', { class: 'crop-chip', 'data-r': r, onclick: () => this.setCropRatio(r) }, n));
    const B = (ic, title, fn, cls = '') => { const b = el('button', { class: 'icon-btn ' + cls, title, onclick: fn }); b.innerHTML = icon(ic); bar.append(b); return b; };
    bar.append(el('span', { class: 'crop-sep' }));
    B('refresh', 'Restaurar original (imagem inteira)', () => this.cropReset());
    B('x', 'Cancelar (Esc)', () => this.cancelCrop());
    B('check', 'Aplicar recorte (Enter ou toque fora da imagem)', () => this.applyCrop(), 'crop-ok');
    this.stage.append(bar); this.paintCropBar();
  },
  paintCropBar() { const K = this.crop; $$('#cropBar .crop-chip').forEach((b) => b.classList.toggle('on', K && +b.dataset.r === (K.ratioKey || 0))); },
  removeCropBar() { const b = $('#cropBar'); if (b) b.remove(); },
});

/* ===== v0.20 — três toques rápidos com a caneta = laço (v0.21: e, com o laço ativo, de volta para a caneta) =====
   Funciona com qualquer ferramenta. Só observa os eventos (captura no #stage, antes do editor) e, no 3º toque,
   desfaz o que os toques criaram (pontinhos, borrachadas, seleção, caixa de texto) e troca para o laço. */
Object.assign(Editor, {
  initPenTriple() {
    /* v0.23: toque DUPLO (antes triplo), no mesmo lugar; a ação vem de Configurações → Botões da caneta (penDouble) */
    /* v0.25: mais exigente — os dois pontos do ":" (pertinho e um logo depois do outro) disparavam o toque duplo. Agora: no MESMO ponto (≤ 8 px), toques curtos (< 200 ms) e o 2º logo em seguida (< 260 ms) */
    const TAP_MS = 200, GAP_MS = 260, MOVE = 6, NEAR = 8;
    const skip = (e) => e.target.closest && e.target.closest('#selBar,#cropBar,#textBar,#hbar,.chrome');
    let down = null, taps = [];
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'pen' || !(e.buttons & 1) || !this.note || this.crop || skip(e)) { down = null; return; } /* v0.40: mesmo com a ação 'nada', o toque duplo num colchete continua o colchete */
      if (this.vEditEl && this.vEditEl()) { down = null; taps = []; return; } /* v0.26.1: editando pontos, o toque duplo é para criar/remover vértice */
      const now = performance.now(), last = taps[taps.length - 1];
      if (!last || now - last.up > GAP_MS || Math.hypot(e.clientX - taps[0].x, e.clientY - taps[0].y) > NEAR) {
        taps = [];
        /* início de uma possível sequência: o que já estava pendente fica valendo (não entra no "desfazer" dos toques) */
        if (this.textEl) this.commitText(); if (this._penDot) this.flushPenDot();
      }
      down = { id: e.pointerId, t: now, x: e.clientX, y: e.clientY, far: false };
      if (!taps.length) { this._tripleBase = now; this._tripleTool = this.tool; } /* ferramenta de antes dos toques */
    }, true);
    this.stage.addEventListener('pointermove', (e) => { if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > MOVE) down.far = true; }, true);
    const up = (e) => {
      if (!down || e.pointerId !== down.id) return; const d = down; down = null; const now = performance.now();
      if (d.far || now - d.t > TAP_MS) { taps = []; return; }
      taps.push({ x: d.x, y: d.y, up: now });
      if (taps.length < 2) return;
      taps = []; const base = this._tripleBase, was = this._tripleTool;
      setTimeout(() => this.penTripleFire(base, was, { x: d.x, y: d.y }), 0); // depois que o editor terminar de tratar o 2º toque
    };
    this.stage.addEventListener('pointerup', up, true);
    this.stage.addEventListener('pointercancel', () => { down = null; }, true);
  },
  /* v0.40: toque duplo da caneta em cima (na área) de um colchete → cria outro colchete que continua a mesma reta e termina
     DUAS linhas da pauta/grade abaixo do fim deste (pula uma linha), com a mesma ponta, curva, cor e espessura. A reta nova começa
     em (canto − raio), como no encadear da v0.34.1, então passa direto pela junção. Sem pauta: o mesmo comprimento do colchete tocado */
  bracketChain(pos) {
    const r = this.stage.getBoundingClientRect(), w = this.toWorld(pos.x - r.left, pos.y - r.top), pi = this.pageIndexAt(w.x, w.y, true), page = this.note.pages[pi]; if (!page) return false;
    const l = this.local(pi, w.x, w.y), m = 18 / this.cam.z;
    for (let i = page.elements.length - 1; i >= 0; i--) {
      const e = page.elements[i]; if (e.type !== 'shape' || e.kind !== 'path' || e.lock) continue;
      const b = elBBox(e); if (l.x < b.x - m || l.x > b.x + b.w + m || l.y < b.y - m || l.y > b.y + b.h + m) continue;
      const k = bracketBottom(e); if (!k) continue;
      const rg = this.ruledFor(page), step = rg && rg.s > 0 ? 2 * rg.s : Math.max(20, k.len), y2 = k.y + step;
      const n = { id: uid(), type: 'shape', kind: 'path', pts: [k.x, k.y - k.r, k.x, y2, k.x + k.tip, y2].map(r2), rr: [0, r2(k.r), 0], color: e.color, width: e.width, fill: null };
      if (e.dash) n.dash = e.dash; if (e.opacity != null) n.opacity = e.opacity;
      this.recAdd(page, n); this.opCommit(); toast('Colchete continuado', 900); return true;
    }
    return false;
  },
  /* v0.41: hífen rápido — no centro do quadrado da grade (um pouco abaixo do meio), com a cor/espessura/tipo da caneta atual.
     Pauta (só linhas): no meio da faixa entre as linhas, onde a caneta tocou. Folha lisa: onde tocou, com 14 de comprimento.
     Disparo: botão da caneta com a ação 'hyphen' (arma; o próximo toque da ponta coloca — `_hyArm`, vale 8 s) ou toque duplo ('hyphen') */
  placeHyphen(p) {
    const w = this.toWorld(p.x, p.y), pi = this.pageIndexAt(w.x, w.y, true), page = this.note.pages[pi]; if (!page) return false;
    const l = this.local(pi, w.x, w.y), tpl = page.template || this.note.template, has = tpl && tpl.type !== 'blank';
    const rows = has ? this.gridLines(tpl, page, 1) : null, cols = has ? this.gridLines(tpl, page, 0) : null;
    let cx = l.x, cy = l.y, len = 14;
    if (rows && rows.s > 0) { const k = Math.floor((l.y - rows.o) / rows.s); cy = rows.o + (k + 0.5) * rows.s + rows.s * 0.1; len = rows.s * 0.25; }
    if (cols && cols.s > 0) { const k = Math.floor((l.x - cols.o) / cols.s); cx = cols.o + (k + 0.5) * cols.s; len = cols.s * 0.25; /* v0.41.1: ~1/4 do quadrado (antes 0,42) */ }
    const st = Store.settings.tools.pen, h = len / 2, el = { id: uid(), type: 'stroke', tool: 'pen', color: st.color, width: st.width, pen: st.type || 'ball', pts: [r2(cx - h), r2(cy), 0.5, r2(cx), r2(cy), 0.5, r2(cx + h), r2(cy), 0.5] };
    if (st.type === 'calli') el.nib = st.nib ?? 45; if (st.dash && st.dash !== 'solid') el.dash = st.dash;
    this.recAdd(page, el); this.opCommit(); return true;
  },
  penTripleFire(base, was, pos) {
    if (!this.note) return;
    if (this._penDot) { clearTimeout(this._penDot.timer); this._penDot = null; } // pontinho ainda não gravado: descarta
    if (this.textEl) this.commitText();
    if (this.action) this.cancelAction();
    let n = 0; // desfaz só o que nasceu durante os toques
    while (this.undoStack.length && this.undoStack[this.undoStack.length - 1].t >= base) { this.undo(); n++; }
    if (n) this.redoStack.splice(this.redoStack.length - n, n);
    this.sel = null; this.updateUndoBtns();
    if (pos && this.bracketChain(pos)) { if (navigator.vibrate) navigator.vibrate(12); this.requestRender(); return; } /* v0.40: em cima de um colchete → continua o colchete, sem trocar de ferramenta */
    if (navigator.vibrate) navigator.vibrate(12);
    const act = penDoubleAction(); if (act === 'none') return this.requestRender();
    if (act === 'lassoToggle') { /* laço ↔ caneta (a caneta volta com o tipo, cor e espessura de antes) */
      const to = was === 'lasso' ? 'pen' : 'lasso'; UI.setTool(to, true); toast(to === 'pen' ? 'Caneta' : 'Laço', 700);
    } else if (act === 'eraserToggle') {
      const to = was === 'eraser' ? (this._prevTool && this._prevTool !== 'eraser' ? this._prevTool : 'pen') : 'eraser'; if (to === 'eraser') this._prevTool = was; UI.setTool(to, true); toast(to === 'eraser' ? 'Borracha' : 'Caneta', 700);
    } else if (act === 'undo') { this.undo(); toast('Desfeito', 700); }
    else if (act === 'redo') { this.redo(); toast('Refeito', 700); }
    else if (act === 'read') { this.setReadOnly(!this.readOnly); toast(this.readOnly ? 'Modo leitura' : 'Edição', 700); }
    else if (act === 'hyphen' && pos) { const r = this.stage.getBoundingClientRect(); this.placeHyphen({ x: pos.x - r.left, y: pos.y - r.top }); }
    this.requestRender();
  },
});

/* ===== v0.22 — segurar o dedo com o laço: colar da biblioteca =====
   Mostra o último item salvo em destaque e os recentes embaixo; tocar cola no lugar onde o dedo segurou. */
Object.assign(Editor, {
  async lassoHoldPaste(p) {
    if (navigator.vibrate) navigator.vibrate(15);
    const all = (await Clips.all()).slice().sort((a, b) => b.at - a.at); // o mais recente primeiro (fixados não furam a fila aqui)
    if (!all.length) return toast('A biblioteca está vazia: copie algo com o laço para colar aqui depois', 2600);
    const r = this.stage.getBoundingClientRect(), X = r.left + p.x, Y = r.top + p.y;
    const anchor = { getBoundingClientRect: () => ({ left: X, right: X, top: Y, bottom: Y, width: 0, height: 0 }) };
    const paste = (c) => { closePop(); this.pasteAt(c.els, p.x, p.y); toast('Colado', 900); };
    const [last, ...rest] = all;
    const big = el('button', { class: 'hp-last', onclick: () => paste(last) }, el('img', { src: last.thumb || '', alt: '' }), el('span', {}, el('b', {}, 'Colar aqui'), el('small', {}, last.label || 'último item')));
    const box = el('div', { class: 'hp-pop' }, el('div', { class: 'hp-h' }, 'Último item da biblioteca'), big);
    if (rest.length) box.append(el('div', { class: 'hp-h' }, 'Recentes'), el('div', { class: 'hp-grid' }, ...rest.slice(0, 8).map((c) => el('button', { class: 'hp-item', title: c.label || '', onclick: () => paste(c) }, el('img', { src: c.thumb || '', alt: '' })))));
    box.append(el('button', { class: 'btn ghost hp-all', onclick: () => { closePop(); UI.openClips(); } }, 'Abrir a biblioteca'));
    openPop(anchor, box);
  },
});

/* ação do toque duplo da caneta (configuração; quem tinha desligado os "três toques" fica com "nada") */
const PEN_DOUBLE_ACTIONS = [['lassoToggle', 'Alternar laço ↔ caneta'], ['hyphen', 'Hífen no quadrado tocado'], ['eraserToggle', 'Alternar caneta ↔ borracha'], ['undo', 'Desfazer'], ['redo', 'Refazer'], ['read', 'Modo leitura liga/desliga'], ['none', 'Nada (desligado)']];
function penDoubleAction() { const S = Store.settings; return S.penDouble || (S.penTriple === false ? 'none' : 'lassoToggle'); }
