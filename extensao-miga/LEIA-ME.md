# Extensão Miga Promo para o Chrome (computador)

## Como instalar (uma vez só)
1. Descompacte o arquivo `extensao-miga.zip` numa pasta do computador (por exemplo, em Documentos).
2. No Chrome, abra o endereço `chrome://extensions`.
3. Ligue **Modo do desenvolvedor** (canto de cima, à direita).
4. Clique em **Carregar sem compactação** e escolha a pasta `extensao-miga`.
5. Pronto: a extensão "Miga Promo · Achadinhos" aparece na lista. Fixe o ícone na barra se quiser.

Também funciona no Microsoft Edge (`edge://extensions`, mesmo caminho).

## Como usar
1. Entre no site do Mercado Livre (ou da Shopee) e busque, por exemplo, "calça jeans".
2. Em cada produto aparece o botão **+ Miga**. Toque nos que você quer (ficam rosa: "Na Miga").
   - Pode rolar, trocar de página e buscar outras coisas: os marcados continuam guardados.
   - "Marcar todos da página" marca todos de uma vez.
   - Dentro da página de um produto, use "+ Este produto".
3. Toque em **Enviar N para a Miga** na barra de baixo.
4. O app abre com todos na **Caixa de importação**: confira, marque e toque em **Adicionar à Minha lista**.
   O seu código de afiliado entra sozinho.

## Como ela é feita
- `manifest.json`: diz ao Chrome o nome, o ícone e em quais sites a extensão funciona (Mercado Livre e Shopee).
- `content.js`: põe o botão "+ Miga" nos produtos, guarda os marcados e, ao enviar, abre o app com os links.
- `content.css`: o visual do botão e da barra (cores da Miga).
- A extensão não lê nada por conta própria nem manda dados para outro lugar: só abre o app da Miga com os links que você marcou.

Se o app mudar de endereço, troque a linha `const APP = "https://www.migapromo.com/app/";` no `content.js`.

## Baixar o vídeo do anúncio (versão 1.7)

1. Abra a página do produto na **Shopee** ou no **Mercado Livre**.
2. Se o anúncio tiver vídeo, aparece o botão **Baixar vídeo** na barra da Miga, embaixo.
3. Clique nele. O vídeo do vendedor vai para a pasta **Downloads → miga-videos**, com o nome do produto.
4. Se aparecer "Não achei vídeo neste anúncio", abra o vídeo nas fotos do produto (toque no play) e clique de novo.
5. Se aparecer "o navegador não deixa baixar direto", esse vídeo vem em pedacinhos. Use a gravação de tela ou peça o vídeo ao vendedor.

Depois, no app da Miga, em **Publicar vídeo**: escolha o vídeo, ligue **Sem o som original**, escolha a música e coloque o preço.

**Ao atualizar para esta versão:** em `chrome://extensions`, clique em **Atualizar** (ou remova e carregue de novo a pasta). O Chrome vai pedir a permissão **"Gerenciar seus downloads"**: é ela que deixa a extensão salvar o vídeo.
