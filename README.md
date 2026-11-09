# Alpama Home

Vitrine de produtos para casa (decoração, cama, cozinha, área de lazer...) com **links de afiliado** do Mercado Livre, Shopee e Amazon.

Site estático: HTML + CSS + JavaScript puro, sem servidor e sem banco de dados.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O site público (vitrine com busca e filtros) |
| `admin.html` | Seu painel para cadastrar/editar produtos |
| `produtos.js` | **O catálogo** — lista de produtos e categorias |
| `assets/` | Estilos e scripts |

## Como adicionar produtos

1. Gere o link de afiliado no Mercado Livre (barra de afiliados → *Compartilhar*) ou na Shopee (*Shopee Afiliados* → *Obter link*).
2. Abra `admin.html` no navegador (ex.: `https://SEU-SITE/admin.html`).
3. Cole o link (a loja é detectada sozinha), preencha nome, preço, categoria e a URL da imagem
   (na página do produto: botão direito na foto → *Copiar endereço da imagem*).
4. Clique em **Pré-visualizar no site** para conferir.
5. Clique em **Baixar produtos.js** e substitua o `produtos.js` do repositório
   (no GitHub: *Add file → Upload files* → arraste o arquivo → *Commit changes*).

> O painel salva um rascunho só no seu navegador. O site público só muda quando você envia o novo `produtos.js`.
> Use **Importar arquivo** para continuar editando em outro computador.

## Filtros do site

- Busca por texto (ignora acentos)
- Categorias
- Faixa de preço (mínimo/máximo e atalhos: até R$ 50, R$ 50–100, ...)
- Loja (Mercado Livre / Shopee / Amazon)
- Só produtos com desconto
- Ordenação: destaques, menor/maior preço, maior desconto, A–Z

Os filtros ficam na URL, então dá para compartilhar uma busca (ex.: `?cat=quarto&max=200`).

## Categorias

Edite a lista `window.CATEGORIAS` no topo do `produtos.js` para criar, renomear ou trocar ícones.

## Publicar grátis (GitHub Pages)

No repositório: **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
O site fica em `https://SEU-USUARIO.github.io/alpamahome/`.

Para testar localmente basta abrir `index.html` no navegador.
