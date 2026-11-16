# Traço Notas — contexto para o Claude Code

App de notas manuscritas estilo Notewise, feito para o **Xiaomi Pad 7** (caneta + dedo). É um PWA publicado no GitHub Pages a partir deste repositório (`vinift/Traco`, branch `main`) e instalado no tablet como TWA (PWABuilder). Backup e sincronização no Google Drive.

## Como trabalhar com o Vinicius

- **Responda sempre em português (pt-BR).**
- Pergunte antes de decisões de produto/UX que tenham mais de um caminho razoável; sugira melhorias no fim de cada rodada.
- Use `vinift` em URLs de exemplo (github.com/vinift, vinift.github.io).
- Cada rodada = **uma versão nova** (ex.: 0.18.0 → 0.19.0), com as novidades registradas no `LEIA-ME.md`.
- Publicar = commit na `main` (o GitHub Pages atualiza em ~1 min). No tablet o usuário usa "Verificar atualização" na tela inicial.
- **Autorização permanente:** o Vinicius autorizou publicar toda versão/patch direto na `main` (sem perguntar antes), além do branch de trabalho da sessão.
- Nunca apague arquivos que só existem no repositório (ex.: `.well-known/assetlinks.json` do TWA, se existir).

## Lançar uma versão (checklist)

1. Trocar a versão em **três** lugares: `js/app.js` (`version: 'x.y.z'`), `sw.js` (`const VERSION = 'traco-vx.y.z'`) e todos os `?v=x.y.z` do `index.html` (cache busting).
2. Arquivo JS novo → incluir no `index.html` **e** na lista `FILES` do `sw.js`.
3. `node --check` em todos os `js/*.js` e no `sw.js`.
4. Seção "## Novidades da vX.Y.Z" no topo das novidades do `LEIA-ME.md` (acima da anterior).
5. Commit com a versão no título (ex.: `v0.19.0: recorte direto na página`).

## Arquitetura (JS puro, sem build)

- Scripts clássicos que compartilham globais, carregados nesta ordem: util, store, geom, render, pdf, tpl-import, drive, editor, toolbar, tables, tiles, navigation, richtext, crop, colorpicker, ui, ocr, beautify, import-notewise, library, plugins, workspace, timer, app.
- `const Editor`, `const UI` etc. **não** ficam em `window`: use `typeof Editor !== 'undefined'`.
- Comentários: prefira `/* */` em linhas longas — um `//` já engoliu código mais de uma vez.
- `vendor/`: pdf.js (`pdf.min.mjs` + worker) e `pdf-lib.min.js`.

### Arquivos principais
- `js/store.js` — IndexedDB `traco-notas` v2 (stores `notes`, `blobs`, `meta`, `pages`). Notas "split": metadados em `notes`, elementos de cada página em `pages` com chave `noteId/pageId`. `Store._sigs` (WeakMap) guarda a assinatura por página para só regravar páginas alteradas. Pontos dos traços em `Float32Array` (`toPts32` / `ptsJSON`). `Store.heads` = índice leve das notas.
- `js/render.js` — `drawElement` (todo desenho de elemento passa por aqui: tela, miniaturas, PNG e PDF), `drawPageContent`, `ImgCache`, `crispLine`.
- `js/tiles.js` — compositor DOM: `.world` (translate3d) → `.w-frames` (scale z) → `.w-lvl` com tiles canvas de 512 px (`.wt`). `cMain` é overlay transparente (seleção, destaques). Caminho legado quando `noTiles`. `cInk` = canvas `desynchronized` só durante traço de baixa latência.
- `js/editor.js` — ferramentas, seleção (`Editor.sel = {pageId, ids:Set}`), desfazer: `recReplace(page, old, novo)` + `opCommit()`. o recorte de imagem fica em `js/crop.js`.
- `js/geom.js` — caixas (`rawBox`, `rotPt`, `rawCenter`), `PathLRU`, `penStrokePath` (pontos de comprimento zero recebem deslocamento de 0,01 para não sumirem), estabilização (`stabLevel`), `isScribble`.
- `js/toolbar.js` — barras, grupos/subgrupos de cores (`groupTree`, `groupManager`), barra da seleção (`buildSelBar`).
- `js/navigation.js` — rolagem/inércia/zoom, `Nav` (botão voltar do Android com 3 entradas de reserva no histórico empilhadas só em pointerup/keydown, porque o Chrome pula entradas criadas sem gesto do usuário), `StableVH` (`--appH`, ignora encolhidas pequenas da barra de status), `NoteClock`.
- `js/workspace.js` — troca rápida, tela dividida, sumário, texto do PDF, modo foco/tela cheia (Fullscreen API só em display-mode browser).
- `js/drive.js` — sincronização com lock (`navigator.locks` 'traco-drive'), upload resumível em partes, arquivos `.traco` em gzip, progresso por nota, migalhas de travamento ('traco-heavy'). `js/bg-sync.js` roda no service worker (Background Sync) importando util/store/drive com shims de `window`/`document`.
- `js/pdf.js` — `PdfCache` com fila de renderização; exportação PDF com pdf-lib (`copyPages` + anotações em PNG recortadas pela área da tinta).
- `js/import-notewise.js` — importador do Notewise (ver abaixo).

## Formato do Notewise (descoberto por engenharia reversa)

`.notewise` = ZIP com `note`, `page/<id>`, `image/<id>`, `pdf/<id>`; `note` e `page` são protobuf em base64. Página 3480×4000 un. (300 dpi) → 1000 px de largura no Traço.
Elemento da página (campo 4): 3 = matriz, 4 = traço, 5 = marca-texto, 6 = forma, 7 = imagem, 8 = texto, 11 = tabela, 14 = comentário.
Imagem (campo 7): 1 = id, 2 = retângulo da imagem inteira {1:x1,2:y1,3:x2,4:y2}, **4 = recorte visível** (mesmo referencial), 7 = {1: cor, 2: largura} (provável moldura), 9 = int (0/8/25/30, provável raio do canto), 10 = opacidade, 6/8 = ints desconhecidos, 3 = bytes (raro, desconhecido).
Imagem no Traço: `{type:'image', x, y, w, h, blobId, rot?, crop?: {x,y,w,h}}` — `crop` em frações da imagem original; `x/y/w/h` é a caixa visível.

## Testes

Não há suíte no repositório: os testes eram scripts Playwright avulsos. Para testar: `python3 -m http.server 8765` na raiz e um script Playwright que abre `http://localhost:8765/`, chama as funções globais (`importNotewiseFile`, `App.openNote`, `Editor.*`, `UI.*`) e tira prints. Arquivos `.notewise` de exemplo **não** estão no repositório — peça ao usuário se precisar.

## Histórico recente

- v0.18.0 — recorte de imagem (laço → Recortar imagem), importação do Notewise respeitando o recorte, "Corrigir imagens recortadas" na Biblioteca → Importar.
- v0.19.0 — recorte direto na página (`js/crop.js`: `Editor.crop`, `cropSel/applyCrop/cancelCrop`, ações `crop`/`cropout`; a janela `cropDialog` saiu), bateria ao lado do relógio (`NoteClock.battery`), `SafeArea` (margens `--sat/--sar/--sab/--sal` congeladas no lugar de `env(safe-area-inset-*)` no CSS) e `SystemBar` (theme-color segue a tela), desfazer de páginas (`Editor.recPages(fn)` → mudança `{k:'pages', a, b}` no histórico).
- v0.19.1 — grade da tela infinita: `first()` em `drawTemplate` só limita a 0 quando a folha tem borda (`bounded`); folga de meia linha nas emendas dos blocos.
- v0.20.0 — grade: espessura mínima de 1 pixel do aparelho (`z*dpr`) e esmaecimento abaixo disso em `drawTemplate`; triplo toque da caneta → laço (`initPenTriple`/`penTripleFire` em `js/crop.js`, ouvintes em captura no `#stage`; desfaz as operações com `op.t >= início`, configuração `penTriple`); folga lateral com zoom em `clampCam` (`60/z + até 35% da largura visível`).
- v0.21.0 — `js/timer.js` (`StudyTimer`): cronômetro/temporizador/Pomodoro baseado em `Date.now()` (estado em meta 'studyTimer'), histórico em meta 'studyLog' `{days:{'AAAA-MM-DD':{noteId|'_':ms}}, titles}` gravado por trechos (`boundary`: troca de nota, pausa, fim de fase e a cada minuto); exibido em `#noteTimer` (topo) e `#libTimer` (biblioteca), painel via `openPop`. Triplo toque com o laço ativo volta para a caneta.
- v0.22.0 — histórico do `StudyTimer` só com o app visível (`segAway`); `#noteClock/#noteBat/#noteTimer` maiores; `contextmenu`/`selectstart` bloqueados em tudo, exceto campo que já tinha foco antes do toque (`navigation.js`); `selWidthPop` usa `UI.widthList`; segurar o dedo com o laço → `lassoHoldPaste` (em `crop.js`) + `Editor.pasteAt`; alças de seleção `selHandles` (cantos proporcionais ancorados no oposto, lados esticam; `action.hh`); estabilização mais leve (corda só nos níveis 9–10, `smoothStroke` com no máx. 2 passadas); `paintOnTile` (itens só acrescentados no fim são pintados sobre os blocos, sem marcar `stale`); `pointerrawupdate` para a caneta (`onRaw`, `action.raw2`); tela rápida preparada em ocioso (`inkPrepLater`/`inkKey`/`inkPaint`).
- v0.23.0 — piscada ao parar de escrever: `_liveClear`/`_inkHide` só limpam a prévia quando `allDone` (ou após 600 ms); ±0,1 em `selWidthPop` (`nudge`); `.note-timer` com fundo cheio e visível em `.writing/.immersive`; toque DUPLO da caneta com ação configurável (`penDoubleAction()`/`PEN_DOUBLE_ACTIONS` em `crop.js`, `S.penDouble`, linha na `penMapSection`; NEAR 26 px); `S.hand` ('right'|'left'|'none') filtra toques de 2/3 dedos por metade da tela em `endGesture` (`g.minX/maxX`); `js/beautify.js`: `smoothArc` (reamostra por distância, cantos > 62° preservados, gaussiana com pontas fixas), `S.autoBeautify` 0–10 (sigma = 0,25·nível px de tela) aplicado em `endDraw` para a caneta, `beautifySelection()` (endireita, alisa, iguala tamanho/altura das palavras via percentis 15–85% de y).
- v0.23.1 — zoom sem sumir: `_fbLvl` só recebe nível completo (`_curDone`); `keepVisible` marca blocos da reserva/miniatura visíveis como usados (não são despejados); `attachPreview` mantém a miniatura velha até a nova; acréscimos pintados também na miniatura (`paintOnPreview`, `pjob` continua); `previewStep` durante gesto para páginas visíveis sem miniatura (4 ms/quadro); prefetch de miniaturas ±4 páginas; `previewMax` 18 com 8 GB. Testes: rode os scripts Playwright com o cwd no scratchpad (prints salvos na raiz do repo já foram parar num commit).
- Ideias sugeridas e ainda não feitas: importar moldura/cantos arredondados das imagens do Notewise (campos 7 e 9).
