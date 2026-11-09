# Alpama Home — alpama.app

Vitrine de achados para casa com **links de afiliado do Mercado Livre**.

- **`alpama.app`** — o site dos clientes: abre direto nos produtos, com busca e filtros. Sem login.
- **`alpama.app/admin`** — área do moderador (só você): login com e-mail e senha, cadastro de produtos.
  O que você salva aparece no site na hora (para os visitantes, em até 5 minutos por causa do cache).

Tecnologia: site estático (HTML/CSS/JS) no **Cloudflare Pages** + **Firebase** (Authentication e Firestore).

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | Site dos clientes |
| `admin.html` | Área do moderador (login + abas Cadastro, Produtos, Conta) |
| `assets/js/firebase-config.js` | **Onde você cola o `firebaseConfig`** |
| `firestore.rules` | Regras de segurança (cole no Firebase) |
| `produtos.js` | Categorias + produtos de exemplo (usados enquanto o Firebase não está configurado) |
| `assets/js/icones.js` | Ícones das categorias no estilo do logo |
| `_headers`, `robots.txt`, `sitemap.xml` | Configurações do Cloudflare e dos buscadores |

---

## 1. Configurar o Firebase

1. Em **console.firebase.google.com** → **Adicionar projeto**.
2. **Authentication** → *Vamos começar* → ative **E-mail/senha** → aba **Usuários** → **Adicionar usuário** (seu e-mail e senha).
   Copie o **UID** que aparece na lista.
3. **Firestore Database** → *Criar banco de dados* → local **southamerica-east1 (São Paulo)** → modo **produção**.
4. **Firestore → Regras**: cole o conteúdo de `firestore.rules`, troque `COLE_SEU_UID_AQUI` pelo seu UID e clique em **Publicar**.
5. **Configurações do projeto → Seus apps → `</>` (Web)** → registre o app e copie o `firebaseConfig`.
   Cole em `assets/js/firebase-config.js` no lugar de `window.FIREBASE_CONFIG = null;`.
6. **Authentication → Configurações → Domínios autorizados** → adicione `alpama.app` (e o endereço `*.pages.dev` do Cloudflare, se for testar por ele).

> Não é preciso ativar o Firebase Storage (que exige plano pago): as fotos enviadas pelo painel
> são reduzidas (~50 KB) e ficam dentro do próprio produto. Colar o endereço da imagem do
> Mercado Livre deixa o site ainda mais leve.

## 2. Publicar no Cloudflare Pages

1. Cloudflare → **Workers & Pages → Criar → Pages → Conectar ao Git** → repositório `alpamahome`.
2. Configuração de build: **Framework: Nenhum**, **Comando de build: (vazio)**, **Diretório de saída: `/`**.
3. Depois do primeiro deploy: **Domínios personalizados → Configurar domínio** → `alpama.app`
   (se o domínio já está no Cloudflare, o DNS é configurado sozinho).
4. A cada alteração no GitHub o Cloudflare publica de novo automaticamente.

## 3. Usar no dia a dia

1. No Mercado Livre, abra o produto → barra de afiliados → **Compartilhar** → copie o link.
2. Acesse **alpama.app/admin** e entre com seu e-mail e senha (o navegador lembra o login).
3. Aba **Cadastro**: cole o link, coloque a imagem (enviar foto, arrastar, Ctrl+V ou colar o endereço),
   preencha nome, preço e categoria → **Cadastrar produto**. Pronto, já está no site.
4. Aba **Produtos**: editar ou excluir. Aba **Conta**: baixar backup, importar produtos, sair.

Para trazer os produtos de exemplo/rascunhos antigos: aba **Conta → Importar produtos.js**.

## Segurança

- O `firebaseConfig` é público por natureza; quem protege os dados são as **regras do Firestore**:
  todos podem **ler** os produtos, só o seu **UID** pode **gravar ou apagar**.
- O painel não tem link no site e não aparece em buscadores (`robots.txt`, `noindex`).

## Filtros do site

Busca (ignora acentos), categorias, faixa de preço (mín./máx. e atalhos), só com desconto e ordenação.
Os filtros ficam na URL, então dá para compartilhar uma busca (ex.: `alpama.app/?cat=quarto&max=200`).
Para criar ou renomear categorias, edite `window.CATEGORIAS` em `produtos.js`.
