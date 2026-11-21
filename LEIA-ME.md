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

## Novidades da v0.50.1

- **Meta de sábado e de domingo separadas:** no relatório (Visão geral), embaixo do gráfico, agora há "Meta seg–sex", "Sábado" e "Domingo". Vazio = igual à de segunda a sexta; 0 = descanso (não quebra a sequência). Quem já tinha a meta de fim de semana continua com ela nos dois dias.
- **Sem piscar a tela inicial:** ao abrir o relatório, as Configurações ou o caderno de caligrafia, e ao trocar de aba/período neles, a tela inicial ficava aparecendo por um instante. Agora ela fica escondida enquanto essas páginas estão abertas.

## Novidades da v0.50.0

- **Meta diferente no fim de semana:** no relatório (Visão geral, embaixo do gráfico) agora há **"Meta seg–sex"** e **"Sáb e dom"**. Deixe "Sáb e dom" vazio para usar a mesma meta, ou ponha **0** para o fim de semana ser descanso.
  - A sequência, os "dias na meta", o calendário, o painel do cronômetro e o cartão da tela inicial usam a meta de cada dia.
  - No gráfico, a linha tracejada é a meta de seg–sex; sábado e domingo ganham um tracinho com a meta deles.
- **Dia de pausa (feriado, viagem…):** marque um dia como pausa e ele **não quebra a sequência** (se estudar nele, conta).
  - Para hoje: no painel do cronômetro, "⏸ Marcar hoje como dia de pausa".
  - Para qualquer dia (inclusive futuro): no relatório → Dia (ou toque no dia no Calendário) → "⏸ Marcar como dia de pausa". No calendário o dia aparece riscado com ⏸.

## Novidades da v0.49.0

- **Selecionar palavras com o dedo (com a caneta ativa):** segure o dedo parado **0,4 s** em cima de uma palavra escrita. Ela é selecionada e o tablet vibra de leve. Sem soltar, **arraste por cima** de outras palavras: cada palavra que a faixa tocar entra na seleção, inclusive em outras linhas.
  - Ao soltar, aparece a **barra da seleção normal** (cor, espessura, copiar, ✨, excluir…).
  - A **caneta continua ativa**: encostar a caneta na seleção move as palavras; encostar fora desfaz a seleção e você volta a escrever.
  - Só pega **tinta da caneta** (formas, marca-texto, imagens e texto digitado ficam de fora).
  - Mexer o dedo antes de 0,4 s continua **rolando a página** como sempre; segurar num lugar sem escrita não faz nada.

## Novidades da v0.48.1

- O ícone de "sincronizando" do Google Drive agora gira continuamente. Antes ele voltava ao começo a cada atualização da porcentagem e parecia ir e voltar.

## Novidades da v0.48.0

- **Ir para página rápido:** toque no contador de páginas do topo (ex.: "1 / 25") e aparece um teclado numérico grande.
  - Digite o número: se ele não pode mais crescer (ex.: "7" numa nota de 25 páginas), vai **sozinho**; senão toque em **Ir**.
  - Botões de **primeira**, **anterior**, **próxima** e **última**, e as **páginas marcadas** para tocar direto.
  - "Todas as páginas…" abre a tela de páginas de antes.
  - Também em ⋯ → "Vá para página" e como ação de um botão da caneta ("Ir para página"). Num teclado físico, os números e o Enter também funcionam.

## Novidades da v0.47.6

- **Ajustes da telinha mais precisos:** no lugar das barras deslizantes, cada ajuste tem botões **− / +** que mudam de 1 em 1 (segurando, repetem), o **número pode ser digitado** e embaixo aparece o que ele significa (ex.: "10% p/ baixo").
- **Tamanhos prontos:** linha "Tamanhos" com **P**, **M** e **G** (pequeno, médio e grande, para o tamanho principal do atalho) e **Padrão** (volta todos os ajustes daquele atalho ao original).
- **Suas predefinições:** "+ Salvar" guarda os ajustes atuais com um nome (ex.: "Caderno"). Tocar no nome aplica; o ✕ apaga. Até 8 por tipo de atalho.

## Novidades da v0.47.5

- O colchete do toque duplo em números romanos (e em números, letras e os outros atalhos) agora sai **igual ao do hífen**: a reta desce do meio do quadrado do atalho e a ponta termina onde terminaria a de um hífen. Antes ela ia até o fim do número e, nos números longos, parava muito à direita.

## Novidades da v0.47.4

- **Ponto dos números menor:** o "Tamanho do sinal" (Ajustes de Número, Letra e Romano) agora vai até 10%. O ponto diminui de verdade: antes ele parava num tamanho mínimo ligado à espessura da caneta. Em 100% fica igual a antes.
- **Posição do número:** nova linha "Posição" na telinha, com **Centralizado** (no meio do quadrado, como antes) ou **À esquerda** (sempre começando na borda esquerda do quadrado). Vale para número, letra e romano e fica salva.

## Novidades da v0.47.3

- Os colchetes criados pelo toque duplo da caneta (embaixo de um atalho, de um hífen ou continuando outro colchete) agora saem com a **cor da caneta selecionada**, e não com a cor do que foi tocado.

## Novidades da v0.47.2

- **Toque duplo em qualquer atalho rápido cria o colchete embaixo dele**, como já acontecia com o hífen: número, letra, romano, tópico, seta e caixa. O colchete sai no meio do atalho, com a ponta até o fim dele (por exemplo, até o ponto do "1."), com a espessura da caneta selecionada e sem trocar de ferramenta. Vale para os atalhos colocados a partir desta versão.

## Novidades da v0.47.1

- O botão da caneta que fazia **só o tópico** agora faz o **hífen direto**, como era antes: aperte e toque no quadrado, sem telinha. Quem já tinha um botão com o tópico passa a ter o hífen direto sozinho. O tópico continua na telinha do atalho rápido e no toque duplo.
- **Cor só do sinal:** em Ajustes de Número, Letra e Romano, "Cor do sinal" deixa o ponto, o hífen ou o parêntese de outra cor ("igual" = mesma cor do número).

## Novidades da v0.47.0

- **Mais atalhos na telinha:**
  - **1. Número** (1, 2, 3… até 999) e **a) Letra** (a até z), desenhados em traços limpos. Têm o mesmo jeito do romano: contagem por nota com − / + / Recomeçar, sinal depois (nada, ".", "-", ")") e centralizados no quadrado, crescendo para a direita quando não cabem.
  - **→ Seta** e **☐ Caixa** (caixinha de marcar), centralizadas no quadrado, com comprimento/tamanho e altura em "Ajustes".
- **Cor só do atalho:** linha "Cor" na telinha. "caneta" usa a cor da caneta; as bolinhas são as cores do grupo atual. Fica salva.
- **📌 Fixar:** toque em "Fixar" para colocar vários seguidos (por exemplo 1., 2., 3. tocando em três quadrados) sem a telinha fechar. Cada toque da caneta na folha coloca um até você tocar em ✕. Sem o "Fixar", ela fecha depois de colocar, como antes. O "Fixar" não fica salvo: toda vez que abrir a telinha, precisa tocar nele de novo.

## Novidades da v0.46.0

- **Telinha do atalho rápido melhorada:**
  - **Prévia ao vivo:** um pedacinho de grade mostra exatamente o que vai sair (hífen, bolinha ou número), com a cor e a espessura da caneta atual.
  - **Ajustes** (toque para abrir/fechar; fica lembrado): os mesmos das Configurações, mas só os do atalho escolhido.
    - Hífen: comprimento, altura e o colchete do hífen.
    - Tópico: tamanho e altura.
    - Romano: tamanho do número, altura, espaço entre letras e **tamanho do sinal** (ponto, hífen ou parêntese depois do número).
  - **Estilo do número romano:** **Serifado** (serifa em cada letra), **Serifa única** (uma barra em cima e outra embaixo do número inteiro, estilo Ⅲ) ou **Sem serifa**. Fica salvo.

## Novidades da v0.45.0

- **Atalho rápido com telinha:** o botão da caneta que fazia o hífen agora abre uma telinha no canto inferior direito. Escolha **Hífen**, **Tópico** ou **Romano** e toque no quadrado com a caneta. A escolha fica salva para as próximas vezes. Apertar o botão de novo (ou o ✕) fecha a telinha.
- **Números romanos:** desenhados com traços retos e serifas, na cor e espessura da caneta.
  - **Posição:** centralizados no quadrado; se o número for mais largo que o quadrado, começa na borda esquerda dele e cresce para a direita. Assim ficam alinhados um embaixo do outro.
  - **Contagem:** por nota (I, II, III…). Na telinha dá para ver o próximo, mudar com − / + ou tocar em **Recomeçar**. Vai até LXXXIX (89).
  - **Sinal depois:** nada, "I.", "I -" ou "I)", escolhido na telinha e salvo como padrão.
  - **Desfazer** tira o número inteiro de uma vez.
  - **Ajustes:** em Configurações → Botões da caneta → "Número romano rápido": altura (% do quadrado, padrão 50%) e deslocamento.

## Novidades da v0.44.0

- **Tópico rápido:** uma bolinha vazia no centro do quadrado tocado, do mesmo jeito do hífen rápido. Usa a cor, a espessura e o tipo de linha da caneta selecionada.
  - **Pelo botão da caneta:** em Configurações → Botões da caneta, escolha "Tópico (bolinha vazia) no quadrado". Aperte o botão e toque no quadrado com a ponta.
  - **Pelo toque duplo da caneta:** escolha a opção "Tópico (bolinha) no quadrado tocado".
  - **Ajustes:** em Configurações → Botões da caneta → "Tópico rápido (bolinha)": tamanho (% do quadrado, padrão 30%) e deslocamento para baixo do centro (padrão igual ao do hífen).

## Novidades da v0.43.1

- **Verificar atualização** saiu de baixo da barra lateral e agora fica no topo da tela inicial, ao lado do botão da barra lateral, como o Drive e a busca (com a versão atual). Também está no menu **⋯ da nota**: atualiza e volta na mesma nota e página.
- A atualização agora recarrega **uma vez só** (antes a tela piscava duas vezes).
- **Relatório:** não pisca mais ao abrir. Só o tempo de **matérias** entra nos gráficos e números. O tempo fora das notas ou em notas sem matéria continua na aba Sessões, apagado e marcado "não conta"; mude a matéria da sessão para ele contar. O painel do cronômetro avisa quando o tempo está indo para "Sem matéria".
- **Painel do cronômetro:** agora em duas colunas (controles à esquerda, números à direita) e sempre cabe na altura da tela. Em telas estreitas, rola por dentro.

## Novidades da v0.43.0 — relatório e cronômetro de estudo refeitos

**Relatório de estudo** (agora em tela inteira):
- **Período no topo:** Dia, Semana, Mês ou Ano, com ‹ › para voltar e avançar e o botão "Hoje". O botão **Recarregar** continua lá.
- **Abas:**
  - **Visão geral:** total (comparado com o período anterior), média por dia, dias na meta, sequência atual e a melhor, número de sessões e o tempo que não contou. O gráfico mostra cada barra dividida pelas cores das matérias. Tocar numa barra mostra as matérias daquele dia, hora ou mês, com o botão "Abrir o dia →". A meta diária é ajustada aqui.
  - **Calendário:** cada dia é um quadrado com o tempo estudado, mais forte quanto mais perto da meta (✓ = meta batida). No Ano aparecem os 12 meses. Tocar num dia abre esse dia.
  - **Matérias:** gráfico de rosca e a lista de matérias. Tocar numa matéria mostra as notas estudadas nela, o número de sessões e a média por sessão.
  - **Horários:** quanto você estuda de madrugada, de manhã, à tarde e à noite, o gráfico por hora com o horário de pico e a grade dia da semana × hora.
  - **Sessões:** cada sessão com início, fim, matéria e nota. Toque para mudar a matéria ou o horário, ou para excluir. "+ Adicionar sessão" serve para um estudo que não foi registrado (substitui o "Ajustar tempo").
  - **Notas:** as notas mais estudadas no período; toque para abrir.
- O histórico antigo foi convertido sozinho e continua nos totais e no calendário. Ele não tem horário, então fica fora da aba Horários.

**Cronômetro:**
- Painel novo com um anel grande. No temporizador e no Pomodoro o anel mostra o progresso; no cronômetro, mostra a meta do dia. No Pomodoro, bolinhas mostram os focos feitos.
- **Escolher a matéria:** toque na matéria embaixo do anel. Por padrão o tempo vai para a matéria da nota aberta; escolhendo uma, o tempo vai para ela mesmo lendo um PDF de outra pasta ou estando na biblioteca. Volta a "pela nota" ao tocar em Zerar/Parar.
- Barra "Hoje: X de Y", aviso do tempo que não contou com o app fora da tela, gráfico dos 7 dias com a linha da meta e o botão "Abrir relatório".

## Novidades da v0.42.3

- Corrigido: no gráfico "Tempo por dia" do relatório, a linha tracejada da meta ficava alta demais, e os dias que bateram a meta pareciam abaixo dela. Agora a barra de um dia com exatamente a meta encosta na linha.

## Novidades da v0.42.2

- **Recarregar o relatório:** botão **Recarregar** no topo do relatório de estudo. Ele grava o tempo que está correndo agora, relê o histórico salvo e redesenha os números e gráficos.

## Novidades da v0.42.1

- **Ajustar tempo no relatório:** botão **Ajustar tempo** (ao lado da meta diária) para adicionar ou tirar minutos de uma matéria num dia, quando perceber que o registro ficou errado. Os ajustes ficam listados na mesma janela e cada um pode ser desfeito. Tirar nunca deixa a matéria abaixo de zero naquele dia.
- Corrigido: aparecia a palavra "null" solta no relatório.

## Novidades da v0.42.0

- **Alarme bem mais chamativo:** quando o temporizador ou uma fase do Pomodoro termina com o app na tela, um aviso grande cobre a tela piscando, com som mais alto (bipes em dois tons) e vibração repetindo a cada 2 segundos até você tocar em **Parar** (para sozinho depois de 1 minuto, mas o aviso fica). No temporizador há **+5 min**; no fim da pausa do Pomodoro, **Iniciar foco**.
- **Tela sempre acesa com o cronômetro rodando:** o tablet não apaga mais a tela sozinho enquanto o tempo conta. Era o motivo mais provável de o relatório mostrar menos tempo que o cronômetro: com a tela apagada o tempo não conta.
- **Relatório mostra o tempo que não contou:** se o app ficou fora da tela (tela apagada ou outro app) com o cronômetro rodando, o relatório avisa quanto foi no período e no dia tocado.

## Novidades da v0.41.6

- **Colchete do hífen termina um pouco abaixo do centro do quadrado,** igual ao hífen (padrão 10% para baixo). Dá para ajustar em Configurações → Botões da caneta → "Hífen rápido" → "Colchete do hífen".

## Novidades da v0.41.5

- **Colchete do hífen com a espessura selecionada:** o colchete criado pelo toque duplo num hífen agora usa a espessura que está selecionada na caneta. A cor continua a do hífen.

## Novidades da v0.41.4

- **Toque duplo num hífen cria um colchete embaixo dele:**
  - A reta sai do meio do hífen, começa logo abaixo da linha dele e desce até o centro do quadrado duas linhas abaixo.
  - A ponta curva vai até onde o hífen termina, com a mesma cor e espessura do hífen.
  - Dá para tocar duas vezes no colchete novo para continuar descendo, e a ferramenta não muda.

## Novidades da v0.41.3

- **Colchete reconhecido com mais facilidade e mais rápido:**
  - Colchetes com curva grande ou com a reta um pouco torta agora viram colchete, em vez de linha curva.
  - Basta segurar a caneta parada 0,25 s no fim (antes 0,3 s, e quando falhava só saía uma curva depois de 0,6 s).
  - Parênteses e "C" continuam virando curva.

## Novidades da v0.41.2

- **Tamanho do hífen rápido nas Configurações:** em Configurações → Botões da caneta → "Hífen rápido" dá para ajustar o **comprimento** (em % do quadrado, padrão 25%) e o **deslocamento** em relação ao centro do quadrado (padrão 10% para baixo; também dá para subir).

## Novidades da v0.41.1

- **Hífen rápido menor:** agora com cerca de um quarto da largura do quadrado (antes quase metade).

## Novidades da v0.41.0

- **Hífen rápido no quadrado:** o hífen sai no centro do quadrado da grade, um pouquinho abaixo do meio, com a cor, a espessura e o tipo da caneta selecionada. Duas formas de usar (escolha nas Configurações → Botões da caneta):
  - **Botão da caneta:** em "Hífen no quadrado", toque em "Definir" e aperte o botão que quer usar. Depois, é só apertar o botão e tocar com a ponta no quadrado. Apertar o botão de novo antes de tocar cancela.
  - **Toque duplo com a ponta:** escolha "Hífen no quadrado tocado" em "Toque duplo com a ponta". Os dois toques não deixam marca.
  - Na pauta (só linhas), o hífen fica no meio da faixa entre as linhas, onde você tocou. Na folha lisa, fica onde você tocou.

## Novidades da v0.40.1

- **Tocar no tempo na tela cheia:** com a nota em tela cheia, tocar no tempo do cronômetro (ou no relógio) no topo abre o painel de sempre (pausar, zerar, trocar de modo…). Antes, na tela cheia, o topo não respondia a toques.
- **Saiu o cronômetro em tela cheia da v0.40.0** (não era o que você queria).

## Novidades da v0.40.0

- **Cronômetro em tela cheia:** no painel do cronômetro, toque em "Tela cheia".
  - O tempo aparece bem grande, com a fase (Cronômetro, Foco, Pausa…), a barra de progresso no temporizador e no Pomodoro, o nome da nota e os botões Pausar/Continuar, Zerar e Pular.
  - A cor muda: roxo rodando, verde na pausa do Pomodoro, laranja pausado.
  - Enquanto está aberta, a tela não apaga sozinha. Fecha pelo × ou pelo voltar do Android.
- **Continuar colchete com toque duplo da caneta:** dê um toque duplo com a caneta em cima de um colchete.
  - Sai um colchete novo que continua a mesma reta e termina duas linhas da pauta/grade abaixo do fim do anterior (pula uma linha), com a mesma ponta, curva, cor e espessura.
  - Pode repetir no colchete novo para continuar descendo.
  - Nesse caso a ferramenta não muda (o toque duplo em outro lugar continua trocando laço/caneta).

## Novidades da v0.39.2

- **Melhorar escrita (✨) sem letras subindo e descendo:**
  - A parte de baixo de cada letra agora encosta na linha da pauta (ou da grade) em que a frase está.
  - Letras com perna (g, p, q, j) continuam com a perna abaixo da linha.
  - Sinais pequenos no meio da altura, como o hífen, ficam onde estão.
  - Em página lisa, as letras se alinham pela base da própria frase.
- **Relatório de estudo:** tocar numa barra mostra as matérias estudadas naquele dia (ou naquela semana, em "12 semanas") e o tempo de cada uma, incluindo "Fora das notas" (tempo com o cronômetro rodando na biblioteca).

## Novidades da v0.39.1

- **Mover só um pouquinho funciona:** arrastar uma seleção por 1 ou 2 pixels (com a caneta ou o dedo) agora fica gravado. Antes, qualquer movimento menor que ~3,5 px era tratado como toque e a forma voltava ao lugar. Só conta como toque o que quase não mexe, ou um toque rápido.

## Novidades da v0.39.0

- **Tabela com dois modos, como a caixa de texto:**
  - **Selecionada com o laço:** a tabela se comporta como qualquer item. Arrastar por dentro move, as alças redimensionam e o que estiver escrito dentro vai junto.
  - **Editar células:** toque na tabela (com o dedo, ou duas vezes com a caneta) ou use o novo botão de grade na barra da seleção. A moldura fica verde-azulada e aparecem as faixas de linhas e colunas e a alça de mover no canto. Dá para tocar nas células para colorir, inserir ou excluir linhas e colunas, mesclar etc.
  - O mesmo botão (verde-azulado) volta a mover e redimensionar.

## Novidades da v0.38.2

- **Cor em degradê:** tocar na cor normal que é igual à primeira cor do degradê agora troca para a cor normal de verdade. Antes o app voltava direto para o degradê.

## Novidades da v0.38.1

- Barra lateral mais enxuta: saíram "Recentes" (as Notas recentes da barra já cobrem) e "Estudo" (o relatório abre pelo cartão "Estudo de hoje" da tela inicial e pelo painel do cronômetro).

## Novidades da v0.38.0

- **Cores em degradê:** na barra de cores da caneta há um botão novo (bolinha colorida com +). Ele cria uma "cor" que vai alternando entre as cores que você escolher (2 a 8) e fica na lista como uma cor comum.
  - **Dentro do traço:** a cor muda aos poucos enquanto você escreve e continua no traço seguinte (letras seguidas vão mudando). "Tamanho de cada troca" define a rapidez.
  - **Uma cor por traço/letra:** cada traço sai de uma cor só, andando aos poucos para a próxima. "Traços para trocar de cor" define o ritmo.
  - Toque no degradê já selecionado para configurar (cores, modo, velocidade, excluir). Escolher outra cor volta ao normal.

## Novidades da v0.37.1

- **Estabilização da caneta até 20:** o 10 (o que você usava) agora é o padrão em todas as canetas, e de 11 a 20 vem uma estabilização forte ("· forte" no controle): a ponta "puxa" o traço como numa cordinha e tremidos somem — círculos ficam redondos e retas, retas. Quanto maior, mais suave (e um pouco mais "atrasado" atrás da caneta). Ajuste em Caneta → Estabilização.

## Novidades da v0.37.0

- **Tela inicial com cara própria:** saiu o "Olá, Vinicius". No lugar:
  - **A data de hoje** em destaque e uma **frase curta de estudo** que muda todo dia.
  - **Continuar de onde parei:** cartão com a última nota aberta, a miniatura da página onde você parou ("página 3 de 12"), a matéria e o botão Continuar.
  - **Estudo de hoje:** anel com o tempo de hoje em relação à meta, a sequência 🔥 de dias seguidos na meta e as 3 matérias mais estudadas na semana. Toque para abrir o relatório.
- Os cartões aparecem só no Início (somem dentro de pastas e na busca).

## Novidades da v0.36.3

- **Tamanho da letra no caderno de caligrafia** (coluna da esquerda, 20–100%): diminui as linhas-guia no meio da folha para você escrever do tamanho com que está acostumado. A letra é gravada do mesmo jeito (relativa às linhas), então o ✨ funciona igual. O tamanho fica lembrado.

## Novidades da v0.36.2

- **Caderno de caligrafia como uma nota:** uma folha grande no meio da tela para escrever a letra (com a letra de referência bem clarinha ao fundo enquanto a versão está vazia). As 3 versões ficam em miniatura na coluna da esquerda — toque para escolher qual escrever —, longe da mão de quem é destro.
- A letra fica num botão no topo (toque para abrir a grade com Minúsculas/Maiúsculas/Números/Acentos), com ← e → para andar entre as letras.
- **Caneta ou Dedo** no topo (padrão: Caneta). No modo Caneta só a caneta escreve; no modo Dedo, a palma (toque grande) não escreve e a caneta tem prioridade.
- **Rejeição de palma na página toda:** com a caneta encostada (e meio segundo depois) nenhum toque passa — a palma não aperta botões nem risca.
- "Desfazer" (último traço) e "Limpar" ao lado das versões.

## Novidades da v0.36.1

- **Caderno de caligrafia em página inteira:** abre como as Configurações e só fecha pelo botão voltar (← no topo ou o voltar do Android). A palma encostando fora das telas não fecha mais o caderno.
- **À prova de palma:** depois que a caneta escreve, o dedo e a palma não riscam as telas das letras; e se a palma encostar primeiro, a caneta tem prioridade (o risco da palma some e a caneta escreve). Dá para fazer pingos e pontos normalmente.
- **Pontos aparecem como bolinhas** e as telas das letras ficaram maiores. Botão ← para voltar à letra anterior e contador de versões salvas no topo.

## Novidades da v0.36.0

- **Caderno de caligrafia** (Configurações → Escrita e caneta → "✍ Caderno de caligrafia…"): escreva cada letra (minúsculas, maiúsculas, números e acentos) do seu jeito mais bonito, em cima da linha de base — até 3 versões por letra. O app guarda e usa no "Melhorar escrita".
- **"Melhorar escrita" (✨ no laço) refeito:**
  - endireita a linha e **corrige a inclinação** (letras em pé);
  - reconhece cada letra comparando com o seu caderno e **aproxima** a sua letra do modelo (padrão 60%, ajustável no caderno); se não tiver certeza de qual letra é, não mexe (evita trocar letra errada);
  - deixa o **espaço entre letras** e a altura das palavras mais iguais, de forma suave (antes aumentava demais as palavras);
  - alisamento leve. Desfazer volta tudo de uma vez.
  - Letras emendadas (cursiva ligada) não dá para separar: elas só recebem o "arrumar".
- **Busca nas Configurações:** campo "Buscar uma opção…" no topo da lista — mostra só as opções com o texto procurado (sem diferenciar acento/maiúscula).

## Novidades da v0.35.0

- **Tempo de estudo por matéria:** pastas podem virar **matérias** — o tempo de estudo das notas dentro delas (e das subpastas) soma para a matéria.
  - menu ⋯ de uma pasta → **"Marcar como matéria"** (ou "Deixar de ser matéria");
  - menu ⋯ de PF/Direito → **"Transformar as subpastas em matérias"** (todas de uma vez);
  - **"Nova matéria"** no botão + da tela inicial e "Nova matéria dentro" no menu da pasta;
  - as matérias ganham o selo "matéria" e, na barra lateral, um anel na bolinha de cor.
- O painel do cronômetro mostra **"Matérias nos últimos 7 dias"** e o relatório de estudo mostra o tempo **por matéria** (com "Sem matéria" para notas fora delas); as notas mais estudadas continuam embaixo no relatório.
- O histórico antigo também passa a aparecer por matéria (ele é guardado por nota e agrupado na hora).

## Novidades da v0.34.6

- **Colchete mais rápido no "segurar para desenhar":** o colchete agora vira forma com a caneta parada por ~0,3 s (antes 0,6 s). As outras formas (linha, retângulo, círculo…) continuam com o tempo de antes, para não virarem forma sem querer.

## Novidades da v0.34.5

- **Zoom com dois dedos em cima de caixas de texto:** encostar dois dedos numa caixa de texto selecionada (ou aberta para escrever) agora faz zoom/rolagem em vez de mexer na caixa. Um dedo só continua movendo a caixa selecionada.
- **Rabiscar para apagar não apaga caixas de texto** (só traços e formas). Rabiscar por cima de um texto vira tinta normal.

## Novidades da v0.34.4

- **Tela cheia / escrevendo:** a barra do meio perdeu o fundo cinza — ficam só as informações (nome, horário, bateria) com uma sombrinha leve para dar para ler sobre a folha, e o fundo roxo do tempo de estudo.

## Novidades da v0.34.3

- **Tela cheia e escrevendo com a caneta:** a barra do meio agora fica inteira — nome da nota, horário, bateria e tempo de estudo (antes só o tempo de estudo ficava). Os botões dos cantos continuam escondidos e a barra não atrapalha a escrita (toques passam por ela).

## Novidades da v0.34.2

- **Tipo de linha na seleção:** selecione linhas, formas ou traços da caneta, toque no botão de espessura da barra da seleção e escolha também o **tipo de linha** (sólida, pontilhada, traço longo, traço curto, ponto e traço, traços mistos). Vale para vários itens de uma vez e o desfazer volta tudo num passo. (Marca-texto não muda.)

## Novidades da v0.34.1

- **Colchetes que continuam um no outro:** começando um colchete perto do canto (ou da reta) de outro, ele gruda: mesma reta vertical e a reta nova sai de onde a curva do anterior começa — fica uma linha só com os ganchos saindo dela, como no caderno. Vale até ~34 px de distância (antes 14).
- **Mesmo formato do colchete conectado:** o novo copia a curva e o comprimento da ponta daquele em que se conectou (segurando a caneta, a ponta ainda dá para ajustar).

## Novidades da v0.34.0

- **Relatório de estudo** (tela inicial → "Estudo", ou no painel do cronômetro → "Ver relatório completo"):
  - períodos de **7 dias, 30 dias e 12 semanas**; total, média por dia, **dias na meta** e **sequência** de dias seguidos batendo a meta;
  - gráfico de barras por dia (ou por semana) com a **linha da meta**; tocar numa barra mostra o tempo;
  - **meta diária** ajustável (padrão 60 min);
  - tempo **por matéria** (pasta de cima da nota, com a cor da pasta) e as **notas mais estudadas** (tocar abre a nota).
- **Otimização (sem perder qualidade):**
  - a tela inicial desenha ~40% mais rápido com muitas pastas e notas (as contagens/datas das pastas são calculadas uma vez só);
  - ao fechar uma nota, o editor devolve ~50 MB de memória de desenho (antes ficava ocupada até abrir outra nota) — ajuda o tablet a não ficar sem memória gráfica.
- **Visual mais aconchegante:** controles deslizantes e caixas na cor do app (antes azul do navegador), escolhas em pílula, campos arredondados, título da nota com fundo de vidro fosco (legível no tema escuro), nome do grupo de cores inteiro ("Geral"), toques com resposta suave.

## Novidades da v0.33.1

- **Nomes de pastas e notas na tela inicial** não passam mais por cima dos três pontinhos: usam até 2 linhas e depois cortam com "…". (Era um efeito colateral do menu ⋯ novo da v0.30.)

## Novidades da v0.33.0

- **Notas recentes na tela inicial:** na barra da esquerda, embaixo das pastas, aparecem as 4 últimas notas abertas (com miniatura); tocar abre a nota.
- **Pastas que expandem:** na barra da esquerda, a seta ao lado de uma pasta mostra/esconde as subpastas (em vários níveis). O app lembra quais deixou abertas, e ao entrar numa subpasta as pastas de cima já ficam abertas.
- **Tela infinita → Voltar ao centro:** no menu ⋯ da nota, "Voltar ao centro" leva de volta ao ponto onde a tela começa (com uma animação curta, mantendo o zoom).

## Novidades da v0.32.2

- **Leitura da escrita com sugestões:** o reconhecedor agora devolve até 5 leituras de cada linha e o Traço escolhe a que tem palavras que existem — em **português**, em **inglês** (conceitos técnicos) ou que **já aparecem nas suas notas** (textos digitados, leituras anteriores e texto dos PDFs; assim termos como "titularidade" ou "jurisprudência" contam). A regra é branda: a 1ª leitura do Google só é trocada quando tem palavras claramente inexistentes; siglas (TCP/IP, CF), números e artigos (5º) não atrapalham.
- As outras leituras ficam guardadas e **também valem na busca** — se a escolhida errou uma palavra, a busca ainda acha pela alternativa.
- Listas de palavras: FrequencyWords (Hermit Dave, CC BY-SA 4.0), ver `vendor/palavras-LEIAME.txt`.

## Novidades da v0.32.1

- **Leitura da escrita (OCR) mais precisa:**
  - a escrita é ampliada antes de ir para o reconhecedor (antes ia muito pequena e arredondada, e o formato das letras se perdia);
  - os traços vão na ordem em que você escreveu (pingo do i, corte do t e acentos no lugar certo), não mais da esquerda para a direita;
  - cada linha vai com o fim da linha anterior como contexto, o que ajuda a acertar palavras.
  - As páginas já lidas são relidas aos poucos com o método novo (precisa de internet).

## Novidades da v0.32.0

- **Sumário automático ("Tópicos"):** no Sumário (menu ⋯ → Sumário) aparece a seção **Tópicos (automático)**, montada a partir da sua escrita e sempre atualizada:
  - **título** = linha com letras claramente maiores (≥ 1,4× a escrita comum) **ou** caneta claramente mais grossa que a espessura que você mais usa na nota;
  - a **cor** só ajuda: uma linha curta em outra cor e um pouco maior também conta, mas cor sozinha não (grifos e anotações coloridas ficam de fora);
  - **níveis** (título / subtítulo / sub-subtítulo): cada espessura de caneta é um estilo; o tamanho da letra só separa níveis quando a diferença é grande;
  - cuidados contra erro: desenhos, sinais soltos e uma página inteira escrita maior não viram título; se a nota não tem um padrão claro, nada é marcado;
  - o nome mostra o texto lido (quando a leitura da escrita já passou pela página) ou um recorte do título como você escreveu; tocar leva até ele e destaca.

## Novidades da v0.31.2

- **Reordenar cores e espessuras:** às vezes o item arrastado ficava cinza e, ao tocar em outro, voltava para o lugar antigo (o soltar se perdia). Corrigido — inclusive soltando fora da barra.
- **Conta-gotas com prévia:** encoste na página e aparece uma lupa com a cor embaixo do dedo/caneta; arraste até a cor certa e **solte para confirmar** (soltar fora da página cancela).

## Novidades da v0.31.1

- **Espessura das formas do "segurar":** agora saem exatamente com a espessura selecionada na caneta (antes ficavam um pouco mais finas, 90% dela — ex.: 2,5 virava 2,25).

## Novidades da v0.31.0

- **Colchete ("└") mais confiável:** quando a curva do canto é grande, o reconhecimento separava em dois cantos (4 vértices) e aí não alinhava. Agora junta num canto só (3 vértices), com a reta exatamente vertical e a ponta exatamente horizontal. Um ganchinho na hora de pousar a caneta também é ignorado.
- **A ponta não entorta mais enquanto você segura:** depois de reconhecido, segurar a caneta ainda ajusta o comprimento da ponta, mas ela continua reta.
- **Colchetes parecidos:** a curva do canto e o comprimento da ponta seguem o último colchete que você fez (quando estão perto dele). Se você fizer um bem diferente de propósito, ele fica como desenhado e vira o novo padrão.
- **Formas que se conectam** (Configurações e painel da caneta → "Conectar formas", ligado):
  - o colchete vai para a **mesma reta vertical** de um colchete/linha vertical vizinho (até ~2 cm de tela de distância para o lado), e a ponta de cima gruda no canto do colchete de cima quando começa perto dele;
  - linhas e linhas com cantos: cada ponta gruda na ponta/vértice/canto de outra forma que esteja perto (ou em cima da linha mais perto).

## Novidades da v0.30.4

- **Tela de páginas (grade de miniaturas):** agora dá para rolar começando o arrasto em cima de uma página (antes só funcionava nos espaços vazios). Tocar abre a página; **segurar parado** e arrastar continua mudando a ordem — e isso foi corrigido também: soltar a página no lugar novo às vezes não era registrado.
- A faixa de miniaturas da tela de exportar voltou à rolagem normal da v0.30.0 (as mudanças das v0.30.1–v0.30.3 nela foram desfeitas, porque o problema era na tela de páginas). Continuam o carregamento aos poucos das miniaturas e a correção da janela que saía da tela.

## Novidades da v0.30.3

- **Miniaturas da exportação (de novo):** o arrasto agora é reconhecido pela posição do dedo/caneta dentro da faixa, não pelo elemento tocado — então começar em cima de uma página rola a faixa, com dedo ou caneta. O toque sem arrastar acha a página pela posição (inclui o número embaixo).

## Novidades da v0.30.2

- **Miniaturas da exportação:** tocar em cima de uma página e arrastar agora rola a faixa (antes só funcionava começando no espaço entre as páginas). Com o dedo, o arrasto usa os eventos de toque direto, que o Android não cancela; com a caneta também funciona. Um toque sem arrastar continua marcando/desmarcando a página.

## Novidades da v0.30.1

- **Miniaturas da tela de exportar mais fáceis de rolar:** arraste em qualquer direção (dedo ou caneta) que a faixa rola de lado, com embalo; um toque sem arrastar marca/desmarca a página. As miniaturas carregam aos poucos (só as perto da tela), sem travar.
- Correção: em notas com muitas páginas, a janela de exportar podia abrir deslocada para fora da tela.
- Saiu do topo o botão de tela dividida — abra ao lado pela troca rápida (abas de notas → "Abrir ao lado"). Para fechar a tela dividida, use o botão entre os dois lados.

## Novidades da v0.30.0

- **Nova tela de exportar (estilo Notewise):** abas **Nota inteira** / **Páginas específicas**. Em páginas específicas aparecem as miniaturas com ✓ (toque para marcar/desmarcar), o campo de intervalo ("2-5, 8") e "Selecionar tudo". Exportar como **PDF** (com a qualidade Leve/Normal/Alta/Máxima ali mesmo) ou **Imagens** (uma PNG por página). Botões **Salvar** e **Compartilhar**. Também abre pelo menu da nota na biblioteca.
- **PDFs gerados recentemente:** os últimos PDFs gerados (até 8) ficam guardados e aparecem no fim da tela de exportar, com botões para compartilhar ou salvar de novo sem gerar outra vez — mesmo depois de fechar e abrir o app.
- **Menu "⋯" no canto de cima à direita:** cabeçalho com a nota, atalhos **Exportar**, **Renomear**, **Marcar página**, e a lista: Mover para, Vá para página, Sumário, Alterar modelo, Zoom, Definições, Detalhes e Excluir nota.
- **Menos botões no topo:** marcador, sumário, modelo de página e zoom foram para o "⋯". Ficaram voltar, troca rápida, tela dividida, páginas, adicionar página, buscar, compartilhar/exportar, sincronização, modo leitura, tela cheia e o número da página.
- **Visual mais suave:** barras e pílulas sem borda dura, sombras leves, botões arredondados que "afundam" no toque, janelas e menus abrem com animação curta, abas em formato de pílula.
- Correção: uma nota excluída podia voltar para a biblioteca se a leitura da escrita (OCR) terminasse logo depois.

## Novidades da v0.29.0

- **Qualidade do PDF ao exportar/compartilhar:** ao exportar ou compartilhar aparece a escolha **Leve** (150 dpi, para WhatsApp), **Normal** (300 dpi), **Alta** (400 dpi, quase sem perda) ou **Máxima** (450 dpi, imagem sem perda, para impressão; mais lenta). Fica marcada a última que você usou. As páginas de PDFs importados continuam idênticas ao original; a qualidade vale para a sua escrita e para as páginas de caderno.
- **O Traço como app para abrir PDFs:** abrir um PDF com o Traço ("Abrir com") ou compartilhar um PDF para o Traço leva à página **Abrir PDF**, onde você escolhe:
  - **Nota nova:** nome e pasta (dá para criar uma pasta ali mesmo);
  - **Inserir em nota existente:** com busca; as páginas entram no fim, e dá para desfazer.
  - **Importante:** para o Android mostrar o Traço em "Abrir com"/"Compartilhar", é preciso gerar o APK de novo no PWABuilder (essas opções vêm do manifesto na hora de gerar), usando a mesma chave de assinatura de antes.
- **O app lembra onde você estava:** além de reabrir a nota em que você estava, agora volta para a mesma pasta/visão da biblioteca quando o Android fecha o app em segundo plano (não só depois de atualizar).
- **Tela cheia ao escrever:** um toque com o dedo no topo (onde ficam as barras) traz as barras de volta na hora.
- **Toque duplo com o dedo numa área vazia liga/desliga a tela cheia** (antes dava zoom).

## Novidades da v0.28.1

- **Colchete sempre alinhado:** ao segurar a caneta no fim de um colchete do seu jeito ("[", "]", "└", "┌": reta comprida com uma ou as duas pontas curtas dobrando para o mesmo lado), a reta fica exatamente **vertical** e as pontas exatamente **horizontais**, mesmo que você tenha desenhado um pouco torto (até ~25°). O comprimento e o arredondamento das curvas continuam como você desenhou. As outras formas não são alinhadas (continuam no ângulo em que foram feitas). Um colchete com um ganchinho só numa ponta também não vira mais linha reta.

## Novidades da v0.28.0

- **Busca dentro do PDF:** a lupa da nota agora também procura no texto do PDF importado.
  - Toque num resultado para ir direto ao trecho, que fica marcado em amarelo até você encostar a caneta na página.
  - Na primeira busca de cada PDF, o app lê o texto das páginas (aparece "lendo X de Y páginas"). Depois fica guardado e as próximas buscas são instantâneas.
  - Acentos e maiúsculas não importam ("funcao" acha "função").
  - PDFs escaneados (só imagem, sem texto) não têm o que achar.
- **Palma ignorada em todo o app:** toque com área grande (palma) não rola, não dá zoom, não aperta botões, não conta para o desfazer/refazer com 2/3 dedos e não mexe no lado da tela dividida nem nas listas.
  - Com a caneta encostada, qualquer outro toque é ignorado.
  - Se um toque vira palma no meio (o contato cresce), a folha para onde estava.
  - Em Configurações → Escrita e caneta dá para ajustar a partir de que tamanho um toque conta como palma. O app mostra o tamanho do seu último toque para ajudar a calibrar.
- **Cores do grupo e cor personalizada em todo lugar:**
  - Todos os seletores de cor mostram primeiro as cores do grupo atual: seleção, texto, post-it, formas, tabela, pasta, modelo de página e moldura.
  - Todos têm a opção de cor personalizada (espectro, roda, código e conta-gotas).
  - A cor do modelo de página agora usa o seletor do app.
- **Zoom mais leve:** a qualidade "econômica" guarda menos imagem pronta (blocos e miniaturas) para não faltar memória de desenho no tablet, o que fazia partes das barras sumirem ao mexer no zoom.

## Novidades da v0.27.0

- **Moldura em caixas de texto e imagens:** selecione um texto ou uma imagem (ou vários) com o laço e toque no novo botão de moldura na barra da seleção. Dá para escolher:
  - a cor;
  - o estilo (contínua, tracejada ou pontilhada);
  - a espessura;
  - os cantos arredondados (na imagem, os cantos da própria imagem também ficam arredondados);
  - no texto, o espaço entre o texto e a moldura.

  "Sem moldura" tira a moldura. A última moldura usada vira o padrão da próxima.
- **Rolagem rápida de volta à direita:** ela continua ignorando a palma e toques logo depois da caneta.
- **Mais espaço embaixo da última página:** dá para rolar mais (cerca de um terço da tela) antes de começar o "puxar para adicionar página", e escrever no fim da folha fica mais confortável.
- **Saiu a "barra do sistema por cima do app" da v0.26.3:** voltou ao comportamento anterior.

## Novidades da v0.26.3

- **A barra do sistema não empurra mais a tela:**
  - O app agora fica no modo tela cheia "imersivo" do Chrome. Quando a barra de horário/bateria aparece (painel de volume, deslizar do topo), ela fica por cima do app e some sozinha, sem a página descer.
  - Se o Android tirar o app desse modo, o próximo toque na tela o coloca de volta.
  - O botão voltar do Android continua funcionando normalmente.
  - Dá para desligar em Configurações → Aparência e barras → "Barra do sistema por cima do app".

## Novidades da v0.26.2

- **Avisos no canto inferior direito:** as mensagens pretas ("Colado", "Arraste os pontos…" etc.) agora aparecem no canto de baixo à direita, em vez de no meio da tela sobre a barra de baixo. As mais longas quebram em duas linhas.

## Novidades da v0.26.1

- **Criar e remover vértices no "editar pontos":**
  - Toque duplo no quadradinho de um lado, ou em qualquer lugar em cima da linha, cria um vértice ali.
  - Toque duplo num vértice o remove.
  - Funciona em linhas com cantos, polígonos, retas (que viram linha com cantos), retângulos, losangos e triângulos. Dá para desfazer.
  - Enquanto você edita pontos, o toque duplo da caneta não troca de ferramenta.
- **Pontos e alças menores:** os círculos, quadradinhos e losangos do "editar pontos" e as alças de redimensionar e girar ficaram menores, cobrindo menos o desenho. A área de toque continua do mesmo tamanho, então continua fácil pegar.

## Novidades da v0.26.0

- **Zoom e rolagem no estilo Notewise:**
  - A folha usa o espaço entre as barras da esquerda (ferramentas + cores) e uma margem pequena à direita. "Ajustar à largura" encaixa a folha exatamente nesse espaço.
  - Com zoom grande, a rolagem para os lados para quando a borda da folha encosta nas barras ou na margem (não sobra faixa vazia).
  - Tirando o zoom, a folha fica encostada nas barras e, quando já cabe com folga, vai para o meio da tela aos poucos. A partir daí a rolagem lateral trava (o dedo só rola para cima e para baixo).
  - A opção "Trava de rolagem (%)" saiu das Configurações, porque as margens decidem isso sozinhas. Trocar de ferramenta não faz a folha pular.
- **Linhas curvas no "segurar a caneta":** colchetes, "L", arcos e outras linhas abertas viram uma linha limpa com cantos, e cada canto tem o seu arredondamento. Um pedaço de círculo vira um arco perfeito. Enquanto você segura, a ponta final acompanha a caneta (escolha onde a linha termina).
- **Editar pontos:**
  - O vértice arrastado se move sozinho e em qualquer direção (ex.: a pontinha do colchete mais para cima ou para baixo).
  - Os quadradinhos no meio dos lados movem o lado inteiro.
  - Cada losango muda só a curvatura daquele canto.
  - O vértice gruda quando o lado fica a 0°, 45° ou 90°. Um segundo dedo na tela solta, e dá para desligar em Configurações → Ajustes automáticos.
- **Laço pega a forma em qualquer ponto:** basta o traço do laço passar por cima da linha da forma.
- **Mover só um pouquinho:** arrastar uma seleção por poucos pixels não volta mais ao lugar ao soltar. Antes, menos de 8 px contava como toque e a grade puxava de volta.
- **Linhas curtinhas no segurar:** linhas pequenas (a partir de ~10 px na tela) também viram retas.
- **Tela dividida sem piscar:**
  - Ao arrastar a divisória, só ela se move. Os lados mudam de tamanho uma vez, ao soltar.
  - O editor usa menos memória de desenho quando a tela está dividida.
  - As telas não são mais refeitas sem necessidade.
  - A barrinha de rolagem não é medida a cada rolagem.

## Novidades da v0.25.0

- **Tela dividida de verdade (duas notas lado a lado):**
  - As duas metades agora são editáveis. A que está em uso tem um contorno roxo e as ferramentas, cores, desfazer e barras agem nela. É só encostar a caneta na outra metade: ela vira a ativa na hora e o traço já começa ali. Um toque rápido só troca de lado, sem fazer um ponto. Cada nota guarda o seu próprio desfazer.
  - As barras de ferramentas, cores e espessuras são as mesmas para os dois lados (ficam nas bordas da tela).
  - Cada lado tem o seu topo: nome da nota (toque para trocar de nota), página e zoom (toque no zoom para ajustar à largura).
  - Perto da divisória ficam os botões para **trocar as notas de lado**, **travar o lado direito** e fechar. Com o lado direito travado, a caneta e a palma não o ativam sem querer; o dedo ainda rola a nota.
  - O lado que não está em uso rola com inércia e dá zoom com dois dedos como o editor, sem piscar: a imagem fica na tela até a nova ficar pronta, e com zoom grande a parte visível é redesenhada nítida.
  - Arraste a divisória para mudar o tamanho (toque duplo nela volta para metade/metade).
  - Na biblioteca, o menu ⋯ de uma nota tem **"Abrir ao lado da última nota"**.
- **Editar pontos de uma forma:** selecione uma forma (linha, seta, retângulo, elipse, triângulo, losango, polígono ou colchete) e toque no novo botão de pontos na barra da seleção. A seleção fica laranja e aparecem os pontos. Os círculos são vértices, os quadradinhos arrastam a aresta inteira e os losangos mudam a curvatura do colchete. A espessura não muda. Redimensionar normalmente continua igual.
- **Forma de "segurar a caneta" continua mudando enquanto você segura:** depois que o colchete aparece, mova a caneta para escolher onde ele termina (comprimento e rabinho). Triângulos e quadriláteros crescem ou encolhem seguindo a caneta. Linha, retângulo e elipse já faziam isso.
- **Mover, redimensionar e girar com a caneta é sempre livre:** sem grudar nas guias, na grade ou nos ângulos, como já acontecia com dois dedos.
- **Rolagem rápida longe da palma:**
  - Para destros, a barrinha de rolagem rápida agora fica do lado esquerdo, logo depois das barras de ferramentas e cores. Para canhotos, continua à direita.
  - Ela ignora a palma (toque com área grande) e toques com a caneta em uso ou até 1,5 s depois.
  - Tocar no trilho não pula mais de página: só arrastar o marcador funciona.
- **Print do laço não fica como padrão:** depois de tirar o print (ou ao trocar de ferramenta, ou ao abrir uma nota), o laço volta a ser o livre.
- **Toque duplo da caneta mais exigente:** escrever ":" (dois pontinhos) não dispara mais o toque duplo. Agora ele precisa ser no mesmo ponto (até 8 px), com toques curtos e o segundo logo em seguida.

## Novidades da v0.24.10

- **Colchete arredondado no "segurar para forma":** faça uma linha reta (vertical ou horizontal) com as pontas curvando para o mesmo lado — como "[", "└" ou só uma ponta — e segure a caneta parada no fim. O traço vira uma versão limpa: reta, com curvas redondas do tamanho que você desenhou e o rabinho no comprimento que você fez.

## Novidades da v0.24.9

- **Linha do carimbo de data acima da data:** ela fica exatamente sobre a linha da pauta/grade logo acima do texto e ocupa a largura inteira da página ("Linha inteira"; ou "Do tamanho do texto"). Em página sem pauta/grade, fica um pouco acima do texto.

## Novidades da v0.24.8

- **Carimbo de data com linha:** no painel da ferramenta (toque de novo no 📅), ligue "Adicionar uma linha embaixo da data". Dá para escolher:
  - o estilo (contínua, tracejada, traço longo, pontilhada, traço e ponto);
  - o comprimento (até a margem da página ou do tamanho do texto);
  - a espessura e a cor.
  
  A data e a linha entram juntas, e um "desfazer" tira as duas.
- **Carimbo de data junto com as outras ferramentas na barra lateral**, sem divisória (o ponteiro laser também).

## Novidades da v0.24.7

- **Compartilhar notas voltou a funcionar:** o Android só abre o menu de compartilhar logo depois de um toque, e gerar o PDF demorava o suficiente para esse toque "expirar". Agora aparece a janela **PDF pronto** com os botões **Compartilhar** (abre o menu do Android: WhatsApp, Drive, e-mail…) e **Salvar**. Também dá para compartilhar direto da biblioteca: menu da nota → "Compartilhar PDF…".
- **Tempo da tela cheia ao escrever ajustável:** Configurações → Aparência e barras → "Barras voltam depois de parar de escrever" (1 a 15 s; padrão 2,5 s).
- **Depois de "Verificar atualização", você volta para a pasta em que estava** na biblioteca (antes voltava para o Início).

## Novidades da v0.24.6

- **Mover objetos pequenos:** em pontos, acentos e outras coisas pequenas selecionadas, tocar dentro da seleção sempre move; as alças de redimensionar só pegam quando você toca do lado de fora dos cantos (com área de toque menor). Em objetos grandes nada mudou.

## Novidades da v0.24.5

- **Rabisco leve em qualquer direção:** vertical, diagonal ou horizontal. O app mede a direção principal do rabisco.
- **Escrever "B" maiúsculo não apaga mais a haste:** o rabisco leve agora exige linhas bem juntinhas e compactas, e as barrigas do "B", as corcovas de "m"/"nn" e o "z" ficam de fora. Voltinhas largas ("ondinhas") deixam de valer como rabisco leve.
- **Desfazer** (botão, 2 dedos na metade esquerda ou atalho da caneta) devolve o que o rabisco apagou.
- **Rabisco forte apaga também o que está encostado:** com 5 ou mais idas e voltas, o rabisco apaga tudo o que toca por dentro (ex.: riscar a haste de um "a" leva a bolinha junto). Para tirar só um traço, use 3 ou 4 passadas.

## Novidades da v0.24.4

- **Rabiscar para apagar bem menos exigente:** agora há o "rabisco leve" — 3 idas e voltas na horizontal (ou voltinhas/caracóis), curtinho, em cima de uma letra ou de um traço só (como a haste de um "a" de forma) — que apaga só o que ficou bem coberto pelo rabisco (pelo menos ~35%). O rabisco forte (4+ idas e voltas) continua apagando tudo em que passa por cima, como antes.
  - Se não houver nada embaixo, o rabisco vira tinta normal; e letras cursivas como m, n, u, w (idas e voltas na vertical) e "z" não são tomadas por rabisco, mesmo encostadas em outras letras.

## Novidades da v0.24.3

- **Rabiscar para apagar funciona com coisas pequenas:** um rabisco pequeno em cima de um ponto, acento, pingo do "i" ou letra pequena agora apaga só aquilo, sem levar o vizinho.
  - O rabisco é reconhecido pelos pontos reais da caneta, antes da estabilização (que arredondava o vai-e-vem rápido).
  - O tamanho mínimo é medido na tela (~9 px), e não na folha, então funciona igual em qualquer zoom.
  - Letras com vai-e-vem (m, w, M, "mm", "nn", "uu", z) continuam sem ser confundidas com rabisco.
- **Trava de rolagem ajustável:** Configurações → Zoom → "Trava de rolagem". Escolha até que zoom a folha fica centralizada e só rola na vertical (padrão 70%; 0 desliga).

## Novidades da v0.24.2

- **Trava de rolagem a partir de 70%:** com zoom de 70% ou menos (antes 60%), a folha fica centralizada e a rolagem é só vertical.

## Novidades da v0.24.1

- **Barras piscando no zoom com dois dedos:**
  - **Menos memória na qualidade "Econômica" (padrão):** ela volta ao consumo de antes da v0.23.1 (menos blocos e miniaturas guardados, sem a camada afastada e sem criar miniaturas no meio do gesto). Com a memória de desenho cheia, o Android redesenhava as barras piscando. No teste, o pico durante as pinças caiu de ~145 MB para ~105 MB. Os extras continuam na qualidade "Alta".
  - **Número do zoom na barra de cima:** durante a pinça, ele é atualizado no máximo ~8 vezes por segundo, em vez de a cada quadro, então a barra não é redesenhada o tempo todo.

## Novidades da v0.24.0

- **Cronômetro nas notificações do tablet:** ao iniciar o cronômetro pela primeira vez, o app pede permissão para notificar.
  - **Enquanto roda:** fica uma notificação fixa e silenciosa na cortina e na tela de bloqueio ("⏱ Foco · termina às 14:32"), com os botões **Pausar** e **Abrir**. Pausado, mostra quanto falta e o botão **Continuar**.
  - **Ao terminar:** aparece um alarme do sistema com vibração, que fica até você tocar. Funciona com o app em segundo plano ou a tela apagada. No Pomodoro, quando a pausa acaba, a notificação tem o botão **Iniciar foco**.
  - **Liga/desliga:** no painel do cronômetro, "Avisar pelas notificações do tablet".
  - **Limites do Android/Chrome:** um site instalado não consegue tocar alarme se o Android tiver encerrado o app (nesse caso o aviso aparece quando você volta), e depois de muito tempo em segundo plano o alarme pode atrasar até ~1 min. Se as notificações não aparecerem, libere em Configurações do Android → Apps → Traço → Notificações.

## Novidades da v0.23.7

- **Zoom de volta ao jeito de antes, com ajustes:**
  - **Até 60% de zoom:** a folha fica centralizada e a rolagem é só vertical.
  - **Acima de 60%:** a folha pode passar da borda da tela como antes (até ~35% da tela), mas essa folga não encolhe mais ao tirar o zoom.
  - **Durante a pinça:** o ponto entre os dedos fica parado; depois que você solta, a tela fica onde está (sem pulo), e arrastar só traz a folha de volta para dentro.

## Novidades da v0.23.6

- **Abaixo de 50% de zoom, rolagem só na vertical:** arrastar com um dedo (e o embalo depois de soltar) não mexe mais para os lados quando a página está bem afastada. A pinça continua normal.
- **"Puxe para adicionar uma página" mais exigente:** é preciso puxar cerca de 340 px além do fim (antes ~150), e só vale se o gesto começar com você já parado no fim da nota. Uma rolagem que chega ao fim e continua no mesmo movimento não adiciona página.

## Novidades da v0.23.5

- **Tirar o zoom só diminui, sem mexer a tela:** o ponto da folha que está entre os seus dedos fica exatamente no lugar durante todo o gesto. Antes, perto das bordas da folha, a tela ia para o centro no meio do gesto e depois voltava. A regra de limite agora é única e não muda com o zoom: a folha precisa ocupar pelo menos metade da largura da tela (ou aparecer inteira, quando é mais estreita).

## Novidades da v0.23.4

- **Tirar o zoom não puxa mais a tela para o centro:** quando a folha fica mais estreita que a tela (abaixo de ~150% no Pad 7), ela não é mais centralizada à força; só precisa continuar inteira dentro da tela. O ponto entre os dedos fica onde estava.
- **Qualidade ao tirar o zoom: "Econômica" passa a ser o padrão** (a "Alta" continua disponível em Configurações → Zoom, mas pesou no tablet).

## Novidades da v0.23.3

- **A página em que você está fica nítida ao tirar o zoom, inteira:** com a tela parada, o app prepara aos poucos a página atual completa (mais a área em volta) com ~71% do zoom atual. Ao tirar o zoom, letra e modelo continuam nítidos do começo ao fim do gesto, e a rolagem dentro da página também fica coberta.
- **Configurações → Zoom → "Qualidade ao tirar o zoom":** *Alta* (padrão) usa mais memória (até ~200 blocos de imagem). Se o tablet ficar pesado, mude para *Econômica*, que volta ao limite anterior (as bordas podem desfocar por um instante).

## Novidades da v0.23.2

- **Movimento horizontal mais livre:** a trava que segura a tela na vertical agora só entra quando o dedo sai quase reto (até ~11°, antes ~22°) e solta com 14 px para o lado (antes 32 px). Arrastar levemente na diagonal já move para o lado.
- **Tirar o zoom sem desfoque nas bordas:** com a tela parada, o app prepara aos poucos uma camada com metade do zoom atual cobrindo o dobro da largura e da altura da tela. Ao tirar o zoom, as bordas que aparecem já vêm nítidas (letra e modelo), em vez da miniatura borrada da página. Quando você solta, a qualidade total volta logo em seguida.

## Novidades da v0.23.1

- **Tirar o zoom não faz mais nada sumir:**
  - durante o gesto, a reserva de blocos é sempre o último zoom que ficou completo (antes, uma pausa no meio do gesto podia esconder partes da página);
  - a miniatura de cada página (o fundo que aparece enquanto os blocos nítidos ficam prontos) não é mais jogada fora a cada traço: ela recebe o traço novo na hora e, se precisar ser refeita, a antiga fica na tela até a nova ficar pronta;
  - as miniaturas das páginas que entram na tela são montadas durante o próprio gesto, e as de até 4 páginas de cada lado ficam prontas com antecedência;
  - o que está na tela não é mais descartado da memória enquanto aparece.

  Zoom e rolagem passam a parecer uma folha só, sem página em branco nem piscada.

## Novidades da v0.23.0

- **Tela não pisca mais ao parar de escrever:** a prévia do traço só sai quando a página já mostra o traço pronto (antes sumia um quadro antes, ou vários quando a área precisava ser redesenhada).
- **Espessura da seleção com − 0,1 e + 0,1:** na janela de espessura do laço, ajusta todos os itens selecionados de 0,1 em 0,1.
- **Tempo de estudo bem visível:** fundo roxo cheio com letra branca (verde nas pausas do Pomodoro, laranja quando pausado). Escrevendo ou em tela cheia, o topo some, mas o tempo continua à vista.
- **Toque duplo com a caneta (antes triplo):** dois toques rápidos no mesmo lugar. A ação é escolhida em Configurações → Botões da caneta → "Toque duplo com a ponta": alternar laço ↔ caneta (padrão), alternar caneta ↔ borracha, desfazer, refazer, modo leitura ou nada. Os toques não deixam marca. Dois pontos escritos um embaixo do outro (":") não disparam.
- **Destro/canhoto:** Configurações → Escrita e caneta → "Mão que escreve". Destro (padrão): toques de 2 e 3 dedos (desfazer/refazer) só valem na metade esquerda da tela; a palma apoiada na direita não desfaz mais nada. Canhoto: o contrário.
- **Melhorar escrita:**
  - **Automático** ao levantar a caneta: arredonda as curvas e tira o tremido medindo pela distância percorrida (não pelo número de pontos), e mantém os cantos das letras (v, z, r…) no lugar. Nível em Configurações → Escrita e caneta (0 desliga; padrão 5).
  - **Botão ✨ "Melhorar escrita"** no laço (escrita selecionada): alisa com mais força, endireita cada linha e deixa as palavras do mesmo tamanho e na mesma altura. Pontuação fica como está. Desfazer volta ao original.

## Novidades da v0.22.0

- **Tempo de estudo só com o app aberto:** o histórico soma apenas o tempo em que o cronômetro/temporizador/Pomodoro roda **com o app na tela**. Com o app fechado, em segundo plano ou com a tela do tablet apagada, não conta (o relógio do cronômetro continua andando, só o histórico não soma).
- **Horário, bateria e tempo maiores** no topo, mais fáceis de ler.
- **Sem o menu do Chrome ao segurar:** segurar o dedo em botões, miniaturas, textos e campos parados não abre mais seleção nem menu do navegador. Em um campo de texto que você já está usando, copiar/colar continua funcionando.
- **Espessuras da seleção:** ao mudar a espessura de algo selecionado, aparecem as mesmas espessuras da sua barra da caneta (as do grupo atual).
- **Segurar o dedo com o laço:** abre um painel com o último item salvo na biblioteca (toque para colar exatamente onde segurou) e os itens recentes, além de um atalho para a biblioteca completa.
- **Alças em todos os lados:** a seleção agora tem alças nos 4 cantos (redimensionam mantendo a proporção, presos no canto oposto) e no meio dos 4 lados (esticam só a largura ou só a altura). Em texto, as alças laterais mudam a largura da caixa. Itens girados ficam só com os cantos.
- **Escrita mais fiel:** a estabilização deixou de "puxar com corda" nos níveis normais (isso arredondava e encolhia letras pequenas), ficou um pouco mais leve e o alisamento depois de levantar a caneta é mais suave. Se quiser mais firmeza, aumente a estabilização da caneta no painel da ferramenta.
- **Escrita mais rápida e sem travadas:**
  - cada traço novo é pintado direto por cima da página, em vez de redesenhar todos os traços da área (em páginas cheias isso travava o começo do próximo traço);
  - os pontos da caneta são lidos assim que chegam, sem esperar o próximo quadro da tela;
  - no modo de baixa latência, a tela rápida já fica preparada antes de a caneta encostar.

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
