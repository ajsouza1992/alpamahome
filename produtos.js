/*
 * ALPAMA HOME — catálogo de produtos
 * ------------------------------------------------------------
 * Este arquivo é gerado pelo painel (admin.html → "Baixar produtos.js").
 * Você também pode editar à mão. Campos de cada produto:
 *   id          texto único
 *   nome        nome do produto
 *   preco       preço atual (número, ex.: 129.9)
 *   precoAntigo preço "de" (opcional, mostra % de desconto)
 *   categoria   uma das chaves de CATEGORIAS (abaixo)
 *   loja        "mercadolivre" (por enquanto só Mercado Livre)
 *   link        seu link de afiliado
 *   imagem      URL da imagem (clique direito na foto do produto → copiar endereço)
 *   descricao   texto curto (opcional)
 *   destaque    true para aparecer em "Destaques"
 */
window.CATEGORIAS = [
  { id: "decoracao", nome: "Decoração", icone: "🪴" },
  { id: "sala", nome: "Sala de Estar", icone: "🛋️" },
  { id: "quarto", nome: "Cama & Quarto", icone: "🛏️" },
  { id: "cozinha", nome: "Cozinha", icone: "🍳" },
  { id: "banheiro", nome: "Banheiro", icone: "🛁" },
  { id: "lazer", nome: "Área de Lazer", icone: "☀️" },
  { id: "iluminacao", nome: "Iluminação", icone: "💡" },
  { id: "organizacao", nome: "Organização", icone: "🧺" },
  { id: "jardim", nome: "Jardim", icone: "🌿" },
  { id: "utilidades", nome: "Utilidades", icone: "🧰" }
];

window.PRODUTOS = [
  {
    id: "exemplo-1",
    nome: "Vaso de Cerâmica Decorativo Bege (exemplo)",
    preco: 89.9,
    precoAntigo: 129.9,
    categoria: "decoracao",
    loja: "mercadolivre",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    descricao: "Produto de exemplo — substitua pelo seu link de afiliado no painel.",
    destaque: true
  },
  {
    id: "exemplo-2",
    nome: "Jogo de Lençol Casal 400 Fios (exemplo)",
    preco: 149.0,
    precoAntigo: 199.0,
    categoria: "quarto",
    loja: "mercadolivre",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    descricao: "Produto de exemplo — substitua pelo seu link de afiliado no painel.",
    destaque: true
  },
  {
    id: "exemplo-3",
    nome: "Espreguiçadeira de Alumínio para Piscina (exemplo)",
    preco: 389.0,
    precoAntigo: null,
    categoria: "lazer",
    loja: "mercadolivre",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    descricao: "Produto de exemplo — substitua pelo seu link de afiliado no painel.",
    destaque: false
  },
  {
    id: "exemplo-4",
    nome: "Luminária de Piso Tripé Madeira (exemplo)",
    preco: 219.9,
    precoAntigo: 279.9,
    categoria: "iluminacao",
    loja: "mercadolivre",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    descricao: "Produto de exemplo — substitua pelo seu link de afiliado no painel.",
    destaque: true
  },
  {
    id: "exemplo-5",
    nome: "Cesto Organizador de Palha Natural (exemplo)",
    preco: 39.9,
    precoAntigo: null,
    categoria: "organizacao",
    loja: "mercadolivre",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    descricao: "Produto de exemplo — substitua pelo seu link de afiliado no painel.",
    destaque: false
  },
  {
    id: "exemplo-6",
    nome: "Conjunto de Panelas Antiaderente 5 Peças (exemplo)",
    preco: 299.0,
    precoAntigo: 459.0,
    categoria: "cozinha",
    loja: "mercadolivre",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    descricao: "Produto de exemplo — substitua pelo seu link de afiliado no painel.",
    destaque: false
  }
];
