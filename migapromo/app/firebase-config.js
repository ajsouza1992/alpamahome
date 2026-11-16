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
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDDR_7eles8Sq__UQ9wJD3PpQFBiG2Pa48",
  authDomain: "miga-372d3.firebaseapp.com",
  projectId: "miga-372d3",
  storageBucket: "miga-372d3.firebasestorage.app",
  messagingSenderId: "130311271043",
  appId: "1:130311271043:web:b1414021525b2233e821b6"
};

/* (modelo) Exemplo depois de preenchido:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "miga-promo.firebaseapp.com",
  projectId: "miga-promo",
  storageBucket: "miga-promo.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
*/
