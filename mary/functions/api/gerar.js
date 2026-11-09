/**
 * Mary Promo — POST /api/gerar
 * Recebe os dados do produto, monta o prompt e chama a API do Gemini.
 * A chave fica SÓ aqui no servidor (variável GEMINI_API_KEY no Cloudflare),
 * nunca no app que roda no celular.
 */

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

/** Monta o prompt base da Mary Promo com os dados do formulário */
export function montarPrompt(p) {
  const cat = CATEGORIAS[p.categoria] || CATEGORIAS.moda;
  const precos = p.precoAntigo
    ? `O preço caiu de ${brl(p.precoAntigo)} para ${brl(p.precoNovo)}.`
    : `O preço está ${brl(p.precoNovo)} (não há preço antigo: não fale em "caiu de").`;
  const cupom = p.cupom
    ? `Cupom de desconto: ${p.cupom} (mencione o cupom).`
    : "Não há cupom: NÃO mencione cupom.";

  return [
    "Atue como uma curadora de moda, beleza e utilidades para um grupo VIP de WhatsApp focado no público feminino, chamado Mary Promo.",
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

export async function onRequestPost({ request, env }) {
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
