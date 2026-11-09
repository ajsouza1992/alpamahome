/*
 * Ponte com o Firebase (carregado sob demanda, só se configurado).
 *   window.alpamaFirebase() -> Promise<{ app, fs, db } | null>
 *   window.alpamaAuth()     -> Promise<{ app, fs, db, au, auth } | null>
 */
(function () {
  "use strict";
  var VERSAO = "10.12.2";
  var BASE = "https://www.gstatic.com/firebasejs/" + VERSAO + "/";
  var cfg = window.FIREBASE_CONFIG;
  var ativo = !!(cfg && cfg.projectId && cfg.apiKey);
  var base = null, comAuth = null;

  window.ALPAMA_FIREBASE_ATIVO = ativo;
  window.ALPAMA_COLECAO = "produtos";

  window.alpamaFirebase = function () {
    if (!ativo) return Promise.resolve(null);
    if (!base) {
      base = Promise.all([import(BASE + "firebase-app.js"), import(BASE + "firebase-firestore.js")])
        .then(function (m) {
          var app = m[0].initializeApp(cfg);
          return { app: app, fs: m[1], db: m[1].getFirestore(app) };
        });
    }
    return base;
  };

  window.alpamaAuth = function () {
    if (!ativo) return Promise.resolve(null);
    if (!comAuth) {
      comAuth = window.alpamaFirebase().then(function (fb) {
        return import(BASE + "firebase-auth.js").then(function (au) {
          return Object.assign({}, fb, { au: au, auth: au.getAuth(fb.app) });
        });
      });
    }
    return comAuth;
  };
})();
