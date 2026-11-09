/**
 * Miga Promo — leitura automática do produto (Mercado Livre e Shopee).
 * "Melhor esforço": segue o link curto de afiliado até a página do produto e lê
 * JSON-LD / meta tags (og:image, og:title, preço). Se a loja bloquear, o app
 * avisa e a usuária completa os campos à mão.
 */

const DOMINIOS = {
  mercadolivre: ["mercadolivre.com.br", "mercadolivre.com", "mercadolibre.com", "meli.la", "mlstatic.com"],
  shopee: ["shopee.com.br", "shope.ee", "shp.ee", "susercontent.com", "shopee.com"]
};
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

/** Diz de qual loja é a URL (ou null se não for permitida) */
export function lojaDaUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
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

const limparTitulo = (t) => String(t || "")
  .replace(/\s*[|\-–]\s*(Mercado Livre|MercadoLivre|Shopee Brasil|Shopee).*$/i, "")
  .replace(/^Compre\s+/i, "").trim();

/** Busca os dados do produto a partir do link de afiliado */
export async function extrairProduto(url) {
  const loja = lojaDaUrl(url);
  if (!loja) throw new Error("Use um link do Mercado Livre ou da Shopee.");

  const r = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", accept: "text/html" } });
  const html = r.ok ? await r.text() : "";
  const ld = produtoJsonLd(html);

  const dados = {
    loja,
    nome: limparTitulo(ld.nome || meta(html, "og:title") || meta(html, "twitter:title")),
    preco: ld.preco || numero(meta(html, "product:price:amount")) || numero(meta(html, "price")),
    precoAntigo: loja === "mercadolivre" ? precoAntigoML(html) : null,
    imagem: ld.imagem || meta(html, "og:image") || meta(html, "twitter:image"),
    urlFinal: r.url || url
  };
  if (dados.imagem && dados.imagem.startsWith("//")) dados.imagem = "https:" + dados.imagem;
  if (dados.precoAntigo && dados.preco && dados.precoAntigo <= dados.preco) dados.precoAntigo = null;
  dados.completo = !!(dados.nome && dados.preco && dados.imagem);
  return dados;
}
