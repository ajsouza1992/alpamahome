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
- `app/index.html` e `app/sw.js`: `?v=466` → próxima `?v=467`
- `app/sw.js`: `VERSAO = "miga-promo-v469"` → próxima `v470`
- Comando usado: `sed -i 's/?v=466/?v=467/g' app/index.html app/sw.js && sed -i 's/miga-promo-v469/miga-promo-v470/' app/sw.js`

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
- **Criação IA (fluxo novo, aplicado):** os passos dependem do tipo (`passosBase`): foto com produto = Escolher › Foto › Montar › Postar; vídeo com produto = Escolher › Foto › Vídeo › Montar › Postar; vídeo sem produto = Escolher › Vídeo › Montar › Postar. Todas as telas têm o cabeçalho "Passo X de Y" (`cabPasso`). Escolher tem 3 cartões (`data-pe-tipo-card`), o produto com busca e o formato. Foto (`peFoto`) junta o produto com a Miga: cenário e roupa, fundo, enquadramento, quantidade e pose; 1 baixar, 2 copiar o prompt (no vídeo, `promptFotoBase`), 3 anexar (`#peFotoArq`). Na foto com produto, anexar já vai para Montar. No vídeo, a foto vira `P.fotoBase` e o prompt do vídeo passa por `promptVideoDaFoto` ("Anime a foto anexada…"). Vídeo (`pePrompt`): duração (`duracaoChips`), fala editável (`P.falaEd`, usada em `falaPersonagem`) e copiar; 2 ou 3 cenas continuam na `telaCenasPrompt`.
- **Aviso de promoção:** `AVISO_PRECO` ("⚠️ _Preço e promoção podem mudar a qualquer momento._") entra nas mensagens do WhatsApp (`comAviso` dentro de `comConvite`, e no texto editado de `enviarProdutoNoWhats`) e no texto do Status (`textoStatus`). No story/status (arte 1080x1920), `avisoPrecoArte` desenha "Promoção pode mudar a qualquer momento." em H-222, na cor suave do tema (`C.antigo`, a mesma do "antes R$"), sem pílula.

## Atualização (23/11/2026) — carrossel com foto + aviso do story
- **Carrossel: foto na capa e no final** (`blocoFotoCarta`, `cartaComFoto`, `fotoNaCarta`, `lerFotoCarta`, `corBordaFoto`). `tela.foto = {src (JPEG dataURL até 1350 px), z, x, y, auto, fundo}`. O fundo pega a cor da borda da foto (ou uma cor do tema, `auto:false`). Foto "contida" (z=1) com bordas esfumadas; arrastar na prévia (pointer, `.ka2-arrasta`) e slider "Tamanho". Título no topo (900 96px) com cor automática: mede a luz atrás do texto (getImageData) → letra escura + destaque rosa, ou branca + destaque amarelo. Exporta esperando as fotos (`esperarFotosCarta`). `guardarCartas` tenta sem as fotos se faltar espaço.
- **Carrossel: bugs** — "Começar um carrossel novo" (tela Pronto) agora apaga o salvo; Montar zera a legenda antiga; Colar: aceita ```json, vírgula sobrando, aspas curvas dentro do texto; avisa se colou o pedido em vez da resposta ou a resposta do carrossel antigo.
- **Story**: o aviso "Promoção pode mudar…" fica logo abaixo do campo do link (`fimCampoLink`, guardado em `campoCupomLink`).
- **Publicar vídeo (vTema): mudar lugar/tamanho do título, preço/descrição, botão (Link na bio) e logo** — toque no item na prévia `#vdQuadro` e arraste. `quadroVideo` envolve `titulo/infos/pilula/marca` (originais `titulo0/infos0/pilula0/marca0`) com `comAj` (translate+scale) e grava as caixas em `V._bx`; estilos com desenho próprio (selo, story, polaroid, legenda, mínimo) usam `bloco()`/`blocoInfos()`. Ajustes em `V.aj` = {titulo|infos|botao: {dx,dy,s}, logo: {canto "se|sd|ie|id", s}} guardados por estilo em `localStorage miga_vd_aj_<tema>` (valem para os próximos vídeos). Seleção `V.sel = "aj:<k>"`, barra com A−/A+, cantos (logo), "Voltar ao padrão". A logo, ao soltar, vai para o canto mais perto.
- Vídeo: cada item pode ser **tirado** (`aj[k].off`: desenha invisível para manter o layout, sem caixa de toque; "Pôr de volta" na barra padrão via `foraAj`). A **logo não arrasta**: só escolhe o canto.
- Vídeo: **cor do botão Link na bio** (`aj.botao.cor`, paleta `CORES_BOTAO_VD`; "tema" = cor do estilo). **Música**: saiu a chave "Música no vídeo"; na folha Música há "Sem música" (`V.musica=false` → sem trilha nenhuma, nem na abertura/final); a chave "Sem o som original" não liga mais a música sozinha. **Final desligado**: a folga do fim da gravação desenhava `quadroFinal` (tela creme) mesmo com final off → agora segura o último quadro do vídeo. **Capa**: padrão "Igual ao vídeo" (`capaTipo "quadro"` = `quadroVideo` com o estilo); "Título grande" é a antiga.
- Vídeo: ao tocar no botão do link, dá para **escrever o texto** (`#edAjBotao` → `V.botao`) ou escolher "Link na bio / Link na legenda / Link nos comentários / Comenta EU QUERO". Se o texto tiver "legenda", `legendaVideo` troca o `AVISO_BIO` pelo link do produto (`linkPost`, com nome da loja).
- Vídeo: **guias como no Instagram** ao arrastar (itens e camadas): perto do meio (26 px em 1080) encaixa no centro e mostra linha azul (`V._guia {v,h}`, desenhada só na prévia). Botão **Centralizar** na barra (itens: ajusta `dx`; camadas: `x=540`).
- Título (folha `folhaTituloModelo`, `#estTitTxt`): limite 60 → 100 letras (com 60 o título com emojis travava e "não digitava"), contador `#estTitConta`. No vídeo, `quebrarPartesTitulo` quebra linhas compridas (até 5 linhas, 940 px).
- Título do vídeo usa a largura toda: quebra em 1000 px / escala do título (`escT` = `aj.titulo.s`), então ao diminuir (A−) cabem mais palavras por linha (até 7 linhas).
- Vídeo: **"Sumiu algo? Pôr de volta"** no topo da barra (`sumidosAj`: tirado, botão sem texto ou arrastado para fora da tela) + **Restaurar tudo** (`V.aj = {}` do estilo e botão volta a "Link na bio"). Corrigido: "Pronto" não fechava a edição do título/preço/botão/logo (o `data-ed-ok` ficava depois do `if (!cm) return`).
- Publicar vídeo (vTema) no padrão das outras telas (a usuária recusou esboços com blocos/abas: "não fuja do padrão"): etiqueta rosa `rt-etapa` "Vídeo · Reels e Story", botões Texto/Selo/Figurinha/Frases como quadrinhos brancos (`.vd-estudio .ed-add`, igual `.est-btn`), dica curta, botão de som com ícone SVG (sem emoji).
- Vídeo: logo no canto escolhido agora bem no cantinho (margem 6 px + folga do círculo de fundo, antes 50/60).
- Vídeo sem o final: `tM = duracaoMeio()` (sem folga de 0,9 s nem arredondar na batida) e folga final 0,12 s — antes ficava até ~1,5 s parado no último quadro ("travada no final"). Teste: vídeo de 4,0 s gravou 4,04 s.
- Carrossel foto: além de arrastar, barrinhas "Para os lados" e "Para cima ou para baixo" (`data-ka2-pos="i:x|y"`, -100..100 → `foto.x/y`); o arrastar atualiza as barrinhas ao soltar. (A usuária não conseguia arrastar no celular; no teste com toque simulado funcionou.)
- Publicar vídeo "ficou lento": gravação em tempo real agora desenha no máximo 30 quadros/s (telas 90/120 Hz desenhavam até 4x mais), prévia copiada a cada 3 quadros, quebra do título guardada (`V._linhasT`), canvas `alpha:false`. Nova opção em Ajustes "Qualidade do vídeo": Alta (1080x1920) / Rápido (720x1280), guardada em `miga_vd_qual`.
- Folha do produto: ícone do botão Postar (`.fi-principal svg`) sem o quadrado branco: fundo rosa-claro translúcido e ícone branco.
- Carrossel com foto: (1) fundo "cor da foto" agora estica a beirada da própria foto em cada lado (`estenderBordas`, com blur 14px) em vez de uma cor média — some a emenda de cor. (2) As barrinhas mexem o TEXTO, não a foto: `tela.tp = {x (-1..1, ±320px), y (0..1, até 1000px, limitado para caber), s (0,6..1,4)}`; a foto continua no arrastar + "Tamanho da foto".
- Carrossel com foto: cor da letra muda **ponto a ponto** onde o texto passa (máscara de luz do fundo: `(0,62 - luz)/0,12`; camada escura #1d1d1f/rosa com `destination-out`, camada clara branco/amarelo com `destination-in`). O botão amarelo não muda.
- Carrossel com foto: a cor da letra agora muda **por palavra inteira** (a pedido): cada palavra mede a luz atrás dela (`escuroEm`); se 40% ou mais estiver em parte escura → branco/amarelo, senão preto/rosa. Substituiu a máscara ponto a ponto.
- Shopee link curto (s.shopee.com.br) sem dados ("não achei o código do produto no link": a Shopee não deixa o servidor seguir o link curto): botão `#ppLongo` "Puxar pelo link comprido" no produto (aparece quando falta foto/nome/preço e não há código no link). Folha com Abrir → copiar endereço comprido → colar; chama `api("produto")` com o link comprido, preenche nome/preço/foto/extras e mantém o link de afiliado curto. `idsShopeeLink` reconhece -i.loja.item, /product/, /opaanlp/, shopid/itemid.
- **Shopee automático pelo robô:** ao adicionar um produto Shopee sem foto/preço e sem código no link, o app grava `espacos/miga/robo/pendentes {itens:{id:link}}` (`dados.pendenteShopee`) e marca `item.pendenteRobo`. O robô (`completarShopee`, gatilho a cada 5 min, 1 leitura por rodada) segue o link curto pelos servidores do Google (UrlFetchApp sem seguir redirecionamento), acha loja/item, chama `/api/produto` com `shopee.com.br/product/L/I` e faz patch no item da lista (nome, preço, foto, extras, `pendenteRobo:null`). Desiste depois de 6 tentativas. Ao abrir o produto, o app relê o item da nuvem (`listaLerItem` → `puxarDoRobo`). Precisa rodar `instalar()` de novo no Apps Script para criar o gatilho de 5 min.
- Shopee pelo robô na hora: o worker, quando não acha o código no link curto, pergunta ao robô publicado como **App da Web** (`idsPeloRobo`: `ROBO_URL?link=&chave=ROBO_CHAVE`; segredos no Cloudflare: `ROBO_URL` (termina em /exec) e `ROBO_CHAVE`). No robô: `doGet` (só links curtos da Shopee e com a chave), `testarShopee()` para conferir se o Google abre o link, e log de cada redirecionamento em `codigoShopee`.
- Robô: a rodada de 30 min também põe na fila rápida os itens Shopee da lista já sem foto/preço (link curto), até 20 por vez; os que falharam 6 vezes ficam em `desistiu` e não voltam.
- Mercado Livre pelo robô: quando o link curto (meli.la ou /sec/) não traz código MLB, o worker chama `cadeiaPeloRobo` (mesmo App da Web, `ROBO_URL`); o robô `seguirML` segue os redirecionamentos pelo Google e devolve `{cadeia, pista}` (MLB/MLBU/p/). `testarML()` testa com o 1º link curto do ML da lista. Lembrar: depois de mudar o Codigo.gs, atualizar a implantação do App da Web (Gerenciar implantações → editar → Nova versão).
- ML link comprido da barra (ex.: /p/MLB75875212?...wid=MLB7277407626) não puxava: provavelmente a API de itens/página bloqueada para o servidor. Agora, se faltar foto ou preço, o worker pede ao robô (`paginaPeloRobo` → robô `paginaML`: abre a página pelo Google e lê og:title, og:image, price/original_price) e mostra `diag` se ainda faltar. Robô: `testarPaginaML()`.
- PC: conteúdo passava da tela (o `zoom` 1.1/1.2 de telas grandes multiplicava largura e margem). Regras no fim do style.css dividem max-width/margin-left pelo zoom. SW: navegação e .js/.css com `cache: "no-cache"` (o PC ficava preso numa versão velha com "Arquivos").
- `_headers`: `/app/` também com `Cache-Control: no-cache` (o PC continuava com a versão antiga).
