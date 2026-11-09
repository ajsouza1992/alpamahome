# Alpama Promo — gerador de mensagens de promoção

App (PWA) para quem administra grupos de promoção: cole o **link de afiliado do Mercado Livre**,
o app busca nome, preço e foto, e a **IA (Gemini)** escreve a mensagem pronta para o WhatsApp.

```
Link de afiliado ──► /api/produto (lê o produto) ──► você confere/edita
                                                    │
                     /api/gerar (Gemini) ◄──────────┘
                            │
                            ▼
        Prévia estilo WhatsApp → Enviar no WhatsApp / Compartilhar / Copiar
```

## Como funciona

| Parte | Onde roda | O que faz |
|---|---|---|
| `index.html`, `app.js`, `app.css` | No celular (PWA instalável) | Tela do app, histórico, compartilhar |
| `functions/api/produto.js` | Cloudflare (servidor) | Segue o link curto e extrai nome, preço, preço antigo e foto |
| `functions/api/gerar.js` | Cloudflare (servidor) | Chama o Gemini com o prompt de copywriting |
| `functions/api/imagem.js` | Cloudflare (servidor) | Entrega a foto para compartilhar junto com o texto |
| `lib/gemini.js` | — | **O prompt** (edite aqui para mudar o estilo das mensagens) |

- **A chave do Gemini fica só no servidor**, nunca no celular.
- **Senha de acesso** (`APP_SENHA`): sem ela, ninguém consegue usar sua cota da IA.
- **Sem IA configurada** (ou se ela falhar), o app usa modelos de mensagem prontos e continua funcionando.
- **Link de afiliado:** o Mercado Livre não tem API para converter links. Use o botão **Compartilhar** do
  Mercado Livre (já gera o seu link) e cole no app. No Android, com o app instalado, dá para escolher
  **Alpama Promo** direto na lista do "Compartilhar".

## Publicar (Cloudflare Pages — grátis)

1. Cloudflare → **Workers & Pages → Criar → Pages → Conectar ao Git** → repositório `alpamahome`.
2. Configuração:
   - **Diretório raiz (Root directory): `promo`**
   - Framework: **Nenhum** · Comando de build: **(vazio)** · Diretório de saída: **`/`** (ou `.`)
3. **Configurações → Variáveis e segredos** (marque como *Secret*):
   - `GEMINI_API_KEY` — chave criada em **aistudio.google.com → Get API key**
   - `APP_SENHA` — uma senha sua (o app pede uma vez e guarda no aparelho)
   - opcional `GEMINI_MODEL` — padrão `gemini-2.5-flash`; troque se o Google lançar um modelo mais novo
   - opcional `ML_TOKEN` — token da API do Mercado Livre, se você cadastrar um app em developers.mercadolivre.com.br
4. Refaça o deploy depois de salvar as variáveis.
5. Domínio: **Domínios personalizados** → ex.: `promo.alpama.app`.

## Instalar no celular

Abra o endereço no Chrome (Android) ou Safari (iPhone) → **Adicionar à tela inicial**.

## Testar no computador

```bash
cd promo
cp .dev.vars.exemplo .dev.vars   # coloque sua chave e senha
npx wrangler pages dev .
```

## Limitações conhecidas

- A leitura do produto é "melhor esforço": se o Mercado Livre mudar a página ou bloquear o acesso,
  o app avisa e você preenche nome e preço à mão (leva 10 segundos).
- Confira sempre o preço antes de enviar — promoções mudam rápido.
