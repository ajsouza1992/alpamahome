(function () {
  "use strict";

  const CHAVE = "alpama_rascunho";
  const CATEGORIAS = window.CATEGORIAS || [];
  const catPorId = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));
  const NOMES_LOJA = { mercadolivre: "Mercado Livre", shopee: "Shopee", amazon: "Amazon", outra: "Outra" };

  const $ = (s) => document.querySelector(s);
  const f = {
    form: $("#form"), id: $("#f-id"), link: $("#f-link"), nome: $("#f-nome"), preco: $("#f-preco"),
    antigo: $("#f-antigo"), categoria: $("#f-categoria"), loja: $("#f-loja"), imagem: $("#f-imagem"),
    imgPrev: $("#f-img-prev"), descricao: $("#f-descricao"), destaque: $("#f-destaque"),
    salvar: $("#btnSalvar"), cancelar: $("#btnCancelar"), titulo: $("#formTitulo")
  };

  let produtos = carregar();

  function carregar() {
    try {
      const r = JSON.parse(localStorage.getItem(CHAVE) || "null");
      if (Array.isArray(r)) return r;
    } catch (e) { /* ignora */ }
    return JSON.parse(JSON.stringify(window.PRODUTOS || []));
  }
  function persistir() {
    try { localStorage.setItem(CHAVE, JSON.stringify(produtos)); } catch (e) { toast("Não foi possível salvar o rascunho neste navegador."); }
    render();
  }

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const urlSegura = (u) => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");

  // Aceita "1.299,90", "1299.90", "R$ 89,9"
  function lerPreco(txt) {
    let s = String(txt || "").replace(/[^\d.,]/g, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }

  function detectarLoja(url) {
    const u = String(url).toLowerCase();
    if (/mercadoli[vb]re|mercadolibre|meli\.la|mlstatic/.test(u)) return "mercadolivre";
    if (/shopee|shp\.ee/.test(u)) return "shopee";
    if (/amazon\.|amzn\.to/.test(u)) return "amazon";
    return null;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- Formulário ----------
  f.categoria.innerHTML = CATEGORIAS.map((c) => `<option value="${esc(c.id)}">${c.icone} ${esc(c.nome)}</option>`).join("");

  f.link.addEventListener("input", () => {
    const l = detectarLoja(f.link.value);
    if (l) f.loja.value = l;
  });
  function atualizarPrevImg() {
    const u = urlSegura(f.imagem.value);
    const novo = u ? Object.assign(document.createElement("img"), { src: u, alt: "", referrerPolicy: "no-referrer" })
                   : Object.assign(document.createElement("span"), { className: "vazio-img", textContent: "🖼️" });
    novo.id = "f-img-prev";
    if (u) novo.onerror = () => { novo.replaceWith(Object.assign(document.createElement("span"), { id: "f-img-prev", className: "vazio-img", textContent: "⚠️", title: "Imagem não carregou" })); };
    $("#f-img-prev").replaceWith(novo);
  }
  f.imagem.addEventListener("input", atualizarPrevImg);

  function limparForm() {
    f.form.reset();
    f.id.value = "";
    f.titulo.textContent = "Adicionar produto";
    f.salvar.textContent = "Adicionar produto";
    f.cancelar.hidden = true;
    atualizarPrevImg();
  }

  f.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const link = urlSegura(f.link.value);
    const preco = lerPreco(f.preco.value);
    const antigo = lerPreco(f.antigo.value);
    if (!link) { toast("Informe um link começando com https://"); f.link.focus(); return; }
    if (preco === null) { toast("Preço inválido. Ex.: 129,90"); f.preco.focus(); return; }

    const dados = {
      id: f.id.value || "p" + Date.now().toString(36),
      nome: f.nome.value.trim(),
      preco,
      precoAntigo: antigo && antigo > preco ? antigo : null,
      categoria: f.categoria.value,
      loja: f.loja.value,
      link,
      imagem: urlSegura(f.imagem.value),
      descricao: f.descricao.value.trim(),
      destaque: f.destaque.checked
    };
    const i = produtos.findIndex((p) => p.id === dados.id);
    if (i >= 0) { produtos[i] = dados; toast("Produto atualizado ✓"); }
    else { produtos.unshift(dados); toast("Produto adicionado ✓"); }
    persistir();
    limparForm();
  });
  f.cancelar.addEventListener("click", limparForm);

  function editar(id) {
    const p = produtos.find((x) => x.id === id);
    if (!p) return;
    f.id.value = p.id;
    f.link.value = p.link || "";
    f.nome.value = p.nome || "";
    f.preco.value = p.preco != null ? brl(p.preco) : "";
    f.antigo.value = p.precoAntigo ? brl(p.precoAntigo) : "";
    f.categoria.value = p.categoria;
    f.loja.value = NOMES_LOJA[p.loja] ? p.loja : "outra";
    f.imagem.value = p.imagem || "";
    f.descricao.value = p.descricao || "";
    f.destaque.checked = !!p.destaque;
    f.titulo.textContent = "Editar produto";
    f.salvar.textContent = "Salvar alterações";
    f.cancelar.hidden = false;
    atualizarPrevImg();
    f.form.scrollIntoView({ behavior: "smooth", block: "start" });
    f.nome.focus({ preventScroll: true });
  }

  // ---------- Lista ----------
  const lista = $("#lista");
  const filtro = $("#filtroLista");
  function render() {
    const termo = filtro.value.trim().toLowerCase();
    const vis = produtos.filter((p) => !termo || (p.nome || "").toLowerCase().includes(termo));
    $("#total").textContent = `(${produtos.length})`;
    if (!vis.length) {
      lista.innerHTML = `<div class="vazio"><p class="vazio__emoji">📦</p><h3>${produtos.length ? "Nada encontrado" : "Nenhum produto ainda"}</h3><p>${produtos.length ? "Tente outro termo." : "Use o formulário para adicionar o primeiro."}</p></div>`;
      return;
    }
    lista.innerHTML = vis.map((p) => {
      const cat = catPorId[p.categoria];
      const img = urlSegura(p.imagem);
      return `<div class="item">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="vazio-img">${cat ? cat.icone : "🏠"}</span>`}
        <div class="item__info">
          <p class="item__nome" title="${esc(p.nome)}">${p.destaque ? "⭐ " : ""}${esc(p.nome)}</p>
          <p class="item__meta">
            <strong>R$ ${brl(p.preco)}</strong>
            ${p.precoAntigo ? `<s>R$ ${brl(p.precoAntigo)}</s>` : ""}
            <span>· ${esc(cat ? cat.nome : p.categoria)}</span>
            <span class="loja loja--${esc(NOMES_LOJA[p.loja] ? p.loja : "outra")}">${esc(NOMES_LOJA[p.loja] || p.loja)}</span>
          </p>
        </div>
        <div class="item__acoes">
          <a class="icon-btn" href="${esc(urlSegura(p.link) || "#")}" target="_blank" rel="noopener" title="Abrir link">↗</a>
          <button class="icon-btn" type="button" data-acao="duplicar" data-id="${esc(p.id)}" title="Duplicar">⧉</button>
          <button class="icon-btn" type="button" data-acao="editar" data-id="${esc(p.id)}" title="Editar">✎</button>
          <button class="icon-btn icon-btn--perigo" type="button" data-acao="excluir" data-id="${esc(p.id)}" title="Excluir">🗑</button>
        </div>
      </div>`;
    }).join("");
  }
  filtro.addEventListener("input", render);
  lista.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-acao]");
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.acao === "editar") editar(id);
    if (b.dataset.acao === "excluir") {
      const p = produtos.find((x) => x.id === id);
      if (p && confirm(`Excluir “${p.nome}”?`)) {
        produtos = produtos.filter((x) => x.id !== id);
        persistir();
        toast("Produto excluído");
      }
    }
    if (b.dataset.acao === "duplicar") {
      const p = produtos.find((x) => x.id === id);
      if (p) {
        const i = produtos.indexOf(p);
        produtos.splice(i + 1, 0, { ...p, id: "p" + Date.now().toString(36), nome: p.nome + " (cópia)" });
        persistir();
        toast("Produto duplicado");
      }
    }
  });

  // ---------- Exportar / importar ----------
  function gerarArquivo() {
    return `/*
 * ALPAMA HOME — catálogo de produtos
 * Gerado pelo painel (admin.html) em ${new Date().toLocaleString("pt-BR")}.
 * Para atualizar o site, substitua este arquivo pelo novo exportado no painel.
 */
window.CATEGORIAS = ${JSON.stringify(CATEGORIAS, null, 2)};

window.PRODUTOS = ${JSON.stringify(produtos, null, 2)};
`;
  }

  $("#btnBaixar").addEventListener("click", () => {
    const blob = new Blob([gerarArquivo()], { type: "text/javascript;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "produtos.js" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("produtos.js baixado — agora envie para o site");
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
        new Function("window", txt)(fake); // arquivo produtos.js do próprio site
        lidos = fake.PRODUTOS;
      }
      if (!Array.isArray(lidos)) throw new Error("formato");
      if (!confirm(`Importar ${lidos.length} produtos? Isso substitui o rascunho atual (${produtos.length}).`)) return;
      produtos = lidos;
      persistir();
      toast(`${lidos.length} produtos importados ✓`);
    } catch (e) {
      toast("Arquivo inválido. Use um produtos.js ou .json exportado pelo painel.");
    }
  });

  $("#btnDescartar").addEventListener("click", () => {
    if (!confirm("Descartar o rascunho e voltar ao catálogo publicado?")) return;
    localStorage.removeItem(CHAVE);
    produtos = JSON.parse(JSON.stringify(window.PRODUTOS || []));
    render();
    limparForm();
    toast("Rascunho descartado");
  });

  render();
})();
