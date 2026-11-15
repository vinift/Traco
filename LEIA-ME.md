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
