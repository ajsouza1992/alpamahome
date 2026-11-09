(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const CH_SENHA = "promo_senha", CH_HIST = "promo_historico";
  const ls = {
    get(k, padrao) { try { const v = localStorage.getItem(k); return v === null ? padrao : JSON.parse(v); } catch (e) { return padrao; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } }
  };
  const brl = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const urlOk = (u) => /^https?:\/\//i.test(String(u || "").trim());

  function lerPreco(txt) {
    let s = String(txt || "").replace(/[^\d.,]/g, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  const fmtCampo = (n) => (n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2800);
  }

  // ---------- Comunicação com o servidor ----------
  async function api(caminho, corpo) {
    const r = await fetch("/api/" + caminho, {
      method: corpo ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-app-senha": ls.get(CH_SENHA, "") },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { abrirConfig("Digite a senha de acesso do app."); throw Object.assign(new Error(d.erro || "Senha inválida"), { codigo: "senha" }); }
    if (!r.ok) throw Object.assign(new Error(d.erro || "Erro " + r.status), { codigo: d.codigo || "erro", status: r.status });
    return d;
  }

  let iaDisponivel = false;
  api("status").then((s) => {
    iaDisponivel = !!s.ia;
    $("#statusIA").textContent = s.ia ? "IA conectada" : "IA não configurada — usando modelos prontos";
    $("#statusIA").className = "status " + (s.ia ? "ok" : "off");
  }).catch(() => {
    $("#statusIA").textContent = "servidor indisponível — modo offline";
    $("#statusIA").className = "status off";
  });

  // ---------- Configurações ----------
  const dlg = $("#config");
  function abrirConfig(msg) {
    $("#senha").value = ls.get(CH_SENHA, "");
    if (msg) toast(msg);
    if (dlg.showModal && !dlg.open) dlg.showModal();
  }
  $("#abrirConfig").addEventListener("click", () => abrirConfig());
  dlg.addEventListener("close", () => {
    if (dlg.returnValue === "salvar") { ls.set(CH_SENHA, $("#senha").value); toast("Senha salva ✓"); }
  });

  // ---------- 1. Link ----------
  const campos = { link: $("#link"), nome: $("#nome"), preco: $("#preco"), precoAntigo: $("#precoAntigo"), cupom: $("#cupom"), imagem: $("#imagem"), extra: $("#extra") };

  $("#colar").addEventListener("click", async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      const m = t.match(/https?:\/\/\S+/);
      campos.link.value = m ? m[0] : t;
      if (m) buscar();
    } catch (e) {
      campos.link.focus();
      toast("Toque e segure no campo para colar.");
    }
  });
  campos.link.addEventListener("paste", () => setTimeout(() => { if (urlOk(campos.link.value)) buscar(); }, 50));

  function mostrarImagem(url) {
    const box = $("#prodImg");
    box.innerHTML = urlOk(url) ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer">` : "<span>sem foto</span>";
    const img = box.querySelector("img");
    if (img) img.onerror = () => { box.innerHTML = "<span>sem foto</span>"; };
  }
  campos.imagem.addEventListener("input", () => mostrarImagem(campos.imagem.value));

  function aviso(el, msg, ok) {
    el.textContent = msg || "";
    el.hidden = !msg;
    el.classList.toggle("ok", !!ok);
  }

  async function buscar() {
    const link = campos.link.value.trim();
    if (!urlOk(link)) { toast("Cole um link começando com https://"); return; }
    const b = $("#buscar");
    b.disabled = true;
    b.textContent = "Buscando…";
    aviso($("#avisoBusca"), "");
    try {
      const d = await api("produto", { url: link });
      if (d.nome) campos.nome.value = d.nome;
      if (d.preco) campos.preco.value = fmtCampo(d.preco);
      campos.precoAntigo.value = fmtCampo(d.precoAntigo);
      if (d.imagem) { campos.imagem.value = d.imagem; mostrarImagem(d.imagem); }
      aviso($("#avisoBusca"), d.completo ? "Dados encontrados ✓ Confira o preço antes de gerar." : "Encontrei só parte dos dados. Complete os campos abaixo.", d.completo);
    } catch (e) {
      if (e.codigo !== "senha") aviso($("#avisoBusca"), "Não consegui ler o produto (" + e.message + "). Preencha nome e preço manualmente.");
    } finally {
      b.disabled = false;
      b.textContent = "Buscar dados do produto";
    }
  }
  $("#buscar").addEventListener("click", buscar);

  // ---------- 3. Estilo ----------
  let tom = "urgente";
  $("#tons").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tom]");
    if (!b) return;
    tom = b.dataset.tom;
    $("#tons").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  });

  // Modelos prontos (usados quando a IA não está disponível)
  function modeloPronto(p) {
    const off = p.precoAntigo ? Math.round((1 - p.preco / p.precoAntigo) * 100) : 0;
    const preco = p.precoAntigo ? `~de ${brl(p.precoAntigo)}~ por *${brl(p.preco)}*` : `por apenas *${brl(p.preco)}*`;
    const cupom = p.cupom ? `\n🎟️ Use o cupom: *${p.cupom}*` : "";
    const extra = p.extra ? `\n✨ ${p.extra}` : "";
    const aberturas = {
      urgente: [off ? `🔥 *CORRE! ${off}% OFF* 🔥` : "🔥 *ACHADO DO DIA* 🔥", "🚨 *PREÇO BAIXOU!* 🚨", "⚡ *OFERTA RELÂMPAGO* ⚡"],
      divertido: ["😱 *Seu carrinho vai agradecer!*", "🤑 *Promoção que dá até vontade de dançar*", "🛒 *Olha o que eu achei pra você!*"],
      elegante: ["✨ *Seleção especial para sua casa*", "🌿 *Um achado com estilo*", "🏡 *Conforto com preço especial*"],
      curto: ["🔥 *Oferta!*", "⚡ *Achado!*", "🏷️ *Promo!*"]
    }[p.tom] || [];
    const abre = aberturas[Math.floor(Math.random() * aberturas.length)] || "🔥 *OFERTA*";
    const fecha = { urgente: "⏳ Pode acabar a qualquer momento!", divertido: "Depois não diz que eu não avisei 😉", elegante: "Aproveite enquanto está disponível.", curto: "" }[p.tom] || "";
    if (p.tom === "curto") return `${abre} *${p.nome}*\n${preco}${cupom}\n👉 ${p.link}`;
    return `${abre}\n\n🛍️ *${p.nome}*\n\n💰 ${preco}${cupom}${extra}\n\n👉 ${p.link}\n\n${fecha}`.trim();
  }

  function produtoDoForm() {
    const p = {
      nome: campos.nome.value.trim(),
      preco: lerPreco(campos.preco.value),
      precoAntigo: lerPreco(campos.precoAntigo.value),
      cupom: campos.cupom.value.trim(),
      extra: campos.extra.value.trim(),
      link: campos.link.value.trim(),
      imagem: campos.imagem.value.trim(),
      tom
    };
    if (p.precoAntigo && p.preco && p.precoAntigo <= p.preco) p.precoAntigo = null;
    return p;
  }

  // ---------- Geração ----------
  let atual = null; // { produto, texto }
  async function gerar() {
    const p = produtoDoForm();
    if (!urlOk(p.link)) { toast("Cole o link de afiliado no passo 1"); campos.link.focus(); return; }
    if (!p.nome) { toast("Preencha o nome do produto"); campos.nome.focus(); return; }
    if (!p.preco) { toast("Preencha o preço"); campos.preco.focus(); return; }

    const botoes = [$("#gerar"), $("#outra")];
    botoes.forEach((b) => { b.disabled = true; });
    $("#gerar").textContent = "Gerando…";
    let texto, avisoMsg = "";
    try {
      if (!iaDisponivel) throw Object.assign(new Error("IA não configurada"), { codigo: "sem-chave" });
      texto = (await api("gerar", p)).texto;
    } catch (e) {
      if (e.codigo === "senha") { botoes.forEach((b) => { b.disabled = false; }); $("#gerar").textContent = "Gerar mensagem com IA"; return; }
      texto = modeloPronto(p);
      avisoMsg = e.codigo === "sem-chave" ? "Mensagem feita com modelo pronto (a IA ainda não está configurada)." : "A IA não respondeu agora; usei um modelo pronto. Tente “Gerar outra”.";
    }
    botoes.forEach((b) => { b.disabled = false; });
    $("#gerar").textContent = "Gerar mensagem com IA";
    aviso($("#avisoIA"), avisoMsg);
    mostrarResultado(p, texto);
    salvarHistorico(p, texto);
  }
  $("#gerar").addEventListener("click", gerar);
  $("#outra").addEventListener("click", gerar);

  // Formatação do WhatsApp para a pré-visualização
  function formatarWhats(t) {
    return esc(t)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<strong>$2</strong>")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])~([^~\n]+)~/g, "$1<s>$2</s>");
  }
  function mostrarResultado(p, texto) {
    atual = { produto: p, texto };
    $("#texto").value = texto;
    $("#balaoTexto").innerHTML = formatarWhats(texto);
    const img = $("#balaoImg");
    img.hidden = !urlOk(p.imagem);
    if (urlOk(p.imagem)) { img.src = p.imagem; img.referrerPolicy = "no-referrer"; img.onerror = () => { img.hidden = true; }; }
    $("#balaoHora").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    $("#blocoResultado").hidden = false;
    $("#blocoResultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#texto").addEventListener("input", () => {
    if (!atual) return;
    atual.texto = $("#texto").value;
    $("#balaoTexto").innerHTML = formatarWhats(atual.texto);
  });

  // ---------- Saída ----------
  $("#copiar").addEventListener("click", async () => {
    if (!atual) return;
    try { await navigator.clipboard.writeText(atual.texto); toast("Copiado ✓ Agora é só colar no grupo"); }
    catch (e) { $("#texto").closest("details").open = true; $("#texto").select(); toast("Selecionei o texto: copie manualmente"); }
  });
  $("#whats").addEventListener("click", () => {
    if (!atual) return;
    window.open("https://wa.me/?text=" + encodeURIComponent(atual.texto), "_blank", "noopener");
  });
  $("#compartilhar").addEventListener("click", async () => {
    if (!atual) return;
    const dados = { text: atual.texto };
    // Tenta incluir a foto do produto como arquivo (Android/iOS recentes)
    if (urlOk(atual.produto.imagem) && navigator.canShare) {
      try {
        const r = await fetch("/api/imagem?url=" + encodeURIComponent(atual.produto.imagem));
        if (r.ok) {
          const blob = await r.blob();
          const arq = new File([blob], "produto." + (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg"), { type: blob.type });
          if (navigator.canShare({ files: [arq], text: atual.texto })) dados.files = [arq];
        }
      } catch (e) { /* segue só com texto */ }
    }
    if (navigator.share) {
      try { await navigator.share(dados); } catch (e) { /* cancelado */ }
    } else {
      $("#copiar").click();
    }
  });

  // ---------- Histórico ----------
  function salvarHistorico(p, texto) {
    const h = ls.get(CH_HIST, []).filter((x) => x.p.link !== p.link);
    h.unshift({ p, texto, t: Date.now() });
    ls.set(CH_HIST, h.slice(0, 30));
    renderHistorico();
  }
  function renderHistorico() {
    const h = ls.get(CH_HIST, []);
    $("#blocoHistorico").hidden = !h.length;
    $("#historico").innerHTML = h.map((x, i) => `
      <button class="hist" type="button" data-i="${i}">
        ${urlOk(x.p.imagem) ? `<img src="${esc(x.p.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="sem">sem foto</span>'}
        <div><strong>${esc(x.p.nome)}</strong><span>${brl(x.p.preco)} · ${new Date(x.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div>
      </button>`).join("");
  }
  $("#historico").addEventListener("click", (e) => {
    const b = e.target.closest(".hist");
    if (!b) return;
    const x = ls.get(CH_HIST, [])[b.dataset.i];
    if (!x) return;
    campos.link.value = x.p.link;
    campos.nome.value = x.p.nome;
    campos.preco.value = fmtCampo(x.p.preco);
    campos.precoAntigo.value = fmtCampo(x.p.precoAntigo);
    campos.cupom.value = x.p.cupom || "";
    campos.extra.value = x.p.extra || "";
    campos.imagem.value = x.p.imagem || "";
    mostrarImagem(x.p.imagem);
    aviso($("#avisoIA"), "");
    mostrarResultado(x.p, x.texto);
  });
  $("#limparHist").addEventListener("click", () => {
    if (confirm("Apagar o histórico deste aparelho?")) { ls.set(CH_HIST, []); renderHistorico(); }
  });
  renderHistorico();

  // Link recebido pelo "Compartilhar" do celular (Web Share Target)
  const q = new URLSearchParams(location.search);
  const recebido = [q.get("url"), q.get("text"), q.get("title")].filter(Boolean).join(" ").match(/https?:\/\/\S+/);
  if (recebido) {
    campos.link.value = recebido[0];
    history.replaceState(null, "", location.pathname);
    buscar();
  }

  // ---------- PWA ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
