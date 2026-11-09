/**
 * Miga Promo — app.js
 * Desenvolvido por Alpama Soluções.
 *
 * Fluxo: formulário → POST /api/gerar (servidor chama o Gemini) → texto na tela
 *        → Copiar / Compartilhar no WhatsApp.
 *
 * Segurança: a chave do Gemini NÃO fica neste arquivo (ele é público).
 * Ela fica na variável GEMINI_API_KEY do Cloudflare e é usada só pelo
 * servidor em functions/api/gerar.js.
 */
(function () {
  "use strict";

  /* ---------- Utilidades ---------- */
  const $ = (s) => document.querySelector(s);
  const CHAVE_SENHA = "miga_senha";

  const armazenamento = {
    ler(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
    gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* modo privado: ignora */ } }
  };

  /** Converte "1.299,90", "R$ 49,9" ou "49.90" em número */
  function lerPreco(txt) {
    let s = String(txt || "").replace(/[^\d.,]/g, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  const brl = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  /* ---------- Comunicação com o servidor ---------- */
  async function chamarApi(caminho, corpo) {
    const r = await fetch("/api/" + caminho, {
      method: corpo ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-app-senha": armazenamento.ler(CHAVE_SENHA) },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(dados.erro || "Erro " + r.status), { codigo: dados.codigo || "rede", status: r.status });
    return dados;
  }

  /* ---------- Mensagem reserva (se a IA estiver fora do ar) ---------- */
  const FRASES = {
    moda: "Esse vai deixar seu look lindo e confortável, do jeitinho que a gente ama 👗",
    beleza: "Pra rotina de autocuidado ficar ainda mais gostosinha e a pele agradecer 💄",
    casa: "Pra deixar a casa mais aconchegante e com aquele toque especial 🏡"
  };
  function mensagemReserva(p) {
    const preco = p.precoAntigo ? `~de ${brl(p.precoAntigo)}~ por *${brl(p.precoNovo)}*` : `por apenas *${brl(p.precoNovo)}*`;
    const cupom = p.cupom ? `\n🎟️ Usa o cupom *${p.cupom}*` : "";
    const ondeComprar = p.loja === "shopee" ? "na Shopee" : "no Mercado Livre";
    return `Miga, olha esse achadinho ${ondeComprar}! 🤫💖\n\n✨ *${p.nome}*\n\n💸 ${preco}${cupom}\n\n${FRASES[p.categoria] || ""}\n\n👉 ${p.link}\n\nCorre que promoção boa assim acaba rapidinho! ⏳🌸`;
  }

  /* ---------- Formulário ---------- */
  const campos = {
    nome: $("#nome"), precoAntigo: $("#precoAntigo"), precoNovo: $("#precoNovo"),
    link: $("#link"), categoria: $("#categoria"), cupom: $("#cupom")
  };
  const botaoGerar = $("#gerar");

  /* ---------- Loja: detectada automaticamente pelo link ---------- */
  let loja = "mercadolivre";
  function marcarLoja(id) {
    loja = id;
    document.querySelectorAll("#lojas button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.loja === id)));
  }
  function detectarLoja(url) {
    const u = String(url).toLowerCase();
    if (/shopee|shp\.ee/.test(u)) return "shopee";
    if (/mercadoli[vb]re|meli\.la|mlstatic/.test(u)) return "mercadolivre";
    return null;
  }
  $("#lojas").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-loja]");
    if (b) marcarLoja(b.dataset.loja);
  });
  campos.link.addEventListener("input", () => {
    const l = detectarLoja(campos.link.value);
    if (l) marcarLoja(l);
  });

  function validar() {
    Object.values(campos).forEach((c) => c.classList && c.classList.remove("erro"));
    const p = {
      nome: campos.nome.value.trim(),
      precoAntigo: lerPreco(campos.precoAntigo.value),
      precoNovo: lerPreco(campos.precoNovo.value),
      link: campos.link.value.trim(),
      categoria: campos.categoria.value,
      cupom: campos.cupom.value.trim(),
      loja
    };
    const falhas = [];
    if (!p.nome) falhas.push([campos.nome, "Coloca o nome do produto 💕"]);
    if (!p.precoNovo) falhas.push([campos.precoNovo, "Coloca o preço novo"]);
    if (!/^https?:\/\//i.test(p.link)) falhas.push([campos.link, "Cola o link de afiliado (começando com https://)"]);
    if (falhas.length) {
      falhas.forEach(([c]) => c.classList.add("erro"));
      falhas[0][0].focus();
      toast(falhas[0][1]);
      return null;
    }
    if (p.precoAntigo && p.precoAntigo <= p.precoNovo) p.precoAntigo = null;
    return p;
  }

  function carregando(sim) {
    botaoGerar.disabled = sim;
    botaoGerar.classList.toggle("ocupado", sim);
    botaoGerar.querySelector(".rotulo").textContent = sim ? "Gerando..." : "Gerar Miga Promo ✨";
  }

  function mostrarSaida(texto, aviso) {
    $("#texto").value = texto;
    $("#aviso").textContent = aviso || "";
    $("#aviso").hidden = !aviso;
    $("#saida").hidden = false;
    $("#saida").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = validar();
    if (!p) return;
    carregando(true);
    try {
      const r = await chamarApi("gerar", p);
      mostrarSaida(r.texto);
    } catch (err) {
      if (err.codigo === "senha") {
        abrirConfig();
        toast("Digite a senha de acesso do app");
      } else {
        const motivo = err.codigo === "sem-chave" ? "a chave da IA ainda não foi configurada"
          : err.codigo === "rede" ? "sem conexão com o servidor" : "a IA não respondeu agora";
        mostrarSaida(mensagemReserva(p), `Usei uma mensagem pronta porque ${motivo}. Você pode editar o texto à vontade.`);
      }
    } finally {
      carregando(false);
    }
  });

  /* ---------- Copiar e compartilhar ---------- */
  $("#copiar").addEventListener("click", async () => {
    const texto = $("#texto").value;
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      $("#texto").select();
      document.execCommand && document.execCommand("copy");
    }
    toast("Texto copiado! 💖");
  });

  $("#whats").addEventListener("click", async () => {
    const texto = $("#texto").value;
    if (navigator.share) {
      try { await navigator.share({ text: texto }); return; }
      catch (e) { if (e.name === "AbortError") return; /* outro erro: usa o link */ }
    }
    window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(texto), "_blank", "noopener");
  });

  /* ---------- Configurações (senha) ---------- */
  const dialogo = $("#config");
  function abrirConfig() {
    $("#senha").value = armazenamento.ler(CHAVE_SENHA);
    chamarApi("status").then((s) => {
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
    if (dialogo.returnValue === "salvar") {
      armazenamento.gravar(CHAVE_SENHA, $("#senha").value);
      toast("Senha salva neste aparelho ✓");
    }
  });

  /* ---------- PWA: registra o Service Worker ---------- */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
