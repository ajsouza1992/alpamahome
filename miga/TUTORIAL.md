# Como colocar o Miga Promo no ar

Tempo total: uns 30 minutos. Você vai usar 4 serviços gratuitos:

| Serviço | Para quê |
|---|---|
| **GitHub** | Onde fica uma cópia do código (repositório `alpamahome`, pasta `miga`) |
| **Firebase** | Login anônimo + **Firestore** (guarda histórico e grupos) |
| **Google AI Studio** | Chave da IA (Gemini) que escreve as mensagens |
| **Cloudflare Pages** | Publica o app em `miga.alpama.app` |

---

## Parte 1 — Firebase (login e banco de dados)

### 1.1 Criar o projeto
1. Acesse **console.firebase.google.com** e entre com sua conta Google.
2. Clique em **Adicionar projeto** → nome: `miga-promo` → avance.
3. O Google Analytics é opcional (pode desativar) → **Criar projeto**.

### 1.2 Ativar o login anônimo
1. No menu da esquerda: **Criação → Authentication → Vamos começar**.
2. Aba **Método de login** → clique em **Anônimo** → ative → **Salvar**.
3. Aba **Configurações → Domínios autorizados → Adicionar domínio** → digite `miga.alpama.app` → **Adicionar**.
   (Se for testar pelo endereço `....pages.dev` do Cloudflare, adicione ele também.)

### 1.3 Criar o Firestore
1. Menu: **Criação → Firestore Database → Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)** → **Avançar**.
3. Escolha **Iniciar no modo de produção** → **Criar**.
4. Abra a aba **Regras**, apague tudo que estiver lá e cole o conteúdo do arquivo
   **`miga/firestore.rules`** do repositório. Clique em **Publicar**.
   > Essas regras fazem com que cada conta só veja os próprios dados.

### 1.4 Pegar a configuração do app
1. Clique na **engrenagem** (ao lado de "Visão geral do projeto") → **Configurações do projeto**.
2. Role até **Seus apps** → clique no ícone **`</>`** (Web).
3. Apelido: `Miga Promo` → **Registrar app** (não marque o Hosting).
4. Vai aparecer um bloco assim — **copie só a parte entre chaves**:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "miga-promo.firebaseapp.com",
     projectId: "miga-promo",
     storageBucket: "miga-promo.appspot.com",
     messagingSenderId: "123...",
     appId: "1:123...:web:abc..."
   };
   ```

### 1.5 Colar a configuração no app
Veja o passo **3.1** (ou me mande o bloco que eu preencho). No arquivo **`firebase-config.js`**,
troque a linha `window.FIREBASE_CONFIG = null;` por:
   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "miga-promo.firebaseapp.com",
     projectId: "miga-promo",
     storageBucket: "miga-promo.appspot.com",
     messagingSenderId: "123...",
     appId: "1:123...:web:abc..."
   };
   ```
   (com os **seus** valores do passo 1.4)

> Esses dados do Firebase podem ficar no código: eles são públicos por natureza.
> A proteção dos dados é feita pelas regras do passo 1.3.

---

## Parte 2 — Chave da IA (Gemini)

1. Acesse **aistudio.google.com** → **Get API key → Create API key**.
2. Copie a chave (normalmente começa com `AIza`). **Não cole essa chave no código nem no GitHub** —
   ela vai só no Cloudflare (Parte 3).

---

## Parte 3 — Cloudflare Pages (publicar o site)

Você recebe o arquivo **`miga-promo-site.zip`**. Ele já tem tudo: telas, ícones e o servidor da IA (`_worker.js`).

### 3.1 Antes de subir: colocar a configuração do Firebase
O arquivo `firebase-config.js` dentro do zip vem vazio. Escolha um jeito:
- **Mais fácil:** me mande o bloco `firebaseConfig` (Parte 1.4) que eu devolvo o zip já preenchido; **ou**
- **Você mesma:** descompacte o zip, abra `firebase-config.js` no Bloco de Notas, troque
  `window.FIREBASE_CONFIG = null;` pelo bloco da Parte 1.5, salve e **compacte a pasta de novo**
  (os arquivos precisam ficar na raiz do zip, não dentro de outra pasta).

### 3.2 Subir o site (arrastar e soltar)
1. Acesse **dash.cloudflare.com** → **Workers & Pages → Criar → Pages**.
2. Escolha **Fazer upload de ativos** (*Upload assets*).
3. Nome do projeto: `miga-promo` → **Criar projeto**.
4. **Arraste o `miga-promo-site.zip`** para a área de upload → **Implantar site**.
5. Em alguns segundos aparece o endereço `miga-promo.pages.dev`.

### 3.3 Colocar a chave da IA e a senha
1. No projeto: **Configurações → Variáveis e segredos → Adicionar** (ambiente **Produção**).
2. Adicione (tipo **Segredo / Criptografar**):
   | Nome | Valor |
   |---|---|
   | `GEMINI_API_KEY` | a chave da Parte 2 |
   | `APP_SENHA` | uma senha que você inventar (o app pede uma vez, na engrenagem) |
3. **Salvar**.
4. Para as variáveis valerem, faça uma nova implantação: **Implantações → Criar implantação**
   e arraste o mesmo `miga-promo-site.zip` de novo.

> Sempre que eu te mandar uma versão nova do app, é só repetir: **Criar implantação** → arrastar o zip novo.

### 3.4 Usar o domínio alpama.app
1. No projeto: **Domínios personalizados → Configurar um domínio**.
2. Digite `miga.alpama.app` → **Continuar → Ativar domínio**.
   Como o `alpama.app` já está no Cloudflare, o resto é automático (alguns minutos).
3. Lembre de autorizar esse domínio no Firebase (Parte 1.2, item 3).

> **Alternativa pelo GitHub:** em vez do upload, dá para usar *Conectar ao Git* com o repositório
> `alpamahome` e **Diretório raiz `miga`** (comando de build vazio, saída `/`). Aí o site atualiza sozinho
> a cada mudança no GitHub. Os passos 3.3 e 3.4 são iguais.

---

## Parte 4 — Instalar no celular

1. Abra **https://miga.alpama.app** no celular.
2. Toque em **Entrar** (login anônimo).
3. Toque na **engrenagem** → coloque a **senha** (`APP_SENHA`) → **Salvar**.
4. Instale:
   - **Android (Chrome):** toque em **Instalar** no topo do app.
   - **iPhone (Safari):** **Compartilhar** → **Adicionar à Tela de Início**.

---

## Conferindo se deu tudo certo

| Teste | Resultado esperado |
|---|---|
| Abrir o app | Tela de entrada com o botão **Entrar** |
| Engrenagem | "IA conectada" e "Conta anônima · código ..." |
| Colar um link do Mercado Livre → Buscar | Foto, nome e preço preenchidos |
| Gerar | Mensagem escrita pela IA (sem o aviso de "mensagem pronta") |
| Firebase → Firestore → Dados | Aparece `usuarios / (seu código) / historico` |

## Problemas comuns

| Mensagem no app | Como resolver |
|---|---|
| "O login anônimo não está ativado" | Passo 1.2 (ativar **Anônimo**) |
| "Este endereço não está autorizado" | Passo 1.2, item 3 (domínios autorizados) |
| "IA ainda não configurada" | Passo 3.3 e **nova implantação** |
| "Senha de acesso inválida" | A senha da engrenagem precisa ser igual à `APP_SENHA` |
| Busca não traz o preço da Shopee | Normal: a Shopee não mostra o preço na página; digite à mão |

## Importante sobre a conta anônima
- A conta fica **neste aparelho e neste navegador**. Se você **sair da conta**, limpar os dados do navegador
  ou trocar de celular, o histórico e os grupos **não voltam**.
- Se no futuro quiser usar em mais de um aparelho, dá para trocar o login anônimo por login com Google.
