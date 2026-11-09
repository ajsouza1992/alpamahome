# Alpama Home

Vitrine de produtos para casa (decoração, cama, cozinha, área de lazer...) com **links de afiliado do Mercado Livre**.

Site estático: HTML + CSS + JavaScript puro, sem servidor e sem banco de dados.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O site público (vitrine com busca e filtros) |
| `admin.html` | Área do moderador (abas Cadastro, Produtos e Publicar) — não aparece no site; acesse digitando `/admin.html` |
| `produtos.js` | **O catálogo** — lista de produtos e categorias |
| `assets/js/icones.js` | Ícones das categorias no estilo do logo |
| `assets/img/logo.png` | Logo / ícone do site |
| `assets/` | Estilos e scripts |

## Como adicionar produtos

1. No Mercado Livre, abra o produto e use a barra de afiliados → *Compartilhar* → copie o link.
2. Abra `SEU-SITE/admin.html` (o endereço não aparece para os clientes). Na aba **Cadastro**:
   - **1 · Link** — cole o link de afiliado (o painel avisa se não for do Mercado Livre);
   - **2 · Imagem** — clique para enviar uma foto, arraste, cole com Ctrl+V, ou cole o endereço da imagem;
   - **3 · Dados** — nome, preço, preço antigo (opcional), categoria e descrição.
3. Clique em **Ver site** para conferir.
4. Na aba **Publicar**, clique em **Baixar produtos.js** e substitua o `produtos.js` do repositório
   (no GitHub: *Add file → Upload files* → arraste o arquivo → *Commit changes*).

> O painel salva um rascunho só no seu navegador. O site público só muda quando você envia o novo `produtos.js`.
> Fotos enviadas do computador são reduzidas e gravadas dentro do `produtos.js`; para muitos produtos, prefira colar o endereço da imagem.

## Filtros do site

- Busca por texto (ignora acentos)
- Categorias
- Faixa de preço (mínimo/máximo e atalhos: até R$ 50, R$ 50–100, ...)
- Loja (aparece automaticamente quando houver mais de uma)
- Só produtos com desconto
- Ordenação: destaques, menor/maior preço, maior desconto, A–Z

Os filtros ficam na URL, então dá para compartilhar uma busca (ex.: `?cat=quarto&max=200`).

## Categorias

Edite a lista `window.CATEGORIAS` no topo do `produtos.js` para criar, renomear ou trocar ícones.

## Publicar grátis (GitHub Pages)

No repositório: **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
O site fica em `https://SEU-USUARIO.github.io/alpamahome/`.

Para testar localmente basta abrir `index.html` no navegador.
