# Robô da Miga Promo (Google Apps Script)

Roda sozinho a cada 30 minutos, mesmo com o app fechado:

- confere o preço dos produtos do **Site** e da **Minha lista** (cada um no máximo a cada 6 horas);
- põe o seu link de afiliado da **Shopee** e o link direto do **Mercado Livre** com o seu código;
- tira do site os anúncios **encerrados** e esconde os **pausados**;
- refaz os pacotes que o site lê;
- manda um **e-mail** quando um preço **baixa** 10% ou mais (para você postar na hora).

## Instalar (uma vez só)

1. **Crie a chave do robô no Cloudflare.**
   - Abra o projeto **migapromo** e vá em **Configurações → Variáveis e segredos → Adicionar**.
   - **Nome:** `ROBO_CHAVE`.
   - **Valor:** uma senha comprida, com 24 ou mais letras e números.
   - **Tipo:** Segredo (Secret).
   - Salve e faça uma **nova implantação** (suba o `migapromo_site.zip`).
2. **Crie o projeto do robô.**
   - Entre em **script.google.com** com a **mesma conta Google dona do Firebase da Miga** (`miga-promo-d4f51`).
   - Clique em **Novo projeto** e dê o nome "Robô da Miga Promo".
3. **Cole o código.**
   - Apague o que vier no arquivo `Código.gs` e cole todo o conteúdo de `Codigo.gs`.
   - Em **Configurações do projeto** (engrenagem), marque **"Mostrar o arquivo de manifesto appsscript.json"**.
   - Volte ao editor e troque o conteúdo de `appsscript.json` pelo deste pacote.
4. **Cadastre a chave no robô.**
   - Em **Configurações do projeto → Propriedades do script**, adicione:
     - `ROBO_CHAVE` = a **mesma** senha do passo 1.
     - `EMAIL` (opcional): para onde mandar os avisos. Sem ele, vai para a conta dona do robô.
     - `QUEDA_MIN` (opcional): a queda mínima em % para avisar. O padrão é `10`.
5. **Ligue o robô.**
   - No editor, escolha a função **`instalar`** e clique em **Executar**.
   - Na primeira vez, o Google pede permissão:
     - escolha a sua conta;
     - clique em **Avançado → Acessar Robô da Miga Promo (não seguro)**. Esse aviso aparece porque o robô é seu, não é um app publicado;
     - clique em **Permitir**.
   - Pronto: ele roda agora e depois a cada 30 minutos.

## Conferir

- Rode **`testar`** para fazer uma rodada e ver o resumo no **Registro de execução**: quantos produtos foram conferidos, quantos preços mudaram e quantos saíram do site.
- Em **Execuções** (ícone de lista, à esquerda), aparece cada rodada e se deu erro.

## Erros comuns

- **"O servidor recusou a ROBO_CHAVE"**: a chave do Cloudflare e a do robô estão diferentes, ou falta a nova implantação no Cloudflare.
- **"Firestore ... 403"**: a conta Google do robô não é a dona do Firebase da Miga.
- Para desligar o robô, rode **`desinstalar`**.
