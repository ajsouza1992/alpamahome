/**
 * Miga Promo — app.js
 * Desenvolvido por Alpama Soluções.
 *
 * 1) Cola o link (Mercado Livre ou Shopee) → /api/produto busca foto, nome e preço
 * 2) Confere/edita os dados, escolhe a categoria
 * 3) /api/gerar → a IA (Gemini, no servidor) escreve a mensagem
 * 4) Envia com foto (Web Share API), copia ou abre o WhatsApp
 *
 * A chave do Gemini NÃO fica aqui: este arquivo é público.
 */
(function () {
  "use strict";

  /* =========================== Utilidades =========================== */
  const $ = (s) => document.querySelector(s);
  const CHAVE_SENHA = "miga_senha";
  const CHAVE_DICA = "miga_dica_ios";
  const guardar = {
    ler(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
    gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } }
  };
  const urlOk = (u) => /^https?:\/\//i.test(String(u || "").trim());
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const paraCampo = (n) => (n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

  /** "1.299,90", "R$ 49,9" ou "49.90" → número */
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
    const r = await fetch("/api/" + caminho, {
      method: corpo ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-app-senha": guardar.ler(CHAVE_SENHA) },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.erro || "Erro " + r.status), { codigo: d.codigo || (r.status === 404 ? "offline" : "erro") });
    return d;
  }

  /* =========================== Seletores (loja/categoria) =========================== */
  function grupo(sel, attr, aoMudar) {
    const raiz = $(sel);
    const marcar = (v) => {
      raiz.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset[attr] === v)));
      if (aoMudar) aoMudar(v);
    };
    raiz.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) marcar(b.dataset[attr]); });
    return { marcar, valor: () => raiz.querySelector('[aria-checked="true"]').dataset[attr] };
  }
  const loja = grupo("#lojas", "loja");
  const categoria = grupo("#categorias", "cat");

  function detectarLoja(url) {
    const u = String(url).toLowerCase();
    if (/shopee|shope\.ee|shp\.ee/.test(u)) return "shopee";
    if (/mercadoli[vb]re|mercadolibre|meli\.la/.test(u)) return "mercadolivre";
    return null;
  }

  /* =========================== Campos =========================== */
  const c = {
    link: $("#link"), nome: $("#nome"), precoAntigo: $("#precoAntigo"), precoNovo: $("#precoNovo"),
    cupom: $("#cupom"), imagemUrl: $("#imagemUrl")
  };

  // Foto: pode vir da loja (URL) ou da galeria (arquivo)
  let foto = { url: "", arquivo: null };
  function mostrarFoto(src) {
    const img = $("#fotoImg");
    img.hidden = !src;
    $("#fotoVazia").hidden = !!src;
    if (src) {
      img.referrerPolicy = "no-referrer";
      img.src = src;
    } else img.removeAttribute("src");
  }
  // Se a loja bloquear a imagem direta, tenta pelo nosso servidor (/api/imagem)
  const viaServidor = (u) => "/api/imagem?url=" + encodeURIComponent(u);
  function comReserva(img) {
    img.addEventListener("error", () => {
      const src = img.getAttribute("src") || "";
      if (!src) return;
      if (foto.url && !foto.arquivo && !src.startsWith("/api/imagem")) { img.src = viaServidor(foto.url); return; }
      if (img.id === "fotoImg") {
        mostrarFoto("");
        foto = { url: "", arquivo: null };
        toast("A foto não carregou — use “Trocar foto”");
      } else img.hidden = true;
    });
  }
  comReserva($("#fotoImg"));
  comReserva($("#balaoImg"));
  function usarFotoUrl(url) {
    foto = { url: urlOk(url) ? url.trim() : "", arquivo: null };
    mostrarFoto(foto.url);
  }
  $("#arquivo").addEventListener("change", () => {
    const f = $("#arquivo").files[0];
    $("#arquivo").value = "";
    if (!f || !f.type.startsWith("image/")) return;
    foto = { url: URL.createObjectURL(f), arquivo: f };
    mostrarFoto(foto.url);
    toast("Foto trocada 💖");
  });
  c.imagemUrl.addEventListener("change", () => usarFotoUrl(c.imagemUrl.value));

  // Selo de desconto calculado na hora
  function atualizarSelo() {
    const a = lerPreco(c.precoAntigo.value), n = lerPreco(c.precoNovo.value);
    const off = a && n && a > n ? Math.round((1 - n / a) * 100) : 0;
    $("#selo").hidden = !off;
    $("#selo").textContent = `-${off}%`;
  }
  c.precoAntigo.addEventListener("input", atualizarSelo);
  c.precoNovo.addEventListener("input", atualizarSelo);

  /* =========================== 1. Buscar produto =========================== */
  c.link.addEventListener("input", () => { const l = detectarLoja(c.link.value); if (l) loja.marcar(l); });
  c.link.addEventListener("paste", () => setTimeout(() => { if (urlOk(c.link.value)) buscar(); }, 60));

  $("#colar").addEventListener("click", async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      const m = t.match(/https?:\/\/\S+/);
      c.link.value = m ? m[0] : t;
      c.link.dispatchEvent(new Event("input"));
      if (m) buscar();
    } catch (e) {
      c.link.focus();
      toast("Toque e segure no campo para colar");
    }
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
      if (d.nome) c.nome.value = d.nome;
      if (d.preco) c.precoNovo.value = paraCampo(d.preco);
      if (d.precoAntigo) c.precoAntigo.value = paraCampo(d.precoAntigo);
      if (d.imagem) { c.imagemUrl.value = d.imagem; usarFotoUrl(d.imagem); }
      atualizarSelo();
      const faltando = [!d.imagem && "foto", !d.nome && "nome", !d.preco && "preço"].filter(Boolean);
      aviso($("#avisoBusca"), faltando.length ? `Não achei: ${faltando.join(", ")}. Completa aí embaixo, miga.` : "Achei tudo ✓ Confere o preço antes de gerar.", !faltando.length);
    } catch (e) {
      if (e.codigo === "senha") { abrirConfig(); toast("Coloca a senha do app"); }
      else aviso($("#avisoBusca"), e.codigo === "offline" ? "Busca automática indisponível aqui. Preenche os dados e use “Trocar foto”." : `Não consegui ler o produto (${e.message}). Preenche à mão e use “Trocar foto”.`);
    } finally {
      b.disabled = false;
      b.querySelector(".rotulo").textContent = "Buscar foto, nome e preço";
    }
  }
  $("#buscar").addEventListener("click", buscar);

  /* =========================== 2. Gerar mensagem =========================== */
  const FRASES = {
    moda: "Esse vai deixar seu look lindo e confortável, do jeitinho que a gente ama 👗",
    beleza: "Pra rotina de autocuidado ficar ainda mais gostosinha 💄",
    casa: "Pra deixar a casa mais aconchegante e com aquele toque especial 🏡"
  };
  function mensagemReserva(p) {
    const onde = p.loja === "shopee" ? "na Shopee" : "no Mercado Livre";
    const preco = p.precoAntigo ? `~de ${brl(p.precoAntigo)}~ por *${brl(p.precoNovo)}*` : `por apenas *${brl(p.precoNovo)}*`;
    const cupom = p.cupom ? `\n🎟️ Usa o cupom *${p.cupom}*` : "";
    return `Miga, olha esse achadinho ${onde}! 🤫💖\n\n✨ *${p.nome}*\n\n💸 ${preco}${cupom}\n\n${FRASES[p.categoria]}\n\n👉 ${p.link}\n\nCorre que promoção boa assim acaba rapidinho! ⏳🌸`;
  }

  function coletar() {
    [c.nome, c.precoNovo, c.link].forEach((x) => x.classList.remove("erro"));
    const p = {
      nome: c.nome.value.trim(),
      precoAntigo: lerPreco(c.precoAntigo.value),
      precoNovo: lerPreco(c.precoNovo.value),
      link: c.link.value.trim(),
      categoria: categoria.valor(),
      loja: loja.valor(),
      cupom: c.cupom.value.trim()
    };
    const falhas = [];
    if (!urlOk(p.link)) falhas.push([c.link, "Cola o link de afiliado lá em cima"]);
    if (!p.nome) falhas.push([c.nome, "Coloca o nome do produto 💕"]);
    if (!p.precoNovo) falhas.push([c.precoNovo, "Coloca o preço “Por”"]);
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
    b.querySelector(".rotulo").textContent = sim ? "Gerando..." : "Gerar Miga Promo ✨";
  }

  function formatarWhats(t) {
    return esc(t)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<strong>$2</strong>")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])~([^~\n]+)~/g, "$1<s>$2</s>");
  }
  function mostrarResultado(texto, avisoMsg) {
    $("#texto").value = texto;
    $("#balaoTexto").innerHTML = formatarWhats(texto);
    const img = $("#balaoImg");
    img.hidden = !foto.url;
    if (foto.url) { img.referrerPolicy = "no-referrer"; img.src = foto.url; }
    $("#balaoHora").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    $("#enviarFoto").hidden = !foto.url;
    aviso($("#avisoIA"), avisoMsg);
    $("#resultado").hidden = false;
    $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#texto").addEventListener("input", () => { $("#balaoTexto").innerHTML = formatarWhats($("#texto").value); });

  async function gerar() {
    const p = coletar();
    if (!p) return;
    ocupado(true);
    try {
      const r = await api("gerar", p);
      mostrarResultado(r.texto);
    } catch (e) {
      if (e.codigo === "senha") { abrirConfig(); toast("Coloca a senha do app"); }
      else {
        const motivo = e.codigo === "sem-chave" ? "a chave da IA ainda não foi configurada" : e.codigo === "offline" ? "o servidor não está disponível aqui" : "a IA não respondeu agora";
        mostrarResultado(mensagemReserva(p), `Usei uma mensagem pronta porque ${motivo}. Pode editar à vontade.`);
      }
    } finally {
      ocupado(false);
    }
  }
  $("#gerar").addEventListener("click", gerar);
  $("#refazer").addEventListener("click", gerar);

  /* =========================== 3. Enviar =========================== */
  const textoAtual = () => $("#texto").value;

  async function arquivoDaFoto() {
    if (foto.arquivo) return foto.arquivo;
    if (!foto.url) return null;
    try {
      const r = await fetch("/api/imagem?url=" + encodeURIComponent(foto.url));
      if (!r.ok) return null;
      const blob = await r.blob();
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg").replace("webp", "webp");
      return new File([blob], "achadinho." + ext, { type: blob.type });
    } catch (e) { return null; }
  }

  function abrirWhatsApp(texto) {
    window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(texto), "_blank", "noopener");
  }

  $("#enviarFoto").addEventListener("click", async () => {
    const texto = textoAtual();
    const arq = await arquivoDaFoto();
    if (arq && navigator.canShare && navigator.canShare({ files: [arq], text: texto })) {
      try { await navigator.share({ files: [arq], text: texto }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    if (navigator.share) {
      try { await navigator.share({ text: texto }); toast("Este aparelho não envia foto junto — mandei só o texto"); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    abrirWhatsApp(texto);
  });

  $("#whats").addEventListener("click", async () => {
    const texto = textoAtual();
    if (navigator.share) {
      try { await navigator.share({ text: texto }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    abrirWhatsApp(texto);
  });

  $("#copiar").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(textoAtual()); }
    catch (e) { $("#texto").closest("details").open = true; $("#texto").select(); document.execCommand && document.execCommand("copy"); }
    toast("Texto copiado! 💖");
  });

  /* =========================== Configurações =========================== */
  const dialogo = $("#config");
  function abrirConfig() {
    $("#senha").value = guardar.ler(CHAVE_SENHA);
    api("status").then((s) => {
      $("#status").textContent = s.ia ? "✓ IA conectada" : "IA ainda não configurada no servidor";
      $("#status").className = "status " + (s.ia ? "ok" : "off");
    }).catch(() => {
      $("#status").textContent = "Servidor indisponível (modo offline)";
      $("#status").className = "status off";
    });
    if (!dialogo.open) dialogo.showModal();
  }
  $("#abrirConfig").addEventListener("click", abrirConfig);
  dialogo.addEventListener("close", () => {
    if (dialogo.returnValue === "salvar") { guardar.gravar(CHAVE_SENHA, $("#senha").value); toast("Senha salva neste aparelho ✓"); }
  });

  /* =========================== Instalar o app (PWA) =========================== */
  const instalado = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  let pedidoInstalacao = null;

  // Android / Chrome / Edge: o navegador avisa que dá para instalar
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pedidoInstalacao = e;
    $("#instalar").hidden = false;
  });
  $("#instalar").addEventListener("click", async () => {
    if (!pedidoInstalacao) return;
    pedidoInstalacao.prompt();
    const escolha = await pedidoInstalacao.userChoice.catch(() => ({}));
    if (escolha.outcome === "accepted") toast("Miga Promo instalado 💖");
    pedidoInstalacao = null;
    $("#instalar").hidden = true;
  });
  window.addEventListener("appinstalled", () => { $("#instalar").hidden = true; });

  // iPhone/iPad: não existe botão automático — mostramos a dica
  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ehIOS && !instalado && !guardar.ler(CHAVE_DICA)) $("#dicaIos").hidden = false;
  $("#fecharDica").addEventListener("click", () => { $("#dicaIos").hidden = true; guardar.gravar(CHAVE_DICA, "1"); });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // Link recebido pelo "Compartilhar" do celular (app instalado no Android)
  const q = new URLSearchParams(location.search);
  const recebido = [q.get("url"), q.get("text"), q.get("title")].filter(Boolean).join(" ").match(/https?:\/\/\S+/);
  if (recebido) {
    c.link.value = recebido[0];
    c.link.dispatchEvent(new Event("input"));
    history.replaceState(null, "", location.pathname);
    buscar();
  }
})();
