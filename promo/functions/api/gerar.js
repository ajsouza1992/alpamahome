// POST /api/gerar  { nome, preco, precoAntigo, cupom, link, tom, extra } → { texto }
import { json, senhaOk } from "../../lib/comum.js";
import { gerarComGemini } from "../../lib/gemini.js";

export async function onRequestPost({ request, env }) {
  if (!senhaOk(request, env)) return json({ erro: "Senha de acesso inválida." }, 401);
  let p;
  try { p = await request.json(); } catch (e) { return json({ erro: "Requisição inválida." }, 400); }
  const produto = {
    nome: String(p.nome || "").slice(0, 200).trim(),
    preco: Number(p.preco),
    precoAntigo: p.precoAntigo ? Number(p.precoAntigo) : null,
    cupom: String(p.cupom || "").slice(0, 40).trim(),
    extra: String(p.extra || "").slice(0, 200).trim(),
    link: String(p.link || "").trim(),
    tom: String(p.tom || "urgente")
  };
  if (!produto.nome || !Number.isFinite(produto.preco) || !/^https?:\/\//.test(produto.link)) {
    return json({ erro: "Preencha nome, preço e link." }, 400);
  }
  try {
    const r = await gerarComGemini(produto, env);
    return json(r);
  } catch (e) {
    return json({ erro: e.message, codigo: e.codigo || "erro" }, e.codigo === "sem-chave" ? 503 : 502);
  }
}
