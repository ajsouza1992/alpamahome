/**
 * Miga Promo — app.js
 * Desenvolvido por Alpama Soluções.
 *
 * Entrada: login anônimo (Firebase Authentication)
 * Dados:   histórico e grupos no Firestore (usuarios/{uid}/...)
 *          — sem Firebase configurado, usa o próprio navegador (modo local)
 * Abas:    Criar · Histórico · Grupos
 *
 * A chave do Gemini NÃO fica aqui: este arquivo é público.
 */
(function () {
  "use strict";

  /* =========================== Utilidades =========================== */
  const $ = (s) => document.querySelector(s);
  const CH = { senha: "miga_senha", dica: "miga_dica_ios", grupos: "miga_grupos", convite: "miga_convite", entrou: "miga_entrou" };
  const ls = {
    ler(k, padrao = "") { try { const v = localStorage.getItem(k); return v === null ? padrao : v; } catch (e) { return padrao; } },
    gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } },
    remover(k) { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } },
    lerJson(k, padrao) { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch (e) { return padrao; } }
  };
  const urlOk = (u) => /^https?:\/\//i.test(String(u || "").trim());
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const paraCampo = (n) => (n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const dataCurta = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const NOME_LOJA = { mercadolivre: "Mercado Livre", shopee: "Shopee", amazon: "Amazon", magalu: "Magalu" };
  const ONDE_LOJA = { mercadolivre: "no Mercado Livre", shopee: "na Shopee", amazon: "na Amazon", magalu: "no Magalu" };
  const NOME_CAT = { moda: "Moda e Looks", beleza: "Beleza e Skincare", casa: "Casa e Decoração", saude: "Saúde e Fitness", outros: "Outros" };
  /** Tira o preço que às vezes vem grudado no nome (ex.: "Creatina 350g - R$ 49,90") */
  const limparNome = (t) => String(t || "").replace(/\s*[|\-–:]?\s*(por\s+)?R\$\s*[\d.,]+.*$/i, "").replace(/\s{2,}/g, " ").trim();
  const viaServidor = (u) => "api/imagem?url=" + encodeURIComponent(u);

  function lerPreco(txt) {
    let s = String(txt || "").replace(/[^\d.,]/g, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2800);
  }
  function aviso(el, msg, ok) {
    el.textContent = msg || "";
    el.hidden = !msg;
    el.classList.toggle("ok", !!ok);
  }
  async function api(caminho, corpo) {
    const r = await fetch("api/" + caminho, {
      method: corpo ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-app-senha": ls.ler(CH.senha) },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.erro || "Erro " + r.status), { codigo: d.codigo || (r.status === 404 ? "offline" : "erro") });
    return d;
  }
  async function copiarTexto(texto) {
    try { await navigator.clipboard.writeText(texto); return true; }
    catch (e) {
      const t = document.createElement("textarea");
      t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      t.remove();
      return ok;
    }
  }

  /* =========================== Confirmação no padrão do app =========================== */
  function confirmar({ titulo = "Tem certeza?", texto = "", ok = "Confirmar" } = {}) {
    const d = $("#confirmar");
    $("#confirmarTitulo").textContent = titulo;
    $("#confirmarTexto").textContent = texto;
    $("#confirmarOk").textContent = ok;
    d.returnValue = "";
    d.showModal();
    return new Promise((resolve) => d.addEventListener("close", () => resolve(d.returnValue === "sim"), { once: true }));
  }

  /* =========================== Imagens =========================== */
  // Se a loja bloquear a imagem direta, tenta pelo nosso servidor
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.original) return;
    if (!img.dataset.tentouServidor && urlOk(img.dataset.original)) {
      img.dataset.tentouServidor = "1";
      img.src = viaServidor(img.dataset.original);
    } else if (img.id === "fotoImg") {
      definirFoto("");
      toast("A foto não carregou — use “Trocar foto”");
    } else {
      img.hidden = true;
    }
  }, true);
  function colocarImagem(img, src) {
    delete img.dataset.tentouServidor;
    img.dataset.original = src || "";
    img.referrerPolicy = "no-referrer";
    if (src) img.src = src; else img.removeAttribute("src");
  }
  /** Reduz a foto da galeria para guardar no histórico (JPEG ~100–250 KB) */
  function compactarArquivo(arquivo) {
    return new Promise((ok, erro) => {
      const leitor = new FileReader();
      leitor.onload = () => {
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, 800 / Math.max(im.width, im.height));
          const tela = document.createElement("canvas");
          tela.width = Math.round(im.width * k); tela.height = Math.round(im.height * k);
          const ctx = tela.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, tela.width, tela.height);
          ctx.drawImage(im, 0, 0, tela.width, tela.height);
          ok(tela.toDataURL("image/jpeg", 0.72));
        };
        im.onerror = erro;
        im.src = leitor.result;
      };
      leitor.onerror = erro;
      leitor.readAsDataURL(arquivo);
    });
  }
  /** Arquivo da foto para compartilhar junto com o texto */
  async function arquivoDaImagem(src) {
    if (!src) return null;
    const tentativas = src.startsWith("data:") ? [src] : [viaServidor(src), src];
    for (const u of tentativas) {
      try {
        const r = await fetch(u);
        const tipo = r.headers.get("content-type") || "";
        if (r.ok && tipo.startsWith("image/")) {
          const blob = await r.blob();
          return new File([blob], "achadinho." + (tipo.split("/")[1] || "jpg").replace("jpeg", "jpg"), { type: blob.type || "image/jpeg" });
        }
      } catch (e) { /* tenta a próxima */ }
    }
    return null;
  }
  // Foto em tela cheia
  function abrirVisor(src) {
    if (!src) return;
    colocarImagem($("#visorImg"), src);
    $("#visor").hidden = false;
    document.body.classList.add("travado");
  }
  function fecharVisor() { $("#visor").hidden = true; document.body.classList.remove("travado"); }
  $("#fecharVisor").addEventListener("click", fecharVisor);
  $("#visor").addEventListener("click", (e) => { if (e.target.id === "visor") fecharVisor(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharVisor(); });

  /* =========================== Dados: Firestore ou local =========================== */
  const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
  const cfg = window.FIREBASE_CONFIG;
  const conta = { nuvem: !!(cfg && cfg.projectId && cfg.apiKey), fb: null, uid: "" };

  // ---- modo local (IndexedDB) ----
  const local = (() => {
    let dbP = null;
    const abrir = () => dbP || (dbP = new Promise((ok, erro) => {
      const r = indexedDB.open("miga-promo", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("historico", { keyPath: "id" });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => erro(r.error);
    }));
    async function tx(modo, fn) {
      const db = await abrir();
      return new Promise((ok, erro) => {
        const t = db.transaction("historico", modo);
        const r = fn(t.objectStore("historico"));
        t.oncomplete = () => ok(r && r.result);
        t.onerror = () => erro(t.error);
      });
    }
    return {
      salvar: (i) => tx("readwrite", (s) => s.put(i)),
      listar: async () => ((await tx("readonly", (s) => s.getAll())) || []).sort((a, b) => b.criadoEm - a.criadoEm),
      pegar: (id) => tx("readonly", (s) => s.get(id)),
      apagar: (id) => tx("readwrite", (s) => s.delete(id)),
      limpar: () => tx("readwrite", (s) => s.clear()),
      lerConfig: async () => ({ grupos: ls.lerJson(CH.grupos, []), convite: ls.ler(CH.convite), cupons: ls.lerJson("miga_cupons", []), instagram: ls.ler("miga_instagram") || "" }),
      gravarConfig: async (c) => { ls.gravar(CH.grupos, JSON.stringify(c.grupos)); ls.gravar(CH.convite, c.convite || ""); ls.gravar("miga_cupons", JSON.stringify(c.cupons || [])); ls.gravar("miga_instagram", c.instagram || ""); }
    };
  })();

  // ---- modo nuvem (Firestore) ----
  function criarNuvem() {
    const { fs, db } = conta.fb;
    const col = () => fs.collection(db, "usuarios", conta.uid, "historico");
    const docConfig = () => fs.doc(db, "usuarios", conta.uid, "config", "app");
    return {
      salvar: (i) => fs.setDoc(fs.doc(col(), i.id), i),
      listar: async () => {
        const snap = await fs.getDocs(fs.query(col(), fs.orderBy("criadoEm", "desc")));
        return snap.docs.map((d) => d.data());
      },
      pegar: async (id) => { const d = await fs.getDoc(fs.doc(col(), id)); return d.exists() ? d.data() : null; },
      apagar: (id) => fs.deleteDoc(fs.doc(col(), id)),
      limpar: async () => {
        const snap = await fs.getDocs(col());
        for (let i = 0; i < snap.docs.length; i += 400) {
          const lote = fs.writeBatch(db);
          snap.docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
          await lote.commit();
        }
      },
      lerConfig: async () => {
        const d = await fs.getDoc(docConfig());
        const x = d.exists() ? d.data() : {};
        return { grupos: x.grupos || [], convite: x.convite || "", cupons: x.cupons || [], instagram: x.instagram || "" };
      },
      gravarConfig: (c) => fs.setDoc(docConfig(), { grupos: c.grupos, convite: c.convite || "", cupons: c.cupons || [], instagram: c.instagram || "", atualizadoEm: Date.now() })
    };
  }
  let dados = local;

  /* =========================== Entrada (código de acesso) =========================== */
  // O código é conferido NO SERVIDOR (variável APP_SENHA do Cloudflare); ele não fica escrito no app.
  function mostrarEntrada(sim) {
    $("#telaEntrada").hidden = !sim;
    document.body.classList.toggle("travado", sim);
    if (sim) setTimeout(() => $("#codigoAcesso").focus(), 50);
  }
  function carregandoEntrada(sim) {
    const b = $("#entrar");
    b.disabled = sim;
    b.classList.toggle("ocupado", sim);
    b.querySelector(".rotulo").textContent = sim ? "Entrando..." : "Entrar";
  }
  /** "ok" | "errado" | "bloqueado" | "sem-codigo" | "sem-servidor" (prévia) | "rede" */
  async function conferirCodigo(codigo) {
    try {
      const r = await fetch("api/entrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo }) });
      if (r.status === 404 || r.status === 405) return "sem-servidor";
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) return "ok";
      return d.codigo === "sem-codigo" || d.codigo === "bloqueado" ? d.codigo : "errado";
    } catch (e) {
      return "rede";
    }
  }
  async function iniciarFirebase() {
    const [app, auth, fs] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
    const a = app.initializeApp(cfg);
    conta.fb = { auth, fs, a: auth.getAuth(a), db: fs.getFirestore(a) };
  }
  function usuarioAtual() {
    return new Promise((ok) => { const parar = conta.fb.auth.onAuthStateChanged(conta.fb.a, (u) => { parar(); ok(u); }); });
  }
  /** Depois do código certo: conecta a conta anônima do Firebase e abre o app */
  async function abrirSessao() {
    if (conta.nuvem) {
      if (!conta.fb) await iniciarFirebase();
      let u = await usuarioAtual();
      if (!u) u = (await conta.fb.auth.signInAnonymously(conta.fb.a)).user;
      conta.uid = u.uid;
      dados = criarNuvem();
    }
    mostrarEntrada(false);
    try { config = await dados.lerConfig(); } catch (e) { config = { grupos: [], convite: "", cupons: [] }; toast("Não consegui carregar seus grupos"); }
    config.cupons = config.cupons || [];
    atualizarContadores();
    renderGruposEnvio();
    renderCupons();
  }
  function erroFirebase(e) {
    const c = (e && e.code) || "";
    return c.includes("operation-not-allowed") ? "O login anônimo não está ativado no Firebase (Authentication → Método de login → Anônimo)." :
      c.includes("unauthorized-domain") ? "Este endereço não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados)." :
      c.includes("network") ? "Sem internet. Tente de novo." : "Não consegui conectar à sua conta agora. Tente de novo.";
  }
  function bloquear(msg) {
    ls.remover(CH.senha);
    atual = null;
    $("#resultado").hidden = true;
    $("#codigoAcesso").value = "";
    aviso($("#avisoEntrada"), msg || "");
    mostrarEntrada(true);
  }

  $("#formEntrar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = $("#codigoAcesso").value.trim();
    aviso($("#avisoEntrada"), "");
    if (!codigo) { toast("Digite o código de acesso"); $("#codigoAcesso").focus(); return; }
    carregandoEntrada(true);
    const r = await conferirCodigo(codigo);
    if (r === "ok" || r === "sem-servidor") {
      ls.gravar(CH.senha, codigo);
      try { await abrirSessao(); } catch (err) { aviso($("#avisoEntrada"), erroFirebase(err)); }
    } else {
      aviso($("#avisoEntrada"),
        r === "errado" ? "Código incorreto. Confira e tente de novo." :
        r === "bloqueado" ? "Muitas tentativas erradas. Aguarde 15 minutos e tente de novo." :
        r === "sem-codigo" ? "O código de acesso ainda não foi criado no Cloudflare (variável APP_SENHA)." :
        "Sem internet. Tente de novo.");
      $("#codigoAcesso").select();
    }
    carregandoEntrada(false);
  });

  async function iniciarConta() {
    const salvo = ls.ler(CH.senha);
    if (!salvo) { mostrarEntrada(true); return; }
    mostrarEntrada(true);
    carregandoEntrada(true);
    const r = await conferirCodigo(salvo);
    if (r === "ok" || r === "sem-servidor" || r === "rede") {
      try { await abrirSessao(); } catch (err) { aviso($("#avisoEntrada"), erroFirebase(err)); }
    } else {
      bloquear(r === "sem-codigo" ? "O código de acesso ainda não foi criado no Cloudflare (variável APP_SENHA)." : "O código de acesso mudou. Digite o novo código.");
    }
    carregandoEntrada(false);
  }

  /* =========================== Abas =========================== */
  function irPara(aba) {
    document.querySelectorAll(".aba").forEach((el) => { el.hidden = el.id !== "aba-" + aba; });
    document.querySelectorAll(".abas button").forEach((b) => {
      if (b.dataset.aba === aba) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("#barraGerar").hidden = aba !== "criar";
    if (aba === "historico") renderHistorico();
    if (aba === "grupos") renderGrupos();
    if (aba === "achados" && !catalogoCarregado) carregarCatalogo();
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll(".abas button").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.aba)));

  /* =========================== Seletores =========================== */
  function grupoBotoes(sel, attr) {
    const raiz = $(sel);
    const marcar = (v) => raiz.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset[attr] === v)));
    raiz.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) marcar(b.dataset[attr]); });
    return { marcar, valor: () => raiz.querySelector('[aria-checked="true"]').dataset[attr] };
  }
  const loja = grupoBotoes("#lojas", "loja");
  const categoria = grupoBotoes("#categorias", "cat");
  function detectarLoja(url) {
    const u = String(url).toLowerCase();
    if (/shopee|shope\.ee|shp\.ee/.test(u)) return "shopee";
    if (/mercadoli[vb]re|mercadolibre|meli\.la/.test(u)) return "mercadolivre";
    if (/amazon\.|amzn\.to|a\.co\//.test(u)) return "amazon";
    if (/magazineluiza|magazinevoce|magalu/.test(u)) return "magalu";
    return null;
  }

  /* =========================== Campos e foto =========================== */
  const c = { link: $("#link"), nome: $("#nome"), precoAntigo: $("#precoAntigo"), precoNovo: $("#precoNovo"), cupom: $("#cupom"), imagemUrl: $("#imagemUrl") };
  let fotoAtual = ""; // URL da loja ou foto da galeria (data:)

  function definirFoto(src) {
    fotoAtual = src || "";
    const img = $("#fotoImg");
    img.hidden = !fotoAtual;
    $("#fotoVazia").hidden = !!fotoAtual;
    colocarImagem(img, fotoAtual);
  }
  $("#fotoImg").addEventListener("click", () => abrirVisor(fotoAtual));
  $("#balaoImg").addEventListener("click", () => abrirVisor(atual && (atual.card || atual.imagem)));
  $("#arquivo").addEventListener("change", async () => {
    const f = $("#arquivo").files[0];
    $("#arquivo").value = "";
    if (!f || !f.type.startsWith("image/")) return;
    try { definirFoto(await compactarArquivo(f)); toast("Foto trocada"); }
    catch (e) { toast("Não consegui abrir essa foto"); }
  });
  c.imagemUrl.addEventListener("change", () => definirFoto(urlOk(c.imagemUrl.value) ? c.imagemUrl.value.trim() : ""));

  function atualizarSelo() {
    const a = lerPreco(c.precoAntigo.value), n = lerPreco(c.precoNovo.value);
    const off = a && n && a > n ? Math.round((1 - n / a) * 100) : 0;
    $("#selo").hidden = !off;
    $("#selo").textContent = `-${off}%`;
  }
  c.precoAntigo.addEventListener("input", atualizarSelo);
  c.precoNovo.addEventListener("input", atualizarSelo);

  /* =========================== Buscar produto =========================== */
  c.link.addEventListener("input", () => { const l = detectarLoja(c.link.value); if (l) loja.marcar(l); });
  c.link.addEventListener("paste", (e) => {
    const t = (e.clipboardData && e.clipboardData.getData("text")) || "";
    const lido = lerTextoCompartilhado(t);
    if (lido) { e.preventDefault(); doTexto = lido; c.link.value = lido.link; c.link.dispatchEvent(new Event("input")); }
    setTimeout(() => { if (urlOk(c.link.value)) buscar(); }, 60);
  });
  $("#colar").addEventListener("click", async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      const m = t.match(/https?:\/\/\S+/);
      doTexto = lerTextoCompartilhado(t);
      c.link.value = m ? m[0] : t;
      c.link.dispatchEvent(new Event("input"));
      if (m) buscar();
    } catch (e) { c.link.focus(); toast("Toque e segure no campo para colar"); }
  });

  // Texto compartilhado pelo app da loja (ex.: "Dá uma olhada em Vestido X por R$ 49,90 ... https://s.shopee.com.br/abc")
  let doTexto = null;
  function lerTextoCompartilhado(t) {
    const m = String(t || "").match(/https?:\/\/\S+/);
    if (!m) return null;
    let resto = String(t).replace(m[0], " ").replace(/\s+/g, " ").trim();
    const pm = resto.match(/R\$\s?([\d.]+,\d{2}|[\d.]+)/);
    const preco = pm ? lerPreco(pm[1]) : null;
    let nome = resto
      .replace(/(compre|baixe|confira).{0,40}(shopee|mercado livre|amazon|magalu).*$/i, "")
      .replace(/\s*(por|a partir de|apenas|só)?\s*R\$\s?[\d.,]+.*$/i, "")
      .replace(/^(d[aá] uma olhada( em| nesse| neste)?|confira( esse| este)?|olha( s[oó])?( esse| isso)?|veja( esse)?|encontrei|achei)\s*[:!-]?\s*/i, "")
      .replace(/^(isso|esse produto|este produto)?\s*(na|no)\s+(shopee|mercado livre|amazon|magalu|magazine luiza)\s*[:!-]?\s*/i, "")
      .replace(/[\s:!,.-]+$/, "").trim();
    if (nome.length < 4 || nome.length > 200) nome = "";
    return { link: m[0], nome, preco };
  }
  async function buscar() {
    const link = c.link.value.trim();
    if (!urlOk(link)) { toast("Cola um link começando com https://"); return; }
    const b = $("#buscar");
    b.disabled = true;
    b.querySelector(".rotulo").textContent = "Buscando…";
    aviso($("#avisoBusca"), "");
    const carregando = [$("#foto"), c.nome, c.precoNovo];
    carregando.forEach((el) => el.classList.add("carregando"));
    try {
      const d = await api("produto", { url: link });
      carregando.forEach((el) => el.classList.remove("carregando"));
      if (d.loja) loja.marcar(d.loja);
      if (doTexto && doTexto.link === link) {
        if (!d.nome && doTexto.nome) d.nome = doTexto.nome;
        if (!d.preco && doTexto.preco) d.preco = doTexto.preco;
      }
      if (d.nome) c.nome.value = limparNome(d.nome);
      if (d.preco) c.precoNovo.value = paraCampo(d.preco);
      if (d.precoAntigo) c.precoAntigo.value = paraCampo(d.precoAntigo);
      if (d.imagem) { c.imagemUrl.value = d.imagem; definirFoto(d.imagem); }
      atualizarSelo();
      const falta = [!d.imagem && "foto", !d.nome && "nome", !d.preco && "preço"].filter(Boolean);
      if (d.loja === "shopee" && falta.length) {
        aviso($("#avisoBusca"), `A Shopee não mostra ${falta.join(", ")} para o app. Dica: no app da Shopee toque em Compartilhar → Copiar link e cole aqui o texto inteiro (vem com nome e preço). A foto: salve a imagem do produto e use “Trocar foto”.`, false);
        if (!d.preco) pedirPreco();
      } else {
        aviso($("#avisoBusca"), falta.length ? `Não achei: ${falta.join(", ")}. Completa aí embaixo.` : "Achei tudo. Confere o preço antes de gerar.", !falta.length);
        if (!d.preco) pedirPreco();
      }
    } catch (e) {
      if (e.codigo === "senha") bloquear("O código de acesso mudou. Digite o novo código.");
      else aviso($("#avisoBusca"), e.codigo === "offline" ? "Busca automática indisponível aqui. Preenche os dados e use “Trocar foto”." : `Não consegui ler o produto (${e.message}). Preenche à mão.`);
    } finally {
      carregando.forEach((el) => el.classList.remove("carregando"));
      b.disabled = false;
      b.querySelector(".rotulo").textContent = "Buscar foto, nome e preço";
    }
  }
  function pedirPreco() {
    c.precoNovo.classList.remove("pedir");
    void c.precoNovo.offsetWidth; // reinicia a animação
    c.precoNovo.classList.add("pedir");
    c.precoNovo.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => c.precoNovo.focus({ preventScroll: true }), 350);
  }
  c.precoNovo.addEventListener("input", () => c.precoNovo.classList.remove("pedir"));
  $("#buscar").addEventListener("click", buscar);

  /* =========================== Gerar mensagem =========================== */
  const FRASES = {
    moda: "Esse vai deixar seu look lindo e confortável, do jeitinho que a gente ama 👗",
    beleza: "Pra rotina de autocuidado ficar ainda mais gostosinha 💄",
    casa: "Pra deixar a casa mais aconchegante e com aquele toque especial 🏡",
    saude: "Pra manter a rotina de cuidado e treino em dia, gastando menos 💪",
    outros: "Daqueles achadinhos que facilitam a vida e cabem no bolso ✨"
  };
  function mensagemReserva(p) {
    const onde = ONDE_LOJA[p.loja] || "no Mercado Livre";
    const preco = p.precoAntigo ? `~de ${brl(p.precoAntigo)}~ por *${brl(p.precoNovo)}*` : `por apenas *${brl(p.precoNovo)}*`;
    const cupom = p.cupom ? `\n🎟️ Usa o cupom *${p.cupom}*` : "";
    return `Miga, olha esse achadinho ${onde}! 🤫💖\n\n✨ *${p.nome}*\n\n💸 ${preco}${cupom}\n\n${FRASES[p.categoria] || FRASES.outros}\n\n👉 ${p.link}\n\nCorre que promoção boa assim acaba rapidinho! ⏳🌸`;
  }
  function comConvite(texto) {
    const g = config.grupos.find((x) => x.id === config.convite);
    if (!g || !g.link || texto.includes(g.link)) return texto;
    return `${texto}\n\n💬 Entre no grupo ${g.nome}: ${g.link}`;
  }
  function coletar() {
    [c.nome, c.precoNovo, c.link].forEach((x) => x.classList.remove("erro"));
    const p = {
      nome: limparNome(c.nome.value), precoAntigo: lerPreco(c.precoAntigo.value), precoNovo: lerPreco(c.precoNovo.value),
      link: c.link.value.trim(), categoria: categoria.valor(), loja: loja.valor(), cupom: c.cupom.value.trim()
    };
    const falhas = [];
    if (!urlOk(p.link)) falhas.push([c.link, "Cola o link de afiliado lá em cima"]);
    if (!p.nome) falhas.push([c.nome, "Coloca o nome do produto"]);
    if (!p.precoNovo) falhas.push([c.precoNovo, "Coloca o preço novo"]);
    if (falhas.length) {
      falhas.forEach(([el]) => el.classList.add("erro"));
      falhas[0][0].focus();
      toast(falhas[0][1]);
      return null;
    }
    if (p.precoAntigo && p.precoAntigo <= p.precoNovo) p.precoAntigo = null;
    return p;
  }
  function ocupado(sim) {
    const b = $("#gerar");
    b.disabled = sim;
    b.classList.toggle("ocupado", sim);
    b.querySelector(".rotulo").textContent = sim ? "Gerando..." : "Gerar Miga Promo";
  }
  function formatarWhats(t) {
    return esc(t)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<strong>$2</strong>")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])~([^~\n]+)~/g, "$1<s>$2</s>");
  }

  // Divulgação atual: { id, criadoEm, produto, texto, imagem (URL ou data:), enviadoPara: [] }
  let atual = null;
  let ultimoLink = "";

  function mostrarResultado(avisoMsg) {
    $("#texto").value = atual.texto;
    $("#balaoTexto").innerHTML = formatarWhats(atual.texto);
    const img = $("#balaoImg");
    const foto = atual.card || atual.imagem;
    img.hidden = !foto;
    colocarImagem(img, foto);
    $("#enviarFoto").hidden = !foto;
    $("#abrirEditor").querySelector(".rotulo").textContent = atual.card ? "Editar a imagem" : "Criar imagem com a cara do Miga";
    $("#balaoHora").textContent = new Date(atual.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    aviso($("#avisoIA"), avisoMsg);
    renderGruposEnvio();
    $("#resultado").hidden = false;
    $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function salvarAtual() {
    if (!atual) return;
    try { await dados.salvar(atual); } catch (e) { toast("Não consegui salvar no histórico"); }
    atualizarContadores();
  }
  let salvarTimer;
  $("#texto").addEventListener("input", () => {
    if (!atual) return;
    atual.texto = $("#texto").value;
    $("#balaoTexto").innerHTML = formatarWhats(atual.texto);
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(salvarAtual, 700);
  });

  function esqueletoResultado(sim) {
    $("#resultado").classList.toggle("gerando", sim);
    $("#balaoEsqueleto").hidden = !sim;
    document.querySelectorAll("#ajustes button").forEach((b) => { b.disabled = sim; });
    if (sim) {
      $("#resultado").hidden = false;
      $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  async function gerar(ajuste) {
    const p = coletar();
    if (!p) return;
    const ajustando = typeof ajuste === "string" && atual && ultimoLink === p.link;
    const pedido = ajustando ? { ...p, ajuste, textoAtual: atual.texto } : p;
    ocupado(true);
    esqueletoResultado(true);
    let texto, avisoMsg = "";
    try {
      texto = (await api("gerar", pedido)).texto;
    } catch (e) {
      esqueletoResultado(false);
      if (e.codigo === "senha") { ocupado(false); bloquear("O código de acesso mudou. Digite o novo código."); return; }
      if (ajustando) { ocupado(false); mostrarResultado(`Não consegui ajustar: ${e.message}.`); return; }
      const motivo = e.codigo === "sem-chave" ? "a chave da IA ainda não foi configurada" : e.codigo === "offline" ? "o servidor não está disponível aqui" : e.message;
      texto = mensagemReserva(p);
      avisoMsg = `Usei uma mensagem pronta porque ${motivo}. Pode editar à vontade.`;
    }
    const mesmo = atual && ultimoLink === p.link; // "Outra" do mesmo produto atualiza o mesmo item
    atual = {
      id: mesmo ? atual.id : novoId(),
      criadoEm: mesmo ? atual.criadoEm : Date.now(),
      produto: p,
      texto: comConvite(texto),
      imagem: fotoAtual,
      enviadoPara: mesmo ? atual.enviadoPara : [],
      ...(mesmo && atual.card ? { card: atual.card, cardOpcoes: atual.cardOpcoes } : {})
    };
    ultimoLink = p.link;
    ocupado(false);
    esqueletoResultado(false);
    mostrarResultado(avisoMsg);
    salvarAtual();
  }
  $("#gerar").addEventListener("click", () => gerar());
  $("#refazer").addEventListener("click", () => gerar());
  $("#ajustes").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-ajuste]");
    if (b && atual) gerar(b.dataset.ajuste);
  });

  /* =========================== Catálogo (mais vendidos) =========================== */
  const catFiltro = grupoBotoes("#catFiltro", "v");
  const catLoja = grupoBotoes("#catLoja", "v");
  let catalogoAtual = [], catalogoCarregado = false;

  function esqueletoCatalogo() {
    $("#catalogo").innerHTML = Array.from({ length: 6 }, () =>
      '<div class="produto-cat produto-cat--esq"><div class="produto-cat__foto"></div><span class="esq"></span><span class="esq" style="width:60%"></span></div>').join("");
  }
  async function carregarCatalogo() {
    catalogoCarregado = true;
    aviso($("#avisoCatalogo"), "");
    esqueletoCatalogo();
    let d;
    try {
      d = await api(`catalogo?filtro=${catFiltro.valor()}&loja=${catLoja.valor()}`);
    } catch (e) {
      if (e.codigo === "senha") { bloquear("O código de acesso mudou. Digite o novo código."); return; }
      $("#catalogo").innerHTML = `<p class="vazio-lista">${e.codigo === "offline" ? "O catálogo só funciona no app publicado." : "Não consegui carregar o catálogo agora."}</p>`;
      return;
    }
    const conf = d.configurado || {};
    if (!conf.mercadolivre && !conf.shopee) {
      $("#catalogo").innerHTML = `<div class="conectar"><strong>Catálogo ainda não conectado</strong>
        <span>Para os mais vendidos aparecerem aqui, cadastre as chaves das lojas no Cloudflare (projeto alpama → Configurações → Variáveis e segredos):</span>
        <ol><li><b>Mercado Livre:</b> ML_APP_ID e ML_SECRET</li><li><b>Shopee:</b> SHOPEE_APP_ID e SHOPEE_SECRET</li></ol>
        <span>Depois faça uma nova implantação.</span></div>`;
      return;
    }
    if (d.avisos && d.avisos.length) console.info("Catálogo:", d.avisos.join(" | "));
    catalogoAtual = d.produtos || [];
    if (!catalogoAtual.length) { $("#catalogo").innerHTML = '<p class="vazio-lista">Sem mais vendidos nessa categoria agora. Escolha outra categoria ou outra loja.</p>'; return; }
    $("#catalogo").innerHTML = catalogoAtual.map((p, i) => `
      <article class="produto-cat">
        <div class="produto-cat__foto">
          ${p.imagem ? `<img src="${esc(p.imagem)}" data-original="${esc(p.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
          <a class="produto-cat__loja" href="${esc(p.link)}" target="_blank" rel="noopener" title="Abrir no site">${esc(NOME_LOJA[p.loja] || "")}</a>
        </div>
        <div class="produto-cat__info">
          <strong>${esc(p.nome)}</strong>
          ${p.preco ? `<span class="preco">${brl(p.preco)}</span>` : ""}
          ${p.comissao ? `<small>Comissão ${String(p.comissao).replace(".", ",")}%</small>` : ""}
        </div>
        <button type="button" class="btn btn--rosa" data-gerar="${i}">Gerar oferta</button>
      </article>`).join("");
  }
  [$("#catFiltro"), $("#catLoja")].forEach((el) => el.addEventListener("click", (e) => { if (e.target.closest("button")) setTimeout(carregarCatalogo, 0); }));
  $("#abrirFiltro").addEventListener("click", () => $("#filtroCat").showModal());
  $("#abrirLoja").addEventListener("click", () => $("#filtroLoja").showModal());
  $("#catLoja").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $("#lojaNome").textContent = b.textContent;
    $("#filtroLoja").close();
  });
  $("#catFiltro").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $("#filtroNome").textContent = b.textContent;
    $("#filtroCat").close();
  });
  $("#atualizarCatalogo").addEventListener("click", carregarCatalogo);
  // Pede o link de afiliado antes de ir para a aba Criar
  function pedirLinkAfiliado(p) {
    const d = $("#pedirLink"), campo = $("#pedirLinkCampo");
    $("#pedirLinkTexto").textContent = `Toque em “Abrir o produto”, gere o seu link de afiliado ${ONDE_LOJA[p.loja] || ""} (botão Compartilhar da barra de afiliados) e cole aqui.`;
    $("#pedirLinkAbrir").href = p.link;
    campo.value = "";
    aviso($("#pedirLinkAviso"), "");
    d.returnValue = "";
    d.showModal();
    return new Promise((resolve) => d.addEventListener("close", () => resolve(d.returnValue === "sim" ? campo.value.trim() : null), { once: true }));
  }
  $("#pedirLinkColar").addEventListener("click", async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      const m = t.match(/https?:\/\/\S+/);
      $("#pedirLinkCampo").value = m ? m[0] : t;
    } catch (e) { $("#pedirLinkCampo").focus(); toast("Toque e segure no campo para colar"); }
  });
  $("#pedirLinkOk").addEventListener("click", (e) => {
    const v = $("#pedirLinkCampo").value.trim();
    const m = v.match(/https?:\/\/\S+/);
    if (!m) { e.preventDefault(); aviso($("#pedirLinkAviso"), "Cole o link que começa com https://"); return; }
    $("#pedirLinkCampo").value = m[0];
    if (m[0] === $("#pedirLinkAbrir").getAttribute("href")) { e.preventDefault(); aviso($("#pedirLinkAviso"), "Esse ainda é o link normal do produto. Gere o seu link de afiliado e cole aqui."); }
  });

  $("#catalogo").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-gerar]");
    if (!b) return;
    const p = catalogoAtual[Number(b.dataset.gerar)];
    if (!p) return;
    let link = p.link;
    if (!p.afiliado) {
      link = await pedirLinkAfiliado(p);
      if (!link) return;
    }
    // Preenche a aba Criar com o produto escolhido
    c.link.value = link;
    loja.marcar(p.loja);
    c.nome.value = limparNome(p.nome);
    c.precoNovo.value = p.preco ? paraCampo(p.preco) : "";
    c.precoAntigo.value = p.precoAntigo ? paraCampo(p.precoAntigo) : "";
    c.imagemUrl.value = p.imagem || "";
    definirFoto(p.imagem || "");
    categoria.marcar(p.categoria || "outros");
    atualizarSelo();
    irPara("criar");
    aviso($("#avisoBusca"), p.preco ? "Pronto! Confere o preço e é só gerar." : "Pronto! Digite o preço e é só gerar.", true);
    if (!p.preco) setTimeout(pedirPreco, 300);
  });

  /* =========================== Aba Achados =========================== */
  const BUSCA_LOJA = {
    mercadolivre: (t) => "https://lista.mercadolivre.com.br/" + encodeURIComponent(t.trim().replace(/\s+/g, "-")),
    shopee: (t) => "https://shopee.com.br/search?keyword=" + encodeURIComponent(t.trim()) + "&sortBy=sales",
    amazon: (t) => "https://www.amazon.com.br/s?k=" + encodeURIComponent(t.trim()),
    magalu: (t) => "https://www.magazineluiza.com.br/busca/" + encodeURIComponent(t.trim()) + "/"
  };
  $("#achadoSugestoes").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) { $("#achadoTermo").value = b.textContent; toast("Agora escolha a loja"); }
  });
  $("#achadoLojas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-busca]");
    if (!b) return;
    const termo = $("#achadoTermo").value.trim();
    if (!termo) { toast("Digite o que procura ou toque numa sugestão"); $("#achadoTermo").focus(); return; }
    window.open(BUSCA_LOJA[b.dataset.busca](termo), "_blank", "noopener");
  });
  function renderListaCupons() {
    const l = config.cupons || [];
    $("#listaCupons").innerHTML = l.length
      ? l.map((cp) => `<div class="cupom-item"><span>${esc(cp)}</span><button type="button" class="icone-btn" data-tirar="${esc(cp)}" aria-label="Apagar cupom ${esc(cp)}"><svg><use href="#i-lixo"/></svg></button></div>`).join("")
      : '<p class="vazio-lista">Nenhum cupom salvo ainda.</p>';
  }
  function salvarCupom(valor) {
    const cp = String(valor || "").trim().toUpperCase();
    if (!cp) return false;
    if (!config.cupons.includes(cp)) { config.cupons = [cp, ...config.cupons].slice(0, 30); gravarConfig(); }
    renderCupons();
    return true;
  }
  $("#addCupom").addEventListener("click", () => {
    if (!salvarCupom($("#novoCupom").value)) { toast("Digite o cupom"); $("#novoCupom").focus(); return; }
    $("#novoCupom").value = "";
    toast("Cupom salvo");
  });
  $("#listaCupons").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-tirar]");
    if (!b) return;
    const ok = await confirmar({ titulo: "Apagar cupom?", texto: `O cupom ${b.dataset.tirar} sai da sua lista.`, ok: "Apagar" });
    if (!ok) return;
    config.cupons = config.cupons.filter((x) => x !== b.dataset.tirar);
    gravarConfig(); renderCupons(); toast("Cupom apagado");
  });

  /* =========================== Cupons salvos =========================== */
  function renderCupons() {
    renderListaCupons();
    $("#cupons").innerHTML = (config.cupons || []).map((cp) => `
      <span class="cupom-chip">
        <button type="button" data-usar="${esc(cp)}" title="Usar este cupom">${esc(cp)}</button>
        <button type="button" data-tirar="${esc(cp)}" aria-label="Apagar cupom ${esc(cp)}"><svg><use href="#i-x"/></svg></button>
      </span>`).join("");
  }
  $("#salvarCupom").addEventListener("click", () => {
    if (!salvarCupom(c.cupom.value)) { toast("Digite o cupom para salvar"); c.cupom.focus(); return; }
    c.cupom.value = c.cupom.value.trim().toUpperCase();
    toast("Cupom salvo");
  });
  $("#cupons").addEventListener("click", (e) => {
    const usar = e.target.closest("[data-usar]"), tirar = e.target.closest("[data-tirar]");
    if (usar) { c.cupom.value = usar.dataset.usar; toast("Cupom aplicado"); }
    if (tirar) { config.cupons = config.cupons.filter((x) => x !== tirar.dataset.tirar); gravarConfig(); renderCupons(); toast("Cupom apagado"); }
  });

  /* =========================== Imagem do achadinho (editor) =========================== */
  const edFormato = grupoBotoes("#edFormato", "v");
  const edFundo = grupoBotoes("#edFundo", "v");
  const PALETAS = {
    creme: { fundo: "#fff3c4", tituloFundo: "#e8336d", tituloTexto: "#ffffff", nome: "#1d1d1f", preco: "#e8336d", antigo: "#8a817b", rodape: "#1d1d1f", cartao: "#ffffff" },
    rosa: { fundo: "#e8336d", tituloFundo: "#fff3c4", tituloTexto: "#e8336d", nome: "#ffffff", preco: "#ffd23f", antigo: "rgba(255,255,255,.8)", rodape: "#ffffff", cartao: "#ffffff" },
    branco: { fundo: "#ffffff", tituloFundo: "#e8336d", tituloTexto: "#ffffff", nome: "#1d1d1f", preco: "#e8336d", antigo: "#8a817b", rodape: "#1d1d1f", cartao: "#fff8e4" }
  };
  let edFoto = null, edMarca = null;

  function retArredondado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  /** Quebra o texto em linhas que cabem na largura (com "…" se passar do limite) */
  function quebrarTexto(ctx, texto, largura, maxLinhas) {
    const palavras = String(texto).split(/\s+/).filter(Boolean);
    const linhas = [];
    let atualLinha = "";
    for (const pl of palavras) {
      const teste = atualLinha ? atualLinha + " " + pl : pl;
      if (ctx.measureText(teste).width <= largura) atualLinha = teste;
      else { if (atualLinha) linhas.push(atualLinha); atualLinha = pl; }
    }
    if (atualLinha) linhas.push(atualLinha);
    if (linhas.length > maxLinhas) {
      const corte = linhas.slice(0, maxLinhas);
      let ult = corte[maxLinhas - 1];
      while (ult.length > 1 && ctx.measureText(ult + "…").width > largura) ult = ult.slice(0, -1);
      corte[maxLinhas - 1] = ult.trim() + "…";
      return corte;
    }
    return linhas;
  }

  function desenharCard() {
    if (!atual) return;
    const tela = $("#telaCard");
    const formato = edFormato.valor(), story = formato === "story", post = formato === "post";
    const W = 1080, H = story ? 1920 : post ? 1350 : 1080;
    tela.width = W; tela.height = H;
    const ctx = tela.getContext("2d");
    const P = PALETAS[edFundo.valor()] || PALETAS.creme;
    const p = atual.produto;
    const L = post
      ? { tituloY: 60, tituloFonte: 46, tituloAlt: 84, fotoY: 175, fotoH: 700, nome1: 960, nomeFonte: 48, lh: 60, antigoY: 1085, antigoFonte: 36, precoY: 1175, precoFonte: 82, rodapeY: 1215, rodapeFonte: 32, marca: 140, selo: 105 }
      : story
      ? { tituloY: 110, tituloFonte: 56, tituloAlt: 100, fotoY: 260, fotoH: 960, nome1: 1320, nomeFonte: 58, lh: 74, antigoY: 1490, antigoFonte: 46, precoY: 1590, precoFonte: 100, rodapeY: 1650, rodapeFonte: 40, marca: 190, selo: 125 }
      : { tituloY: 48, tituloFonte: 44, tituloAlt: 80, fotoY: 150, fotoH: 520, nome1: 742, nomeFonte: 44, lh: 54, antigoY: 852, antigoFonte: 34, precoY: 930, precoFonte: 76, rodapeY: 970, rodapeFonte: 30, marca: 124, selo: 98 };

    // Fundo
    ctx.fillStyle = P.fundo;
    ctx.fillRect(0, 0, W, H);

    // Título em pílula
    const titulo = ($("#edTitulo").value.trim() || "ACHADINHO DO DIA").toUpperCase();
    ctx.font = `800 ${L.tituloFonte}px Poppins`;
    const tw = ctx.measureText(titulo).width;
    retArredondado(ctx, (W - tw) / 2 - 40, L.tituloY, tw + 80, L.tituloAlt, L.tituloAlt / 2);
    ctx.fillStyle = P.tituloFundo; ctx.fill();
    ctx.fillStyle = P.tituloTexto; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(titulo, W / 2, L.tituloY + L.tituloAlt / 2 + 3);

    // Foto do produto num cartão
    const fx = 70, fw = W - 140, fy = L.fotoY, fh = L.fotoH;
    ctx.save();
    ctx.shadowColor = "rgba(29,29,31,.2)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
    retArredondado(ctx, fx, fy, fw, fh, 44); ctx.fillStyle = P.cartao; ctx.fill();
    ctx.restore();
    if (edFoto) {
      ctx.save();
      retArredondado(ctx, fx, fy, fw, fh, 44); ctx.clip();
      const pad = 34, k = Math.min((fw - pad * 2) / edFoto.width, (fh - pad * 2) / edFoto.height);
      const iw = edFoto.width * k, ih = edFoto.height * k;
      ctx.drawImage(edFoto, fx + (fw - iw) / 2, fy + (fh - ih) / 2, iw, ih);
      ctx.restore();
    } else {
      ctx.fillStyle = "#b9b0a6"; ctx.font = `500 ${L.nomeFonte}px Poppins`; ctx.textAlign = "center";
      ctx.fillText("sem foto", W / 2, fy + fh / 2);
    }

    // Selo de desconto
    const off = p.precoAntigo && p.precoAntigo > p.precoNovo ? Math.round((1 - p.precoNovo / p.precoAntigo) * 100) : 0;
    if ($("#edSelo").checked && off) {
      ctx.save();
      ctx.translate(fx + fw - L.selo * 0.55, fy + L.selo * 0.55);
      ctx.rotate(-0.17);
      ctx.beginPath(); ctx.arc(0, 0, L.selo, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd23f"; ctx.fill();
      ctx.lineWidth = 8; ctx.strokeStyle = "#1d1d1f"; ctx.stroke();
      ctx.fillStyle = "#1d1d1f"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `800 ${Math.round(L.selo * 0.56)}px Poppins`;
      ctx.fillText(`-${off}%`, 0, 4);
      ctx.restore();
    }

    // Nome
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = P.nome; ctx.font = `700 ${L.nomeFonte}px Poppins`;
    const nome = $("#edNome").value.trim() || p.nome;
    quebrarTexto(ctx, nome, W - 160, 2).forEach((linha, i) => ctx.fillText(linha, 80, L.nome1 + i * L.lh));

    // Preço
    if ($("#edPreco").checked) {
      if (p.precoAntigo) {
        ctx.font = `500 ${L.antigoFonte}px Poppins`; ctx.fillStyle = P.antigo;
        const pre = "de ", valor = brl(p.precoAntigo);
        ctx.fillText(pre + valor, 80, L.antigoY);
        const x0 = 80 + ctx.measureText(pre).width, wv = ctx.measureText(valor).width;
        ctx.fillRect(x0, L.antigoY - L.antigoFonte * 0.34, wv, Math.max(3, L.antigoFonte / 10));
      }
      ctx.font = `800 ${L.precoFonte}px Poppins`; ctx.fillStyle = P.preco;
      ctx.fillText((p.precoAntigo ? "por " : "") + brl(p.precoNovo), 80, L.precoY);
    }

    // Rodapé: cupom (pílula amarela) + texto livre
    let x = 80;
    const ry = L.rodapeY + (story ? 40 : 30);
    const cupom = $("#edCupom").value.trim().toUpperCase();
    ctx.textBaseline = "middle";
    if (cupom) {
      ctx.font = `800 ${L.rodapeFonte}px Poppins`;
      const t = "CUPOM " + cupom, w = ctx.measureText(t).width + 48, h = L.rodapeFonte * 1.9;
      retArredondado(ctx, x, ry - h / 2, w, h, h / 2);
      ctx.fillStyle = "#ffd23f"; ctx.fill();
      ctx.setLineDash([12, 8]); ctx.lineWidth = 4; ctx.strokeStyle = "#1d1d1f"; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#1d1d1f"; ctx.fillText(t, x + 24, ry + 2);
      x += w + 22;
    }
    const rodape = $("#edRodape").value.trim();
    if (rodape) {
      ctx.font = `600 ${L.rodapeFonte}px Poppins`; ctx.fillStyle = P.rodape;
      ctx.fillText(quebrarTexto(ctx, rodape, W - x - L.marca - 70, 1)[0] || "", x, ry + 2);
    }

    // Marca d'água Miga no cantinho
    if ($("#edMarca").checked && edMarca) {
      ctx.globalAlpha = 0.97;
      ctx.drawImage(edMarca, W - L.marca - 36, H - L.marca - 26, L.marca, L.marca);
      ctx.globalAlpha = 1;
    }
  }

  async function abrirEditor() {
    if (!atual) return;
    const op = atual.cardOpcoes || {};
    $("#edTitulo").value = op.titulo || "";
    $("#edNome").value = op.nome || atual.produto.nome;
    $("#edRodape").value = op.rodape || "";
    $("#edCupom").value = op.cupom != null ? op.cupom : (atual.produto.cupom || "");
    $("#edPreco").checked = op.preco !== false;
    $("#edSelo").checked = op.selo !== false;
    $("#edMarca").checked = op.marca !== false;
    edFormato.marcar(op.formato || "quadrado");
    edFundo.marcar(op.fundo || "creme");
    $("#usarOriginal").hidden = !atual.card;
    $("#editor").showModal();
    document.body.classList.add("travado");
    desenharCard();
    try { await Promise.all(["800 40px Poppins", "700 40px Poppins", "600 30px Poppins", "500 30px Poppins"].map((f) => document.fonts.load(f))); } catch (e) { /* segue */ }
    if (!edMarca) {
      edMarca = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = "logo.png?v=27"; });
    }
    edFoto = null;
    try {
      const arq = await arquivoDaImagem(atual.imagem);
      if (arq) edFoto = await createImageBitmap(arq);
    } catch (e) { edFoto = null; }
    if (!edFoto && atual.imagem) toast("Não consegui usar a foto aqui — use “Trocar foto” com uma imagem da galeria");
    desenharCard();
  }
  function fecharEditor() { $("#editor").close(); }
  $("#editor").addEventListener("close", () => document.body.classList.remove("travado"));
  $("#abrirEditor").addEventListener("click", abrirEditor);
  $("#fecharEditor").addEventListener("click", fecharEditor);
  ["#edTitulo", "#edNome", "#edRodape", "#edCupom"].forEach((id) => $(id).addEventListener("input", desenharCard));
  ["#edPreco", "#edSelo", "#edMarca"].forEach((id) => $(id).addEventListener("change", desenharCard));
  ["#edFormato", "#edFundo"].forEach((id) => $(id).addEventListener("click", () => setTimeout(desenharCard, 0)));

  function opcoesDoEditor() {
    return {
      titulo: $("#edTitulo").value.trim(), nome: $("#edNome").value.trim(), rodape: $("#edRodape").value.trim(),
      cupom: $("#edCupom").value.trim(), preco: $("#edPreco").checked, selo: $("#edSelo").checked,
      marca: $("#edMarca").checked, formato: edFormato.valor(), fundo: edFundo.valor()
    };
  }
  $("#usarCard").addEventListener("click", () => {
    atual.card = $("#telaCard").toDataURL("image/jpeg", 0.82);
    atual.cardOpcoes = opcoesDoEditor();
    salvarAtual();
    fecharEditor();
    mostrarResultado("");
    toast("Imagem pronta para enviar");
  });
  $("#usarOriginal").addEventListener("click", () => {
    delete atual.card;
    delete atual.cardOpcoes;
    salvarAtual();
    fecharEditor();
    mostrarResultado("");
    toast("Voltei para a foto original");
  });
  /** Abre o compartilhamento do celular com a imagem (dá para escolher Instagram: feed ou story) */
  function compartilharTela(canvas, nome) {
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const arq = new File([blob], nome, { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq] }); return; } catch (e) { if (e.name === "AbortError") return; }
      }
      baixarBlob(blob, nome);
      toast("Imagem salva — abra o Instagram e escolha da galeria");
    }, "image/jpeg", 0.92);
  }
  function baixarBlob(blob, nome) {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const nomeArquivo = (t) => "miga-promo-" + String(t || "imagem").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + ".jpg";
  $("#compartilharCard").addEventListener("click", () => compartilharTela($("#telaCard"), nomeArquivo(atual && atual.produto.nome)));
  $("#baixarCard").addEventListener("click", () => {
    $("#telaCard").toBlob((blob) => {
      if (!blob) return;
      const nome = "miga-promo-" + (atual.produto.nome || "achadinho").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").slice(0, 40) + ".jpg";
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nome });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast("Imagem salva");
    }, "image/jpeg", 0.9);
  });


  /* =========================== Posts e stories do Instagram =========================== */
  const bnModelo = grupoBotoes("#bnModelo", "v");
  const bnFormato = grupoBotoes("#bnFormato", "v");
  const bnFundo = grupoBotoes("#bnFundo", "v");
  const CORES_BN = {
    creme: { tipo: "creme", texto: "#1d1d1f", destaque: "#e8336d", sub: "#6f6862", pill: "#e8336d", pillTexto: "#ffffff", cartao: "#ffffff", cartaoTexto: "#1d1d1f", cartaoSub: "#6f6862", preco: "#e8336d", antigo: "#8a817b", bola1: "rgba(255,210,63,.35)", bola2: "rgba(232,51,109,.12)", guia: "#d8c99a" },
    rosa: { tipo: "rosa", texto: "#ffffff", destaque: "#ffd23f", sub: "#ffe3ec", pill: "#ffd23f", pillTexto: "#1d1d1f", cartao: "#ffffff", cartaoTexto: "#1d1d1f", cartaoSub: "#6f6862", preco: "#ffd23f", antigo: "rgba(255,255,255,.8)", bola1: "rgba(255,255,255,.08)", bola2: "rgba(255,210,63,.25)", guia: "rgba(255,255,255,.7)" },
    branco: { tipo: "branco", texto: "#1d1d1f", destaque: "#e8336d", sub: "#6f6862", pill: "#e8336d", pillTexto: "#ffffff", cartao: "#fff8e4", cartaoTexto: "#1d1d1f", cartaoSub: "#6f6862", preco: "#e8336d", antigo: "#8a817b", bola1: "rgba(255,210,63,.25)", bola2: "rgba(232,51,109,.08)", guia: "#d8c99a" }
  };
  const arroba = (v) => { const t = String(v || "").trim().replace(/^@+/, "").replace(/\s+/g, ""); return t ? "@" + t : ""; };
  // Título digitado: uma linha por linha; *trecho* fica em destaque
  const linhasTitulo = (t) => String(t || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4)
    .map((l) => l.split(/(\*[^*]+\*)/).filter(Boolean).map((p) => /^\*.+\*$/.test(p) ? [p.slice(1, -1), 1] : [p, 0]));
  const comBotao = (d) => d.botao ? [["gap", 44], ["pill", d.botao]] : [];
  const comTexto = (d, gap = 26) => d.texto ? [["gap", gap], ["sub", d.texto]] : [];
  const comLink = (d) => d.espaco ? [["gap", 30], ["link", 0]] : [];
  /* Cada modelo: valores iniciais dos campos (todos editáveis) + blocos de cima para baixo.
     "produto" = usa foto/nome/preço; "cupom" = usa o campo cupom; "lista" = o texto vira lista. */
  const MODELOS = {
    achadinho: { nome: "achadinho-do-dia", fundo: "creme", produto: true, logo: false,
      padrao: { titulo: "Achadinho\n*do dia* ✨", texto: "", botao: "" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 34], ["foto", 0], ["gap", 30], ["nome", 0], ["gap", 10], ["preco", 0], ...comTexto(d, 18), ...comBotao(d), ...comLink(d)] },
    relampago: { nome: "oferta-relampago", fundo: "rosa", produto: true, logo: false,
      padrao: { titulo: "Oferta\n*relâmpago* ⚡", texto: "Corre que é por pouco tempo!", botao: "" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 34], ["foto", 1], ["gap", 30], ["preco", 0], ...comTexto(d, 14), ...comBotao(d), ...comLink(d)] },
    baixou: { nome: "baixou-o-preco", fundo: "creme", produto: true, logo: false,
      padrao: { titulo: "*Baixou*\no preço! 📉", texto: "", botao: "" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 30], ["precoGrande", 0], ["gap", 30], ["foto", 1], ["gap", 26], ["nome", 0], ...comTexto(d, 14), ...comBotao(d), ...comLink(d)] },
    ultimas: { nome: "ultimas-horas", fundo: "rosa", produto: true, logo: false,
      padrao: { titulo: "*Últimas*\nhoras ⏰", texto: "Esse preço termina hoje!", botao: "" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 34], ["foto", 0], ["gap", 30], ["nome", 0], ["gap", 10], ["preco", 0], ...comTexto(d, 14), ...comBotao(d), ...comLink(d)] },
    novidade: { nome: "chegou-novidade", fundo: "branco", produto: true, logo: false,
      padrao: { titulo: "Chegou\n*novidade* 💖", texto: "", botao: "" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 34], ["foto", 0], ["gap", 30], ["nome", 0], ["gap", 10], ["preco", 0], ...comTexto(d, 14), ...comBotao(d), ...comLink(d)] },
    enquete: { nome: "voce-usaria", fundo: "creme", produto: true, logo: false, rotuloLink: "enquete",
      padrao: { titulo: "Você *usaria*? 🤔", texto: "Responde aqui embaixo 👇", botao: "" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 34], ["foto", 0], ["gap", 26], ["nome", 0], ...comTexto(d, 18), ...comBotao(d), ...comLink(d)] },
    cupom: { nome: "cupom-do-dia", fundo: "creme", cupom: true, logo: true,
      padrao: { titulo: "Cupom\n*do dia* 🎟️", texto: "Copia o código e usa na finalização da compra.", botao: "" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 56], ["cupom", d.cupom || "MIGA10"], ...comTexto(d, 50), ...comBotao(d), ...comLink(d)] },
    lista: { nome: "lista-de-achados", fundo: "creme", lista: true, logo: false,
      padrao: { titulo: "Achados\n*da semana* 🛍️", texto: "Vestido midi canelado\nSérum de vitamina C\nOrganizador de gavetas\nGarrafa térmica 1 litro\nKit de pincéis", botao: "Links nos stories" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 40], ["lista", d.texto], ...comBotao(d)] },
    meutexto: { nome: "meu-texto", fundo: "creme", logo: true,
      padrao: { titulo: "Promoção\n*relâmpago* ⚡", texto: "Corre que esse preço não dura muito!", botao: "Link na bio" },
      blocos: (d) => [["titulo", d.titulo], ...comTexto(d, 26), ...comBotao(d), ...comLink(d)] },
    boasvindas: { nome: "boas-vindas", fundo: "creme", logo: true,
      padrao: { titulo: "Bem-vinda,\n*miga!* 💖", texto: "Aqui eu garimpo os melhores achadinhos com desconto, todo dia.", botao: "Ative as notificações" },
      blocos: (d) => [["titulo", d.titulo], ...comTexto(d, 26), ...comBotao(d)] },
    comofunciona: { nome: "como-funciona", fundo: "creme", logo: false, rodape: "Links de afiliada · sem custo extra",
      padrao: { titulo: "Como *funciona?*", texto: "", botao: "" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 46], ["passos", [["Eu garimpo as ofertas", "Shopee, Mercado Livre e Amazon"], ["Você toca no link", "no post, no story ou na bio"], ["Compra pelo mesmo preço", "e ainda ajuda a miga aqui 💕"]]], ...comTexto(d, 30), ...comBotao(d)] },
    categorias: { nome: "categorias", fundo: "creme", logo: false,
      padrao: { titulo: "O que você\nvai *encontrar* 👀", texto: "+ fitness, saúde e cupons exclusivos", botao: "" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 46], ["cats", [["👗", "Moda"], ["💄", "Beleza"], ["🌸", "Perfumes"], ["🏡", "Casa"]]], ...comTexto(d, 36), ...comBotao(d)] },
    stories: { nome: "ofertas-nos-stories", fundo: "rosa", logo: true,
      padrao: { titulo: "Ofertas\n*relâmpago*\nnos stories ⚡", texto: "As promoções que acabam rápido aparecem primeiro nos stories.", botao: "Siga e ative as notificações" },
      blocos: (d) => [["titulo", d.titulo], ...comTexto(d, 26), ...comBotao(d)] },
    siga: { nome: "siga", fundo: "rosa", logo: true,
      padrao: { titulo: "Não perca\nnenhum\n*achadinho* 💖", texto: "Siga a Miga Promo e ative as notificações dos stories.", botao: "Siga a Miga" },
      blocos: (d) => [["titulo", d.titulo], ...comTexto(d, 26), ...comBotao(d)] }
  };
  const BOAS_VINDAS = ["boasvindas", "comofunciona", "categorias", "stories", "cupom"];
  let bnFoto = null; // foto do produto (ImageBitmap)

  /** Desenha o post/story. d.previa = true mostra as guias (espaço do adesivo), que não saem na imagem final. */
  function desenharBanner(canvas, modelo, formato, fundoEscolhido, d) {
    const M = MODELOS[modelo];
    const W = 1080, H = formato === "story" ? 1920 : formato === "quadrado" ? 1080 : 1350;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const C = CORES_BN[fundoEscolhido === "auto" ? M.fundo : fundoEscolhido] || CORES_BN.creme;
    const escala = formato === "quadrado" ? 0.8 : formato === "story" ? 1.08 : 0.94;

    // Fundo
    if (C.tipo === "creme") {
      const g = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, H * 0.85);
      g.addColorStop(0, "#fff8e4"); g.addColorStop(0.55, "#fff3c4"); g.addColorStop(1, "#ffeaa6");
      ctx.fillStyle = g;
    } else ctx.fillStyle = C.tipo === "rosa" ? "#e8336d" : "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.bola1; ctx.beginPath(); ctx.arc(60, 60, 260, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.bola2; ctx.beginPath(); ctx.arc(W - 40, H - 40, 200, 0, Math.PI * 2); ctx.fill();

    const blocos = [...(d.logo ? [["logo", 260], ["gap", 40]] : []), ...M.blocos(d)].filter(([t, v]) => t !== "titulo" || (v && v.length));
    const FT = Math.round(96 * escala), FS = Math.round(40 * escala), LARG = W - 180;
    const p = d.produto || {};
    const altura = ([tipo, v]) => {
      if (tipo === "gap") return v * escala;
      if (tipo === "logo") return v * escala;
      if (tipo === "titulo") return v.length * FT * 1.08;
      if (tipo === "sub") { ctx.font = `500 ${FS}px Poppins`; return quebrarTexto(ctx, v, LARG, 3).length * FS * 1.38; }
      if (tipo === "pill") return 112 * escala;
      if (tipo === "passos") return v.length * 160 * escala + (v.length - 1) * 26 * escala;
      if (tipo === "cats") return 2 * 220 * escala + 26 * escala;
      if (tipo === "cupom") return 170 * escala;
      if (tipo === "nome") { ctx.font = `700 ${Math.round(46 * escala)}px Poppins`; return p.nome ? quebrarTexto(ctx, p.nome, LARG, 2).length * 58 * escala : 0; }
      if (tipo === "preco") return p.novo ? (p.antigo ? 150 : 100) * escala : 0;
      if (tipo === "precoGrande") return p.novo ? (p.antigo ? 230 : 180) * escala : 0;
      if (tipo === "link") return 130 * escala;
      if (tipo === "lista") return Math.min(5, String(v || "").split("\n").filter((x) => x.trim()).length) * 118 * escala;
      return 0;
    };
    const alturas = blocos.map((b) => b[0] === "foto" ? 0 : altura(b));
    const temRodape = !!(M.rodape || d.insta);
    const util = H - 140 - (temRodape ? 90 : 0);
    const resto = util - alturas.reduce((s, x) => s + x, 0);
    blocos.forEach((b, i) => { if (b[0] === "foto") alturas[i] = Math.max(220, Math.min((b[1] ? 640 : 760) * escala, resto)); });
    const total = alturas.reduce((s, x) => s + x, 0);
    let y = Math.max(50, 70 + (util - total) / 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const sombra = (fn) => { ctx.save(); ctx.shadowColor = "rgba(29,29,31,.18)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12; fn(); ctx.restore(); };

    blocos.forEach(([tipo, v], i) => {
      const h = alturas[i];
      if (tipo === "logo" && edMarca) { const s = h * 1.25; ctx.drawImage(edMarca, (W - s) / 2, y + (h - s) / 2, s, s); }
      if (tipo === "titulo") {
        ctx.font = `800 ${FT}px Poppins`;
        v.forEach((partes, j) => {
          const larg = partes.reduce((s, [t]) => s + ctx.measureText(t).width, 0);
          let x = (W - Math.min(larg, W - 80)) / 2;
          ctx.textAlign = "left";
          partes.forEach(([t, dest]) => { ctx.fillStyle = dest ? C.destaque : C.texto; ctx.fillText(t, x, y + FT * 1.08 * j + FT * 0.56); x += ctx.measureText(t).width; });
          ctx.textAlign = "center";
        });
      }
      if (tipo === "sub") {
        ctx.font = `500 ${FS}px Poppins`; ctx.fillStyle = C.sub;
        quebrarTexto(ctx, v, LARG, 3).forEach((l, j) => ctx.fillText(l, W / 2, y + FS * 1.38 * j + FS * 0.7));
      }
      if (tipo === "pill") {
        const t = String(v).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s{2,}/g, " ").trim();
        ctx.font = `700 ${Math.round(38 * escala)}px Poppins`;
        const pw = Math.min(W - 120, ctx.measureText(t).width + 110 * escala);
        retArredondado(ctx, (W - pw) / 2, y, pw, h, h / 2); ctx.fillStyle = C.pill; ctx.fill();
        ctx.fillStyle = C.pillTexto; ctx.fillText(t, W / 2, y + h / 2 + 2);
      }
      if (tipo === "foto") {
        const s = h, fx = (W - s) / 2;
        sombra(() => { retArredondado(ctx, fx, y, s, s, 48 * escala); ctx.fillStyle = "#ffffff"; ctx.fill(); });
        if (bnFoto) {
          ctx.save(); retArredondado(ctx, fx, y, s, s, 48 * escala); ctx.clip();
          const pad = 26 * escala, k = Math.min((s - pad * 2) / bnFoto.width, (s - pad * 2) / bnFoto.height);
          const iw = bnFoto.width * k, ih = bnFoto.height * k;
          ctx.drawImage(bnFoto, fx + (s - iw) / 2, y + (s - ih) / 2, iw, ih); ctx.restore();
        } else if (d.previa) {
          ctx.font = `600 ${Math.round(34 * escala)}px Poppins`; ctx.fillStyle = "#b3a782";
          ctx.fillText("escolha a foto", W / 2, y + s / 2 - 22 * escala); ctx.fillText("do produto", W / 2, y + s / 2 + 22 * escala);
        }
        const off = p.antigo && p.novo && p.antigo > p.novo ? Math.round((1 - p.novo / p.antigo) * 100) : 0;
        if (off && v) {
          const r = 92 * escala; ctx.save(); ctx.translate(fx + s - r * 0.5, y + r * 0.5); ctx.rotate(-0.17);
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = "#ffd23f"; ctx.fill();
          ctx.lineWidth = 7; ctx.strokeStyle = "#1d1d1f"; ctx.stroke();
          ctx.fillStyle = "#1d1d1f"; ctx.font = `800 ${Math.round(r * 0.56)}px Poppins`; ctx.fillText(`-${off}%`, 0, 4); ctx.restore();
        }
      }
      if (tipo === "nome" && p.nome) {
        ctx.font = `700 ${Math.round(46 * escala)}px Poppins`; ctx.fillStyle = C.texto;
        quebrarTexto(ctx, p.nome, LARG, 2).forEach((l, j) => ctx.fillText(l, W / 2, y + 58 * escala * j + 29 * escala));
      }
      if ((tipo === "preco" || tipo === "precoGrande") && p.novo) {
        const grande = tipo === "precoGrande";
        let yy = y;
        if (p.antigo) {
          ctx.font = `500 ${Math.round((grande ? 48 : 38) * escala)}px Poppins`; ctx.fillStyle = C.antigo;
          const t = "de " + brl(p.antigo), w = ctx.measureText(t).width, hh = (grande ? 48 : 38) * escala;
          ctx.fillText(t, W / 2, yy + hh * 0.7);
          const x0 = W / 2 - w / 2 + ctx.measureText("de ").width; ctx.fillRect(x0, yy + hh * 0.72, w - ctx.measureText("de ").width, Math.max(3, hh / 11));
          yy += hh * 1.45;
        }
        ctx.font = `800 ${Math.round((grande ? 140 : 76) * escala)}px Poppins`; ctx.fillStyle = C.preco;
        ctx.fillText((p.antigo ? "por " : "") + brl(p.novo), W / 2, yy + (grande ? 140 : 76) * escala * 0.6);
      }
      if (tipo === "passos") {
        const ph = 160 * escala, gap = 26 * escala, x0 = 90, pw = W - 180;
        v.forEach(([t, s], j) => {
          const py = y + j * (ph + gap);
          sombra(() => { retArredondado(ctx, x0, py, pw, ph, 40 * escala); ctx.fillStyle = C.cartao; ctx.fill(); });
          const r = 45 * escala, cx = x0 + 40 * escala + r, cy = py + ph / 2;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#ffd23f"; ctx.fill();
          ctx.lineWidth = 5; ctx.strokeStyle = "#1d1d1f"; ctx.stroke();
          ctx.fillStyle = "#1d1d1f"; ctx.font = `800 ${Math.round(46 * escala)}px Poppins`; ctx.fillText(String(j + 1), cx, cy + 3);
          ctx.textAlign = "left";
          const tx = cx + r + 30 * escala, tl = x0 + pw - tx - 30;
          ctx.font = `600 ${Math.round(40 * escala)}px Poppins`; ctx.fillStyle = C.cartaoTexto; ctx.fillText(quebrarTexto(ctx, t, tl, 1)[0], tx, cy - 22 * escala);
          ctx.font = `500 ${Math.round(31 * escala)}px Poppins`; ctx.fillStyle = C.cartaoSub; ctx.fillText(quebrarTexto(ctx, s, tl, 1)[0], tx, cy + 28 * escala);
          ctx.textAlign = "center";
        });
      }
      if (tipo === "cats") {
        const gap = 26 * escala, cw = (W - 180 - gap) / 2, ch = 220 * escala;
        v.forEach(([em, t], j) => {
          const cx = 90 + (j % 2) * (cw + gap), cy = y + Math.floor(j / 2) * (ch + gap);
          sombra(() => { retArredondado(ctx, cx, cy, cw, ch, 40 * escala); ctx.fillStyle = C.cartao; ctx.fill(); });
          ctx.font = `${Math.round(78 * escala)}px Poppins`; ctx.fillStyle = C.cartaoTexto; ctx.fillText(em, cx + cw / 2, cy + ch * 0.38);
          ctx.font = `700 ${Math.round(50 * escala)}px Poppins`; ctx.fillText(t, cx + cw / 2, cy + ch * 0.75);
        });
      }
      if (tipo === "lista") {
        const itens = String(v || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5);
        const ih = 100 * escala, gap = 18 * escala;
        itens.forEach((t, j) => {
          const iy = y + j * (ih + gap);
          sombra(() => { retArredondado(ctx, 90, iy, W - 180, ih, 30 * escala); ctx.fillStyle = C.cartao; ctx.fill(); });
          const r = 32 * escala, cx = 90 + 30 * escala + r;
          ctx.beginPath(); ctx.arc(cx, iy + ih / 2, r, 0, Math.PI * 2); ctx.fillStyle = "#e8336d"; ctx.fill();
          ctx.fillStyle = "#ffffff"; ctx.font = `800 ${Math.round(34 * escala)}px Poppins`; ctx.fillText(String(j + 1), cx, iy + ih / 2 + 2);
          ctx.textAlign = "left"; ctx.fillStyle = C.cartaoTexto; ctx.font = `600 ${Math.round(38 * escala)}px Poppins`;
          ctx.fillText(quebrarTexto(ctx, t, W - 180 - (cx - 90) - r - 60 * escala, 1)[0], cx + r + 26 * escala, iy + ih / 2 + 2);
          ctx.textAlign = "center";
        });
      }
      if (tipo === "cupom") {
        ctx.font = `800 ${Math.round(80 * escala)}px Poppins`;
        const t = String(v).toUpperCase(), cw = ctx.measureText(t).width + 140 * escala;
        ctx.save(); ctx.translate(W / 2, y + h / 2); ctx.rotate(-0.05);
        retArredondado(ctx, -cw / 2, -h / 2, cw, h, 36 * escala); ctx.fillStyle = "#ffffff"; ctx.fill();
        ctx.setLineDash([22, 14]); ctx.lineWidth = 7; ctx.strokeStyle = "#1d1d1f"; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#1d1d1f"; ctx.fillText(t, 0, 4); ctx.restore();
      }
      if (tipo === "link" && d.previa) {
        // Só na prévia: onde colocar o adesivo de link (ou de enquete) do Instagram
        const lw = 520 * escala;
        retArredondado(ctx, (W - lw) / 2, y, lw, h, h / 2);
        ctx.setLineDash([16, 12]); ctx.lineWidth = 4; ctx.strokeStyle = C.guia; ctx.stroke(); ctx.setLineDash([]);
        ctx.font = `600 ${Math.round(30 * escala)}px Poppins`; ctx.fillStyle = C.guia;
        ctx.fillText(M.rotuloLink === "enquete" ? "adesivo de enquete aqui" : "adesivo de link aqui", W / 2, y + h / 2 + 2);
      }
      y += h;
    });

    // Marca d'água no cantinho só quando não tem o logo grande (o Miga não aparece duas vezes)
    const comMarca = !!edMarca && !d.logo;
    if (comMarca) { const s = 150 * escala; ctx.drawImage(edMarca, W - s - 24, H - s - 18, s, s); }
    const rods = [M.rodape, d.insta].filter(Boolean);
    ctx.font = `600 ${Math.round(30 * escala)}px Poppins`; ctx.fillStyle = C.sub;
    rods.forEach((t, k) => {
      const yy = H - (70 + (rods.length - 1 - k) * 44) * escala;
      ctx.fillText(quebrarTexto(ctx, t, comMarca ? W - 400 : W - 120, 1)[0] || "", comMarca ? (W - 180) / 2 : W / 2, yy);
    });
  }

  function dadosBanner(previa) {
    return {
      previa, insta: arroba($("#bnInsta").value), cupom: $("#bnCupom").value.trim().toUpperCase() || (config.cupons || [])[0] || "",
      titulo: linhasTitulo($("#bnTitulo").value), texto: $("#bnTexto").value.trim(), botao: $("#bnBotao").value.trim(),
      logo: $("#bnLogo").checked, espaco: $("#bnEspaco").checked,
      produto: { nome: $("#bnNome").value.trim(), antigo: lerPreco($("#bnAntigo").value), novo: lerPreco($("#bnNovo").value) }
    };
  }
  function redesenharBanner() {
    const M = MODELOS[bnModelo.valor()];
    $("#bnCamposProduto").hidden = !M.produto;
    $("#bnCampoCupom").hidden = !M.cupom;
    $("#bnRotuloTexto").textContent = M.lista ? "Itens da lista (um por linha, até 5)" : "Texto";
    $("#bnTexto").rows = M.lista ? 5 : 2;
    desenharBanner($("#telaBanner"), bnModelo.valor(), bnFormato.valor(), bnFundo.valor(), dadosBanner(true));
  }
  /** Ao trocar de modelo, os campos de texto recebem as sugestões do modelo (tudo continua editável) */
  function aplicarModelo() {
    const M = MODELOS[bnModelo.valor()];
    $("#bnTitulo").value = M.padrao.titulo; $("#bnTexto").value = M.padrao.texto; $("#bnBotao").value = M.padrao.botao;
    $("#bnLogo").checked = !!M.logo;
    redesenharBanner();
  }
  async function carregarMarca() {
    if (!edMarca) edMarca = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = "logo.png?v=27"; });
    try { await Promise.all(["800 40px Poppins", "700 40px Poppins", "600 30px Poppins", "500 30px Poppins"].map((f) => document.fonts.load(f))); } catch (e) { /* segue */ }
  }
  async function fotoDoProdutoAtual() {
    if (!atual) return false;
    try { const arq = await arquivoDaImagem(atual.card ? atual.imagem : atual.imagem); if (arq) { bnFoto = await createImageBitmap(arq); return true; } } catch (e) { /* sem foto */ }
    return false;
  }
  function preencherDoProduto() {
    if (!atual) return;
    const p = atual.produto;
    $("#bnNome").value = limparNome(p.nome || "");
    $("#bnAntigo").value = p.precoAntigo ? paraCampo(p.precoAntigo) : "";
    $("#bnNovo").value = p.precoNovo ? paraCampo(p.precoNovo) : "";
    $("#bnLink").value = p.link || "";
    if (p.cupom) $("#bnCupom").value = p.cupom;
  }
  async function abrirPosts(modelo) {
    $("#bnInsta").value = config.instagram || "";
    if (modelo) bnModelo.marcar(modelo);
    if (!$("#bnTitulo").value || modelo) aplicarModelo();
    if (atual && (modelo || !$("#bnNome").value)) preencherDoProduto();
    $("#banners").showModal();
    document.body.classList.add("travado");
    redesenharBanner();
    await carregarMarca();
    if (atual && (modelo || !bnFoto)) await fotoDoProdutoAtual();
    redesenharBanner();
  }
  $("#abrirBanners").addEventListener("click", () => abrirPosts());
  $("#postProduto").addEventListener("click", () => abrirPosts("achadinho"));
  $("#banners").addEventListener("close", () => document.body.classList.remove("travado"));
  $("#fecharBanners").addEventListener("click", () => $("#banners").close());
  $("#bnModelo").addEventListener("click", (e) => { if (e.target.closest("button")) setTimeout(aplicarModelo, 0); });
  ["#bnFormato", "#bnFundo"].forEach((id) => $(id).addEventListener("click", () => setTimeout(redesenharBanner, 0)));
  ["#bnCupom", "#bnTitulo", "#bnTexto", "#bnBotao", "#bnNome", "#bnAntigo", "#bnNovo"].forEach((id) => $(id).addEventListener("input", redesenharBanner));
  ["#bnLogo", "#bnEspaco"].forEach((id) => $(id).addEventListener("change", redesenharBanner));
  $("#bnUsarAtual").addEventListener("click", async () => {
    if (!atual) { toast("Crie um produto na aba Criar primeiro"); return; }
    preencherDoProduto();
    if (!(await fotoDoProdutoAtual())) toast("Não consegui usar a foto — escolha da galeria");
    redesenharBanner();
  });
  $("#bnArquivo").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { bnFoto = await createImageBitmap(f); } catch (err) { toast("Não consegui abrir essa foto"); }
    e.target.value = "";
    redesenharBanner();
  });
  let instaTimer;
  $("#bnInsta").addEventListener("input", () => {
    redesenharBanner();
    clearTimeout(instaTimer);
    instaTimer = setTimeout(() => { config.instagram = arroba($("#bnInsta").value); gravarConfig(); }, 800);
  });
  const nomeBanner = (modelo, formato) => `miga-promo-${MODELOS[modelo].nome}-${formato}.jpg`;
  /** Imagem final (sem as guias da prévia) */
  function telaFinal(modelo, formato, fundo) {
    const tela = document.createElement("canvas");
    desenharBanner(tela, modelo || bnModelo.valor(), formato || bnFormato.valor(), fundo || bnFundo.valor(), dadosBanner(false));
    return tela;
  }
  $("#baixarBanner").addEventListener("click", () => {
    telaFinal().toBlob((b) => { if (b) { baixarBlob(b, nomeBanner(bnModelo.valor(), bnFormato.valor())); toast("Imagem salva"); } }, "image/jpeg", 0.92);
  });
  $("#compartilharBanner").addEventListener("click", async () => {
    const link = $("#bnLink").value.trim();
    const M = MODELOS[bnModelo.valor()];
    if (M.produto && urlOk(link)) {
      const ok = await copiarTexto(link);
      if (ok) toast("Link copiado: no Instagram, toque no adesivo de Link e cole");
    }
    compartilharTela(telaFinal(), nomeBanner(bnModelo.valor(), bnFormato.valor()));
  });
  $("#baixarBoasVindas").addEventListener("click", async () => {
    await carregarMarca();
    const tela = document.createElement("canvas");
    const ordem = [...BOAS_VINDAS].reverse(); // no Instagram o último postado aparece primeiro
    for (let i = 0; i < ordem.length; i++) {
      const M = MODELOS[ordem[i]];
      const d = { ...dadosBanner(false), titulo: linhasTitulo(M.padrao.titulo), texto: M.padrao.texto, botao: M.padrao.botao, logo: !!M.logo, espaco: false };
      desenharBanner(tela, ordem[i], "post", "auto", d);
      const blob = await new Promise((ok) => tela.toBlob(ok, "image/jpeg", 0.92));
      if (blob) baixarBlob(blob, `miga-promo-${i + 1}-${M.nome}.jpg`);
      await new Promise((ok) => setTimeout(ok, 500));
    }
    toast("5 imagens salvas — poste na ordem 1, 2, 3, 4, 5");
  });

  /* =========================== Enviar =========================== */
  function abrirWhatsApp(texto) { window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(texto), "_blank", "noopener"); }
  function registrarEnvio(onde) {
    if (!atual) return;
    if (!atual.enviadoPara.includes(onde)) atual.enviadoPara.push(onde);
    atual.ultimoEnvio = Date.now();
    salvarAtual();
  }
  $("#enviarFoto").addEventListener("click", async () => {
    if (!atual) return;
    const texto = atual.texto;
    const arq = await arquivoDaImagem(atual.card || atual.imagem);
    if (arq && navigator.canShare && navigator.canShare({ files: [arq], text: texto })) {
      try { await navigator.share({ files: [arq], text: texto }); registrarEnvio("WhatsApp (com foto)"); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    if (navigator.share) {
      try { await navigator.share({ text: texto }); registrarEnvio("WhatsApp"); toast("Este aparelho não envia foto junto — mandei só o texto"); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    abrirWhatsApp(texto);
    registrarEnvio("WhatsApp");
  });
  $("#whats").addEventListener("click", async () => {
    if (!atual) return;
    if (navigator.share) {
      try { await navigator.share({ text: atual.texto }); registrarEnvio("WhatsApp"); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    abrirWhatsApp(atual.texto);
    registrarEnvio("WhatsApp");
  });
  $("#copiar").addEventListener("click", async () => {
    if (!atual) return;
    toast((await copiarTexto(atual.texto)) ? "Texto copiado" : "Não consegui copiar — use Editar texto");
  });

  /* =========================== Grupos =========================== */
  let config = { grupos: [], convite: "", cupons: [] };
  async function gravarConfig() {
    atualizarContadores();
    try { await dados.gravarConfig(config); } catch (e) { toast("Não consegui salvar os grupos"); }
  }
  const linkGrupoOk = (u) => /^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(String(u || "").trim());

  $("#formGrupo").addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = $("#grupoNome").value.trim();
    const link = $("#grupoLink").value.trim();
    if (!nome) { toast("Dá um nome para o grupo"); $("#grupoNome").focus(); return; }
    if (link && !linkGrupoOk(link)) { toast("O link precisa começar com https://chat.whatsapp.com/"); $("#grupoLink").focus(); return; }
    config.grupos = [...config.grupos, { id: novoId(), nome, link }];
    gravarConfig();
    $("#formGrupo").reset();
    renderGrupos();
    toast("Grupo adicionado");
  });
  function linhaGrupo(g, acao) {
    return `<div class="grupo" data-id="${esc(g.id)}">
      <span class="grupo__ico"><svg><use href="#i-grupo"/></svg></span>
      <div><strong>${esc(g.nome)}</strong><small>${g.link ? esc(g.link.replace(/^https:\/\//, "")) : "sem link de convite"}</small></div>
      ${acao}
    </div>`;
  }
  function renderGrupos() {
    const l = config.grupos;
    $("#listaGrupos").innerHTML = l.length
      ? l.map((g) => linhaGrupo(g, `<button type="button" class="icone-btn" data-apagar="${esc(g.id)}" aria-label="Apagar ${esc(g.nome)}"><svg><use href="#i-lixo"/></svg></button>`)).join("")
      : '<p class="vazio-lista">Nenhum grupo ainda. Adicione o primeiro acima.</p>';
    // Escolha do convite em pílulas (no visual do app, sem a lista do sistema)
    const escolhido = l.some((g) => g.id === config.convite && g.link) ? config.convite : "";
    const opcoes = [{ id: "", nome: "Não incluir" }].concat(l.filter((g) => g.link));
    $("#grupoConvite").innerHTML = opcoes.map((g) =>
      `<button type="button" role="radio" data-id="${esc(g.id)}" aria-checked="${g.id === escolhido}">${esc(g.nome)}</button>`).join("");
  }
  $("#listaGrupos").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-apagar]");
    if (!b) return;
    const g = config.grupos.find((x) => x.id === b.dataset.apagar);
    if (!g) return;
    const ok = await confirmar({ titulo: "Apagar grupo?", texto: `“${g.nome}” sai da sua lista. O grupo no WhatsApp continua igual.`, ok: "Apagar" });
    if (!ok) return;
    config.grupos = config.grupos.filter((x) => x.id !== g.id);
    if (config.convite === g.id) config.convite = "";
    gravarConfig();
    renderGrupos();
    toast("Grupo apagado");
  });
  $("#grupoConvite").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b || b.getAttribute("aria-checked") === "true") return;
    config.convite = b.dataset.id;
    gravarConfig();
    renderGrupos();
    toast(config.convite ? "Convite incluído no fim das mensagens" : "Convite removido das mensagens");
  });

  function renderGruposEnvio() {
    const l = config.grupos;
    const enviados = (atual && atual.enviadoPara) || [];
    $("#gruposEnvio").innerHTML = l.length
      ? l.map((g) => {
          const feito = enviados.includes(g.nome);
          return linhaGrupo(g, `<button type="button" class="grupo__acao ${feito ? "feito" : "grupo__acao--rosa"}" data-enviar="${esc(g.id)}">
            ${feito ? "Enviado" : "Enviar"}</button>`);
        }).join("")
      : '<p class="vazio-lista">Cadastre seus grupos na aba <b>Grupos</b>.</p>';
  }
  $("#gruposEnvio").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-enviar]");
    if (!b || !atual) return;
    const g = config.grupos.find((x) => x.id === b.dataset.enviar);
    if (!g) return;
    const ok = await copiarTexto(atual.texto);
    registrarEnvio(g.nome);
    renderGruposEnvio();
    if (g.link) {
      window.open(g.link, "_blank", "noopener");
      toast(ok ? `Mensagem copiada — cole no grupo ${g.nome}` : "Abra Editar texto e copie a mensagem");
    } else {
      toast(ok ? "Mensagem copiada (grupo sem link: abra o WhatsApp e cole)" : "Não consegui copiar");
    }
  });

  /* =========================== Histórico =========================== */
  async function renderHistorico() {
    let itens = [];
    try { itens = await dados.listar(); }
    catch (e) { $("#historico").innerHTML = '<p class="vazio-lista">Não consegui carregar o histórico. Confira a internet.</p>'; return; }
    const termo = $("#buscaHistorico").value.trim().toLowerCase();
    if (termo) itens = itens.filter((i) => (i.produto.nome || "").toLowerCase().includes(termo));
    $("#apagarTudo").hidden = !itens.length && !termo;
    if (!itens.length) {
      $("#historico").innerHTML = `<p class="vazio-lista">${termo ? "Nada encontrado." : "Tudo que você gerar aparece aqui."}</p>`;
      return;
    }
    $("#historico").innerHTML = itens.map((i) => {
      const p = i.produto;
      const fotoMini = i.card || i.imagem;
      const mini = fotoMini
        ? `<img src="${esc(fotoMini)}" data-original="${esc(fotoMini)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : '<span class="sem-foto"><svg><use href="#i-foto"/></svg></span>';
      const enviado = i.enviadoPara && i.enviadoPara.length
        ? `<span class="etiqueta etiqueta--ok">Enviado: ${esc(i.enviadoPara.join(", "))}</span>`
        : '<span class="etiqueta">Não enviado</span>';
      const site = urlOk(p.link) ? esc(p.link) : "";
      const abreSite = (html) => site ? `<a class="item__link" href="${site}" target="_blank" rel="noopener" title="Abrir no site">${html}</a>` : html;
      return `<div class="item" data-id="${esc(i.id)}">
        ${abreSite(mini)}
        <div>
          ${abreSite(`<strong>${esc(p.nome)}</strong>`)}
          <div class="item__meta"><span class="preco">${brl(p.precoNovo)}</span><span>${esc(NOME_LOJA[p.loja] || "")}</span><span>${esc(NOME_CAT[p.categoria] || "")}</span><span>${dataCurta(i.criadoEm)}</span></div>
          <div class="item__meta">${enviado}</div>
        </div>
        <div class="item__acoes">
          <button type="button" class="grupo__acao grupo__acao--rosa" data-abrir="${esc(i.id)}">Abrir</button>
          <button type="button" class="grupo__acao" data-copiar="${esc(i.id)}">Copiar</button>
          <button type="button" class="grupo__acao" data-apagar="${esc(i.id)}">Apagar</button>
        </div>
      </div>`;
    }).join("");
  }
  $("#buscaHistorico").addEventListener("input", renderHistorico);
  $("#historico").addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const id = b.dataset.abrir || b.dataset.copiar || b.dataset.apagar;
    let item;
    try { item = await dados.pegar(id); } catch (err) { toast("Não consegui abrir agora"); return; }
    if (!item) return;
    if (b.dataset.apagar) {
      const ok = await confirmar({ titulo: "Apagar do histórico?", texto: `“${item.produto.nome}” será apagado.`, ok: "Apagar" });
      if (!ok) return;
      await dados.apagar(id);
      if (atual && atual.id === id) { atual = null; $("#resultado").hidden = true; }
      renderHistorico(); atualizarContadores(); toast("Apagado do histórico");
    } else if (b.dataset.copiar) {
      toast((await copiarTexto(item.texto)) ? "Texto copiado" : "Não consegui copiar");
    } else {
      abrirDoHistorico(item);
    }
  });
  $("#apagarTudo").addEventListener("click", async () => {
    const ok = await confirmar({ titulo: "Apagar todo o histórico?", texto: "Todos os produtos salvos serão apagados. Isso não pode ser desfeito.", ok: "Apagar tudo" });
    if (!ok) return;
    try { await dados.limpar(); } catch (e) { toast("Não consegui apagar agora"); return; }
    atual = null; $("#resultado").hidden = true;
    renderHistorico(); atualizarContadores(); toast("Histórico apagado");
  });
  function abrirDoHistorico(item) {
    const p = item.produto;
    c.link.value = p.link; c.nome.value = p.nome;
    c.precoNovo.value = paraCampo(p.precoNovo); c.precoAntigo.value = paraCampo(p.precoAntigo);
    c.cupom.value = p.cupom || "";
    loja.marcar(p.loja); categoria.marcar(p.categoria);
    definirFoto(item.imagem || "");
    atualizarSelo();
    atual = item; atual.enviadoPara = atual.enviadoPara || []; ultimoLink = p.link;
    irPara("criar");
    mostrarResultado("");
  }

  async function atualizarContadores() {
    const g = config.grupos.length;
    $("#contGrupos").hidden = !g; $("#contGrupos").textContent = g;
    let n = 0;
    try { n = (await dados.listar()).length; } catch (e) { n = 0; }
    $("#contHistorico").hidden = !n; $("#contHistorico").textContent = n;
  }

  /* =========================== Configurações =========================== */
  const dialogo = $("#config");
  function abrirConfig() {
    $("#contaInfo").textContent = conta.nuvem
      ? (conta.uid ? `Conta deste aparelho · ${conta.uid.slice(0, 8)}` : "Não conectada")
      : "Modo local (Firebase ainda não configurado)";
    api("status").then((s) => {
      $("#status").textContent = s.ia ? "IA conectada" : "IA ainda não configurada no servidor";
      $("#status").className = "status " + (s.ia ? "ok" : "off");
    }).catch(() => { $("#status").textContent = "Servidor indisponível (modo offline)"; $("#status").className = "status off"; });
    if (!dialogo.open) dialogo.showModal();
  }
  $("#abrirConfig").addEventListener("click", abrirConfig);

  $("#sair").addEventListener("click", async () => {
    dialogo.close();
    const ok = await confirmar({
      titulo: "Sair do app?",
      texto: "Na próxima vez, o app vai pedir o código de acesso. Seu histórico e seus grupos continuam salvos.",
      ok: "Sair"
    });
    if (ok) bloquear("");
  });

  /* =========================== Instalar (PWA) =========================== */
  const instalado = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  let pedidoInstalacao = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalacao = e; $("#instalar").hidden = false; });
  $("#instalar").addEventListener("click", async () => {
    if (!pedidoInstalacao) return;
    pedidoInstalacao.prompt();
    const r = await pedidoInstalacao.userChoice.catch(() => ({}));
    if (r.outcome === "accepted") toast("Miga Promo instalado");
    pedidoInstalacao = null; $("#instalar").hidden = true;
  });
  window.addEventListener("appinstalled", () => { $("#instalar").hidden = true; });
  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ehIOS && !instalado && !ls.ler(CH.dica)) $("#dicaIos").hidden = false;
  $("#fecharDica").addEventListener("click", () => { $("#dicaIos").hidden = true; ls.gravar(CH.dica, "1"); });
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  /* =========================== Início =========================== */
  const q = new URLSearchParams(location.search);
  const recebido = [q.get("url"), q.get("text"), q.get("title")].filter(Boolean).join(" ").match(/https?:\/\/\S+/);
  if (recebido) {
    c.link.value = recebido[0];
    c.link.dispatchEvent(new Event("input"));
    history.replaceState(null, "", location.pathname);
    buscar();
  }
  iniciarConta();
})();
