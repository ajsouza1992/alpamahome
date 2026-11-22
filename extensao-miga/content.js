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
  const CHAVE = "miga_marcados", CHAVE_DADOS = "miga_dados";
  const ehML = /mercadolivre\.com/.test(location.hostname);

  let marcados = [], dados = {};
  const ler = () => new Promise((ok) => chrome.storage.local.get([CHAVE, CHAVE_DADOS], (d) => { dados = d[CHAVE_DADOS] || {}; ok(Array.isArray(d[CHAVE]) ? d[CHAVE] : []); }));
  const gravar = () => { Object.keys(dados).forEach((k) => { if (!marcados.includes(k)) delete dados[k]; }); return new Promise((ok) => chrome.storage.local.set({ [CHAVE]: marcados, [CHAVE_DADOS]: dados }, ok)); };

  /* Copia da própria página (aberta no seu Chrome) o nome, a foto e o preço do produto */
  const numero = (t) => { const m = String(t || "").replace(/\s+/g, " ").match(/R\$\s?([\d.]+)(?:,(\d{1,2}))?/); return m ? Number(m[1].replace(/\./g, "")) + (m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0) : null; };
  function precoAndes(el) { if (!el) return null; const f = el.querySelector(".andes-money-amount__fraction"), c = el.querySelector(".andes-money-amount__cents"); if (f) return Number(f.textContent.replace(/\D/g, "")) + (c ? Number(c.textContent.replace(/\D/g, "").padEnd(2, "0")) / 100 : 0); const al = el.getAttribute && el.getAttribute("aria-label"); return al ? numero("R$ " + al.replace(/reais?\s*com\s*/i, ",").replace(/[^\d,.]/g, "")) : numero(el.textContent); }
  function dadosDoCartao(card) {
    if (!card) return {};
    const img = [...card.querySelectorAll("img")].map((i) => i.currentSrc || i.getAttribute("data-src") || i.src || "").find((u) => /^https?:/.test(u) && !/\.svg|data:image|placeholder|logo/i.test(u)) || "";
    const tit = card.querySelector("[class*='title'], h2, h3, [class*='name']");
    let nome = (tit && tit.textContent || "").trim();
    if (!nome) nome = ([...card.querySelectorAll("img")].map((i) => i.alt || "").sort((a, b) => b.length - a.length)[0] || "").trim();
    if (!nome) nome = ([...card.querySelectorAll("a")].map((a) => (a.textContent || "").trim()).sort((a, b) => b.length - a.length)[0] || "");
    let preco = null, antes = null;
    const atuais = [...card.querySelectorAll(".andes-money-amount")].filter((e) => !e.closest("s, del") && !/previous/.test(e.className));
    const velhos = [...card.querySelectorAll(".andes-money-amount--previous, s .andes-money-amount, del .andes-money-amount, s, del")];
    if (atuais.length) preco = precoAndes(atuais[0]);
    if (velhos.length) antes = precoAndes(velhos[0]);
    if (!preco) { const txt = [...card.querySelectorAll("*")].filter((e) => !e.children.length && /R\$/.test(e.textContent) && !e.closest("s, del")).map((e) => e.parentElement ? e.parentElement.textContent : e.textContent); preco = numero(txt[0] || card.textContent); }
    return { n: nome.replace(/\s+/g, " ").slice(0, 200), i: img, p: preco || null, a: antes && preco && antes > preco ? antes : null };
  }
  function dadosDaPagina() {
    const nome = (document.querySelector("h1") || {}).textContent || "";
    const img = (document.querySelector("meta[property='og:image']") || {}).content || ((document.querySelector("figure img, .ui-pdp-image") || {}).src || "");
    const preco = precoAndes(document.querySelector(".ui-pdp-price__second-line .andes-money-amount, .andes-money-amount:not(.andes-money-amount--previous)"));
    const antes = precoAndes(document.querySelector(".andes-money-amount--previous"));
    return { n: nome.trim().slice(0, 200), i: img, p: preco || null, a: antes && preco && antes > preco ? antes : null };
  }

  /** Link limpo do produto (sem rastreio), ou "" se não for página de produto */
  function linkProduto(href) {
    let u; try { u = new URL(href, location.href); } catch (e) { return ""; }
    if (ehML) {
      if (/click\d*\.mercadolivre/.test(u.hostname)) return ""; // anúncio patrocinado com link de rastreio
      if (!/mercadolivre\.com/.test(u.hostname)) return "";
      if (!/MLBU?-?\d{6,}/i.test(u.pathname + u.search)) return "";
      if (!/MLBU?-?\d{6,}/i.test(u.pathname)) { const m = /(MLBU?-?\d{6,})/i.exec(u.search); return m ? "https://www.mercadolivre.com.br/p/" + m[1].replace("-", "") : ""; }
      return u.origin + u.pathname.replace(/\/$/, "");
    }
    // Shopee: /nome-do-produto-i.LOJA.ITEM  ou  /product/LOJA/ITEM
    if (/-i\.\d+\.\d+/.test(u.pathname) || /^\/product\/\d+\/\d+/.test(u.pathname)) return u.origin + u.pathname;
    return "";
  }

  /** Cartão (quadradinho) do produto na página de busca */
  function cartaoDe(a, link) {
    let el = a;
    for (let i = 0; i < 10; i++) {
      const p = el.parentElement; if (!p || p === document.body || p === document.documentElement) break;
      const outros = [...p.querySelectorAll("a[href]")].some((x) => { const l = linkProduto(x.getAttribute("href")); return l && l !== link; });
      if (outros) break; el = p;
    }
    return el;
  }

  function pintarBotao(bt, link) {
    const on = marcados.includes(link);
    bt.classList.toggle("miga-on", on);
    bt.setAttribute("aria-pressed", String(on));
    bt.title = on ? "Desmarcar (tirar da Miga)" : "Marcar para mandar para a Miga Promo";
  }

  async function alternar(link, card) {
    if (!marcados.includes(link)) { try { const d = card ? dadosDoCartao(card) : dadosDaPagina(); if (d && (d.n || d.i || d.p)) dados[link] = d; } catch (e) { /* segue sem os dados */ } }
    marcados = marcados.includes(link) ? marcados.filter((x) => x !== link) : [...marcados, link];
    await gravar(); atualizarTudo();
  }

  /** Põe o botão "+ Miga" em cada produto que aparecer na tela */
  function marcarCartoes() {
    document.querySelectorAll("a[href]").forEach((a) => {
      if (a.closest(".miga-barra")) return;
      const link = linkProduto(a.getAttribute("href")); if (!link) return;
      const card = cartaoDe(a, link); if (!card) return;
      // Já tem bolinha neste cartão (mesmo que o site tenha refeito o cartão): não cria outra
      if (card.querySelector(".miga-bt") || card.closest("[data-miga]") || card.querySelector("[data-miga]")) { if (!card.dataset.miga && card.querySelector(":scope > .miga-bt")) { card.dataset.miga = link; card.classList.add("miga-card"); } return; }
      card.dataset.miga = link; card.classList.add("miga-card");
      const bt = document.createElement("button"); bt.type = "button"; bt.className = "miga-bt"; bt.dataset.migaLink = link; bt.setAttribute("aria-label", "Marcar para a Miga");
      card.appendChild(bt); pintarBotao(bt, link);
    });
  }

  /** Página de um produto (não de busca): o próprio produto */
  function produtoDaPagina() { return linkProduto(location.href); }

  // O clique no quadradinho é tratado antes do site (o site não abre o produto nem "engole" o clique)
  // Marca/desmarca já no apertar do mouse: o site do ML redesenha o cartão no clique e o "click" se perdia
  let ultimo = null;
  window.addEventListener("pointerdown", (e) => {
    const bt = e.target.closest && e.target.closest(".miga-bt"); if (!bt) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const k = bt.dataset.migaLink; if (ultimo && ultimo.k === k && Date.now() - ultimo.t < 300) return; ultimo = { k, t: Date.now() };
    alternar(k, bt.parentElement);
  }, true);
  ["mousedown", "mouseup", "pointerup", "click", "touchstart"].forEach((ev) => window.addEventListener(ev, (e) => { if (e.target.closest && e.target.closest(".miga-bt")) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } }, true));

  /* ---------- Barra de baixo ---------- */
  const barra = document.createElement("div"); barra.className = "miga-barra";
  barra.innerHTML = `<span class="miga-logo">Miga</span><b class="miga-n"></b>
    <button type="button" class="miga-acao miga-este">+ Este produto</button>
    <button type="button" class="miga-acao miga-video" hidden>Baixar vídeo</button>
    <button type="button" class="miga-acao miga-todos">Marcar todos da página</button>
    <button type="button" class="miga-acao miga-desfazer">Desfazer</button>
    <button type="button" class="miga-acao miga-limpar">Limpar</button>
    <button type="button" class="miga-enviar">Enviar para a Miga</button>`;
  document.documentElement.appendChild(barra);

  barra.querySelector(".miga-este").addEventListener("click", () => { const l = produtoDaPagina(); if (l) alternar(l, null); });

  /* ---------- Baixar o vídeo do anúncio (o do próprio vendedor) ---------- */
  function videosDaPagina() {
    const achados = new Set();
    // 1) Vídeos que estão na tela (o player do anúncio)
    document.querySelectorAll("video").forEach((v) => {
      [v.currentSrc, v.src, ...[...v.querySelectorAll("source")].map((x) => x.src)].forEach((u) => { if (/^https?:\/\//.test(u || "")) achados.add(u); });
    });
    // 2) Endereços de vídeo .mp4 escritos na página (o anúncio às vezes só carrega o vídeo depois do play)
    const html = document.documentElement.innerHTML.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
    (html.match(/https?:\/\/[^"'\s<>()\\]+?\.mp4(\?[^"'\s<>()\\]*)?/gi) || []).forEach((u) => achados.add(u.replace(/&amp;/g, "&")));
    // Só vídeos das lojas (Shopee e Mercado Livre); tira os de propaganda e os repetidos
    return [...achados].filter((u) => /susercontent\.com|shopee|mlstatic\.com|mercadoli|mercadolibre/i.test(u)).slice(0, 6);
  }
  function nomeDoArquivo() {
    const n = (document.querySelector("h1") || {}).textContent || document.title || "video";
    return n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "video";
  }
  function temVideoBloqueado() { return [...document.querySelectorAll("video")].some((v) => /^blob:/.test(v.currentSrc || v.src || "")); }
  barra.querySelector(".miga-video").addEventListener("click", () => {
    const urls = videosDaPagina();
    if (!urls.length) {
      alert(temVideoBloqueado()
        ? "Este vídeo vem em pedacinhos e o navegador não deixa baixar direto. Use a gravação de tela ou peça o vídeo ao vendedor."
        : "Não achei vídeo neste anúncio. Abra o vídeo nas fotos do produto (toque no play) e tente de novo.");
      return;
    }
    const bt = barra.querySelector(".miga-video"); bt.disabled = true; bt.textContent = "Baixando…";
    chrome.runtime.sendMessage({ tipo: "baixarVideo", urls, nome: nomeDoArquivo() }, (r) => {
      bt.disabled = false; bt.textContent = "Baixar vídeo";
      if (chrome.runtime.lastError || !r) { alert("Não consegui baixar. Recarregue a extensão em chrome://extensions e tente de novo."); return; }
      if (!r.ok) alert("A loja não deixou baixar este vídeo. Use a gravação de tela ou peça o vídeo ao vendedor.");
      else bt.textContent = r.ok === 1 ? "Vídeo baixado" : `${r.ok} vídeos baixados`;
      setTimeout(() => { bt.textContent = "Baixar vídeo"; }, 3000);
    });
  });
  barra.querySelector(".miga-todos").addEventListener("click", async () => {
    const cards = [...document.querySelectorAll(".miga-bt")].map((b) => [b.dataset.migaLink, b.parentElement]), l = cards.map(([k]) => k);
    const tudo = l.length && l.every((x) => marcados.includes(x));
    if (!tudo) cards.forEach(([k, c]) => { if (!marcados.includes(k)) { try { const d = dadosDoCartao(c); if (d.n || d.i || d.p) dados[k] = d; } catch (e) { /* segue */ } } });
    marcados = tudo ? marcados.filter((x) => !l.includes(x)) : [...new Set([...marcados, ...l])];
    await gravar(); atualizarTudo();
  });
  barra.querySelector(".miga-desfazer").addEventListener("click", async () => { if (!marcados.length) return; marcados = marcados.slice(0, -1); await gravar(); atualizarTudo(); });
  barra.querySelector(".miga-limpar").addEventListener("click", async () => { if (!marcados.length) return; if (!confirm(`Tirar os ${marcados.length} produtos marcados?`)) return; marcados = []; await gravar(); atualizarTudo(); });
  barra.querySelector(".miga-enviar").addEventListener("click", async () => {
    if (!marcados.length) { alert("Marque no quadradinho os produtos que você quer mandar."); return; }
    // Vai o link e, junto, o nome, a foto e o preço copiados da página
    const pacote = marcados.map((l) => ({ l, ...(dados[l] || {}) }));
    window.open(APP + "#importar=" + encodeURIComponent(JSON.stringify(pacote)), "_blank");
    // Os marcados ficam guardados até você tocar em Limpar (se o app não abrir, nada se perde; a Miga não repete produtos)
  });

  function atualizarTudo() {
    // Pinta TODAS as bolinhas pelo link guardado nelas (o site às vezes refaz o cartão e a bolinha fica em outro lugar)
    document.querySelectorAll(".miga-bt").forEach((bt) => pintarBotao(bt, bt.dataset.migaLink));
    const n = marcados.length, aqui = produtoDaPagina();
    barra.querySelector(".miga-n").textContent = n ? `${n} ${n === 1 ? "produto marcado" : "produtos marcados"}` : "Marque os produtos no quadradinho";
    barra.querySelector(".miga-video").hidden = !aqui || !(document.querySelector("video") || videosDaPagina().length);
    const este = barra.querySelector(".miga-este"); este.hidden = !aqui; if (aqui) este.textContent = marcados.includes(aqui) ? "Tirar este produto" : "+ Este produto";
    barra.querySelector(".miga-todos").hidden = !document.querySelector("[data-miga]");
    barra.querySelector(".miga-limpar").hidden = !n; barra.querySelector(".miga-desfazer").hidden = !n;
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
