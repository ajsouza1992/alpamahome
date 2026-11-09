(async function () {
  "use strict";

  const LOJAS = {
    mercadolivre: { nome: "Mercado Livre", cor: "#ffe600", botao: "Ver no Mercado Livre" },
    shopee: { nome: "Shopee", cor: "#ee4d2d", botao: "Ver na Shopee" },
    amazon: { nome: "Amazon", cor: "#232f3e", botao: "Ver na Amazon" },
    outra: { nome: "Outras lojas", cor: "#2b2420", botao: "Ver oferta" }
  };

  const FAIXAS = [
    { rotulo: "Até R$ 50", min: null, max: 50 },
    { rotulo: "R$ 50 – 100", min: 50, max: 100 },
    { rotulo: "R$ 100 – 250", min: 100, max: 250 },
    { rotulo: "R$ 250 – 500", min: 250, max: 500 },
    { rotulo: "Acima de R$ 500", min: 500, max: null }
  ];

  const CATEGORIAS = window.CATEGORIAS || [];
  const catPorId = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));

  let produtos = window.PRODUTOS || [];
  const params = new URLSearchParams(location.search);
  // Modo pré-visualização (só quando o Firebase ainda não está configurado)
  if (!window.ALPAMA_FIREBASE_ATIVO && params.get("preview") === "1") {
    try {
      const rascunho = JSON.parse(localStorage.getItem("alpama_rascunho") || "null");
      if (Array.isArray(rascunho)) {
        produtos = rascunho;
        const b = document.createElement("div");
        b.className = "preview-banner";
        b.innerHTML = 'Pré-visualização do rascunho do painel — só você está vendo isto. <a href="admin.html">Voltar ao painel</a>';
        document.body.prepend(b);
      }
    } catch (e) { /* ignora */ }
  }

  const $ = (s) => document.querySelector(s);
  const el = {
    busca: $("#busca"), cats: $("#categorias"), faixas: $("#faixas"), lojas: $("#lojas"),
    min: $("#precoMin"), max: $("#precoMax"), promo: $("#soPromo"), ordem: $("#ordem"),
    grid: $("#grid"), vazio: $("#vazio"), contagem: $("#contagem"), ativos: $("#ativos"),
    filtros: $("#filtros"), overlay: $("#overlay")
  };

  const estado = {
    busca: params.get("q") || "",
    categoria: params.get("cat") || "",
    min: numOuNulo(params.get("min")),
    max: numOuNulo(params.get("max")),
    lojas: new Set((params.get("loja") || "").split(",").filter(Boolean)),
    promo: params.get("promo") === "1",
    ordem: params.get("ordem") || "relevancia"
  };

  function numOuNulo(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const brl = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const urlSegura = (u) => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");
  const desconto = (p) => (p.precoAntigo && p.precoAntigo > p.preco ? Math.round((1 - p.preco / p.precoAntigo) * 100) : 0);

  // ---------- Montagem dos controles ----------
  function montarCategorias() {
    const contagem = {};
    produtos.forEach((p) => { contagem[p.categoria] = (contagem[p.categoria] || 0) + 1; });
    const botoes = [{ id: "casa", nome: "Tudo" }]
      .concat(CATEGORIAS.filter((c) => contagem[c.id]))
      .map((c) => `<button class="cat" type="button" data-cat="${c.id === "casa" ? "" : esc(c.id)}">
          <span class="cat__ico">${window.icone(c.id)}</span><span class="cat__nome">${esc(c.nome)}</span>
          <small>${c.id !== "casa" ? contagem[c.id] : produtos.length}</small></button>`);
    el.cats.innerHTML = botoes.join("");
    el.cats.addEventListener("click", (e) => {
      const b = e.target.closest(".cat");
      if (!b) return;
      estado.categoria = b.dataset.cat;
      atualizar();
    });
  }

  function montarFaixas() {
    el.faixas.innerHTML = FAIXAS.map((f, i) => `<button class="chip" type="button" data-i="${i}">${f.rotulo}</button>`).join("");
    el.faixas.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const f = FAIXAS[b.dataset.i];
      const ativa = estado.min === f.min && estado.max === f.max;
      estado.min = ativa ? null : f.min;
      estado.max = ativa ? null : f.max;
      atualizar();
    });
  }

  function montarLojas() {
    const contagem = {};
    produtos.forEach((p) => { contagem[p.loja] = (contagem[p.loja] || 0) + 1; });
    el.lojas.innerHTML = Object.entries(LOJAS)
      .filter(([id]) => contagem[id])
      .map(([id, l]) => `<label class="check"><input type="checkbox" value="${id}">
        <span class="dot" style="background:${l.cor}"></span>${l.nome}<small>${contagem[id]}</small></label>`)
      .join("");
    document.getElementById("grupoLoja").hidden = Object.keys(contagem).length < 2;
    el.lojas.addEventListener("change", (e) => {
      if (e.target.checked) estado.lojas.add(e.target.value);
      else estado.lojas.delete(e.target.value);
      atualizar();
    });
  }

  // ---------- Filtro e ordenação ----------
  function filtrar() {
    const termos = normalizar(estado.busca).split(/\s+/).filter(Boolean);
    let lista = produtos.filter((p) => {
      if (estado.categoria && p.categoria !== estado.categoria) return false;
      if (estado.min !== null && p.preco < estado.min) return false;
      if (estado.max !== null && p.preco > estado.max) return false;
      if (estado.lojas.size && !estado.lojas.has(p.loja)) return false;
      if (estado.promo && !desconto(p)) return false;
      if (termos.length) {
        const alvo = normalizar([p.nome, p.descricao, catPorId[p.categoria]?.nome].join(" "));
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
    if (ord) lista = lista.slice().sort(ord);
    return lista;
  }

  // ---------- Renderização ----------
  function card(p) {
    const loja = LOJAS[p.loja] || LOJAS.outra;
    const cat = catPorId[p.categoria];
    const off = desconto(p);
    const img = /^data:image\//.test(p.imagem || "") ? p.imagem : urlSegura(p.imagem);
    const link = urlSegura(p.link) || "#";
    return `<article class="card">
      <a class="card__img" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener" tabindex="-1" aria-hidden="true">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-cat="${esc(p.categoria)}">`
              : `<div class="card__placeholder">${window.icone(p.categoria)}</div>`}
        ${off ? `<span class="badge">-${off}%</span>` : ""}
        <span class="loja loja--${esc(p.loja in LOJAS ? p.loja : "outra")}">${esc(loja.nome)}</span>
      </a>
      <div class="card__body">
        ${cat ? `<span class="card__cat">${esc(cat.nome)}</span>` : ""}
        <h3 class="card__nome" title="${esc(p.nome)}">${esc(p.nome)}</h3>
        ${p.descricao ? `<p class="card__desc">${esc(p.descricao)}</p>` : ""}
        <div class="card__precos">
          ${off ? `<span class="card__antigo">R$ ${brl(p.precoAntigo)}</span>` : ""}
          <div class="card__preco"><small>R$</small>${brl(p.preco)}</div>
        </div>
        <a class="btn card__btn card__btn--${esc(p.loja)}" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener">
          <span class="txt-lg">${esc(loja.botao)}</span><span class="txt-sm">Ver oferta</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>
        </a>
      </div>
    </article>`;
  }

  function renderAtivos() {
    const tags = [];
    if (estado.busca) tags.push(["busca", `“${estado.busca}”`]);
    if (estado.categoria && catPorId[estado.categoria]) tags.push(["categoria", catPorId[estado.categoria].nome]);
    if (estado.min !== null || estado.max !== null) {
      const t = estado.min !== null && estado.max !== null ? `R$ ${estado.min} – ${estado.max}`
        : estado.min !== null ? `A partir de R$ ${estado.min}` : `Até R$ ${estado.max}`;
      tags.push(["preco", t]);
    }
    estado.lojas.forEach((l) => tags.push(["loja:" + l, LOJAS[l]?.nome || l]));
    if (estado.promo) tags.push(["promo", "Com desconto"]);
    el.ativos.innerHTML = tags.map(([k, t]) => `<button class="tag" type="button" data-k="${esc(k)}" aria-label="Remover filtro ${esc(t)}">${esc(t)}</button>`).join("");
  }

  function sincronizarControles() {
    if (el.busca.value !== estado.busca) el.busca.value = estado.busca;
    el.min.value = estado.min ?? "";
    el.max.value = estado.max ?? "";
    el.promo.checked = estado.promo;
    el.ordem.value = estado.ordem;
    el.cats.querySelectorAll(".cat").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === estado.categoria)));
    el.faixas.querySelectorAll(".chip").forEach((b) => {
      const f = FAIXAS[b.dataset.i];
      b.setAttribute("aria-pressed", String(f.min === estado.min && f.max === estado.max));
    });
    el.lojas.querySelectorAll("input").forEach((i) => { i.checked = estado.lojas.has(i.value); });
  }

  function salvarURL() {
    const q = new URLSearchParams();
    if (params.get("preview") === "1") q.set("preview", "1");
    if (estado.busca) q.set("q", estado.busca);
    if (estado.categoria) q.set("cat", estado.categoria);
    if (estado.min !== null) q.set("min", estado.min);
    if (estado.max !== null) q.set("max", estado.max);
    if (estado.lojas.size) q.set("loja", [...estado.lojas].join(","));
    if (estado.promo) q.set("promo", "1");
    if (estado.ordem !== "relevancia") q.set("ordem", estado.ordem);
    const s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
  }

  function atualizar() {
    const lista = filtrar();
    el.grid.innerHTML = lista.map(card).join("");
    el.grid.querySelectorAll("img[data-cat]").forEach((img) => {
      img.addEventListener("error", () => { img.outerHTML = `<div class="card__placeholder">${window.icone(img.dataset.cat)}</div>`; }, { once: true });
    });
    el.vazio.hidden = lista.length > 0;
    el.contagem.innerHTML = `<strong>${lista.length}</strong> ${lista.length === 1 ? "produto encontrado" : "produtos encontrados"}`;
    sincronizarControles();
    renderAtivos();
    salvarURL();
  }

  function limpar() {
    Object.assign(estado, { busca: "", categoria: "", min: null, max: null, promo: false });
    estado.lojas.clear();
    atualizar();
  }

  // ---------- Eventos ----------
  let t;
  el.busca.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { estado.busca = el.busca.value.trim(); atualizar(); }, 150);
  });
  const lerPreco = () => { estado.min = numOuNulo(el.min.value); estado.max = numOuNulo(el.max.value); atualizar(); };
  el.min.addEventListener("change", lerPreco);
  el.max.addEventListener("change", lerPreco);
  el.promo.addEventListener("change", () => { estado.promo = el.promo.checked; atualizar(); });
  el.ordem.addEventListener("change", () => { estado.ordem = el.ordem.value; atualizar(); });
  $("#limpar").addEventListener("click", limpar);
  document.querySelector("[data-limpar]").addEventListener("click", limpar);

  el.ativos.addEventListener("click", (e) => {
    const b = e.target.closest(".tag");
    if (!b) return;
    const k = b.dataset.k;
    if (k === "busca") estado.busca = "";
    else if (k === "categoria") estado.categoria = "";
    else if (k === "preco") { estado.min = null; estado.max = null; }
    else if (k === "promo") estado.promo = false;
    else if (k.startsWith("loja:")) estado.lojas.delete(k.slice(5));
    atualizar();
  });

  const abrir = () => { el.filtros.classList.add("aberto"); el.overlay.hidden = false; };
  const fechar = () => { el.filtros.classList.remove("aberto"); el.overlay.hidden = true; };
  $("#abrirFiltros").addEventListener("click", abrir);
  $("#fecharFiltros").addEventListener("click", fechar);
  el.overlay.addEventListener("click", fechar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });

  $("#ano").textContent = new Date().getFullYear();

  document.querySelectorAll("[data-ico]").forEach((n) => { n.innerHTML = window.icone(n.dataset.ico); });

  // ---------- Carrega os produtos (Firebase ou produtos.js) ----------
  const CACHE = "alpama_cache_v1", CACHE_MIN = 5;
  async function carregarDoFirebase() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE) || "null");
      if (c && Date.now() - c.t < CACHE_MIN * 60000 && Array.isArray(c.p)) return c.p;
    } catch (e) { /* ignora */ }
    const fb = await window.alpamaFirebase();
    const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, window.ALPAMA_COLECAO));
    const lista = [];
    snap.forEach((d) => {
      const x = d.data();
      if (x && x.ativo === false) return;
      lista.push({ ...x, id: d.id, criadoEm: x.criadoEm && x.criadoEm.toMillis ? x.criadoEm.toMillis() : x.criadoEm || 0 });
    });
    lista.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
    try { sessionStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), p: lista })); } catch (e) { /* cheio: segue sem cache */ }
    return lista;
  }
  if (window.ALPAMA_FIREBASE_ATIVO) {
    el.contagem.textContent = "Carregando produtos…";
    el.grid.innerHTML = '<div class="card card--carregando"></div>'.repeat(6);
    try {
      produtos = await carregarDoFirebase();
    } catch (e) {
      console.error(e);
      produtos = [];
      el.vazio.querySelector("h3").textContent = "Não foi possível carregar os produtos";
      el.vazio.querySelector("p").textContent = "Verifique sua conexão e tente novamente em instantes.";
    }
  }
  produtos = produtos.filter((p) => p && p.nome && Number.isFinite(Number(p.preco))).map((p) => ({ ...p, preco: Number(p.preco), precoAntigo: p.precoAntigo ? Number(p.precoAntigo) : null }));

  montarCategorias();
  montarFaixas();
  montarLojas();
  atualizar();
})();
