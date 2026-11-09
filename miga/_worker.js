/**
 * Miga Promo — _worker.js (servidor do app no Cloudflare Pages)
 * Desenvolvido por Alpama Soluções.
 *
 * Este arquivo único atende as rotas /api/* e entrega o resto do site.
 * Funciona tanto no envio por "arrastar e soltar" (zip) quanto pelo GitHub.
 *
 *   POST /api/produto  { url }      → foto, nome e preço (Mercado Livre / Shopee)
 *   POST /api/gerar    { ...dados } → mensagem escrita pela IA (Gemini); com { ajuste, textoAtual } reescreve
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

/** Diz de qual loja é a URL (ou null se não for permitida).
 *  Só aceita https, sem porta e sem usuário/senha embutidos (proteção contra SSRF). */
function lojaDaUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.port !== "" || u.username || u.password) return null;
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

// Tira do nome: "| Mercado Livre", "- R$ 49,90", "Frete grátis" etc. (a loja às vezes junta tudo no título)
const limparTitulo = (t) => String(t || "")
  .replace(/\s*[|\-–]\s*(Mercado Livre|MercadoLivre|Shopee Brasil|Shopee).*$/i, "")
  .replace(/\s*[|\-–:]?\s*(por\s+)?R\$\s*[\d.,]+.*$/i, "")
  .replace(/\s*[|\-–]\s*(frete gr[aá]tis|em at[eé] \d+x.*|oferta.*)$/i, "")
  .replace(/^Compre\s+/i, "")
  .replace(/\s{2,}/g, " ").trim();

/** Busca os dados do produto a partir do link de afiliado */
async function extrairProduto(url) {
  const loja = lojaDaUrl(url);
  if (!loja) throw new Error("Use um link do Mercado Livre ou da Shopee.");

  // Segue os redirecionamentos um a um, conferindo se cada destino continua sendo da loja
  let atual = url, r = null;
  for (let pulo = 0; pulo < 6; pulo++) {
    r = await fetch(atual, { redirect: "manual", headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", accept: "text/html" } });
    const destino = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!destino) break;
    atual = new URL(destino, atual).toString();
    if (!lojaDaUrl(atual)) throw new Error("O link redirecionou para fora da loja.");
  }
  const html = r && r.ok ? await r.text() : "";
  const ld = produtoJsonLd(html);

  const dados = {
    loja,
    nome: limparTitulo(ld.nome || meta(html, "og:title") || meta(html, "twitter:title")),
    preco: ld.preco || numero(meta(html, "product:price:amount")) || numero(meta(html, "price")),
    precoAntigo: loja === "mercadolivre" ? precoAntigoML(html) : null,
    imagem: ld.imagem || meta(html, "og:image") || meta(html, "twitter:image"),
    urlFinal: atual
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
  casa: { nome: "Casa e Decoração", foco: "deixar a casa mais aconchegante e bonita, praticidade no dia a dia e o 'efeito uau' de quem visita" },
  saude: { nome: "Saúde e Fitness", foco: "bem-estar, treino, energia, cuidado com o corpo e constância na rotina (sem prometer resultados de saúde)" },
  outros: { nome: "Achadinhos em geral", foco: "utilidade no dia a dia, custo-benefício e por que vale a pena aproveitar agora" }
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

/* Instrução de sistema: papel e regras fixas da IA (separadas dos dados do produto) */
const INSTRUCAO = [
  "Você é a curadora do Miga Promo, um grupo VIP de WhatsApp de achadinhos e descontos focado no público feminino.",
  "Escreva mensagens curtas, amigáveis e em tom de confidência, como uma amiga dando uma dica incrível.",
  "Regras obrigatórias:",
  "1) Português do Brasil, formatação do WhatsApp: *negrito*, ~riscado~. Emojis delicados, sem exagero.",
  "2) Estrutura: abertura chamativa; nome do produto em *negrito*; linha de preço (com preço antigo: '~de R$ X~ por *R$ Y*'); cupom só se informado; 1 frase de benefício que combine com o produto; o link sozinho numa linha, exatamente como recebido; fechamento com leve urgência (a promoção ou o estoque podem acabar).",
  "3) O preço aparece uma única vez, na linha de preço. Nunca repita o preço no nome.",
  "4) Os benefícios precisam combinar com o produto de verdade (não fale de skincare para um suplemento, por exemplo).",
  "5) Não invente informações: nada de frete grátis, parcelamento, avaliações, estoque exato ou promessas de saúde.",
  "6) Sem hashtags. No máximo 600 caracteres. Responda SOMENTE com a mensagem, sem comentários."
].join("\n");

/* Exemplos de mensagem ideal (few-shot): a IA copia o formato */
const EXEMPLOS = [
  {
    entrada: "Produto: Vestido Midi Canelado com Fenda\nLoja: Shopee\nCategoria: Moda e Looks (caimento, conforto, versatilidade)\nPreço antigo: R$ 129,90\nPreço novo: R$ 69,90\nCupom: MIGA10\nLink: https://s.shopee.com.br/exemplo1",
    saida: "Miga, para tudo! 🤫💖\n\n✨ *Vestido Midi Canelado com Fenda*\n\n💸 ~de R$ 129,90~ por *R$ 69,90*\n🎟️ Usa o cupom *MIGA10*\n\nVeste super bem, é confortável e vai do dia pra noite só trocando o acessório 👗\n\nhttps://s.shopee.com.br/exemplo1\n\nCorre que esse preço não costuma durar ⏳🌸"
  },
  {
    entrada: "Produto: Organizador de Gaveta Kit 6 Peças\nLoja: Mercado Livre\nCategoria: Casa e Decoração (casa aconchegante, praticidade)\nPreço antigo: não informado\nPreço novo: R$ 39,90\nCupom: nenhum\nLink: https://meli.la/exemplo2",
    saida: "Achadinho pra casa, amiga 🏡✨\n\n*Organizador de Gaveta Kit 6 Peças*\n\n💸 Por apenas *R$ 39,90*\n\nAcaba com a bagunça das gavetas e deixa tudo à vista — aquela sensação de casa arrumada que a gente ama 💕\n\nhttps://meli.la/exemplo2\n\nAproveita enquanto está nesse valor ⏳"
  }
];

const AJUSTES = {
  curto: "Deixe a mensagem bem mais curta (no máximo 4 linhas), mantendo nome, preço e link.",
  emojis: "Use mais emojis delicados, sem poluir a mensagem.",
  preco: "Dê mais destaque ao preço e à economia (quanto a pessoa economiza, se houver preço antigo).",
  animada: "Deixe o tom mais animado e empolgado, sem perder o jeito de amiga."
};

/** Dados do produto no formato que a IA recebe */
function dadosDoProduto(p) {
  const cat = CATEGORIAS[p.categoria] || CATEGORIAS.outros;
  const economia = p.precoAntigo ? ` (economia de ${brl(p.precoAntigo - p.precoNovo)})` : "";
  return [
    `Produto: ${p.nome}`,
    `Loja: ${LOJAS[p.loja] || "Mercado Livre"}`,
    `Categoria: ${cat.nome} (${cat.foco})`,
    `Preço antigo: ${p.precoAntigo ? brl(p.precoAntigo) : "não informado"}`,
    `Preço novo: ${brl(p.precoNovo)}${economia}`,
    `Cupom: ${p.cupom || "nenhum"}`,
    `Link: ${p.link}`
  ].join("\n");
}

/** Monta a conversa enviada ao Gemini: exemplos + pedido atual (ou ajuste de um texto já gerado) */
function montarConversa(p) {
  const contents = [];
  for (const ex of EXEMPLOS) {
    contents.push({ role: "user", parts: [{ text: ex.entrada }] });
    contents.push({ role: "model", parts: [{ text: ex.saida }] });
  }
  if (p.ajuste && p.textoAtual) {
    contents.push({ role: "user", parts: [{ text: dadosDoProduto(p) }] });
    contents.push({ role: "model", parts: [{ text: p.textoAtual }] });
    contents.push({ role: "user", parts: [{ text: `Reescreva a mensagem acima. Ajuste pedido: ${AJUSTES[p.ajuste]} Mantenha todas as regras e o link exatamente igual.` }] });
  } else {
    contents.push({ role: "user", parts: [{ text: dadosDoProduto(p) }] });
  }
  return contents;
}

/** Chama a API REST do Gemini (systemInstruction + conversa) e devolve o texto gerado */
async function chamarGemini(contents, env) {
  const modelo = env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCAO }] },
      contents,
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
  if (!senhaOk(request, env)) return json({ erro: "Código de acesso inválido.", codigo: "senha" }, 401);
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
    cupom: String(b.cupom || "").trim().slice(0, 40),
    ajuste: AJUSTES[b.ajuste] ? b.ajuste : "",
    textoAtual: String(b.textoAtual || "").slice(0, 2000)
  };
  if (!p.nome || !(p.precoNovo > 0) || !/^https?:\/\//i.test(p.link)) {
    return json({ erro: "Preencha nome, preço novo e link." }, 400);
  }
  if (p.precoAntigo && p.precoAntigo <= p.precoNovo) p.precoAntigo = null;

  try {
    const r = await chamarGemini(montarConversa(p), env);
    // Garante que o link de afiliado está na mensagem
    if (!r.texto.includes(p.link)) r.texto += "\n\n👉 " + p.link;
    return json(r);
  } catch (e) {
    return json({ erro: e.message, codigo: "ia" }, 502);
  }
}

/* ======================= Demais rotas ======================= */
const senhaOk = (request, env) => !env.APP_SENHA || request.headers.get("x-app-senha") === env.APP_SENHA;

/* Cache do Cloudflare (Cache API): guarda leituras e contadores por um tempo, sem banco de dados */
const temCache = () => typeof caches !== "undefined" && caches.default;
const chaveCache = (tipo, valor) => new Request("https://miga-cache.interno/" + tipo + "?v=" + encodeURIComponent(valor));
async function lerCache(tipo, valor) {
  if (!temCache()) return null;
  const r = await caches.default.match(chaveCache(tipo, valor));
  return r ? r.json() : null;
}
async function gravarCache(tipo, valor, dados, segundos) {
  if (!temCache()) return;
  await caches.default.put(chaveCache(tipo, valor), new Response(JSON.stringify(dados), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${segundos}` }
  }));
}
async function apagarCache(tipo, valor) {
  if (temCache()) await caches.default.delete(chaveCache(tipo, valor));
}

async function rotaProduto(request, env) {
  if (!senhaOk(request, env)) return json({ erro: "Código de acesso inválido.", codigo: "senha" }, 401);
  let b;
  try { b = await request.json(); } catch (e) { return json({ erro: "Requisição inválida." }, 400); }
  const url = String(b.url || "").trim();
  try {
    const guardado = await lerCache("produto", url);
    if (guardado) return json({ ...guardado, doCache: true });
    const dados = await extrairProduto(url);
    if (dados.nome) await gravarCache("produto", url, dados, 1800); // 30 minutos
    return json(dados);
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
const LIMITE_TENTATIVAS = 10, BLOQUEIO_SEGUNDOS = 900; // 10 erros → 15 minutos bloqueado

async function rotaEntrar(request, env) {
  if (!env.APP_SENHA) return json({ ok: false, codigo: "sem-codigo", erro: "Código de acesso não configurado (APP_SENHA)." }, 503);
  const ip = request.headers.get("cf-connecting-ip") || "sem-ip";
  const tentativas = (await lerCache("tentativas", ip)) || { n: 0 };
  if (tentativas.n >= LIMITE_TENTATIVAS) {
    return json({ ok: false, codigo: "bloqueado", erro: "Muitas tentativas erradas. Aguarde 15 minutos." }, 429);
  }
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, erro: "Requisição inválida." }, 400); }
  const digitado = new TextEncoder().encode(String(b.codigo || ""));
  const certo = new TextEncoder().encode(String(env.APP_SENHA));
  let diferenca = digitado.length ^ certo.length;
  for (let i = 0; i < certo.length; i++) diferenca |= (digitado[i] || 0) ^ certo[i];
  if (diferenca !== 0) {
    await gravarCache("tentativas", ip, { n: tentativas.n + 1 }, BLOQUEIO_SEGUNDOS);
    await new Promise((ok) => setTimeout(ok, 800)); // atrasa quem tenta adivinhar
    return json({ ok: false, codigo: "errado", erro: "Código incorreto." }, 401);
  }
  await apagarCache("tentativas", ip);
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
