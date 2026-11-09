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
  const NOME_LOJA = { mercadolivre: "Mercado Livre", shopee: "Shopee" };
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
          const k = Math.min(1, 900 / Math.max(im.width, im.height));
          const tela = document.createElement("canvas");
          tela.width = Math.round(im.width * k); tela.height = Math.round(im.height * k);
          const ctx = tela.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, tela.width, tela.height);
          ctx.drawImage(im, 0, 0, tela.width, tela.height);
          ok(tela.toDataURL("image/jpeg", 0.8));
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
      lerConfig: async () => ({ grupos: ls.lerJson(CH.grupos, []), convite: ls.ler(CH.convite) }),
      gravarConfig: async (c) => { ls.gravar(CH.grupos, JSON.stringify(c.grupos)); ls.gravar(CH.convite, c.convite || ""); }
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
        return { grupos: x.grupos || [], convite: x.convite || "" };
      },
      gravarConfig: (c) => fs.setDoc(docConfig(), { grupos: c.grupos, convite: c.convite || "", atualizadoEm: Date.now() })
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
  /** "ok" | "errado" | "sem-codigo" | "sem-servidor" (prévia) | "rede" */
  async function conferirCodigo(codigo) {
    try {
      const r = await fetch("api/entrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo }) });
      if (r.status === 404 || r.status === 405) return "sem-servidor";
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) return "ok";
      return d.codigo === "sem-codigo" ? "sem-codigo" : "errado";
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
    try { config = await dados.lerConfig(); } catch (e) { config = { grupos: [], convite: "" }; toast("Não consegui carregar seus grupos"); }
    atualizarContadores();
    renderGruposEnvio();
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
  $("#balaoImg").addEventListener("click", () => abrirVisor(atual && atual.imagem));
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
  c.link.addEventListener("paste", () => setTimeout(() => { if (urlOk(c.link.value)) buscar(); }, 60));
  $("#colar").addEventListener("click", async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      const m = t.match(/https?:\/\/\S+/);
      c.link.value = m ? m[0] : t;
      c.link.dispatchEvent(new Event("input"));
      if (m) buscar();
    } catch (e) { c.link.focus(); toast("Toque e segure no campo para colar"); }
  });

  async function buscar() {
    const link = c.link.value.trim();
    if (!urlOk(link)) { toast("Cola um link começando com https://"); return; }
    const b = $("#buscar");
    b.disabled = true;
    b.querySelector(".rotulo").textContent = "Buscando…";
    aviso($("#avisoBusca"), "");
    try {
      const d = await api("produto", { url: link });
      if (d.loja) loja.marcar(d.loja);
      if (d.nome) c.nome.value = limparNome(d.nome);
      if (d.preco) c.precoNovo.value = paraCampo(d.preco);
      if (d.precoAntigo) c.precoAntigo.value = paraCampo(d.precoAntigo);
      if (d.imagem) { c.imagemUrl.value = d.imagem; definirFoto(d.imagem); }
      atualizarSelo();
      const falta = [!d.imagem && "foto", !d.nome && "nome", !d.preco && "preço"].filter(Boolean);
      aviso($("#avisoBusca"), falta.length ? `Não achei: ${falta.join(", ")}. Completa aí embaixo.` : "Achei tudo. Confere o preço antes de gerar.", !falta.length);
    } catch (e) {
      if (e.codigo === "senha") bloquear("O código de acesso mudou. Digite o novo código.");
      else aviso($("#avisoBusca"), e.codigo === "offline" ? "Busca automática indisponível aqui. Preenche os dados e use “Trocar foto”." : `Não consegui ler o produto (${e.message}). Preenche à mão.`);
    } finally {
      b.disabled = false;
      b.querySelector(".rotulo").textContent = "Buscar foto, nome e preço";
    }
  }
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
    const onde = p.loja === "shopee" ? "na Shopee" : "no Mercado Livre";
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
    img.hidden = !atual.imagem;
    colocarImagem(img, atual.imagem);
    $("#enviarFoto").hidden = !atual.imagem;
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

  async function gerar() {
    const p = coletar();
    if (!p) return;
    ocupado(true);
    let texto, avisoMsg = "";
    try {
      texto = (await api("gerar", p)).texto;
    } catch (e) {
      if (e.codigo === "senha") { ocupado(false); bloquear("O código de acesso mudou. Digite o novo código."); return; }
      const motivo = e.codigo === "sem-chave" ? "a chave da IA ainda não foi configurada" : e.codigo === "offline" ? "o servidor não está disponível aqui" : "a IA não respondeu agora";
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
      enviadoPara: mesmo ? atual.enviadoPara : []
    };
    ultimoLink = p.link;
    ocupado(false);
    mostrarResultado(avisoMsg);
    salvarAtual();
  }
  $("#gerar").addEventListener("click", gerar);
  $("#refazer").addEventListener("click", gerar);

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
    const arq = await arquivoDaImagem(atual.imagem);
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
  let config = { grupos: [], convite: "" };
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
    const sel = $("#grupoConvite");
    sel.innerHTML = '<option value="">Não incluir</option>' + l.filter((g) => g.link).map((g) => `<option value="${esc(g.id)}">${esc(g.nome)}</option>`).join("");
    sel.value = l.some((g) => g.id === config.convite && g.link) ? config.convite : "";
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
  $("#grupoConvite").addEventListener("change", () => { config.convite = $("#grupoConvite").value; gravarConfig(); toast("Convite atualizado"); });

  function renderGruposEnvio() {
    const l = config.grupos;
    const enviados = (atual && atual.enviadoPara) || [];
    $("#gruposEnvio").innerHTML = l.length
      ? l.map((g) => {
          const feito = enviados.includes(g.nome);
          return linhaGrupo(g, `<button type="button" class="grupo__acao ${feito ? "feito" : "grupo__acao--rosa"}" data-enviar="${esc(g.id)}">
            <svg><use href="#i-${feito ? "check" : "abrir"}"/></svg>${feito ? "Enviado" : "Enviar"}</button>`);
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
      const mini = i.imagem
        ? `<img src="${esc(i.imagem)}" data-original="${esc(i.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : '<span class="sem-foto"><svg><use href="#i-foto"/></svg></span>';
      const enviado = i.enviadoPara && i.enviadoPara.length
        ? `<span class="etiqueta etiqueta--ok">Enviado: ${esc(i.enviadoPara.join(", "))}</span>`
        : '<span class="etiqueta">Não enviado</span>';
      return `<div class="item" data-id="${esc(i.id)}">
        ${mini}
        <div>
          <strong>${esc(p.nome)}</strong>
          <div class="item__meta"><span class="preco">${brl(p.precoNovo)}</span><span>${esc(NOME_LOJA[p.loja] || "")}</span><span>${esc(NOME_CAT[p.categoria] || "")}</span><span>${dataCurta(i.criadoEm)}</span></div>
          <div class="item__meta">${enviado}</div>
        </div>
        <div class="item__acoes">
          <button type="button" class="grupo__acao grupo__acao--rosa" data-abrir="${esc(i.id)}"><svg><use href="#i-abrir"/></svg>Abrir</button>
          <button type="button" class="grupo__acao" data-copiar="${esc(i.id)}"><svg><use href="#i-copiar"/></svg>Copiar</button>
          <button type="button" class="icone-btn" data-apagar="${esc(i.id)}" aria-label="Apagar do histórico"><svg><use href="#i-lixo"/></svg></button>
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
