// Extração de dados de produto do Mercado Livre (melhor esforço).
// 1) segue o link (inclusive links curtos de afiliado) até a página do produto;
// 2) tenta a API oficial de itens (com ML_TOKEN, se configurado);
// 3) se não der, lê a página: JSON-LD, meta tags Open Graph e preços.

import { ehDominioML } from "./comum.js";

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

const decodificar = (t) => String(t || "")
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2F;/g, "/").trim();

function meta(html, prop) {
  const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${prop}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? decodificar(m[1]) : "";
}

function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function idDoItem(texto) {
  const m = String(texto || "").match(/\bML[A-Z]-?(\d{6,})/i);
  if (!m) return "";
  const site = m[0].slice(0, 3).toUpperCase();
  return site + m[1];
}

function produtoDoJsonLd(html) {
  const blocos = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocos) {
    try {
      const dados = JSON.parse(b[1].trim());
      const lista = Array.isArray(dados) ? dados : dados["@graph"] || [dados];
      for (const d of lista) {
        if (!d || !/Product/i.test(String(d["@type"]))) continue;
        const ofertas = Array.isArray(d.offers) ? d.offers[0] : d.offers || {};
        return {
          nome: decodificar(d.name),
          imagem: Array.isArray(d.image) ? d.image[0] : d.image || "",
          preco: numero(ofertas.price ?? ofertas.lowPrice)
        };
      }
    } catch (e) { /* bloco inválido: ignora */ }
  }
  return null;
}

// "Antes: 199 reais com 90 centavos" → 199.9
function precoAntigoDaPagina(html) {
  const m = html.match(/aria-label=["']Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d{1,2})\s*centavos)?/i);
  if (m) return numero(m[1].replace(/\./g, "") + "." + (m[2] || "0").padStart(2, "0"));
  const s = html.match(/andes-money-amount--previous[\s\S]{0,400}?andes-money-amount__fraction[^>]*>([\d.]+)<[\s\S]{0,200}?(?:andes-money-amount__cents[^>]*>(\d{1,2})<)?/i);
  if (s) return numero(s[1].replace(/\./g, "") + "." + (s[2] || "0").padStart(2, "0"));
  return null;
}

async function viaApi(id, env) {
  if (!id) return null;
  const headers = { accept: "application/json" };
  if (env.ML_TOKEN) headers.authorization = "Bearer " + env.ML_TOKEN;
  const r = await fetch("https://api.mercadolibre.com/items/" + id, { headers });
  if (!r.ok) return null;
  const d = await r.json();
  return {
    nome: d.title || "",
    preco: numero(d.price),
    precoAntigo: numero(d.original_price),
    imagem: (d.pictures && d.pictures[0] && (d.pictures[0].secure_url || d.pictures[0].url)) || d.secure_thumbnail || "",
    fonte: "api"
  };
}

export async function extrairProduto(url, env = {}) {
  if (!ehDominioML(url)) throw new Error("Use um link do Mercado Livre.");

  // Segue redirecionamentos (links curtos de afiliado) até a página final
  const resp = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", accept: "text/html" }
  });
  const urlFinal = resp.url || url;
  const html = resp.ok ? await resp.text() : "";

  const id = idDoItem(urlFinal) || idDoItem(html);
  let dados = null;
  try { dados = await viaApi(id, env); } catch (e) { dados = null; }

  if (!dados || !dados.nome || !dados.preco) {
    const ld = produtoDoJsonLd(html) || {};
    const pagina = {
      nome: ld.nome || meta(html, "og:title").replace(/\s*\|\s*Mercado Livre.*$/i, ""),
      preco: ld.preco || numero(meta(html, "price")) || numero(meta(html, "product:price:amount")),
      precoAntigo: precoAntigoDaPagina(html),
      imagem: ld.imagem || meta(html, "og:image"),
      fonte: "pagina"
    };
    dados = {
      nome: (dados && dados.nome) || pagina.nome,
      preco: (dados && dados.preco) || pagina.preco,
      precoAntigo: (dados && dados.precoAntigo) || pagina.precoAntigo,
      imagem: (dados && dados.imagem) || pagina.imagem,
      fonte: dados ? "api+pagina" : "pagina"
    };
  }

  if (dados.precoAntigo && dados.preco && dados.precoAntigo <= dados.preco) dados.precoAntigo = null;
  return { ...dados, id, urlFinal, status: resp.status };
}
