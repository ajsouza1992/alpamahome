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
  /* Títulos prontos para tocar (o que está entre *asteriscos* sai em destaque) */
  const TITULOS_PRONTOS = ["Achadinho\n*do dia* ✨", "Oferta\n*relâmpago* ⚡", "*Baixou*\no preço! *↓*", "*Últimas*\nhoras ⏰", "Chegou\n*novidade* 💖", "Achados\n*da semana* 🛍️", "Cupom\n*do dia* 🎟️", "Só\n*hoje* 🔥", "Achados de\n*beleza* 💄", "Casa\n*arrumadinha* 🏡", "Looks com\n*desconto* 👗", "Treino\n*em dia* 💪"];
  const chipsTitulos = (alvo) => `<div class="wz-chips titulos-prontos" data-alvo="${alvo}">${TITULOS_PRONTOS.map((t, i) => `<button type="button" data-titulo-pronto="${i}">${esc(t.replace(/\*/g, "").replace(/\n/g, " "))}</button>`).join("")}</div>`;
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-titulo-pronto]");
    if (!b) return;
    const alvo = document.getElementById(b.closest("[data-alvo]").dataset.alvo);
    if (!alvo) return;
    alvo.value = TITULOS_PRONTOS[+b.dataset.tituloPronto];
    alvo.dispatchEvent(new Event("input", { bubbles: true }));
    b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  });
  /** Converte a foto (webp, png…) para JPEG ou PNG, que o WhatsApp e a área de transferência aceitam */
  async function converterImagem(arq, tipo = "image/jpeg") {
    if (!arq) return null;
    try {
      const bmp = await createImageBitmap(arq);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext("2d");
      if (tipo === "image/jpeg") { x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(bmp, 0, 0);
      return await new Promise((ok) => c.toBlob((b) => ok(b ? new File([b], "achadinho." + (tipo === "image/png" ? "png" : "jpg"), { type: tipo }) : arq), tipo, 0.92));
    } catch (e) { return arq; }
  }
  const noComputador = () => matchMedia("(pointer: fine)").matches && !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
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
      gravarConfig: async (c) => { ls.gravar(CH.grupos, JSON.stringify(c.grupos)); ls.gravar(CH.convite, c.convite || ""); ls.gravar("miga_cupons", JSON.stringify(c.cupons || [])); ls.gravar("miga_instagram", c.instagram || ""); },
      lerFila: async () => ls.lerJson("miga_fila", []),
      gravarFila: async (l) => { ls.gravar("miga_fila", JSON.stringify(l)); }
    };
  })();

  // ---- modo nuvem (Firestore) ----
  function criarNuvem() {
    const { fs, db } = conta.fb;
    const col = () => fs.collection(db, "usuarios", conta.uid, "historico");
    const docConfig = () => fs.doc(db, "usuarios", conta.uid, "config", "app");
    const colLista = () => fs.collection(db, "usuarios", conta.uid, "lista");
    const salvos = new Map(); // o que já está salvo na nuvem (para gravar só o que mudou)
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
        return { grupos: x.grupos || [], convite: x.convite || "", cupons: x.cupons || [], instagram: x.instagram || "", filaAntiga: x.fila || [] };
      },
      gravarConfig: (c) => fs.setDoc(docConfig(), { grupos: c.grupos, convite: c.convite || "", cupons: c.cupons || [], instagram: c.instagram || "", atualizadoEm: Date.now() }, { merge: true }),
      // Lista: um documento por produto em usuarios/{uid}/lista/{id} (as fotos não estouram o limite de 1 MB)
      lerFila: async () => {
        const snap = await fs.getDocs(colLista());
        const l = snap.docs.map((d) => d.data()).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
        l.forEach((i) => { salvos.set(i.id, JSON.stringify(i)); });
        return l;
      },
      gravarFila: async (l) => {
        const ids = new Set(l.map((i) => i.id)), tarefas = [];
        for (const i of l) {
          const limpo = JSON.parse(JSON.stringify(i)); const txt = JSON.stringify(limpo);
          if (salvos.get(i.id) !== txt) { tarefas.push(fs.setDoc(fs.doc(colLista(), i.id), limpo).then(() => salvos.set(i.id, txt))); }
        }
        for (const id of [...salvos.keys()]) if (!ids.has(id)) tarefas.push(fs.deleteDoc(fs.doc(colLista(), id)).then(() => salvos.delete(id)));
        await Promise.all(tarefas);
      }
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
      const u = await usuarioAtual();
      // Só contas Google (as autorizadas nas regras do Firestore) entram
      if (!u || u.isAnonymous) { pedirGoogle(); return; }
      conta.uid = u.uid;
      dados = criarNuvem();
    }
    mostrarEntrada(false);
    await carregarDados();
  }
  function pedirGoogle(msg) {
    mostrarEntrada(true);
    $("#formEntrar").hidden = true; $("#notaEntrada").hidden = true; $("#passoGoogle").hidden = false;
    aviso($("#avisoEntrada"), msg || "");
  }
  $("#entrarGoogleEntrada").addEventListener("click", async () => {
    const { auth, a } = conta.fb, prov = new auth.GoogleAuthProvider();
    prov.setCustomParameters({ prompt: "select_account" });
    // A lista que estava na conta anônima deste aparelho (versões anteriores) vem junto
    let listaAnonima = [];
    try {
      if (a.currentUser && a.currentUser.isAnonymous) { conta.uid = a.currentUser.uid; listaAnonima = await criarNuvem().lerFila(); }
    } catch (e) { listaAnonima = []; }
    try {
      if (a.currentUser && a.currentUser.isAnonymous) {
        try { await auth.linkWithPopup(a.currentUser, prov); }
        catch (e) {
          if (e.code !== "auth/credential-already-in-use" && e.code !== "auth/email-already-in-use") throw e;
          await auth.signInWithCredential(a, auth.GoogleAuthProvider.credentialFromError(e));
        }
      } else await auth.signInWithPopup(a, prov);
    } catch (e) {
      aviso($("#avisoEntrada"), e.code === "auth/operation-not-allowed" ? "Ative o login com Google no Firebase (Authentication → Método de login → Google)."
        : e.code === "auth/unauthorized-domain" ? "Autorize este endereço no Firebase (Authentication → Configurações → Domínios autorizados)."
        : e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request" ? "Login cancelado." : "Não consegui entrar: " + (e.code || e.message));
      return;
    }
    conta.uid = a.currentUser.uid; dados = criarNuvem();
    // Confere se essa conta tem permissão (regras do Firestore)
    try { await dados.lerConfig(); }
    catch (e) {
      const email = (a.currentUser && a.currentUser.email) || "escolhida";
      await auth.signOut(a);
      pedirGoogle(e.code === "permission-denied" ? `A conta ${email} não tem acesso ao Miga. Entre com uma conta autorizada.` : "Não consegui abrir os seus dados: " + (e.code || e.message));
      return;
    }
    $("#formEntrar").hidden = false; $("#notaEntrada").hidden = false; $("#passoGoogle").hidden = true; aviso($("#avisoEntrada"), "");
    mostrarEntrada(false);
    await carregarDados(listaAnonima);
  });
  async function carregarDados(listaDoAparelho) {
    try { config = await dados.lerConfig(); } catch (e) { config = { grupos: [], convite: "", cupons: [] }; toast("Não consegui carregar seus grupos"); }
    config.cupons = config.cupons || [];
    try {
      config.fila = await dados.lerFila();
      // Lista antiga (guardada junto das configurações): passa para a coleção nova
      if (!config.fila.length && config.filaAntiga && config.filaAntiga.length) { config.fila = config.filaAntiga; await dados.gravarFila(config.fila); }
    } catch (e) { config.fila = config.fila || []; toast("Não consegui carregar a lista: " + (e.code || e.message)); }
    delete config.filaAntiga;
    // Ao ligar a conta Google: junta a lista que estava neste aparelho
    if (listaDoAparelho && listaDoAparelho.length) {
      const links = new Set(config.fila.map((i) => i.link));
      const novos = listaDoAparelho.filter((i) => !links.has(i.link));
      if (novos.length) { config.fila = [...novos, ...config.fila]; try { await dados.gravarFila(config.fila); } catch (e) { /* segue */ } }
    }
    atualizarContadores();
    renderGruposEnvio();
    renderCupons();
    contarFila();
    iniciarCriar();
    // Link compartilhado de outro app (Shopee, Mercado Livre...): vai para a Lista
    if (recebidoPendente) { const t = recebidoPendente; recebidoPendente = ""; irPara("postar"); adicionarNaFila(t); }
  }
  let recebidoPendente = "";
  /** Liga a conta deste aparelho a uma conta Google: abre a mesma conta no celular e no computador */
  async function entrarComGoogle() {
    if (!conta.nuvem || !conta.fb) { toast("A nuvem (Firebase) não está configurada"); return; }
    const { auth, a } = conta.fb, prov = new auth.GoogleAuthProvider();
    prov.setCustomParameters({ prompt: "select_account" });
    const listaAqui = fila().filter((i) => !i.carregando).map(({ carregando, ...i }) => i);
    try {
      if (a.currentUser && a.currentUser.isAnonymous) await auth.linkWithPopup(a.currentUser, prov);
      else await auth.signInWithPopup(a, prov);
    } catch (e) {
      if (e.code === "auth/credential-already-in-use" || e.code === "auth/email-already-in-use") {
        const cred = auth.GoogleAuthProvider.credentialFromError(e);
        if (!cred) { toast("Não consegui entrar com o Google. Tente de novo."); return; }
        await auth.signInWithCredential(a, cred);
      } else {
        toast(e.code === "auth/operation-not-allowed" ? "Ative o login com Google no Firebase (Authentication → Método de login → Google)"
          : e.code === "auth/unauthorized-domain" ? "Autorize o domínio alpama.app no Firebase (Authentication → Configurações)"
          : e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request" ? "Login cancelado"
          : "Não consegui entrar com o Google: " + (e.code || e.message));
        return;
      }
    }
    conta.uid = a.currentUser.uid; dados = criarNuvem();
    await carregarDados(listaAqui);
    if (!$("#aba-postar").hidden) renderFila();
    mostrarConta();
    toast("Pronto! Entre com esse mesmo Google nos outros aparelhos");
  }
  function mostrarConta() {
    const u = conta.fb && conta.fb.a.currentUser;
    $("#contaInfo").textContent = !conta.nuvem ? "Modo local (Firebase ainda não configurado)"
      : !u ? "Não conectada" : u.isAnonymous ? `Só neste aparelho · ${u.uid.slice(0, 8)}` : `Google · ${u.email || u.uid.slice(0, 8)}`;
    $("#entrarGoogle").hidden = !conta.nuvem || !!(u && !u.isAnonymous);
    $("#notaGoogle").hidden = $("#entrarGoogle").hidden;
  }
  $("#entrarGoogle").addEventListener("click", entrarComGoogle);
  function erroFirebase(e) {
    const c = (e && e.code) || "";
    return c.includes("operation-not-allowed") ? "O login anônimo não está ativado no Firebase (Authentication → Método de login → Anônimo)." :
      c.includes("unauthorized-domain") ? "Este endereço não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados)." :
      c.includes("network") ? "Sem internet. Tente de novo." : "Não consegui conectar à sua conta agora. Tente de novo.";
  }
  function bloquear(msg) {
    $("#formEntrar").hidden = false; $("#notaEntrada").hidden = false; $("#passoGoogle").hidden = true;
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
    $("#barraGerar").hidden = true;
    if (aba === "historico") renderHistorico();
    if (aba === "grupos") renderGrupos();
    if (aba === "achados" && !catalogoCarregado) carregarCatalogo();
    if (aba === "postar" && !ppAtual) renderFila();
    if (aba === "criar" && !wz.passo) iniciarCriar();
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
  /* Modelos de texto prontos (sem IA): escolhe um e edita à mão se quiser */
  const MODELOS_TEXTO = {
    amiga: { nome: "Dica de amiga", f: (p) => mensagemReserva(p) },
    curta: { nome: "Curta", f: (p, x) => `✨ *${p.nome}*\n💸 ${x.preco}${x.cupom}\n👉 ${p.link}` },
    preco: { nome: "Preço em destaque", f: (p, x) => `🔥 BAIXOU O PREÇO! 🔥\n\n*${p.nome}*\n\n${p.precoAntigo ? `De ~${brl(p.precoAntigo)}~\nPor *${brl(p.precoNovo)}*${x.off ? ` (${x.off}% OFF)` : ""} 😱` : `Só *${brl(p.precoNovo)}* 😱`}${x.cupom}\n\n👉 ${p.link}` },
    animada: { nome: "Animada", f: (p, x) => `Gente, CORRE!!! 😍🏃‍♀️💨\n\nAchei *${p.nome}* ${x.onde} e tô apaixonada! 💖\n\n💸 ${x.preco}${x.cupom}\n\n${x.frase}\n\n👉 ${p.link}\n\nNão vai ficar desse preço por muito tempo, hein! ⏳✨` },
    urgencia: { nome: "Últimas horas", f: (p, x) => `⏰ *ÚLTIMAS HORAS* ⏰\n\n*${p.nome}*\n💸 ${x.preco}${x.cupom}\n\nEsse preço pode acabar a qualquer momento!\n\n👉 ${p.link}` },
    elegante: { nome: "Elegante", f: (p, x) => `Seleção da Miga 🌸\n\n*${p.nome}*\n${x.preco}${x.cupom}\n\n${x.frase}\n\nConfira aqui: ${p.link}` },
    pergunta: { nome: "Você usaria?", f: (p, x) => `Você usaria? 👀\n\n*${p.nome}* ${x.onde}\n💸 ${x.preco}${x.cupom}\n\n${x.frase}\n\nMe conta aqui! 👇\n👉 ${p.link}` }
  };
  function textoDoModelo(estilo, p) {
    const x = {
      onde: ONDE_LOJA[p.loja] || "no Mercado Livre",
      preco: p.precoAntigo ? `~de ${brl(p.precoAntigo)}~ por *${brl(p.precoNovo)}*` : `por apenas *${brl(p.precoNovo)}*`,
      cupom: p.cupom ? `\n🎟️ Usa o cupom *${p.cupom}*` : "",
      off: p.precoAntigo && p.precoAntigo > p.precoNovo ? Math.round((1 - p.precoNovo / p.precoAntigo) * 100) : 0,
      frase: FRASES[p.categoria] || FRASES.outros
    };
    return comConvite((MODELOS_TEXTO[estilo] || MODELOS_TEXTO.amiga).f(p, x));
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
  // Aba de categoria escolhida sempre visível (desliza até ela)
  $("#catFiltro").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) b.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
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
    preto: { fundo: "#1d1d1f", tituloFundo: "#ffd23f", tituloTexto: "#1d1d1f", nome: "#ffffff", preco: "#ffd23f", antigo: "rgba(255,255,255,.7)", rodape: "#ffffff", cartao: "#ffffff" },
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
      edMarca = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = "logo.png?v=59"; });
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
    creme: { tipo: "creme", texto: "#1d1d1f", destaque: "#e8336d", sub: "#6f6862", pill: "#e8336d", pillTexto: "#ffffff", cartao: "#ffffff", cartaoTexto: "#1d1d1f", cartaoSub: "#6f6862", preco: "#e8336d", antigo: "#8a817b", bola1: "rgba(255,210,63,.35)", bola2: "rgba(255,255,255,.75)", guia: "#d8c99a" },
    rosa: { tipo: "rosa", texto: "#ffffff", destaque: "#ffd23f", sub: "#ffe3ec", pill: "#ffd23f", pillTexto: "#1d1d1f", cartao: "#ffffff", cartaoTexto: "#1d1d1f", cartaoSub: "#6f6862", preco: "#ffd23f", antigo: "rgba(255,255,255,.8)", bola1: "rgba(255,255,255,.9)", bola2: "rgba(255,255,255,.95)", guia: "rgba(255,255,255,.7)" },
    preto: { tipo: "preto", fundoCor: "#1d1d1f", texto: "#ffffff", destaque: "#ffd23f", sub: "#d6d0c6", pill: "#ffd23f", pillTexto: "#1d1d1f", cartao: "#ffffff", cartaoTexto: "#1d1d1f", cartaoSub: "#6f6862", preco: "#ffd23f", antigo: "rgba(255,255,255,.7)", bola1: "rgba(232,51,109,.85)", bola2: "#e9e4d8", guia: "rgba(255,255,255,.6)" },
    branco: { tipo: "branco", texto: "#1d1d1f", destaque: "#e8336d", sub: "#6f6862", pill: "#e8336d", pillTexto: "#ffffff", cartao: "#fff8e4", cartaoTexto: "#1d1d1f", cartaoSub: "#6f6862", preco: "#e8336d", antigo: "#8a817b", bola1: "rgba(255,210,63,.3)", bola2: "#efeae0", guia: "#d8c99a" }
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
      padrao: { titulo: "*Baixou*\no preço! *↓*", texto: "", botao: "" },
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
      padrao: { titulo: "Bem-vinda,\n*miga!* 💖", texto: "Achadinhos com desconto e cupons, todos os dias.", botao: "Ative as notificações" },
      blocos: (d) => [["titulo", d.titulo], ...comTexto(d, 26), ...comBotao(d)] },
    comofunciona: { nome: "como-funciona", fundo: "creme", logo: false, rodape: "Links de afiliada · sem custo extra",
      padrao: { titulo: "Como *funciona?*", texto: "", botao: "" },
      blocos: (d) => [["titulo", d.titulo], ["gap", 46], ["passos", [["As ofertas chegam aqui", "Shopee, Mercado Livre e Amazon"], ["Você toca no link", "no post, no story ou na bio"], ["Compra pelo mesmo preço", "e ainda ajuda a miga aqui 💕"]]], ...comTexto(d, 30), ...comBotao(d)] },
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
  /** Seta para baixo grossa (desenhada, para não depender da fonte) */
  function setaBaixo(ctx, x, yMeio, h, cor) {
    const w = h * 0.78, haste = w * 0.34, cab = h * 0.5, top = yMeio - h / 2;
    ctx.save(); ctx.fillStyle = cor; ctx.beginPath();
    ctx.moveTo(x + (w - haste) / 2, top); ctx.lineTo(x + (w + haste) / 2, top);
    ctx.lineTo(x + (w + haste) / 2, top + h - cab); ctx.lineTo(x + w, top + h - cab);
    ctx.lineTo(x + w / 2, top + h); ctx.lineTo(x, top + h - cab); ctx.lineTo(x + (w - haste) / 2, top + h - cab);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
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
    } else ctx.fillStyle = C.fundoCor || (C.tipo === "rosa" ? "#e8336d" : "#ffffff");
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.bola1; ctx.beginPath(); ctx.arc(40, 40, 190, 0, Math.PI * 2); ctx.fill();
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
      if (tipo === "link") return 84 * escala;
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
          const larg = partes.reduce((s, [t]) => s + (t === "↓" ? FT * 0.9 : ctx.measureText(t).width), 0);
          let x = (W - Math.min(larg, W - 80)) / 2;
          ctx.textAlign = "left";
          partes.forEach(([t, dest]) => {
            ctx.fillStyle = dest ? C.destaque : C.texto;
            const yb = y + FT * 1.08 * j + FT * 0.56;
            if (t === "↓") { setaBaixo(ctx, x + FT * 0.1, yb, FT * 0.7, ctx.fillStyle); x += FT * 0.9; return; }
            ctx.fillText(t, x, yb); x += ctx.measureText(t).width;
          });
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
        const foto = d.foto !== undefined ? d.foto : bnFoto;
        if (foto) {
          ctx.save(); retArredondado(ctx, fx, y, s, s, 48 * escala); ctx.clip();
          const pad = 26 * escala, k = Math.min((s - pad * 2) / foto.width, (s - pad * 2) / foto.height);
          const iw = foto.width * k, ih = foto.height * k;
          ctx.drawImage(foto, fx + (s - iw) / 2, y + (s - ih) / 2, iw, ih); ctx.restore();
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
      if (tipo === "link" && d.previa && false) {
        // Só na prévia: onde colocar o adesivo de link (ou de enquete) do Instagram
        const lw = 320 * escala;
        retArredondado(ctx, (W - lw) / 2, y, lw, h, h / 2);
        ctx.setLineDash([16, 12]); ctx.lineWidth = 4; ctx.strokeStyle = C.guia; ctx.stroke(); ctx.setLineDash([]);
        ctx.font = `600 ${Math.round(24 * escala)}px Poppins`; ctx.fillStyle = C.guia;
        ctx.fillText(M.rotuloLink === "enquete" ? "enquete aqui" : "link aqui", W / 2, y + h / 2 + 2);
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
  document.querySelectorAll(".titulos-prontos[data-alvo]:empty").forEach((d) => { d.outerHTML = chipsTitulos(d.dataset.alvo); });
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
    if (!edMarca) edMarca = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = "logo.png?v=59"; });
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
    $("#modeloNome").textContent = $(`#bnModelo [data-v="${bnModelo.valor()}"]`).textContent;
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
  $("#abrirModelo").addEventListener("click", () => $("#escolherModelo").showModal());
  $("#bnModelo").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $("#modeloNome").textContent = b.textContent;
    $("#escolherModelo").close();
    setTimeout(aplicarModelo, 0);
  });
  ["#bnFormato", "#bnFundo"].forEach((id) => $(id).addEventListener("click", () => setTimeout(redesenharBanner, 0)));
  ["#bnCupom", "#bnTitulo", "#bnTexto", "#bnBotao", "#bnNome", "#bnAntigo", "#bnNovo"].forEach((id) => $(id).addEventListener("input", redesenharBanner));
  ["#bnLogo", "#bnEspaco"].forEach((id) => $(id).addEventListener("change", redesenharBanner));
  $("#telaBanner").addEventListener("click", () => { if (MODELOS[bnModelo.valor()].produto) $("#bnArquivo").click(); });
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
    if (bnFormato.valor() === "story") {
      if (M.produto && urlOk(link) && await copiarTexto(link)) toast("Link copiado: no story, toque no adesivo de Link e cole");
    } else {
      // Post do feed: link não é clicável na legenda, então vai a legenda pronta com "link na bio"
      const base = atual && atual.texto ? atual.texto : [$("#bnNome").value.trim(), $("#bnTexto").value.trim()].filter(Boolean).join("\n\n");
      const legenda = (urlOk(link) ? base.split(link).join("🔗 link na bio") : base).replace(/[*~_]/g, "").trim(); // Instagram não usa a formatação do WhatsApp
      if (legenda && await copiarTexto(legenda)) toast("Legenda copiada: no Instagram, cole na legenda do post");
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

  /* =========================== Lista (curadoria dos produtos) =========================== */
  const ppCategoria = grupoBotoes("#ppCategoria", "v");
  let ppAtual = null;          // produto aberto na edição
  const ppFotos = {};          // fotos já abertas (por produto), para as montagens
  const fila = () => (config.fila = config.fila || []);
  let ppSalvarTimer;
  function salvarFila(logo) {
    clearTimeout(ppSalvarTimer);
    const ir = async () => {
      contarFila();
      try { await dados.gravarFila(fila().filter((i) => !i.carregando).map(({ carregando, ...i }) => i)); }
      catch (e) { toast("Não consegui salvar a lista na nuvem: " + (e.code || e.message)); }
    };
    if (logo) ir(); else ppSalvarTimer = setTimeout(ir, 600);
  }
  function contarFila() {
    const n = fila().length;
    $("#contPostar").hidden = !n; $("#contPostar").textContent = n;
  }
  const tagsFeito = (i) => {
    const f = i.feito || {};
    if (!Object.values(f).some(Boolean)) return "";
    return `<span class="selo-comp">Compartilhado</span>` + ["whatsapp", "instagram", "telegram"].filter((c) => f[c]).map((c) => `<span>${{ whatsapp: "WhatsApp", instagram: "Instagram", telegram: "Telegram" }[c]}</span>`).join("");
    return ["whatsapp", "instagram", "telegram"].filter((c) => f[c]).map((c) => `<span class="ok">${{ whatsapp: "WhatsApp", instagram: "Instagram", telegram: "Telegram" }[c]} ✓</span>`).join("");
  };
  const fotoMini = (i) => i.imagem ? `<img src="${esc(i.imagem)}" data-original="${esc(i.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="sem-foto">${i.carregando ? "buscando…" : "sem foto"}</span>`;
  /* Categorias na Lista: filtro e categoria do produto colado ("auto" adivinha pelo nome) */
  const CATS_LISTA = { moda: "Moda", beleza: "Beleza", casa: "Casa", saude: "Saúde e fitness", outros: "Outros" };
  /** Folha de escolha: um botão abre a lista de opções (sem um monte de botões na tela) */
  function escolherOpcao(titulo, opcoes, atual) {
    const d = $("#folhaEscolha");
    $("#folhaTitulo").textContent = titulo;
    $("#folhaOpcoes").innerHTML = opcoes.map(([v, n]) => `<button type="submit" value="${esc(v)}" class="${v === atual ? "on" : ""}"><span>${esc(n)}</span>${v === atual ? "<b>✓</b>" : ""}</button>`).join("");
    d.returnValue = "";
    d.showModal();
    return new Promise((ok) => d.addEventListener("close", () => ok(d.returnValue || null), { once: true }));
  }
  let catNova = "auto", filtroLista = "todas", ocultarComp = false;
  try { ocultarComp = localStorage.getItem("miga_ocultar_comp") === "1"; } catch (e) { /* segue */ }
  const foiCompartilhado = (i) => Object.values(i.feito || {}).some(Boolean);
  function adivinharCategoria(nome) {
    const n = String(nome || "").toLowerCase();
    if (/perfume|batom|base |maquiag|skincare|s[eé]rum|hidratante|shampoo|condicionador|cabelo|unha|esmalte|protetor solar|creme|rímel|rimel|sombra|pincel|beleza|facial/.test(n)) return "beleza";
    if (/vestido|blusa|cal[cç]a|saia|conjunto|short|camisa|camiseta|jaqueta|casaco|bolsa|sand[aá]lia|t[eê]nis|sapato|biqu[ií]ni|lingerie|suti[aã]|moda|look|cropped|body|jeans|rel[oó]gio|brinco|colar|anel|pulseira|[oó]culos/.test(n)) return "moda";
    if (/creatina|whey|suplement|vitamina|academia|fitness|legging|top fitness|garrafa|squeeze|halter|yoga|colágeno|colageno|treino|bicicleta/.test(n)) return "saude";
    if (/cozinha|panela|organizador|decora|almofada|cortina|tapete|lumin|lâmpada|lampada|cadeira|mesa|sof[aá]|cama|len[cç]ol|toalha|pote|airfryer|liquidificador|cafeteira|prateleira|vaso|lixeira|casa/.test(n)) return "casa";
    return "outros";
  }
  const contarCat = (k) => fila().filter((i) => k === "todas" || (i.categoria || "outros") === k).length;
  function renderCatsLista() {
    const tags = [];
    if (filtroLista !== "todas") tags.push(["cat", CATS_LISTA[filtroLista]]);
    if (ocultarComp) tags.push(["comp", "Sem compartilhados"]);
    if (catNova !== "auto") tags.push(["nova", "Colando em: " + CATS_LISTA[catNova]]);
    $("#ppTags").innerHTML = tags.map(([k, n]) => `<button type="button" data-tirar-filtro="${k}">${esc(n)} ✕</button>`).join("");
    $("#ppFiltroQtd").hidden = !tags.length; $("#ppFiltroQtd").textContent = tags.length;
    $("#ppFiltrar").classList.toggle("ativo", !!tags.length);
    const vis = fila().filter((i) => (filtroLista === "todas" || (i.categoria || "outros") === filtroLista) && !(ocultarComp && foiCompartilhado(i))).length;
    $("#ppTotal").textContent = `${vis} produto${vis === 1 ? "" : "s"}`;
  }
  const opTexto = (sel, lista, atual, attr) => { $(sel).innerHTML = lista.map(([v, n]) => `<button type="button" data-${attr}="${v}" class="${v === atual ? "on" : ""}">${esc(n)}</button>`).join(""); };
  function pintarFolhaFiltro() {
    opTexto("#ffCat", [["todas", `Todas (${contarCat("todas")})`], ...Object.entries(CATS_LISTA).map(([k, n]) => [k, `${n} (${contarCat(k)})`])], filtroLista, "ff-cat");
    opTexto("#ffComp", [["mostrar", "Todos"], ["ocultar", "Só os não compartilhados"]], ocultarComp ? "ocultar" : "mostrar", "ff-comp");
    opTexto("#ffNova", [["auto", "Automático (pelo nome)"], ...Object.entries(CATS_LISTA)], catNova, "ff-nova");
  }
  function guardarOcultar() { try { localStorage.setItem("miga_ocultar_comp", ocultarComp ? "1" : "0"); } catch (e) { /* segue */ } }
  $("#ppFiltrar").addEventListener("click", () => { pintarFolhaFiltro(); $("#folhaFiltro").showModal(); });
  $("#folhaFiltro").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.ffCat) filtroLista = b.dataset.ffCat;
    else if (b.dataset.ffComp) { ocultarComp = b.dataset.ffComp === "ocultar"; guardarOcultar(); }
    else if (b.dataset.ffNova) catNova = b.dataset.ffNova;
    else if (b.id === "ffLimpar") { filtroLista = "todas"; ocultarComp = false; catNova = "auto"; guardarOcultar(); }
    else return;
    pintarFolhaFiltro(); renderFila();
  });
  $("#ppTags").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tirar-filtro]"); if (!b) return;
    const k = b.dataset.tirarFiltro;
    if (k === "cat") filtroLista = "todas"; if (k === "comp") { ocultarComp = false; guardarOcultar(); } if (k === "nova") catNova = "auto";
    renderFila();
  });
  function renderFila() {
    renderCatsLista();
    const l = fila().filter((i) => (filtroLista === "todas" || i.carregando || (i.categoria || "outros") === filtroLista) && !(ocultarComp && foiCompartilhado(i)));
    $("#ppLista").innerHTML = l.length ? l.map((i) => `<div class="pp-linha"><button type="button" class="pp-item${i.carregando ? " carregando" : ""}" data-pp="${esc(i.id)}">
        ${fotoMini(i)}
        <span><strong>${esc(i.nome || (i.carregando ? "Buscando o produto…" : "Toque para completar o nome"))}</strong>
          <span class="meta">${i.precoNovo ? `<b>${brl(i.precoNovo)}</b> · ` : ""}${esc(NOME_LOJA[i.loja] || "")}</span>
          <span class="pp-tags">${tagsFeito(i)}</span>
        </span>
        <span class="seta">›</span>
      </button><button type="button" class="pp-lixo" data-menu-item="${esc(i.id)}" aria-label="Opções de ${esc(i.nome || "produto")}">⋯</button></div>`).join("") : `<p class="vazio-lista">${fila().length ? (ocultarComp ? "Nada para mostrar: os compartilhados estão ocultos." : "Nenhum produto nessa categoria.") : "Cole aqui os links dos produtos que você vai divulgar."}</p>`;
  }
  /** Mesma página = mesmo produto (ignora www, barra no fim e parâmetros de rastreio) */
  function chaveLink(u) {
    try { const x = new URL(String(u || "").trim()); return x.hostname.toLowerCase().replace(/^www\./, "") + x.pathname.replace(/\/+$/, "").toLowerCase(); }
    catch (e) { return String(u || "").trim().toLowerCase(); }
  }
  /** Código do produto dentro do endereço (Mercado Livre MLB…, Shopee i.loja.item, Amazon /dp/…, Magalu /p/…) */
  function idProduto(u) {
    const s = String(u || "");
    const m = s.match(/MLB-?(\d{6,})/i) || s.match(/[-.]i\.(\d+\.\d+)/) || s.match(/\/product\/(\d+\/\d+)/) || s.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i) || s.match(/\/p\/([a-z0-9]{6,})\//i);
    return m ? m[1].toUpperCase() : "";
  }
  // Mesmo produto: mesmo link colado, ou o mesmo código de produto (nunca só a página genérica da loja)
  const mesmoProduto = (i, link) => {
    if (chaveLink(i.link) === chaveLink(link)) return true;
    const alvo = idProduto(link);
    return !!alvo && [i.link, i.urlFinal].some((l) => idProduto(l) === alvo);
  };
  /** naLista: veio da aba Lista (recusa repetido e pede o que faltar) */
  async function adicionarNaFila(texto, naLista) {
    const lido = lerTextoCompartilhado(texto) || { link: String(texto || "").trim(), nome: "", preco: null };
    if (!urlOk(lido.link)) { toast("Cola um link começando com https://"); return null; }
    const ja = fila().find((i) => mesmoProduto(i, lido.link));
    if (ja) {
      if (naLista) { toast("Esse produto já está na sua lista"); $("#ppLink").value = ""; return null; }
      toast("Esse produto já estava na lista"); return ja;
    }
    const item = { id: novoId(), link: lido.link, loja: detectarLoja(lido.link) || "mercadolivre", nome: lido.nome || "", precoNovo: lido.preco || null, precoAntigo: null, imagem: "", cupom: "", categoria: "outros", texto: "", feito: {}, criadoEm: Date.now(), carregando: true };
    fila().unshift(item);
    $("#ppLink").value = "";
    renderFila();
    try {
      const d = await api("produto", { url: item.link });
      if (d.loja) item.loja = d.loja;
      if (d.nome && !item.nome) item.nome = limparNome(d.nome);
      if (d.preco) item.precoNovo = d.preco;
      if (d.precoAntigo) item.precoAntigo = d.precoAntigo;
      if (d.imagem) item.imagem = d.imagem;
      if (d.urlFinal) item.urlFinal = d.urlFinal;
      // O link encurtado levou a um produto que já está na lista
      const repetido = fila().find((i) => i !== item && mesmoProduto(i, item.urlFinal || item.link));
      if (repetido) {
        config.fila = fila().filter((i) => i !== item);
        renderFila(); toast("Esse produto já está na sua lista");
        return naLista ? null : repetido;
      }
    } catch (e) {
      if (e.codigo === "senha") { bloquear("O código de acesso mudou. Digite o novo código."); return null; }
      toast("Não consegui ler o produto: toque nele e complete à mão");
    }
    item.categoria = catNova === "auto" ? adivinharCategoria(item.nome) : catNova;
    delete item.carregando;
    renderFila(); salvarFila(true);
    // Faltou foto, nome ou preço (comum na Shopee e na Amazon): abre o produto e pede o que falta
    if (naLista && (!item.imagem || !item.precoNovo || !item.nome) && !ppAtual) abrirItemFila(item, true);
    return item;
  }
  $("#ppAdicionar").addEventListener("click", () => adicionarNaFila($("#ppLink").value, true));
  $("#ppLink").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); adicionarNaFila($("#ppLink").value, true); } });
  $("#ppLink").addEventListener("paste", (e) => {
    const t = (e.clipboardData && e.clipboardData.getData("text")) || "";
    if (/https?:\/\//.test(t)) { e.preventDefault(); adicionarNaFila(t, true); }
  });
  $("#ppColar").addEventListener("click", async () => {
    try { adicionarNaFila((await navigator.clipboard.readText()).trim(), true); }
    catch (e) { $("#ppLink").focus(); toast("Toque e segure no campo para colar"); }
  });
  $("#ppLimpar").addEventListener("click", async () => {
    const prontos = fila().filter((i) => Object.values(i.feito || {}).some(Boolean));
    if (!prontos.length) { toast("Nenhum produto compartilhado ainda"); return; }
    if (!(await confirmar({ titulo: "Tirar os já compartilhados?", texto: `${prontos.length} produto(s) já compartilhados saem da lista (continuam no Histórico).`, ok: "Tirar" }))) return;
    config.fila = fila().filter((i) => !prontos.includes(i));
    renderFila(); salvarFila(true);
  });
  $("#ppLista").addEventListener("click", async (e) => {
    const menu = e.target.closest("[data-menu-item]");
    if (menu) {
      const it = fila().find((i) => i.id === menu.dataset.menuItem);
      if (!it) return;
      const op = await escolherOpcao(it.nome || "Produto", [["editar", "Editar"], ["compartilhar", "Compartilhar"], ["excluir", "Excluir"]], "");
      if (op === "editar") abrirItemFila(it);
      if (op === "compartilhar") { iniciarCriar({ itemId: it.id }); irPara("criar"); }
      if (op === "excluir") {
        if (!(await confirmar({ titulo: "Excluir da lista?", texto: `“${it.nome || "Produto"}” sai da sua lista (continua no Histórico se já foi compartilhado).`, ok: "Excluir" }))) return;
        config.fila = fila().filter((i) => i !== it);
        renderFila(); salvarFila(true); toast("Produto excluído da lista");
      }
      return;
    }
    const b = e.target.closest("[data-pp]");
    if (!b) return;
    const item = fila().find((i) => i.id === b.dataset.pp);
    if (item && !item.carregando) abrirItemFila(item);
  });
  function mostrarFotoPp() {
    const tem = !!(ppAtual && ppAtual.imagem);
    $("#ppFotoMini").hidden = !tem; $("#ppSemFoto").hidden = tem;
    if (tem) { $("#ppFotoMini").dataset.original = ppAtual.imagem; colocarImagem($("#ppFotoMini"), ppAtual.imagem); }
  }
  function abrirItemFila(item, pedirFalta) {
    ppAtual = item;
    $("#ppListaBloco").hidden = true; $("#ppItem").hidden = false;
    mostrarFotoPp();
    $("#ppNome").value = item.nome || "";
    $("#ppAntigo").value = item.precoAntigo ? paraCampo(item.precoAntigo) : "";
    $("#ppNovo").value = item.precoNovo ? paraCampo(item.precoNovo) : "";
    $("#ppCupom").value = item.cupom || "";
    $("#ppLinkItem").value = item.link || "";
    ppCategoria.marcar(item.categoria || "outros");
    mostrarFalta(pedirFalta);
    window.scrollTo({ top: 0 });
  }
  function mostrarFalta(destacar) {
    const it = ppAtual; if (!it) return;
    const falta = [!it.imagem && "a foto", !it.nome && "o nome", !it.precoNovo && "o preço"].filter(Boolean);
    const loja = NOME_LOJA[it.loja] || "A loja";
    aviso($("#ppFalta"), falta.length ? `${loja} não mandou ${falta.join(", ").replace(/, ([^,]*)$/, " e $1")}. Complete aqui:${!it.imagem ? " toque em “Escolher foto” (salve a imagem do produto na galeria antes)." : ""}${!it.precoNovo ? " Digite o preço novo." : ""}` : "");
    $("#ppFotoBtn").classList.toggle("pedir", !it.imagem && !!destacar);
    $("#ppNovo").classList.toggle("pedir", !it.precoNovo && !!destacar);
    $("#ppNome").classList.toggle("pedir", !it.nome && !!destacar);
    $("#ppFotoBtn").firstChild.textContent = it.imagem ? "Trocar foto" : "Escolher foto";
    if (destacar && !it.precoNovo && it.imagem) setTimeout(() => $("#ppNovo").focus(), 300);
  }
  function fecharItemFila() {
    ppAtual = null;
    $("#ppItem").hidden = true; $("#ppListaBloco").hidden = false;
    renderFila();
  }
  $("#ppVoltar").addEventListener("click", fecharItemFila);
  $("#ppRemover").addEventListener("click", async () => {
    if (!ppAtual || !(await confirmar({ titulo: "Tirar da lista?", texto: `“${ppAtual.nome || "Produto"}” sai da sua lista.`, ok: "Tirar" }))) return;
    config.fila = fila().filter((i) => i !== ppAtual);
    salvarFila(true); fecharItemFila();
  });
  [["#ppNome", (v) => { ppAtual.nome = v.trim(); ppAtual.texto = ""; }], ["#ppAntigo", (v) => { ppAtual.precoAntigo = lerPreco(v); ppAtual.texto = ""; }], ["#ppNovo", (v) => { ppAtual.precoNovo = lerPreco(v); ppAtual.texto = ""; }],
    ["#ppCupom", (v) => { ppAtual.cupom = v.trim(); ppAtual.texto = ""; }], ["#ppLinkItem", (v) => { if (urlOk(v)) { ppAtual.link = v.trim(); ppAtual.texto = ""; } }]]
    .forEach(([id, f]) => $(id).addEventListener("input", () => { if (!ppAtual) return; f($(id).value); salvarFila(); mostrarFalta(false); }));
  $("#ppCategoria").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && ppAtual) { ppAtual.categoria = b.dataset.v; ppAtual.texto = ""; salvarFila(); } });
  async function trocarFotoPp(arquivo) {
    if (!arquivo || !ppAtual) return;
    try { ppAtual.imagem = await compactarArquivo(arquivo); ppFotos[ppAtual.id] = await createImageBitmap(arquivo); }
    catch (e) { toast("Não consegui abrir essa foto"); return; }
    mostrarFotoPp(); salvarFila(true); mostrarFalta(false); toast("Foto salva");
  }
  $("#ppArquivoTopo").addEventListener("change", (e) => { trocarFotoPp(e.target.files && e.target.files[0]); e.target.value = ""; });
  $("#ppSalvar").addEventListener("click", async () => {
    if (!ppAtual) return;
    const it = ppAtual;
    it.nome = $("#ppNome").value.trim();
    it.precoNovo = lerPreco($("#ppNovo").value);
    it.precoAntigo = lerPreco($("#ppAntigo").value) || null;
    it.cupom = $("#ppCupom").value.trim();
    if (urlOk($("#ppLinkItem").value)) it.link = $("#ppLinkItem").value.trim();
    it.categoria = ppCategoria.valor();
    it.texto = ""; // a mensagem é refeita com os dados novos
    if (!it.nome) { toast("Escreva o nome do produto"); $("#ppNome").focus(); return; }
    clearTimeout(ppSalvarTimer);
    try { await dados.gravarFila(fila().filter((i) => !i.carregando).map(({ carregando, ...i }) => i)); toast("Produto salvo"); }
    catch (e) { toast("Não consegui salvar na nuvem: " + (e.code || e.message)); return; }
    contarFila(); fecharItemFila();
  });
  $("#ppCompartilhar").addEventListener("click", () => {
    if (!ppAtual) return;
    if (!ppAtual.nome) { toast("Escreva o nome do produto"); $("#ppNome").focus(); return; }
    const id = ppAtual.id;
    fecharItemFila();
    iniciarCriar({ itemId: id });
    irPara("criar");
  });

  /* =========================== Criar (passo a passo, uma pergunta por tela) =========================== */
  const CANAIS = {
    roteiro: { nome: "Postar um produto", cor: "#e8336d", desc: "Story, Status, grupos, canal e Telegram, um depois do outro", icone: "i-lista" },
    whatsapp: { nome: "WhatsApp", cor: "#25d366", desc: "Mensagem para os grupos ou imagem para o Status", icone: "i-rede-whats" },
    instagram: { nome: "Instagram", cor: "#e8336d", desc: "Montagem para story ou post", icone: "i-rede-insta" },
    telegram: { nome: "Telegram", cor: "#229ed9", desc: "Mensagem com link clicável", icone: "i-rede-tg" },
    livre: { nome: "Criação livre", cor: "#1d1d1f", desc: "Imagem com vários produtos, do seu jeito", icone: "i-rede-grade" },
    video: { nome: "Vídeo com tema", cor: "#f2a900", desc: "Seu vídeo com a cara do Miga", icone: "i-rede-video" }
  };
  const MONTAGENS = ["achadinho", "relampago", "baixou", "ultimas", "novidade", "enquete"];
  const NOME_MONTAGEM = { achadinho: "Achadinho do dia", relampago: "Oferta relâmpago", baixou: "Baixou o preço", ultimas: "Últimas horas", novidade: "Chegou novidade", enquete: "Você usaria?" };
  const CORES_NOME = { creme: "Creme", rosa: "Rosa", branco: "Branco", preto: "Preto" };
  let wz = {};
  const wzItem = () => fila().find((i) => i.id === wz.itemId);
  function passosDe(canal) {
    if (canal === "livre") return ["canal", "grade", "itens", "tema", "livre"];
    if (canal === "video") return ["canal", "vDados", "vArquivo", "vTema", "vPronto"];
    if (canal === "roteiro") return passosRoteiro();
    const base = ["canal", ...(wz.veioDaLista ? [] : ["produto"])];
    if (canal === "instagram") return [...base, "formato", "montagem", "cor", "postar"];
    if (canal === "telegram") return [...base, "mensagem", "telegram"];
    // WhatsApp: mensagem para os grupos ou imagem para o Status
    if (wz.tipoWhats === "status") return [...base, "tipoWhats", "montagem", "cor", "postar"];
    return [...base, "tipoWhats", "mensagem", "enviar"];
  }
  const filtroCatWz = () => `<button type="button" class="chip-filtro chip-filtro--largo" data-wz-cat><small>Categoria</small><b>${(wz.filtroCat && wz.filtroCat !== "todas") ? CATS_LISTA[wz.filtroCat] : "Todas"}</b><span class="seta">▾</span></button>`;
  function iniciarCriar(op = {}) {
    wz = { passo: op.itemId ? "lugares" : "canal", canal: op.itemId ? "roteiro" : null, itemId: op.itemId || null, veioDaLista: !!op.itemId, formato: "story", modelo: "achadinho", cor: "auto", idx: 0, res: {}, lugares: lugaresSalvos() };
    mostrarPasso();
  }
  function irPasso(dir) {
    const l = passosDe(wz.canal || "whatsapp"), i = l.indexOf(wz.passo);
    let prox = l[i + dir];
    if (wz.canal === "roteiro" && dir < 0 && wz.passo === "rodar" && wz.idx > 0) { wz.idx--; delete wz.res[wz.lugares[wz.idx]]; mostrarPasso(); return; }
    if (wz.canal === "roteiro" && prox === "rodar") { wz.idx = 0; wz.res = {}; }
    if (wz.canal === "roteiro" && dir < 0 && prox === "rodar") prox = l[i + dir - 1];
    if (!prox) return;
    wz.passo = prox; mostrarPasso();
  }
  $("#wzVoltar").addEventListener("click", () => irPasso(-1));
  const opcaoCard = (attr, v, titulo, desc, on, extra = "") => `<button type="button" class="wz-op${on ? " on" : ""}" ${attr}="${esc(v)}">${extra}<span><b>${esc(titulo)}</b>${desc ? `<small>${esc(desc)}</small>` : ""}</span></button>`;
  const botaoContinuar = (ok, rot = "Continuar") => `<div class="wz-rodape"><button type="button" class="btn btn--rosa wz-continuar" id="wzContinuar"${ok ? "" : " disabled"}>${rot}</button></div>`;

  function mostrarPasso() {
    const l = passosDe(wz.canal || "whatsapp"), i = l.indexOf(wz.passo);
    $("#wzBarra").style.width = Math.round(((i + 1) / l.length) * 100) + "%";
    $("#wzPasso").textContent = (wz.canal ? CANAIS[wz.canal].nome + " · " : "") + `Passo ${i + 1} de ${l.length}`;
    $("#wzVoltar").hidden = i === 0;
    const c = $("#wzCorpo"), item = wzItem();
    window.scrollTo({ top: 0 });

    if (wz.passo === "canal") {
      c.innerHTML = `<h2 class="wz-titulo">O que você quer criar?</h2>
        ${item ? `<p class="nota">Produto: <b>${esc(item.nome)}</b></p>` : ""}
        <div class="wz-ops">${Object.entries(CANAIS).filter(([k]) => ["roteiro", "livre", "video"].includes(k)).map(([k, v]) => opcaoCard("data-canal", k, v.nome, v.desc, wz.canal === k, `<i class="wz-bolinha" style="background:${v.cor}"><svg><use href="#${v.icone}"/></svg></i>`)).join("")}</div>
        ${botaoContinuar(!!wz.canal)}`;
      return;
    }
    if (wz.canal === "livre") { telaLivre(c); return; }
    if (wz.canal === "roteiro" && item && telaRoteiro(c, item)) return;
    if (wz.canal === "video") { telaVideo(c); return; }
    if (wz.passo === "produto") {
      const l2 = fila().filter((x) => !x.carregando && (wz.filtroCat === undefined || wz.filtroCat === "todas" || (x.categoria || "outros") === wz.filtroCat));
      c.innerHTML = `<h2 class="wz-titulo">Qual produto?</h2>
        <div class="colar"><input id="wzLink" type="url" inputmode="url" placeholder="Cole um link novo" autocomplete="off"><button type="button" class="colar__btn" id="wzColar">Colar</button></div>
        <p class="nota">Ou escolha da sua lista:</p>
        ${filtroCatWz()}
        <div class="wz-ops">${l2.map((x) => `<button type="button" class="wz-prod${wz.itemId === x.id ? " on" : ""}" data-item="${esc(x.id)}">${fotoMini(x)}<span><b>${esc(x.nome || "Sem nome")}</b><small>${x.precoNovo ? brl(x.precoNovo) : "sem preço"} · ${esc(NOME_LOJA[x.loja] || "")}</small></span></button>`).join("") || '<p class="vazio-lista">Sua lista está vazia.</p>'}</div>
        ${botaoContinuar(!!item)}`;
      return;
    }
    if (!item) { wz.passo = "produto"; mostrarPasso(); return; }

    if (wz.passo === "formato") {
      c.innerHTML = `<h2 class="wz-titulo">Story ou post?</h2>
        <div class="wz-duas wz-formatos">${opcaoCard("data-formato", "story", "Story", "Tela cheia, em pé", wz.formato === "story", '<canvas data-forma="story"></canvas>')}${opcaoCard("data-formato", "post", "Post", "No feed, 4:5", wz.formato === "post", '<canvas data-forma="post"></canvas>')}</div>
        <p class="nota">No story o link fica clicável pelo adesivo de Link. No post, use “link na bio”.</p>
        ${botaoContinuar(true)}`;
      const pintar = () => document.querySelectorAll("[data-forma]").forEach((cv) => desenharMontagem(cv, false, wz.modelo, wz.cor, cv.dataset.forma));
      pintar(); prepararFoto(item).then(() => { if (wz.passo === "formato") pintar(); });
      return;
    }
    if (wz.passo === "tipoWhats") {
      c.innerHTML = `<h2 class="wz-titulo">O que você quer enviar?</h2>
        <div class="wz-ops">
          ${opcaoCard("data-tipo-whats", "mensagem", "Mensagem", "Texto pronto com o link, para os grupos e conversas", wz.tipoWhats !== "status")}
          ${opcaoCard("data-tipo-whats", "status", "Status", "Imagem pronta, no formato do Status (igual ao story)", wz.tipoWhats === "status")}
        </div>
        ${botaoContinuar(true)}`;
      return;
    }
    if (wz.passo === "montagem" || wz.passo === "cor") {
      const porCor = wz.passo === "cor";
      const lista = porCor ? ["auto", "creme", "rosa", "branco", "preto"] : MONTAGENS;
      c.innerHTML = `<h2 class="wz-titulo">${porCor ? "Escolha a cor" : "Escolha a montagem"}</h2>
        <div class="wz-miniaturas">${lista.map((v) => `<button type="button" class="wz-mini${(porCor ? wz.cor : wz.modelo) === v ? " on" : ""}" data-${porCor ? "cor" : "modelo"}="${v}"><canvas></canvas><span>${porCor ? (v === "auto" ? "Do modelo" : CORES_NOME[v]) : NOME_MONTAGEM[v]}</span></button>`).join("")}</div>
        ${botaoContinuar(true)}`;
      desenharMiniaturas(porCor);
      return;
    }
    if (wz.passo === "postar") {
      const status = wz.canal === "whatsapp";
      c.innerHTML = `<h2 class="wz-titulo">${status ? "Pronto para o Status" : "Pronto para postar"}</h2>
        <div class="wz-previa"><canvas id="wzTela"></canvas></div>
        <label class="link link--foto wz-centro">Trocar a foto<input type="file" id="wzArquivo" accept="image/*" hidden></label>
        <button type="button" class="btn btn--rosa${status ? " wz-zap" : ""}" id="wzPostar">${status ? "Postar no Status" : "Postar no Instagram"}</button>
        <button type="button" class="btn btn--branco" id="wzBaixar">Baixar imagem</button>
        <div class="link-copiar">
          <span>Link do produto${status ? "" : " (para o adesivo de Link)"}</span>
          <input id="wzLinkCopiar" readonly value="${esc(item.link)}" aria-label="Link do produto">
          <button type="button" class="btn btn--branco" id="wzCopiarLink">Copiar link</button>
        </div>
        <p class="nota wz-centro">${status ? "Vai a imagem com o texto e o link: no WhatsApp, escolha “Meu status”." : wz.formato === "story" ? "No story, toque no adesivo de Link e cole. Se o link sumir da memória, volte aqui e toque em “Copiar link”." : "A legenda já vai copiada, com “link na bio”. Use “Copiar link” para colocar o produto na bio."}</p>`;
      prepararFoto(item).then(() => desenharMontagem($("#wzTela"), true));
      desenharMontagem($("#wzTela"), true);
      return;
    }
    if (wz.passo === "mensagem") {
      if (!item.precoNovo) {
        c.innerHTML = `<h2 class="wz-titulo">Qual o preço?</h2><p class="nota">Não achei o preço de <b>${esc(item.nome || "este produto")}</b>. Digite para montar a mensagem.</p>
          <div class="duas"><label class="campo"><span>Preço antigo</span><input id="wzAntigo" inputmode="decimal" placeholder="opcional"></label><label class="campo"><span>Preço novo</span><input id="wzNovoPreco" inputmode="decimal"></label></div>
          <button type="button" class="btn btn--rosa" id="wzSalvarPreco">Montar a mensagem</button>`;
        return;
      }
      if (!item.texto) usarModeloTexto(item.estiloTexto || "amiga");
      c.innerHTML = `<h2 class="wz-titulo">Sua mensagem</h2>
        <p class="nota">Escolha o modelo. Para mudar alguma coisa, toque em “Editar o texto”.</p>
        <div class="wz-chips" id="wzModelosTexto">${Object.entries(MODELOS_TEXTO).map(([k, m]) => `<button type="button" data-estilo="${k}"${(item.estiloTexto || "amiga") === k ? ' class="on"' : ""}>${m.nome}</button>`).join("")}</div>
        <div class="balao wz-balao" id="wzBalao">${formatarWhats(textoCanal(item.texto))}</div>
        <details class="mais"${item.textoEditado ? " open" : ""}><summary>Editar o texto</summary><textarea id="wzTexto" rows="9">${esc(item.texto || "")}</textarea></details>
        ${botaoContinuar(!!item.texto)}`;
      return;
    }
    if (wz.passo === "enviar") {
      const g = config.grupos || [];
      c.innerHTML = `<h2 class="wz-titulo">Enviar no WhatsApp</h2>
        <div class="balao wz-balao">${formatarWhats(item.texto)}</div>
        <p class="nota">Com foto, o WhatsApp abre com a imagem do produto e o texto juntos.</p>
        <button type="button" class="btn btn--rosa wz-zap" data-enviar-op="foto">Enviar com foto</button>
        <button type="button" class="btn btn--branco" data-enviar-op="texto">Enviar só o texto</button>
<button type="button" class="btn btn--branco" id="wzNovo">Criar outra postagem</button>`;
      return;
    }
    if (wz.passo === "telegram") {
      c.innerHTML = `<h2 class="wz-titulo">Enviar no Telegram</h2>
        <div class="balao wz-balao wz-balao--tg">${formatarWhats(textoCanal(item.texto))}</div>
        <p class="nota">No Telegram o link fica clicável no texto.</p>
        <button type="button" class="btn btn--rosa wz-tg" id="wzTelegram">Abrir no Telegram</button>
        <button type="button" class="btn btn--branco" id="wzCopiarTg">Copiar o texto</button>
        <button type="button" class="btn btn--branco" id="wzNovo">Criar outra postagem</button>`;
    }
  }
  // Telegram não usa *negrito* do WhatsApp do mesmo jeito: vai o texto limpo
  const textoCanal = (t) => wz.canal === "telegram" ? String(t || "").replace(/[*~_]/g, "") : t;

  // Cliques dentro do passo
  $("#wzCorpo").addEventListener("click", async (e) => {
    const t = e.target;
    const wc = t.closest("[data-wz-cat]"); if (wc) { const v = await escolherOpcao("Categoria", [["todas", "Todas"], ...Object.entries(CATS_LISTA)], wz.filtroCat || "todas"); if (v) { wz.filtroCat = v; mostrarPasso(); } return; }
    const op = t.closest("[data-canal]"); if (op) { wz.canal = op.dataset.canal; wz.formato = "story"; wz.tipoWhats = "mensagem"; mostrarPasso(); return; }
    const pr = t.closest("[data-item]"); if (pr) { wz.itemId = pr.dataset.item; mostrarPasso(); return; }
    const tw = t.closest("[data-tipo-whats]"); if (tw) { wz.tipoWhats = tw.dataset.tipoWhats; if (wz.tipoWhats === "status") wz.formato = "story"; mostrarPasso(); return; }
    const fo = t.closest("[data-formato]"); if (fo) { wz.formato = fo.dataset.formato; mostrarPasso(); return; }
    const mo = t.closest("[data-modelo]"); if (mo) { wz.modelo = mo.dataset.modelo; document.querySelectorAll(".wz-mini").forEach((b) => b.classList.toggle("on", b === mo)); return; }
    const co = t.closest("[data-cor]"); if (co) { wz.cor = co.dataset.cor; document.querySelectorAll(".wz-mini").forEach((b) => b.classList.toggle("on", b === co)); return; }
    if (t.closest("#wzContinuar")) { irPasso(1); return; }
    if (t.closest("#wzColar")) {
      try { const v = (await navigator.clipboard.readText()).trim(); const it = await adicionarNaFila(v); if (it) { wz.itemId = it.id; mostrarPasso(); } }
      catch (err) { $("#wzLink").focus(); toast("Toque e segure no campo para colar"); }
      return;
    }
    const es = t.closest("[data-estilo]"); if (es) { usarModeloTexto(es.dataset.estilo); mostrarPasso(); return; }
    const ev = t.closest("[data-enviar-op]"); if (ev) { enviarWhats(ev.dataset.enviarOp); return; }
    const gr = t.closest("[data-grupo]"); if (gr) { enviarGrupo(gr.dataset.grupo); return; }
    if (t.closest("#wzPostar")) { postarInstagram(); return; }
    if (t.closest("#wzCopiarLink")) {
      const inp = $("#wzLinkCopiar");
      if (await copiarTexto(inp.value)) toast("Link copiado: cole no adesivo de Link");
      else { inp.focus(); inp.select(); toast("Toque e segure no link para copiar"); }
      return;
    }
    if (t.closest("#wzBaixar")) { const tela = document.createElement("canvas"); desenharMontagem(tela, false); tela.toBlob((b) => { if (b) { baixarBlob(b, nomeArquivo(wzItem().nome) ); toast("Imagem salva"); } }, "image/jpeg", 0.92); return; }
    if (t.closest("#wzTelegram")) { abrirTelegram(); return; }
    if (t.closest("#wzCopiarTg")) { if (await copiarTexto(textoCanal(wzItem().texto))) { toast("Texto copiado"); registrarCompartilhado("telegram", "Telegram"); } return; }
    if (t.closest("#wzNovo")) { iniciarCriar(); return; }
    if (t.closest("#wzSalvarPreco")) {
      const it = wzItem(), novo = lerPreco($("#wzNovoPreco").value);
      if (!novo) { toast("Digite o preço novo"); $("#wzNovoPreco").focus(); return; }
      it.precoNovo = novo; it.precoAntigo = lerPreco($("#wzAntigo").value) || null; it.texto = ""; salvarFila(true); mostrarPasso(); return;
    }
  });
  $("#wzCorpo").addEventListener("input", (e) => { if (e.target.id === "wzTexto") { const it = wzItem(); it.texto = e.target.value; it.textoEditado = true; $("#wzBalao").innerHTML = formatarWhats(textoCanal(it.texto)); salvarFila(); } });
  $("#wzCorpo").addEventListener("change", async (e) => {
    if (e.target.id !== "wzArquivo") return;
    const f = e.target.files && e.target.files[0], it = wzItem();
    if (!f || !it) return;
    try { it.imagem = await compactarArquivo(f); ppFotos[it.id] = await createImageBitmap(f); salvarFila(true); } catch (err) { toast("Não consegui abrir essa foto"); }
    desenharMontagem($("#wzTela"), true);
  });
  $("#wzCorpo").addEventListener("keydown", (e) => { if (e.target.id === "wzLink" && e.key === "Enter") { e.preventDefault(); adicionarNaFila(e.target.value).then((it) => { if (it) { wz.itemId = it.id; mostrarPasso(); } }); } });

  // ---------- Mensagem (WhatsApp e Telegram) ----------
  function usarModeloTexto(estilo) {
    const it = wzItem(); if (!it) return;
    const p = { nome: limparNome(it.nome), precoAntigo: it.precoAntigo, precoNovo: it.precoNovo, link: it.link, categoria: it.categoria || "outros", loja: it.loja, cupom: it.cupom || "" };
    it.estiloTexto = estilo; it.texto = textoDoModelo(estilo, p); it.textoEditado = false; salvarFila();
  }
  async function registrarCompartilhado(canal, onde) {
    const it = wzItem(); if (!it) return;
    it.feito = { ...(it.feito || {}), [canal]: true }; salvarFila(true);
    const p = { nome: limparNome(it.nome), precoAntigo: it.precoAntigo, precoNovo: it.precoNovo, link: it.link, categoria: it.categoria || "outros", loja: it.loja, cupom: it.cupom || "" };
    try {
      let h = it.histId ? await dados.pegar(it.histId) : null;
      if (!h) { h = { id: novoId(), criadoEm: Date.now(), produto: p, texto: it.texto || "", imagem: it.imagem || "", enviadoPara: [] }; it.histId = h.id; salvarFila(true); }
      h.produto = p; if (it.texto) h.texto = it.texto; if (it.imagem) h.imagem = it.imagem;
      if (!h.enviadoPara.includes(onde)) h.enviadoPara.push(onde);
      h.ultimoEnvio = Date.now();
      await dados.salvar(h); atualizarContadores();
    } catch (e) { /* segue */ }
  }
  async function enviarWhats(modo) {
    const it = wzItem(), texto = it.texto;
    if (modo === "foto" && noComputador()) {
      // Computador: a foto vai para a área de transferência e o WhatsApp abre com o texto pronto
      const png = (async () => converterImagem(await arquivoDaImagem(it.imagem), "image/png"))();
      let copiou = false;
      try { await navigator.clipboard.write([new ClipboardItem({ "image/png": png.then((f) => f || Promise.reject()) })]); copiou = true; } catch (e) { copiou = false; }
      abrirWhatsApp(texto);
      toast(copiou ? "A foto foi copiada: na conversa do WhatsApp, aperte Ctrl+V para colar a foto e envie com o texto" : "O WhatsApp abriu com o texto. Para a foto, use “Baixar” e arraste para a conversa");
      registrarCompartilhado("whatsapp", "WhatsApp");
      return;
    }
    if (modo === "foto") {
      const arq = it.imagem ? await converterImagem(await arquivoDaImagem(it.imagem)) : null;
      if (arq && navigator.canShare && navigator.canShare({ files: [arq], text: texto })) {
        try { await navigator.share({ files: [arq], text: texto }); registrarCompartilhado("whatsapp", "WhatsApp (com foto)"); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      if (await copiarTexto(texto)) toast("Texto copiado — no WhatsApp, envie a foto e cole o texto");
      registrarCompartilhado("whatsapp", "WhatsApp");
    } else if (modo === "texto") { abrirWhatsApp(texto); registrarCompartilhado("whatsapp", "WhatsApp"); }
    else if (await copiarTexto(texto)) { toast("Texto copiado"); registrarCompartilhado("whatsapp", "Copiado"); }
  }
  async function enviarGrupo(id) {
    const it = wzItem(), g = (config.grupos || []).find((x) => x.id === id);
    if (!g) return;
    const ok = await copiarTexto(it.texto);
    it.enviadoGrupos = [...new Set([...(it.enviadoGrupos || []), id])];
    registrarCompartilhado("whatsapp", g.nome);
    if (g.link) { window.open(g.link, "_blank", "noopener"); toast(ok ? `Mensagem copiada — cole no grupo ${g.nome}` : "Não consegui copiar"); }
    else toast(ok ? "Mensagem copiada: abra o grupo no WhatsApp e cole" : "Não consegui copiar");
    mostrarPasso();
  }
  function abrirTelegram() {
    const it = wzItem();
    const texto = textoCanal(it.texto).split(it.link).join("").trim();
    window.open(`https://t.me/share/url?url=${encodeURIComponent(it.link)}&text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    registrarCompartilhado("telegram", "Telegram");
  }

  // ---------- Instagram (montagem pronta, sem @) ----------
  async function prepararFoto(it) {
    await carregarMarca();
    if (it && !(it.id in ppFotos) && it.imagem) {
      try { const arq = await arquivoDaImagem(it.imagem); ppFotos[it.id] = arq ? await createImageBitmap(arq) : null; } catch (e) { ppFotos[it.id] = null; }
    }
  }
  function dadosMontagem(it, modelo, previa) {
    const M = MODELOS[modelo];
    return { previa, insta: "", titulo: linhasTitulo(M.padrao.titulo), texto: M.padrao.texto, botao: "", logo: false, espaco: wz.formato === "story", cupom: it.cupom || "", foto: ppFotos[it.id] || null, produto: { nome: limparNome(it.nome), antigo: it.precoAntigo, novo: it.precoNovo } };
  }
  function desenharMontagem(tela, previa, modelo, cor, formato) {
    const it = wzItem(); if (!it || !tela) return;
    const f = formato || wz.formato;
    desenharBanner(tela, modelo || wz.modelo, f, cor || wz.cor, { ...dadosMontagem(it, modelo || wz.modelo, previa), espaco: f === "story" });
  }
  async function desenharMiniaturas(porCor) {
    const it = wzItem();
    const pintar = () => document.querySelectorAll(".wz-mini").forEach((b) => desenharMontagem(b.querySelector("canvas"), false, porCor ? wz.modelo : b.dataset.modelo, porCor ? b.dataset.cor : "auto"));
    pintar();
    await prepararFoto(it);
    if (wz.passo === (porCor ? "cor" : "montagem")) pintar();
  }
  async function postarInstagram() {
    const it = wzItem();
    if (wz.canal === "whatsapp") {
      // Status do WhatsApp: imagem + texto com o link (no Status o link fica clicável)
      const tela = document.createElement("canvas"); desenharMontagem(tela, false);
      const texto = `${limparNome(it.nome)}${it.precoNovo ? " por " + brl(it.precoNovo) : ""} 👉 ${it.link}`;
      tela.toBlob(async (blob) => {
        const arq = blob && new File([blob], nomeArquivo(it.nome), { type: "image/jpeg" });
        if (arq && navigator.canShare && navigator.canShare({ files: [arq], text: texto })) {
          try { await navigator.share({ files: [arq], text: texto }); registrarCompartilhado("whatsapp", "Status do WhatsApp"); return; } catch (e) { if (e.name === "AbortError") return; }
        }
        if (blob) baixarBlob(blob, nomeArquivo(it.nome));
        if (await copiarTexto(texto)) toast("Imagem salva e texto copiado: no Status, escolha a imagem e cole o texto");
        registrarCompartilhado("whatsapp", "Status do WhatsApp");
      }, "image/jpeg", 0.92);
      return;
    }
    if (wz.formato === "story") { if (await copiarTexto(it.link)) toast("Link copiado: no story, toque no adesivo de Link e cole"); }
    else {
      const base = it.texto || `${limparNome(it.nome)}${it.precoNovo ? "\n\nPor " + brl(it.precoNovo) : ""}`;
      if (await copiarTexto(base.split(it.link).join("🔗 link na bio").replace(/[*~_]/g, "").trim())) toast("Legenda copiada: cole na legenda do post");
    }
    const tela = document.createElement("canvas"); desenharMontagem(tela, false);
    compartilharTela(tela, nomeArquivo(it.nome));
    registrarCompartilhado("instagram", "Instagram");
  }

  /* ---------- Roteiro de postagem: marca os lugares e o app leva um por um ---------- */
  const LUGARES = {
    story: { nome: "Story do Instagram", desc: "arte em pé + link", arte: "story", canal: "instagram" },
    status: { nome: "Status do WhatsApp", desc: "arte em pé + texto", arte: "story", canal: "whatsapp" },
    grupo: { nome: "Grupos do WhatsApp", desc: "foto + mensagem", texto: true, canal: "whatsapp" },
    canal: { nome: "Canal do WhatsApp", desc: "foto + mensagem", texto: true, canal: "whatsapp" },
    telegram: { nome: "Telegram", desc: "mensagem com link", texto: true, canal: "telegram" },
    feed: { nome: "Post do feed", desc: "arte + legenda", arte: "post", canal: "instagram" }
  };
  function lugaresSalvos() {
    try { const l = JSON.parse(localStorage.getItem("miga_lugares") || "null"); if (Array.isArray(l) && l.length) return l.filter((k) => LUGARES[k]); } catch (e) { /* segue */ }
    return ["story", "status", "grupo", "canal"];
  }
  const precisaArte = () => (wz.lugares || []).some((k) => LUGARES[k].arte);
  const precisaTexto = () => (wz.lugares || []).some((k) => LUGARES[k].texto);
  function passosRoteiro() {
    return ["canal", ...(wz.veioDaLista ? [] : ["produto"]), "lugares", ...(precisaArte() ? ["montagem", "cor"] : []), ...(precisaTexto() ? ["mensagem"] : []), "rodar", "resumo"];
  }
  function telaRoteiro(c, item) {
    if (wz.passo === "lugares") {
      if (!wz.lugares) wz.lugares = lugaresSalvos();
      c.innerHTML = `<h2 class="wz-titulo">Onde vai postar?</h2>
        <div class="wz-prod on" style="cursor:default">${fotoMini(item)}<span><b>${esc(item.nome || "Sem nome")}</b><small>${item.precoNovo ? brl(item.precoNovo) : "sem preço"}</small></span></div>
        <p class="nota">Marque tudo de uma vez. O app guarda sua escolha para a próxima.</p>
        <div class="wz-ops">${Object.entries(LUGARES).map(([k, v]) => `<button type="button" class="rt-lugar${wz.lugares.includes(k) ? " on" : ""}" data-lugar="${k}"><i></i><span><b>${v.nome}</b><small>${v.desc}</small></span></button>`).join("")}</div>
        ${botaoContinuar(wz.lugares.length > 0, `Começar (${wz.lugares.length} ${wz.lugares.length === 1 ? "lugar" : "lugares"})`)}`;
      return true;
    }
    if (wz.passo === "rodar") {
      const k = wz.lugares[wz.idx], L = LUGARES[k], n = wz.lugares.length;
      if (L.texto && !item.texto) usarModeloTexto(item.estiloTexto || "amiga");
      const barra = `<div class="rt-prog">${wz.lugares.map((x, i) => `<i class="${wz.res[x] === "feito" ? "ok" : wz.res[x] === "pulado" ? "pulo" : i === wz.idx ? "at" : ""}"></i>`).join("")}</div>
        <div class="rt-etapa">${wz.idx + 1} de ${n} · ${L.nome}</div>`;
      const pular = `<button type="button" class="btn btn--branco" id="rtPular">${wz.idx === n - 1 ? "Pular e ver o resumo" : "Pular este"}</button>`;
      let meio = "", botao = "", dica = "";
      if (L.arte) {
        meio = `<div class="wz-previa"><canvas id="rtTela"></canvas></div>`;
        if (k === "story") { botao = "Postar no Instagram"; dica = "O link já vai copiado: no story, toque no adesivo de Link e cole."; }
        if (k === "status") { botao = "Postar no Status"; dica = "Escolha o WhatsApp com “B” e depois Meu status. O texto com o link vai junto."; }
        if (k === "feed") { botao = "Postar no feed"; dica = "A legenda já vai copiada, com “link na bio”."; }
        meio += `<div class="link-copiar"><span>Link do produto</span><input id="wzLinkCopiar" readonly value="${esc(item.link)}"><button type="button" class="btn btn--branco" id="wzCopiarLink">Copiar link</button></div>`;
      } else {
        const txt = k === "telegram" ? String(item.texto).replace(/[*~_]/g, "") : item.texto;
        meio = `<div class="balao wz-balao${k === "telegram" ? " wz-balao--tg" : ""}">${formatarWhats(txt)}</div>`;
        if (k === "grupo") { botao = "Enviar com foto"; dica = "Escolha o WhatsApp e o grupo. A foto e a mensagem vão juntas."; }
        if (k === "canal") { botao = "Enviar no canal"; dica = "Escolha o WhatsApp com “B” e o seu canal. Se o canal não aparecer, use “Copiar o texto” e cole no canal."; }
        if (k === "telegram") { botao = "Abrir no Telegram"; dica = "No Telegram o link fica clicável."; }
        meio += `<button type="button" class="btn btn--branco" id="rtCopiarTexto">Copiar o texto</button>`;
      }
      c.innerHTML = `${barra}${meio}<p class="nota wz-centro">${dica}</p>
        <div class="wz-rodape"><button type="button" class="btn btn--rosa wz-continuar${k === "status" || k === "grupo" || k === "canal" ? " wz-zap" : k === "telegram" ? " wz-tg" : ""}" id="rtPostar">${botao}</button></div>
        ${pular}`;
      if (L.arte) { const desenhar = () => desenharMontagem($("#rtTela"), true, null, null, L.arte); desenhar(); prepararFoto(item).then(() => { if (wz.passo === "rodar") desenhar(); }); }
      return true;
    }
    if (wz.passo === "resumo") {
      const prox = fila().find((x) => x.id !== item.id && !x.carregando && !Object.values(x.feito || {}).some(Boolean));
      c.innerHTML = `<div class="rt-fim"><div class="rt-big">✓</div><h2 class="wz-titulo">${wz.lugares.every((k) => wz.res[k] === "feito") ? "Tudo postado!" : "Roteiro concluído"}</h2>
        <div class="rt-lista">${wz.lugares.map((k) => `<div><span>${LUGARES[k].nome}</span><b class="${wz.res[k] === "feito" ? "ok" : ""}">${wz.res[k] === "feito" ? "Postado" : "Pulado"}</b></div>`).join("")}</div></div>
        ${prox ? `<div class="wz-rodape"><button type="button" class="btn btn--rosa wz-continuar" id="rtProximo">Próximo produto da lista</button></div><p class="nota wz-centro">Próximo: <b>${esc(prox.nome || "produto")}</b></p>` : '<p class="nota wz-centro">Não há mais produtos para postar na lista.</p>'}
        <button type="button" class="btn btn--branco" id="rtLista">Voltar para a lista</button>`;
      return true;
    }
    return false;
  }
  function avancarRoteiro() {
    wz.aguardando = false;
    if (wz.idx < wz.lugares.length - 1) { wz.idx++; mostrarPasso(); }
    else { wz.passo = "resumo"; mostrarPasso(); }
  }
  async function compartilharArquivo(arq, texto) {
    if (arq && navigator.canShare && navigator.canShare(texto ? { files: [arq], text: texto } : { files: [arq] })) {
      try { await navigator.share(texto ? { files: [arq], text: texto } : { files: [arq] }); return "ok"; }
      catch (e) { if (e.name === "AbortError") return "cancelado"; }
    }
    return "sem";
  }
  const telaParaArquivo = (tela, nome) => new Promise((ok) => tela.toBlob((b) => ok(b ? new File([b], nome, { type: "image/jpeg" }) : null), "image/jpeg", 0.92));
  async function postarLugar() {
    const it = wzItem(), k = wz.lugares[wz.idx], L = LUGARES[k];
    let r = "sem";
    if (L.arte) {
      const tela = document.createElement("canvas"); desenharMontagem(tela, false, null, null, L.arte);
      const arq = await telaParaArquivo(tela, nomeArquivo(it.nome));
      let texto = "";
      if (k === "story") await copiarTexto(it.link);
      if (k === "status") texto = `${limparNome(it.nome)}${it.precoNovo ? " por " + brl(it.precoNovo) : ""} 👉 ${it.link}`;
      if (k === "feed") { const base = it.texto || `${limparNome(it.nome)}${it.precoNovo ? "\n\nPor " + brl(it.precoNovo) : ""}`; await copiarTexto(base.split(it.link).join("🔗 link na bio").replace(/[*~_]/g, "").trim()); }
      r = await compartilharArquivo(arq, texto);
      if (r === "sem") { if (arq) baixarBlob(arq, arq.name); if (texto) await copiarTexto(texto); toast("Imagem salva: abra o app e escolha da galeria"); }
    } else if (k === "telegram") {
      abrirTelegram(); r = "aberto";
    } else {
      const foto = it.imagem ? await converterImagem(await arquivoDaImagem(it.imagem)) : null;
      r = await compartilharArquivo(foto, it.texto);
      if (r === "sem") { await copiarTexto(it.texto); abrirWhatsApp(it.texto); r = "aberto"; }
    }
    if (r === "cancelado") return;
    wz.res[k] = "feito";
    registrarCompartilhado(L.canal, L.nome);
    if (r === "ok") avancarRoteiro();
    else { wz.aguardando = true; toast("Quando voltar para o Miga, o roteiro segue para o próximo"); }
  }
  // Voltou do outro app: segue o roteiro
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && wz.aguardando && wz.passo === "rodar") setTimeout(avancarRoteiro, 400); });
  $("#wzCorpo").addEventListener("click", async (e) => {
    if (wz.canal !== "roteiro") return;
    const t = e.target;
    const lg = t.closest("[data-lugar]");
    if (lg) {
      const k = lg.dataset.lugar;
      wz.lugares = wz.lugares.includes(k) ? wz.lugares.filter((x) => x !== k) : Object.keys(LUGARES).filter((x) => x === k || wz.lugares.includes(x));
      try { localStorage.setItem("miga_lugares", JSON.stringify(wz.lugares)); } catch (err) { /* segue */ }
      // Atualiza só o que mudou (sem redesenhar a tela e sem voltar ao topo)
      lg.classList.toggle("on", wz.lugares.includes(k));
      const n = wz.lugares.length, b = $("#wzContinuar");
      b.disabled = !n; b.textContent = `Começar (${n} ${n === 1 ? "lugar" : "lugares"})`;
      return;
    }
    if (t.closest("#rtPostar")) { postarLugar(); return; }
    if (t.closest("#rtPular")) { wz.res[wz.lugares[wz.idx]] = "pulado"; avancarRoteiro(); return; }
    if (t.closest("#rtCopiarTexto")) { const it = wzItem(); const k = wz.lugares[wz.idx]; if (await copiarTexto(k === "telegram" ? it.texto.replace(/[*~_]/g, "") : it.texto)) toast("Texto copiado"); return; }
    if (t.closest("#rtLista")) { irPara("postar"); iniciarCriar(); return; }
    if (t.closest("#rtProximo")) {
      const atualId = wz.itemId;
      const prox = fila().find((x) => x.id !== atualId && !x.carregando && !Object.values(x.feito || {}).some(Boolean));
      if (!prox) return;
      wz = { ...wz, itemId: prox.id, veioDaLista: true, idx: 0, res: {}, aguardando: false };
      wz.passo = precisaTexto() && !prox.precoNovo ? "mensagem" : "rodar";
      mostrarPasso();
    }
  });

  /* ---------- Criação livre: imagem com vários produtos (grade) ---------- */
  const TEMAS_LIVRE = {
    mix: { nome: "Mix de achados", titulo: "Achadinhos\n*da semana* 🛍️" },
    beleza: { nome: "Beleza", titulo: "Achados de\n*beleza* 💄" },
    cozinha: { nome: "Cozinha", titulo: "Achados para\na *cozinha* 🍳" },
    casa: { nome: "Casa", titulo: "Casa\n*arrumadinha* 🏡" },
    moda: { nome: "Moda", titulo: "Looks com\n*desconto* 👗" },
    fitness: { nome: "Fitness", titulo: "Treino\n*em dia* 💪" }
  };
  function livre() {
    if (!wz.livre) wz.livre = { n: 4, formato: "post", itens: [], tema: "mix", titulo: TEMAS_LIVRE.mix.titulo, cor: "creme" };
    return wz.livre;
  }
  /** Desenha a grade de produtos com a cara do Miga */
  function desenharGrade(canvas, op = {}) {
    const L = livre(), n = op.n || L.n, formato = op.formato || L.formato, cor = op.cor || L.cor;
    const W = 1080, H = formato === "story" ? 1920 : formato === "quadrado" ? 1080 : 1350;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d"), C = CORES_BN[cor] || CORES_BN.creme;
    if (C.tipo === "creme") { const g = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, H * 0.85); g.addColorStop(0, "#fff8e4"); g.addColorStop(0.55, "#fff3c4"); g.addColorStop(1, "#ffeaa6"); ctx.fillStyle = g; }
    else ctx.fillStyle = C.fundoCor || (C.tipo === "rosa" ? "#e8336d" : "#ffffff");
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.bola1; ctx.beginPath(); ctx.arc(40, 40, 190, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.bola2; ctx.beginPath(); ctx.arc(W - 40, H - 40, 200, 0, Math.PI * 2); ctx.fill();
    // Título
    const linhas = linhasTitulo(op.titulo != null ? op.titulo : L.titulo);
    const FT = formato === "quadrado" ? 70 : 84;
    let y = formato === "story" ? 120 : 70;
    ctx.textBaseline = "middle"; ctx.font = `800 ${FT}px Poppins`;
    linhas.forEach((partes) => {
      const larg = partes.reduce((s, [t]) => s + ctx.measureText(t).width, 0);
      let x = (W - Math.min(larg, W - 80)) / 2; ctx.textAlign = "left";
      partes.forEach(([t, d]) => { ctx.fillStyle = d ? C.destaque : C.texto; ctx.fillText(t, x, y + FT * 0.55); x += ctx.measureText(t).width; });
      y += FT * 1.08;
    });
    ctx.textAlign = "center";
    // Grade
    const itens = op.vazio ? [] : L.itens.slice(0, n);
    const cols = formato === "story" ? (n <= 1 ? 1 : 2) : (n <= 4 ? 2 : 3), rows = Math.ceil(n / cols);
    const gap = 26, mx = 70, topo = y + 34, base = H - (formato === "story" ? 200 : 130);
    const cw = (W - mx * 2 - gap * (cols - 1)) / cols, ch = Math.min((base - topo - gap * (rows - 1)) / rows, cw + 150);
    const alturaGrade = rows * ch + (rows - 1) * gap, y0 = topo + Math.max(0, (base - topo - alturaGrade) / 2);
    for (let k = 0; k < n; k++) {
      const r = Math.floor(k / cols), naLinha = Math.min(cols, n - r * cols), c = k - r * cols;
      const x0 = (W - (naLinha * cw + (naLinha - 1) * gap)) / 2 + c * (cw + gap), yy = y0 + r * (ch + gap);
      ctx.save(); ctx.shadowColor = "rgba(29,29,31,.16)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
      retArredondado(ctx, x0, yy, cw, ch, 34); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.restore();
      const it = itens[k], textoH = it && (it.nome || it.preco) ? 96 : 0;
      const fs = Math.min(cw - 28, ch - textoH - 28), fx = x0 + (cw - fs) / 2, fy = yy + 14;
      const foto = it && (it.foto || (it.itemId && ppFotos[it.itemId]));
      if (foto) {
        const kk = Math.min(fs / foto.width, fs / foto.height), iw = foto.width * kk, ih = foto.height * kk;
        ctx.save(); retArredondado(ctx, fx, fy, fs, fs, 24); ctx.clip(); ctx.drawImage(foto, fx + (fs - iw) / 2, fy + (fs - ih) / 2, iw, ih); ctx.restore();
      } else { retArredondado(ctx, fx, fy, fs, fs, 24); ctx.fillStyle = "#f7f2e6"; ctx.fill(); if (op.previa !== false) { ctx.fillStyle = "#b3a782"; ctx.font = "600 30px Poppins"; ctx.fillText("produto " + (k + 1), x0 + cw / 2, fy + fs / 2); } }
      // número
      ctx.beginPath(); ctx.arc(x0 + 34, yy + 34, 26, 0, Math.PI * 2); ctx.fillStyle = "#e8336d"; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 28px Poppins"; ctx.fillText(String(k + 1), x0 + 34, yy + 36);
      if (textoH) {
        ctx.fillStyle = "#1d1d1f"; ctx.font = `600 ${cols > 2 ? 24 : 28}px Poppins`;
        ctx.fillText(quebrarTexto(ctx, it.nome || "", cw - 30, 1)[0] || "", x0 + cw / 2, yy + ch - 66);
        if (it.preco) { ctx.fillStyle = "#e8336d"; ctx.font = `800 ${cols > 2 ? 32 : 38}px Poppins`; ctx.fillText(brl(it.preco), x0 + cw / 2, yy + ch - 28); }
      }
    }
    if (edMarca) { const s = 140; ctx.drawImage(edMarca, W - s - 24, H - s - 18, s, s); }
  }
  const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"];
  /** Legenda pronta no mesmo estilo da mensagem do WhatsApp (ou a que você editou) */
  function legendaPadrao() {
    const L = livre();
    const tema = L.titulo.replace(/[*]/g, "").replace(/\s*\n\s*/g, " ").trim();
    const itens = L.itens.slice(0, L.n).map((it, k) =>
      `${NUM[k]} *${it.nome || "Produto " + (k + 1)}*${it.preco ? `\n💸 por *${brl(it.preco)}*` : ""}${it.link ? `\n👉 ${it.link}` : ""}`);
    return `Miga, separei uns achadinhos pra você! 🛍️💖\n${tema}\n\n${itens.join("\n\n")}\n\nCorre que promoção boa assim acaba rapidinho! ⏳🌸`;
  }
  const legendaLivre = () => { const L = livre(); return L.legenda || legendaPadrao(); };
  async function legendaComIA() {
    const L = livre();
    const b = $("#lvIA"); if (b) { b.disabled = true; b.textContent = "Escrevendo…"; }
    try {
      const r = await api("gerar", { produtos: L.itens.slice(0, L.n).map((x) => ({ nome: x.nome, preco: x.preco, link: x.link })), tema: TEMAS_LIVRE[L.tema].nome });
      L.legenda = comConvite(r.texto); toast("Legenda escrita pela IA");
    } catch (e) {
      if (e.codigo === "senha") { bloquear("O código de acesso mudou. Digite o novo código."); return; }
      toast("A IA não respondeu: " + e.message);
    }
    if (wz.passo === "livre") mostrarPasso();
  }
  async function fotosDaLista() {
    await carregarMarca();
    for (const it of livre().itens) if (it.itemId) { const x = fila().find((f) => f.id === it.itemId); if (x) await prepararFoto(x); }
  }
  function telaLivre(c) {
    const L = livre();
    if (wz.passo === "grade") {
      c.innerHTML = `<h2 class="wz-titulo">Quantos produtos?</h2>
        <div class="wz-miniaturas">${[2, 3, 4, 6].map((n) => `<button type="button" class="wz-mini${L.n === n ? " on" : ""}" data-grade="${n}"><canvas></canvas><span>${n} produtos</span></button>`).join("")}</div>
        <div class="campo"><span>Formato</span><div class="alternar" id="lvFormato">${["story", "post", "quadrado"].map((f) => `<button type="button" role="radio" data-lv-formato="${f}" aria-checked="${L.formato === f}">${{ story: "Story", post: "Post 4:5", quadrado: "Quadrado" }[f]}</button>`).join("")}</div></div>
        ${botaoContinuar(true)}`;
      document.querySelectorAll("[data-grade]").forEach((b) => desenharGrade(b.querySelector("canvas"), { n: +b.dataset.grade, vazio: true, titulo: "" }));
      return;
    }
    if (wz.passo === "itens") {
      const escolhidos = L.itens;
      c.innerHTML = `<h2 class="wz-titulo">Escolha os produtos</h2><p class="nota">${escolhidos.length} de ${L.n}. Toque para marcar da sua lista, ou adicione uma foto da galeria.</p>
        ${filtroCatWz()}
        <div class="wz-ops">${fila().filter((x) => !x.carregando && (!wz.filtroCat || wz.filtroCat === "todas" || (x.categoria || "outros") === wz.filtroCat)).map((x) => { const on = escolhidos.some((e) => e.itemId === x.id); return `<button type="button" class="wz-prod${on ? " on" : ""}" data-lv-item="${esc(x.id)}">${fotoMini(x)}<span><b>${esc(x.nome || "Sem nome")}</b><small>${x.precoNovo ? brl(x.precoNovo) : "sem preço"}${on ? " · nº " + (escolhidos.findIndex((e) => e.itemId === x.id) + 1) : ""}</small></span></button>`; }).join("")}</div>
        ${escolhidos.filter((e) => !e.itemId).map((e) => `<div class="lv-galeria" data-lv-gal="${e.id}"><img src="${e.url}" alt=""><div class="lv-campos"><input data-lv-campo="nome" value="${esc(e.nome)}" placeholder="Nome (opcional)"><input data-lv-campo="preco" value="${e.preco ? paraCampo(e.preco) : ""}" inputmode="decimal" placeholder="Preço (opcional)"><input data-lv-campo="link" value="${esc(e.link)}" inputmode="url" placeholder="Link (vai na legenda)"></div><button type="button" class="icone-btn" data-lv-tirar="${e.id}" aria-label="Tirar"><svg><use href="#i-x"/></svg></button></div>`).join("")}
        <label class="btn btn--branco">Adicionar foto da galeria<input type="file" id="lvArquivo" accept="image/*" multiple hidden></label>
        ${botaoContinuar(escolhidos.length > 0)}`;
      return;
    }
    if (wz.passo === "tema") {
      c.innerHTML = `<h2 class="wz-titulo">Tema e cor</h2>
        <div class="wz-chips" id="lvTemas">${Object.entries(TEMAS_LIVRE).map(([k, v]) => `<button type="button" data-lv-tema="${k}"${L.tema === k ? ' class="on"' : ""}>${v.nome}</button>`).join("")}</div>
        <label class="campo"><span>Título</span><textarea id="lvTitulo" rows="2">${esc(L.titulo)}</textarea></label>${chipsTitulos("lvTitulo")}
        <div class="wz-miniaturas">${["creme", "rosa", "branco", "preto"].map((cr) => `<button type="button" class="wz-mini${L.cor === cr ? " on" : ""}" data-lv-cor="${cr}"><canvas></canvas><span>${CORES_NOME[cr]}</span></button>`).join("")}</div>
        ${botaoContinuar(true)}`;
      const pintar = () => document.querySelectorAll("[data-lv-cor]").forEach((b) => desenharGrade(b.querySelector("canvas"), { cor: b.dataset.lvCor }));
      pintar(); fotosDaLista().then(() => { if (wz.passo === "tema") pintar(); });
      return;
    }
    if (wz.passo === "livre") {
      c.innerHTML = `<h2 class="wz-titulo">Pronto para postar</h2>
        <div class="wz-previa"><canvas id="lvTela"></canvas></div>
        <h3 class="wz-sub">Legenda (já vai junto)</h3>
        <div class="balao wz-balao" id="lvBalao">${formatarWhats(legendaLivre())}</div>
        <div class="wz-chips"><button type="button" id="lvPadrao">Voltar ao texto padrão</button></div>
        <label class="campo"><span>Editar o texto</span><textarea id="lvTexto" rows="10">${esc(legendaLivre())}</textarea></label>
        <button type="button" class="btn btn--branco" id="lvCopiarTexto">Copiar só o texto</button>
        <button type="button" class="btn btn--rosa" id="lvPostar">Postar com a legenda</button>
        <button type="button" class="btn btn--branco" id="lvBaixar">Baixar imagem</button>
        <p class="nota">No WhatsApp e no Telegram os links da legenda ficam clicáveis. No Instagram, link na legenda não abre: use o adesivo no story ou a bio.</p>
        <button type="button" class="btn btn--branco" id="wzNovo">Criar outra postagem</button>`;
      desenharGrade($("#lvTela")); fotosDaLista().then(() => desenharGrade($("#lvTela")));
    }
  }
  $("#wzCorpo").addEventListener("click", async (e) => {
    if (wz.canal !== "livre") return;
    const t = e.target, L = livre();
    const g = t.closest("[data-grade]"); if (g) { L.n = +g.dataset.grade; L.itens = L.itens.slice(0, L.n); mostrarPasso(); return; }
    const f = t.closest("[data-lv-formato]"); if (f) { L.formato = f.dataset.lvFormato; mostrarPasso(); return; }
    const li = t.closest("[data-lv-item]");
    if (li) {
      const i = L.itens.findIndex((x) => x.itemId === li.dataset.lvItem);
      if (i >= 0) L.itens.splice(i, 1);
      else if (L.itens.length >= L.n) toast(`Já escolheu ${L.n} produtos (mude a grade para mais)`);
      else { const x = fila().find((y) => y.id === li.dataset.lvItem); L.itens.push({ id: novoId(), itemId: x.id, nome: limparNome(x.nome), preco: x.precoNovo, link: x.link }); }
      mostrarPasso(); return;
    }
    const tr = t.closest("[data-lv-tirar]"); if (tr) { L.itens = L.itens.filter((x) => x.id !== tr.dataset.lvTirar); mostrarPasso(); return; }
    const te = t.closest("[data-lv-tema]"); if (te) { L.tema = te.dataset.lvTema; L.titulo = TEMAS_LIVRE[L.tema].titulo; mostrarPasso(); return; }
    const co = t.closest("[data-lv-cor]"); if (co) { L.cor = co.dataset.lvCor; document.querySelectorAll("[data-lv-cor]").forEach((b) => b.classList.toggle("on", b === co)); return; }
    if (t.closest("#lvPostar")) {
      const leg = legendaLivre();
      if (await copiarTexto(leg)) toast("Legenda com os links copiada");
      const tela = document.createElement("canvas"); desenharGrade(tela, { previa: false });
      tela.toBlob(async (blob) => {
        const arq = blob && new File([blob], "miga-promo-achados.jpg", { type: "image/jpeg" });
        if (arq && navigator.canShare && navigator.canShare({ files: [arq], text: leg })) { try { await navigator.share({ files: [arq], text: leg }); return; } catch (err) { if (err.name === "AbortError") return; } }
        if (blob) { baixarBlob(blob, "miga-promo-achados.jpg"); toast("Imagem salva e legenda copiada"); }
      }, "image/jpeg", 0.92);
      return;
    }
    if (t.closest("#lvPadrao")) { delete L.legenda; mostrarPasso(); return; }
    if (t.closest("#lvCopiarTexto")) {
      if (await copiarTexto(legendaLivre())) toast("Texto copiado");
      else { $("#lvTexto").focus(); $("#lvTexto").select(); toast("Toque e segure no texto para copiar"); }
      return;
    }
    if (t.closest("#lvBaixar")) { const tela = document.createElement("canvas"); desenharGrade(tela, { previa: false }); tela.toBlob((b) => { if (b) { baixarBlob(b, "miga-promo-achados.jpg"); toast("Imagem salva"); } }, "image/jpeg", 0.92); }
  });
  $("#wzCorpo").addEventListener("input", (e) => {
    if (wz.canal !== "livre") return;
    const L = livre();
    if (e.target.id === "lvTexto") { L.legenda = e.target.value; $("#lvBalao").innerHTML = formatarWhats(L.legenda); return; }
    if (e.target.id === "lvTitulo") { L.titulo = e.target.value; document.querySelectorAll("[data-lv-cor]").forEach((b) => desenharGrade(b.querySelector("canvas"), { cor: b.dataset.lvCor })); return; }
    const campo = e.target.dataset.lvCampo;
    if (campo) {
      const it = L.itens.find((x) => x.id === e.target.closest("[data-lv-gal]").dataset.lvGal);
      if (it) it[campo] = campo === "preco" ? lerPreco(e.target.value) : e.target.value.trim();
    }
  });
  $("#wzCorpo").addEventListener("change", async (e) => {
    if (e.target.id !== "lvArquivo") return;
    const L = livre();
    for (const f of [...(e.target.files || [])]) {
      if (L.itens.length >= L.n) { toast(`A grade tem ${L.n} lugares`); break; }
      try { L.itens.push({ id: novoId(), foto: await createImageBitmap(f), url: await compactarArquivo(f), nome: "", preco: null, link: "" }); } catch (err) { toast("Não consegui abrir uma das fotos"); }
    }
    mostrarPasso();
  });

  /* ---------- Vídeo com o tema do Miga ---------- */
  const TEMAS_VIDEO = {
    cheia: "Tela cheia", moldura: "Moldura", faixa: "Faixa", dividido: "Dividido", selo: "Etiqueta", minimal: "Mínimo"
  };
  const CORES_VIDEO = {
    creme: { nome: "Creme", fundo: "#fff3c4", texto: "#1d1d1f", destaque: "#e8336d", pill: "#e8336d", pillTexto: "#fff", bola: "rgba(255,210,63,.45)" },
    rosa: { nome: "Rosa", fundo: "#e8336d", texto: "#ffffff", destaque: "#ffd23f", pill: "#ffd23f", pillTexto: "#1d1d1f", bola: "rgba(255,255,255,.9)" },
    branco: { nome: "Branco", fundo: "#ffffff", texto: "#1d1d1f", destaque: "#e8336d", pill: "#e8336d", pillTexto: "#fff", bola: "rgba(255,210,63,.35)" },
    preto: { nome: "Preto", fundo: "#1d1d1f", texto: "#ffffff", destaque: "#ffd23f", pill: "#ffd23f", pillTexto: "#1d1d1f", bola: "rgba(232,51,109,.85)" }
  };
  /** Prompts prontos para pedir o vídeo a uma IA (Veo/Gemini, Sora, Kling, Runway...) levando a foto do produto */
  const PROMPTS_VIDEO = [
    ["Produto em destaque", (n) => `Crie um vídeo vertical 9:16 de 8 segundos mostrando o produto da imagem anexada (${n}) girando devagar sobre um fundo creme claro, com luz suave de estúdio e closes nos detalhes. Estilo propaganda elegante e delicada. Mantenha o produto igual ao da foto. Sem textos na tela e deixe espaço livre em cima e embaixo.`],
    ["Abrindo a encomenda", (n) => `Vídeo vertical 9:16, 8 segundos: mãos femininas com unhas feitas abrindo uma caixa de encomenda sobre uma mesa clara e tirando o produto da imagem anexada (${n}). Luz natural, câmera próxima, clima de surpresa boa. Produto idêntico ao da foto. Sem textos.`],
    ["No dia a dia", (n) => `Vídeo vertical 9:16 de 8 segundos: uma mulher brasileira de uns 30 anos usando o produto da imagem anexada (${n}) em casa, luz natural da manhã, câmera na mão estilo celular, clima leve e feliz. O produto deve aparecer bem e igual ao da foto. Sem textos na tela.`],
    ["Problema e solução", (n) => `Vídeo vertical 9:16, duas cenas de 4 segundos. Cena 1: uma situação comum do dia a dia em que falta o produto. Cena 2: a mesma pessoa usando o produto da imagem anexada (${n}) e resolvendo, sorrindo. Luz natural, estilo vídeo de celular. Produto igual ao da foto. Sem textos.`],
    ["Mesa decorada", (n) => `Vídeo vertical 9:16 de 6 segundos, vista de cima: o produto da imagem anexada (${n}) sobre uma mesa clara com flores e objetos em tons de rosa e amarelo; a câmera se aproxima devagar até o produto. Estética delicada de loja. Produto igual ao da foto. Sem textos.`]
  ];
  function vd() {
    if (!wz.video) wz.video = { arquivo: null, url: "", tema: "cheia", cor: "creme", titulo: "Achadinho\n*do dia* ✨", nome: "", antigo: null, novo: null, cupom: "", botao: "Link na bio", itemId: null, resultado: null };
    return wz.video;
  }
  function formatoGravacao() {
    if (typeof MediaRecorder === "undefined") return null;
    return ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || null;
  }
  /** Desenha um quadro: o vídeo + o tema por cima. Medidas em 1080 × 1920. */
  function quadroVideo(ctx, W, H, fonte, V) {
    const k = W / 1080; ctx.save(); ctx.scale(k, k);
    const w = 1080, h = 1920, C = CORES_VIDEO[V.cor] || CORES_VIDEO.creme;
    const vw = fonte ? (fonte.videoWidth || fonte.width) : 0, vh = fonte ? (fonte.videoHeight || fonte.height) : 0;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const pintar = (x, y, ww, hh) => {
      if (!vw) { const g = ctx.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, "#cfc6b4"); g.addColorStop(1, "#a99f8c"); ctx.fillStyle = g; ctx.fillRect(x, y, ww, hh); return; }
      const s = Math.max(ww / vw, hh / vh), iw = vw * s, ih = vh * s;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, ww, hh); ctx.clip(); ctx.drawImage(fonte, x + (ww - iw) / 2, y + (hh - ih) / 2, iw, ih); ctx.restore();
    };
    const sombraTexto = (on) => { ctx.shadowColor = on ? "rgba(0,0,0,.55)" : "transparent"; ctx.shadowBlur = on ? 18 : 0; ctx.shadowOffsetY = on ? 3 : 0; };
    const linhas = linhasTitulo(V.titulo);
    const titulo = (y, cor, dest, tam = 92, sombra = false) => {
      ctx.font = `800 ${tam}px Poppins`; sombraTexto(sombra);
      linhas.forEach((partes, j) => {
        const larg = partes.reduce((s, [t]) => s + ctx.measureText(t).width, 0); let x = (w - larg) / 2; ctx.textAlign = "left";
        partes.forEach(([t, d]) => { ctx.fillStyle = d ? dest : cor; ctx.fillText(t, x, y + j * tam * 1.08); x += ctx.measureText(t).width; });
      });
      ctx.textAlign = "center"; sombraTexto(false);
      return y + linhas.length * tam * 1.08;
    };
    const pilula = (texto, cx, cy, fundo, cor, tam = 44) => {
      texto = String(texto || "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").trim();
      if (!texto) return 0;
      ctx.font = `700 ${tam}px Poppins`; const pw = Math.min(w - 100, ctx.measureText(texto).width + 90), ph = tam * 2.3;
      retArredondado(ctx, cx - pw / 2, cy - ph / 2, pw, ph, ph / 2); ctx.fillStyle = fundo; ctx.fill();
      ctx.fillStyle = cor; ctx.fillText(texto, cx, cy + 2); return ph;
    };
    // Nome + de/por + cupom; devolve a altura usada
    const infos = (y, corTexto, corPreco, corAntigo, sombra = false, tamPreco = 96) => {
      let yy = y; sombraTexto(sombra);
      if (V.nome) { ctx.font = "700 46px Poppins"; ctx.fillStyle = corTexto; quebrarTexto(ctx, V.nome, w - 160, 2).forEach((l) => { ctx.fillText(l, w / 2, yy + 26); yy += 58; }); yy += 8; }
      if (V.novo) {
        if (V.antigo && V.antigo > V.novo) {
          ctx.font = "500 40px Poppins"; ctx.fillStyle = corAntigo; const t = "de " + brl(V.antigo); ctx.fillText(t, w / 2, yy + 22);
          const lw = ctx.measureText(t).width, ld = ctx.measureText("de ").width; ctx.fillRect(w / 2 - lw / 2 + ld, yy + 24, lw - ld, 4); yy += 56;
        }
        ctx.font = `800 ${tamPreco}px Poppins`; ctx.fillStyle = corPreco; ctx.fillText((V.antigo && V.antigo > V.novo ? "por " : "") + brl(V.novo), w / 2, yy + tamPreco * 0.55); yy += tamPreco * 1.15;
      }
      sombraTexto(false);
      if (V.cupom) {
        ctx.font = "800 40px Poppins"; const t = "CUPOM " + V.cupom.toUpperCase(), cw = ctx.measureText(t).width + 70;
        retArredondado(ctx, (w - cw) / 2, yy + 6, cw, 80, 40); ctx.fillStyle = "#ffffff"; ctx.fill();
        ctx.setLineDash([14, 9]); ctx.lineWidth = 4; ctx.strokeStyle = "#1d1d1f"; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#1d1d1f"; ctx.fillText(t, w / 2, yy + 48); yy += 104;
      }
      return yy - y;
    };
    const altInfos = () => (V.nome ? 66 * Math.min(2, Math.ceil((V.nome.length || 1) / 32)) : 0) + (V.novo ? (V.antigo > V.novo ? 56 : 0) + 110 : 0) + (V.cupom ? 104 : 0);
    const marca = (x, y, s, fundo) => {
      if (!edMarca) return;
      if (fundo) { ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.62, 0, Math.PI * 2); ctx.fillStyle = fundo; ctx.fill(); }
      ctx.drawImage(edMarca, x, y, s, s);
    };
    const nl = linhas.length;

    if (V.tema === "cheia") { // tela cheia, textos direto no vídeo (sem cartão)
      pintar(0, 0, w, h);
      let g = ctx.createLinearGradient(0, 0, 0, 560); g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, 560);
      g = ctx.createLinearGradient(0, h - 820, 0, h); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.7)"); ctx.fillStyle = g; ctx.fillRect(0, h - 820, w, 820);
      titulo(190, "#ffffff", C.destaque === "#e8336d" ? "#ffd23f" : C.destaque, 96, true);
      const ai = altInfos(), base = h - 200 - ai - (V.botao ? 110 : 0);
      infos(base, "#ffffff", "#ffd23f", "rgba(255,255,255,.85)", true);
      if (V.botao) pilula(V.botao, w / 2, h - 230, C.pill, C.pillTexto);
      marca(w - 180, h - 175, 140);
    } else if (V.tema === "moldura") {
      ctx.fillStyle = C.fundo; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = C.bola; ctx.beginPath(); ctx.arc(40, 40, 190, 0, Math.PI * 2); ctx.fill();
      const fimTitulo = titulo(150, C.texto, C.destaque);
      const ai = altInfos(), top = fimTitulo + 10, alt = h - top - ai - (V.botao ? 140 : 40) - 150;
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; retArredondado(ctx, 90, top, w - 180, alt, 44); ctx.fillStyle = "#000"; ctx.fill(); ctx.restore();
      ctx.save(); retArredondado(ctx, 90, top, w - 180, alt, 44); ctx.clip(); pintar(90, top, w - 180, alt); ctx.restore();
      const y2 = top + alt + 30 + infos(top + alt + 30, C.texto, C.destaque === "#e8336d" ? "#e8336d" : C.destaque, C.cor === "creme" ? "#8a817b" : "rgba(128,128,128,.9)");
      if (V.botao) pilula(V.botao, w / 2, y2 + 60, C.pill, C.pillTexto);
      marca(w - 185, h - 180, 150, C.cor === "preto" || V.cor === "preto" ? "#e9e4d8" : null);
    } else if (V.tema === "faixa") {
      pintar(0, 0, w, h);
      const ai = altInfos(), fh = 90 + nl * 92 + ai + (V.botao ? 130 : 30), fy = h - fh - 60;
      ctx.globalAlpha = .95; retArredondado(ctx, 50, fy, w - 100, fh, 48); ctx.fillStyle = C.fundo; ctx.fill(); ctx.globalAlpha = 1;
      const y1 = titulo(fy + 90, C.texto, C.destaque, 84);
      const y2 = y1 + infos(y1, C.texto, C.destaque, "rgba(128,128,128,.9)");
      if (V.botao) pilula(V.botao, w / 2, y2 + 55, C.pill, C.pillTexto, 40);
      marca(w - 200, 60, 150, "#ffffff");
    } else if (V.tema === "dividido") {
      const vh2 = Math.round(h * 0.58); pintar(0, 0, w, vh2);
      ctx.fillStyle = C.fundo; ctx.fillRect(0, vh2, w, h - vh2);
      ctx.fillStyle = C.bola; ctx.beginPath(); ctx.arc(w - 40, h - 40, 200, 0, Math.PI * 2); ctx.fill();
      const y1 = titulo(vh2 + 110, C.texto, C.destaque, 84);
      const y2 = y1 + infos(y1 + 10, C.texto, C.destaque, "rgba(128,128,128,.9)");
      if (V.botao) pilula(V.botao, w / 2, Math.min(y2 + 80, h - 120), C.pill, C.pillTexto, 40);
      marca(w - 190, vh2 - 80, 150, "#ffffff");
    } else if (V.tema === "selo") {
      pintar(0, 0, w, h);
      ctx.save(); ctx.translate(w / 2, 230); ctx.rotate(-0.04);
      const tt = V.titulo.replace(/[*]/g, "").replace(/\s*\n\s*/g, " ");
      ctx.font = "800 64px Poppins"; const tw = Math.min(w - 120, ctx.measureText(tt).width + 110);
      retArredondado(ctx, -tw / 2, -70, tw, 140, 70); ctx.fillStyle = C.fundo; ctx.fill();
      ctx.fillStyle = C.texto; ctx.fillText(quebrarTexto(ctx, tt, tw - 80, 1)[0], 0, 4); ctx.restore();
      if (V.novo) {
        ctx.save(); ctx.translate(w / 2, h - 420); ctx.rotate(0.03);
        ctx.font = "800 84px Poppins"; const t = brl(V.novo), pw = ctx.measureText(t).width + 100;
        retArredondado(ctx, -pw / 2, -75, pw, 150, 40); ctx.fillStyle = "#ffd23f"; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = "#1d1d1f"; ctx.stroke();
        ctx.fillStyle = "#1d1d1f"; ctx.fillText(t, 0, 4); ctx.restore();
      }
      if (V.botao) pilula(V.botao, w / 2, h - 230, C.pill, C.pillTexto);
      marca(w - 200, h - 200, 160, "#ffffff");
    } else { // mínimo: só o selo de preço e a marca
      pintar(0, 0, w, h);
      if (V.novo) {
        const r = 150; ctx.save(); ctx.translate(w - 210, 330); ctx.rotate(-0.15);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = "#ffd23f"; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = "#1d1d1f"; ctx.stroke();
        ctx.fillStyle = "#1d1d1f"; ctx.font = "600 34px Poppins"; ctx.fillText("por", 0, -46);
        ctx.font = "800 62px Poppins"; ctx.fillText(brl(V.novo).replace("R$ ", "R$"), 0, 14); ctx.restore();
      }
      if (V.botao) pilula(V.botao, w / 2, h - 200, C.pill, C.pillTexto, 40);
      marca(50, 60, 150, "#ffffff");
    }
    ctx.restore();
  }
  const vdItem = () => fila().find((i) => i.id === vd().itemId);
  function usarProdutoNoVideo(it) {
    const V = vd(); V.itemId = it ? it.id : null;
    if (it) { V.nome = limparNome(it.nome || ""); V.antigo = it.precoAntigo || null; V.novo = it.precoNovo || null; V.cupom = it.cupom || ""; }
  }
  /** Foto do produto pronta para mandar à IA de vídeo (JPEG), com opção de trocar */
  function blocoFotoIA() {
    const it = vdItem(), img = it && it.imagem;
    return `<div class="vd-foto">
      <span>1. Foto do produto para a IA</span>
      ${img ? `<img src="${esc(img)}" data-original="${esc(img)}" alt="Foto do produto" referrerpolicy="no-referrer">` : '<p class="nota">Este produto está sem foto. Escolha uma da galeria.</p>'}
      <div class="duas">
        ${img ? '<button type="button" class="btn btn--rosa" id="vdFotoEnviar">Enviar à IA</button><button type="button" class="btn btn--branco" id="vdFoto">Salvar foto</button>' : ""}
      </div>
      <label class="link link--foto">${img ? "Usar outra foto" : "Escolher foto"}<input type="file" id="vdFotoNova" accept="image/*" hidden></label>
      <span>2. Copie um prompt e cole na IA junto com a foto</span>
    </div>`;
  }
  async function fotoParaIA() {
    const it = vdItem(); if (!it || !it.imagem) return null;
    const arq = await converterImagem(await arquivoDaImagem(it.imagem));
    return arq ? new File([arq], nomeArquivo(it.nome || "produto"), { type: "image/jpeg" }) : null;
  }
  function telaVideo(c) {
    const V = vd();
    if (wz.passo === "vDados") {
      // Já vem preenchido: o produto escolhido, ou o último da lista
      if (!V.iniciado) { V.iniciado = true; const ini = wzItem() || fila().find((x) => !x.carregando && x.nome); if (ini) usarProdutoNoVideo(ini); }
      const l2 = fila().filter((x) => !x.carregando);
      c.innerHTML = `<h2 class="wz-titulo">O que vai aparecer no vídeo?</h2>
        <p class="nota">Toque num produto da lista ou cole o link: nome, foto e preço já vêm preenchidos.</p>
        <div class="colar"><input id="vdLink" type="url" inputmode="url" placeholder="Cole o link do produto" autocomplete="off"><button type="button" class="colar__btn" id="vdColar">Colar</button></div>
        <div class="wz-ops">${l2.map((x) => `<button type="button" class="wz-prod${V.itemId === x.id ? " on" : ""}" data-vd-item="${esc(x.id)}">${fotoMini(x)}<span><b>${esc(x.nome || "Sem nome")}</b><small>${x.precoNovo ? brl(x.precoNovo) : "sem preço"}</small></span></button>`).join("")}</div>
        <label class="campo"><span>Título</span><textarea id="vdTitulo" rows="2">${esc(V.titulo)}</textarea></label>${chipsTitulos("vdTitulo")}
        <label class="campo"><span>Nome do produto</span><input id="vdNome" value="${esc(V.nome)}" maxlength="80"></label>
        <div class="duas"><label class="campo"><span>Preço antigo</span><input id="vdAntigo" inputmode="decimal" value="${V.antigo ? paraCampo(V.antigo) : ""}" placeholder="opcional"></label><label class="campo"><span>Preço novo</span><input id="vdNovo" inputmode="decimal" value="${V.novo ? paraCampo(V.novo) : ""}"></label></div>
        <label class="campo"><span>Cupom (opcional)</span><input id="vdCupom" value="${esc(V.cupom)}" maxlength="20"></label>
        <label class="campo"><span>Texto do botão</span><input id="vdBotao" value="${esc(V.botao)}" maxlength="40" placeholder="Ex.: Link na bio"></label>
        ${botaoContinuar(true)}`;
      return;
    }
    if (wz.passo === "vArquivo") {
      const nome = V.nome || "o produto";
      c.innerHTML = `<h2 class="wz-titulo">Escolha o vídeo</h2>
        <p class="nota">Pode ser feito na IA ou gravado no celular. Ele vira um vídeo em pé (story e reels) com o tema do Miga. Recomendo até 60 segundos.</p>
        ${V.url ? `<video class="vd-previa" src="${V.url}" muted playsinline controls></video>` : ""}
        <label class="btn ${V.url ? "btn--branco" : "btn--rosa"}">${V.url ? "Trocar o vídeo" : "Escolher vídeo"}<input type="file" id="vdArquivo" accept="video/*" hidden></label>
        ${botaoContinuar(!!V.url)}
        <details class="mais"${V.url ? "" : " open"}><summary>Ainda não tem o vídeo? Prompts prontos para a IA</summary>
          <p class="nota">Use numa IA de vídeo (Veo no Gemini, Sora, Kling, Runway…): anexe a <b>foto do produto</b> e cole o prompt. Depois volte aqui e escolha o vídeo.</p>
          ${blocoFotoIA()}
          ${PROMPTS_VIDEO.map(([t, f], i) => `<div class="vd-prompt"><b>${esc(t)}</b><p>${esc(f(nome))}</p><button type="button" class="btn btn--branco" data-vd-prompt="${i}">Copiar prompt</button></div>`).join("")}
        </details>`;
      return;
    }
    if (wz.passo === "vTema") {
      c.innerHTML = `<h2 class="wz-titulo">Tema do vídeo</h2>
        <div class="wz-miniaturas">${Object.entries(TEMAS_VIDEO).map(([k, t]) => `<button type="button" class="wz-mini${V.tema === k ? " on" : ""}" data-vd-tema="${k}"><canvas width="270" height="480"></canvas><span>${t}</span></button>`).join("")}</div>
        <div class="campo"><span>Cor</span><div class="alternar" id="vdCor">${Object.entries(CORES_VIDEO).map(([k, x]) => `<button type="button" role="radio" data-vd-cor="${k}" aria-checked="${V.cor === k}">${x.nome}</button>`).join("")}</div></div>
        ${botaoContinuar(true)}`;
      pintarTemasVideo();
      return;
    }
    if (wz.passo === "vPronto") {
      const r = V.resultado;
      c.innerHTML = `<h2 class="wz-titulo">${r ? "Vídeo pronto" : "Criar o vídeo"}</h2>
        ${r ? `<video class="vd-previa" src="${r.url}" controls playsinline></video>
          <p class="nota">Formato: <b>${r.mp4 ? "MP4" : "WebM"}</b>.${r.mp4 ? "" : " Este celular não grava MP4: o WhatsApp aceita, mas o Instagram pode recusar WebM."}</p>
          <button type="button" class="btn btn--rosa" id="vdPostar">Postar / compartilhar</button>
          <button type="button" class="btn btn--branco" id="vdBaixar">Baixar o vídeo</button>
          <button type="button" class="btn btn--branco" id="vdRefazer">Gravar de novo</button>`
        : `<div class="wz-previa"><canvas id="vdQuadro" width="540" height="960"></canvas></div>
          <p class="nota">O app toca o vídeo uma vez com o tema por cima e grava ao mesmo tempo: leva o tempo do próprio vídeo. Deixe o app aberto até terminar.</p>
          <div class="vd-progresso" id="vdProgresso" hidden><i></i></div>
          <button type="button" class="btn btn--rosa" id="vdGerar">Criar o vídeo</button>`}
        <button type="button" class="btn btn--branco" id="wzNovo">Criar outra postagem</button>`;
      if (!r) carregarMarca().then(primeiroQuadro).then((v) => quadroVideo($("#vdQuadro").getContext("2d"), 540, 960, v, V));
    }
  }
  function primeiroQuadro() {
    const V = vd();
    if (V.quadro) return Promise.resolve(V.quadro);
    if (!V.url) return Promise.resolve(null);
    return new Promise((ok) => {
      const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.src = V.url;
      v.addEventListener("loadeddata", () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); }, { once: true });
      v.addEventListener("seeked", () => { V.quadro = v; ok(v); }, { once: true });
      v.addEventListener("error", () => ok(null), { once: true });
    });
  }
  async function pintarTemasVideo() {
    await carregarMarca();
    const v = await primeiroQuadro(), V = vd();
    document.querySelectorAll("[data-vd-tema]").forEach((b) => quadroVideo(b.querySelector("canvas").getContext("2d"), 270, 480, v, { ...V, tema: b.dataset.vdTema }));
  }
  async function gravarVideo() {
    const V = vd(), tipo = formatoGravacao();
    if (!tipo || !HTMLCanvasElement.prototype.captureStream) { toast("Este navegador não consegue gravar vídeo. Use o Chrome atualizado."); return; }
    await carregarMarca();
    const btn = $("#vdGerar"); btn.disabled = true; btn.textContent = "Gravando… 0%";
    const barra = $("#vdProgresso"); barra.hidden = false;
    const W = 1080, H = 1920, tela = document.createElement("canvas"); tela.width = W; tela.height = H;
    const ctx = tela.getContext("2d"), previa = $("#vdQuadro").getContext("2d");
    const v = document.createElement("video"); v.src = V.url; v.playsInline = true;
    await new Promise((ok) => v.addEventListener("loadedmetadata", ok, { once: true }));
    const fluxo = tela.captureStream(30);
    let ac = null;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ac.createMediaStreamDestination(); ac.createMediaElementSource(v).connect(dest);
      dest.stream.getAudioTracks().forEach((t) => fluxo.addTrack(t));
    } catch (e) { v.muted = true; }
    const rec = new MediaRecorder(fluxo, { mimeType: tipo, videoBitsPerSecond: 8e6 });
    const partes = []; rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
    const fim = new Promise((ok) => { rec.onstop = ok; });
    let rodando = true;
    const desenhar = () => {
      if (!rodando) return;
      quadroVideo(ctx, W, H, v, V); previa.drawImage(tela, 0, 0, 540, 960);
      const pct = Math.min(100, Math.round((v.currentTime / (v.duration || 1)) * 100));
      btn.textContent = `Gravando… ${pct}%`; barra.querySelector("i").style.width = pct + "%";
      requestAnimationFrame(desenhar);
    };
    quadroVideo(ctx, W, H, v, V);
    rec.start(500);
    try { await v.play(); } catch (e) { v.muted = true; await v.play(); }
    desenhar();
    await new Promise((ok) => v.addEventListener("ended", ok, { once: true }));
    rodando = false; rec.stop(); await fim;
    if (ac) ac.close().catch(() => {});
    const mp4 = tipo.startsWith("video/mp4");
    const blob = new Blob(partes, { type: mp4 ? "video/mp4" : "video/webm" });
    V.resultado = { blob, url: URL.createObjectURL(blob), mp4, nome: `miga-promo-video.${mp4 ? "mp4" : "webm"}` };
    mostrarPasso();
  }
  $("#wzCorpo").addEventListener("click", async (e) => {
    if (wz.canal !== "video") return;
    const t = e.target, V = vd();
    if (t.closest("#vdColar")) {
      let txt = $("#vdLink").value.trim();
      if (!txt) { try { txt = (await navigator.clipboard.readText()).trim(); } catch (err) { $("#vdLink").focus(); toast("Toque e segure no campo para colar"); return; } }
      toast("Buscando o produto…");
      const it = await adicionarNaFila(txt);
      if (it) { usarProdutoNoVideo(it); mostrarPasso(); }
      return;
    }
    const vi = t.closest("[data-vd-item]"); if (vi) { const it = fila().find((x) => x.id === vi.dataset.vdItem); usarProdutoNoVideo(V.itemId === it.id ? null : it); mostrarPasso(); return; }
    const te = t.closest("[data-vd-tema]"); if (te) { V.tema = te.dataset.vdTema; document.querySelectorAll("[data-vd-tema]").forEach((b) => b.classList.toggle("on", b === te)); return; }
    const co = t.closest("[data-vd-cor]"); if (co) { V.cor = co.dataset.vdCor; document.querySelectorAll("[data-vd-cor]").forEach((b) => b.setAttribute("aria-checked", String(b === co))); pintarTemasVideo(); return; }
    const pr = t.closest("[data-vd-prompt]"); if (pr) { if (await copiarTexto(PROMPTS_VIDEO[+pr.dataset.vdPrompt][1](V.nome || "o produto"))) toast("Prompt copiado: cole na IA de vídeo junto com a foto"); return; }
    if (t.closest("#vdFoto")) { const arq = await fotoParaIA(); if (arq) { baixarBlob(arq, arq.name); toast("Foto salva na galeria: anexe na IA de vídeo"); } else toast("Não consegui pegar a foto: use “Usar outra foto”"); return; }
    if (t.closest("#vdFotoEnviar")) {
      const arq = await fotoParaIA();
      if (!arq) { toast("Não consegui pegar a foto: use “Usar outra foto”"); return; }
      const prompt = PROMPTS_VIDEO[0][1](V.nome || "o produto");
      if (navigator.canShare && navigator.canShare({ files: [arq] })) {
        await copiarTexto(prompt);
        try { await navigator.share({ files: [arq], text: prompt }); toast("Escolha o app da IA (Gemini, ChatGPT…). O prompt também ficou copiado"); return; } catch (err) { if (err.name === "AbortError") return; }
      }
      baixarBlob(arq, arq.name); toast("Foto salva: abra a IA e anexe a foto");
      return;
    }
    if (t.closest("#vdGerar")) { gravarVideo(); return; }
    if (t.closest("#vdRefazer")) { V.resultado = null; mostrarPasso(); return; }
    if (t.closest("#vdBaixar")) { baixarBlob(V.resultado.blob, V.resultado.nome); toast("Vídeo salvo"); return; }
    if (t.closest("#vdPostar")) {
      const r = V.resultado, arq = new File([r.blob], r.nome, { type: r.blob.type });
      if (navigator.canShare && navigator.canShare({ files: [arq] })) { try { await navigator.share({ files: [arq] }); return; } catch (err) { if (err.name === "AbortError") return; } }
      baixarBlob(r.blob, r.nome); toast("Vídeo salvo: abra o Instagram ou o WhatsApp e escolha da galeria");
    }
  });
  $("#wzCorpo").addEventListener("input", (e) => {
    if (wz.canal !== "video") return;
    const V = vd(), id = e.target.id, v = e.target.value;
    if (id === "vdTitulo") V.titulo = v;
    if (id === "vdNome") V.nome = v.trim();
    if (id === "vdAntigo") V.antigo = lerPreco(v);
    if (id === "vdNovo") V.novo = lerPreco(v);
    if (id === "vdCupom") V.cupom = v.trim();
    if (id === "vdBotao") V.botao = v.trim();
  });
  $("#wzCorpo").addEventListener("change", async (e) => {
    if (e.target.id === "vdFotoNova") {
      const f = e.target.files && e.target.files[0]; const it = vdItem();
      if (!f) return;
      if (!it) { baixarBlob(f, f.name); toast("Escolha primeiro um produto da lista"); return; }
      try { it.imagem = await compactarArquivo(f); delete ppFotos[it.id]; salvarFila(true); toast("Foto do produto atualizada"); } catch (err) { toast("Não consegui abrir essa foto"); }
      mostrarPasso(); return;
    }
    if (e.target.id !== "vdArquivo") return;
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const V = vd(); if (V.url) URL.revokeObjectURL(V.url);
    V.arquivo = f; V.url = URL.createObjectURL(f); V.quadro = null; V.resultado = null;
    mostrarPasso();
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
    $("#conviteVazio").hidden = opcoes.length > 1;
    $("#conviteCampo").hidden = opcoes.length < 2;
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
    let it = fila().find((x) => x.link === p.link);
    if (!it) {
      it = { id: novoId(), link: p.link, loja: p.loja, nome: p.nome, precoNovo: p.precoNovo, precoAntigo: p.precoAntigo, imagem: item.imagem || "", cupom: p.cupom || "", categoria: p.categoria || "outros", texto: item.texto || "", feito: {}, criadoEm: Date.now(), histId: item.id };
      fila().unshift(it); salvarFila(true);
    }
    iniciarCriar({ itemId: it.id });
    irPara("criar");
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
  function pintarAjustes() {
    $("#ajCupons").innerHTML = (config.cupons || []).length
      ? config.cupons.map((cp) => `<span class="aj-cupom">${esc(cp)}<button type="button" data-aj-tirar="${esc(cp)}" aria-label="Apagar cupom ${esc(cp)}">✕</button></span>`).join("")
      : '<small class="nota">Nenhum cupom salvo ainda.</small>';
    const marcados = lugaresSalvos();
    $("#ajLugares").innerHTML = Object.entries(LUGARES).map(([k, l]) => `<button type="button" data-aj-lugar="${k}" class="${marcados.includes(k) ? "on" : ""}">${esc(l.nome)}</button>`).join("");
    $("#ajOcultar").checked = ocultarComp;
  }
  function abrirConfig() {
    mostrarConta();
    $("#ajInsta").value = config.instagram || "";
    pintarAjustes();
    if (!dialogo.open) dialogo.showModal();
  }
  let ajInstaTimer;
  $("#ajInsta").addEventListener("input", () => {
    clearTimeout(ajInstaTimer);
    ajInstaTimer = setTimeout(() => { config.instagram = arroba($("#ajInsta").value); gravarConfig(); }, 600);
  });
  $("#ajAddCupom").addEventListener("click", () => {
    if (!salvarCupom($("#ajCupom").value)) { toast("Digite o cupom"); $("#ajCupom").focus(); return; }
    $("#ajCupom").value = ""; pintarAjustes(); toast("Cupom salvo");
  });
  $("#ajCupom").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#ajAddCupom").click(); } });
  dialogo.addEventListener("click", (e) => {
    const t = e.target.closest("[data-aj-tirar]");
    if (t) { config.cupons = config.cupons.filter((x) => x !== t.dataset.ajTirar); gravarConfig(); renderCupons(); pintarAjustes(); toast("Cupom apagado"); return; }
    const l = e.target.closest("[data-aj-lugar]");
    if (l) {
      const k = l.dataset.ajLugar; let m = lugaresSalvos();
      m = m.includes(k) ? m.filter((x) => x !== k) : [...m, k];
      if (!m.length) { toast("Deixe pelo menos um lugar marcado"); return; }
      try { localStorage.setItem("miga_lugares", JSON.stringify(m)); } catch (err) { /* segue */ }
      l.classList.toggle("on", m.includes(k));
    }
  });
  $("#ajOcultar").addEventListener("change", (e) => { ocultarComp = e.target.checked; guardarOcultar(); renderFila(); });
  $("#ajAtualizar").addEventListener("click", async () => {
    toast("Atualizando…");
    try { const r = await navigator.serviceWorker?.getRegistrations?.(); for (const x of r || []) await x.unregister(); } catch (e) { /* segue */ }
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) { /* segue */ }
    location.reload();
  });
  $("#abrirConfig").addEventListener("click", abrirConfig);

  $("#sair").addEventListener("click", async () => {
    dialogo.close();
    const ok = await confirmar({
      titulo: "Sair do app?",
      texto: "Na próxima vez, o app vai pedir o código de acesso e o login com Google. Seus dados continuam salvos na nuvem.",
      ok: "Sair"
    });
    if (ok) { if (conta.fb) { try { await conta.fb.auth.signOut(conta.fb.a); } catch (e) { /* segue */ } } bloquear(""); }
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
  const textoRecebido = [q.get("title"), q.get("text"), q.get("url")].filter(Boolean).join(" ");
  if (/https?:\/\//.test(textoRecebido)) { recebidoPendente = textoRecebido; history.replaceState(null, "", location.pathname); }
  iniciarConta();
})();
