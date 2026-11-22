# Dossiê de continuação — Miga Promo

Este arquivo leva todo o contexto da conversa anterior para uma conversa nova.
**Para o novo chat:** leia este arquivo inteiro antes de mexer em qualquer coisa.

---

## 1. Como abrir a conversa nova

Cole isto como primeira mensagem no chat novo (com o repositório `ajsouza1992/alpamahome` conectado):

> Estou continuando o projeto Miga Promo. Leia o arquivo `migapromo/DOSSIE_CONTINUACAO.md` da branch `ccr-7374c7ca-pithl7` do repositório `ajsouza1992/alpamahome` e siga tudo o que está nele. Trabalhe nessa mesma branch. Responda sempre em português simples.

---

## 2. Quem é a usuária e como trabalhar com ela

- Afiliada de achadinhos (Shopee e Mercado Livre), **não é técnica**. Responder **sempre em português simples**, sem termos técnicos.
- Antes de **mudanças grandes de tela**, mostrar um **esboço (imagem)** e esperar a aprovação.
- **Não gosta de ícones emoji** nos botões: usar ícones SVG do padrão do app. Nada de ícone de setinha girando, relógio ou emoji. Nada de "✓" em botões.
- Gosta de **padronização**: mesmos botões, mesmas bolinhas de cor, mesmos filtros em todas as telas.
- Mandar **print/imagem** do que foi feito quando ajudar a conferir.
- Ao terminar cada pedido: testar, salvar no repositório e **mandar o zip novo** (`migapromo_site.zip`).

### Regras fixas
- **Chaves e senhas** só no Cloudflare → projeto → Configurações → **Variáveis e segredos**. Nunca pedir chave no chat.
- **Não colocar os e-mails dela no código** (no chat ou no texto das regras do Firestore pode).
- Commits e push na branch **`ccr-7374c7ca-pithl7`**. **Não abrir PR** sem ela pedir.
- Final de toda mensagem de commit:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
  (mais a linha `Claude-Session:` que o sistema do chat novo indicar). Não citar nome de modelo em commits.

---

## 3. O projeto

- **Miga Promo**: site de achadinhos em **migapromo.com** + app (PWA) para ela montar posts, stories, reels, vídeos e o site.
- **Cloudflare Pages**, projeto **"migapromo"**. **Firebase** novo: `miga-promo-d4f51`.
- **Publicar**: ela sobe o arquivo **`migapromo_site.zip`** no Cloudflare (Implantação manual).
  - Gerar o zip: `cd migapromo && zip -qr <pasta>/migapromo_site.zip .`

### Pastas (repositório `ajsouza1992/alpamahome`, pasta `migapromo/`)
| Arquivo | O que é |
|---|---|
| `index.html` | **O site (vitrine)**, tudo num arquivo só (HTML + CSS + JS) |
| `_worker.js` | Servidor (Cloudflare): `/app/api/...` catálogo Shopee/ML, descrição, afiliado Shopee, IA (Gemini) |
| `_headers`, `_routes.json`, `manifest.json` | Cabeçalhos, rotas e manifesto do site |
| `site-icone-*.png`, `site-favicon.png`, `og-miga.png` | Ícones do site e imagem de compartilhamento do link |
| `app/index.html`, `app/app.js`, `app/style.css` | **O app** (PWA em /app/) |
| `app/sw.js` | Service worker do app |
| `app/firestore.rules` | Regras do Firestore (ela cola no Firebase) |
| `app/sons/` | Amostras de som das músicas dos vídeos |

### Versões (trocar a cada mudança)
- `app/index.html` e `app/sw.js`: `?v=441` → próxima `?v=442`
- `app/sw.js`: `VERSAO = "miga-promo-v444"` → próxima `v445`
- Comando usado: `sed -i 's/?v=441/?v=442/g' app/index.html app/sw.js && sed -i 's/miga-promo-v444/miga-promo-v445/' app/sw.js`

### Segredos esperados no Cloudflare (nomes, nunca valores)
`ML_APP_ID`, `ML_SECRET` (catálogo Mercado Livre) · `SHOPEE_APP_ID`, `SHOPEE_SECRET` · `GEMINI_API_KEY` · `APP_SENHA` · `MIGA_EMAILS`.
> Pendente de confirmar: se `ML_APP_ID`/`ML_SECRET` estão cadastrados no projeto **migapromo** (os Achados vinham só com Shopee).

### Código de afiliado do Mercado Livre (dela)
`matt_word = migapromo` · `matt_tool = 43132738` (fica salvo na nuvem em Ajustes → Afiliados). Shopee: id de afiliado `18309231369`.

---

## 4. Firestore (dados na nuvem)

- `espacos/miga/config/app`: ajustes do app (grupos, cupons, instagram, prompts, **mlMattWord, mlMattTool, ocultarPostados**).
- Lista de produtos do app: guardada pelo `dados.gravarFila` (espaço `espacos/miga`).
- `vitrine/miga`: config do site (`canal`, `grupo`, `instagram`, `tiktok`, `pacotes`, `pacotesEm`, `mlMattWord`…).
- `vitrine/miga/produtos/{id}`: produtos do site. Campos: `id, nome, preco, precoAntigo, cupom, loja, link, imagem, tipo` (categoria principal), **`tipos`** (lista de categorias, novo), `para, descricao, fav, frete, oficial, maisVendido, publicadoEm`.
- `vitrine/miga/pacotes/p{i}`: o site lê os produtos em **pacotes de 150** (menos leituras).
- `acessos/miga/eventos`: contador do site (visitantes só criam: visita, abrir, loja, cupom, compartilhar, whatsapp, instagram, tiktok).
- Regras completas em `app/firestore.rules` (só contas autorizadas gravam; vitrine é leitura pública).

---

## 5. Como o app está organizado (o que ela usa)

### Menu de baixo
**Início** · **Produtos** · **Ajustes**.

### Produtos (3 abas)
- **Minha lista**: só os produtos que ela escolhe (cola link, adiciona à mão, ou manda dos Achados/Site).
- **Achados**: catálogo das lojas (Shopee + Mercado Livre), 100 por página, **intercalado 1 Shopee / 1 ML** em "Todas".
- **No site**: o que está publicado no site.

Cada aba tem: barra de **loja à vista** (Todas · Mercado Livre · Shopee), botão **"Ordenar: …"** e **Selecionar**.

### Regra principal: cada produto fica no seu lugar
Selecionar na aba → botão **"Enviar para…"** → escolher o destino:
| Aba | Destinos |
|---|---|
| Minha lista | Site · Postar agora |
| Achados | Minha lista · Site · Postar agora |
| No site | Minha lista · Postar agora |

- Achados → Site **não** entra na Lista. Postar dos Achados/Site **não** põe na Lista (usa itens temporários: `temporarios` / `itemPorId` / `paraPostarTemp` no app.js).
- Site → Lista usa o mesmo `id` do produto do site (o site acompanha o da Lista).
- **Várias categorias no site**: menu ⋮ do produto no site → Categoria → escolha múltipla (`escolherCategorias`, `tiposDe`). O site mostra o produto em todas (`tiposP` no index.html).

### Criação (Início)
Postar (roteiro), Reels, Carrossel, Vídeo, Cupons, Corre pros Stories, Seguidores, Colagem, **Criação IA** (personagem/modelo).
- **Criação IA**: Criar (Imagem/Vídeo) · Produto (pode ser **"Sem produto"** → vídeo dela chamando a galera, assunto editável + "Sobre o que ela vai falar?") · Formato · Cenário.
- Prompts de vídeo: **limite de 900 caracteres** e **sincronia labial** sempre no começo (`SINC_LABIAL`, `comSincronia`).
- Montar o vídeo: **música ao fundo** logo abaixo do vídeo; prévia com som toca a música baixinha junto (`ctxPrevia`, `tocarMusicaPrevia`).

### Padrões visuais já combinados
- Bolinhas de cor (`.rp-cores`) encolhem para caber em celular estreito.
- Botões pequenos de ação (Copiar, Colar, Baixar, Trocar, Escolher): **um só estilo** (branco, borda fina, sombra; verde quando já copiado).
- Popups: botões do fim (**Fechar, Cancelar, Salvar, Confirmar**) **presos embaixo** (`fixarRodape`, `.folha-pe`).
- Toque: só efeito de apertar (`scale`), **sem cor creme** que fica marcada.
- Teclado só abre quando ela toca no campo (popups não focam campo sozinhos).

### Site (vitrine)
Capa com os 5 maiores descontos, faixa, atalhos de categoria (iguais às do app), Filtros, embaralha a cada hora com favoritos primeiro, selo de compra segura, botão de comprar preso embaixo na janela do produto.

---

## 6. Decisões dos dossiês anteriores
- Dossiê 1 (artifact `https://claude.ai/artifact/Tan2w7JHzv2QxDyw26N9WM`) e Dossiê 2 (`https://claude.ai/artifact/JjfB1xab7BBbCmugAVsego`): aplicados.
- **Recusados por ela**: S1 e S3 (ela troca modelo e cor na mão; manter o rodízio automático de cor), C2 (a escolha fica com ela), T1 (rodízio manual; fazer exclusão em massa e bolinhas de cliques coloridas), A2 (ela quer Salvar fixo e Cancelar quando algo foi editado). **T4 = depois.**

---

## 7. Pendências e ideias em aberto
1. **Mercado Livre nos Achados**: confirmar se as chaves `ML_APP_ID`/`ML_SECRET` estão no projeto migapromo. O app mostra um aviso acima dos Achados explicando o motivo quando o ML não traz nada — pedir para ela dizer o que o aviso mostra.
2. **Busca nas lojas (Achados)**: só a barra de cima (lupa do teclado busca nas lojas). **Shopee** funciona. **Mercado Livre não libera busca por palavra para apps de fora** (testado: /sites/MLB/search 403 com token do app e da conta; página de busca pede verificação de robô; /products/search traz itens errados). Não insistir. Caminho adotado: **Caixa de importação** (`paraCaixa`, `lerCaixa`, `abrirCaixa` no app.js; guarda em localStorage `miga_caixa`) recebe links do **Compartilhar** (share_target), do **Colar vários links** e da **extensão do Chrome** (`extensao-miga/` na raiz do repositório; abre `/app/#importar=<links>`). Links oficiais do Gerador de Links (`mercadolivre.com/sec/…`, `meli.la/…`) ficam como estão (`linkOficialML`); links comuns do ML ganham matt_word/matt_tool (`comCodigoML`). Pendente: ela conferir no Portal do Afiliado se as vendas com matt_word são atribuídas.
   **Colar vários links**: botão "Colar vários links de uma vez" na Minha lista (caixa de texto; usa `adicionarTexto`).
3. **Logo de abertura (splash) do app/site no Android**: ícones refeitos em alta (192/384/512/1024). Se continuar borrado, ela precisa **remover e instalar de novo** o atalho.
4. **Desempenho**: voltar para a Minha lista com ~300 produtos leva ~0,6 s (`renderFila`). Se ela reclamar de travada, otimizar.
5. Logo de Natal criado (perfil e post, com e sem "Feliz Natal") — arquivos ficaram no chat anterior; se precisar, refazer (quadro rosa "Miga", gorro de Papai Noel, azevinho, bolinha amarela %, fundo creme com neve).

---

## 8. Como testar (o que foi usado)
- Servidor local: `cd migapromo && python3 -m http.server 8799` (no mesmo comando do teste, porque o processo pode cair entre chamadas).
- Playwright (já instalado): abrir `http://localhost:8799/app/`, interceptar `**/firebase-config.js*` com `window.FIREBASE_CONFIG=null` (modo local, sem Firebase).
- Para simular o catálogo: registrar **primeiro** a rota genérica `**/api/**` e **depois** `**/api/catalogo*` (no Playwright a última registrada vence). Achados sem foto somem, então use imagem válida.
- Conferir: `node --check app/app.js`, telas a 360 px de largura (nada passando da borda), e prints das telas mexidas.

---

## 9. Últimos commits (mais recentes primeiro)
- Achados em Todas as lojas: Shopee e Mercado Livre intercalados
- Site: produto com várias categorias
- Selecionados: botão "Enviar para…" em cada aba
- Postar direto dos Achados e do Site sem pôr na Lista
- No site: "Pôr na Lista" para os selecionados
- Achados vão para o site sem entrar na Lista
- Filtro de loja à vista + "Ordenar:" com nome completo + aviso do ML
- Botões pequenos de ação padronizados
- Bolinhas de cor que cabem em qualquer celular
- Música na prévia e no seletor (um só motor de som)
- Sincronia labial em todos os prompts de vídeo
- Código do ML e "Ocultar postados" salvos na nuvem; links do site protegidos
- Popups com botões presos embaixo; toque sem cor creme; teclado só ao tocar
- Logo e ícones em alta qualidade
- Criação IA: vídeo sem produto, assunto editável, ícones novos

## Atualização (18/11/2026)
- **Preços automáticos:** `conferirPrecosSite` agora confere, ao abrir o app e a cada 30 min, TODOS os produtos da Minha lista e do Site sem conferência nas últimas 3 h (3 de cada vez). Datas guardadas em `localStorage.miga_precos_conf`.
- **Link direto do ML (`linkML`):** o link `/sec/` abre a página de afiliada (perfil MIGAPROMO), que no app do ML aparece vazia. O worker devolve `linkML` (permalink do anúncio, `/p/` ou `/up/`); o app guarda no item e no produto do site com `matt_word`/`matt_tool` (`linkDiretoML`). O botão "Comprar no Mercado Livre" do site usa `p.linkML` quando existe.
- **Postagens:** `linkPost(it)` usa o link direto (`linkML` + código) em WhatsApp, Telegram, Instagram, story e status; sem `linkML`, usa `it.link`.
- **Situação do anúncio (`statusML`):** o worker devolve active/paused/closed/under_review/inactive/sumiu. `aplicarConferencia`: encerrado (closed/inactive) sai do site; pausado/sumiu fica com `pausado: true` (o site esconde). Cache do worker agora é `produto2`; `fresco: true` ignora o cache. ML sem `linkML` é conferido de novo a cada 1 h. Site › selecionar › "Conferir na loja (preço e link)".
- **Shopee sem afiliado:** itens da extensão (já com nome e preço) não passam pelo worker, então dependem de `garantirAfiliados`. Agora ele continua sozinho (de 25 em 25) até trocar todos, limpa o texto automático e guarda os recusados em `shopeeFalhou`. Na Minha lista, o selo vermelho "Sem link de afiliado" (`semAfiliado`) mostra o que falta.
- **Conferência do afiliado:** `situacaoAfiliado` (ok / falta / outra). A tela do produto mostra o quadro `#ppAf` (verde, vermelho com "Trocar agora", ou bege nas outras lojas). `liberarAfiliado` roda antes de postar (`criarAPartirDaLista`, `postarProdutosNoWhats`, `postarRapido`, `iniciarCriar` com produto): tenta trocar e, se não der, pede confirmação ("Postar mesmo assim").
- **Bolinha de afiliado (`pontoAf`):** canto inferior direito dos cards da Minha lista, Achados e Site; verde = link de afiliado, vermelha = link comum (lojas sem conferência não mostram). O selo de texto "Sem link de afiliado" saiu. Link trocado à mão na tela do produto é afiliado sozinho (`afiliarLinkManual`).
- **Compartilhar do site com a foto do produto:** o botão Compartilhar do site usa `/p/ID`. O worker (`rotaLinkProduto`, rota em `_routes.json`) lê `vitrine/miga/produtos/ID` no Firestore e devolve o index.html com og:title, og:description e og:image do produto; depois troca o endereço para `/#p=ID` e abre o produto. Antes, o link `/#p=ID` mostrava a imagem geral do site no WhatsApp.
- **Compartilhar sem o compartilhar do celular** (navegador dentro do WhatsApp ou do Instagram): copia o link (a folha de opções foi tirada a pedido).
- **Bolinha de afiliado** agora fica no canto inferior direito da FOTO (dentro de `miniLoja`, 3º parâmetro ou `_ponto`). Botão Selecionar preto nas três abas (rosa quando é "Cancelar"). **Carrossel › Postar:** cada imagem com o texto alternativo e Copiar embaixo; a legenda é a última tela do trilho (`.ka-slide--leg`).
- **Limite do site:** `LIMITE_SITE = 500` (só aviso no app). O site desenha os cards com `content-visibility: auto`; testado com 500 produtos (cerca de 1,3 s).
- **Robô (Google Apps Script):** `robo-miga/` (Codigo.gs, appsscript.json, LEIA-robo.md). Roda a cada 30 min com a conta dona do Firebase (REST do Firestore, sem regras) e chama o worker com o cabeçalho `x-robo-chave` (segredo `ROBO_CHAVE` no Cloudflare, 24+ caracteres). Confere o Site e a Minha lista (6 h; ML sem `linkML`, 1 h), põe os links de afiliado, tira os encerrados, esconde os pausados, refaz os pacotes e manda e-mail de queda de preço (≥ QUEDA_MIN %). A memória fica em `espacos/miga/robo/estado`. Teste com Firestore de mentira: scratchpad `robo_teste.js`.
- **Criação IA › Escolha o produto:** barra de busca (`#peBuscaProd`) que filtra por nome, loja e categoria, sem acentos e com várias palavras.
- **Publicar vídeo › Som original do vídeo** (`V.somOriginal`: chave "Sem o som original" (`#vdSemSom`) embaixo da prévia e chave nos Ajustes do vídeo): desligado, o vídeo grava mudo e a música do app toca no volume cheio; a música liga sozinha (`semSomPedeMusica`).
- **Criação IA › Montar o vídeo:** chave "Sem o som original" (`#peSemSom`, `P.semSom`). Ligada, as duas montagens (WebCodecs e ffmpeg) usam só o áudio do app (`audioFechamento`, música em 0,6) e a prévia toca sem o som do vídeo; sem música escolhida, liga a primeira. A classe da chave é `chave-som` (`vd-som` já era o botão de som da prévia).
- **Extensão 1.7.0:** botão **Baixar vídeo** na barra (página de produto com vídeo): pega os `.mp4` das lojas (o `<video>` da página e os endereços no HTML; filtra `susercontent`, `mlstatic`, `mercadoli`) e baixa pelo `fundo.js` (service worker com `chrome.downloads`) em `Downloads/miga-videos/`. Vídeo em `blob:` (em pedaços) não dá para baixar.
- **Extensão 1.7.1:** baixa só o vídeo ABERTO (`videoAberto`: o `<video>` tocando ou o maior visível; senão o último `.mp4` das lojas em `performance`). Vídeo em `blob:`/HLS (Mercado Livre) não dá para baixar: avisa para usar a gravação de tela.
- **Extensão 1.8.0:** vídeo em pedaços (HLS) também baixa: `baixarPedacos` acha o último `.m3u8` em `performance`, escolhe a maior qualidade, baixa os segmentos e junta (fMP4: concatena; `.ts`: converte com `mux.min.js`, Apache-2.0). Com chave de criptografia (`EXT-X-KEY`), avisa que é protegido. Testado com HLS gerado pelo ffmpeg (ts e fmp4).
- **Montar o vídeo › Narração e trecho da música** (`blocoNarracao`): "Inserir áudio" (`P.narr` = {nome, dados, url, ini}), ouvir, tirar e "Narração começa em" (de 0,5 em 0,5 s); "Música começa em" de 0 a 30 s (`P.musIni`, `musicaRenderizada` renderiza a partir do ponto); a música abaixa enquanto a narração fala (no `audioFechamento`). "Copiar a fala" (vai na caixa de texto do AI Studio) e "Copiar o estilo" (prompt `narracao`, editável em Ajustes › Prompts, vai no botão Estilo; o modelo TTS lê tudo o que está na caixa). A prévia com som toca a mistura pronta.
- **Montar o vídeo › bloco "Som do vídeo"** (`.pe-audio`): música, "Música começa em" (`blocoTrecho`, logo abaixo da música), "Sem o som original", narração e "Narração entra em", e os botões de copiar.
- **Computador, logo desalinhado:** o `.topo` (sticky, com backdrop-filter) andava junto com a rolagem lateral quando algo passava da largura, e o menu fixo não. Agora `html, body { overflow-x: clip }`.
- **Arquivos:** a pasta foi tirada do app a pedido (o menu voltou a ter 3 itens). Ficou só o ícone `i-pasta` no sprite.
- **Extensão 1.8.1:** HLS com `EXT-X-BYTERANGE` (um arquivo só, em faixas) agora baixa o arquivo UMA vez (antes repetia o arquivo inteiro a cada pedaço). Em fMP4, `zerarTempo` faz o `tfdt` de cada trilha começar em 0 (antes o player mostrava ~13 h, o relógio de 33 bits do vídeo). Em `.ts`, junta tudo e converte de uma vez (um único flush). Testado com HLS de tempo inicial 47000 s nos três formatos: 8 s e 240 quadros.
- **Esboço do fluxo novo da Criação IA** (aguardando aprovação): 1 Escolher (tipo em 3 cartões, produto com busca, formato) → 2 Foto (NOVO: junta a foto do produto com as fotos da Miga; cenário, pose e enquadramento em chips; anexar a foto criada) → 3 Vídeo (a partir da foto do passo 2; ação, fala editável, duração em cenas; anexar o vídeo) → 4 Montar (o que aparece na tela e o bloco Som) → 5 Postar.
