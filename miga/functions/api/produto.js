// POST /api/produto { url } → { loja, nome, preco, precoAntigo, imagem, completo }
import { extrairProduto } from "../../lib/extrair.js";

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function onRequestPost({ request, env }) {
  if (env.APP_SENHA && request.headers.get("x-app-senha") !== env.APP_SENHA) return json({ erro: "Senha de acesso inválida.", codigo: "senha" }, 401);
  let b;
  try { b = await request.json(); } catch (e) { return json({ erro: "Requisição inválida." }, 400); }
  try {
    return json(await extrairProduto(String(b.url || "").trim()));
  } catch (e) {
    return json({ erro: e.message || "Não consegui ler o produto." }, 422);
  }
}
