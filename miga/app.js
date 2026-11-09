/**
 * Miga Promo — app.js
 * Desenvolvido por Alpama Soluções.
 *
 * Abas: Criar · Histórico · Grupos
 * 1) Cola o link (Mercado Livre/Shopee) → /api/produto traz foto, nome e preço
 * 2) /api/gerar → a IA (Gemini, no servidor) escreve a mensagem
 * 3) A foto recebe a marca d'água Miga Promo no cantinho
 * 4) Envia (com foto, só texto ou para um grupo cadastrado)
 * 5) Tudo fica salvo no Histórico (IndexedDB, só neste aparelho)
 *
 * A chave do Gemini NÃO fica aqui: este arquivo é público.
 */
(function () {
  "use strict";

  /* =========================== Utilidades =========================== */
  const $ = (s) => document.querySelector(s);
  const CH = { senha: "miga_senha", dica: "miga_dica_ios", grupos: "miga_grupos", convite: "miga_convite" };
  const ls = {
    ler(k, padrao = "") { try { const v = localStorage.getItem(k); return v === null ? padrao : v; } catch (e) { return padrao; } },
    gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } },
    lerJson(k, padrao) { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch (e) { return padrao; } },
    gravarJson(k, v) { this.gravar(k, JSON.stringify(v)); }
  };
  const urlOk = (u) => /^https?:\/\//i.test(String(u || "").trim());
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const paraCampo = (n) => (n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const dataCurta = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const NOME_LOJA = { mercadolivre: "Mercado Livre", shopee: "Shopee" };
  const NOME_CAT = { moda: "Moda e Looks", beleza: "Beleza e Skincare", casa: "Casa e Decoração" };

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

  /* =========================== Histórico (IndexedDB) =========================== */
  const historico = (() => {
    let dbPromessa = null;
    function abrir() {
      if (!dbPromessa) {
        dbPromessa = new Promise((ok, erro) => {
          const r = indexedDB.open("miga-promo", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("historico", { keyPath: "id" });
          r.onsuccess = () => ok(r.result);
          r.onerror = () => erro(r.error);
        });
      }
      return dbPromessa;
    }
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
      salvar: (item) => tx("readwrite", (s) => s.put(item)),
      listar: async () => ((await tx("readonly", (s) => s.getAll())) || []).sort((a, b) => b.criadoEm - a.criadoEm),
      pegar: (id) => tx("readonly", (s) => s.get(id)),
      apagar: (id) => tx("readwrite", (s) => s.delete(id)),
      limpar: () => tx("readwrite", (s) => s.clear())
    };
  })();

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

  let foto = { url: "", arquivo: null }; // url da loja OU arquivo da galeria
  const viaServidor = (u) => "/api/imagem?url=" + encodeURIComponent(u);

  function mostrarFoto(src) {
    const img = $("#fotoImg");
    img.hidden = !src;
    $("#fotoVazia").hidden = !!src;
    if (src) { img.referrerPolicy = "no-referrer"; img.src = src; } else img.removeAttribute("src");
  }
  $("#fotoImg").addEventListener("error", () => {
    const img = $("#fotoImg"), src = img.getAttribute("src") || "";
    if (!src) return;
    if (foto.url && !foto.arquivo && !src.startsWith("/api/imagem")) { img.src = viaServidor(foto.url); return; }
    mostrarFoto(""); foto = { url: "", arquivo: null };
    toast("A foto não carregou — use “Trocar foto”");
  });
  function usarFotoUrl(url) { foto = { url: urlOk(url) ? url.trim() : "", arquivo: null }; mostrarFoto(foto.url); }
  $("#arquivo").addEventListener("change", () => {
    const f = $("#arquivo").files[0];
    $("#arquivo").value = "";
    if (!f || !f.type.startsWith("image/")) return;
    foto = { url: URL.createObjectURL(f), arquivo: f };
    mostrarFoto(foto.url);
    toast("Foto trocada");
  });
  c.imagemUrl.addEventListener("change", () => usarFotoUrl(c.imagemUrl.value));

  function atualizarSelo() {
    const a = lerPreco(c.precoAntigo.value), n = lerPreco(c.precoNovo.value);
    const off = a && n && a > n ? Math.round((1 - n / a) * 100) : 0;
    $("#selo").hidden = !off;
    $("#selo").textContent = `-${off}%`;
  }
  c.precoAntigo.addEventListener("input", atualizarSelo);
  c.precoNovo.addEventListener("input", atualizarSelo);

  /* =========================== Marca d'água =========================== */
  let marcaImg = null;
  function carregarMarca() {
    if (!marcaImg) {
      marcaImg = new Promise((ok, erro) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = erro;
        i.src = "marca-dagua.png";
      });
    }
    return marcaImg;
  }
  /** Pega a foto atual como Blob (arquivo da galeria ou baixada pelo nosso servidor) */
  async function blobDaFoto() {
    if (foto.arquivo) return foto.arquivo;
    if (!foto.url) return null;
    const tentativas = /^(blob|data):/.test(foto.url) ? [foto.url] : [viaServidor(foto.url), foto.url];
    for (const u of tentativas) {
      try {
        const r = await fetch(u);
        if (r.ok && (r.headers.get("content-type") || "").startsWith("image/")) return await r.blob();
      } catch (e) { /* tenta a próxima */ }
    }
    return null;
  }
  /** Desenha a foto + selo Miga Promo no canto inferior direito. Devolve um JPEG. */
  async function fotoComMarca() {
    const blob = await blobDaFoto();
    if (!blob) return null;
    const [img, marca] = await Promise.all([createImageBitmap(blob), carregarMarca()]);
    const max = 1080;
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * k), h = Math.round(img.height * k);
    const tela = document.createElement("canvas");
    tela.width = w; tela.height = h;
    const ctx = tela.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const mw = Math.round(Math.min(w, h) * 0.34);
    const mh = Math.round(mw * marca.height / marca.width);
    const margem = Math.round(Math.min(w, h) * 0.03);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(marca, w - mw - margem, h - mh - margem, mw, mh);
    ctx.globalAlpha = 1;
    return new Promise((ok) => tela.toBlob(ok, "image/jpeg", 0.85));
  }

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
      if (d.nome) c.nome.value = d.nome;
      if (d.preco) c.precoNovo.value = paraCampo(d.preco);
      if (d.precoAntigo) c.precoAntigo.value = paraCampo(d.precoAntigo);
      if (d.imagem) { c.imagemUrl.value = d.imagem; usarFotoUrl(d.imagem); }
      atualizarSelo();
      const falta = [!d.imagem && "foto", !d.nome && "nome", !d.preco && "preço"].filter(Boolean);
      aviso($("#avisoBusca"), falta.length ? `Não achei: ${falta.join(", ")}. Completa aí embaixo.` : "Achei tudo. Confere o preço antes de gerar.", !falta.length);
    } catch (e) {
      if (e.codigo === "senha") { abrirConfig(); toast("Coloca a senha do app"); }
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
    casa: "Pra deixar a casa mais aconchegante e com aquele toque especial 🏡"
  };
  function mensagemReserva(p) {
    const onde = p.loja === "shopee" ? "na Shopee" : "no Mercado Livre";
    const preco = p.precoAntigo ? `~de ${brl(p.precoAntigo)}~ por *${brl(p.precoNovo)}*` : `por apenas *${brl(p.precoNovo)}*`;
    const cupom = p.cupom ? `\n🎟️ Usa o cupom *${p.cupom}*` : "";
    return `Miga, olha esse achadinho ${onde}! 🤫💖\n\n✨ *${p.nome}*\n\n💸 ${preco}${cupom}\n\n${FRASES[p.categoria]}\n\n👉 ${p.link}\n\nCorre que promoção boa assim acaba rapidinho! ⏳🌸`;
  }
  function comConvite(texto) {
    const g = grupos.lista().find((x) => x.id === ls.ler(CH.convite));
    if (!g || !g.link || texto.includes(g.link)) return texto;
    return `${texto}\n\n💬 Entre no grupo ${g.nome}: ${g.link}`;
  }

  function coletar() {
    [c.nome, c.precoNovo, c.link].forEach((x) => x.classList.remove("erro"));
    const p = {
      nome: c.nome.value.trim(), precoAntigo: lerPreco(c.precoAntigo.value), precoNovo: lerPreco(c.precoNovo.value),
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

  // Divulgação atual (o que está na tela)
  let atual = null; // { id, criadoEm, produto, texto, imagem: Blob|null, enviadoPara: [] }
  let urlImagemAtual = "";

  function mostrarResultado(avisoMsg) {
    $("#texto").value = atual.texto;
    $("#balaoTexto").innerHTML = formatarWhats(atual.texto);
    if (urlImagemAtual) URL.revokeObjectURL(urlImagemAtual);
    urlImagemAtual = atual.imagem ? URL.createObjectURL(atual.imagem) : "";
    const img = $("#balaoImg");
    img.hidden = !urlImagemAtual;
    if (urlImagemAtual) img.src = urlImagemAtual;
    $("#enviarFoto").hidden = !atual.imagem;
    $("#balaoHora").textContent = new Date(atual.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    aviso($("#avisoIA"), avisoMsg);
    renderGruposEnvio();
    $("#resultado").hidden = false;
    $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function salvarAtual() {
    if (!atual) return;
    try { await historico.salvar(atual); } catch (e) { toast("Não consegui salvar no histórico"); }
    atualizarContadores();
  }
  let salvarTimer;
  $("#texto").addEventListener("input", () => {
    if (!atual) return;
    atual.texto = $("#texto").value;
    $("#balaoTexto").innerHTML = formatarWhats(atual.texto);
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(salvarAtual, 600);
  });

  let ultimoLink = "";
  async function gerar() {
    const p = coletar();
    if (!p) return;
    ocupado(true);
    let texto, avisoMsg = "";
    try {
      texto = (await api("gerar", p)).texto;
    } catch (e) {
      if (e.codigo === "senha") { ocupado(false); abrirConfig(); toast("Coloca a senha do app"); return; }
      const motivo = e.codigo === "sem-chave" ? "a chave da IA ainda não foi configurada" : e.codigo === "offline" ? "o servidor não está disponível aqui" : "a IA não respondeu agora";
      texto = mensagemReserva(p);
      avisoMsg = `Usei uma mensagem pronta porque ${motivo}. Pode editar à vontade.`;
    }
    let imagem = null;
    try { imagem = await fotoComMarca(); } catch (e) { imagem = null; }
    if (!imagem && (foto.url || foto.arquivo)) avisoMsg = (avisoMsg ? avisoMsg + " " : "") + "Não consegui aplicar a marca d'água nesta foto; use “Trocar foto”.";

    // "Gerar outra" do mesmo produto atualiza o mesmo item do histórico
    const mesmo = atual && ultimoLink === p.link;
    atual = {
      id: mesmo ? atual.id : novoId(),
      criadoEm: mesmo ? atual.criadoEm : Date.now(),
      produto: p,
      texto: comConvite(texto),
      imagem,
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
    if (atual.imagem) {
      const arq = new File([atual.imagem], "miga-promo.jpg", { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [arq], text: texto })) {
        try { await navigator.share({ files: [arq], text: texto }); registrarEnvio("WhatsApp (com foto)"); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
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
  const grupos = {
    lista: () => ls.lerJson(CH.grupos, []),
    gravar: (l) => { ls.gravarJson(CH.grupos, l); atualizarContadores(); }
  };
  const linkGrupoOk = (u) => /^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(String(u || "").trim());

  $("#formGrupo").addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = $("#grupoNome").value.trim();
    const link = $("#grupoLink").value.trim();
    if (!nome) { toast("Dá um nome para o grupo"); $("#grupoNome").focus(); return; }
    if (link && !linkGrupoOk(link)) { toast("O link precisa começar com https://chat.whatsapp.com/"); $("#grupoLink").focus(); return; }
    grupos.gravar([...grupos.lista(), { id: novoId(), nome, link }]);
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
    const l = grupos.lista();
    $("#listaGrupos").innerHTML = l.length
      ? l.map((g) => linhaGrupo(g, `<button type="button" class="icone-btn" data-apagar="${esc(g.id)}" aria-label="Apagar ${esc(g.nome)}"><svg><use href="#i-lixo"/></svg></button>`)).join("")
      : '<p class="vazio-lista">Nenhum grupo ainda. Adicione o primeiro acima.</p>';
    const sel = $("#grupoConvite"), conviteAtual = ls.ler(CH.convite);
    sel.innerHTML = '<option value="">Não incluir</option>' + l.filter((g) => g.link).map((g) => `<option value="${esc(g.id)}">${esc(g.nome)}</option>`).join("");
    sel.value = l.some((g) => g.id === conviteAtual && g.link) ? conviteAtual : "";
  }
  $("#listaGrupos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-apagar]");
    if (!b) return;
    const g = grupos.lista().find((x) => x.id === b.dataset.apagar);
    if (g && confirm(`Apagar o grupo “${g.nome}”?`)) {
      grupos.gravar(grupos.lista().filter((x) => x.id !== g.id));
      if (ls.ler(CH.convite) === g.id) ls.gravar(CH.convite, "");
      renderGrupos();
    }
  });
  $("#grupoConvite").addEventListener("change", () => { ls.gravar(CH.convite, $("#grupoConvite").value); toast("Convite atualizado"); });

  // Lista de grupos dentro do resultado (envio)
  function renderGruposEnvio() {
    const l = grupos.lista();
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
    const g = grupos.lista().find((x) => x.id === b.dataset.enviar);
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

  /* =========================== Histórico (tela) =========================== */
  const urlsMiniaturas = [];
  async function renderHistorico() {
    let itens = [];
    try { itens = await historico.listar(); } catch (e) { $("#historico").innerHTML = '<p class="vazio-lista">O histórico não está disponível neste navegador.</p>'; return; }
    const termo = $("#buscaHistorico").value.trim().toLowerCase();
    if (termo) itens = itens.filter((i) => (i.produto.nome || "").toLowerCase().includes(termo));
    urlsMiniaturas.splice(0).forEach((u) => URL.revokeObjectURL(u));
    $("#apagarTudo").hidden = !itens.length && !termo;
    if (!itens.length) {
      $("#historico").innerHTML = `<p class="vazio-lista">${termo ? "Nada encontrado." : "Tudo que você gerar aparece aqui."}</p>`;
      return;
    }
    $("#historico").innerHTML = itens.map((i) => {
      let mini = '<span class="sem-foto"><svg><use href="#i-foto"/></svg></span>';
      if (i.imagem) { const u = URL.createObjectURL(i.imagem); urlsMiniaturas.push(u); mini = `<img src="${u}" alt="">`; }
      const p = i.produto;
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
    const item = await historico.pegar(id);
    if (!item) return;
    if (b.dataset.apagar) {
      if (!confirm(`Apagar “${item.produto.nome}” do histórico?`)) return;
      await historico.apagar(id);
      if (atual && atual.id === id) { atual = null; $("#resultado").hidden = true; }
      renderHistorico(); atualizarContadores(); toast("Apagado do histórico");
    } else if (b.dataset.copiar) {
      toast((await copiarTexto(item.texto)) ? "Texto copiado" : "Não consegui copiar");
    } else {
      abrirDoHistorico(item);
    }
  });
  $("#apagarTudo").addEventListener("click", async () => {
    if (!confirm("Apagar TODO o histórico deste aparelho? Isso não pode ser desfeito.")) return;
    await historico.limpar();
    atual = null; $("#resultado").hidden = true;
    renderHistorico(); atualizarContadores(); toast("Histórico apagado");
  });

  function abrirDoHistorico(item) {
    const p = item.produto;
    c.link.value = p.link; c.nome.value = p.nome;
    c.precoNovo.value = paraCampo(p.precoNovo); c.precoAntigo.value = paraCampo(p.precoAntigo);
    c.cupom.value = p.cupom || "";
    loja.marcar(p.loja); categoria.marcar(p.categoria);
    foto = item.imagem ? { url: URL.createObjectURL(item.imagem), arquivo: item.imagem } : { url: "", arquivo: null };
    mostrarFoto(foto.url);
    atualizarSelo();
    atual = item; ultimoLink = p.link;
    irPara("criar");
    mostrarResultado("");
  }

  async function atualizarContadores() {
    const g = grupos.lista().length;
    $("#contGrupos").hidden = !g; $("#contGrupos").textContent = g;
    let n = 0;
    try { n = (await historico.listar()).length; } catch (e) { n = 0; }
    $("#contHistorico").hidden = !n; $("#contHistorico").textContent = n;
  }

  /* =========================== Configurações =========================== */
  const dialogo = $("#config");
  function abrirConfig() {
    $("#senha").value = ls.ler(CH.senha);
    api("status").then((s) => {
      $("#status").textContent = s.ia ? "IA conectada" : "IA ainda não configurada no servidor";
      $("#status").className = "status " + (s.ia ? "ok" : "off");
    }).catch(() => { $("#status").textContent = "Servidor indisponível (modo offline)"; $("#status").className = "status off"; });
    if (!dialogo.open) dialogo.showModal();
  }
  $("#abrirConfig").addEventListener("click", abrirConfig);
  dialogo.addEventListener("close", () => {
    if (dialogo.returnValue === "salvar") { ls.gravar(CH.senha, $("#senha").value); toast("Senha salva neste aparelho"); }
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
  // Pede ao navegador para não apagar o histórico sozinho
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  /* =========================== Início =========================== */
  const q = new URLSearchParams(location.search);
  const recebido = [q.get("url"), q.get("text"), q.get("title")].filter(Boolean).join(" ").match(/https?:\/\/\S+/);
  if (recebido) {
    c.link.value = recebido[0];
    c.link.dispatchEvent(new Event("input"));
    history.replaceState(null, "", location.pathname);
    buscar();
  }
  carregarMarca().catch(() => {});
  atualizarContadores();
})();
