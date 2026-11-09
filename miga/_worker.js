/**
 * Miga Promo — _worker.js (servidor do app no Cloudflare Pages)
 * Desenvolvido por Alpama Soluções.
 *
 * Este arquivo único atende as rotas /api/* e entrega o resto do site.
 * Funciona tanto no envio por "arrastar e soltar" (zip) quanto pelo GitHub.
 *
 *   POST /api/produto  { url }      → foto, nome e preço (Mercado Livre / Shopee)
 *   POST /api/gerar    { ...dados } → mensagem escrita pela IA (Gemini)
 *   GET  /api/imagem?url=...        → foto do produto (para enviar junto no WhatsApp)
 *   GET  /api/status                → diz se a IA está configurada
 *   POST /api/entrar   { codigo }   → confere o código de acesso (APP_SENHA)
 *
 * Variáveis no Cloudflare (Configurações → Variáveis e segredos):
 *   GEMINI_API_KEY (chave da IA)   APP_SENHA (código de acesso do app)   GEMINI_MODEL (opcional)
 */

/* ======================= Leitura do produto ======================= */

const DOMINIOS = {
  mercadolivre: ["mercadolivre.com.br", "mercadolivre.com", "mercadolibre.com", "meli.la", "mlstatic.com"],
  shopee: ["shopee.com.br", "shope.ee", "shp.ee", "susercontent.com", "shopee.com"]
};
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

/** Diz de qual loja é a URL (ou null se não for permitida) */
function lojaDaUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    for (const [loja, lista] of Object.entries(DOMINIOS)) {
      if (lista.some((d) => h === d || h.endsWith("." + d))) return loja;
    }
  } catch (e) { /* URL inválida */ }
  return null;
}

const decodificar = (t) => String(t || "")
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2F;/g, "/").trim();

function meta(html, prop) {
  const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${prop}["']`, "i");
  const m = html.match(a) || html.match(b);
  return m ? decodificar(m[1]) : "";
}

function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).replace(/[^\d.,]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function produtoJsonLd(html) {
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const d = JSON.parse(b[1].trim());
      const lista = Array.isArray(d) ? d : d["@graph"] || [d];
      for (const x of lista) {
        if (!x || !/Product/i.test(String(x["@type"]))) continue;
        const of = Array.isArray(x.offers) ? x.offers[0] : x.offers || {};
        return { nome: decodificar(x.name), imagem: Array.isArray(x.image) ? x.image[0] : x.image || "", preco: numero(of.price ?? of.lowPrice) };
      }
    } catch (e) { /* bloco inválido */ }
  }
  return {};
}

// Mercado Livre: "Antes: 199 reais com 90 centavos"
function precoAntigoML(html) {
  const m = html.match(/aria-label=["']Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d{1,2})\s*centavos)?/i);
  return m ? numero(m[1].replace(/\./g, "") + "," + (m[2] || "0").padStart(2, "0")) : null;
}

const limparTitulo = (t) => String(t || "")
  .replace(/\s*[|\-–]\s*(Mercado Livre|MercadoLivre|Shopee Brasil|Shopee).*$/i, "")
  .replace(/^Compre\s+/i, "").trim();

/** Busca os dados do produto a partir do link de afiliado */
async function extrairProduto(url) {
  const loja = lojaDaUrl(url);
  if (!loja) throw new Error("Use um link do Mercado Livre ou da Shopee.");

  const r = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", accept: "text/html" } });
  const html = r.ok ? await r.text() : "";
  const ld = produtoJsonLd(html);

  const dados = {
    loja,
    nome: limparTitulo(ld.nome || meta(html, "og:title") || meta(html, "twitter:title")),
    preco: ld.preco || numero(meta(html, "product:price:amount")) || numero(meta(html, "price")),
    precoAntigo: loja === "mercadolivre" ? precoAntigoML(html) : null,
    imagem: ld.imagem || meta(html, "og:image") || meta(html, "twitter:image"),
    urlFinal: r.url || url
  };
  if (dados.imagem && dados.imagem.startsWith("//")) dados.imagem = "https:" + dados.imagem;
  if (dados.precoAntigo && dados.preco && dados.precoAntigo <= dados.preco) dados.precoAntigo = null;
  dados.completo = !!(dados.nome && dados.preco && dados.imagem);
  return dados;
}

/* ======================= Mensagem com IA (Gemini) ======================= */

// Dicas de benefícios por categoria (ajudam a IA a falar com o público certo)
const CATEGORIAS = {
  moda: { nome: "Moda e Looks", foco: "caimento, conforto, versatilidade para montar looks e como valoriza o corpo" },
  beleza: { nome: "Beleza e Skincare", foco: "resultado na pele/cabelo, praticidade na rotina de autocuidado e sensação de se sentir linda" },
  casa: { nome: "Casa e Decoração", foco: "deixar a casa mais aconchegante e bonita, praticidade no dia a dia e o 'efeito uau' de quem visita" }
};

// Lojas aceitas (a mensagem cita onde comprar)
const LOJAS = { mercadolivre: "Mercado Livre", shopee: "Shopee" };

const brl = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

/** Monta o prompt base da Miga Promo com os dados do formulário */
function montarPrompt(p) {
  const cat = CATEGORIAS[p.categoria] || CATEGORIAS.moda;
  const precos = p.precoAntigo
    ? `O preço caiu de ${brl(p.precoAntigo)} para ${brl(p.precoNovo)}.`
    : `O preço está ${brl(p.precoNovo)} (não há preço antigo: não fale em "caiu de").`;
  const cupom = p.cupom
    ? `Cupom de desconto: ${p.cupom} (mencione o cupom).`
    : "Não há cupom: NÃO mencione cupom.";

  return [
    "Atue como uma curadora de moda, beleza e utilidades para um grupo VIP de WhatsApp focado no público feminino, chamado Miga Promo.",
    "Crie uma mensagem curta, amigável e em tom de confidência (como uma amiga dando uma dica incrível).",
    `O produto é: ${p.nome}.`,
    precos,
    `O link de compra é: ${p.link}`,
    `Loja: ${LOJAS[p.loja] || "Mercado Livre"} (mencione de forma natural onde comprar).`,
    `Categoria do produto: ${cat.nome}. Destaque os benefícios voltados para essa categoria (${cat.foco}).`,
    cupom,
    "Formate com emojis delicados e crie um leve senso de urgência dizendo que a promoção ou o estoque podem acabar rápido.",
    "Não use hashtags.",
    "Regras extras: escreva em português do Brasil com a formatação do WhatsApp (*negrito*, ~riscado~);",
    "coloque o link sozinho em uma linha, exatamente como recebido; não invente informações (frete, parcelamento, avaliações);",
    "no máximo 600 caracteres; responda SOMENTE com a mensagem."
  ].join(" ");
}

/** Chama a API REST do Gemini e devolve o texto gerado */
async function chamarGemini(prompt, env) {
  const modelo = env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (d.error && d.error.message) || "Erro " + r.status;
    throw Object.assign(new Error(msg), { status: r.status });
  }
  const partes = d.candidates?.[0]?.content?.parts || [];
  const texto = partes.map((x) => x.text || "").join("").replace(/^```[a-z]*\s*|```$/gi, "").trim();
  if (!texto) throw new Error("A IA não devolveu texto. Tente de novo.");
  return { texto, modelo };
}

async function rotaGerar(request, env) {
  // Senha opcional para ninguém usar sua cota (variável APP_SENHA)
  if (env.APP_SENHA && request.headers.get("x-app-senha") !== env.APP_SENHA) {
    return json({ erro: "Senha de acesso inválida.", codigo: "senha" }, 401);
  }
  if (!env.GEMINI_API_KEY) return json({ erro: "Chave do Gemini não configurada no servidor.", codigo: "sem-chave" }, 503);

  let b;
  try { b = await request.json(); } catch (e) { return json({ erro: "Requisição inválida." }, 400); }

  const p = {
    nome: String(b.nome || "").trim().slice(0, 200),
    precoAntigo: Number(b.precoAntigo) > 0 ? Number(b.precoAntigo) : null,
    precoNovo: Number(b.precoNovo),
    link: String(b.link || "").trim(),
    categoria: String(b.categoria || "moda"),
    loja: LOJAS[b.loja] ? b.loja : "mercadolivre",
    cupom: String(b.cupom || "").trim().slice(0, 40)
  };
  if (!p.nome || !(p.precoNovo > 0) || !/^https?:\/\//i.test(p.link)) {
    return json({ erro: "Preencha nome, preço novo e link." }, 400);
  }
  if (p.precoAntigo && p.precoAntigo <= p.precoNovo) p.precoAntigo = null;

  try {
    const r = await chamarGemini(montarPrompt(p), env);
    // Garante que o link de afiliado está na mensagem
    if (!r.texto.includes(p.link)) r.texto += "\n\n👉 " + p.link;
    return json(r);
  } catch (e) {
    return json({ erro: e.message, codigo: "ia" }, 502);
  }
}

/* ======================= Demais rotas ======================= */
const senhaOk = (request, env) => !env.APP_SENHA || request.headers.get("x-app-senha") === env.APP_SENHA;

async function rotaProduto(request, env) {
  if (!senhaOk(request, env)) return json({ erro: "Senha de acesso inválida.", codigo: "senha" }, 401);
  let b;
  try { b = await request.json(); } catch (e) { return json({ erro: "Requisição inválida." }, 400); }
  try {
    return json(await extrairProduto(String(b.url || "").trim()));
  } catch (e) {
    return json({ erro: e.message || "Não consegui ler o produto." }, 422);
  }
}

async function rotaImagem(request) {
  const alvo = new URL(request.url).searchParams.get("url") || "";
  if (!lojaDaUrl(alvo)) return new Response("Imagem não permitida", { status: 400 });
  const r = await fetch(alvo, { headers: { accept: "image/*" } });
  const tipo = r.headers.get("content-type") || "";
  if (!r.ok || !tipo.startsWith("image/")) return new Response("Imagem indisponível", { status: 502 });
  return new Response(r.body, { headers: { "content-type": tipo, "cache-control": "public, max-age=86400" } });
}

function rotaStatus(env) {
  return json({ ia: !!env.GEMINI_API_KEY, codigo: !!env.APP_SENHA });
}

/** Confere o código de acesso digitado na tela de entrada (é o valor de APP_SENHA). */
async function rotaEntrar(request, env) {
  if (!env.APP_SENHA) return json({ ok: false, codigo: "sem-codigo", erro: "Código de acesso não configurado (APP_SENHA)." }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, erro: "Requisição inválida." }, 400); }
  const digitado = new TextEncoder().encode(String(b.codigo || ""));
  const certo = new TextEncoder().encode(String(env.APP_SENHA));
  let diferenca = digitado.length ^ certo.length;
  for (let i = 0; i < certo.length; i++) diferenca |= (digitado[i] || 0) ^ certo[i];
  if (diferenca !== 0) {
    await new Promise((ok) => setTimeout(ok, 800)); // atrasa quem tenta adivinhar
    return json({ ok: false, codigo: "errado", erro: "Código incorreto." }, 401);
  }
  return json({ ok: true });
}

/* ======================= Roteador ======================= */
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const metodo = request.method;
    // Aceita /miga/api/... (site alpama.app) e /api/... (app sozinho num domínio)
    const m = pathname.match(/^(?:\/miga)?\/api\/([a-z]+)$/);
    try {
      if (m && m[1] === "produto" && metodo === "POST") return await rotaProduto(request, env);
      if (m && m[1] === "gerar" && metodo === "POST") return await rotaGerar(request, env);
      if (m && m[1] === "imagem" && metodo === "GET") return await rotaImagem(request);
      if (m && m[1] === "status" && metodo === "GET") return rotaStatus(env);
      if (m && m[1] === "entrar" && metodo === "POST") return await rotaEntrar(request, env);
      if (m) return json({ erro: "Rota não encontrada." }, 404);
    } catch (e) {
      return json({ erro: "Erro no servidor: " + (e.message || e) }, 500);
    }
    // Todo o resto: arquivos do site (index.html, app.js, ícones...)
    return env.ASSETS.fetch(request);
  }
};
