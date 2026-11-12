/**
 * Miga Promo — Service Worker
 * Cuida só da pasta do app (ex.: /miga/) e só apaga os próprios caches,
 * para conviver com outros apps no mesmo domínio (ClockFit, Sort.IA...).
 * Estratégia "rede primeiro": pega a versão nova e, offline, usa a cópia.
 */
const VERSAO = "miga-promo-v116";
const BASE = new URL("./", self.location).pathname; // ex.: "/miga/"
const ARQUIVOS = ["./", "index.html", "style.css?v=113", "app.js?v=113", "firebase-config.js?v=113", "manifest.json", "favicon.png", "logo.png?v=113", "icone-192.png?v=113", "icone-512.png?v=113", "apple-touch-icon.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c.startsWith("miga-promo-") && c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== "GET" || url.origin !== location.origin) return;
  if (!url.pathname.startsWith(BASE) || url.pathname.startsWith(BASE + "api/")) return;
  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(VERSAO).then((cache) => cache.put(evento.request, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(evento.request, { ignoreSearch: true }).then((r) => r || caches.match(BASE)))
  );
});
