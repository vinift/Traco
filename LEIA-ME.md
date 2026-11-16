# Traço Notas: guia de instalação

O Traço é um web app instalável (PWA). Ele roda no Chrome do Xiaomi Pad 7, ganha um ícone na tela inicial, abre em tela cheia e funciona sem internet. As notas ficam salvas no tablet e, se você ligar o backup, uma cópia vai automaticamente para o seu Google Drive.

São três etapas, feitas uma vez só:

1. Publicar os arquivos num endereço https (grátis, pelo GitHub Pages)
2. Criar a chave de acesso ao Google Drive (Google Cloud)
3. Instalar no tablet e conectar o Drive

---

## 1. Publicar no GitHub Pages (≈10 min, pelo computador)

1. Crie uma conta em https://github.com (se ainda não tiver).
2. Clique em **New repository**, dê o nome `traco`, marque **Public** e clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**. Descompacte o `traco-notas.zip` e **arraste o conteúdo da pasta** (index.html, sw.js, manifest.webmanifest e as pastas css, js, vendor e icons) para a página. Clique em **Commit changes**.
4. Vá em **Settings → Pages**. Em *Branch*, escolha `main` e a pasta `/ (root)` e clique em **Save**.
5. Depois de 1–2 minutos, o app estará em `https://SEU-USUARIO.github.io/traco/`.

> O repositório público contém só o código do app. Suas notas e sua chave do Google **não** ficam nele: elas ficam guardadas apenas no tablet.

## 2. Criar a chave do Google Drive (≈10 min)

1. Acesse https://console.cloud.google.com e crie um projeto chamado **Traço**.
2. Em **APIs e serviços → Biblioteca**, procure **Google Drive API** e clique em **Ativar**.
3. Abra **Google Auth Platform** (ou "Tela de permissão OAuth", dependendo da versão do console):
   - **Branding:** nome do app "Traço Notas" e seu e-mail.
   - **Público-alvo (Audience):** tipo **Externo**. Depois clique em **Publicar app** para deixar o status como **Em produção**. Se o app ficar "Em teste", o Google desconecta o backup a cada 7 dias.
   - **Acesso a dados (Data access):** adicione o escopo `.../auth/drive.file`. Ele só dá acesso aos arquivos criados pelo próprio app, nunca ao resto do seu Drive.
4. Em **Clientes (Credenciais) → Criar cliente OAuth**:
   - Tipo: **Aplicativo da Web**
   - **Origens JavaScript autorizadas:** `https://SEU-USUARIO.github.io`
   - **URIs de redirecionamento autorizados:** `https://SEU-USUARIO.github.io/traco/` (com a barra no final)
5. Copie o **ID do cliente** e a **Chave secreta do cliente**.

## 3. Instalar no Xiaomi Pad 7

1. No tablet, abra `https://SEU-USUARIO.github.io/traco/` no **Chrome**.
2. Toque no menu **⋮ → Instalar app** (ou "Adicionar à tela inicial").
3. Abra o Traço pelo ícone, toque em **Configurações** (ícone de controles, no canto superior direito) e cole o **Client ID** e o **Client Secret**.
4. Toque em **Salvar e conectar**, entre na sua conta Google e autorize.
5. Pronto: o indicador ficará verde, com **"Salvo no Drive"**. Os backups vão para a pasta **Traço Notas** no seu Drive.

O Client Secret é opcional, mas recomendado. Sem ele, o Google pede para reconectar a cada hora. Com ele, a conexão fica permanente.

---

## Como usar

| Ação | Como |
|---|---|
| Mover a barra de cores | Segure a alça de três pontinhos no topo da segunda barra e arraste para cima ou para baixo. Toque duas vezes na alça para voltar à posição original |
| Biblioteca | Tudo o que você copia (formas, imagens, tabelas, escrita) fica guardado no botão de biblioteca da barra lateral. Toque para colar; segure para fixar no topo ou remover |
| Modelo Notewise | Notas novas já nascem com a folha 3480 × 4000 e a grade clara do Notewise. Em "Modelo de página" você encontra os modelos do Notewise (Grade, Linha, Ponto, Em branco) e as 6 cores de papel |
| Tela inicial | Pastas coloridas com subpastas. O **+** roxo cria nota, pasta ou importa. Use ↑ Nome para ordenar, o ícone de lista para trocar a visualização e ✓ para selecionar vários itens e mover ou excluir |
| Tabela | Ferramenta de tabela: arraste na página (ou toque) para criar. Selecione-a com o laço: as faixas roxas em cima e à esquerda selecionam colunas e linhas (arraste para pegar várias); toque numa célula e arraste para selecionar células. A barra de células tem cor de fundo, agrupar (mesclar), inserir linha/coluna, igualar tamanhos e excluir |
| Aumentar só uma linha ou coluna | Com a tabela selecionada, arraste a linha divisória. A escrita das células seguintes acompanha. Ao mover ou redimensionar a tabela, a escrita de dentro vai junto |
| Ajustes automáticos | Ao mover ou redimensionar objetos aparece uma linha-guia rosa: gruda nas margens, no centro e na grade da página, em outros objetos, a cada 15° ao girar e em 1:1 ou na proporção original. Cada ajuste liga e desliga em Configurações → Ajustes automáticos |
| Barras mais finas | Configurações → Aparência e barras: Normal, Compacta ou Bem compacta. Vale para todas as barras: topo (nome e botões da nota), ferramentas, cores, espessuras, seleção, texto e rolagem |
| Continuar de onde parou | Cada nota reabre na última página em que você estava |
| Formas padrão | Retângulos, elipses e triângulos quase perfeitos viram quadrado, círculo e triângulo equilátero |
| Drive | Toque no indicador de backup para abrir a pasta da nota no Google Drive |
| Escrever | Caneta (Focus Pen). Com o botão de mão ligado, o dedo também escreve |
| Rolar / zoom | 1 dedo arrasta; pinça com 2 dedos dá zoom |
| Desfazer / refazer | Botões no topo da barra lateral, toque com 2 dedos / 3 dedos, ou um botão da caneta (Configurações → Botões da caneta). Também vale para mudanças no modelo da página |
| Espessura e cor | Na segunda barra, espessuras (com o número) e cores ficam lado a lado. Tocar numa espessura muda só a espessura; numa cor, só a cor. **Arraste** para cima ou para baixo para reordenar. **+** salva a atual; segure um item parado para mostrar o × e remover |
| Grupos de predefinições | Botão com o nome do grupo no topo da segunda barra: troque de grupo, crie um grupo por matéria ou defina o padrão da pasta. Na biblioteca: menu da pasta → Grupo de predefinições |
| Tipo de linha | Ícone de curva na segunda barra (caneta e formas): sólida, pontilhada, traço longo/curto, ponto e traço, mistos |
| Linhas retas | Segure a caneta parada no fim do traço, ou ligue "Sempre fazer linhas retas" no painel da caneta. Linhas grudam a cada 15° (0°, 15°, 30°, 45°…). O marca-texto tem as mesmas opções no painel dele |
| Ajustes da ferramenta | Toque de novo na ferramenta ativa (ou no ícone de ajustes): espessura com − / + de 0,5, pressão, estabilização e mais |
| Rabiscar para apagar | Com a caneta, rabisque em vai-e-volta sobre o que quer apagar: tudo dentro da área some |
| Selecionar | Laço: contorne os itens ou toque em um. Arraste para mover, bolinha do canto para redimensionar e alça de cima para girar, com a caneta ou com o dedo |
| Tipos de caneta | Botão de onda na segunda barra (ou painel da caneta): Esferográfica (padrão, sem pressão), Natural, Caneta-tinteiro, Caligrafia (com ângulo da pena ajustável), Pincel e Marcador fino |
| Laço retangular e print | Na segunda barra do laço: laço livre, retangular ou câmera (print). O print recorta a área como imagem, vai para a Biblioteca (cole em qualquer nota) e pode ser baixado em PNG |
| Bloquear objetos | Selecione e toque no cadeado: o item não move, não é apagado e o laço comum o ignora. Para mexer de novo, ligue o cadeado da segunda barra do laço ("Selecionar objetos bloqueados") e toque em Desbloquear |
| Mover sem ajustes | Enquanto arrasta um objeto, encoste outro dedo na tela: a linha-guia some e o movimento fica livre |
| Barra de espessuras | As espessuras, o tipo de caneta e o tipo de linha ficam numa barra horizontal embaixo; as cores continuam na barra vertical. Arraste a barra de baixo pela alça (⋮) para qualquer lugar; toque duas vezes na alça para ela voltar |
| Selecionar com o dedo | Com qualquer ferramenta, toque com o dedo numa forma, texto, post-it, imagem ou tabela: ela fica selecionada e a caneta continua escrevendo. Toque fora com o dedo para tirar a seleção |
| Editar texto | Toque duas vezes no texto (dedo ou caneta) ou use o botão de texto da barra de seleção |
| Formatação | Ao editar um texto aparece uma barra: fonte, negrito, itálico, sublinhado, tachado, cor, realce, alinhamento, listas (•, ☐ e 1.), tamanho e "alinhar às linhas do modelo". A formatação vale para o trecho selecionado |
| Lista de tarefas | Toque numa caixinha ☐ (dedo ou caneta) para marcar ☑ |
| Alinhar às linhas | Com essa opção, cada linha do texto fica sobre a pauta, a grade ou os pontos da página, e ao mover a caixa ela gruda nas linhas. Pode virar o padrão no painel da ferramenta de texto |
| Conta-gotas | Selecione um traço, forma ou texto e toque no conta-gotas da barra de seleção: a cor, a espessura, o tipo de caneta e a fonte vão para a ferramenta |
| Fontes | Sistema, Inter, Lora, Merriweather, Roboto Mono, Caveat, Patrick Hand, Dancing Script, Great Vibes, Bebas Neue e Playfair Display. Com internet, o app baixa as fontes uma vez e depois elas funcionam offline |
| Estabilização | Painel da caneta ou Configurações → Escrita: quanto maior, mais firme fica a letra |
| Laço que pega pedaços | Basta o laço passar por um pedaço de uma forma, texto, post-it ou marca-texto para selecioná-lo inteiro. A escrita da caneta continua precisando ficar (quase toda) dentro. Tabelas e imagens são selecionadas quando o laço pega a borda delas, então dá para selecionar a escrita dentro de uma tabela sem levar a tabela junto |
| Espessuras | De 0,1 a 20 (marca-texto de 1 a 60), com − / + de 0,1 no painel da ferramenta |
| Editar barras | O lápis no fim da barra de cores e da barra de espessuras liga o modo de edição: toque no × para remover e no ✓ para concluir |
| Seletor de cores | O + da barra de cores abre abas Paleta, Espectro e Roda, com código hex, conta-gotas (toque na página para copiar uma cor), opacidade, cores recentes e paletas prontas (com o botão "+ barra" para adicionar todas) |
| Excluir pasta | Pergunta se você quer excluir tudo (notas e subpastas de dentro) ou só a pasta (o conteúdo vai para a pasta de cima) |
| Post-it | Ferramenta de nota adesiva: toque na página, escreva e mude a cor na segunda barra |
| Nova página puxando | No fim da última página, continue arrastando para cima com o dedo (ou rolando o mouse): aparece "Puxe para adicionar uma página". Quando mudar para "Solte…", solte e a página nova é criada com o mesmo modelo |
| Rolar rápido | Barra na direita da nota: arraste para ir direto a qualquer página (o número da página aparece ao lado) ou, logo depois de rolar, toque no trilho para pular. A barra é precisa, sem inércia |
| Inércia | Ao rolar com o dedo e soltar rápido, a nota continua deslizando e desacelera. Um toque para na hora |
| Zoom rápido | Toque duplo com o dedo numa área vazia: alterna entre "ajustar à largura" e o zoom anterior (ou 2×). No indicador de zoom: ajustar à largura, página inteira e de 50% a 800% |
| Lixeira | Notas e pastas excluídas vão para a Lixeira (menu lateral da tela inicial) e podem ser restauradas por 30 dias; depois são apagadas de vez. "Esvaziar lixeira" apaga tudo na hora |
| Páginas | Botão de grade no canto superior esquerdo: abrir, selecionar várias, duplicar, excluir, marcar, e segurar e arrastar para reordenar |
| Marcadores | Botão de marcador no canto superior direito marca a página atual; na caixa de páginas, filtre por "Marcadores" |
| Modo leitura | Botão de olho: a caneta só rola a página, sem riscar |
| Busca | Lupa na nota busca nos textos digitados e post-its; a busca da biblioteca também procura dentro das notas |
| Carimbo de data | Ferramenta 📅: toque na página. No painel de ajustes você muda o texto, ex.: `Aula dia {dd}/{mm}` |
| Baixa latência | Configurações → Escrita. Deixa a tinta mais rápida; se notar algo estranho, desligue |

## Desempenho em notas grandes (v0.9.4)

A página é desenhada em blocos de 512 px que ficam guardados na memória. Ao rolar, o app só copia os blocos prontos em vez de redesenhar todos os traços, e por isso fica fluido mesmo em notas com muito material. No zoom, os blocos do nível anterior são esticados por um instante e, cerca de 0,2 s depois de soltar os dedos, são redesenhados na resolução exata. A qualidade final é idêntica à de antes (conferido pixel a pixel). Ao editar, só o trecho alterado é redesenhado.

## PDF em alta qualidade

O PDF de cada nota (no Drive e em Exportar) sai em 300 dpi. Páginas que vieram de um PDF mantêm o PDF original (texto nítido e selecionável) com as suas anotações por cima. Os prints do laço também saem em alta resolução (até 4096 px no lado maior).

## Organização no Google Drive

```
Traço Notas/
  Direito Civil/                    ← cada pasta do app
    Aula 1 — Contratos/             ← cada nota tem a própria pasta
      Aula 1 — Contratos.pdf        ← para ler no Drive ou no celular
      Aula 1 — Contratos.traco      ← arquivo editável (usado pelo app)
  _arquivos do app (não mexer)/     ← imagens, PDFs importados e índice
```

## Leitura da escrita à mão (OCR)

- **Busca:** alguns segundos depois de você parar de escrever, o app lê a escrita da página (precisa de internet). A lupa da nota e a busca da biblioteca passam a achar palavras escritas à mão (marcadas com ✍).
- **Converter ou copiar:** selecione a escrita com o laço e toque no botão de reconhecer texto. Você pode corrigir o texto antes de copiar ou de transformá-lo em caixa de texto.
- **Endireitar:** com a escrita selecionada, o botão de alinhar deixa cada linha reta na horizontal.
- **Notas antigas:** em Configurações → Leitura da escrita à mão → "Ler todas as notas agora".
- **Privacidade:** os traços são enviados ao serviço de reconhecimento de escrita do Google (gratuito, não oficial).

## Importar do Notewise

1. No Notewise, exporte uma nota (arquivo `.notewise`) ou várias notas e pastas de uma vez (arquivo `.zip`).
2. No Traço, toque em **Importar → Notas do Notewise** e escolha o arquivo.
3. Tudo vira item editável no Traço: PDFs anotados (com o PDF original de fundo), traços, marca-texto, formas (retângulo, elipse, triângulo, linha, seta e arco, com tipo de linha e preenchimento), imagens, caixas de texto, tabelas (com larguras, alturas e células mescladas), comentários (viram post-its) e itens bloqueados. As pastas do ZIP viram pastas no Traço.

### Modelos do Notewise

A importação reproduz a grade de cada página do Notewise: o tamanho do quadradinho vem da densidade (6 = maior, 7 = médio, 8 = menor) e a grade fica centralizada na folha, como no Notewise. Páginas redimensionadas no Notewise são ajustadas pela própria escrita: o app mede onde a base das letras está e encaixa a grade nela.

Para trocar à mão, use **Modelo de página → Grade · densidade 6** ou **Grade · densidade 7**. Também dá para usar **Importar de um PDF…** com o PDF de uma página vazia (vale para páginas do mesmo tamanho do PDF).

Dica: arquivos grandes (centenas de MB) podem levar um ou dois minutos. Se o Google Drive estiver ligado, os PDFs também vão para o backup, então a primeira sincronização demora mais.

## Ferramentas próprias (plugins)

Em **Configurações → Ferramentas próprias**, você cria ferramentas em JavaScript que aparecem na barra do editor. Dois exemplos já vêm instalados: **Carimbo de data** e **Ponteiro laser**. O botão **Como criar (API)** mostra tudo o que um plugin pode fazer: adicionar traços, formas e textos, desenhar prévias e guardar dados.

## Atualizar o app

Para mudar o código, substitua os arquivos no repositório do GitHub. O tablet baixa a nova versão na próxima vez que o app for aberto com internet. Suas notas não são afetadas.

Para não esperar, toque em **Verificar atualização** (ao lado do número da versão, embaixo da barra lateral da tela inicial): o app confere o GitHub, salva a nota aberta e reinicia já na versão nova.

## Novidades da v0.21.0

- **Cronômetro de estudo:** toque no horário, no topo da nota, para abrir o painel. Três modos:
  - **Cronômetro** — conta para cima (Iniciar, Pausar, Continuar, Zerar).
  - **Temporizador** — contagem regressiva com atalhos (5 a 90 min) ou o tempo que você digitar; avisa com som, vibração e mensagem quando acaba.
  - **Pomodoro** — foco e pausa automáticos (padrão 25/5, pausa longa de 15 a cada 4 focos, tudo ajustável). A pausa começa sozinha; o próximo foco espera você tocar em Iniciar. Dá para pular a fase.
  - Enquanto está ligado, o tempo aparece no topo ao lado do horário e da bateria (verde nas pausas, piscando quando pausado) e também na tela inicial, ao lado do backup. Com o tablet em pé, onde o título some, o tempo continua aparecendo.
  - **Histórico:** o tempo de estudo é somado por dia e pela nota que estava aberta (as pausas do Pomodoro não contam). O painel mostra o total de hoje, dos últimos 7 dias (com barrinhas por dia) e as notas em que você mais estudou na semana.
  - O tempo continua certo com o app em segundo plano ou fechado. Se um temporizador acabar com o app fechado, o aviso aparece quando você voltar (com o horário em que acabou).
- **Três toques com a caneta, de novo:** se o laço já estiver ativo, os três toques voltam para a caneta (com o tipo, a cor e a espessura de antes).

## Novidades da v0.20.0

- **Grade não engrossa mais ao tirar o zoom:** as linhas (e os pontos) afinam junto com a folha até o mínimo de 1 pixel da tela do tablet; daí para baixo ficam mais claras, em vez de grossas. Antes o mínimo era ~3 pixels no Pad 7, e a grade parecia mais pesada afastando.
- **Três toques rápidos com a caneta = laço:** com qualquer ferramenta, toque três vezes rápido no mesmo lugar com a caneta e o app muda para o laço. O que os toques criariam (pontinhos, borrachadas, seleção, caixa de texto) é descartado e não fica no desfazer. Dá para desligar em Configurações → Escrita e caneta.
- **Mais espaço dos lados com zoom:** com a folha maior que a tela, dá para arrastar além da borda da página (até cerca de 1/3 da tela), para escrever confortável perto das margens. A folga cresce aos poucos com o zoom, sem pulos.

## Novidades da v0.19.1

- **Grade da tela infinita corrigida:** acima e à esquerda do ponto inicial, alguns pedaços ficavam só com linhas ou só com colunas (e o canto, vazio). Agora a grade, as linhas e os pontos continuam em todas as direções, sem falhas nas emendas.

## Novidades da v0.19.0

- **Recorte direto na página:** laço → selecione a imagem → botão de recorte. A imagem inteira aparece apagadinha no próprio lugar, com a moldura do recorte e 8 alças. Arraste as alças com a caneta ou o dedo; arraste o meio para mover a moldura; toque na parte apagada para desenhar outra moldura. Proporções Livre, Original, 1:1, 4:3, 3:4 e 16:9 na barrinha, além de ↻ (restaurar a imagem inteira), ✕ (cancelar) e ✓ (aplicar). Também aplica com Enter, tocando fora da imagem ou trocando de ferramenta; Esc ou desfazer cancela. Fora da imagem o dedo continua rolando e dando zoom. Funciona com imagens giradas.
- **Bateria do tablet** ao lado do horário e do nome da nota (com raio quando está carregando e em vermelho abaixo de 15%).
- **Barra de horário/bateria do Android:** as barras do app não descem mais quando a barra do sistema aparece por cima (as margens da "área segura" ficam congeladas; só mudam quando a tela gira). A cor da barra do sistema agora acompanha a tela atual (fundo da mesa na nota, fundo da biblioteca no início), em vez de uma cor fixa.
- **Desfazer/refazer páginas:** adicionar, excluir, duplicar, mudar a ordem (arrastar ou "Mover para o início/fim") e inserir PDF agora entram no Desfazer/Refazer (botões, 2/3 dedos ou atalhos da caneta). Excluir páginas não apaga mais o histórico de desfazer.

## Novidades da v0.18.0

- **Recortar imagem:** selecione a imagem com o laço → botão de recorte na barra da seleção. Arraste cantos/lados da moldura (ou o meio para mover; toque fora para desenhar outra), com proporções Livre, Original, 1:1, 4:3, 3:4 e 16:9. O recorte não apaga nada da imagem: dá para refazer ou "Restaurar original" depois, e o desfazer funciona. Funciona também com imagens giradas.
- **Importação do Notewise respeita o recorte:** imagens recortadas no Notewise chegam recortadas, no tamanho e lugar certos.
- **Corrigir notas já importadas:** Biblioteca → Importar → "Corrigir imagens recortadas". Escolha o mesmo .notewise/.zip que você importou: o Traço acha as notas pelo título e aplica só o recorte (não duplica notas, não mexe na escrita). Imagens que você já moveu ou redimensionou ficam como estão — essas você recorta à mão.

## Novidades da v0.17.0

- **Organizar grupos de cores:** menu do grupo → "Organizar grupos e subgrupos…". Para cada grupo: renomear, subir/descer, escolher "Dentro de…" (vira subgrupo de outro ou volta ao nível principal) e excluir — sem precisar ativar o grupo.
- **A barra de horário do Android não bagunça mais o layout:** encolhidas pequenas e passageiras da tela (puxar a barra de horário/bateria) são ignoradas — o app não redimensiona nem redesenha. Teclado e giro da tela continuam ajustando normalmente.
- **Relógio** discreto ao lado do nome da nota, no topo.

## Novidades da v0.16.0

- **Cores e espessuras não se movem mais sem querer:** para reordenar, segure ~0,5 s (o item "levanta") e então arraste. Arrastar direto não faz nada; segurar parado por mais tempo mostra o × para remover.
- **Conta-gotas corrigido** (não funcionava desde a v0.13 em nenhuma nota): agora lê a cor exata do traço tocado.
- **Pingos do i e dois-pontos de volta:** os pontinhos (traços com todos os pontos no mesmo lugar) não estavam sendo desenhados desde a otimização da v0.10. Só numa nota de teste eram 582 pontinhos — todos aparecem de novo.
- **Subgrupos de cores:** no menu do grupo (chip no topo da barra de cores) há "Novo subgrupo dentro de…" e "Tirar de dentro do grupo". O menu mostra a hierarquia (ex.: Direito › Constitucional, Penal). Ao excluir um grupo, os subgrupos sobem um nível.

## Novidades da v0.15.1

- Corrigido: ao sair da tela cheia, a barra de horário/bateria do Android aparecia e desalinhava o app. No app instalado a tela cheia agora só esconde as barras do próprio app (a do sistema continua escondida).

## Novidades da v0.15.0

- **Tela cheia** (botão ⛶): esconde só as barras do topo — ferramentas, cores e espessuras continuam. Para sair, toque no botão discreto (meio transparente) no canto superior direito.
- **Escrevendo com a caneta**, as barras do topo também somem e voltam ~2,5 s depois de parar. O dedo não esconde nada.
- **Baixa latência sem piscar:** antes a tela inteira ficava no modo "rápido" e piscava ao rolar/dar zoom. Agora só a tinta vai para uma tela rápida, e apenas enquanto a caneta escreve; ao soltar, o traço passa para a página e a tela rápida some. Rolar e dar zoom usam sempre o modo fluido normal.

## Novidades da v0.14.0

| Item | Como funciona |
|---|---|
| Tamanho das barras | Configurações → Aparência e barras: além de Normal/Compacta/Bem compacta, um controle de 55% a 130% |
| Texto com o dedo | Com a ferramenta Texto (ou Post-it), tocar num espaço vazio — com o dedo ou a caneta — cria uma caixa. Em qualquer ferramenta, tocar num texto com o dedo **seleciona**; tocar de novo **edita** |
| Editar ↔ selecionar | Na barra de edição de texto, o botão de retângulo pontilhado vira "seleção da caixa" (mover/redimensionar); na seleção, o botão T volta a editar |
| Marca-texto reto | "Sempre reto", "segurar para ficar reto" e o marca-texto no PDF agora têm pontas redondas, como o traço normal |
| Tela cheia | Botão ⛶ no topo: esconde todas as barras. Toque com o dedo num espaço vazio para mostrá-las por 4 s |
| Barras somem ao escrever | Enquanto a caneta escreve, as barras somem e voltam 1,5 s depois (pode desligar em Aparência e barras) |
| Nome da nota | Agora fica no centro do topo, discreto; toque para renomear |
| Voltar dentro de pastas | Corrigido: o Android às vezes "pulava" o voltar e saía do app. Agora dá para voltar várias telas seguidas; na tela inicial, "volte de novo para sair" |

## Novidades da v0.13.0 — rolagem e zoom pela placa de vídeo

- **Rolar e dar zoom não redesenham mais nada:** os pedaços prontos da página ficam na tela e só a "folha" inteira é movida/ampliada pela placa de vídeo (como num app nativo). O trabalho do app por quadro caiu de ~12 ms para ~1 ms ao rolar, deixando o tablet livre para acompanhar o dedo (inclusive em telas de 120/144 Hz).
- Na pinça, a página amplia na hora; a versão nítida aparece logo depois de soltar, começando pelo centro. A qualidade final é idêntica (conferido pixel a pixel).
- A inércia desenha no mesmo quadro (sem um quadro de atraso).
- **Trava de rolagem mais leve:** só segura na vertical quando o gesto começa quase reto (até ~22°) e solta assim que o dedo vai para o lado (~30 px).
- Se o modo de baixa latência estiver ligado, o app usa o desenho antigo (ele precisa da tela desenhada de uma vez).

## Novidades da v0.12.0 — backup em segundo plano

Ao sair do app, ele começa a enviar o backup na hora e também pede ao Android para **terminar o envio em segundo plano** (recurso "Background Sync" do Chrome). Se o app for pausado ou fechado no meio, o service worker (a parte do app que roda sem tela) continua enviando quando houver internet.

- Vai em segundo plano: notas, imagens e PDFs anexados, pastas, exclusões e a lista da biblioteca.
- Fica para quando o app estiver aberto: o **PDF gerado** de cada nota (desenhar as páginas precisa da tela).
- O app e o segundo plano nunca enviam ao mesmo tempo (trava compartilhada), e nada é enviado duas vezes.
- Ao voltar para o app, aparece "Backup concluído em segundo plano ✓" quando foi o caso.
- O login do Google agora fica guardado por até 1 hora: reabrir o app não pede para conectar de novo nesse tempo.
- Quem decide quando roda é o Android (normalmente assim que há internet). Com economia de bateria muito agressiva, pode atrasar — se acontecer, em Configurações do Android → Apps → Traço Notas (ou Chrome) → Bateria, escolha "Sem restrições".

## Novidades da v0.11.0

| Item | Como usar |
|---|---|
| Alternar rapidamente | Botão de camadas no topo do editor: notas **Fixadas** (arraste ⋮⋮ para reordenar) e **Recentes**. Fixe pelo ⋯ do painel ou pelo menu da nota na biblioteca |
| Volta onde parou | Se o Android fechar o app em segundo plano, ao abrir de novo ele volta para a nota (e a tela dividida) em que você estava |
| Tela dividida | Botão de painel lateral no topo: escolha outra nota (ou a mesma) para ler ao lado. Arraste a borda para mudar a largura, pinça ou −/+ para ampliar, ↻ troca os lados |
| Sumário | Botão de lista no topo: marcadores com nome (ex.: "Art. 5º") e o índice do PDF, quando o PDF tiver |
| Marca-texto no PDF | Em páginas de PDF a marcação vira uma faixa reta exatamente sobre a linha do texto (pode desligar no painel do marca-texto) |
| Busca com destaque | O trecho encontrado pisca em amarelo — em textos e também na escrita à mão |
| Laço: espessura | Selecione traços/formas → botão de linha → escolha a espessura, ou "Mais fino/Mais grosso" |
| Número da página | Não encosta mais no zoom com 2 ou 3 algarismos |

A escrita à mão já lida antes é relida aos poucos (com internet) para a busca saber a posição de cada linha.

## Novidades da v0.10.1

- **PDF das notas de PDF sem estourar a memória:** a escrita por cima de cada página era guardada como uma imagem da página inteira, descompactada até o fim. Agora vai só o retângulo onde há escrita, já compactado na hora. Memória para gerar o PDF de "01 Informática": 527 MB → 106 MB; "00 Informática": 804 MB → 103 MB. Ficou também mais rápido (14 s → 8 s). O PDF automático dessas notas foi religado.
- **Envio para o Drive resistente a queda de internet:** arquivos grandes sobem em pedaços de 4 MB; se a conexão cair no meio, continua de onde parou (era o erro "Failed to fetch"). Pedidos que falham por rede são repetidos até 3 vezes.

## Novidades da v0.10.0 — otimização pesada

Medido com as suas notas do PF.zip (Informática: 31 páginas, 36 mil traços):

| | Antes | Agora |
|---|---|---|
| Memória depois de rolar a nota inteira | ~1,8 GB | ~0,8 GB |
| Preparar os traços de uma página cheia | 511 ms | 10 ms |
| Abrir a nota | 600 ms | ~100 ms |
| Salvar depois de um traço | 60 ms | ~33 ms |
| Travadinhas com o app parado (prepara o entorno) | até 600 ms | ≤ 120 ms |

- **Traços de espessura constante** (esferográfica e tudo que veio do Notewise) agora são desenhados como uma linha com pontas redondas — o mesmo formato de antes (diferença em 0,2% dos pixels da borda), 50× mais rápido e com muito menos memória.
- **Pontos dos traços em formato compacto** (metade da memória; abrir e salvar mais rápido). As notas antigas são convertidas aos poucos, sem travar.
- **Memória com teto:** os caminhos de desenho ficam só os usados por último; o PDF de fundo é desenhado uma página por vez, só as que estão na tela (rolar rápido num PDF de 200 páginas abria dezenas de desenhos ao mesmo tempo).
- **Miniaturas em pedaços:** a imagem de fundo usada no zoom é montada aos poucos, sem segurar a tela.

## Novidades da v0.9.9

- **Achado o que derrubava o app no backup:** o PDF das notas que vieram de PDF (aulas, apostilas) era montado copiando as fontes e imagens do original de novo em cada página. Um PDF de 4 MB virava 400–900 MB e estourava a memória ("Ah, não!"). Agora as páginas são copiadas juntas e o PDF sai do tamanho do original (ex.: 00 Informática, 229 páginas: 15 MB). As anotações continuam por cima, no lugar certo.
- **Progresso por nota:** o ícone da nuvem mostra qual nota está sendo enviada e a % dela (ex.: `3/12 · PDF "00 Informática" 45%`).
- **Zoom mais limpo:** a imagem provisória durante a pinça ficou mais nítida e a grade não engrossa; depois de soltar, a versão final aparece mais rápido, começando pelo centro da tela.

## Novidades da v0.9.8

- **Grade nítida ao afastar o zoom:** as linhas do modelo ficam encaixadas nos pixels da tela, com espessura inteira, sem borrão.
- **Segurar o dedo não abre mais o menu do navegador** (copiar, salvar imagem, selecionar). Em campos de texto, copiar e colar continuam funcionando.
- **Backup sem derrubar o app:** o PDF automático do Drive agora sai em 200 dpi (dá para escolher 150 ou 300 em Configurações → Google Drive). Se o app fechar enquanto gera o PDF de uma nota, na próxima vez ele tenta em 120 dpi; se fechar de novo, o PDF automático daquela nota é desligado e o app avisa. O registro fica em Configurações → Diagnóstico.

## Novidades da v0.9.7

- **Salvar ficou muito mais leve.** Antes, a cada traço o app regravava a nota inteira; numa nota grande (Informática: 36 mil traços, 59 MB) isso levava 2 a 4 segundos e travava a escrita. Agora cada página é guardada separada e só a página mexida é gravada (≈60 ms). Na primeira abertura, cada nota antiga é convertida sozinha.
- **O backup espera você escrever.** Enquanto você escreve (e até 25 s depois), nada é enviado. O PDF da nota só é gerado com a nota fechada ou depois de 3 min parado — e se você voltar a escrever no meio, ele para e tenta depois. Ao sair do app, as notas são salvas no Drive na hora (o PDF continua esperando).
- **Arquivos do Drive 4× menores.** O arquivo .traco agora vai compactado (59 MB → 14,5 MB) e é montado aos poucos, sem travar a tela. A restauração aceita os dois formatos.

## Novidades da v0.9.6

A pinça agora só amplia a folha. Antes, se a pinça começava em cima de uma barra ou da biblioteca, o navegador ampliava a tela inteira, e as barras saíam da tela e pareciam sumir. Se o Chrome estiver com "Forçar ativação do zoom" ligado (Acessibilidade), o app avisa e libera a pinça na folha para você afastar e voltar ao normal.

## Novidades da v0.9.5

| Item | Como funciona |
|---|---|
| Botão voltar do tablet | Fecha o que estiver por cima (menu, janela, painel, seleção), depois sai da nota, sobe uma pasta e, na tela inicial, pede "volte de novo para sair" |
| Progresso do backup | O ícone da nuvem mostra "Enviando 3 de 12" com a porcentagem e uma barrinha |
| Zoom mínimo e máximo | Configurações → Zoom (de 10% a 2000%) |
| Estabilização por caneta | No painel de cada caneta, de 0 a 10. A esferográfica vem em 8. Do 6 para cima a ponta "puxa o traço por uma cordinha", tirando o tremido fino |
| Rabiscar para apagar | Basta ir e voltar 4 vezes (antes eram 5 e mais longas) |
| Grade ao afastar | A grade mantém a espessura mínima de 1 px; muito longe vira um tom suave em vez de sumir |
| Rolagem para cima | Para logo acima da primeira página |
| Diagnóstico | Configurações → Diagnóstico: guarda os erros. Se travar ou as barras sumirem, toque em "Copiar relatório" e mande para o Claude |
| Memória | O app usa bem menos memória de desenho (blocos, PDF e imagens são liberados ao sair da nota), o que evita a tela "quebrar" no Android |

## Segurança das notas

- As notas ficam no armazenamento do Chrome do tablet. **Não limpe os dados do site** sem um backup.
- Além do Drive, existe **Configurações → Cópia local → Exportar tudo**, que gera um arquivo único com todas as notas, imagens e PDFs.
- No Drive, cada nota é um arquivo `nota-….json`. O Drive guarda o histórico de versões de cada arquivo (botão direito → Gerenciar versões).
