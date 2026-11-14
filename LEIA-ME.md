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
| Barras mais finas | Configurações → Aparência e barras: Normal, Compacta ou Bem compacta |
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
| Post-it | Ferramenta de nota adesiva: toque na página, escreva e mude a cor na segunda barra |
| Páginas | Botão de grade no canto superior esquerdo: abrir, selecionar várias, duplicar, excluir, marcar, e segurar e arrastar para reordenar |
| Marcadores | Botão de marcador no canto superior direito marca a página atual; na caixa de páginas, filtre por "Marcadores" |
| Modo leitura | Botão de olho: a caneta só rola a página, sem riscar |
| Busca | Lupa na nota busca nos textos digitados e post-its; a busca da biblioteca também procura dentro das notas |
| Carimbo de data | Ferramenta 📅: toque na página. No painel de ajustes você muda o texto, ex.: `Aula dia {dd}/{mm}` |
| Baixa latência | Configurações → Escrita. Deixa a tinta mais rápida; se notar algo estranho, desligue |

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
3. Traços, cores, marca-texto, formas e imagens viram itens editáveis: dá para selecionar, mover, girar e apagar. As pastas do ZIP viram pastas no Traço.

Caixas de texto e PDFs anotados no Notewise ainda não são reconhecidos (a importação avisa quantos itens ignorou).

## Ferramentas próprias (plugins)

Em **Configurações → Ferramentas próprias**, você cria ferramentas em JavaScript que aparecem na barra do editor. Dois exemplos já vêm instalados: **Carimbo de data** e **Ponteiro laser**. O botão **Como criar (API)** mostra tudo o que um plugin pode fazer: adicionar traços, formas e textos, desenhar prévias e guardar dados.

## Atualizar o app

Para mudar o código, substitua os arquivos no repositório do GitHub. O tablet baixa a nova versão na próxima vez que o app for aberto com internet. Suas notas não são afetadas.

## Segurança das notas

- As notas ficam no armazenamento do Chrome do tablet. **Não limpe os dados do site** sem um backup.
- Além do Drive, existe **Configurações → Cópia local → Exportar tudo**, que gera um arquivo único com todas as notas, imagens e PDFs.
- No Drive, cada nota é um arquivo `nota-….json`. O Drive guarda o histórico de versões de cada arquivo (botão direito → Gerenciar versões).
