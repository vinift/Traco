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
    /* v0.41.4: toque duplo num HÍFEN → colchete embaixo dele (como na foto do usuário): reta no meio do hífen, começando logo abaixo da
       linha do hífen (topo do quadrado seguinte + 22%), descendo até o CENTRO do quadrado duas linhas abaixo; ponta até o fim do hífen,
       curva de 18% do quadrado. Hífen = traço/linha curto quase horizontal (≤ 1,3 quadrado; altura ≤ max(1,5·espessura, 25% do comprimento)) */
    const rg = this.ruledFor(page);
    for (let i = page.elements.length - 1; i >= 0; i--) {
      const e = page.elements[i]; if (e.lock || !(e.type === 'stroke' && e.tool === 'pen') && !(e.type === 'shape' && e.kind === 'line')) continue;
      let x1, x2, y1, y2; if (e.type === 'shape') { x1 = Math.min(e.x1, e.x2); x2 = Math.max(e.x1, e.x2); y1 = Math.min(e.y1, e.y2); y2 = Math.max(e.y1, e.y2); }
      else { x1 = y1 = Infinity; x2 = y2 = -Infinity; for (let k = 0; k < e.pts.length; k += 3) { x1 = Math.min(x1, e.pts[k]); x2 = Math.max(x2, e.pts[k]); y1 = Math.min(y1, e.pts[k + 1]); y2 = Math.max(y2, e.pts[k + 1]); } }
      const L = x2 - x1, H = y2 - y1, s = rg && rg.s > 0 ? rg.s : L * 4; if (L < 2 || L > s * 1.3 || H > Math.max((e.width || 1) * 1.5, L * 0.25)) continue;
      if (l.x < x1 - m || l.x > x2 + m || l.y < y1 - m || l.y > y2 + m) continue;
      const hy = (y1 + y2) / 2, cx = (x1 + x2) / 2, o = rg && rg.s > 0 ? rg.o : hy - s * 0.6, k = Math.floor((hy - o) / s);
      const S = Store.settings, kE = clamp((S.bracketDrop ?? S.hyphenDrop ?? 10) / 100, -0.45, 0.45) /* v0.41.6: fim abaixo do centro, como o hífen (configurável) */, top = o + (k + 1) * s + s * 0.22, end = o + (k + 2.5) * s + s * kE, tip = x2 - cx, r = Math.min(s * 0.18, tip * 0.9);
      const n = { id: uid(), type: 'shape', kind: 'path', pts: [cx, top, cx, end, x2, end].map(r2), rr: [0, r2(r), 0], color: e.color, width: (Store.settings.tools.pen || {}).width || e.width, fill: null }; /* v0.41.5: espessura = a selecionada na caneta */
      if (e.dash && e.dash !== 'solid') n.dash = e.dash;
      this.recAdd(page, n); this.opCommit(); toast('Colchete', 800); return true;
    }
    return false;
  },
  /* v0.41: hífen rápido — no centro do quadrado da grade (um pouco abaixo do meio), com a cor/espessura/tipo da caneta atual.
     Pauta (só linhas): no meio da faixa entre as linhas, onde a caneta tocou. Folha lisa: onde tocou, com 14 de comprimento.
     Disparo: botão da caneta com a ação 'hyphen' (arma; o próximo toque da ponta coloca — `_hyArm`, vale 8 s) ou toque duplo ('hyphen') */
  /* v0.46: os atalhos rápidos (hífen, tópico, romano) montam os itens a partir do "quadrado" tocado — `quickCell(p)` — com
     `quickEls(kind, c, n)`, usado tanto para colocar na folha quanto para a prévia da telinha. c = {s (lado do quadrado),
     cx/cy (centro; sem grade: o ponto tocado), left (borda esquerda), rows/cols (tem pauta/grade)}. */
  quickCell(p) {
    const w = this.toWorld(p.x, p.y), pi = this.pageIndexAt(w.x, w.y, true), page = this.note.pages[pi]; if (!page) return null;
    const l = this.local(pi, w.x, w.y), tpl = page.template || this.note.template, has = tpl && tpl.type !== 'blank';
    const rows = has ? this.gridLines(tpl, page, 1) : null, cols = has ? this.gridLines(tpl, page, 0) : null;
    const c = { page, s: 0, cx: l.x, cy: l.y, left: null, rows: !!(rows && rows.s > 0), cols: !!(cols && cols.s > 0) };
    if (c.rows) { const k = Math.floor((l.y - rows.o) / rows.s); c.cy = rows.o + (k + 0.5) * rows.s; c.s = rows.s; }
    if (c.cols) { const k = Math.floor((l.x - cols.o) / cols.s); c.left = cols.o + k * cols.s; c.cx = c.left + cols.s / 2; c.s = cols.s; }
    return c;
  },
  quickOpt() {
    const S = Store.settings, pc = (v, d, a, b) => clamp((v ?? d) / 100, a, b), hd = S.hyphenDrop ?? 10;
    return { hL: pc(S.hyphenLen, 25, 0.05, 0.95), hD: pc(S.hyphenDrop, 10, -0.45, 0.45), bS: pc(S.bulletSize, 30, 0.05, 0.95), bD: pc(S.bulletDrop, hd, -0.45, 0.45),
      rH: pc(S.romanSize, 50, 0.15, 0.95), rD: pc(S.romanDrop, hd, -0.45, 0.45), rSuf: S.romanSuffix ?? '.', rSS: pc(S.romanSufSize, 100, 0.3, 2.5), rGap: pc(S.romanGap, 30, 0.05, 0.8), rSty: S.romanStyle || 'serif' };
  },
  quickEls(kind, c, n) {
    const o = this.quickOpt(), st = Store.settings.tools.pen, lw = st.width || 2, els = [], s = c.s || 40;
    if (kind === 'hyphen') { /* v0.41: traço da caneta; lisa → 56·comprimento no ponto */
      const len = c.s ? c.s * o.hL : 56 * o.hL, cy = c.rows ? c.cy + c.s * o.hD : c.cy, cx = c.cx, h = len / 2;
      const e = { id: uid(), type: 'stroke', tool: 'pen', color: st.color, width: st.width, pen: st.type || 'ball', pts: [r2(cx - h), r2(cy), 0.5, r2(cx), r2(cy), 0.5, r2(cx + h), r2(cy), 0.5] };
      if (st.type === 'calli') e.nib = st.nib ?? 45; if (st.dash && st.dash !== 'solid') e.dash = st.dash; return [e];
    }
    if (kind === 'bullet') { /* v0.44: bolinha vazia */
      const d = c.s ? c.s * o.bS : 14, r = d / 2, cy = c.rows ? c.cy + c.s * o.bD : c.cy, cx = c.cx;
      const e = { id: uid(), type: 'shape', kind: 'ellipse', x1: r2(c.cx - r), y1: r2(cy - r), x2: r2(cx + r), y2: r2(cy + r), color: st.color, width: st.width, fill: null };
      if (st.dash && st.dash !== 'solid') e.dash = st.dash; return [e];
    }
    /* v0.45: número romano com serifas; centralizado no quadrado, mais largo que ele → começa na borda esquerda e cresce para a direita */
    const H = s * o.rH, gap = o.rGap, txt = this.romanStr(n || 1), suf = o.rSuf, k = o.rSS;
    const gl = [...txt].map((ch) => this.romanGlyph(ch)); let W = gl.reduce((a, g) => a + g.w, 0) + gap * (gl.length - 1);
    const sufW = suf === '.' ? 0.22 * k : suf === '-' ? 0.55 * k : suf === ')' ? 0.32 * k : 0, sGap = 0.3; if (suf) W += sGap + sufW;
    const cy = (c.rows ? c.cy + s * o.rD : c.cy), left = c.left != null ? c.left : c.cx - s / 2;
    const Wpx = W * H, x0 = Wpx <= s * 0.92 ? c.cx - Wpx / 2 : left + s * 0.04, top = cy - H / 2, X = (u) => r2(x0 + u * H), Y = (v) => r2(top + v * H);
    const line = (a, b, cc, d) => els.push({ id: uid(), type: 'shape', kind: 'line', x1: X(a), y1: Y(b), x2: X(cc), y2: Y(d), color: st.color, width: lw, fill: null });
    let u = 0;
    /* v0.46: estilo — 'serif' (serifa em cada letra), 'bar' (uma barra só em cima e embaixo do número inteiro), 'sans' (sem serifa) */
    gl.forEach((g, i) => { const m = u + g.w / 2; for (const [a, b, cc, d, isS] of g.L) if (!isS || o.rSty === 'serif') line(m + a, b, m + cc, d); u += g.w + (i < gl.length - 1 ? gap : 0); });
    if (o.rSty === 'bar') { const pad = 0.04; line(-pad, 0, u + pad, 0); line(-pad, 1, u + pad, 1); }
    if (suf) {
      u += sGap;
      if (suf === '.') { const r = Math.max(lw * 0.75, H * 0.06 * k), dx = X(u + sufW / 2), dy = Y(1) - r; els.push({ id: uid(), type: 'shape', kind: 'ellipse', x1: r2(dx - r), y1: r2(dy - r), x2: r2(dx + r), y2: r2(dy + r), color: st.color, width: lw, fill: st.color }); }
      else if (suf === '-') line(u, 0.55, u + sufW, 0.55);
      else if (suf === ')') { const hh = 0.5 * Math.min(1.25, 0.75 + 0.25 * k); els.push({ id: uid(), type: 'shape', kind: 'path', pts: [X(u), Y(0.5 - hh), X(u + sufW * 0.8), Y(0.5), X(u), Y(0.5 + hh)], rr: [0, r2(H * 0.9 * k), 0], color: st.color, width: lw, fill: null }); }
    }
    return els;
  },
  quickPlace(kind, p) {
    const c = this.quickCell(p); if (!c) return false; const els = this.quickEls(kind, c, kind === 'roman' ? this.romanNext() : 0);
    for (const e of els) this.recAdd(c.page, e); this.opCommit(); if (kind === 'roman') this.setRomanNext(this.romanNext() + 1); return true;
  },
  /* v0.41 hífen rápido / v0.44 tópico rápido (chamados também pelo toque duplo) */
  placeHyphen(p) { return this.quickPlace('hyphen', p); },
  placeBullet(p) { return this.quickPlace('bullet', p); },
  placeRoman(p) { return this.quickPlace('roman', p); },
  /* ===== v0.45: número romano (traços com serifa) — contagem por nota em note.romanN (1–89: I V X L) ===== */
  romanStr(n) { const T = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, c] of T) while (n >= v) { s += c; n -= v; } return s; },
  romanNext() { return clamp(Math.round((this.note && this.note.romanN) || 1), 1, 89); },
  setRomanNext(n) { if (!this.note) return; this.note.romanN = clamp(Math.round(n), 1, 89); this.markChanged(); },
  /* linhas de cada letra em unidades da altura H (y 0 = topo, 1 = base); serifa = tracinho horizontal de meia largura `sf` */
  romanGlyph(ch) {
    const sf = 0.17, L = [];
    const serif = (x, y) => L.push([x - sf, y, x + sf, y, 1]); /* 5º valor = é serifa */
    if (ch === 'I') { L.push([0, 0, 0, 1]); serif(0, 0); serif(0, 1); return { L, w: 2 * sf }; }
    if (ch === 'V') { const a = 0.34; L.push([-a, 0, 0, 1], [a, 0, 0, 1]); serif(-a, 0); serif(a, 0); return { L, w: 2 * (a + sf) }; }
    if (ch === 'X') { const a = 0.32; L.push([-a, 0, a, 1], [a, 0, -a, 1]); serif(-a, 0); serif(a, 0); serif(-a, 1); serif(a, 1); return { L, w: 2 * (a + sf) }; }
    if (ch === 'L') { const a = 0.22; L.push([-a, 0, -a, 1], [-a, 1, a + 0.1, 1], [a + 0.1, 1, a + 0.1, 0.82]); serif(-a, 0); return { L, w: 2 * a + sf + 0.12 }; }
    return { L, w: 0.4 };
  },
  /* ===== v0.45/v0.46: telinha do atalho rápido (botão da caneta 'hyphen') — canto inferior direito =====
     Escolhe hífen / tópico / romano (S.quickKind, salvo); prévia ao vivo num pedaço de grade com a caneta atual; ajustes do atalho
     escolhido (os mesmos das Configurações) em "Ajustes" (S.quickAdj aberto/fechado). Enquanto aberta, o próximo toque da ponta
     da caneta na folha coloca o atalho. */
  openQuick() {
    this.closeQuick(); const S = Store.settings, box = el('div', { class: 'qk-panel' });
    const pv = el('canvas', { class: 'qk-prev' }), PW = 220, PH = 64, dpr = Math.min(3, devicePixelRatio || 1); pv.width = PW * dpr; pv.height = PH * dpr; pv.style.width = PW + 'px'; pv.style.height = PH + 'px';
    const preview = () => {
      const ctx = pv.getContext('2d'), k = S.quickKind || 'hyphen', sq = 44; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, PW, PH);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH); ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1; const x0 = 18, y0 = (PH - sq) / 2;
      for (let x = x0 - sq; x < PW; x += sq) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, PH); ctx.stroke(); }
      for (const y of [y0, y0 + sq]) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(PW, y + 0.5); ctx.stroke(); }
      ctx.fillStyle = 'rgba(124,58,237,.08)'; ctx.fillRect(x0, y0, sq, sq);
      const c = { s: sq, cx: x0 + sq / 2, cy: y0 + sq / 2, left: x0, rows: true, cols: true };
      const n = k === 'roman' ? this.romanNext() : 0; for (const e of this.quickEls(k, c, n)) { e.width = Math.max(1, e.width * (sq / 40)); drawElement(ctx, e); }
    };
    const pct = (v) => (v === 0 ? 'no centro' : v < 0 ? Math.abs(v) + '% p/ cima' : v + '% p/ baixo');
    const sl = (label, key, min, max, def, fmt) => UI.slider(label, min, max, 1, S[key] ?? def, (v) => { S[key] = v; Store.saveSettings(); preview(); }, fmt);
    const draw = () => {
      const k = S.quickKind || 'hyphen', chip = (label, on, fn, title) => el('button', { class: 'qk-chip' + (on ? ' on' : ''), title, onclick: fn }, label);
      const kinds = el('div', { class: 'qk-row qk-kinds' }, ...[['hyphen', '— Hífen'], ['bullet', '○ Tópico'], ['roman', 'IV Romano']].map(([v, lb]) => chip(lb, k === v, () => { S.quickKind = v; Store.saveSettings(); draw(); })));
      const adjOpen = !!S.quickAdj;
      const kids = [el('div', { class: 'qk-head' }, el('b', {}, 'Atalho rápido'), el('button', { class: 'qk-x', title: 'Fechar', onclick: () => this.closeQuick() }, '✕')), kinds, pv];
      if (k === 'roman') {
        const n = this.romanNext(), suf = S.romanSuffix ?? '.';
        kids.push(el('div', { class: 'qk-row qk-num' }, el('span', {}, 'Próximo'), chip('−', false, () => { this.setRomanNext(n - 1); draw(); }), el('b', { class: 'qk-rn' }, this.romanStr(n)), chip('+', false, () => { this.setRomanNext(n + 1); draw(); }), chip('Recomeçar', false, () => { this.setRomanNext(1); draw(); }, 'Volta para o I')),
          el('div', { class: 'qk-row' }, el('span', {}, 'Depois'), ...[['', 'nada'], ['.', 'I.'], ['-', 'I -'], [')', 'I)']].map(([v, lb]) => chip(lb, suf === v, () => { S.romanSuffix = v; Store.saveSettings(); draw(); }))),
          el('div', { class: 'qk-row' }, el('span', {}, 'Estilo'), ...[['serif', 'Serifado', 'Serifa em cada letra'], ['bar', 'Serifa única', 'Uma barra em cima e outra embaixo do número inteiro'], ['sans', 'Sem serifa', 'Só os traços']].map(([v, lb, t]) => chip(lb, (S.romanStyle || 'serif') === v, () => { S.romanStyle = v; Store.saveSettings(); draw(); }, t))));
      }
      const adj = el('div', { class: 'qk-adj' });
      if (k === 'hyphen') adj.append(sl('Comprimento', 'hyphenLen', 5, 90, 25, (v) => v + '%'), sl('Altura', 'hyphenDrop', -40, 40, 10, pct), sl('Colchete (toque duplo no hífen)', 'bracketDrop', -40, 40, S.hyphenDrop ?? 10, pct));
      else if (k === 'bullet') adj.append(sl('Tamanho', 'bulletSize', 5, 90, 30, (v) => v + '%'), sl('Altura', 'bulletDrop', -40, 40, S.hyphenDrop ?? 10, pct));
      else adj.append(sl('Tamanho do número', 'romanSize', 15, 95, 50, (v) => v + '%'), sl('Altura', 'romanDrop', -40, 40, S.hyphenDrop ?? 10, pct), sl('Espaço entre letras', 'romanGap', 5, 80, 30, (v) => v + '%'), sl('Tamanho do sinal (ponto, hífen, parêntese)', 'romanSufSize', 30, 250, 100, (v) => v + '%'));
      kids.push(el('button', { class: 'qk-adjbtn' + (adjOpen ? ' open' : ''), onclick: () => { S.quickAdj = !adjOpen; Store.saveSettings(); draw(); } }, el('span', {}, 'Ajustes'), el('b', {}, '▾')), adjOpen ? adj : null,
        el('small', { class: 'qk-hint' }, 'Toque no quadrado com a caneta · cor e espessura da caneta atual'));
      box.innerHTML = ''; box.append(...kids.filter(Boolean)); preview();
    };
    draw(); $('#editor').append(box); this._qk = box; this._hyArm = { t: performance.now(), panel: true };
  },
  closeQuick() { if (this._qk) { this._qk.remove(); this._qk = null; } if (this._hyArm && this._hyArm.panel) this._hyArm = null; },
  placeQuick(p) { const k = Store.settings.quickKind || 'hyphen'; this.closeQuick(); return this.quickPlace(k, p); },
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
    else if (act === 'bullet' && pos) { const r = this.stage.getBoundingClientRect(); this.placeBullet({ x: pos.x - r.left, y: pos.y - r.top }); }
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
const PEN_DOUBLE_ACTIONS = [['lassoToggle', 'Alternar laço ↔ caneta'], ['hyphen', 'Hífen no quadrado tocado'], ['bullet', 'Tópico (bolinha) no quadrado tocado'], ['eraserToggle', 'Alternar caneta ↔ borracha'], ['undo', 'Desfazer'], ['redo', 'Refazer'], ['read', 'Modo leitura liga/desliga'], ['none', 'Nada (desligado)']];
function penDoubleAction() { const S = Store.settings; return S.penDouble || (S.penTriple === false ? 'none' : 'lassoToggle'); }
