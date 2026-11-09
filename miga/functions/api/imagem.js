// GET /api/imagem?url=... → devolve a foto do produto (para enviar junto no WhatsApp)
import { lojaDaUrl } from "../../lib/extrair.js";

export async function onRequestGet({ request }) {
  const alvo = new URL(request.url).searchParams.get("url") || "";
  if (!lojaDaUrl(alvo)) return new Response("Imagem não permitida", { status: 400 });
  const r = await fetch(alvo, { headers: { accept: "image/*" } });
  const tipo = r.headers.get("content-type") || "";
  if (!r.ok || !tipo.startsWith("image/")) return new Response("Imagem indisponível", { status: 502 });
  return new Response(r.body, { headers: { "content-type": tipo, "cache-control": "public, max-age=86400" } });
}
