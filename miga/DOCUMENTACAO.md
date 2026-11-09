# Miga Promo — Documentação do projeto

> **Para quem vai analisar (ex.: Gemini):** este é um app real, já publicado em `https://alpama.app/miga/`.
> Leia esta documentação e os arquivos do projeto e sugira melhorias de **produto (funções)**,
> **experiência de uso (telas e textos)**, **qualidade das mensagens geradas pela IA**, **segurança**
> e **desempenho**. Para cada sugestão, diga o que muda, por que vale a pena e quais arquivos mexer.
> Restrições: o app precisa continuar sendo HTML + CSS + JavaScript puro (sem frameworks e sem etapa de build),
> publicado no Cloudflare Pages com um `_worker.js`, e usando Firebase (Authentication anônimo + Firestore).

---

## 1. O que é
**Miga Promo** é um aplicativo web instalável (PWA) para quem administra **grupos de promoções no WhatsApp**
voltados ao público feminino. A dona do app cola o **link de afiliado** de um produto do **Mercado Livre**, **Shopee**,
**Amazon** ou **Magalu**; o app busca foto, nome e preço; a **IA (Google Gemini)** escreve uma mensagem curta no tom de
"dica de amiga"; e o app ajuda a **enviar para os grupos** do WhatsApp. Tudo fica salvo num **histórico**.

- Uso: **interno** (só a dona usa), protegido por **código de acesso**.
- Endereço: `https://alpama.app/miga/` (mesmo domínio de outros apps da empresa: `/clockfit/`, `/sortia/`).
- Desenvolvido por **Alpama Soluções**.

## 2. Arquitetura

```
 Celular (PWA)                         Cloudflare Pages (alpama.app)                 Serviços externos
 ─────────────                         ─────────────────────────────                 ─────────────────
 miga/index.html  ───────────────────▶ arquivos estáticos (/miga/*)
 miga/app.js      ── fetch /miga/api ─▶ _worker.js ── /api/entrar  (confere APP_SENHA)
                                                    ── /api/produto ─────────────────▶ página do Mercado Livre / Shopee
                                                    ── /api/gerar   ─────────────────▶ Google Gemini (generateContent)
                                                    ── /api/imagem  ─────────────────▶ imagem do produto (proxy)
                                                    ── /api/status
 miga/app.js      ── Firebase JS SDK (10.12.2, via gstatic) ──────────────────────────▶ Firebase Auth (anônimo)
                                                                                     ▶ Firestore (histórico e grupos)
```

- **Sem servidor próprio além do `_worker.js`** (Cloudflare Workers no modo "advanced" do Pages).
- `_routes.json` faz o worker rodar **só** em `/miga/api/*`; o resto do site é servido direto como estático.
- **Segredos** ficam só em variáveis do Cloudflare: `GEMINI_API_KEY` (chave da IA) e `APP_SENHA` (código de acesso).
  Opcionais: `GEMINI_MODEL` (padrão `gemini-2.5-flash`), `ML_APP_ID` + `ML_SECRET` e `SHOPEE_APP_ID` + `SHOPEE_SECRET` (catálogo).
- O `firebase-config.js` tem a configuração **pública** do Firebase (projeto `miga-372d3`); a proteção dos dados
  é feita pelas **regras do Firestore**.

## 3. Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura de todas as telas: entrada (código), abas Criar / Histórico / Grupos, diálogos |
| `style.css` | Visual "adesivo": creme `#fff3c4`, rosa `#e8336d`, amarelo `#ffd23f`, preto `#1d1d1f`, contornos e sombras sólidas; fontes Poppins e Dancing Script |
| `app.js` | Toda a lógica do app (≈ 900 linhas, JavaScript puro) |
| `firebase-config.js` | Configuração pública do Firebase (`window.FIREBASE_CONFIG`) |
| `_worker.js` | Servidor: rotas `/api/*` (código, leitura do produto, IA, imagem, status) |
| `manifest.json` | PWA: nome, ícones, cores, `scope ./`, `share_target` (receber link pelo "Compartilhar" do Android) |
| `sw.js` | Service worker: cache "rede primeiro", só da pasta `/miga/`, só apaga os próprios caches |
| `firestore.rules` | Regras: cada usuário só lê/grava `usuarios/{uid}/**` |
| `logo.png`, `icone-*.png`, `apple-touch-icon.png`, `favicon.png` | Ícones |
| `TUTORIAL.md` | Passo a passo de publicação (Firebase, Gemini, Cloudflare) |

## 4. Funcionamento, passo a passo

### 4.1 Entrada (código de acesso)
1. A tela de entrada pede o **código de acesso**.
2. `app.js` envia `POST api/entrar { codigo }`; o `_worker.js` compara com `APP_SENHA`
   (comparação em tempo constante; erro demora 800 ms para dificultar tentativas).
3. Código certo → o app guarda o código no `localStorage` do aparelho (para não pedir de novo),
   faz **login anônimo no Firebase** (`signInAnonymously`) e abre o app.
4. O mesmo código vai no cabeçalho `x-app-senha` em todas as chamadas à API; se o código mudar no Cloudflare,
   a API responde 401 e o app volta à tela de entrada.
5. **Sair** (engrenagem) apenas tranca o app (apaga o código salvo); a conta anônima e os dados continuam.

### 4.2 Aba Criar
1. **Link do produto**: colar (botão "Colar" lê a área de transferência) ou receber pelo compartilhar do Android.
   A loja (Mercado Livre / Shopee) é detectada pelo endereço.
2. **Buscar foto, nome e preço** → `POST api/produto { url }`. O worker:
   - segue os redirecionamentos do link curto de afiliado até a página do produto;
   - lê **JSON-LD** (`@type: Product`), meta tags **Open Graph** (`og:title`, `og:image`) e o preço;
   - no Mercado Livre, tenta o **preço antigo** pelo texto "Antes: X reais com Y centavos";
   - limpa o nome (tira "| Mercado Livre", "- R$ 49,90", "Frete grátis"...);
   - Shopee normalmente **não** expõe o preço na página → o app avisa, rola até o campo de preço e o destaca.
   - Leituras ficam **guardadas por 30 minutos** (Cache API do Cloudflare) para não ler a mesma página de novo.
   - Enquanto busca, foto/nome/preço mostram **blocos piscando** (skeleton).
3. **Produto**: foto grande (toque abre em tela cheia; "Trocar foto" usa a galeria, reduzida para ~900 px),
   nome, preço antigo (opcional), preço novo, **categoria** (Moda e Looks, Beleza e Skincare, Casa e Decoração,
   Saúde e Fitness, Outros) e cupom (opcional; **cupons salvos** aparecem como etiquetas para tocar).
   Um selo mostra o desconto (%) na hora.
4. **Gerar Miga Promo** → `POST api/gerar` (ver seção 5). Se a IA falhar ou não estiver configurada,
   o app usa uma **mensagem pronta** (modelo fixo) e avisa.
5. **Mensagem pronta**: prévia igual ao WhatsApp (negrito/riscado/links formatados), "Editar texto",
   e envio:
   - **Enviar com foto**: Web Share API com o arquivo da imagem + texto (no WhatsApp dá para marcar vários grupos);
   - **Copiar** e **Só o texto** (Web Share ou `api.whatsapp.com/send?text=`);
   - lista dos **grupos cadastrados**: o botão "Enviar" copia a mensagem e abre o link de convite do grupo
     (o WhatsApp não permite postar automaticamente; a usuária cola).
6. Opcional: **convite no fim da mensagem** (link de um grupo escolhido é anexado ao texto).

### 4.2b Imagem com a cara do Miga (editor)
- Botão **"Criar imagem com a cara do Miga"** na mensagem pronta abre um editor (canvas 1080×1080 ou 1080×1920).
- Opções: formato (Quadrado/Story), fundo (Creme/Rosa/Branco), título, nome, texto de rodapé, cupom,
  mostrar preço, selo de desconto, marca d'água Miga (ícone no canto).
- **Usar imagem** substitui a foto no envio e no histórico (campo `card`, JPEG em data URL); **Baixar** salva no aparelho.

### 4.3 Aba Achados
- **Mais vendidos (catálogo automático):** `GET api/catalogo?filtro=moda|beleza|casa|fitness&loja=todas|mercadolivre|shopee`.
  O worker consulta as APIs oficiais e devolve `{ id, nome, preco, precoAntigo, imagem, link, loja, categoria, afiliado, comissao }`:
  - Mercado Livre: token `client_credentials` (guardado ~5 h) → `/highlights/MLB/category/{id}` (se a categoria não tiver lista,
    tenta as subcategorias) → `/items?ids=` e `/products/{id}`. O link **não** é de afiliado (o app avisa para trocar).
  - Shopee: Affiliate Open API (GraphQL `productOfferV2`, `sortType: 2` = vendas, assinatura SHA256) — o link já é de afiliado.
  - Resultado guardado 30 min (Cache API). "Gerar oferta" preenche a aba Criar.
- Busca rápida por termo nas 4 lojas, atalhos de ofertas/portais e **cupons salvos**.

### 4.4 Aba Histórico
- Todo produto gerado é salvo (Firestore) com: foto (URL da loja ou imagem da galeria em data URL), nome, preços,
  loja, categoria, cupom, link, texto, data e **para onde já foi enviado**.
- "Gerar outra" do mesmo produto atualiza o mesmo item. Editar o texto salva sozinho.
- Ações: buscar, **Abrir** (volta para a aba Criar com tudo preenchido), **Copiar**, **Apagar**, **Apagar tudo**
  (sempre com confirmação no visual do app).

### 4.5 Aba Grupos
- Cadastro de vários grupos: nome + link de convite (`https://chat.whatsapp.com/...`).
- Escolha do grupo cujo convite vai no fim das mensagens.

### 4.6 Instalação (PWA)
- Android/Chrome: botão **Instalar** (evento `beforeinstallprompt`).
- iPhone: dica "Compartilhar → Adicionar à Tela de Início".
- `share_target`: com o app instalado no Android, o "Compartilhar" do app da loja oferece o Miga Promo
  e o link chega preenchido.

## 5. A IA (o que ela faz)
A IA **só escreve o texto da mensagem**. Ela **não** busca produtos, **não** lê a página da loja e **não**
gera link de afiliado. Busca de dados e envio são feitos por código comum.

- Modelo: **Google Gemini** (`gemini-2.5-flash` por padrão), via REST `v1beta/models/{modelo}:generateContent`,
  chamado **só pelo `_worker.js`** (a chave nunca vai para o celular). `temperature: 0.9`, `maxOutputTokens: 1024`.
- **`systemInstruction`** (constante `INSTRUCAO`): papel da curadora Miga Promo + regras fixas (estrutura da
  mensagem, preço uma vez só, benefícios coerentes com o produto, não inventar frete/parcelamento/avaliações/
  promessas de saúde, sem hashtags, até 600 caracteres, responder só com a mensagem).
- **Exemplos (few-shot)** (constante `EXEMPLOS`): 2 pares entrada → mensagem ideal, enviados antes do pedido.
- **Pedido** (função `dadosDoProduto`): nome, loja, categoria (com o foco de benefícios), preço antigo,
  preço novo (com a economia), cupom e link.
- **Ajustes** (botões "Mais curto", "Mais emojis", "Focar no preço", "Mais animada"): o app manda o texto atual
  + o ajuste; a IA reescreve mantendo as regras e o link (constante `AJUSTES`).
- Se o texto da IA não contiver o link, o worker acrescenta `👉 [link]` no fim.
- Se a IA falhar ou não estiver configurada, o app usa uma mensagem pronta e avisa.

## 6. Dados (Firestore)
```
usuarios/{uid}/historico/{id}   → { id, criadoEm, produto: {nome, precoAntigo, precoNovo, link, categoria, loja, cupom},
                                    texto, imagem, card?, cardOpcoes?, enviadoPara: [..], ultimoEnvio }
usuarios/{uid}/config/app       → { grupos: [{id, nome, link}], convite, cupons: ["MIGA10", ...], atualizadoEm }
```
- `uid` = conta **anônima** do Firebase (presa ao aparelho/navegador). Trocar de celular ou limpar dados do
  navegador = nova conta (o histórico antigo não aparece).
- Sem Firebase configurado, o app usa **modo local** (IndexedDB + localStorage).

## 7. Segurança
- Código de acesso conferido no servidor; chave da IA só no servidor.
- `/api/produto` e `/api/imagem` só aceitam domínios do Mercado Livre e da Shopee, **só https, sem porta e sem
  usuário/senha na URL**; cada redirecionamento é conferido (proteção contra SSRF).
- **Limite de tentativas** do código: 10 erros do mesmo IP → bloqueio de 15 minutos (Cache API do Cloudflare;
  vale por data center — é uma barreira simples, não um firewall).
- Regras do Firestore isolam os dados por conta.
- Pasta `/miga/` com `noindex` (fora do Google).

## 8. Limitações conhecidas
1. **Link de afiliado**: o Mercado Livre não tem API para gerar link; a usuária copia do botão "Compartilhar".
   (A Shopee tem uma API de afiliados que gera links — ainda não integrada.)
2. **Leitura do produto** é por leitura da página ("melhor esforço"): pode falhar se a loja mudar a página ou
   bloquear; Shopee raramente traz o preço.
3. **Envio para grupos** não é automático (limitação do WhatsApp).
4. **Conta anônima** não sincroniza entre aparelhos.
5. Fotos da galeria são guardadas no Firestore como data URL, reduzidas no aparelho (800 px, JPEG 72% ≈ 60–150 KB).
6. Sem testes automatizados no repositório; testes foram feitos com navegador automatizado e serviços simulados.

## 9. Ideias já levantadas (para avaliar)
- Aba **"Achados"** com os **mais vendidos por categoria**: Mercado Livre (API `/highlights/MLB/category/{id}`,
  precisa de app cadastrado) e Shopee (API de afiliados, ordena por vendas/comissão e **gera o link sozinha**).
- Login com Google para usar em mais de um aparelho.
- Agendar mensagens / fila de envio.
- Variações de mensagem (A/B) e estatísticas de cliques.
