// POST /api/produto  { url }  → { nome, preco, precoAntigo, imagem, ... }
import { json, senhaOk } from "../../lib/comum.js";
import { extrairProduto } from "../../lib/mercadolivre.js";

export async function onRequestPost({ request, env }) {
  if (!senhaOk(request, env)) return json({ erro: "Senha de acesso inválida." }, 401);
  let corpo;
  try { corpo = await request.json(); } catch (e) { return json({ erro: "Requisição inválida." }, 400); }
  const url = String(corpo.url || "").trim();
  try {
    const dados = await extrairProduto(url, env);
    const completo = !!(dados.nome && dados.preco);
    return json({ ...dados, completo });
  } catch (e) {
    return json({ erro: e.message || "Não foi possível ler o produto." }, 422);
  }
}
