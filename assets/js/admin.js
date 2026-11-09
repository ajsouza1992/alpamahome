(function () {
  "use strict";

  const CHAVE = "alpama_rascunho";
  const NUVEM = !!window.ALPAMA_FIREBASE_ATIVO;
  const COL = window.ALPAMA_COLECAO || "produtos";
  const CATEGORIAS = window.CATEGORIAS || [];
  const catPorId = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));
  const $ = (s) => document.querySelector(s);

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const urlOk = (u) => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");
  const imgOk = (u) => (/^data:image\//.test(String(u || "")) ? u : urlOk(u));
  const ehML = (u) => /mercadoli[vb]re|mercadolibre|meli\.la|mlstatic/i.test(String(u));
  const novoId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  document.querySelectorAll("[data-ico]").forEach((n) => { n.innerHTML = window.icone(n.dataset.ico); });

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 3200);
  }
  function erroNuvem(e) {
    console.error(e);
    const c = (e && e.code) || "";
    if (c.includes("permission-denied")) return "Sem permissão para gravar. Confira o seu UID nas regras do Firestore.";
    if (c.includes("unavailable") || c.includes("network")) return "Sem conexão com o Firebase. Tente de novo.";
    return "Erro ao salvar: " + (e && e.message ? e.message : "tente novamente");
  }

  // =====================================================================
  // ARMAZENAMENTO — local (rascunho no navegador) ou nuvem (Firestore)
  // =====================================================================
  const armazemLocal = {
    async listar() {
      try {
        const r = JSON.parse(localStorage.getItem(CHAVE) || "null");
        if (Array.isArray(r)) return r;
      } catch (e) { /* ignora */ }
      return JSON.parse(JSON.stringify(window.PRODUTOS || []));
    },
    async gravarTudo(lista) {
      try { localStorage.setItem(CHAVE, JSON.stringify(lista)); }
      catch (e) { throw new Error("Espaço do navegador cheio. Prefira colar o endereço da imagem."); }
    }
  };

  function armazemNuvem(fb) {
    const { fs, db } = fb;
    const limpar = (p) => {
      const { id, criadoEm, ...dados } = p;
      return dados;
    };
    return {
      async listar() {
        const snap = await fs.getDocs(fs.collection(db, COL));
        const lista = [];
        snap.forEach((d) => {
          const x = d.data();
          lista.push({ ...x, id: d.id, criadoEm: x.criadoEm && x.criadoEm.toMillis ? x.criadoEm.toMillis() : x.criadoEm || 0 });
        });
        return lista.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
      },
      async salvar(p, novo) {
        const dados = { ...limpar(p), atualizadoEm: fs.serverTimestamp() };
        if (novo) dados.criadoEm = fs.serverTimestamp();
        await fs.setDoc(fs.doc(db, COL, p.id), dados, { merge: true });
      },
      async excluir(id) {
        await fs.deleteDoc(fs.doc(db, COL, id));
      },
      async importar(lista) {
        const agora = Date.now();
        for (let i = 0; i < lista.length; i += 400) {
          const lote = fs.writeBatch(db);
          lista.slice(i, i + 400).forEach((p, j) => {
            const id = String(p.id || novoId()).replace(/[\/]/g, "-");
            lote.set(fs.doc(db, COL, id), {
              ...limpar(p),
              criadoEm: fs.Timestamp.fromMillis(agora - (i + j) * 1000),
              atualizadoEm: fs.serverTimestamp()
            }, { merge: true });
          });
          await lote.commit();
        }
      }
    };
  }

  let produtos = [];
  let nuvem = null; // armazém do Firestore quando logado

  // Salva / exclui / importa, em qualquer modo
  async function salvarProduto(p, novo) {
    if (nuvem) {
      await nuvem.salvar(p, novo);
      p.criadoEm = p.criadoEm || Date.now();
    }
    const i = produtos.findIndex((x) => x.id === p.id);
    const copia = produtos.slice();
    if (i >= 0) copia[i] = { ...produtos[i], ...p }; else copia.unshift(p);
    if (!nuvem) await armazemLocal.gravarTudo(copia);
    produtos = copia;
    limparCacheSite();
  }
  async function excluirProduto(id) {
    if (nuvem) await nuvem.excluir(id);
    const copia = produtos.filter((x) => x.id !== id);
    if (!nuvem) await armazemLocal.gravarTudo(copia);
    produtos = copia;
    limparCacheSite();
  }
  function limparCacheSite() {
    try { sessionStorage.removeItem("alpama_cache_v1"); } catch (e) { /* ignora */ }
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

  // =====================================================================
  // ABAS
  // =====================================================================
  function irPara(aba) {
    document.querySelectorAll(".aba").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === aba)));
    document.querySelectorAll(".tela").forEach((t) => { t.hidden = t.id !== "tela-" + aba; });
    if (aba === "publicar" && !nuvem) infoTamanho();
    try { history.replaceState(null, "", "#" + aba); } catch (e) { /* ignora */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll(".aba").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.aba)));

  // =====================================================================
  // FORMULÁRIO DE CADASTRO
  // =====================================================================
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

  // Envio de foto: reduz para no máx. 640px e comprime em JPEG (~40–70 KB)
  function lerArquivo(file) {
    if (!file || !/^image\//.test(file.type)) { toast("Escolha um arquivo de imagem."); return; }
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 640;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        imagemEnviada = c.toDataURL("image/jpeg", 0.78);
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
    if ($("#tela-cadastro").hidden || document.body.classList.contains("bloqueado")) return;
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

  f.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const link = urlOk(f.link.value);
    const preco = lerPreco(f.preco.value);
    const antigo = lerPreco(f.antigo.value);
    if (!link) { toast("Cole o link do produto (começando com https://)"); f.link.focus(); return; }
    if (!f.nome.value.trim()) { toast("Informe o nome do produto"); f.nome.focus(); return; }
    if (preco === null) { toast("Preço inválido. Ex.: 129,90"); f.preco.focus(); return; }

    const novo = !f.id.value;
    const dados = {
      id: f.id.value || novoId(),
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
    if (dados.imagem.length > 900000) { toast("Foto muito grande. Use outra imagem ou cole o endereço."); return; }

    const rotulo = f.salvar.textContent;
    f.salvar.disabled = true;
    f.salvar.textContent = "Salvando…";
    try {
      await salvarProduto(dados, novo);
      toast(novo ? (nuvem ? "Produto publicado no site ✓" : "Produto cadastrado ✓") : "Produto atualizado ✓");
      limparForm();
      renderLista();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      f.salvar.textContent = rotulo;
      toast(nuvem ? erroNuvem(err) : err.message);
    } finally {
      f.salvar.disabled = false;
      if (f.salvar.textContent === "Salvando…") f.salvar.textContent = rotulo;
    }
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

  // =====================================================================
  // LISTA DE PRODUTOS
  // =====================================================================
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
  lista.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-acao]");
    if (!b) return;
    const p = produtos.find((x) => x.id === b.dataset.id);
    if (!p) return;
    if (b.dataset.acao === "editar") editar(p.id);
    if (b.dataset.acao === "excluir" && confirm(`Excluir “${p.nome}” do site?`)) {
      b.disabled = true;
      try {
        await excluirProduto(p.id);
        renderLista();
        toast("Produto excluído");
      } catch (err) {
        b.disabled = false;
        toast(nuvem ? erroNuvem(err) : err.message);
      }
    }
  });

  // =====================================================================
  // PUBLICAR (modo local) / BACKUP (modo nuvem)
  // =====================================================================
  function gerarArquivo() {
    return `/*
 * ALPAMA HOME — catálogo de produtos
 * Gerado pelo painel do moderador (admin.html) em ${new Date().toLocaleString("pt-BR")}.
 */
window.CATEGORIAS = ${JSON.stringify(window.CATEGORIAS || [], null, 2)};

window.PRODUTOS = ${JSON.stringify(produtos.map(({ criadoEm, atualizadoEm, ...p }) => p), null, 2)};
`;
  }
  function baixar(nome) {
    const blob = new Blob([gerarArquivo()], { type: "text/javascript;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nome });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function infoTamanho() {
    const kb = Math.round(new Blob([gerarArquivo()]).size / 1024);
    const fotos = produtos.filter((p) => /^data:image\//.test(p.imagem || "")).length;
    $("#infoTam").textContent = `${produtos.length} produtos · arquivo com ~${kb} KB` + (fotos ? ` (${fotos} fotos enviadas do computador)` : "");
  }
  async function lerArquivoProdutos(file) {
    const txt = await file.text();
    if (/\.json$/i.test(file.name)) {
      const j = JSON.parse(txt);
      return Array.isArray(j) ? j : j.produtos || j.PRODUTOS;
    }
    const fake = {};
    new Function("window", txt)(fake); // o próprio produtos.js do site
    return fake.PRODUTOS;
  }

  $("#btnBaixar").addEventListener("click", () => { baixar("produtos.js"); toast("produtos.js baixado"); });
  $("#btnBackup").addEventListener("click", () => {
    baixar("backup-alpama-" + new Date().toISOString().slice(0, 10) + ".js");
    toast("Backup baixado ✓");
  });

  const arquivo = $("#arquivo");
  $("#btnImportar").addEventListener("click", () => arquivo.click());
  $("#btnImportarNuvem").addEventListener("click", () => arquivo.click());
  arquivo.addEventListener("change", async () => {
    const file = arquivo.files[0];
    arquivo.value = "";
    if (!file) return;
    let lidos;
    try {
      lidos = await lerArquivoProdutos(file);
      if (!Array.isArray(lidos)) throw new Error("formato");
      lidos = lidos.filter((p) => p && p.nome && p.link);
    } catch (e) {
      toast("Arquivo inválido. Use um produtos.js baixado pelo painel.");
      return;
    }
    try {
      if (nuvem) {
        if (!confirm(`Enviar ${lidos.length} produtos para o site?`)) return;
        await nuvem.importar(lidos);
        produtos = await nuvem.listar();
        limparCacheSite();
      } else {
        if (!confirm(`Importar ${lidos.length} produtos? Isso substitui o rascunho atual (${produtos.length}).`)) return;
        await armazemLocal.gravarTudo(lidos);
        produtos = lidos;
        infoTamanho();
      }
      renderLista();
      toast(`${lidos.length} produtos importados ✓`);
    } catch (err) {
      toast(nuvem ? erroNuvem(err) : err.message);
    }
  });

  $("#btnDescartar").addEventListener("click", async () => {
    if (!confirm("Descartar o rascunho e voltar ao catálogo publicado?")) return;
    try { localStorage.removeItem(CHAVE); } catch (e) { /* ignora */ }
    produtos = await armazemLocal.listar();
    renderLista();
    infoTamanho();
    limparForm();
    toast("Rascunho descartado");
  });

  function abrirAbaInicial() {
    const inicial = location.hash.slice(1);
    if (["produtos", "publicar"].includes(inicial)) irPara(inicial);
  }

  // =====================================================================
  // INICIALIZAÇÃO
  // =====================================================================
  if (!NUVEM) {
    // Modo local (Firebase ainda não configurado)
    armazemLocal.listar().then((l) => { produtos = l; renderLista(); abrirAbaInicial(); });
    return;
  }

  // Modo nuvem: exige login
  $("#verSite").href = "./";
  $("#abaPublicarNome").textContent = "Conta";
  $("#blocoNuvem").hidden = false;
  $("#blocoLocal").hidden = true;
  $("#sair").hidden = false;

  const loginForm = $("#loginForm"), loginErro = $("#loginErro"), loginBtn = $("#loginBtn");
  function mostrarErroLogin(msg) { loginErro.textContent = msg; loginErro.hidden = !msg; }

  window.alpamaAuth().then((fb) => {
    const { au, auth } = fb;
    au.setPersistence(auth, au.browserLocalPersistence).catch(() => {});

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#loginEmail").value.trim(), senha = $("#loginSenha").value;
      if (!email || !senha) { mostrarErroLogin("Preencha e-mail e senha."); return; }
      loginBtn.disabled = true;
      loginBtn.textContent = "Entrando…";
      mostrarErroLogin("");
      try {
        await au.signInWithEmailAndPassword(auth, email, senha);
      } catch (err) {
        const c = err.code || "";
        mostrarErroLogin(
          c.includes("too-many-requests") ? "Muitas tentativas. Aguarde alguns minutos." :
          c.includes("network") ? "Sem conexão. Verifique a internet." :
          c.includes("unauthorized-domain") ? "Este domínio não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados)." :
          "E-mail ou senha incorretos."
        );
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Entrar";
      }
    });

    $("#sair").addEventListener("click", () => au.signOut(auth));

    au.onAuthStateChanged(auth, async (user) => {
      if (!user) {
        nuvem = null;
        produtos = [];
        document.body.classList.add("bloqueado");
        $("#loginSenha").value = "";
        return;
      }
      $("#contaEmail").textContent = user.email || "";
      document.body.classList.remove("bloqueado");
      nuvem = armazemNuvem(fb);
      lista.innerHTML = '<p class="info-tam">Carregando produtos…</p>';
      try {
        produtos = await nuvem.listar();
      } catch (err) {
        produtos = [];
        toast(erroNuvem(err));
      }
      renderLista();
      abrirAbaInicial();
    });
  }).catch((err) => {
    console.error(err);
    mostrarErroLogin("Não foi possível conectar ao Firebase. Confira o arquivo firebase-config.js e a internet.");
  });
})();
