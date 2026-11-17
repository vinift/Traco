# Traço Notas — contexto para o Claude Code

App de notas manuscritas estilo Notewise, feito para o **Xiaomi Pad 7** (caneta Focus Pen + dedo, tela ~2,5 de densidade, Android). É um **PWA** publicado no **GitHub Pages** a partir deste repositório (`vinift/Traco`, branch `main`) e instalado no tablet como **TWA** (gerado no PWABuilder). Backup e sincronização no **Google Drive** do usuário.

Este arquivo é o "caderno de bordo" do projeto: qualquer sessão nova, de qualquer conta, deve conseguir continuar o trabalho só lendo isto. **Ao terminar cada rodada, atualize o "Histórico" e o que mais tiver mudado aqui.**

---

## 1. Começando numa sessão nova

1. `git fetch origin main && git log --oneline -5 origin/main` — veja a versão atual (também em `js/app.js` → `version`). Trabalhe a partir da `main` mais recente.
2. Se o ambiente exigir um branch de trabalho da sessão (ex.: `claude/...`), commite nele **e** publique na `main` (`git push origin HEAD:main`) — ver autorização abaixo. Se a `main` andou na frente, faça `git fetch` + merge antes de publicar (nunca force-push).
3. Não crie pull requests (o Vinicius publica direto na `main`).
4. Leia a seção 9 (Histórico) para saber o que já foi feito e por quê — várias decisões foram ida-e-volta (zoom, memória, trava de rolagem) e não devem ser desfeitas sem perguntar.

## 2. Como trabalhar com o Vinicius

- **Responda sempre em português (pt-BR).** Ele é destro, estuda (informática, redes…) e usa o app diariamente no Pad 7.
- **Autorização permanente:** pode publicar toda versão/patch **direto na `main`**, sem perguntar antes.
- Pergunte antes de decisões de produto/UX que tenham mais de um caminho razoável. A ferramenta de perguntas com opções (com uma "(Recomendado)") funciona bem com ele; ele às vezes responde com texto livre combinando opções.
- Cada rodada = **uma versão nova** (patch `0.24.1 → 0.24.2` para ajustes/correções; minor `0.24 → 0.25` para recursos novos), registrada no `LEIA-ME.md`.
- Relatório no fim de cada rodada: o que mudou (em linguagem de usuário), como foi testado (com números quando houver), limitações honestas (o que não dá para testar sem o tablet) e onde ajustar. Sugestões de melhoria no fim são bem-vindas mas curtas — ele costuma recusar a maioria e prefere pedir o que quer.
- Ele testa no tablet e volta com feedback curto (às vezes com print). Quando algo "ficou pior", ele prefere **voltar ao comportamento anterior com um ajuste** do que uma regra totalmente nova.
- Ele **não quer** suíte de testes automatizados no repositório (testes ficam em scripts avulsos no scratchpad).
- Use `vinift` em URLs de exemplo (github.com/vinift, vinift.github.io/Traco).
- Nunca apague arquivos que só existem no repositório (ex.: `.well-known/assetlinks.json` do TWA, se existir). Exceção: lixo comprovadamente seu (ex.: prints de teste commitados por engano — já aconteceu na v0.19.1 e foi limpo na v0.23.1).

## 3. Lançar uma versão (checklist)

1. Trocar a versão em **três** lugares: `js/app.js` (`version: 'x.y.z'`), `sw.js` (`const VERSION = 'traco-vx.y.z'`) e **todos** os `?v=x.y.z` do `index.html` (cache busting). Conferir com `grep -c "versão-antiga" index.html js/app.js sw.js` → tudo 0.
2. Arquivo JS novo → incluir no `index.html` (na ordem certa) **e** na lista `FILES` do `sw.js`.
3. `for f in js/*.js sw.js; do node --check $f; done`.
4. Seção `## Novidades da vX.Y.Z` no topo das novidades do `LEIA-ME.md` (acima da anterior), escrita para o usuário.
5. Linha nova no Histórico (seção 9) deste arquivo, escrita para o próximo desenvolvedor (nomes de funções/variáveis).
6. Commit com a versão no título (ex.: `v0.24.2: trava de rolagem vertical a partir de 70% de zoom`), push no branch da sessão e na `main`.
7. No tablet, o usuário toca em "Verificar atualização" (tela inicial, embaixo da barra lateral).

## 4. Arquitetura (JS puro, sem build)

- Scripts clássicos que compartilham globais, carregados nesta ordem: util, store, geom, render, pdf, tpl-import, drive, editor, toolbar, tables, tiles, navigation, richtext, crop, colorpicker, ui, ocr, beautify, import-notewise, library, plugins, workspace, timer, app.
- `const Editor`, `const UI`, `const StudyTimer` etc. **não** ficam em `window`: use `typeof Editor !== 'undefined'`.
- Vários arquivos estendem o editor com `Object.assign(Editor, {...})` (tiles, navigation, richtext, tables, crop, colorpicker). **`Object.assign` não copia getters** (avalia uma vez) — use métodos (ex.: `previewCap()`, `tileCap()`).
- Comentários: prefira `/* */` em linhas longas — um `//` já engoliu código mais de uma vez. O código é denso (linhas longas); edite com substituições exatas e confira com `node --check`.
- `vendor/`: pdf.js (`pdf.min.mjs` + worker) e `pdf-lib.min.js`.
- Ícones: objeto de SVGs em `js/util.js` (`icon('nome')`, `iconEl`). Ícones já criados por nós: `timer`, `sparkle`.
- UI utilitária (`js/util.js`): `el(tag, attrs, ...filhos)`, `$`, `$$`, `toast(msg, ms)`, `openModal`, `confirmBox`, `openPop(âncora, conteúdo, {onClose})` / `closePop()`, `menu`, `clamp`, `clone`, `uid`, `debounce`.

### Arquivos principais
- `js/store.js` — IndexedDB `traco-notas` v2 (stores `notes`, `blobs`, `meta`, `pages`). Notas "split": metadados em `notes`, elementos de cada página em `pages` com chave `noteId/pageId`. `Store._sigs` (WeakMap) guarda a assinatura por página para só regravar páginas alteradas (página removida e depois restaurada pelo desfazer é regravada sozinha). Pontos dos traços em `Float32Array` (`toPts32` / `ptsJSON`). `Store.heads` = índice leve das notas. `DEFAULT_SETTINGS` e `Store.saveSettings()` (com **debounce de 300 ms**). `DB.get/put('meta', valor, chave)` para dados avulsos.
- `js/render.js` — `drawTemplate` (grade/linhas/pontos; espessura mínima de 1 px do aparelho e esmaecimento abaixo disso; na tela infinita a grade continua em coordenadas negativas), `drawElement` (todo desenho de elemento passa por aqui: tela, miniaturas, PNG e PDF), `drawPageContent` (desenha em ordem: fundo → modelo → elementos), `ImgCache`, `crispLine`.
- `js/tiles.js` — compositor DOM: `.world` (translate3d) → `.w-frames` (scale z, molduras + miniaturas `.pgprev`) → `.w-lvl` (um por nível de zoom) com tiles canvas de 512 px (`.wt`). Ver seção 5 (zoom e memória).
- `js/editor.js` — ferramentas, entrada (`onDown/onMove/onRaw/onUp`), gestos (`startGesture/moveGesture/endGesture`), câmera (`clampCam`, `LOCK_Z`), desenho (`startDraw/addDrawPoint/drawLiveStroke/endDraw`), seleção (`Editor.sel = {pageId, ids:Set}`, `selHandles/selHit/drawSelection`), histórico (`recAdd/recRemove/recReplace/recTemplate/recPages` + `opCommit()`; `undo/redo`), páginas (`addPage/deletePage/movePage`).
- `js/crop.js` — "extras" do editor: recorte de imagem direto na página (`cropSel/applyCrop/cancelCrop`), **toque duplo da caneta** (`initPenTriple`/`penTripleFire`, `PEN_DOUBLE_ACTIONS`, `penDoubleAction()`), **segurar o dedo com o laço → colar da biblioteca** (`lassoHoldPaste`).
- `js/beautify.js` — "melhorar escrita": `smoothArc` (automático no fim do traço) e `beautifySelection()` (botão ✨ no laço).
- `js/timer.js` — `StudyTimer` (cronômetro/temporizador/Pomodoro, histórico de estudo, notificações do sistema).
- `js/tables.js` — tabelas e também `prepSel/moveSel/endMoveSel` (mover/redimensionar/girar seleção, com alças por canto/lado).
- `js/toolbar.js` — barras (rail, subrail, hbar), grupos/subgrupos de cores (`groupTree`, `groupManager`, `widthList(t)` = espessuras do grupo atual), barra da seleção (`buildSelBar`), janela de espessura da seleção (`selWidthPop` com ±0,1), `Clips` (biblioteca de itens copiados, meta 'clips'), `applyBarSize`.
- `js/navigation.js` — inércia/zoom, `Nav` (botão voltar do Android com 3 entradas de reserva no histórico empilhadas só em pointerup/keydown, porque o Chrome pula entradas criadas sem gesto do usuário), `StableVH` (`--appH`, ignora encolhidas pequenas da barra de status), `SafeArea` (margens congeladas), `SystemBar` (theme-color segue a tela), `NoteClock` (relógio + bateria), bloqueio de `contextmenu`/`selectstart`.
- `js/ui.js` — `PageManager` (gerenciador de páginas; todas as operações passam por `Editor.recPages`), busca, modais.
- `js/library.js` — biblioteca (tela inicial), Configurações (`openSettings()` → `settingsPage`), `penMapSection` (botões da caneta + toque duplo), importações.
- `js/workspace.js` — troca rápida, tela dividida, sumário, texto do PDF, modo foco/tela cheia (Fullscreen API só em display-mode browser), `Focus.writing()/writingEnd()` (esconde o topo enquanto escreve com a caneta).
- `js/drive.js` — sincronização com lock (`navigator.locks` 'traco-drive'), upload resumível em partes, arquivos `.traco` em gzip, progresso por nota, migalhas de travamento ('traco-heavy'). `js/bg-sync.js` roda no service worker (Background Sync) importando util/store/drive com shims de `window`/`document`.
- `js/pdf.js` — `PdfCache` com fila de renderização; exportação PDF com pdf-lib (`copyPages` + anotações em PNG recortadas pela área da tinta).
- `js/ocr.js` — leitura da escrita (busca), `OCR.groupLines(strokes)` (agrupa traços em linhas; usado também por endireitar/melhorar escrita), `straightenSelection()`.
- `js/import-notewise.js` — importador do Notewise (seção 8).
- `sw.js` — cache offline (lista `FILES`), Background Sync, `notificationclick` do cronômetro.

## 5. Mapa de comportamentos (onde está cada coisa)

### Zoom, rolagem e memória (muita ida-e-volta — não mude sem perguntar)
- **`clampCam` (editor.js), horizontal:** `z ≤ lockZ()` (`S.lockZoom` em %, padrão 70, 0 = desligada; Configurações → Zoom) → folha **centralizada** e rolagem **só vertical** (arrasto de 1 dedo e inércia). Acima: a borda da folha pode entrar até `p = 0,35·vw + 60/z` (folga fixa em relação à tela — não pode encolher com o zoom, senão empurra a tela no meio da pinça). Durante a pinça (`_pinching`) o limite fica folgado (folha cobre ≥ metade da tela) para o **ponto entre os dedos não deslizar**; depois, `_xHold` mantém a posição e só deixa voltar para dentro (sem pulo).
- **Trava vertical do arrasto (moveGesture):** trava se o dedo sai quase reto (|dx| ≤ 0,2·|dy|) e solta com 14 px para o lado.
- **Puxar para adicionar página:** `PULL_MAX/PULL_ADD` 260/190 (~340 px de puxada) e só conta se o gesto começou já parado no fim (`g.atEnd`).
- **Blocos (tiles.js):** cada nível de zoom tem seus blocos; durante o gesto (`st.zooming`) não se renderiza nível novo, usa-se a reserva `_fbLvl` (sempre o último nível **completo**, `_curDone`) esticada. Miniatura da página (`pc.preview`, até 960 px) é o fundo de última instância; a velha fica na tela até a nova ficar pronta. Itens acrescentados no fim da página são pintados direto nos blocos e na miniatura (`paintOnTile`/`paintOnPreview`) em vez de redesenhar. `keepVisible` protege da remoção o que está na tela.
- **Qualidade ao tirar o zoom (`S.zoomQuality`, Configurações → Zoom):** "econômica" (padrão) = `tileCap()` 90 blocos (60 em aparelhos < 8 GB) e `previewCap()` 10 — **a "alta" (200 blocos, 18 miniaturas, camada afastada `_ovLvl` via `prefetchOverview`, miniaturas criadas durante o gesto) ficou pesada no Pad 7 e fazia as barras piscarem na pinça**. Sintoma de memória de desenho cheia no Android = barras piscando/sumindo.
- `updateHud` (texto do zoom na barra) é limitado a ~8×/s durante o gesto.

### Caneta e escrita
- Entrada da caneta por `pointerrawupdate` (`onRaw`, mais cedo que `pointermove`; `action.raw2` evita processar em dobro).
- Estabilização por ferramenta/tipo (`stabLevel`, `S.stabPen[tipo]`, padrão da esferográfica 8): filtro adaptativo em `addDrawPoint`; "corda" só nos níveis 9–10.
- Fim do traço (`endDraw`): caneta → `smoothArc` com sigma `0,25·S.autoBeautify` px de tela (0 = desliga, padrão 5); marca-texto → `smoothStroke` leve.
- Baixa latência (`S.lowLatency`): tinta numa tela `desynchronized` opaca (`cInk`) só durante o traço; o fundo dela é preparado em ocioso (`inkPrepLater`/`inkKey`/`inkPaint`).
- **Sem piscar ao levantar a caneta:** a prévia ao vivo (`cLive`/`cInk`) só sai quando os blocos já mostram o traço (`_liveClear`/`_inkHide` + `allDone`).
- Toque duplo da caneta (mesmo lugar, ≤ 26 px, toques < 230 ms, intervalo < 330 ms): ação em `S.penDouble` (padrão alternar laço ↔ caneta); desfaz o que os toques criaram (`op.t >= início`).
- Segurar a caneta parada no fim do traço → reconhece forma (`S.shapeHold`). Rabiscar por cima → apaga (`S.scribbleErase`): `isScribble(pts, z)`/`scribbleTargets(els, pts, z)` em geom.js, lidos nos pontos crus `action.rawPts` (sem estabilização), medidas em px de tela. `isScribble` devolve 2 (forte: 4+ passadas, comprimento > 2,4·(w+h); apaga o que tem 3 toques + algum ponto dentro, `someInside`) ou 1 (leve, v0.24.5: testa a direção principal (PCA), a perpendicular, 0° e 90° com `lightPasses`; exige passadas juntas `ratio` = deslocamento/comprimento ≤ 0,4, compacto (extensão perpendicular ≤ 1,2·comprimento da passada — exclui m/nn), 4+ passadas ou 3 com `ratio` ≤ 0,28 e `maxDrift` < 0,75·altura (exclui "z"), comprimento > 1,2·(w+h); apaga só itens ≥ 35% cobertos, `coverIn`). O B maiúsculo e as ondinhas largas não contam. Sem nada embaixo, o rabisco vira tinta.

### Dedo e gestos
- 2 dedos = desfazer, 3 = refazer (toque rápido). `S.hand` ('right' padrão): destro só aceita esses toques na **metade esquerda** da tela (a palma apoia na direita).
- Proteção de palma (`S.palmGuard`): toques ignorados até 500 ms depois da caneta.
- Laço + segurar o dedo parado 550 ms → painel "colar" da biblioteca (`lassoHoldPaste`, cola no ponto com `pasteAt`).

### Seleção
- Alças: 4 cantos (proporcional, ancorado no canto oposto) + 4 lados (estica um eixo); texto só tem laterais; itens girados só cantos. Alça de girar em cima. Seleção pequena (caixa < 70 px na tela): tocar dentro sempre move; alças só por fora, raio 20 px (`selHit`).
- Barra da seleção: cor, espessura (com ±0,1 e as espessuras do grupo), copiar/recortar/duplicar, frente, bloquear, recortar imagem, OCR, endireitar, ✨ melhorar escrita, excluir.

### Ferramentas próprias (plugins)
- `js/plugins.js`: plugins em JS (`EXAMPLE_PLUGINS`, código em template string; atualizam quando `ver` sobe e o usuário não editou). Carimbo de data (`ex-data`, ver 3): texto + linha opcional (`cfg.line/lineDash/lineW/lineColor/lineLen`). API: `addText/addStroke/addShape(… {dash})/addElements(lista)` (vários itens num passo do desfazer), `store.get/set` (S.pluginData). Na barra, as ferramentas de plugin ficam junto com as outras (sem divisória); ações de plugin continuam no fim.

### Páginas e desfazer
- Adicionar/excluir/duplicar/mover/inserir PDF passam por `Editor.recPages(fn)` → mudança `{k:'pages', a, b}` no histórico (desfazer restaura as próprias páginas).

### Compartilhar e atualizar
- Compartilhar PDF (`exportPdfFlow(note, true)` → `sharePdfReady` em ui.js): o PDF é gerado e aparece a janela "PDF pronto"; `navigator.share` só é chamado no toque do botão "Compartilhar" — o Android exige um toque recente (gerar o PDF demora e a permissão expirava). Também no menu da nota na biblioteca.
- "Verificar atualização" (`App.checkUpdate`) e a troca de service worker chamam `App.keepPlace()` (pasta/visão da biblioteca em `sessionStorage` 'traco-lib-place'); `App.restorePlace()` no início volta para ela.

### Topo da nota
- `.ch-title`: título + relógio (`#noteClock`, toque abre o cronômetro) + bateria (`#noteBat`, Battery API) + tempo de estudo (`#noteTimer`, roxo cheio / verde na pausa / laranja pausado). Escrevendo ou em tela cheia, o topo some mas o tempo de estudo fica. Ao parar de escrever, as barras voltam depois de `S.writeHideSec` s (padrão 2,5; `Focus.writingEnd`; desliga com `S.hideWhileWriting`).
- Barra de status do Android: margens de área segura congeladas (`--sat/--sar/--sab/--sal` no CSS em vez de `env(safe-area-inset-*)`); `theme-color` acompanha a tela. A cor/transparência real da barra depende do TWA (no PWABuilder, modo de tela cheia "sticky"/imersivo, se disponível) — não dá para controlar só pelo site.
- Segurar o dedo não abre menu/seleção do Chrome em nada, exceto em campo de texto que já estava em uso antes do toque.

### Cronômetro de estudo (`js/timer.js`)
- Modos: cronômetro, temporizador (atalhos 5–90 min), Pomodoro (25/5/15 a cada 4, ajustável; pausa começa sozinha, foco espera Iniciar).
- Estado em meta 'studyTimer' (baseado em `Date.now()`); histórico em meta 'studyLog' `{days:{'AAAA-MM-DD':{noteId|'_':ms}}, titles}`, gravado por trechos (`boundary`) **só com o app visível** (`segAway`; app fechado/tela apagada não conta).
- Notificações do sistema (`S.timerNotify`): fixa e silenciosa enquanto roda (tag 'traco-timer', botões Pausar/Continuar/Abrir) e alarme ao terminar (tag 'traco-timer-end'). Limite: não dispara se o Android encerrou o app; pode atrasar ~1 min em segundo plano longo.

## 6. Configurações (`Store.settings`, chaves usadas)

`penDouble` (ação do toque duplo), `penTriple` (legado: false → toque duplo desligado), `hand` (right/left/none), `lockZoom` (% da trava de rolagem), `writeHideSec`/`hideWhileWriting` (barras ao escrever), `palmGuard`, `fingerDraws`, `scribbleErase`, `shapeHold`, `pressure`/`pressureSens`, `stabPen` (por tipo de caneta)/`stabHl`/`stabilizer` (legado), `autoBeautify` (0–10), `lowLatency`, `zoomQuality` (eco/high), `zoomMin`/`zoomMax`, `timerNotify`, `penMap` (botões físicos da caneta → ação), `presetGroups` (grupos de cores/espessuras), `widthPresets`/`colorPresets`, `tools` (estado de cada ferramenta), `barScale`/`barSize`, `theme`, `snap*` (guias), `hlSnapPdf`/`hlStraight`/`hlHold`, `straightAlways`, `ocr`, `drive`, `plugins`.

## 7. Testes (scripts Playwright avulsos — nada disso vai para o repositório)

- **Rode tudo com o cwd no scratchpad** (prints salvos na raiz do repo já foram parar num commit). Chromium + Playwright já vêm instalados no ambiente (`require('playwright')`).
- Servidor: `python3 -m http.server 8765` na raiz do repo, **em segundo plano com timeout longo** (ele morre entre comandos ou por tempo limite; reinicie quando precisar). Para comparar com a versão publicada: `git worktree add <scratchpad>/old HEAD` e sirva na porta 8766 (remova o worktree depois).
- Abra com `?x=` + timestamp para evitar cache; crie notas via `newNote`/`newPage`/`Store.putNote` e abra com `App.openNote(id)`; chame `Editor.*`, `UI.*`, `StudyTimer.*`.
- **Toque:** contexto com `hasTouch: true` e CDP `Input.dispatchTouchEvent` com `radiusX/radiusY` (sem raio o gesto não anda). Não comece o toque em cima da barra de baixo (`#hbar`, ~y > 740 numa tela de 800) nem da barra lateral (x < ~130).
- **Caneta:** CDP `Input.dispatchMouseEvent` com `pointerType: 'pen'`, `buttons: 1`, `force`. Depois da caneta, espere > 500 ms antes de tocar com o dedo (proteção de palma).
- **Tablet simulado:** `deviceScaleFactor: 2.5`, viewport 1280×800, e `Emulation.setCPUThrottlingRate { rate: 4 }` para aproximar a lentidão do Pad 7.
- **Relógio:** `page.clock.install()` só **depois** do app carregar (antes disso o IndexedDB não abre); timers criados antes não seguem o relógio falso.
- **Configurações:** `Store.saveSettings` grava 300 ms depois — espere antes de recarregar.
- **Notificações:** o Chromium sem tela recusa notificações mesmo com permissão; simule `Notification.permission` e `ServiceWorkerRegistration.prototype.showNotification/getNotifications` via `addInitScript`.
- Medidas úteis já usadas: ponto do mundo sob os dedos durante a pinça (`Editor.toWorld`), memória de desenho (soma de `tile.cv.width*height*4` + miniaturas), nitidez de faixas da tela (variância de bordas com PIL), comparação de pixels entre pintura incremental e redesenho completo.
- Arquivos `.notewise` de exemplo **não** estão no repositório — peça ao usuário se precisar.

## 8. Formato do Notewise (descoberto por engenharia reversa)

`.notewise` = ZIP com `note`, `page/<id>`, `image/<id>`, `pdf/<id>`; `note` e `page` são protobuf em base64. Página 3480×4000 un. (300 dpi) → 1000 px de largura no Traço.
Elemento da página (campo 4): 3 = matriz, 4 = traço, 5 = marca-texto, 6 = forma, 7 = imagem, 8 = texto, 11 = tabela, 14 = comentário.
Imagem (campo 7): 1 = id, 2 = retângulo da imagem inteira {1:x1,2:y1,3:x2,4:y2}, **4 = recorte visível** (mesmo referencial), 7 = {1: cor, 2: largura} (provável moldura), 9 = int (0/8/25/30, provável raio do canto), 10 = opacidade, 6/8 = ints desconhecidos, 3 = bytes (raro, desconhecido).
Imagem no Traço: `{type:'image', x, y, w, h, blobId, rot?, crop?: {x,y,w,h}}` — `crop` em frações da imagem original; `x/y/w/h` é a caixa visível.

## 9. Histórico

- v0.18.0 — recorte de imagem (laço → Recortar imagem), importação do Notewise respeitando o recorte, "Corrigir imagens recortadas" na Biblioteca → Importar.
- v0.19.0 — recorte direto na página (`js/crop.js`: `Editor.crop`, `cropSel/applyCrop/cancelCrop`, ações `crop`/`cropout`; a janela `cropDialog` saiu), bateria ao lado do relógio (`NoteClock.battery`), `SafeArea` e `SystemBar`, desfazer de páginas (`Editor.recPages`).
- v0.19.1 — grade da tela infinita: `first()` em `drawTemplate` só limita a 0 quando a folha tem borda (`bounded`); folga de meia linha nas emendas dos blocos.
- v0.20.0 — grade: espessura mínima de 1 pixel do aparelho (`z*dpr`) e esmaecimento abaixo disso; triplo toque da caneta → laço; folga lateral com zoom em `clampCam`.
- v0.21.0 — `js/timer.js` (`StudyTimer`): cronômetro/temporizador/Pomodoro, histórico por dia e por nota, `#noteTimer`/`#libTimer`, painel via `openPop`. Triplo toque com o laço ativo volta para a caneta.
- v0.22.0 — histórico só com o app visível (`segAway`); topo maior; bloqueio de menu/seleção do Chrome; `selWidthPop` usa `UI.widthList`; `lassoHoldPaste` + `Editor.pasteAt`; alças `selHandles` (cantos proporcionais, lados esticam; `action.hh`); estabilização mais leve; `paintOnTile`; `pointerrawupdate` (`onRaw`); tela rápida preparada em ocioso.
- v0.23.0 — sem piscar ao parar de escrever (`_liveClear`/`_inkHide` + `allDone`); ±0,1 na espessura da seleção; tempo de estudo com fundo cheio e visível escrevendo; toque DUPLO configurável (`S.penDouble`); `S.hand` (destro/canhoto) para 2/3 dedos; `js/beautify.js` (`smoothArc`, `S.autoBeautify`, `beautifySelection`).
- v0.23.1 — zoom sem sumir conteúdo: reserva = último nível completo; `keepVisible`; miniatura velha fica até a nova; `paintOnPreview`; miniaturas ±4 páginas. Removidos prints de teste commitados por engano.
- v0.23.2 — trava vertical do arrasto mais leve; camada afastada `_ovLvl` (`prefetchOverview`).
- v0.23.3 — camada afastada cobre a página atual inteira, nível por orçamento de memória; `S.zoomQuality` (alta/econômica).
- v0.23.4 — tentativa: folha estreita sem centralizar; econômica como padrão (a alta pesou).
- v0.23.5 — tentativa: regra "folha cobre metade da tela" (foco fixo, mas o usuário achou o zoom ruim).
- v0.23.6 — rolagem só vertical abaixo de 50%; puxar para adicionar mais exigente (`PULL_*` 260/190, `g.atEnd`).
- v0.23.7 — volta à regra da v0.20 com folga fixa em tela; centraliza e trava vertical até 60%; pinça com limite folgado + `_xHold`.
- v0.24.0 — cronômetro integrado às notificações do sistema (`sysSync`, `armEnd`, `sysAlarm`, `askNotify`; `notificationclick` no `sw.js`; `S.timerNotify`).
- v0.24.1 — barras piscando na pinça: econômica volta a `tileCap` 90/60 e `previewCap()` 10; camada afastada e miniaturas durante o gesto só na alta; `updateHud` ~8×/s no gesto.
- v0.24.2 — trava de rolagem/centralização em 70%.
- v0.24.8 — carimbo de data com linha (tracejado/espessura/cor/comprimento), `api.addElements`, plugins junto das ferramentas na barra.
- v0.24.7 — compartilhar via janela "PDF pronto" (`sharePdfReady`), `S.writeHideSec`, `App.keepPlace/restorePlace`. Teste: simule `navigator.share` exigindo `navigator.userActivation.isActive`.
- v0.24.6 — `selHit`: objetos pequenos movem ao tocar dentro (alças só por fora, raio 20).
- v0.24.5 — rabisco leve em qualquer direção (`lightPasses`, PCA), protege o "B"; desfazer já restaurava o apagado (op normal no histórico).
- v0.24.4 — rabisco "leve" (ver seção 5 → Caneta e escrita). Teste: ao mudar `Editor.cam.z` no teste, recentralize `cam.x` — senão o ponto pode cair fora da folha e a caneta não escreve (parece bug, não é).
- v0.24.3 — rabiscar para apagar coisas pequenas (`rawPts`, medidas em px de tela, `someInside`, margem 1,5 px); trava de rolagem configurável (`Editor.lockZ()`/`S.lockZoom`); respiro entre controles das seções de configuração. Teste: `openSettings()` só resolve ao fechar — chame sem `await`.

### Ideias ainda não feitas
- Importar moldura/cantos arredondados das imagens do Notewise (campos 7 e 9).
- Ignorar a palma também na rolagem (toques com área de contato grande), não só nos toques de 2/3 dedos.
- "Melhorar escrita" na página inteira de uma vez.
- Alarme do cronômetro com o app fechado exigiria app nativo/push (fora do alcance do PWA).
