/*
 * CONFIGURAÇÃO DO FIREBASE — Alpama Home
 * ------------------------------------------------------------
 * Cole aqui o bloco "firebaseConfig" do seu projeto
 * (Firebase → engrenagem → Configurações do projeto → Seus apps → Web).
 *
 * Esses dados são públicos por natureza (ficam no site de qualquer
 * app Firebase). Quem protege seus produtos são as REGRAS do
 * Firestore (arquivo firestore.rules), que só deixam o seu usuário gravar.
 *
 * Enquanto estiver null, o site usa os produtos do arquivo produtos.js
 * e o painel funciona em modo rascunho local.
 */
window.FIREBASE_CONFIG = null;

/* Exemplo de como fica depois de preenchido:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "alpamahome.firebaseapp.com",
  projectId: "alpamahome",
  storageBucket: "alpamahome.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
*/
