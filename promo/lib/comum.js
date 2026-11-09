// Utilidades compartilhadas pelas funções do servidor (Cloudflare Pages Functions)

export function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

// Senha de acesso: impede que estranhos usem sua cota do Gemini.
// Configure APP_SENHA nas variáveis do Cloudflare. Sem ela, o app fica aberto.
export function senhaOk(request, env) {
  if (!env.APP_SENHA) return true;
  return request.headers.get("x-app-senha") === env.APP_SENHA;
}

// Só aceitamos links do Mercado Livre (evita usar o servidor como proxy aberto)
const DOMINIOS_ML = [
  "mercadolivre.com.br", "mercadolivre.com", "mercadolibre.com", "meli.la",
  "mlstatic.com", "mercadolibre.com.ar", "mercadolibre.com.mx"
];
export function ehDominioML(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();
    return DOMINIOS_ML.some((d) => h === d || h.endsWith("." + d));
  } catch (e) {
    return false;
  }
}
