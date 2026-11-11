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
 *   GET  /api/catalogo?filtro=moda|beleza|casa|fitness&loja=todas|mercadolivre|shopee
 *                                   → mais vendidos (APIs oficiais), lista limpa para o app
 *
 * Variáveis no Cloudflare (Configurações → Variáveis e segredos):
 *   GEMINI_API_KEY (chave da IA)   APP_SENHA (código de acesso do app)   GEMINI_MODEL (opcional)
 *   Catálogo (opcionais — cada loja só aparece quando as duas chaves dela existirem):
 *     ML_APP_ID, ML_SECRET           → Mercado Livre Developers (Minhas aplicações)
 *     SHOPEE_APP_ID, SHOPEE_SECRET   → Shopee Afiliados → Open API
 */

/* ======================= Leitura do produto ======================= */

const DOMINIOS = {
  mercadolivre: ["mercadolivre.com.br", "mercadolivre.com", "mercadolibre.com", "meli.la", "mlstatic.com"],
  shopee: ["shopee.com.br", "shope.ee", "shp.ee", "susercontent.com", "shopee.com"],
  amazon: ["amazon.com.br", "amazon.com", "amzn.to", "a.co", "media-amazon.com"],
  magalu: ["magazineluiza.com.br", "magazinevoce.com.br", "magalu.com", "magalu.com.br", "mlcdn.com.br"]
};
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
// Robô de prévia de links (o mesmo do Facebook/WhatsApp): as lojas entregam a página já com foto, nome e preço
const UA_PREVIA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

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

// Mercado Livre: preço atual ("49 reais com 90 centavos"), que vem depois do "Antes:"
function precoAtualML(html) {
  const re = /aria-label=["'](Antes:\s*|Agora:\s*)?([\d.]+)\s*reais(?:\s*com\s*(\d{1,2})\s*centavos)?/gi;
  let m, passouAntes = false, primeiro = null;
  while ((m = re.exec(html))) {
    const v = numero(m[2].replace(/\./g, "") + "," + (m[3] || "0").padStart(2, "0"));
    if (/Antes/i.test(m[1] || "")) { passouAntes = true; continue; }
    if (/Agora/i.test(m[1] || "") || passouAntes) return v;
    if (primeiro === null) primeiro = v;
  }
  return primeiro;
}
// Preço escrito no texto (ex.: descrição da prévia "R$ 49,90")
function precoNoTexto(t) {
  const m = String(t || "").match(/R\$\s?([\d.]+,\d{2})/);
  return m ? numero(m[1]) : null;
}

// Tira do nome: "| Mercado Livre", "- R$ 49,90", "Frete grátis" etc. (a loja às vezes junta tudo no título)
const limparTitulo = (t) => String(t || "")
  .replace(/\s*[|\-–:]\s*(Mercado Livre|MercadoLivre|Shopee Brasil|Shopee|Amazon\.com\.br.*|Magazine Luiza|Magalu).*$/i, "")
  .replace(/^Amazon\.com\.br\s*:\s*/i, "")
  .replace(/\s*[|\-–:]?\s*(por\s+)?R\$\s*[\d.,]+.*$/i, "")
  .replace(/\s*[|\-–]\s*(frete gr[aá]tis|em at[eé] \d+x.*|oferta.*)$/i, "")
  .replace(/^Compre\s+/i, "")
  .replace(/\s{2,}/g, " ").trim();

/** Busca os dados do produto a partir do link de afiliado */
async function extrairProduto(url) {
  const loja = lojaDaUrl(url);
  if (!loja) throw new Error("Use um link do Mercado Livre, Shopee, Amazon ou Magalu.");

  // Segue os redirecionamentos um a um, conferindo se cada destino continua sendo da loja
  async function baixar(inicio, ua) {
    let atual = inicio, r = null;
    for (let pulo = 0; pulo < 6; pulo++) {
      r = await fetch(atual, { redirect: "manual", headers: { "user-agent": ua, "accept-language": "pt-BR,pt;q=0.9", accept: "text/html" } });
      const destino = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (!destino) break;
      atual = new URL(destino, atual).toString();
      if (!lojaDaUrl(atual)) throw new Error("O link redirecionou para fora da loja.");
    }
    return { html: r && r.ok ? await r.text() : "", atual };
  }
  function ler(html) {
    const ld = produtoJsonLd(html);
    const desc = meta(html, "og:description") || meta(html, "description");
    return {
      nome: limparTitulo(ld.nome || meta(html, "og:title") || meta(html, "twitter:title")),
      preco: ld.preco || numero(meta(html, "product:price:amount")) || numero(meta(html, "price")) || (loja === "mercadolivre" ? precoAtualML(html) : null) || precoNoTexto(desc),
      precoAntigo: loja === "mercadolivre" ? precoAntigoML(html) : null,
      imagem: ld.imagem || meta(html, "og:image") || meta(html, "twitter:image")
    };
  }

  // Shopee só entrega foto e nome para o robô de prévia; nas outras lojas tenta o navegador primeiro
  let pagina = await baixar(url, loja === "shopee" ? UA_PREVIA : UA);
  let d = ler(pagina.html);
  if (!(d.nome && d.preco && d.imagem)) {
    const outra = await baixar(pagina.atual, loja === "shopee" ? UA : UA_PREVIA).catch(() => null);
    if (outra) {
      const d2 = ler(outra.html);
      d = { nome: d.nome || d2.nome, preco: d.preco || d2.preco, precoAntigo: d.precoAntigo || d2.precoAntigo, imagem: d.imagem || d2.imagem };
    }
  }
  // Página genérica da loja (sem o produto): não usa nome nem a logo da loja como se fossem do produto
  if (/^(shopee|mercado livre|amazon|magalu|magazine luiza)\b/i.test(d.nome || "") || /ofertas incr[ií]veis|compre online|melhores pre[cç]os/i.test(d.nome || "")) { d.nome = ""; d.imagem = ""; }
  const dados = { loja, ...d, urlFinal: pagina.atual };
  if (dados.imagem && dados.imagem.startsWith("//")) dados.imagem = "https:" + dados.imagem;
  if (dados.precoAntigo && dados.preco && dados.precoAntigo <= dados.preco) dados.precoAntigo = null;
  dados.completo = !!(dados.nome && dados.preco && dados.imagem);
  return dados;
}

/** Mercado Livre: completa preço e foto pela API oficial (quando as chaves estão cadastradas) */
async function completarPelaApiML(dados, env) {
  if (!(env.ML_APP_ID && env.ML_SECRET)) return dados;
  const u = dados.urlFinal || "";
  const norm = (s) => s ? s.toUpperCase().replace("-", "") : null;
  const idProduto = norm((u.match(/\/p\/(MLB\d+)/i) || [])[1]);
  const idItem = norm((u.match(/[?&#](?:item_id|wid)=(MLB-?\d+)/i) || [])[1] || (!idProduto && (u.match(/(MLB-?\d{6,})/i) || [])[1]));
  try {
    chamadasML = 0;
    const token = await tokenML(env);
    if (idItem) {
      const v = await precoML(idItem, token);
      if (v) { dados.preco = v.preco; if (v.precoAntigo && v.precoAntigo > v.preco) dados.precoAntigo = v.precoAntigo; }
      if (!dados.imagem || !dados.nome) {
        const r = await getML(`/items/${idItem}`, token);
        if (r.status === 200) { dados.nome = dados.nome || limparTitulo(r.dados.title); dados.imagem = dados.imagem || mlHttps(((r.dados.pictures || [])[0] || {}).secure_url || r.dados.thumbnail); }
      }
    } else if (idProduto) {
      const r = await getML(`/products/${idProduto}`, token);
      const b = r.dados || {};
      let preco = (b.buy_box_winner || {}).price, antigo = (b.buy_box_winner || {}).original_price;
      if (!preco) {
        const it = await getML(`/products/${idProduto}/items?limit=1`, token);
        const x = ((it.dados && it.dados.results) || [])[0];
        if (x) { preco = x.price; antigo = x.original_price; }
      }
      if (preco) { dados.preco = preco; if (antigo && antigo > preco) dados.precoAntigo = antigo; }
      if (!dados.nome && b.name) dados.nome = b.name;
      if (!dados.imagem && b.pictures && b.pictures[0]) dados.imagem = mlHttps(b.pictures[0].url);
    }
  } catch (e) { /* fica com o que veio da página */ }
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
const LOJAS = { mercadolivre: "Mercado Livre", shopee: "Shopee", amazon: "Amazon", magalu: "Magalu" };

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
  "Você é a 'Miga': uma amiga de verdade, animada com compras, que compartilha achados para ajudar — acolhedora e direta, nunca agressiva nem com cara de anúncio.",
  "Escreva mensagens curtas, amigáveis e em tom de confidência, como uma amiga dando uma dica incrível.",
  "Regras obrigatórias:",
  "1) Português do Brasil, formatação do WhatsApp: *negrito*, ~riscado~. Emojis delicados, sem exagero.",
  "2) Estrutura: abertura que conversa com a leitora sobre a situação em que o produto ajuda (ex.: moda: 'Sabe aquele look pro fim de semana?'); nome do produto em *negrito*; linha de preço (com preço antigo: '~de R$ X~ por *R$ Y*'); cupom só se informado; 1 frase de benefício que combine com o produto; o link sozinho numa linha, exatamente como recebido; fechamento com convite suave e leve urgência (ex.: 'Dá uma olhada antes que acabe'), nunca 'COMPRE JÁ'.",
  "3) Valores em R$ aparecem SOMENTE na linha de preço, uma única vez cada. Nunca repita o preço (nem o valor da economia) no nome, na frase de benefício, na abertura ou no fechamento.",
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

EXEMPLOS.push(
  {
    entrada: "Produto: Sérum Facial Vitamina C 30ml\nLoja: Shopee\nCategoria: Beleza e Skincare (resultado na pele, praticidade na rotina)\nPreço antigo: R$ 59,90\nPreço novo: R$ 34,90\nCupom: nenhum\nLink: https://s.shopee.com.br/exemplo3",
    saida: "Sabe aquela pele com cara de descansada, mesmo na correria? 💛\n\n✨ *Sérum Facial Vitamina C 30ml*\n\n💸 ~de R$ 59,90~ por *R$ 34,90*\n\nUma gotinha de manhã e a rotina de skincare fica completa, sem complicação 🌿\n\nhttps://s.shopee.com.br/exemplo3\n\nDá uma olhada antes que acabe, miga 💕"
  },
  {
    entrada: "Produto: Garrafa Térmica Inox 1 Litro\nLoja: Mercado Livre\nCategoria: Saúde e Fitness (bem-estar, treino, constância na rotina)\nPreço antigo: não informado\nPreço novo: R$ 45,90\nCupom: MIGA5\nLink: https://meli.la/exemplo4",
    saida: "Pra quem vive esquecendo de beber água no dia a dia 🙋‍♀️\n\n*Garrafa Térmica Inox 1 Litro*\n\n💸 Por *R$ 45,90*\n🎟️ Usa o cupom *MIGA5*\n\nMantém a água geladinha o dia todo e vai junto pro treino, pro trabalho e pra bolsa 💪\n\nhttps://meli.la/exemplo4\n\nVale a pena espiar enquanto está nesse valor ✨"
  }
);

const AJUSTES = {
  curto: "Deixe a mensagem bem mais curta (no máximo 4 linhas), mantendo nome, preço e link.",
  emojis: "Use mais emojis delicados, sem poluir a mensagem.",
  preco: "Dê mais destaque ao preço e à economia (quanto a pessoa economiza, se houver preço antigo), tudo na própria linha de preço.",
  animada: "Deixe o tom mais animado e empolgado, sem perder o jeito de amiga."
};

/** Dados do produto no formato que a IA recebe */
function dadosDoProduto(p) {
  const cat = CATEGORIAS[p.categoria] || CATEGORIAS.outros;
  const economia = p.precoAntigo && p.ajuste === "preco" ? ` (economia de ${brl(p.precoAntigo - p.precoNovo)})` : "";
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

/** Deixa valores em R$ só na primeira linha de preço: tira repetições do resto do texto */
function umPrecoSo(texto, link) {
  const VALOR = /\s*(?:(?:de|por|só|apenas|a partir de|economia de|economize|economizando|pagando)\s+)*[~*_]*R\$\s?\d[\d.]*(?:,\d{2})?[~*_]*/gi;
  let achou = false;
  return texto.split("\n").filter((linha) => {
    if (!/R\$\s?\d/.test(linha) || linha.includes(link)) return true;
    if (!achou) { achou = true; return true; }
    const resto = linha.replace(VALOR, "").replace(/[\s:!.,💸💰🤑🔥✨-]+/gu, "");
    return resto.length >= 12; // linha que era só o preço repetido: some
  }).map((linha, i, todas) => {
    if (!/R\$\s?\d/.test(linha) || linha.includes(link)) return linha;
    const primeira = todas.findIndex((l) => /R\$\s?\d/.test(l) && !l.includes(link));
    if (i === primeira) return linha;
    return linha.replace(VALOR, "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").replace(/\s+([,.!])/g, "$1").trim().replace(/^([^\p{L}]*)(\p{Ll})/u, (m, x, l) => x + l.toUpperCase());
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        // O "pensamento" do Gemini 2.5 Flash gasta os mesmos tokens da resposta e podia deixar o texto vazio
        ...(/2\.5-flash/.test(modelo) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      }
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (d.error && d.error.message) || "Erro " + r.status;
    throw Object.assign(new Error(msg), { status: r.status });
  }
  const partes = d.candidates?.[0]?.content?.parts || [];
  const texto = partes.map((x) => x.text || "").join("").replace(/^```[a-z]*\s*|```$/gi, "").trim();
  if (!texto) throw new Error("A IA não devolveu texto (" + (d.candidates?.[0]?.finishReason || "sem resposta") + "). Tente de novo.");
  return { texto, modelo };
}

/** Traduz os erros mais comuns do Gemini para algo que dá para resolver */
function motivoIA(e) {
  const m = String(e.message || "");
  if (/api key not valid|API_KEY_INVALID|invalid api key/i.test(m)) return "a chave da IA (GEMINI_API_KEY) é inválida — crie uma nova no Google AI Studio e troque no Cloudflare";
  if (/permission|PERMISSION_DENIED|not been used|disabled/i.test(m)) return "a chave da IA não tem permissão para o Gemini — ative a Generative Language API no projeto da chave";
  if (/not found|is not supported/i.test(m)) return "o modelo da IA não existe mais (" + m.slice(0, 80) + ")";
  if (e.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(m)) return "o limite gratuito da IA acabou por agora — espere um pouco";
  if (/SAFETY|blocked/i.test(m)) return "a IA bloqueou o texto por segurança — tente outro ajuste";
  return m.slice(0, 160) || "a IA não respondeu";
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
    let r;
    try {
      r = await chamarGemini(montarConversa(p), env);
    } catch (e) {
      if (!p.ajuste || e.status === 429) throw e;
      // Segunda tentativa do ajuste: tudo numa mensagem só
      r = await chamarGemini([{ role: "user", parts: [{ text: `Dados do produto:\n${dadosDoProduto(p)}\n\nMensagem atual:\n${p.textoAtual}\n\nReescreva a mensagem atual. Ajuste pedido: ${AJUSTES[p.ajuste]} Mantenha todas as regras e o link exatamente igual.` }] }], env);
    }
    r.texto = umPrecoSo(r.texto, p.link);
    // Garante que o link de afiliado está na mensagem
    if (!r.texto.includes(p.link)) r.texto += "\n\n👉 " + p.link;
    return json(r);
  } catch (e) {
    return json({ erro: motivoIA(e), codigo: e.status === 429 ? "limite" : "ia" }, 502);
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
    let dados = await extrairProduto(url);
    if (dados.loja === "mercadolivre") dados = await completarPelaApiML(dados, env);
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

/** Teste rápido da IA (só diz se respondeu e o motivo do erro; guardado 10 min para não gastar cota) */
async function testarIA(env) {
  if (!env.GEMINI_API_KEY) return "sem chave";
  const guardado = await lerCache("teste-ia", "1");
  if (guardado) return guardado.r;
  let r;
  try { const x = await chamarGemini([{ role: "user", parts: [{ text: "Responda só: ok" }] }], env); r = "ok (" + x.modelo + ")"; }
  catch (e) { r = motivoIA(e); }
  await gravarCache("teste-ia", "1", { r }, 600);
  return r;
}

async function rotaStatus(request, env) {
  const testar = new URL(request.url).searchParams.get("testar") === "ia";
  return json({ ...(testar ? { testeIA: await testarIA(env) } : {}), ia: !!env.GEMINI_API_KEY, codigo: !!env.APP_SENHA, catalogo: { mercadolivre: !!(env.ML_APP_ID && env.ML_SECRET), shopee: !!(env.SHOPEE_APP_ID && env.SHOPEE_SECRET) } });
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

/* ======================= Catálogo (mais vendidos) ======================= */
const FILTROS_CATALOGO = {
  moda: { categoria: "moda", ml: "MLB1430", busca: "vestido feminino", shopee: "moda feminina" },
  beleza: { categoria: "beleza", ml: "MLB1246", busca: "skincare", shopee: "skincare maquiagem" },
  perfumes: { categoria: "beleza", ml: "MLB1271", busca: "perfume feminino", shopee: "perfume feminino" },
  acessorios: { categoria: "moda", ml: "MLB3937", busca: "relógio feminino", shopee: "bijuteria feminina" },
  casa: { categoria: "casa", ml: "MLB1574", busca: "decoração casa", shopee: "decoração casa" },
  fitness: { categoria: "saude", ml: "MLB1276", busca: "roupa fitness feminina", shopee: "roupa fitness feminina" },
  saude: { categoria: "saude", ml: "MLB264586", busca: "suplemento vitamina", shopee: "suplemento vitamina" },
  bebes: { categoria: "outros", ml: "MLB1384", busca: "enxoval bebê", shopee: "bebê enxoval" }
};
const ML_API = "https://api.mercadolibre.com";
const mlHttps = (u) => String(u || "").replace(/^http:/, "https:").replace(/-I\.(jpg|webp|png)$/i, "-O.$1");

/** Token do Mercado Livre (client_credentials), guardado por ~5 horas */
async function tokenML(env) {
  const guardado = await lerCache("ml-token", env.ML_APP_ID);
  if (guardado && guardado.token) return guardado.token;
  const r = await fetch(ML_API + "/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.ML_APP_ID, client_secret: env.ML_SECRET })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("Mercado Livre recusou as chaves (" + (d.message || d.error || r.status) + ")");
  await gravarCache("ml-token", env.ML_APP_ID, { token: d.access_token }, Math.min(18000, (d.expires_in || 21600) - 600));
  return d.access_token;
}
// O Cloudflare (plano grátis) permite ~50 chamadas por pedido: guardamos uma margem
let chamadasML = 0;
const LIMITE_ML = 42;
async function getML(caminho, token) {
  if (++chamadasML > LIMITE_ML) return { status: 0, dados: {} };
  const r = await fetch(ML_API + caminho, { headers: { authorization: "Bearer " + token, accept: "application/json" } });
  return { status: r.status, dados: await r.json().catch(() => ({})) };
}
/** IDs dos mais vendidos; se a categoria não tiver lista, tenta as subcategorias */
async function destaquesML(categoria, token, diag) {
  let r = await getML(`/highlights/MLB/category/${categoria}`, token);
  diag.push("destaques " + r.status);
  if (r.status === 200 && (r.dados.content || []).length) return r.dados.content;
  const cat = await getML(`/categories/${categoria}`, token);
  const filhas = (cat.dados.children_categories || []).slice(0, 6);
  let lista = [];
  for (const f of filhas) {
    r = await getML(`/highlights/MLB/category/${f.id}`, token);
    if (r.status === 200) lista = lista.concat((r.dados.content || []).slice(0, 5));
    if (lista.length >= 20) break;
  }
  diag.push("subcategorias " + filhas.length + "/" + lista.length);
  return lista;
}
/** Descobre a categoria certa pelo nome (quando o código da categoria não tem lista) */
async function destaquesPorBusca(termo, token, diag) {
  const r = await getML(`/sites/MLB/domain_discovery/search?limit=3&q=${encodeURIComponent(termo)}`, token);
  const cats = [...new Set((Array.isArray(r.dados) ? r.dados : []).map((x) => x.category_id).filter(Boolean))];
  diag.push("descoberta " + r.status + "/" + cats.length);
  let lista = [];
  for (const id of cats) {
    const h = await getML(`/highlights/MLB/category/${id}`, token);
    if (h.status === 200) lista = lista.concat(h.dados.content || []);
    if (lista.length >= 20) break;
  }
  return lista;
}
function itemML(b, filtro) {
  return { id: b.id, nome: b.title, preco: b.price || null, precoAntigo: b.original_price || null, imagem: mlHttps(b.thumbnail || ((b.pictures || [])[0] || {}).secure_url), link: b.permalink || `https://produto.mercadolivre.com.br/${String(b.id).replace(/^MLB/, "MLB-")}`, loja: "mercadolivre", categoria: filtro.categoria, afiliado: false };
}
/** Preço atual de um anúncio (o Mercado Livre passou a separar o preço do anúncio) */
async function precoML(id, token) {
  const r = await getML(`/items/${id}/sale_price?context=channel_marketplace`, token);
  if (r.status === 200 && r.dados.amount) return { preco: r.dados.amount, precoAntigo: r.dados.regular_amount || null };
  return null;
}
async function catalogoML(filtro, env) {
  chamadasML = 0;
  const token = await tokenML(env);
  const diag = [];
  let destaques = await destaquesML(filtro.ml, token, diag);
  if (!destaques.length && filtro.busca) destaques = await destaquesPorBusca(filtro.busca, token, diag);
  destaques = destaques.slice(0, 20);
  const tipos = {};
  for (const d of destaques) tipos[d.type] = (tipos[d.type] || 0) + 1;
  diag.push("tipos " + (Object.entries(tipos).map(([t, n]) => t + ":" + n).join(",") || "nenhum"));
  const ids = (tipo) => destaques.filter((d) => d.type === tipo).map((d) => d.id);
  const saida = [];

  // Anúncios (ITEM)
  const itens = ids("ITEM");
  if (itens.length) {
    const r = await getML(`/items?ids=${itens.join(",")}`, token);
    const codigos = {};
    const lista = [];
    for (const x of Array.isArray(r.dados) ? r.dados : []) {
      codigos[x.code] = (codigos[x.code] || 0) + 1;
      const b = x.body || {};
      if (x.code === 200 && b.title) lista.push(itemML(b, filtro));
    }
    await Promise.all(lista.filter((p) => !p.preco).map(async (p) => {
      const v = await precoML(p.id, token).catch(() => null);
      if (v) Object.assign(p, v);
    }));
    saida.push(...lista);
    diag.push("itens " + r.status + " " + Object.entries(codigos).map(([c, n]) => c + ":" + n).join(","));
  }

  // Produtos de catálogo (PRODUCT): preço vem do vencedor ou do primeiro anúncio
  for (const id of ids("PRODUCT")) {
    const r = await getML(`/products/${id}`, token);
    const b = r.dados || {};
    if (r.status !== 200 || !b.name) { if (r.status) diag.push("produto " + r.status); continue; }
    let preco = (b.buy_box_winner || {}).price || null, antigo = (b.buy_box_winner || {}).original_price || null;
    if (!preco) {
      const it = await getML(`/products/${id}/items?limit=1`, token);
      const x = ((it.dados && it.dados.results) || [])[0];
      if (x) { preco = x.price || null; antigo = x.original_price || null; }
    }
    saida.push({ id: b.id, nome: b.name, preco, precoAntigo: antigo, imagem: mlHttps(((b.pictures || [])[0] || {}).url), link: b.permalink || `https://www.mercadolivre.com.br/p/${b.id}`, loja: "mercadolivre", categoria: filtro.categoria, afiliado: false });
  }

  // Produtos de vendedor (USER_PRODUCT)
  for (const id of ids("USER_PRODUCT")) {
    const r = await getML(`/user-products/${id}`, token);
    const b = r.dados || {};
    if (r.status !== 200 || !b.name) { if (r.status) diag.push("user-product " + r.status); continue; }
    saida.push({ id: b.id || id, nome: b.name, preco: null, precoAntigo: null, imagem: mlHttps(((b.pictures || [])[0] || {}).url || ((b.pictures || [])[0] || {}).secure_url), link: b.permalink || `https://www.mercadolivre.com.br/up/${id}`, loja: "mercadolivre", categoria: filtro.categoria, afiliado: false });
  }

  // Plano B: busca da categoria ordenada por vendas
  if (!saida.length) {
    const r = await getML(`/sites/MLB/search?category=${filtro.ml}&sort=sold_quantity_desc&limit=20`, token);
    diag.push("busca " + r.status);
    for (const b of (r.dados && r.dados.results) || []) if (b.title) saida.push(itemML(b, filtro));
  }
  if (!saida.length) throw new Error("Mercado Livre não trouxe produtos (" + diag.join(" · ") + ")");
  // Os com preço primeiro
  return saida.sort((a, b) => (b.preco ? 1 : 0) - (a.preco ? 1 : 0));
}

/** Shopee Affiliate Open API (GraphQL, assinatura SHA256) — o link já vem como link de afiliado */
async function sha256Hex(texto) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function catalogoShopee(filtro, env) {
  const consulta = `{ productOfferV2(keyword: ${JSON.stringify(filtro.shopee)}, sortType: 2, page: 1, limit: 20) { nodes { itemId productName priceMin imageUrl offerLink commissionRate } } }`;
  const corpo = JSON.stringify({ query: consulta });
  const ts = Math.floor(Date.now() / 1000);
  const assinatura = await sha256Hex(env.SHOPEE_APP_ID + ts + corpo + env.SHOPEE_SECRET);
  const r = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `SHA256 Credential=${env.SHOPEE_APP_ID}, Timestamp=${ts}, Signature=${assinatura}` },
    body: corpo
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || (d.errors && d.errors.length)) throw new Error("Shopee: " + ((d.errors && d.errors[0] && d.errors[0].message) || "erro " + r.status));
  const nos = (d.data && d.data.productOfferV2 && d.data.productOfferV2.nodes) || [];
  return nos.filter((n) => n.productName && n.offerLink).map((n) => ({
    id: String(n.itemId), nome: n.productName, preco: Number(n.priceMin) || null, precoAntigo: null,
    imagem: n.imageUrl, link: n.offerLink, loja: "shopee", categoria: filtro.categoria, afiliado: true,
    comissao: n.commissionRate ? Math.round(Number(n.commissionRate) * 1000) / 10 : null
  }));
}

async function rotaCatalogo(request, env) {
  if (!senhaOk(request, env)) return json({ erro: "Código de acesso inválido.", codigo: "senha" }, 401);
  const q = new URL(request.url).searchParams;
  const nomeFiltro = FILTROS_CATALOGO[q.get("filtro")] ? q.get("filtro") : "moda";
  const loja = ["mercadolivre", "shopee"].includes(q.get("loja")) ? q.get("loja") : "todas";
  const configurado = { mercadolivre: !!(env.ML_APP_ID && env.ML_SECRET), shopee: !!(env.SHOPEE_APP_ID && env.SHOPEE_SECRET) };
  if (!configurado.mercadolivre && !configurado.shopee) return json({ configurado, produtos: [], avisos: [] });

  const chave = `${nomeFiltro}-${loja}-${configurado.mercadolivre}-${configurado.shopee}`;
  const guardado = await lerCache("catalogo", chave);
  if (guardado) return json({ ...guardado, doCache: true });

  const filtro = FILTROS_CATALOGO[nomeFiltro];
  const tarefas = [];
  if (configurado.mercadolivre && loja !== "shopee") tarefas.push(catalogoML(filtro, env));
  if (configurado.shopee && loja !== "mercadolivre") tarefas.push(catalogoShopee(filtro, env));
  const resultados = await Promise.allSettled(tarefas);
  const produtos = [], avisos = [];
  for (const r of resultados) {
    if (r.status === "fulfilled") produtos.push(...r.value);
    else avisos.push(r.reason && r.reason.message ? r.reason.message : "Uma loja não respondeu.");
  }
  // Intercala as lojas para a grade não ficar com uma loja só no topo
  const ml = produtos.filter((p) => p.loja === "mercadolivre"), sh = produtos.filter((p) => p.loja === "shopee");
  const mistura = [];
  for (let i = 0; i < Math.max(ml.length, sh.length); i++) { if (sh[i]) mistura.push(sh[i]); if (ml[i]) mistura.push(ml[i]); }
  const resposta = { configurado, produtos: mistura.slice(0, 30), avisos };
  if (mistura.length) await gravarCache("catalogo", chave, resposta, 1800); // 30 minutos
  return json(resposta);
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
      if (m && m[1] === "status" && metodo === "GET") return rotaStatus(request, env);
      if (m && m[1] === "entrar" && metodo === "POST") return await rotaEntrar(request, env);
      if (m && m[1] === "catalogo" && metodo === "GET") return await rotaCatalogo(request, env);
      if (m) return json({ erro: "Rota não encontrada." }, 404);
    } catch (e) {
      return json({ erro: "Erro no servidor: " + (e.message || e) }, 500);
    }
    // Todo o resto: arquivos do site (index.html, app.js, ícones...)
    return env.ASSETS.fetch(request);
  }
};
