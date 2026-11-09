# Como colocar o Miga Promo no ar

Tempo total: uns 30 minutos. Você vai usar 4 serviços gratuitos:

| Serviço | Para quê |
|---|---|
| **GitHub** | Onde fica uma cópia do código (repositório `alpamahome`, pasta `miga`) |
| **Firebase** | Login anônimo + **Firestore** (guarda histórico e grupos) |
| **Google AI Studio** | Chave da IA (Gemini) que escreve as mensagens |
| **Cloudflare Pages** | Publica o app em `alpama.app/miga/` |

---

## Parte 1 — Firebase (login e banco de dados)

### 1.1 Criar o projeto
1. Acesse **console.firebase.google.com** e entre com sua conta Google.
2. Clique em **Adicionar projeto** → nome: `miga-promo` → avance.
3. O Google Analytics é opcional (pode desativar) → **Criar projeto**.

### 1.2 Ativar o login anônimo
1. No menu da esquerda: **Criação → Authentication → Vamos começar**.
2. Aba **Método de login** → clique em **Anônimo** → ative → **Salvar**.
3. Aba **Configurações → Domínios autorizados → Adicionar domínio** → digite `alpama.app` → **Adicionar**.

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

## Parte 3 — Cloudflare Pages (publicar junto com o site alpama.app)

O Miga Promo fica em **https://alpama.app/miga/**, no mesmo projeto que já publica o
`alpama.app` (com o ClockFit em `/clockfit/` e o Sort.IA em `/sortia/`).

Você recebe o arquivo **`site_alpama_com_miga.zip`**: é o seu site de sempre (sem nenhuma mudança no
ClockFit e no Sort.IA) **mais** a pasta `miga/`, o `_worker.js` (servidor da IA do Miga) e o `_routes.json`
(faz o servidor rodar **só** em `/miga/api/`, sem pesar no resto do site).

### 3.1 Antes de subir: configuração do Firebase do Miga
O arquivo `miga/firebase-config.js` dentro do zip vem vazio. Me mande o bloco `firebaseConfig`
(Parte 1.4) que eu devolvo o zip já preenchido. Se subir vazio, o app funciona, mas o histórico e os
grupos ficam salvos só no aparelho.

### 3.2 Subir (no projeto que já existe)
1. **dash.cloudflare.com → Workers & Pages** → abra o projeto que já publica o **alpama.app**.
2. **Implantações → Criar implantação** (*Create deployment*) → ambiente **Produção**.
3. **Arraste o `site_alpama_com_miga.zip`** → **Salvar e implantar**.

> Se esse projeto estiver ligado ao GitHub (sem a opção de upload), copie o conteúdo do zip para o
> repositório desse site e faça o commit — o Cloudflare publica sozinho.

### 3.3 Chave da IA e senha (no mesmo projeto)
1. **Configurações → Variáveis e segredos → Adicionar** (ambiente **Produção**, tipo **Criptografar**):
   | Nome | Valor |
   |---|---|
   | `GEMINI_API_KEY` | a chave da Parte 2 |
   | `APP_SENHA` | uma senha que você inventar (o app pede uma vez, na engrenagem) |
2. **Salvar** e faça **mais uma implantação** com o mesmo zip (para as variáveis valerem).

Essas variáveis só são usadas pelo Miga; o ClockFit e o Sort.IA não são afetados.

### 3.4 Firebase do Miga: domínio autorizado
No projeto do Firebase do Miga: **Authentication → Configurações → Domínios autorizados** →
adicione `alpama.app`.

---

## Parte 4 — Instalar no celular

1. Abra **https://alpama.app/miga/** no celular.
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
