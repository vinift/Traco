'use strict';
/* ===== v1.6: IA integrada (Gemini por padrão; também Claude, OpenAI e serviços compatíveis com OpenAI) =====
   • A chave de API é do usuário e fica só no aparelho (Store.settings.ai.keys — não vai para o Drive, para a cópia local nem para
     o relatório de problema). As chamadas saem direto do app para o provedor.
   • Leitura da escrita (AI.readPage): as linhas de escrita da página (OCR.groupLines) são desenhadas uma embaixo da outra numa
     imagem, cada uma com o seu número; a IA devolve o texto por número. Assim cada texto continua com a posição da linha
     (page.ocr.lines igual ao OCR antigo) e a busca/sumário funcionam do mesmo jeito. Usada pelo OCR.run nas páginas novas
     ou alteradas; se a IA falhar, a página é lida pelo leitor antigo.
   • Sumário com IA (AI.tocNote): manda o texto de cada linha + medidas (tamanho da letra, espessura, cor, recuo, espaço acima)
     para um modelo que "pensa mais" e ele separa títulos, subtítulos, seções e tópicos. Resultado guardado em note.aiToc.
   • Ritmo: AI.slot() espaça os pedidos (padrão 10 por minuto, ajustável) e repete com espera quando o provedor diz "muitos pedidos". */
const AI_PROVIDERS = {
  gemini: { name: 'Google Gemini', keyUrl: 'https://aistudio.google.com/app/apikey', ocr: 'gemini-2.5-flash', toc: 'gemini-2.5-pro' },
  anthropic: { name: 'Anthropic (Claude)', keyUrl: 'https://console.anthropic.com/settings/keys', ocr: '', toc: '' },
  openai: { name: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', base: 'https://api.openai.com/v1', ocr: '', toc: '' },
  compat: { name: 'Compatível com OpenAI (OpenRouter, Groq, Ollama…)', keyUrl: '', base: '', ocr: '', toc: '' },
};
const AI = {
  cfg() {
    const S = Store.settings; if (!S.ai) S.ai = {}; const c = S.ai;
    if (!c.provider) c.provider = 'gemini'; for (const k of ['keys', 'models', 'tocModels', 'base']) if (!c[k] || typeof c[k] !== 'object') c[k] = {};
    return c;
  },
  prov() { return this.cfg().provider; },
  key(p = this.prov()) { return (this.cfg().keys[p] || '').trim(); },
  base(p = this.prov()) { const b = (this.cfg().base[p] || AI_PROVIDERS[p].base || '').trim(); return b.replace(/\/+$/, ''); },
  model(kind = 'ocr', p = this.prov()) { const c = this.cfg(); return ((kind === 'toc' ? c.tocModels[p] || c.models[p] : c.models[p]) || AI_PROVIDERS[p][kind] || AI_PROVIDERS[p].ocr || '').trim(); },
  ready() { const c = this.cfg(), p = c.provider; return !!(c.on && (this.key(p) || p === 'compat') && this.model('ocr') && (p !== 'compat' || this.base(p))); },
  ocrOn() { return this.ready() && this.cfg().ocr !== false && navigator.onLine && Date.now() > this._pause; },
  _pause: 0, /* depois de limite atingido ou chave recusada, a leitura automática descansa 10 min (volta ao leitor antigo) */
  lastError: null, stats: { pages: 0, calls: 0 },

  /* ---- ritmo: no máximo N pedidos por minuto ---- */
  _next: 0,
  async slot() {
    const rpm = clamp(+this.cfg().rpm || 10, 1, 120), gap = 60000 / rpm, now = Date.now();
    const at = Math.max(now, this._next); this._next = at + gap; if (at > now) await sleep(at - now);
  },

  /* ---- uma chamada: parts = [{text} | {mime, data(base64)}] → texto da resposta ---- */
  async call({ parts, system = '', json = false, kind = 'ocr', think = false, signal } = {}) {
    const p = this.prov(), model = this.model(kind, p);
    if (!model) throw new Error('Escolha o modelo da IA nas Configurações');
    let noThink = false, noJson = false;
    for (let attempt = 0; ; attempt++) {
      await this.slot(); this.stats.calls++;
      let res, body;
      try { ({ res, body } = await this.send(p, model, { parts, system, json: json && !noJson, think: noThink ? null : think, kind, signal })); }
      catch (e) { if (e.name === 'AbortError') throw e; if (attempt < 2) { await sleep(4000 * (attempt + 1)); continue; } throw new Error('Sem conexão com a IA (' + e.message + ')'); }
      if (res.ok) return this.textOf(p, body);
      const msg = this.errMsg(body) || ('HTTP ' + res.status);
      if (res.status === 400 && !noThink && /think/i.test(msg)) { noThink = true; continue; } /* modelo que não aceita o ajuste de "pensar" */
      if (res.status === 400 && json && !noJson && /response_format|json|mime/i.test(msg)) { noJson = true; continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { const ra = +res.headers.get('retry-after'); await sleep(ra > 0 ? Math.min(ra, 90) * 1000 : [8000, 20000, 45000][attempt]); continue; }
      const err = new Error((res.status === 401 || res.status === 403 ? 'Chave recusada: ' : res.status === 429 ? 'Limite de uso atingido: ' : res.status === 404 ? 'Modelo não encontrado: ' : '') + msg);
      if ([401, 403, 429].includes(res.status)) this._pause = Date.now() + 600000;
      err.status = res.status; throw err;
    }
  },
  async send(p, model, { parts, system, json, think, kind, signal }) {
    const key = this.key(p); let url, headers = { 'content-type': 'application/json' }, body;
    if (p === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`; headers['x-goog-api-key'] = key;
      const gen = { temperature: think ? 1 : 0.2, maxOutputTokens: 32768 };
      if (json) gen.responseMimeType = 'application/json';
      if (think !== null) { /* leitura: pensar pouco (rápido e barato); sumário: pensar mais */
        if (/gemini-[3-9]/.test(model)) gen.thinkingConfig = { thinkingLevel: think ? 'high' : 'low' };
        else if (/2\.5/.test(model)) gen.thinkingConfig = { thinkingBudget: think ? -1 : (/pro/.test(model) ? 128 : 0) };
      }
      body = { contents: [{ role: 'user', parts: parts.map((x) => (x.text != null ? { text: x.text } : { inlineData: { mimeType: x.mime, data: x.data } })) }], generationConfig: gen };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
    } else if (p === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      Object.assign(headers, { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
      body = { model, max_tokens: 16000, messages: [{ role: 'user', content: parts.map((x) => (x.text != null ? { type: 'text', text: x.text } : { type: 'image', source: { type: 'base64', media_type: x.mime, data: x.data } })) }] };
      if (system) body.system = system + (json ? '\nResponda apenas com o JSON, sem texto antes ou depois.' : '');
    } else {
      url = this.base(p) + '/chat/completions'; if (key) headers.authorization = 'Bearer ' + key;
      const content = parts.map((x) => (x.text != null ? { type: 'text', text: x.text } : { type: 'image_url', image_url: { url: `data:${x.mime};base64,${x.data}` } }));
      body = { model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }] };
      if (json) body.response_format = { type: 'json_object' };
    }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    let b = null; try { b = await res.json(); } catch (_) {}
    return { res, body: b };
  },
  textOf(p, b) {
    if (!b) throw new Error('Resposta vazia da IA');
    if (p === 'gemini') {
      const c = b.candidates && b.candidates[0];
      if (!c) throw new Error('A IA recusou' + (b.promptFeedback && b.promptFeedback.blockReason ? ' (' + b.promptFeedback.blockReason + ')' : ''));
      return ((c.content && c.content.parts) || []).filter((x) => !x.thought && typeof x.text === 'string').map((x) => x.text).join('');
    }
    if (p === 'anthropic') return (b.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
    const m = b.choices && b.choices[0] && b.choices[0].message; return (m && (typeof m.content === 'string' ? m.content : (m.content || []).map((x) => x.text || '').join(''))) || '';
  },
  errMsg(b) { if (!b) return ''; const e = b.error; return typeof e === 'string' ? e : (e && (e.message || e.type)) || b.message || ''; },
  parseJSON(s) {
    s = String(s || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(s); } catch (_) {}
    const a = s.indexOf('{'), z = s.lastIndexOf('}'); if (a >= 0 && z > a) { try { return JSON.parse(s.slice(a, z + 1)); } catch (_) {} }
    throw new Error('A IA não respondeu no formato esperado');
  },

  /* ---- lista de modelos do provedor (para escolher sem digitar) ---- */
  async listModels(p = this.prov()) {
    const key = this.key(p); let r, b, out = [];
    if (p === 'gemini') {
      r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key } }); b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(this.errMsg(b) || 'HTTP ' + r.status);
      out = (b.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || '' }));
    } else if (p === 'anthropic') {
      r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }); b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(this.errMsg(b) || 'HTTP ' + r.status);
      out = (b.data || []).map((m) => ({ id: m.id, name: m.display_name || '' }));
    } else {
      r = await fetch(this.base(p) + '/models', { headers: key ? { authorization: 'Bearer ' + key } : {} }); b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(this.errMsg(b) || 'HTTP ' + r.status);
      out = (b.data || b.models || []).map((m) => ({ id: m.id || m.name, name: '' }));
    }
    return out.filter((m) => m.id);
  },
  /* sugestão automática: o Gemini mais novo "flash" para ler e "pro" para o sumário (sem lite/imagem/voz/embedding) */
  suggest(list, kind) {
    const ok = list.filter((m) => /^gemini-/.test(m.id) && !/embed|tts|image|audio|live|lite|aqa|learnlm|robotics|computer/.test(m.id));
    const want = ok.filter((m) => (kind === 'toc' ? /pro/ : /flash/).test(m.id));
    const ver = (id) => { const m = id.match(/gemini-(\d+(?:\.\d+)?)/); return m ? +m[1] : 0; };
    const score = (m) => ver(m.id) * 10 - (/preview|exp/.test(m.id) ? 3 : 0) - (/-\d{3,}$|-\d{2}-\d{2}/.test(m.id) ? 1 : 0);
    const best = want.sort((a, b) => score(b) - score(a))[0]; return best ? best.id : '';
  },
  async test() { const t = await this.call({ parts: [{ text: 'Responda só com a palavra OK.' }], kind: 'ocr' }); return t.trim().slice(0, 60); },

  /* ---- leitura da escrita de uma página ---- */
  STRIP: 56, MAXW: 1400, MAXH: 7000,
  stripImages(groups) {
    const imgs = []; let cur = null;
    const flush = () => { if (!cur) return; const cv = document.createElement('canvas'); cv.width = cur.w; cv.height = cur.h; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      for (const it of cur.items) {
        const { L, n, y, s, w, h } = it;
        g.fillStyle = '#eef2ff'; g.fillRect(0, y, 48, h); g.fillStyle = '#4338ca'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 24, y + h / 2);
        g.fillStyle = '#d1d5db'; g.fillRect(48, y + h, cv.width - 48, 1);
        const pad = (h / s - L.h) / 2;
        g.save(); g.beginPath(); g.rect(52, y, w, h); g.clip(); g.translate(56, y); g.scale(s, s); g.translate(-L.x1, -L.y1 + pad);
        for (const o of L.items) { const e = o.e; drawElement(g, e.color && /^#?f{3,6}$/i.test(String(e.color).replace('#', '')) ? { ...e, color: '#000000' } : e); }
        g.restore();
      }
      imgs.push(cv.toDataURL('image/jpeg', 0.86).split(',')[1]); cv.width = cv.height = 0; cur = null;
    };
    groups.forEach((L, i) => {
      const lw = Math.max(1, L.x2 - L.x1), lh = Math.max(1, L.h), s = Math.min(this.STRIP / lh, (this.MAXW - 64) / lw, 4);
      const w = Math.ceil(lw * s) + 8, h = Math.ceil(Math.max(lh * s, 24) + 14);
      if (!cur || cur.h + h + 6 > this.MAXH) { flush(); cur = { w: 64, h: 0, items: [] }; }
      cur.items.push({ L, n: i + 1, y: cur.h, s, w, h }); cur.h += h + 6; cur.w = Math.min(this.MAXW, Math.max(cur.w, w + 64));
    });
    flush(); return imgs;
  },
  OCR_SYS: 'Você transcreve escrita à mão de anotações de estudo em português do Brasil (com termos técnicos — informática, redes, direito — e às vezes inglês). ' +
    'Cada faixa da imagem é UMA linha de escrita e tem o seu número à esquerda. Transcreva cada faixa exatamente como está escrita: mantenha acentos, maiúsculas, siglas, números, símbolos e pontuação; ' +
    'não corrija o conteúdo, não complete frases e não junte linhas. Use as faixas vizinhas como contexto para decifrar palavras difíceis. Faixa sem texto (desenho, seta, rabisco) → texto vazio. ' +
    'Responda só JSON no formato {"l":[{"n":1,"t":"texto da faixa 1"},{"n":2,"t":"..."}]}.',
  async readPage(note, page) {
    const groups = OCR.groupLines(page.elements); if (!groups.length) return { text: '', lines: [], ai: 1 };
    const out = new Map();
    for (let a = 0; a < groups.length; a += 70) { /* páginas muito cheias: em partes */
      const part = groups.slice(a, a + 70), imgs = this.stripImages(part);
      const ctx = `Nota: "${(note.title || '').slice(0, 80)}". ${part.length} faixas numeradas de 1 a ${part.length}.`;
      const txt = await this.call({ parts: [{ text: ctx }, ...imgs.map((d) => ({ mime: 'image/jpeg', data: d }))], system: this.OCR_SYS, json: true, kind: 'ocr' });
      const j = this.parseJSON(txt), arr = Array.isArray(j) ? j : j.l || j.lines || j.linhas || [];
      for (const x of arr) { const n = +x.n; if (n >= 1 && n <= part.length) out.set(a + n - 1, String(x.t ?? x.text ?? '').trim()); }
    }
    const lines = [];
    groups.forEach((L, i) => { const t = out.get(i); if (t) lines.push({ t, x: Math.round(L.x1), y: Math.round(L.y1), w: Math.round(L.x2 - L.x1), h: Math.round(L.h) }); });
    this.stats.pages++;
    return { text: lines.map((l) => l.t).join('\n'), lines, ai: 1 };
  },
  /* reler com a IA as páginas desta nota que foram lidas pelo leitor antigo */
  rereadNote(note) {
    let n = 0;
    for (const p of note.pages) { if (OCR.pageSig(p).startsWith('0:') || (p.ocr && p.ocr.ai && p.ocr.sig === OCR.pageSig(p))) continue; if (!OCR.queue.some((q) => q.pageId === p.id)) { OCR.queue.push({ noteId: note.id, pageId: p.id, ai: true }); n++; } }
    OCR.run(); return n;
  },

  /* ---- sumário com IA ---- */
  noteSig(note) { const s = note.pages.map((p) => OCR.pageSig(p)).join('|'); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return note.pages.length + ':' + h; },
  TOC_SYS: 'Você organiza o sumário de um caderno de estudos escrito à mão. Recebe as linhas de cada página, na ordem, com o texto lido e medidas da escrita: ' +
    'a = altura da letra em relação à escrita comum da página (1 = normal), e = espessura da caneta em relação à mais usada, c = cor (só quando difere da principal), ' +
    'x = recuo da margem e w = largura da linha (em % da página), s = espaço livre acima da linha (em alturas de letra). ' +
    'Decida o que é título (nível 1), subtítulo (2), seção menor (3) e tópico (4: itens de lista, marcadores, enumerações curtas que organizam o conteúdo); o resto é escrita comum e NÃO entra. ' +
    'Pese tudo junto: tamanho, espessura, cor, recuo, espaço acima, se a linha é curta, numeração (I., 1., a), 1.1), palavras como "Capítulo", "Art.", e o sentido do texto. ' +
    'Seja coerente na nota inteira (o mesmo estilo de escrita = o mesmo nível). Um título que ocupa duas linhas seguidas vira um item só (liste os dois ids). ' +
    'Corrija no nome apenas erros óbvios de leitura e não invente texto. Responda só JSON: {"itens":[{"l":["3.12"],"n":1,"t":"Nome do título"}]} na ordem da nota.',
  tocLines(note) {
    const pages = note.pages.map((p) => AutoToc.pageLines(p).slice().sort((a, b) => a.y - b.y)), all = pages.flat();
    if (!all.length) return null;
    const wInk = new Map(), cInk = new Map(); for (const L of all) { wInk.set(L.width, (wInk.get(L.width) || 0) + L.ink); cInk.set(L.color, (cInk.get(L.color) || 0) + L.ink); }
    const modeW = [...wInk.entries()].sort((a, b) => b[1] - a[1])[0][0], mainC = [...cInk.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const med = (v) => { v = v.slice().sort((a, b) => a - b); return v[Math.floor(v.length / 2)] || 1; };
    const gCore = med(all.filter((L) => Math.abs(L.width - modeW) < 0.01).map((L) => L.core)) || med(all.map((L) => L.core));
    const r1 = (v) => Math.round(v * 10) / 10, rows = [];
    pages.forEach((ls, pi) => {
      if (!ls.length) return; const page = note.pages[pi], pw = page.w || 1000, body = ls.filter((L) => Math.abs(L.width - modeW) < 0.01);
      const pCore = body.length >= 5 ? Math.max(med(body.map((L) => L.core)), gCore * 0.75) : gCore;
      ls.forEach((L, k) => {
        const prev = ls[k - 1], gap = prev ? Math.max(0, L.y - (prev.y + prev.h)) / pCore : 9;
        const t = AutoToc.ocrText(page, L).replace(/\s+/g, ' ').slice(0, 120) || '?';
        rows.push({ id: `${pi + 1}.${k + 1}`, pi, L, s: `${pi + 1}.${k + 1} a${r1(L.core / pCore)} e${r1(L.width / modeW)}${L.color !== mainC ? ' c' + L.color : ''} x${Math.round((100 * L.x) / pw)} w${Math.round((100 * L.w) / pw)} s${r1(Math.min(gap, 9))}: ${t}` });
      });
    });
    return rows;
  },
  async tocNote(note, onStep) {
    /* 1) texto das páginas: as que ainda não foram lidas (ou mudaram) são lidas agora */
    const need = note.pages.filter((p) => !OCR.pageSig(p).startsWith('0:') && (!p.ocr || p.ocr.sig !== OCR.pageSig(p)));
    if (need.length) {
      for (const p of need) if (!OCR.queue.some((q) => q.pageId === p.id)) OCR.queue.push({ noteId: note.id, pageId: p.id });
      OCR.run(); const tot = need.length;
      for (let t = 0; t < 1800; t++) { const left = need.filter((p) => OCR.queue.some((q) => q.pageId === p.id)).length; onStep && onStep(`Lendo a escrita… ${tot - left} de ${tot} página${tot > 1 ? 's' : ''}`); if (!left && !OCR.busy) break; if (OCR.lastError && !OCR.busy) break; await sleep(700); }
      note = await OCR.live(note.id) || note;
    }
    const rows = this.tocLines(note); if (!rows || rows.length < 3) throw new Error('Pouca escrita nesta nota para montar o sumário');
    /* 2) a IA classifica (notas grandes em partes de ~1200 linhas; cada parte recebe os títulos já achados) */
    const byId = new Map(rows.map((r) => [r.id, r])), items = [];
    for (let a = 0, part = 1, parts = Math.ceil(rows.length / 1200); a < rows.length; a += 1200, part++) {
      onStep && onStep(parts > 1 ? `A IA está analisando a nota… parte ${part} de ${parts}` : 'A IA está analisando a nota…');
      const chunk = rows.slice(a, a + 1200), prev = items.slice(-25).map((it) => `n${it.level + 1} p${it.pi + 1}: ${it.text}`).join('\n');
      const msg = `Nota: "${(note.title || '').slice(0, 80)}" (${note.pages.length} página${note.pages.length > 1 ? 's' : ''}).` + (prev ? `\nTítulos já encontrados nas páginas anteriores (para manter o mesmo padrão):\n${prev}` : '') + `\n\nLinhas (id = página.linha):\n` + chunk.map((r) => r.s).join('\n');
      const j = this.parseJSON(await this.call({ parts: [{ text: msg }], system: this.TOC_SYS, json: true, kind: 'toc', think: true }));
      for (const x of j.itens || j.items || []) {
        const ids = (Array.isArray(x.l) ? x.l : [x.l]).map(String).filter((id) => byId.has(id)); if (!ids.length) continue;
        const rs = ids.map((id) => byId.get(id)), pi = rs[0].pi, sameP = rs.filter((r) => r.pi === pi).map((r) => r.L);
        const x1 = Math.min(...sameP.map((L) => L.x)), y1 = Math.min(...sameP.map((L) => L.y)), x2 = Math.max(...sameP.map((L) => L.x + L.w)), y2 = Math.max(...sameP.map((L) => L.y + L.h));
        items.push({ pi, level: clamp((+x.n || 1) - 1, 0, 3), rect: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, text: String(x.t || '').trim() || AutoToc.ocrText(note.pages[pi], sameP[0]) });
      }
    }
    items.sort((a, b) => a.pi - b.pi || a.rect.y - b.rect.y);
    note.aiToc = { sig: this.noteSig(note), at: Date.now(), model: this.model('toc'), items };
    if (typeof Editor !== 'undefined' && Editor.note && Editor.note.id === note.id) { if (Editor.note !== note) Editor.note.aiToc = note.aiToc; Editor.saveDebounced(); } else if (Store.heads[note.id]) await Store.putNote(note);
    return note.aiToc;
  },
  /* seção "Tópicos (IA)" do Sumário: mostra o último resultado e o botão de analisar/refazer */
  tocSection(note, go, autoBox) {
    const box = el('div', {}), head = el('div', { class: 'qs-sec ai-toc-head' }, 'Tópicos (IA)');
    const status = el('p', { class: 'qs-empty' }), list = el('div', {});
    const btn = el('button', { class: 'btn ai-toc-btn', onclick: async () => {
      if (!this.ready()) return toast('Configure a IA em Configurações → Inteligência artificial', 3000);
      if (!navigator.onLine) return toast('A IA precisa de internet');
      btn.disabled = true; list.innerHTML = '';
      try { const n = (await OCR.live(note.id)) || note; await this.tocNote(n, (s) => { status.textContent = s; }); paint(); }
      catch (e) { status.textContent = '⚠️ ' + e.message; logError(e, 'sumário IA'); }
      btn.disabled = false;
    } });
    btn.innerHTML = icon('sparkle'); btn.append(' Analisar com IA');
    const paint = () => {
      const T = note.aiToc; list.innerHTML = '';
      if (!T) { status.textContent = 'A IA lê a nota inteira e decide o que é título, subtítulo, seção e tópico pelo tamanho, espessura, cor, posição e sentido do texto.'; if (autoBox) autoBox.style.display = ''; return; }
      const old = T.sig !== this.noteSig(note);
      status.textContent = (old ? 'A nota mudou desde a análise — toque em "Refazer" para atualizar. ' : '') + `${T.items.length} ite${T.items.length === 1 ? 'm' : 'ns'} · ${new Date(T.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
      btn.lastChild.textContent = ' Refazer com IA';
      if (autoBox) autoBox.style.display = 'none';
      for (const it of T.items.slice(0, 500)) list.append(el('div', { class: 'ol-item ol-topic lv' + Math.min(2, it.level) + (it.level === 3 ? ' ai-tp' : ''), style: { paddingLeft: 10 + it.level * 16 + 'px' }, onclick: () => go(it) }, el('span', { class: 'ol-t' }, (it.level === 3 ? '• ' : '') + (it.text || '…')), el('span', { class: 'ol-pg' }, String(it.pi + 1))));
    };
    box.append(head, status, btn, list); paint(); return box;
  },
};
