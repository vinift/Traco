/* ===== v0.19 — recorte de imagem direto na página =====
   "Recortar imagem" (barra do laço) mostra a imagem inteira, apagadinha, no próprio lugar, com a moldura do recorte e 8 alças.
   Arraste as alças (caneta ou dedo) ou o meio da moldura; tocar na parte apagada desenha uma moldura nova.
   Fora da imagem o dedo continua rolando e dando zoom.
   Aplicar: ✓, Enter ou tocar fora da imagem. Cancelar: ✕, Esc ou desfazer.
   O recorte fica em frações da imagem original (e.crop), então dá para desfazer ou mudar depois sem perder nada. */

const BR_CURVE = 5; /* v1.4.0: curvatura padrão do colchete do toque duplo (% do quadrado; antes 18), a pedido */
/* v1.4.0: ajustes dos atalhos rápidos guardados por grupo/subgrupo de caneta (S.quickByGroup[grupo] = {chave: valor}). Quem está em uso
   fica nas chaves normais de Store.settings; ao trocar de grupo (qkSync) o conjunto atual é guardado e o do grupo novo é carregado.
   Grupo nunca usado começa com os ajustes de agora. A contagem (I, II…, 1, 2…, a, b…) continua por nota. */
const QK_KEYS = ['quickKind', 'quickTab', 'hyphenLen', 'hyphenDrop', 'bulletSize', 'bulletDrop', 'arrowLen', 'arrowDrop', 'boxSize', 'boxDrop', 'romanSize', 'romanDrop', 'romanGap', 'romanSufSize', 'romanStyle', 'romanSuffix', 'numSuffix', 'alphaSuffix', 'seqAlign', 'quickColors', 'quickSufColors', 'quickWidths', 'quickColor', 'quickSufColor', 'quickBrW', 'quickBrC', 'brCurve', 'brTop', 'brLines', 'bracketDrop', 'brTip', 'quickPresets', 'quickPresetsSeeded'];
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
    this.qkSync();
    const r = this.stage.getBoundingClientRect(), w = this.toWorld(pos.x - r.left, pos.y - r.top), pi = this.pageIndexAt(w.x, w.y, true), page = this.note.pages[pi]; if (!page) return false;
    const l = this.local(pi, w.x, w.y), m = 18 / this.cam.z;
    for (let i = page.elements.length - 1; i >= 0; i--) {
      const e = page.elements[i]; if (e.type !== 'shape' || e.kind !== 'path' || e.lock) continue;
      const b = elBBox(e); if (l.x < b.x - m || l.x > b.x + b.w + m || l.y < b.y - m || l.y > b.y + b.h + m) continue;
      const k = bracketBottom(e); if (!k) continue;
      const rg = this.ruledFor(page), step = rg && rg.s > 0 ? 2 * rg.s : Math.max(20, k.len), y2 = k.y + step;
      const n = { id: uid(), type: 'shape', kind: 'path', pts: [k.x, k.y - k.r, k.x, y2, k.x + k.tip, y2].map(r2), rr: [0, r2(k.r), 0], color: (Store.settings.tools.pen || {}).color || e.color, width: e.width, fill: null }; /* v0.47.3: cor da caneta selecionada */
      if (e.dash) n.dash = e.dash; if (e.opacity != null) n.opacity = e.opacity;
      this.recAdd(page, n); this.opCommit(); toast('Colchete continuado', 900); return true;
    }
    /* v0.41.4: toque duplo num HÍFEN → colchete embaixo dele (como na foto do usuário): reta no meio do hífen, começando logo abaixo da
       linha do hífen (topo do quadrado seguinte + 22%), descendo até o CENTRO do quadrado duas linhas abaixo; ponta até o fim do hífen,
       curva de 18% do quadrado. Hífen = traço/linha curto quase horizontal (≤ 1,3 quadrado; altura ≤ max(1,5·espessura, 25% do comprimento)) */
    const rg = this.ruledFor(page);
    /* colchete embaixo de [x1, x2] × [y1, y2] (reta no meio, ponta até x2) */
    const under = (x1, x2, y1, y2, e, kind) => {
      const s = rg && rg.s > 0 ? rg.s : (x2 - x1) * 4, hy = (y1 + y2) / 2, o = rg && rg.s > 0 ? rg.o : hy - s * 0.6, gm = this.bracketGeom(x1, x2, y1, y2, s, o), pen = Store.settings.tools.pen || {}, bs = this.brStyle(kind || 'hyphen');
      const n = { id: uid(), type: 'shape', kind: 'path', pts: gm.pts.map(r2), rr: gm.rr.map(r2), color: bs.c && e.color ? e.color : pen.color || e.color, width: bs.w && e.width ? e.width : pen.width || e.width, fill: null }; /* v0.47.3: cor e espessura da caneta; v0.56: ou as do atalho (por tipo) */
      if (e.dash && e.dash !== 'solid') n.dash = e.dash;
      this.recAdd(page, n); this.opCommit(); toast('Colchete', 800); return true;
    };
    /* v0.47.2: toque duplo em QUALQUER atalho rápido (número, letra, romano, tópico, seta, caixa — marcados com `qg` no quickPlace) →
       colchete embaixo do atalho inteiro (todas as peças do grupo), como no hífen */
    for (let i = page.elements.length - 1; i >= 0; i--) {
      const e = page.elements[i]; if (!e.qg || e.lock) continue;
      const b = elBBox(e); if (l.x < b.x - m || l.x > b.x + b.w + m || l.y < b.y - m || l.y > b.y + b.h + m) continue;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, first = null;
      const near = (rg && rg.s > 0 ? rg.s : 40) * 3; /* cópias coladas longe têm o mesmo qg: só as peças perto da tocada */
      for (const q of page.elements) if (q.qg === e.qg) { const bb = elBBox(q); if (Math.abs(bb.x + bb.w / 2 - (b.x + b.w / 2)) > near || Math.abs(bb.y + bb.h / 2 - (b.y + b.h / 2)) > near) continue; x1 = Math.min(x1, bb.x); y1 = Math.min(y1, bb.y); x2 = Math.max(x2, bb.x + bb.w); y2 = Math.max(y2, bb.y + bb.h); first = first || q; }
      /* v0.47.5: colchete como se fosse um HÍFEN no quadrado do atalho (reta no meio do quadrado, ponta do tamanho do hífen) — antes ia até o
         fim do atalho e, nos romanos/números longos, a ponta ia longe para a direita */
      { const tpl = page.template || this.note.template, cols = tpl && tpl.type !== 'blank' ? this.gridLines(tpl, page, 0) : null, o = this.quickOpt();
        const s = cols && cols.s > 0 ? cols.s : rg && rg.s > 0 ? rg.s : 40, cx = cols && cols.s > 0 ? cols.o + (Math.floor((x1 + Math.min(s * 0.1, (x2 - x1) / 2) - cols.o) / s) + 0.5) * s : (x1 + x2) / 2, h = (s * o.hL) / 2;
        return under(cx - h, cx + h, y1, y2, first, first.qk || 'hyphen'); }
    }
    for (let i = page.elements.length - 1; i >= 0; i--) {
      const e = page.elements[i]; if (e.lock || !(e.type === 'stroke' && e.tool === 'pen') && !(e.type === 'shape' && e.kind === 'line')) continue;
      let x1, x2, y1, y2; if (e.type === 'shape') { x1 = Math.min(e.x1, e.x2); x2 = Math.max(e.x1, e.x2); y1 = Math.min(e.y1, e.y2); y2 = Math.max(e.y1, e.y2); }
      else { x1 = y1 = Infinity; x2 = y2 = -Infinity; for (let k = 0; k < e.pts.length; k += 3) { x1 = Math.min(x1, e.pts[k]); x2 = Math.max(x2, e.pts[k]); y1 = Math.min(y1, e.pts[k + 1]); y2 = Math.max(y2, e.pts[k + 1]); } }
      const L = x2 - x1, H = y2 - y1, s = rg && rg.s > 0 ? rg.s : L * 4; if (L < 2 || L > s * 1.3 || H > Math.max((e.width || 1) * 1.5, L * 0.25)) continue;
      if (l.x < x1 - m || l.x > x2 + m || l.y < y1 - m || l.y > y2 + m) continue;
      return under(x1, x2, y1, y2, e, 'hyphen'); /* v0.41.4–6: hífen comum (desenhado à mão) */
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
      rH: pc(S.romanSize, 50, 0.15, 0.95), rD: pc(S.romanDrop, hd, -0.45, 0.45), rSuf: S.romanSuffix ?? '.', rSS: pc(S.romanSufSize, 100, 0.1, 2.5), rGap: pc(S.romanGap, 30, 0.05, 0.8), rSty: S.romanStyle || 'serif',
      aL: pc(S.arrowLen, 70, 0.2, 1.6), aD: pc(S.arrowDrop, hd, -0.45, 0.45), xS: pc(S.boxSize, 55, 0.15, 0.95), xD: pc(S.boxDrop, hd, -0.45, 0.45) };
  },
  /* v0.53: cor salva POR TIPO de atalho (S.quickColors / S.quickSufColors = {tipo: cor|null}); tipo sem entrada usa a cor geral antiga (S.quickColor / S.quickSufColor) */
  qkColor(kind, suf) { const S = Store.settings, m = S[suf ? 'quickSufColors' : 'quickColors'] || {}; return (kind in m ? m[kind] : S[suf ? 'quickSufColor' : 'quickColor']) || null; },
  setQkColor(kind, c, suf) { const S = Store.settings, key = suf ? 'quickSufColors' : 'quickColors'; S[key] = { ...(S[key] || {}), [kind]: c || null }; Store.saveSettings(); },
  /* v0.56: colchete do toque duplo — ajustes globais (padrões = forma da v0.41.4–v0.47.5): curvatura brCurve (% do quadrado, 18), início
     brTop (% abaixo da linha seguinte, 22), comprimento brLines (linhas para baixo, 2 → centro do quadrado 2 linhas abaixo), fim abaixo do
     centro bracketDrop (%, = hyphenDrop ou 10), ponta brTip (% do meio-hífen, 100) */
  brOpt() { const S = Store.settings, pc = (v, d, a, b) => clamp((v ?? d) / 100, a, b); return { curve: pc(S.brCurve, BR_CURVE, 0, 0.6), top: pc(S.brTop, 22, 0, 0.9), lines: clamp(Math.round(+(S.brLines ?? 2)), 1, 8), drop: pc(S.bracketDrop, S.hyphenDrop ?? 10, -0.45, 0.45), tip: pc(S.brTip, 100, 0.2, 4) }; },
  bracketGeom(x1, x2, y1, y2, s, o) {
    const B = this.brOpt(), hy = (y1 + y2) / 2, cx = (x1 + x2) / 2, k = Math.floor((hy - o) / s);
    const top = Math.max(o + (k + 1) * s + s * B.top, y2 + s * 0.12), end = Math.max(o + (k + 0.5 + B.lines) * s + s * B.drop, top + s * 0.6), tip = (x2 - cx) * B.tip, r = Math.min(s * B.curve, tip * 0.9);
    return { pts: [cx, top, cx, end, cx + tip, end], rr: [0, r, 0] };
  },
  /* espessura/cor do colchete por tipo de atalho: S.quickBrW / S.quickBrC = {tipo: 'atalho'} (sem entrada = da caneta) */
  brStyle(kind) { const S = Store.settings; return { w: (S.quickBrW || {})[kind] === 'atalho', c: (S.quickBrC || {})[kind] === 'atalho' }; },
  setBrStyle(kind, which, v) { const S = Store.settings, key = which === 'w' ? 'quickBrW' : 'quickBrC'; S[key] = { ...(S[key] || {}), [kind]: v ? 'atalho' : null }; Store.saveSettings(); },
  /* v0.55: espessura salva POR TIPO de atalho (S.quickWidths = {tipo: px|null}; null/sem entrada = espessura da caneta) */
  qkWidth(kind) { const m = Store.settings.quickWidths || {}; return +m[kind] > 0 ? +m[kind] : null; },
  setQkWidth(kind, w) { const S = Store.settings; S.quickWidths = { ...(S.quickWidths || {}), [kind]: w || null }; Store.saveSettings(); },
  quickEls(kind, c, n) {
    const o = this.quickOpt(), st = { ...Store.settings.tools.pen }, els = [], s = c.s || 40;
    const qc0 = this.qkColor(kind); if (qc0) st.color = qc0; const qw0 = this.qkWidth(kind); if (qw0) st.width = qw0; /* v0.55: espessura por tipo (null = a da caneta) */ /* v0.47: cor só do atalho (null = cor da caneta); v0.53: uma por tipo */
    const lw = st.width || 2, sc = this.qkColor(kind, true) || st.color; /* v0.47.1: cor só do sinal (ponto/hífen/parêntese) */
    if (kind === 'arrow') { /* v0.47: seta → centralizada no quadrado */
      const len = s * o.aL, cy = c.rows ? c.cy + s * o.aD : c.cy;
      return [{ id: uid(), type: 'shape', kind: 'arrow', x1: r2(c.cx - len / 2), y1: r2(cy), x2: r2(c.cx + len / 2), y2: r2(cy), color: st.color, width: lw, fill: null }];
    }
    if (kind === 'box') { /* v0.47: caixinha de marcar */
      const d = s * o.xS, cy = c.rows ? c.cy + s * o.xD : c.cy;
      return [{ id: uid(), type: 'shape', kind: 'rect', x1: r2(c.cx - d / 2), y1: r2(cy - d / 2), x2: r2(c.cx + d / 2), y2: r2(cy + d / 2), color: st.color, width: lw, fill: null }];
    }
    if (kind === 'num' || kind === 'alpha') return this.seqEls(kind, c, n, st, o, sc);
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
    const H = s * o.rH, gap = o.rGap, txt = this.romanStr(n || 1), suf = this.seqSuffix('roman'), k = o.rSS;
    const gl = [...txt].map((ch) => this.romanGlyph(ch)); let W = gl.reduce((a, g) => a + g.w, 0) + gap * (gl.length - 1);
    const sufW = suf === '.' ? 0.22 * k : suf === '-' ? 0.55 * k : suf === ')' ? 0.32 * k : 0, sGap = 0.3; if (suf) W += sGap + sufW;
    const cy = (c.rows ? c.cy + s * o.rD : c.cy), left = c.left != null ? c.left : c.cx - s / 2;
    const Wpx = W * H, x0 = Wpx <= s * 0.92 && Store.settings.seqAlign !== 'left' ? c.cx - Wpx / 2 : left + s * 0.04 /* v0.47.4: S.seqAlign 'left' = sempre a partir da borda esquerda do quadrado */, top = cy - H / 2, X = (u) => r2(x0 + u * H), Y = (v) => r2(top + v * H);
    const line = (a, b, cc, d) => els.push({ id: uid(), type: 'shape', kind: 'line', x1: X(a), y1: Y(b), x2: X(cc), y2: Y(d), color: st.color, width: lw, fill: null });
    let u = 0;
    /* v0.46: estilo — 'serif' (serifa em cada letra), 'bar' (uma barra só em cima e embaixo do número inteiro), 'sans' (sem serifa) */
    gl.forEach((g, i) => { const m = u + g.w / 2; for (const [a, b, cc, d, isS] of g.L) if (!isS || o.rSty === 'serif') line(m + a, b, m + cc, d); u += g.w + (i < gl.length - 1 ? gap : 0); });
    if (o.rSty === 'bar') { const pad = 0.04; line(-pad, 0, u + pad, 0); line(-pad, 1, u + pad, 1); }
    if (suf) {
      u += sGap;
      if (suf === '.') { /* v0.47.4: sem piso pela espessura da caneta — o contorno acompanha o raio, senão o ponto não diminuía */ const D = Math.max(0.5, (2 * Math.max(lw * 0.75, H * 0.06) + lw) * k), R = D / 2, ow = Math.min(lw, D * 0.4), dx = X(u + sufW / 2), dy = Y(1) - R; /* D = diâmetro visível; em 100% igual ao de antes */ els.push({ id: uid(), type: 'shape', kind: 'ellipse', x1: r2(dx - R + ow / 2), y1: r2(dy - R + ow / 2), x2: r2(dx + R - ow / 2), y2: r2(dy + R - ow / 2), color: sc, width: r2(ow), fill: sc }); }
      else if (suf === '-') { line(u, 0.55, u + sufW, 0.55); els[els.length - 1].color = sc; }
      else if (suf === ')') { const hh = 0.5 * Math.min(1.25, 0.75 + 0.25 * k); els.push({ id: uid(), type: 'shape', kind: 'path', pts: [X(u), Y(0.5 - hh), X(u + sufW * 0.8), Y(0.5), X(u), Y(0.5 + hh)], rr: [0, r2(H * 0.9 * k), 0], color: sc, width: lw, fill: null }); }
    }
    return els;
  },
  qkSync() {
    try {
      const S = Store.settings, g = Store.activeGroup(this.note), gid = g && g.id; if (!gid) return;
      const cur = S.quickGroupCur; if (cur === gid) return;
      const by = S.quickByGroup || (S.quickByGroup = {}), snap = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
      if (cur) { const o = {}; for (const k of QK_KEYS) if (S[k] !== undefined) o[k] = snap(S[k]); by[cur] = o; }
      const nw = by[gid];
      if (nw) for (const k of QK_KEYS) { if (nw[k] === undefined) delete S[k]; else S[k] = snap(nw[k]); }
      S.quickGroupCur = gid; Store.saveSettings();
    } catch (e) { console.warn('atalhos por grupo', e); }
  },
  quickPlace(kind, p) {
    this.qkSync();
    const c = this.quickCell(p); if (!c) return false; const seq = !!this.SEQ[kind], els = this.quickEls(kind, c, seq ? this.seqNext(kind) : 0);
    const g = uid(); for (const e of els) { e.qg = g; e.qk = kind; this.recAdd(c.page, e); } this.opCommit(); if (seq) this.setSeqNext(kind, this.seqNext(kind) + 1); return true;
  },
  /* v0.41 hífen rápido / v0.44 tópico rápido (chamados também pelo toque duplo) */
  placeHyphen(p) { return this.quickPlace('hyphen', p); },
  placeBullet(p) { return this.quickPlace('bullet', p); },
  placeRoman(p) { return this.quickPlace('roman', p); },
  /* ===== v0.45: número romano (traços com serifa) — contagem por nota em note.romanN (1–89: I V X L) ===== */
  romanStr(n) { const T = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, c] of T) while (n >= v) { s += c; n -= v; } return s; },
  romanNext() { return this.seqNext('roman'); },
  setRomanNext(n) { this.setSeqNext('roman', n); },
  /* v0.47: contagens por nota — romano (note.romanN, até 89), números (note.numN, até 999), letras (note.alphaN, a–z) */
  SEQ: { roman: ['romanN', 89, 'romanSuffix', '.'], num: ['numN', 999, 'numSuffix', '.'], alpha: ['alphaN', 26, 'alphaSuffix', ')'] },
  seqNext(k) { const q = this.SEQ[k]; return clamp(Math.round((this.note && this.note[q[0]]) || 1), 1, q[1]); },
  setSeqNext(k, n) { if (!this.note) return; const q = this.SEQ[k]; this.note[q[0]] = clamp(Math.round(n), 1, q[1]); this.markChanged(); },
  seqStr(k, n) { return k === 'roman' ? this.romanStr(n) : k === 'alpha' ? String.fromCharCode(96 + clamp(n, 1, 26)) : String(n); },
  seqSuffix(k) { const q = this.SEQ[k]; const v = Store.settings[q[2]]; return v == null ? q[3] : v; },
  /* v0.47: algarismos e letras minúsculas em traços (polilinhas em unidades da altura H: y 0 = topo, 1 = base, até 1,32 nas pernas) */
  strokeGlyph(ch) {
    const A = (cx, cy, rx, ry, a0, a1) => { const out = [], n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 9)); for (let i = 0; i <= n; i++) { const a = ((a0 + (a1 - a0) * i / n) * Math.PI) / 180; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return out; };
    const C = (cx, cy, rx, ry, a = 0) => A(cx, cy, rx, ry, a, a + 360), ox = 0.24, oy = 0.71, orx = 0.23, ory = 0.29; /* bojo das minúsculas */
    const G = {
      0: [C(0.3, 0.5, 0.27, 0.5, 270)], 1: [[[0.12, 0.2], [0.36, 0], [0.36, 1]]], 2: [[...A(0.3, 0.28, 0.27, 0.28, 200, 380), [0.03, 1], [0.6, 1]]],
      3: [[...A(0.3, 0.25, 0.24, 0.25, 200, 450), ...A(0.3, 0.75, 0.27, 0.25, 270, 520)]], 4: [[[0.46, 1], [0.46, 0], [0, 0.68], [0.62, 0.68]]],
      5: [[[0.55, 0], [0.12, 0], [0.08, 0.46], ...A(0.3, 0.68, 0.28, 0.32, 220, 500)]], 6: [[...A(0.33, 0.5, 0.3, 0.5, 300, 180), ...A(0.31, 0.7, 0.28, 0.3, 180, 540)]],
      7: [[[0.02, 0], [0.6, 0], [0.22, 1]]], 8: [[...A(0.3, 0.25, 0.23, 0.25, 90, 450), ...A(0.3, 0.74, 0.28, 0.26, 270, 630)]], 9: [[...A(0.3, 0.3, 0.28, 0.3, 0, 360), [0.52, 1]]],
      a: [C(ox, oy, orx, ory), [[0.47, 0.42], [0.47, 1]]], b: [[[0.02, 0], [0.02, 1]], C(0.26, oy, orx, ory, 180)], c: [A(0.27, oy, 0.25, ory, 320, 40)],
      d: [C(ox, oy, orx, ory), [[0.47, 0], [0.47, 1]]], e: [[[0.03, oy], [0.5, oy], ...A(0.27, oy, 0.24, ory, 360, 40)]],
      f: [[...A(0.33, 0.17, 0.14, 0.17, 330, 180), [0.19, 1]], [[0.02, 0.44], [0.38, 0.44]]], g: [C(ox, oy, orx, ory), [[0.47, 0.42], ...A(0.25, 1.08, 0.22, 0.24, 0, 160)]],
      h: [[[0.03, 0], [0.03, 1]], [[0.03, 0.66], ...A(0.25, 0.64, 0.22, 0.2, 180, 360), [0.47, 1]]], i: [[[0.1, 0.42], [0.1, 1]], [[0.1, 0.22], [0.1, 0.235]]],
      j: [[[0.3, 0.42], ...A(0.14, 1.1, 0.16, 0.2, 0, 160)], [[0.3, 0.22], [0.3, 0.235]]], k: [[[0.03, 0], [0.03, 1]], [[0.42, 0.44], [0.03, 0.76]], [[0.16, 0.66], [0.45, 1]]],
      l: [[[0.1, 0], [0.1, 1]]], m: [[[0.03, 0.42], [0.03, 1]], [[0.03, 0.62], ...A(0.19, 0.62, 0.16, 0.18, 180, 360), [0.35, 1]], [[0.35, 0.62], ...A(0.51, 0.62, 0.16, 0.18, 180, 360), [0.67, 1]]],
      n: [[[0.03, 0.42], [0.03, 1]], [[0.03, 0.66], ...A(0.25, 0.64, 0.22, 0.2, 180, 360), [0.47, 1]]], o: [C(0.26, oy, 0.25, ory)],
      p: [[[0.03, 0.42], [0.03, 1.32]], C(0.27, oy, orx, ory, 180)], q: [C(ox, oy, orx, ory), [[0.47, 0.42], [0.47, 1.32]]],
      r: [[[0.03, 0.42], [0.03, 1]], [[0.03, 0.66], ...A(0.24, 0.64, 0.21, 0.2, 180, 300)]], s: [[...A(0.24, 0.57, 0.2, 0.15, 330, 90), ...A(0.24, 0.86, 0.22, 0.14, 270, 520)]],
      t: [[[0.15, 0.14], ...A(0.28, 0.9, 0.13, 0.1, 180, 60)], [[0.0, 0.44], [0.36, 0.44]]], u: [[[0.03, 0.42], ...A(0.24, 0.78, 0.21, 0.22, 180, 0)], [[0.45, 0.42], [0.45, 1]]],
      v: [[[0, 0.42], [0.24, 1], [0.48, 0.42]]], w: [[[0, 0.42], [0.16, 1], [0.32, 0.5], [0.48, 1], [0.64, 0.42]]], x: [[[0, 0.42], [0.46, 1]], [[0.46, 0.42], [0, 1]]],
      y: [[[0, 0.42], [0.24, 0.98]], [[0.48, 0.42], [0.14, 1.32]]], z: [[[0, 0.42], [0.46, 0.42], [0, 1], [0.46, 1]]],
    };
    const P = G[ch] || [[[0, 0.5], [0.4, 0.5]]]; let x0 = Infinity, x1 = -Infinity; for (const L of P) for (const [x] of L) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    return { P: P.map((L) => L.map(([x, y]) => [x - x0, y])), w: x1 - x0 };
  },
  /* v0.47: números e letras em sequência — mesmo posicionamento do romano (centralizado; largo → começa na borda e cresce p/ direita) */
  seqEls(kind, c, n, st, o, sc = st.color) {
    const s = c.s || 40, H = s * o.rH, gap = 0.14, txt = this.seqStr(kind, n || 1), suf = this.seqSuffix(kind), k = o.rSS, els = [], lw = st.width || 2;
    const gl = [...txt].map((ch) => this.strokeGlyph(ch)); let W = gl.reduce((a, g) => a + g.w, 0) + gap * (gl.length - 1);
    const sufW = suf === '.' ? 0.22 * k : suf === '-' ? 0.55 * k : suf === ')' ? 0.3 * k : 0, sGap = suf === ')' ? 0.16 : 0.22; if (suf) W += sGap + sufW;
    const cy = c.rows ? c.cy + s * o.rD : c.cy, left = c.left != null ? c.left : c.cx - s / 2;
    const Wpx = W * H, x0 = Wpx <= s * 0.92 && Store.settings.seqAlign !== 'left' ? c.cx - Wpx / 2 : left + s * 0.04 /* v0.47.4: S.seqAlign 'left' = sempre a partir da borda esquerda do quadrado */, top = cy - H / 2, X = (u) => r2(x0 + u * H), Y = (v) => r2(top + v * H);
    const stroke = (pts) => { const e = { id: uid(), type: 'stroke', tool: 'pen', color: st.color, width: lw, pen: st.type === 'calli' ? 'ball' : st.type || 'ball', pts: [] }; for (const [x, y] of pts) e.pts.push(X(x), Y(y), 0.5); els.push(e); };
    let u = 0;
    gl.forEach((g, i) => { for (const L of g.P) stroke(L.map(([x, y]) => [u + x, y])); u += g.w + (i < gl.length - 1 ? gap : 0); });
    if (suf) {
      u += sGap;
      if (suf === '.') { /* v0.47.4: sem piso pela espessura da caneta — o contorno acompanha o raio, senão o ponto não diminuía */ const D = Math.max(0.5, (2 * Math.max(lw * 0.75, H * 0.06) + lw) * k), R = D / 2, ow = Math.min(lw, D * 0.4), dx = X(u + sufW / 2), dy = Y(1) - R; /* D = diâmetro visível; em 100% igual ao de antes */ els.push({ id: uid(), type: 'shape', kind: 'ellipse', x1: r2(dx - R + ow / 2), y1: r2(dy - R + ow / 2), x2: r2(dx + R - ow / 2), y2: r2(dy + R - ow / 2), color: sc, width: r2(ow), fill: sc }); }
      else if (suf === '-') { stroke([[u, 0.62], [u + sufW, 0.62]]); els[els.length - 1].color = sc; }
      else if (suf === ')') { const hh = 0.52 * Math.min(1.25, 0.8 + 0.2 * k); stroke(Array.from({ length: 15 }, (_, i) => { const a = -Math.PI / 2 + (Math.PI * i) / 14; return [u + sufW * 0.75 * Math.cos(a), 0.52 + hh * Math.sin(a)]; })); els[els.length - 1].color = sc; }
    }
    return els;
  },
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
    this.qkSync(); this.closeQuick(); const S = Store.settings, box = el('div', { class: 'qk-panel' });
    const pv = el('canvas', { class: 'qk-prev' }), PW = 220, dpr = Math.min(3, devicePixelRatio || 1);
    const preview = () => {
      const br = S.quickTab === 'br', PH = br ? 64 + 44 * Math.min(4, this.brOpt().lines + 0.6) : 64; /* v0.56: com a seção do colchete aberta, mostra o colchete embaixo */
      if (pv.height !== Math.round(PH * dpr)) { pv.width = PW * dpr; pv.height = Math.round(PH * dpr); pv.style.width = PW + 'px'; pv.style.height = PH + 'px'; }
      const ctx = pv.getContext('2d'), k = S.quickKind || 'hyphen', sq = 44; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, PW, PH);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH); ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1; const x0 = 18, y0 = 10;
      for (let x = x0 - sq; x < PW; x += sq) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, PH); ctx.stroke(); }
      for (let y = y0; y < PH; y += sq) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(PW, y + 0.5); ctx.stroke(); }
      ctx.fillStyle = 'rgba(124,58,237,.08)'; ctx.fillRect(x0, y0, sq, sq);
      const c = { s: sq, cx: x0 + sq / 2, cy: y0 + sq / 2, left: x0, rows: true, cols: true }, k2 = sq / 40;
      const n = this.SEQ[k] ? this.seqNext(k) : 0, els = this.quickEls(k, c, n); let y1 = Infinity, y2 = -Infinity;
      for (const e of els) { const bb = elBBox(e); y1 = Math.min(y1, bb.y); y2 = Math.max(y2, bb.y + bb.h); }
      if (br && els.length) { const h = (sq * this.quickOpt().hL) / 2, gm = this.bracketGeom(c.cx - h, c.cx + h, y1, y2, sq, y0), bs = this.brStyle(k), pen = S.tools.pen || {}, e0 = els[0];
        drawElement(ctx, { type: 'shape', kind: 'path', pts: gm.pts, rr: gm.rr, color: bs.c ? e0.color : pen.color || '#111827', width: Math.max(1, (bs.w ? e0.width : pen.width || 2) * k2), fill: null }); }
      for (const e of els) { e.width = Math.max(1, e.width * k2); drawElement(ctx, e); }
    };
    const pct = (v) => (v === 0 ? 'no centro' : v < 0 ? Math.abs(v) + '% p/ cima' : v + '% p/ baixo');
    /* v0.47.6: ajuste fino — linha com − / número (digitável) / + de 1 em 1 (segurar repete) e texto explicando; as chaves usadas
       ficam em `qkKeys` para as predefinições */
    let qkKeys = [];
    const sl = (label, key, min, max, def, fmt) => {
      qkKeys.push([key, def]);
      const cur = () => S[key] ?? def, desc = el('small', { class: 'qk-desc' }, fmt(cur()));
      const inp = el('input', { type: 'number', class: 'qk-val', min, max, step: 1, value: cur(), inputmode: 'numeric' });
      const set = (v) => { v = clamp(Math.round(+v || 0), min, max); S[key] = v; Store.saveSettings(); inp.value = v; desc.textContent = fmt(v); preview(); };
      inp.addEventListener('change', () => set(inp.value));
      const stepBtn = (d, t) => { const b = el('button', { class: 'qk-step', title: d < 0 ? 'Diminuir' : 'Aumentar' }, t); let to = 0, iv = 0; const stop = () => { clearTimeout(to); clearInterval(iv); };
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); set(cur() + d); to = setTimeout(() => { iv = setInterval(() => set(cur() + d), 70); }, 420); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop); return b; };
      return el('div', { class: 'qk-field' }, el('span', { class: 'qk-flab' }, label), stepBtn(-1, '−'), inp, stepBtn(1, '+'), desc);
    };
    /* predefinições: Pequeno/Médio/Grande (só o tamanho principal), Padrão (apaga os ajustes do atalho) e as do usuário (S.quickPresets[tipo]) */
    const QP = { hyphen: ['hyphenLen', 18, 25, 40], bullet: ['bulletSize', 20, 30, 45], arrow: ['arrowLen', 50, 70, 100], box: ['boxSize', 40, 55, 75], roman: ['romanSize', 35, 50, 70], num: ['romanSize', 35, 50, 70], alpha: ['romanSize', 35, 50, 70] };
    /* v1.2.0: lista de predefinições editável — tocar aplica; ✎ liga a edição com ‹ › (mover) e ✕ (apagar). P/M/G viraram itens comuns
       da lista (semeados uma vez em S.quickPresets[tipo]); o colchete usa S.quickPresets.br. "Padrão" e "+ Salvar" ficam fixos. */
    const presetList = (id, list0, keys, redraw, label, fixed, seed) => {
      const P = (S.quickPresets = S.quickPresets || {}), seeded = (S.quickPresetsSeeded = S.quickPresetsSeeded || {});
      if (seed && !seeded[id]) { P[id] = [...seed, ...(P[id] || [])]; seeded[id] = true; Store.saveSettings(); }
      const my = P[id] || [], ed = (this._qkEd = this._qkEd || {}), editing = !!ed[id];
      const chip = (lb, on, fn, title) => el('button', { class: 'qk-chip qk-pre' + (on ? ' on' : ''), title, onclick: fn }, lb);
      const cur = (kk, d) => S[kk] ?? d, defs = Object.fromEntries(keys);
      const isOn = (v) => Object.entries(v).every(([kk, val]) => cur(kk, defs[kk]) === val);
      const apply = (v) => { for (const [kk, val] of Object.entries(v)) S[kk] = val; Store.saveSettings(); redraw(); };
      const save = (L) => { P[id] = L; Store.saveSettings(); redraw(); };
      const out = [...fixed(chip)];
      my.forEach((pr, i) => {
        if (!editing) return out.push(chip(pr.name, isOn(pr.v), () => apply(pr.v), 'Aplicar'));
        const mv = (d) => { const L = my.slice(), j = i + d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; save(L); };
        out.push(el('span', { class: 'qk-mine editing' }, el('button', { class: 'qk-mv', title: 'Mover para a esquerda', disabled: i === 0, onclick: () => mv(-1) }, '‹'), el('b', {}, pr.name),
          el('button', { class: 'qk-mv', title: 'Mover para a direita', disabled: i === my.length - 1, onclick: () => mv(1) }, '›'),
          el('button', { class: 'qk-del', title: 'Apagar predefinição', onclick: () => save(my.filter((x) => x !== pr)) }, '✕')));
      });
      if (!editing) out.push(chip('+ Salvar', false, async () => { const name = await askText('Nome da predefinição', ''); if (!name) return; const v = {}; for (const [kk, d] of keys) v[kk] = cur(kk, d); save([...my, { name: name.slice(0, 18), v }].slice(-12)); }, 'Guardar os ajustes atuais com um nome'));
      if (my.length) out.push(chip(editing ? '✓ Pronto' : '✎', editing, () => { ed[id] = !editing; redraw(); }, editing ? 'Terminar de editar' : 'Mover ou apagar predefinições'));
      return el('div', { class: 'qk-row qk-presets' }, el('span', {}, label), ...out);
    };
    const presetsRow = (k, redraw) => {
      const q = QP[k], keys = qkKeys.slice();
      return presetList(k, null, keys, redraw, 'Tamanhos', (chip) => [chip('Padrão', false, () => { for (const [kk] of keys) delete S[kk]; Store.saveSettings(); redraw(); }, 'Volta todos os ajustes deste atalho ao padrão')],
        [{ name: 'P', v: { [q[0]]: q[1] } }, { name: 'M', v: { [q[0]]: q[2] } }, { name: 'G', v: { [q[0]]: q[3] } }]);
    };
    /* v1.4.0: telinha em abas (pedido: estava confusa). Em cima, sempre: tipo, prévia, próximo número e Fixar; embaixo, uma aba por vez
       (S.quickTab): Tamanho (predefinições + medidas), Cor e traço, Número e sinal (só tipos com contagem) e Colchete. Nada saiu. */
    const draw = () => {
      const k = S.quickKind || 'hyphen', chip = (label, on, fn, title) => el('button', { class: 'qk-chip' + (on ? ' on' : ''), title, onclick: fn }, label);
      const KINDS = [['hyphen', '— Hífen'], ['bullet', '○ Tópico'], ['roman', 'IV Romano'], ['num', '1. Número'], ['alpha', 'a) Letra'], ['arrow', '→ Seta'], ['box', '☐ Caixa']];
      const kinds = el('div', { class: 'qk-kinds' }, ...KINDS.map(([v, lb]) => chip(lb, k === v, () => { S.quickKind = v; Store.saveSettings(); draw(); })));
      const pin = !!this._qkPin, seq = !!this.SEQ[k];
      const pinBtn = el('button', { class: 'qk-pin' + (pin ? ' on' : ''), title: 'Fixar: colocar vários seguidos sem fechar a telinha', onclick: () => { this._qkPin = !pin; draw(); } }, pin ? '📌 Fixada' : '📌 Fixar');
      const grp = typeof UI !== 'undefined' && UI.group ? UI.group() : null;
      const kids = [el('div', { class: 'qk-head' }, el('b', {}, 'Atalho rápido'), grp ? el('small', { class: 'qk-grp', title: 'Os ajustes dos atalhos são guardados por grupo de caneta' }, grp.name) : null, pinBtn, el('button', { class: 'qk-x', title: 'Fechar', onclick: () => this.closeQuick() }, '✕')), kinds, pv];
      if (seq) { const n = this.seqNext(k), max = this.SEQ[k][1];
        kids.push(el('div', { class: 'qk-row qk-num' }, el('span', {}, 'Próximo'), chip('−', false, () => { this.setSeqNext(k, n - 1); draw(); }), el('b', { class: 'qk-rn' }, this.seqStr(k, n) + this.seqSuffix(k)), chip('+', false, () => { this.setSeqNext(k, Math.min(max, n + 1)); draw(); }), chip('Recomeçar', false, () => { this.setSeqNext(k, 1); draw(); }, 'Volta para o primeiro'))); }
      const TABS = [['size', 'Tamanho'], ['look', 'Cor'], ...(seq ? [['sign', 'Sinal']] : []), ['br', 'Colchete']];
      let tab = S.quickTab; if (!TABS.some(([v]) => v === tab)) tab = 'size';
      const tabs = el('div', { class: 'qk-tabs' }, ...TABS.map(([v, lb]) => el('button', { class: 'qk-tab' + (tab === v ? ' on' : ''), onclick: () => { S.quickTab = v; Store.saveSettings(); draw(); } }, lb)));
      const body = el('div', { class: 'qk-adj qk-tabbody' }), info = (t) => el('p', { class: 'qk-info' }, t); qkKeys = [];
      const colorRow = (label, cur, setFn, noneLabel, noneTitle) => el('div', { class: 'qk-row qk-cols' }, el('span', {}, label), chip(noneLabel, !cur, () => { setFn(null); draw(); }, noneTitle),
        ...(UI.groupColors ? UI.groupColors() : []).slice(0, 9).map((cc) => el('button', { class: 'qk-dot' + (cur && cur.toLowerCase() === cc.toLowerCase() ? ' on' : ''), title: cc, style: { background: cc }, onclick: () => { setFn(cc); draw(); } })));
      if (tab === 'size') {
        body.append(info(seq ? 'Altura das letras, posição no quadrado e espaço entre elas. As predefinições guardam também o tamanho do sinal.' : 'Tamanho do atalho e altura dentro do quadrado da pauta.'));
        if (k === 'hyphen') body.append(sl('Comprimento', 'hyphenLen', 5, 90, 25, (v) => v + '%'), sl('Altura', 'hyphenDrop', -40, 40, 10, pct));
        else if (k === 'bullet') body.append(sl('Tamanho', 'bulletSize', 5, 90, 30, (v) => v + '%'), sl('Altura', 'bulletDrop', -40, 40, S.hyphenDrop ?? 10, pct));
        else if (k === 'arrow') body.append(sl('Comprimento', 'arrowLen', 20, 160, 70, (v) => v + '%'), sl('Altura', 'arrowDrop', -40, 40, S.hyphenDrop ?? 10, pct));
        else if (k === 'box') body.append(sl('Tamanho', 'boxSize', 15, 95, 55, (v) => v + '%'), sl('Altura', 'boxDrop', -40, 40, S.hyphenDrop ?? 10, pct));
        if (seq) { body.append(sl('Tamanho', 'romanSize', 15, 95, 50, (v) => v + '%'), sl('Altura', 'romanDrop', -40, 40, S.hyphenDrop ?? 10, pct)); if (k === 'roman') body.append(sl('Espaço entre letras', 'romanGap', 5, 80, 30, (v) => v + '%')); qkKeys.push(['romanSufSize', 100]); }
        body.insertBefore(presetsRow(k, draw), body.children[1]);
      } else if (tab === 'look') {
        body.append(info('Cor e espessura deste atalho. "caneta" usa o que estiver escolhido na caneta na hora de colocar.'));
        body.append(colorRow('Cor', this.qkColor(k), (c) => this.setQkColor(k, c), 'caneta', 'Usar a cor da caneta'));
        const qw = this.qkWidth(k), ws = [...new Set((UI.widthList ? UI.widthList('pen') : []).map(Number).filter((x) => x > 0))].sort((a, b) => a - b).slice(0, 12);
        if (qw && !ws.some((x) => Math.abs(x - qw) < 0.01)) ws.push(qw);
        body.append(el('div', { class: 'qk-row qk-ws' }, el('span', {}, 'Espessura'), chip('caneta', !qw, () => { this.setQkWidth(k, null); draw(); }, 'Usar a espessura da caneta'),
          ...ws.map((w) => { const b = chip('', !!qw && Math.abs(qw - w) < 0.01, () => { this.setQkWidth(k, w); draw(); }, String(w).replace('.', ',') + ' px'); b.classList.add('qk-w'); b.append(el('i', { style: { height: Math.max(1, Math.min(8, w)) + 'px' } }), el('small', {}, String(Math.round(w * 10) / 10).replace('.', ','))); return b; })));
        if (seq) body.append(colorRow('Cor do sinal', this.qkColor(k, true), (c) => this.setQkColor(k, c, true), 'igual', 'Igual ao número'));
      } else if (tab === 'sign') {
        const suf = this.seqSuffix(k), ex = this.seqStr(k, 1);
        body.append(info('O que vem depois do número ou da letra, e onde ele começa no quadrado.'),
          el('div', { class: 'qk-row' }, el('span', {}, 'Depois'), ...[['', 'nada'], ['.', ex + '.'], ['-', ex + ' -'], [')', ex + ')']].map(([v, lb]) => chip(lb, suf === v, () => { S[this.SEQ[k][2]] = v; Store.saveSettings(); draw(); }))),
          el('div', { class: 'qk-row' }, el('span', {}, 'Posição'), ...[['center', 'Centralizado', 'No meio do quadrado (largo demais → começa na borda e cresce p/ direita)'], ['left', 'À esquerda', 'Começa na borda esquerda do quadrado']].map(([v, lb, t]) => chip(lb, (S.seqAlign || 'center') === v, () => { S.seqAlign = v; Store.saveSettings(); draw(); }, t))));
        if (k === 'roman') body.append(el('div', { class: 'qk-row' }, el('span', {}, 'Estilo'), ...[['serif', 'Serifado', 'Serifa em cada letra'], ['bar', 'Serifa única', 'Uma barra em cima e outra embaixo do número inteiro'], ['sans', 'Sem serifa', 'Só os traços']].map(([v, lb, t]) => chip(lb, (S.romanStyle || 'serif') === v, () => { S.romanStyle = v; Store.saveSettings(); draw(); }, t))));
        body.append(sl('Tamanho do sinal (ponto, hífen, parêntese)', 'romanSufSize', 10, 250, 100, (v) => v + '%'));
      } else {
        const BRK = ['brCurve', 'brTop', 'brLines', 'bracketDrop', 'brTip'], bs = this.brStyle(k);
        body.append(info('Colchete criado com toque duplo da caneta em cima do atalho. A prévia mostra como ele fica.'),
          el('div', { class: 'qk-row' }, el('span', {}, 'Espessura'), chip('caneta', !bs.w, () => { this.setBrStyle(k, 'w', false); draw(); }, 'Espessura selecionada na caneta'), chip('do atalho', bs.w, () => { this.setBrStyle(k, 'w', true); draw(); }, 'Mesma espessura do atalho')),
          el('div', { class: 'qk-row' }, el('span', {}, 'Cor'), chip('caneta', !bs.c, () => { this.setBrStyle(k, 'c', false); draw(); }, 'Cor selecionada na caneta'), chip('do atalho', bs.c, () => { this.setBrStyle(k, 'c', true); draw(); }, 'Mesma cor do atalho')),
          presetList('br', null, [['brCurve', BR_CURVE], ['brTop', 22], ['brLines', 2], ['bracketDrop', S.hyphenDrop ?? 10], ['brTip', 100]], draw, 'Forma', (c) => [c('Padrão', BRK.every((x) => S[x] == null), () => { for (const x of BRK) delete S[x]; Store.saveSettings(); draw(); }, 'Volta ao colchete padrão')]),
          sl('Curvatura', 'brCurve', 0, 60, BR_CURVE, (v) => (v === 0 ? 'canto reto' : v + '% do quadrado (até o tamanho da ponta)')),
          sl('Início', 'brTop', 0, 90, 22, (v) => v + '% abaixo da linha'),
          sl('Comprimento', 'brLines', 1, 8, 2, (v) => v + (v === 1 ? ' linha' : ' linhas') + ' para baixo'),
          sl('Fim', 'bracketDrop', -40, 40, S.hyphenDrop ?? 10, pct),
          sl('Ponta', 'brTip', 20, 400, 100, (v) => v + '% (100 = até o fim do hífen)'));
      }
      kids.push(tabs, body, el('small', { class: 'qk-hint' + (pin ? ' pin' : '') }, pin ? 'Fixada: cada toque da caneta coloca um. Toque em ✕ para voltar a escrever.' : 'Toque no quadrado com a caneta'));
      box.innerHTML = ''; box.append(...kids.filter(Boolean)); preview();
    };
    this._qkDraw = draw;
    draw(); $('#editor').append(box); this._qk = box; this._hyArm = { t: performance.now(), panel: true };
  },
  closeQuick() { if (this._qk) { this._qk.remove(); this._qk = null; } this._qkPin = false; if (this._hyArm && this._hyArm.panel) this._hyArm = null; },
  /* v0.47: fixada (_qkPin, botão 📌 — vale só enquanto a telinha está aberta) → continua aberta e armada depois de colocar */
  placeQuick(p) { const k = Store.settings.quickKind || 'hyphen'; if (!this._qkPin) { this.closeQuick(); return this.quickPlace(k, p); } const ok = this.quickPlace(k, p); this._hyArm = { t: performance.now(), panel: true }; if (this._qkDraw) this._qkDraw(); return ok; },
  /* ===== v0.49: seleção rápida de palavras com o dedo (ferramenta caneta) =====
     Palavras = linhas de `OCR.groupLines` (só tinta da caneta, sem itens travados) quebradas onde o vão horizontal passa de
     0,42 × altura típica da letra da linha. `wordsOf(page)` guarda em cache por página (muda quando muda a lista de elementos). */
  wordsOf(page) {
    const els = page.elements, sig = els.length + ':' + (els.length ? els[els.length - 1].id : ''); this._wc = this._wc || new WeakMap();
    const c = this._wc.get(page); if (c && c.sig === sig) return c.words;
    const words = [];
    for (const L of OCR.groupLines(els.filter((e) => e.type === 'stroke' && e.tool === 'pen' && !e.lock))) {
      const hs = L.items.map((o) => o.b.h).filter((h) => h > L.h * 0.3).sort((a, b) => a - b), hm = hs[hs.length >> 1] || L.h, thr = Math.max(hm * 0.42, 2);
      const cs = L.items.filter((o) => o.b.h > L.h * 0.3 && o.b.h <= hm * 1.3).map((o) => o.b.y + o.b.h / 2).sort((a, b) => a - b), cy = cs.length ? cs[cs.length >> 1] : L.y + L.h / 2; /* v1.17: centro do miolo das letras (sem pernas/hastes) — usado pelo marca-texto */
      let cur = null, maxX = -Infinity;
      for (const o of L.items) {
        if (!cur || o.b.x - maxX > thr) { cur = { ids: [], x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity, hm, cy }; words.push(cur); }
        cur.ids.push(o.e.id); cur.x1 = Math.min(cur.x1, o.b.x); cur.y1 = Math.min(cur.y1, o.b.y); cur.x2 = Math.max(cur.x2, o.b.x + o.b.w); cur.y2 = Math.max(cur.y2, o.b.y + o.b.h); maxX = Math.max(maxX, o.b.x + o.b.w);
      }
    }
    this._wc.set(page, { sig, words }); return words;
  },
  wordAt(words, l, pad) { let best = null, bd = Infinity; for (const w of words) { const p = Math.max(pad, w.hm * 0.2); if (l.x < w.x1 - p || l.x > w.x2 + p || l.y < w.y1 - p || l.y > w.y2 + p) continue; const d = Math.hypot(l.x - (w.x1 + w.x2) / 2, l.y - (w.y1 + w.y2) / 2); if (d < bd) { bd = d; best = w; } } return best; },
  wordSelStart(g) {
    const W = this.toWorld(g.p0.x, g.p0.y), pi = this.pageIndexAt(W.x, W.y, true), page = this.note && this.note.pages[pi]; if (!page) return;
    const l = this.local(pi, W.x, W.y), words = this.wordsOf(page), w = this.wordAt(words, l, 6 / this.cam.z); if (!w) return; /* sem palavra embaixo: continua rolando como sempre */
    g.held = true; g.wsel = { pi, page, words, ids: new Set(w.ids), last: l };
    this.sel = { pageId: page.id, ids: g.wsel.ids }; this._wordSel = true;
    if (navigator.vibrate) navigator.vibrate(15); this.requestRender();
  },
  wordSelMove(g, q) {
    const s = g.wsel, W = this.toWorld(q.x, q.y), l = this.local(s.pi, W.x, W.y), a = s.last, d = Math.hypot(l.x - a.x, l.y - a.y), step = 4 / this.cam.z, n = Math.max(1, Math.ceil(d / step)), pad = 3 / this.cam.z;
    let added = false;
    for (let i = 1; i <= n; i++) { const pt = { x: a.x + ((l.x - a.x) * i) / n, y: a.y + ((l.y - a.y) * i) / n }, w = this.wordAt(s.words, pt, pad); if (w && w.ids.some((id) => !s.ids.has(id))) { for (const id of w.ids) s.ids.add(id); added = true; } }
    s.last = l; if (added) { if (navigator.vibrate) navigator.vibrate(6); this.requestRender(); }
  },
  wordSelEnd(g) { if (!g.wsel.ids.size) { this.sel = null; return this.requestRender(); } this.sel = { pageId: g.wsel.page.id, ids: g.wsel.ids }; UI.buildSelBar(); this.requestRender(); },
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
