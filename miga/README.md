# Miga Promo — Achadinhos & Descontos

PWA para gerar mensagens de promoção com IA (Gemini) no tom "dica de amiga", prontas para o WhatsApp.
Desenvolvido por **Alpama Soluções**.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html`, `style.css`, `app.js` | O app (roda no celular) |
| `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png` | PWA instalável e cache offline |
| `functions/api/gerar.js` | Servidor: monta o prompt e chama o Gemini (**a chave fica aqui, via variável**) |
| `functions/api/status.js` | Informa se a IA está configurada |

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

- Texto/estilo das mensagens: função `montarPrompt` em `functions/api/gerar.js`.
- Cores: variáveis no topo de `style.css`.

## Deixar o app só para você (recomendado)

Cloudflare → **Zero Trust → Access → Applications → Add an application → Self-hosted**:
- Domínio: `miga.alpama.app` (o mesmo do app)
- Política: **Allow** → *Include* → **Emails** → o seu e-mail
- Método de login: **One-time PIN** (o Cloudflare manda um código para o seu e-mail)

Pronto: qualquer outra pessoa que abrir o endereço vê só a tela de bloqueio do Cloudflare.
O login dura o tempo configurado (ex.: 1 mês) e é grátis para até 50 usuários.
