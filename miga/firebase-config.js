/*
 * Miga Promo — configuração do Firebase
 * --------------------------------------------------------------
 * Cole aqui o "firebaseConfig" do seu projeto
 * (Firebase → engrenagem → Configurações do projeto → Seus apps → Web).
 *
 * Esses dados são públicos por natureza. Quem protege os dados são
 * as REGRAS do Firestore (arquivo firestore.rules): cada pessoa só
 * lê e grava os próprios documentos.
 *
 * Enquanto estiver null, o app funciona em "modo local" (dados só
 * neste navegador), útil para testar.
 */
window.FIREBASE_CONFIG = null;

/* Exemplo depois de preenchido:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "miga-promo.firebaseapp.com",
  projectId: "miga-promo",
  storageBucket: "miga-promo.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
*/
