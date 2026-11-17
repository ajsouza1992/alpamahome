/*
 * Miga Promo · Achadinhos — extensão do Chrome (uso pessoal)
 * Em cada produto do Mercado Livre e da Shopee aparece o botão "+ Miga".
 * Os marcados ficam guardados (mesmo trocando de página ou de aba).
 * "Enviar para a Miga" abre o app com todos os links na Caixa de importação.
 * Nada é lido ou enviado por fora: só os links que você marcou, quando você toca em Enviar.
 */
(() => {
  "use strict";
  // Endereço do app (troque aqui se o app mudar de endereço)
  const APP = "https://www.migapromo.com/app/";
  const CHAVE = "miga_marcados";
  const ehML = /mercadolivre\.com/.test(location.hostname);

  let marcados = [];
  const ler = () => new Promise((ok) => chrome.storage.local.get(CHAVE, (d) => ok(Array.isArray(d[CHAVE]) ? d[CHAVE] : [])));
  const gravar = () => new Promise((ok) => chrome.storage.local.set({ [CHAVE]: marcados }, ok));

  /** Link limpo do produto (sem rastreio), ou "" se não for página de produto */
  function linkProduto(href) {
    let u; try { u = new URL(href, location.href); } catch (e) { return ""; }
    if (ehML) {
      if (/click\d*\.mercadolivre/.test(u.hostname)) return ""; // anúncio patrocinado com link de rastreio
      if (!/mercadolivre\.com/.test(u.hostname)) return "";
      if (!/MLB-?\d{6,}/i.test(u.pathname)) return "";
      return u.origin + u.pathname.replace(/\/$/, "");
    }
    // Shopee: /nome-do-produto-i.LOJA.ITEM  ou  /product/LOJA/ITEM
    if (/-i\.\d+\.\d+/.test(u.pathname) || /^\/product\/\d+\/\d+/.test(u.pathname)) return u.origin + u.pathname;
    return "";
  }

  /** Cartão (quadradinho) do produto na página de busca */
  function cartaoDe(a) {
    return a.closest("li.ui-search-layout__item, .poly-card, .andes-card, .ui-recommendations-card, [data-sqe='item'], li.shopee-search-item-result__item, .shop-search-result-view__item") || a.closest("li") || a.parentElement;
  }

  function pintarBotao(bt, link) {
    const on = marcados.includes(link);
    bt.classList.toggle("miga-on", on);
    bt.textContent = on ? "Na Miga" : "+ Miga";
    bt.title = on ? "Tirar da lista da Miga" : "Marcar para mandar para a Miga Promo";
  }

  async function alternar(link) {
    marcados = marcados.includes(link) ? marcados.filter((x) => x !== link) : [...marcados, link];
    await gravar(); atualizarTudo();
  }

  /** Põe o botão "+ Miga" em cada produto que aparecer na tela */
  function marcarCartoes() {
    document.querySelectorAll("a[href]").forEach((a) => {
      if (a.closest(".miga-barra")) return;
      const link = linkProduto(a.getAttribute("href")); if (!link) return;
      const card = cartaoDe(a); if (!card || card.dataset.miga) return;
      card.dataset.miga = link; card.classList.add("miga-card");
      const bt = document.createElement("button"); bt.type = "button"; bt.className = "miga-bt";
      bt.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); alternar(link); }, true);
      card.appendChild(bt); pintarBotao(bt, link);
    });
  }

  /** Página de um produto (não de busca): o próprio produto */
  function produtoDaPagina() { return linkProduto(location.href); }

  /* ---------- Barra de baixo ---------- */
  const barra = document.createElement("div"); barra.className = "miga-barra";
  barra.innerHTML = `<span class="miga-logo">Miga</span><b class="miga-n"></b>
    <button type="button" class="miga-acao miga-este">+ Este produto</button>
    <button type="button" class="miga-acao miga-todos">Marcar todos da página</button>
    <button type="button" class="miga-acao miga-limpar">Limpar</button>
    <button type="button" class="miga-enviar">Enviar para a Miga</button>`;
  document.documentElement.appendChild(barra);

  barra.querySelector(".miga-este").addEventListener("click", () => { const l = produtoDaPagina(); if (l) alternar(l); });
  barra.querySelector(".miga-todos").addEventListener("click", async () => {
    const l = [...document.querySelectorAll("[data-miga]")].map((c) => c.dataset.miga);
    const tudo = l.length && l.every((x) => marcados.includes(x));
    marcados = tudo ? marcados.filter((x) => !l.includes(x)) : [...new Set([...marcados, ...l])];
    await gravar(); atualizarTudo();
  });
  barra.querySelector(".miga-limpar").addEventListener("click", async () => { if (!marcados.length) return; if (!confirm(`Tirar os ${marcados.length} produtos marcados?`)) return; marcados = []; await gravar(); atualizarTudo(); });
  barra.querySelector(".miga-enviar").addEventListener("click", async () => {
    if (!marcados.length) { alert("Toque em “+ Miga” nos produtos que você quer mandar."); return; }
    window.open(APP + "#importar=" + encodeURIComponent(marcados.join("\n")), "_blank");
    marcados = []; await gravar(); atualizarTudo();
  });

  function atualizarTudo() {
    document.querySelectorAll(".miga-card").forEach((c) => { const bt = c.querySelector(":scope > .miga-bt"); if (bt) pintarBotao(bt, c.dataset.miga); });
    const n = marcados.length, aqui = produtoDaPagina();
    barra.querySelector(".miga-n").textContent = n ? `${n} ${n === 1 ? "produto marcado" : "produtos marcados"}` : "Toque em + Miga nos produtos";
    const este = barra.querySelector(".miga-este"); este.hidden = !aqui; if (aqui) este.textContent = marcados.includes(aqui) ? "Tirar este produto" : "+ Este produto";
    barra.querySelector(".miga-todos").hidden = !document.querySelector("[data-miga]");
    barra.querySelector(".miga-limpar").hidden = !n;
    barra.querySelector(".miga-enviar").disabled = !n;
    barra.querySelector(".miga-enviar").textContent = n ? `Enviar ${n} para a Miga` : "Enviar para a Miga";
  }

  // Outras abas marcando: atualiza aqui também
  chrome.storage.onChanged.addListener((m, area) => { if (area === "local" && m[CHAVE]) { marcados = m[CHAVE].newValue || []; atualizarTudo(); } });

  // A página carrega mais produtos ao rolar: procura de novo (sem pesar)
  let t = 0;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { marcarCartoes(); atualizarTudo(); }, 400); }).observe(document.body, { childList: true, subtree: true });

  ler().then((l) => { marcados = l; marcarCartoes(); atualizarTudo(); });
})();
