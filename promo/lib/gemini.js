// Gera a mensagem de promoção com a API do Gemini (Google AI Studio).

const TONS = {
  urgente: "Tom de urgência e escassez real (ex.: 'corre', 'pode acabar a qualquer momento'), energia alta.",
  divertido: "Tom bem-humorado e leve, com uma brincadeira curta relacionada ao produto.",
  elegante: "Tom sofisticado e acolhedor, focado em conforto e estilo para a casa. Poucos emojis.",
  curto: "Mensagem bem curta: no máximo 4 linhas."
};

export function montarPrompt(p) {
  const brl = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const desconto = p.precoAntigo && p.precoAntigo > p.preco ? Math.round((1 - p.preco / p.precoAntigo) * 100) : 0;
  const linhas = [
    `Produto: ${p.nome}`,
    `Preço atual: ${brl(p.preco)}`,
    p.precoAntigo ? `Preço antigo: ${brl(p.precoAntigo)} (${desconto}% de desconto)` : "Preço antigo: não informado (NÃO mencione desconto nem preço antigo)",
    p.cupom ? `Cupom: ${p.cupom}` : "Cupom: nenhum (NÃO mencione cupom)",
    p.extra ? `Observações do administrador: ${p.extra}` : "",
    `Link de compra: ${p.link}`
  ].filter(Boolean);

  const sistema = [
    "Você é um especialista em copywriting para grupos de promoções no WhatsApp no Brasil.",
    "Escreva em português do Brasil, usando a formatação do WhatsApp: *negrito*, _itálico_, ~riscado~.",
    "Estrutura: 1) chamada curta e chamativa com emoji; 2) nome do produto em *negrito*;",
    "3) preço: se houver preço antigo, use '~de R$ X~ por *R$ Y*'; 4) cupom, se houver; 5) uma frase de benefício;",
    "6) o link de compra sozinho em uma linha, exatamente como recebido; 7) uma chamada final curta.",
    "Regras: não invente informações (frete grátis, parcelamento, estoque, avaliações) que não foram fornecidas;",
    "não altere o link; não use hashtags; no máximo 600 caracteres; responda SOMENTE com a mensagem, sem comentários."
  ].join(" ");

  return { sistema, usuario: `${TONS[p.tom] || TONS.urgente}\n\n${linhas.join("\n")}` };
}

export async function gerarComGemini(produto, env) {
  if (!env.GEMINI_API_KEY) throw Object.assign(new Error("GEMINI_API_KEY não configurada"), { codigo: "sem-chave" });
  const modelo = env.GEMINI_MODEL || "gemini-2.5-flash";
  const { sistema, usuario } = montarPrompt(produto);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: "user", parts: [{ text: usuario }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((d.error && d.error.message) || "Erro na API do Gemini"), { codigo: "api", status: r.status });
  const partes = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  let texto = partes.map((x) => x.text || "").join("").trim();
  texto = texto.replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").trim();
  if (!texto) throw Object.assign(new Error("A IA não devolveu texto"), { codigo: "vazio" });
  // Garante que o link exato está na mensagem
  if (!texto.includes(produto.link)) texto += "\n\n👉 " + produto.link;
  return { texto, modelo };
}
