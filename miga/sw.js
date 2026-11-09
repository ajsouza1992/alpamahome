/**
 * Miga Promo — Service Worker
 * Estratégia "Network First" para os arquivos do app: tenta a internet
 * (pega sempre a versão nova) e, se estiver offline, usa o cache.
 * As chamadas /api/ nunca são guardadas em cache.
 */
const VERSAO = "miga-promo-v2";
const ARQUIVOS = ["./", "index.html", "style.css", "app.js", "manifest.json", "simbolo.svg", "icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(VERSAO).then((cache) => cache.put(evento.request, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(evento.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
