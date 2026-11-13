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
| Escrever | Caneta (Focus Pen). Com o botão de mão ligado, o dedo também escreve |
| Rolar / zoom | 1 dedo arrasta; pinça com 2 dedos dá zoom |
| Desfazer / refazer | Toque com 2 dedos / toque com 3 dedos |
| Forma perfeita | Desenhe à mão e **segure a caneta parada** no fim do traço |
| Selecionar | Laço: contorne os itens ou toque em um. Arraste para mover; a bolinha no canto redimensiona |
| Favoritos de caneta | Botão **+** salva a cor e a espessura atuais. Segure um favorito para remover |
| Régua / transferidor | Arraste com 1 dedo e gire com 2. A caneta "gruda" na borda |
| Botão lateral da caneta | Vira borracha (dá para mudar nas Configurações) |
| Modelos | Ícone de grade: tipo, espaçamento, espessura, intensidade, cores e "Meus modelos" |
| Páginas | Ícone de grade ou indicador "1 / 5": adicionar, duplicar, mover, excluir, inserir PDF |
| Exportar | Ícone de download: PDF da nota, PNG da página ou compartilhar |

## Ferramentas próprias (plugins)

Em **Configurações → Ferramentas próprias**, você cria ferramentas em JavaScript que aparecem na barra do editor. Dois exemplos já vêm instalados: **Carimbo de data** e **Ponteiro laser**. O botão **Como criar (API)** mostra tudo o que um plugin pode fazer: adicionar traços, formas e textos, desenhar prévias e guardar dados.

## Atualizar o app

Para mudar o código, substitua os arquivos no repositório do GitHub. O tablet baixa a nova versão na próxima vez que o app for aberto com internet. Suas notas não são afetadas.

## Segurança das notas

- As notas ficam no armazenamento do Chrome do tablet. **Não limpe os dados do site** sem um backup.
- Além do Drive, existe **Configurações → Cópia local → Exportar tudo**, que gera um arquivo único com todas as notas, imagens e PDFs.
- No Drive, cada nota é um arquivo `nota-….json`. O Drive guarda o histórico de versões de cada arquivo (botão direito → Gerenciar versões).
