// GET /api/imagem?url=...  → devolve a imagem do produto (para compartilhar como arquivo no celular)
import { ehDominioML } from "../../lib/comum.js";

export async function onRequestGet({ request }) {
  const alvo = new URL(request.url).searchParams.get("url") || "";
  if (!ehDominioML(alvo)) return new Response("Imagem não permitida", { status: 400 });
  const r = await fetch(alvo, { headers: { accept: "image/*" } });
  const tipo = r.headers.get("content-type") || "";
  if (!r.ok || !tipo.startsWith("image/")) return new Response("Imagem indisponível", { status: 502 });
  return new Response(r.body, { headers: { "content-type": tipo, "cache-control": "public, max-age=86400" } });
}
