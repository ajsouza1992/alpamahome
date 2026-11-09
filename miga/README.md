# Miga Promo — Achadinhos & Descontos

PWA para gerar mensagens de promoção com IA (Gemini) no tom "dica de amiga", prontas para o WhatsApp.
Desenvolvido por **Alpama Soluções**.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html`, `style.css`, `app.js` | O app (roda no celular) |
| `manifest.json`, `sw.js`, ícones (`icon-*.png`, `maskable-512.png`, `apple-touch-icon.png`, `simbolo.svg`) | PWA instalável e cache offline |
| `_worker.js` | Servidor no Cloudflare: busca do produto, IA (Gemini), imagem e status (**a chave fica numa variável**) |

> A chave do Gemini **não** fica no `app.js`: tudo que está no app pode ser visto por qualquer pessoa.
> Ela é guardada como segredo no Cloudflare (`GEMINI_API_KEY`).

## Publicar no Cloudflare Pages

1. **Workers & Pages → Criar → Pages → Conectar ao Git** → repositório `alpamahome`.
2. Branch: `ccr-7374c7ca-pithl7` (ou `main`, depois de juntar) · **Diretório raiz: `miga`** ·
   Framework: Nenhum · Comando de build: vazio · Diretório de saída: `/`.
3. **Configurações → Variáveis e segredos** (tipo *Secret*/criptografado):
   - `GEMINI_API_KEY` = sua chave do Google AI Studio
   - `APP_SENHA` = uma senha sua (o app pede uma vez, na engrenagem)
   - opcional `GEMINI_MODEL` (padrão `gemini-2.5-flash`)
4. **Implantações → Tentar novamente** para aplicar as variáveis.
5. **Domínios personalizados** → ex.: `miga.alpama.app`.
6. No celular: abrir o endereço → engrenagem → senha → menu do navegador → **Adicionar à tela inicial**.

## Personalizar

- Texto/estilo das mensagens: função `montarPrompt` em `_worker.js`.
- Cores: variáveis no topo de `style.css`.

## Deixar o app só para você (recomendado)

Cloudflare → **Zero Trust → Access → Applications → Add an application → Self-hosted**:
- Domínio: `miga.alpama.app` (o mesmo do app)
- Política: **Allow** → *Include* → **Emails** → o seu e-mail
- Método de login: **One-time PIN** (o Cloudflare manda um código para o seu e-mail)

Pronto: qualquer outra pessoa que abrir o endereço vê só a tela de bloqueio do Cloudflare.
O login dura o tempo configurado (ex.: 1 mês) e é grátis para até 50 usuários.

## Instalar no celular

- **Android (Chrome):** aparece o botão **Instalar** no topo do app. Depois de instalado, o Miga Promo
  também aparece no "Compartilhar" do app do Mercado Livre/Shopee: escolha-o e o link já chega preenchido.
- **iPhone (Safari):** o app mostra a dica — **Compartilhar → Adicionar à Tela de Início**.
- O botão só aparece no endereço publicado com HTTPS (ex.: `miga.alpama.app`), não na prévia.

## Busca automática

Ao colar o link, o app tenta trazer **foto, nome e preço**. O Mercado Livre costuma trazer tudo;
a Shopee geralmente traz foto e nome, mas **o preço precisa ser digitado** (a Shopee não mostra o preço
no código da página). Se algo faltar, o app avisa. "Trocar foto" usa uma imagem da galeria.

## Publicar

Siga o passo a passo em **[TUTORIAL.md](TUTORIAL.md)** (Firebase + Firestore + Cloudflare Pages).

## Recursos

- **Entrada com login anônimo** (Firebase Authentication).
- **Histórico e grupos no Firestore** em `usuarios/{uid}/historico` e `usuarios/{uid}/config/app`
  (regras em `firestore.rules`). Sem `firebase-config.js` preenchido, o app usa o próprio navegador (modo local).
- **Grupos**: cadastre nome + link de convite; o botão Enviar copia a mensagem e abre o grupo.
  "Enviar com foto" abre o compartilhamento do celular, onde dá para marcar vários grupos.
- **Foto do produto em tela cheia** (toque na foto), sem marca d'água.
- Confirmações e avisos no visual do app.
