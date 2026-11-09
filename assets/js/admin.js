(function () {
  "use strict";

  const CHAVE = "alpama_rascunho";
  const CATEGORIAS = window.CATEGORIAS || [];
  const catPorId = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));
  const $ = (s) => document.querySelector(s);

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const urlOk = (u) => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");
  const imgOk = (u) => (/^data:image\//.test(String(u || "")) ? u : urlOk(u));
  const ehML = (u) => /mercadoli[vb]re|mercadolibre|meli\.la|mlstatic/i.test(String(u));

  document.querySelectorAll("[data-ico]").forEach((n) => { n.innerHTML = window.icone(n.dataset.ico); });

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2800);
  }

  // ---------- Dados ----------
  let produtos = carregar();
  function carregar() {
    try {
      const r = JSON.parse(localStorage.getItem(CHAVE) || "null");
      if (Array.isArray(r)) return r;
    } catch (e) { /* ignora */ }
    return JSON.parse(JSON.stringify(window.PRODUTOS || []));
  }
  function persistir() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(produtos));
      return true;
    } catch (e) {
      toast("Espaço do navegador cheio. Baixe o produtos.js e prefira colar o endereço da imagem.");
      return false;
    } finally { renderLista(); }
  }

  // Aceita "1.299,90", "1299.90", "R$ 89,9"
  function lerPreco(txt) {
    let s = String(txt || "").replace(/[^\d.,]/g, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }

  // ---------- Abas ----------
  function irPara(aba) {
    document.querySelectorAll(".aba").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === aba)));
    document.querySelectorAll(".tela").forEach((t) => { t.hidden = t.id !== "tela-" + aba; });
    if (aba === "publicar") infoTamanho();
    try { history.replaceState(null, "", "#" + aba); } catch (e) { /* ignora */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll(".aba").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.aba)));

  // ---------- Formulário ----------
  const f = {
    form: $("#form"), id: $("#f-id"), link: $("#f-link"), nome: $("#f-nome"), preco: $("#f-preco"),
    antigo: $("#f-antigo"), cat: $("#f-categoria"), imagem: $("#f-imagem"), arquivo: $("#f-arquivo"),
    descricao: $("#f-descricao"), destaque: $("#f-destaque"), salvar: $("#btnSalvar"), cancelar: $("#btnCancelar")
  };
  let imagemEnviada = ""; // data URL quando a foto é enviada do computador
  let categoria = CATEGORIAS[0] ? CATEGORIAS[0].id : "";

  f.cat.innerHTML = CATEGORIAS.map((c) => `
    <button type="button" class="cp" role="radio" data-cat="${esc(c.id)}" aria-checked="false">
      <span class="cp__ico">${window.icone(c.id)}</span>${esc(c.nome)}
    </button>`).join("");
  function marcarCategoria(id) {
    categoria = id;
    f.cat.querySelectorAll(".cp").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.cat === id)));
  }
  f.cat.addEventListener("click", (e) => {
    const b = e.target.closest(".cp");
    if (b) marcarCategoria(b.dataset.cat);
  });
  marcarCategoria(categoria);

  f.link.addEventListener("input", () => {
    const v = f.link.value.trim();
    $("#avisoLink").hidden = !v || !urlOk(v) || ehML(v);
  });

  // Imagem: pré-visualização
  const dropImg = $("#dropImg"), dropVazio = $("#dropVazio");
  function mostrarImagem(src) {
    const s = imgOk(src);
    dropImg.hidden = !s;
    dropVazio.hidden = !!s;
    $("#removerImg").hidden = !s;
    if (s) dropImg.src = s; else dropImg.removeAttribute("src");
  }
  dropImg.addEventListener("error", () => { if (dropImg.getAttribute("src")) { mostrarImagem(""); toast("Essa imagem não carregou. Confira o endereço."); } });
  f.imagem.addEventListener("input", () => { imagemEnviada = ""; mostrarImagem(f.imagem.value); });
  $("#removerImg").addEventListener("click", () => { imagemEnviada = ""; f.imagem.value = ""; mostrarImagem(""); });

  // Envio de foto: reduz para no máx. 700px e comprime em JPEG
  function lerArquivo(file) {
    if (!file || !/^image\//.test(file.type)) { toast("Escolha um arquivo de imagem."); return; }
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 700;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        imagemEnviada = c.toDataURL("image/jpeg", 0.8);
        f.imagem.value = "";
        mostrarImagem(imagemEnviada);
        toast("Foto adicionada ✓");
      };
      img.onerror = () => toast("Não consegui abrir essa imagem.");
      img.src = leitor.result;
    };
    leitor.readAsDataURL(file);
  }
  f.arquivo.addEventListener("change", () => { lerArquivo(f.arquivo.files[0]); f.arquivo.value = ""; });
  const drop = $("#drop");
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f.arquivo.click(); } });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("sobre"); }));
  drop.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) return lerArquivo(file);
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (urlOk(url)) { f.imagem.value = url; imagemEnviada = ""; mostrarImagem(url); }
  });
  document.addEventListener("paste", (e) => {
    if ($("#tela-cadastro").hidden) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); lerArquivo(item.getAsFile()); }
  });

  function limparForm() {
    f.form.reset();
    f.id.value = "";
    imagemEnviada = "";
    mostrarImagem("");
    marcarCategoria(CATEGORIAS[0] ? CATEGORIAS[0].id : "");
    $("#avisoLink").hidden = true;
    f.salvar.textContent = "Cadastrar produto";
    f.cancelar.hidden = true;
  }

  f.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const link = urlOk(f.link.value);
    const preco = lerPreco(f.preco.value);
    const antigo = lerPreco(f.antigo.value);
    if (!link) { toast("Cole o link do produto (começando com https://)"); f.link.focus(); return; }
    if (!f.nome.value.trim()) { toast("Informe o nome do produto"); f.nome.focus(); return; }
    if (preco === null) { toast("Preço inválido. Ex.: 129,90"); f.preco.focus(); return; }

    const dados = {
      id: f.id.value || "p" + Date.now().toString(36),
      nome: f.nome.value.trim(),
      preco,
      precoAntigo: antigo && antigo > preco ? antigo : null,
      categoria,
      loja: "mercadolivre",
      link,
      imagem: imagemEnviada || urlOk(f.imagem.value),
      descricao: f.descricao.value.trim(),
      destaque: f.destaque.checked
    };
    const i = produtos.findIndex((p) => p.id === dados.id);
    const antes = JSON.stringify(produtos);
    if (i >= 0) produtos[i] = dados; else produtos.unshift(dados);
    if (!persistir()) { produtos = JSON.parse(antes); renderLista(); return; }
    toast(i >= 0 ? "Produto atualizado ✓" : "Produto cadastrado ✓");
    limparForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  f.cancelar.addEventListener("click", () => { limparForm(); irPara("produtos"); });

  function editar(id) {
    const p = produtos.find((x) => x.id === id);
    if (!p) return;
    irPara("cadastro");
    f.id.value = p.id;
    f.link.value = p.link || "";
    f.nome.value = p.nome || "";
    f.preco.value = p.preco != null ? brl(p.preco) : "";
    f.antigo.value = p.precoAntigo ? brl(p.precoAntigo) : "";
    marcarCategoria(catPorId[p.categoria] ? p.categoria : CATEGORIAS[0].id);
    const dataImg = /^data:image\//.test(p.imagem || "");
    imagemEnviada = dataImg ? p.imagem : "";
    f.imagem.value = dataImg ? "" : p.imagem || "";
    mostrarImagem(p.imagem);
    f.descricao.value = p.descricao || "";
    f.destaque.checked = !!p.destaque;
    f.salvar.textContent = "Salvar alterações";
    f.cancelar.hidden = false;
    f.link.dispatchEvent(new Event("input"));
  }

  // ---------- Lista ----------
  const lista = $("#lista"), filtro = $("#filtroLista");
  function renderLista() {
    $("#total").textContent = produtos.length;
    const termo = filtro.value.trim().toLowerCase();
    const vis = produtos.filter((p) => !termo || (p.nome || "").toLowerCase().includes(termo));
    if (!vis.length) {
      lista.innerHTML = `<div class="vazio"><div class="vazio__ico">${window.icone("organizacao")}</div><h3>${produtos.length ? "Nada encontrado" : "Nenhum produto ainda"}</h3><p>${produtos.length ? "Tente outro termo." : "Vá na aba Cadastro para adicionar o primeiro."}</p></div>`;
      return;
    }
    lista.innerHTML = vis.map((p) => {
      const cat = catPorId[p.categoria];
      const img = imgOk(p.imagem);
      return `<div class="item">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="vazio-img">${window.icone(p.categoria)}</span>`}
        <div class="item__info">
          <p class="item__nome" title="${esc(p.nome)}">${p.destaque ? "★ " : ""}${esc(p.nome)}</p>
          <p class="item__meta">
            <strong>R$ ${brl(p.preco)}</strong>
            ${p.precoAntigo ? `<s>R$ ${brl(p.precoAntigo)}</s>` : ""}
            <span>· ${esc(cat ? cat.nome : p.categoria)}</span>
            ${img ? "" : '<span class="sem-foto">sem foto</span>'}
          </p>
        </div>
        <div class="item__acoes">
          <a class="icon-btn" href="${esc(urlOk(p.link) || "#")}" target="_blank" rel="noopener" title="Abrir no Mercado Livre">↗</a>
          <button class="icon-btn" type="button" data-acao="editar" data-id="${esc(p.id)}" title="Editar">✎</button>
          <button class="icon-btn icon-btn--perigo" type="button" data-acao="excluir" data-id="${esc(p.id)}" title="Excluir">🗑</button>
        </div>
      </div>`;
    }).join("");
  }
  filtro.addEventListener("input", renderLista);
  lista.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-acao]");
    if (!b) return;
    const p = produtos.find((x) => x.id === b.dataset.id);
    if (!p) return;
    if (b.dataset.acao === "editar") editar(p.id);
    if (b.dataset.acao === "excluir" && confirm(`Excluir “${p.nome}”?`)) {
      produtos = produtos.filter((x) => x.id !== p.id);
      persistir();
      toast("Produto excluído");
    }
  });

  // ---------- Publicar ----------
  function gerarArquivo() {
    return `/*
 * ALPAMA HOME — catálogo de produtos
 * Gerado pelo painel do moderador (admin.html) em ${new Date().toLocaleString("pt-BR")}.
 * Para atualizar o site, substitua este arquivo pelo novo baixado no painel.
 */
window.CATEGORIAS = ${JSON.stringify(window.CATEGORIAS || [], null, 2)};

window.PRODUTOS = ${JSON.stringify(produtos, null, 2)};
`;
  }
  function infoTamanho() {
    const kb = Math.round(new Blob([gerarArquivo()]).size / 1024);
    const fotos = produtos.filter((p) => /^data:image\//.test(p.imagem || "")).length;
    $("#infoTam").textContent = `${produtos.length} produtos · arquivo com ~${kb} KB` + (fotos ? ` (${fotos} fotos enviadas do computador)` : "") + (kb > 3000 ? " — está ficando grande; prefira colar o endereço da imagem." : "");
  }

  $("#btnBaixar").addEventListener("click", () => {
    const blob = new Blob([gerarArquivo()], { type: "text/javascript;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "produtos.js" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("produtos.js baixado — agora envie para o GitHub");
  });

  const arquivo = $("#arquivo");
  $("#btnImportar").addEventListener("click", () => arquivo.click());
  arquivo.addEventListener("change", async () => {
    const file = arquivo.files[0];
    arquivo.value = "";
    if (!file) return;
    try {
      const txt = await file.text();
      let lidos;
      if (/\.json$/i.test(file.name)) {
        const j = JSON.parse(txt);
        lidos = Array.isArray(j) ? j : j.produtos || j.PRODUTOS;
      } else {
        const fake = {};
        new Function("window", txt)(fake); // o próprio produtos.js do site
        lidos = fake.PRODUTOS;
      }
      if (!Array.isArray(lidos)) throw new Error("formato");
      if (!confirm(`Importar ${lidos.length} produtos? Isso substitui o rascunho atual (${produtos.length}).`)) return;
      produtos = lidos;
      persistir();
      infoTamanho();
      toast(`${lidos.length} produtos importados ✓`);
    } catch (e) {
      toast("Arquivo inválido. Use um produtos.js baixado pelo painel.");
    }
  });

  $("#btnDescartar").addEventListener("click", () => {
    if (!confirm("Descartar o rascunho e voltar ao catálogo publicado?")) return;
    try { localStorage.removeItem(CHAVE); } catch (e) { /* ignora */ }
    produtos = JSON.parse(JSON.stringify(window.PRODUTOS || []));
    renderLista();
    infoTamanho();
    limparForm();
    toast("Rascunho descartado");
  });

  renderLista();
  const inicial = location.hash.slice(1);
  if (["produtos", "publicar"].includes(inicial)) irPara(inicial);
})();
