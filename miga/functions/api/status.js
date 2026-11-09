// GET /api/status — diz ao app se a IA está configurada (sem revelar a chave)
export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({ ia: !!env.GEMINI_API_KEY, senha: !!env.APP_SENHA }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
