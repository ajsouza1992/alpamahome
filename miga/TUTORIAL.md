# Como colocar o Miga Promo no ar

Tempo total: uns 30 minutos. Você vai usar 4 serviços gratuitos:

| Serviço | Para quê |
|---|---|
| **GitHub** | Onde o código do app já está (repositório `alpamahome`, pasta `miga`) |
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

### 1.5 Colar a configuração no app (pelo GitHub, sem programar)
1. No GitHub, abra o repositório **alpamahome** → pasta **`miga`** → arquivo **`firebase-config.js`**.
2. Clique no **lápis** (Editar).
3. Troque a linha `window.FIREBASE_CONFIG = null;` por:
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
4. Clique em **Commit changes** → **Commit changes**.

> Esses dados do Firebase podem ficar no código: eles são públicos por natureza.
> A proteção dos dados é feita pelas regras do passo 1.3.

---

## Parte 2 — Chave da IA (Gemini)

1. Acesse **aistudio.google.com** → **Get API key → Create API key**.
2. Copie a chave (normalmente começa com `AIza`). **Não cole essa chave no código nem no GitHub** —
   ela vai só no Cloudflare (Parte 3).

---

## Parte 3 — Cloudflare Pages (publicar o site)

### 3.1 Criar o projeto
1. Acesse **dash.cloudflare.com** → **Workers & Pages → Criar → Pages → Conectar ao Git**.
2. Autorize o GitHub e escolha o repositório **alpamahome** → **Começar configuração**.
3. Preencha:
   | Campo | Valor |
   |---|---|
   | Nome do projeto | `miga-promo` |
   | Branch de produção | `ccr-7374c7ca-pithl7` (ou `main`, se o código for juntado lá) |
   | Predefinição de framework | **Nenhum** |
   | Comando de build | *(deixe vazio)* |
   | Diretório de saída do build | `/` |
   | **Diretório raiz** (em *Configurações avançadas*) | **`miga`** |
4. **Salvar e implantar**. Em 1–2 minutos aparece um endereço `miga-promo.pages.dev`.

### 3.2 Colocar a chave da IA e a senha
1. No projeto: **Configurações → Variáveis e segredos → Adicionar**.
2. Adicione (tipo **Segredo / Criptografar**):
   | Nome | Valor |
   |---|---|
   | `GEMINI_API_KEY` | a chave da Parte 2 |
   | `APP_SENHA` | uma senha que você inventar (o app pede uma vez, na engrenagem) |
3. **Salvar**. Depois vá em **Implantações** → nos três pontinhos da última → **Tentar novamente a implantação**
   (sem isso, as variáveis não valem).

### 3.3 Usar o domínio alpama.app
1. No projeto: **Domínios personalizados → Configurar um domínio**.
2. Digite `miga.alpama.app` → **Continuar → Ativar domínio**.
   Como o `alpama.app` já está no Cloudflare, o resto é automático (alguns minutos).

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
| "IA ainda não configurada" | Passo 3.2 e **reimplantar** |
| "Senha de acesso inválida" | A senha da engrenagem precisa ser igual à `APP_SENHA` |
| Busca não traz o preço da Shopee | Normal: a Shopee não mostra o preço na página; digite à mão |

## Importante sobre a conta anônima
- A conta fica **neste aparelho e neste navegador**. Se você **sair da conta**, limpar os dados do navegador
  ou trocar de celular, o histórico e os grupos **não voltam**.
- Se no futuro quiser usar em mais de um aparelho, dá para trocar o login anônimo por login com Google.
