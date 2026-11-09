(function () {
  "use strict";

  // ---------- Dados de apoio ----------
  const LOJAS = {
    mercadolivre: { nome: "Mercado Livre", cor: "#ffe600", ver: "Ver no Mercado Livre" },
    shopee: { nome: "Shopee", cor: "#ee4d2d", ver: "Ver na Shopee" },
    amazon: { nome: "Amazon", cor: "#232f3e", ver: "Ver na Amazon" },
    outra: { nome: "Loja parceira", cor: "#1b1b18", ver: "Ver oferta" }
  };

  // Ilustrações em traço (uma por categoria)
  const ICONES = {
    decoracao: '<path d="M9 3h6M10 3v3c-3 1.5-4 4-4 7 0 4 2.5 8 6 8s6-4 6-8c0-3-1-5.5-4-7V3"/><path d="M7 12h10"/>',
    sala: '<path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z"/><path d="M5 18v2M19 18v2"/>',
    quarto: '<path d="M3 19V6M3 15h18v4M21 15v-2a3 3 0 0 0-3-3h-8v5"/><circle cx="6.5" cy="12" r="1.6"/>',
    cozinha: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 10h20M9 6.5c0-1.2 1.2-2.5 3-2.5s3 1.3 3 2.5"/>',
    banheiro: '<path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M6 12V5.5a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2"/>',
    lazer: '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"/><path d="M12 3v18M7.5 12c0-5 2-9 4.5-9M16.5 12c0-5-2-9-4.5-9M8 21h8"/>',
    iluminacao: '<path d="M8 3h8l3 8H5z"/><path d="M12 11v8M8 21h8"/>',
    organizacao: '<path d="M3 9h18l-2 11H5z"/><path d="M8 9l4-6 4 6M9 13v4M12 13v4M15 13v4"/>',
    jardim: '<path d="M12 21v-9"/><path d="M12 12c0-5 3-8 8-8 0 5-3 8-8 8z"/><path d="M12 15c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
    utilidades: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    casa: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'
  };
  const PALETA = [
    { bg: "#f2d9cc", fg: "#8a3e2b" }, { bg: "#dfe6d4", fg: "#3d5233" }, { bg: "#f0e3c2", fg: "#7a5a17" },
    { bg: "#d9e3e6", fg: "#2d5361" }, { bg: "#ead6e0", fg: "#6e3953" }, { bg: "#e6dccf", fg: "#5b4632" }
  ];
  const svg = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[id] || ICONES.casa}</svg>`;
  const SETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const SETA_DIAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

  const CATEGORIAS = (window.CATEGORIAS || []).map((c, i) => ({ ...c, cor: PALETA[i % PALETA.length] }));
  const catPorId = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));

  // ---------- Produtos (com modo pré-visualização do painel) ----------
  const params = new URLSearchParams(location.search);
  let produtos = window.PRODUTOS || [];
  if (params.get("preview") === "1") {
    try {
      const r = JSON.parse(localStorage.getItem("alpama_rascunho") || "null");
      if (Array.isArray(r)) {
        produtos = r;
        const b = document.createElement("div");
        b.className = "preview-banner";
        b.innerHTML = 'Pré-visualização do rascunho — só você está vendo. <a href="admin.html">Voltar ao painel</a>';
        document.body.prepend(b);
      }
    } catch (e) { /* ignora */ }
  }
  produtos = produtos.filter((p) => p && p.nome && Number.isFinite(Number(p.preco))).map((p) => ({ ...p, preco: Number(p.preco) }));

  // ---------- Utilidades ----------
  const $ = (s) => document.querySelector(s);
  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const brl = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brlCurto = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const urlOk = (u) => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");
  const desconto = (p) => (p.precoAntigo && p.precoAntigo > p.preco ? Math.round((1 - p.preco / p.precoAntigo) * 100) : 0);

  const contaCat = {};
  produtos.forEach((p) => { contaCat[p.categoria] = (contaCat[p.categoria] || 0) + 1; });
  const catsComProduto = CATEGORIAS.filter((c) => contaCat[c.id]);

  // Limite do slider: maior preço arredondado para cima
  const passo = 10;
  const TETO = Math.max(100, Math.ceil(Math.max(0, ...produtos.map((p) => p.preco)) / 50) * 50);

  const el = {
    busca: $("#busca"), buscaHero: $("#buscaHero"), grade: $("#grade"), vazio: $("#vazio"), contagem: $("#contagem"),
    ativos: $("#ativos"), rMin: $("#rMin"), rMax: $("#rMax"), vMin: $("#vMin"), vMax: $("#vMax"), ativoFaixa: $("#ativoFaixa"),
    lojas: $("#lojas"), promo: $("#soPromo"), ordem: $("#ordem"), amb: $("#ambientes"), atalhos: $("#atalhos"),
    painel: $("#painelf"), veu: $("#veu"), nFiltros: $("#nFiltros"), nAplicar: $("#nAplicar")
  };

  const estado = {
    busca: params.get("q") || "",
    categoria: params.get("cat") || "",
    min: num(params.get("min")),
    max: num(params.get("max")),
    loja: params.get("loja") || "",
    promo: params.get("promo") === "1",
    ordem: params.get("ordem") || "relevancia"
  };

  // ---------- Montagem ----------
  function montarMenu() {
    $("#menu").innerHTML = catsComProduto.slice(0, 6)
      .map((c) => `<a href="#loja" data-cat="${esc(c.id)}">${esc(c.nome)}</a>`).join("");
    $("#menu").addEventListener("click", (e) => {
      const a = e.target.closest("a[data-cat]");
      if (a) { estado.categoria = a.dataset.cat; atualizar(); }
    });
  }

  function montarBento() {
    const top = catsComProduto.slice().sort((a, b) => contaCat[b.id] - contaCat[a.id]).slice(0, 3);
    while (top.length < 3 && CATEGORIAS[top.length]) top.push(CATEGORIAS.find((c) => !top.includes(c)));
    $("#bento").innerHTML = top.map((c) => `
      <a class="tile" href="#loja" data-cat="${esc(c.id)}" style="background:${c.cor.bg};color:${c.cor.fg}">
        <span class="tile__seta">${SETA_DIAG}</span>
        <span class="tile__nome">${esc(c.nome)}</span>
        <span class="tile__qtd">${contaCat[c.id] || 0} ${contaCat[c.id] === 1 ? "achado" : "achados"}</span>
        <span class="tile__ico">${svg(c.id)}</span>
      </a>`).join("") + `
      <a class="tile" href="#loja" data-promo style="background:#1b1b18;color:#f4efe6">
        <span class="tile__seta" style="background:rgba(255,255,255,.12)">${SETA_DIAG}</span>
        <span class="tile__nome">Ofertas<br>da semana</span>
        <span class="tile__qtd">${produtos.filter(desconto).length} com desconto</span>
      </a>`;
    $("#bento").addEventListener("click", (e) => {
      const t = e.target.closest(".tile");
      if (!t) return;
      if (t.hasAttribute("data-promo")) { estado.promo = true; estado.categoria = ""; }
      else estado.categoria = t.dataset.cat;
      atualizar();
    });
    $("#totalHero").textContent = produtos.length;
  }

  function montarAmbientes() {
    const itens = [{ id: "", nome: "Tudo", cor: { bg: "#e9dfcf", fg: "#1e3a2f" } }].concat(catsComProduto);
    el.amb.innerHTML = itens.map((c) => `
      <button class="amb" type="button" data-cat="${esc(c.id)}">
        <span class="amb__ico" style="background:${c.cor.bg};color:${c.cor.fg}">${svg(c.id || "casa")}</span>
        ${esc(c.nome)}<small>${c.id ? contaCat[c.id] : produtos.length}</small>
      </button>`).join("");
    el.amb.addEventListener("click", (e) => {
      const b = e.target.closest(".amb");
      if (b) { estado.categoria = b.dataset.cat; atualizar(); }
    });
  }

  const ATALHOS = [[null, 50], [50, 100], [100, 250], [250, 500], [500, null]];
  function montarPreco() {
    [el.rMin, el.rMax].forEach((r) => { r.min = 0; r.max = TETO; r.step = passo; });
    el.atalhos.innerHTML = ATALHOS.map(([a, b], i) => `<button type="button" data-i="${i}">${a === null ? "Até " + brlCurto(b) : b === null ? "Acima de " + brlCurto(a) : brlCurto(a) + "–" + b}</button>`).join("");
    el.atalhos.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const [a, z] = ATALHOS[b.dataset.i];
      const ativo = estado.min === a && estado.max === z;
      estado.min = ativo ? null : a;
      estado.max = ativo ? null : z;
      atualizar();
    });
    const aoMover = (qual) => {
      let a = Number(el.rMin.value), z = Number(el.rMax.value);
      if (a > z - passo) { if (qual === "min") a = z - passo; else z = a + passo; }
      estado.min = a <= 0 ? null : a;
      estado.max = z >= TETO ? null : z;
      pintarFaixa();
    };
    el.rMin.addEventListener("input", () => aoMover("min"));
    el.rMax.addEventListener("input", () => aoMover("max"));
    el.rMin.addEventListener("change", atualizar);
    el.rMax.addEventListener("change", atualizar);
  }
  function pintarFaixa() {
    const a = estado.min ?? 0, z = estado.max ?? TETO;
    el.rMin.value = a; el.rMax.value = Math.min(z, TETO);
    el.vMin.textContent = brlCurto(a);
    el.vMax.textContent = estado.max === null ? brlCurto(TETO) + "+" : brlCurto(z);
    el.ativoFaixa.style.left = (a / TETO) * 100 + "%";
    el.ativoFaixa.style.right = (100 - (Math.min(z, TETO) / TETO) * 100) + "%";
    // atualiza contagem ao vivo enquanto arrasta
    el.nAplicar.textContent = filtrar().length;
  }

  function montarLojas() {
    const conta = {};
    produtos.forEach((p) => { conta[p.loja] = (conta[p.loja] || 0) + 1; });
    const ids = Object.keys(LOJAS).filter((id) => conta[id]);
    el.lojas.innerHTML = `<button type="button" data-loja="">Todas</button>` +
      ids.map((id) => `<button type="button" data-loja="${id}"><i style="background:${LOJAS[id].cor}"></i>${LOJAS[id].nome}</button>`).join("");
    el.lojas.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { estado.loja = b.dataset.loja; atualizar(); }
    });
  }

  // ---------- Filtro ----------
  function filtrar() {
    const termos = norm(estado.busca).split(/\s+/).filter(Boolean);
    let lista = produtos.filter((p) => {
      if (estado.categoria && p.categoria !== estado.categoria) return false;
      if (estado.min !== null && p.preco < estado.min) return false;
      if (estado.max !== null && p.preco > estado.max) return false;
      if (estado.loja && p.loja !== estado.loja) return false;
      if (estado.promo && !desconto(p)) return false;
      if (termos.length) {
        const alvo = norm([p.nome, p.descricao, catPorId[p.categoria]?.nome].join(" "));
        if (!termos.every((t) => alvo.includes(t))) return false;
      }
      return true;
    });
    const ord = {
      menor: (a, b) => a.preco - b.preco,
      maior: (a, b) => b.preco - a.preco,
      desconto: (a, b) => desconto(b) - desconto(a),
      az: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
      relevancia: (a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0)
    }[estado.ordem];
    return ord ? lista.slice().sort(ord) : lista;
  }

  // ---------- Renderização ----------
  function card(p, i) {
    const cat = catPorId[p.categoria];
    const cor = cat ? cat.cor : PALETA[5];
    const loja = LOJAS[p.loja] || LOJAS.outra;
    const off = desconto(p);
    const img = urlOk(p.imagem);
    const link = urlOk(p.link) || "#";
    const ilus = `<span class="prod__ilus" style="color:${cor.fg}">${svg(p.categoria)}</span>`;
    return `<a class="prod" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener" style="animation-delay:${Math.min(i, 12) * 40}ms">
      <div class="prod__img${img ? " contem" : ""}" style="background:${cor.bg}">
        ${img ? `<img src="${esc(img)}" alt="${esc(p.nome)}" loading="lazy" referrerpolicy="no-referrer" data-cat="${esc(p.categoria)}">` : ilus}
        ${off ? `<span class="prod__off">-${off}%</span>` : ""}
        <span class="prod__loja"><i style="background:${loja.cor}"></i>${esc(loja.nome)}</span>
        <span class="prod__ir">${SETA_DIAG}</span>
      </div>
      <div class="prod__info">
        ${cat ? `<span class="prod__cat">${esc(cat.nome)}</span>` : ""}
        <h3 class="prod__nome">${esc(p.nome)}</h3>
        <div class="prod__precos">
          <span class="prod__preco"><small>R$</small>${brl(p.preco)}</span>
          ${off ? `<span class="prod__antigo">R$ ${brl(p.precoAntigo)}</span>` : ""}
        </div>
        <span class="prod__comprar">${esc(loja.ver)} ${SETA}</span>
      </div>
    </a>`;
  }

  function quantosFiltros() {
    return (estado.min !== null || estado.max !== null ? 1 : 0) + (estado.loja ? 1 : 0) + (estado.promo ? 1 : 0);
  }

  function renderAtivos() {
    const tags = [];
    if (estado.busca) tags.push(["busca", `“${estado.busca}”`]);
    if (estado.categoria && catPorId[estado.categoria]) tags.push(["categoria", catPorId[estado.categoria].nome]);
    if (estado.min !== null || estado.max !== null) {
      tags.push(["preco", estado.min !== null && estado.max !== null ? `${brlCurto(estado.min)} – ${brlCurto(estado.max)}`
        : estado.min !== null ? `A partir de ${brlCurto(estado.min)}` : `Até ${brlCurto(estado.max)}`]);
    }
    if (estado.loja) tags.push(["loja", LOJAS[estado.loja]?.nome || estado.loja]);
    if (estado.promo) tags.push(["promo", "Só ofertas"]);
    $("#limparResumo").hidden = !tags.length;
    el.ativos.innerHTML = tags.map(([k, t]) => `<button class="tag" type="button" data-k="${k}" aria-label="Remover filtro ${esc(t)}">${esc(t)}</button>`).join("");
  }

  function sincronizar() {
    if (document.activeElement !== el.busca) el.busca.value = estado.busca;
    el.promo.setAttribute("aria-pressed", String(estado.promo));
    el.ordem.value = estado.ordem;
    el.amb.querySelectorAll(".amb").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === estado.categoria)));
    document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("ativo", a.dataset.cat === estado.categoria));
    el.lojas.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.loja === estado.loja)));
    el.atalhos.querySelectorAll("button").forEach((b) => {
      const [a, z] = ATALHOS[b.dataset.i];
      b.setAttribute("aria-pressed", String(a === estado.min && z === estado.max));
    });
    const n = quantosFiltros();
    el.nFiltros.hidden = !n;
    el.nFiltros.textContent = n;
    pintarFaixa();
  }

  function salvarURL() {
    const q = new URLSearchParams();
    if (params.get("preview") === "1") q.set("preview", "1");
    if (estado.busca) q.set("q", estado.busca);
    if (estado.categoria) q.set("cat", estado.categoria);
    if (estado.min !== null) q.set("min", estado.min);
    if (estado.max !== null) q.set("max", estado.max);
    if (estado.loja) q.set("loja", estado.loja);
    if (estado.promo) q.set("promo", "1");
    if (estado.ordem !== "relevancia") q.set("ordem", estado.ordem);
    const s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
  }

  function atualizar() {
    const lista = filtrar();
    el.grade.innerHTML = lista.map(card).join("");
    el.grade.querySelectorAll("img[data-cat]").forEach((img) => {
      img.addEventListener("error", () => {
        const cat = catPorId[img.dataset.cat];
        const box = img.parentElement;
        box.classList.remove("contem");
        img.outerHTML = `<span class="prod__ilus" style="color:${(cat ? cat.cor : PALETA[5]).fg}">${svg(img.dataset.cat)}</span>`;
      }, { once: true });
    });
    el.vazio.hidden = lista.length > 0;
    el.contagem.innerHTML = `<b>${lista.length}</b> ${lista.length === 1 ? "achado" : "achados"}`;
    sincronizar();
    renderAtivos();
    salvarURL();
  }

  function limpar() {
    Object.assign(estado, { busca: "", categoria: "", min: null, max: null, loja: "", promo: false });
    el.buscaHero.value = "";
    atualizar();
  }

  // ---------- Eventos ----------
  let t;
  el.busca.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { estado.busca = el.busca.value.trim(); atualizar(); }, 150);
  });
  $("#heroBusca").addEventListener("submit", (e) => {
    e.preventDefault();
    estado.busca = el.buscaHero.value.trim();
    atualizar();
    $("#loja").scrollIntoView({ behavior: "smooth" });
  });
  el.promo.addEventListener("click", () => { estado.promo = !estado.promo; atualizar(); });
  el.ordem.addEventListener("change", () => { estado.ordem = el.ordem.value; atualizar(); });
  $("#limpar").addEventListener("click", limpar);
  $("#limparResumo").addEventListener("click", limpar);
  document.querySelector("[data-limpar]").addEventListener("click", limpar);
  el.ativos.addEventListener("click", (e) => {
    const b = e.target.closest(".tag");
    if (!b) return;
    const k = b.dataset.k;
    if (k === "busca") { estado.busca = ""; el.buscaHero.value = ""; }
    if (k === "categoria") estado.categoria = "";
    if (k === "preco") { estado.min = null; estado.max = null; }
    if (k === "loja") estado.loja = "";
    if (k === "promo") estado.promo = false;
    atualizar();
  });

  const abrir = () => { el.painel.classList.add("aberto"); el.veu.hidden = false; };
  const fechar = () => { el.painel.classList.remove("aberto"); el.veu.hidden = true; };
  $("#abrirFiltros").addEventListener("click", abrir);
  $("#fecharFiltros").addEventListener("click", fechar);
  $("#aplicar").addEventListener("click", () => { fechar(); $("#loja").scrollIntoView({ behavior: "smooth" }); });
  el.veu.addEventListener("click", fechar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });

  $("#ano").textContent = new Date().getFullYear();

  montarMenu();
  montarBento();
  montarAmbientes();
  montarPreco();
  montarLojas();
  atualizar();
})();
