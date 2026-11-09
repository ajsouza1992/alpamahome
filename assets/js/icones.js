/*
 * Ícones Alpama Home — silhuetas sólidas no estilo do logo
 * (creme sobre verde). Usados no site e no painel.
 */
window.ICONES = {
  casa: '<path d="M12 2.8 2.2 10.6V21.2h7.3v-6.4h5v6.4h7.3V10.6z"/>',
  decoracao: '<path d="M8.6 1.8h6.8v2.6c2.7 1.4 4.2 4 4.2 7.3 0 5.3-3.3 10.5-7.6 10.5S4.4 17 4.4 11.7c0-3.3 1.5-5.9 4.2-7.3zM7.2 11.2h9.6v1.8H7.2z" fill-rule="evenodd"/>',
  sala: '<path d="M5 6.2a3.2 3.2 0 0 1 3.2-3.2h7.6A3.2 3.2 0 0 1 19 6.2v3a3.4 3.4 0 0 0-3 3.3v.6H8v-.6a3.4 3.4 0 0 0-3-3.3zM.8 12.4a2.6 2.6 0 0 1 5.2 0v2.8h12v-2.8a2.6 2.6 0 0 1 5.2 0v6.2H.8zM2.8 19.2h2.6v2.2H2.8zM18.6 19.2h2.6v2.2h-2.6z"/>',
  quarto: '<path d="M1.6 4.2h2.6v8h17.6a.6.6 0 0 1 .6.6v7.4h-2.6v-2.6H4.2v2.6H1.6zM7.4 6.4a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM11 6.4h6.8a4.2 4.2 0 0 1 4.2 4.2v.4H11z"/>',
  cozinha: '<path d="M8 7.4c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6zM10.8 2h2.4v1.8h-2.4zM2.6 8.6h18.8v2.2h-1.2v5.4a4.4 4.4 0 0 1-4.4 4.4H8.2a4.4 4.4 0 0 1-4.4-4.4v-5.4H2.6zM.4 10.8h3v2H.4zM20.6 10.8h3v2h-3z"/>',
  banheiro: '<path d="M4.6 10.2V5.6a3.2 3.2 0 0 1 6.4 0v.6H8.8v-.6a1 1 0 0 0-2 0v4.6zM1.6 11.2h20.8v2.4a6.6 6.6 0 0 1-6.6 6.6H8.2a6.6 6.6 0 0 1-6.6-6.6zM5.8 20.4h2.6l-1 2.6H4.8zM15.6 20.4h2.6l1 2.6h-2.6z"/>',
  lazer: '<path d="M12 1.6A10.4 10.4 0 0 1 22.4 12H1.6A10.4 10.4 0 0 1 12 1.6zM10.9 12h2.2v7.8h4.4v2.4h-11v-2.4h4.4z"/>',
  iluminacao: '<path d="M6.8 1.8h10.4l3.6 8.4H3.2zM10.9 10.2h2.2v9.6h4.4v2.4h-11v-2.4h4.4z"/>',
  organizacao: '<path d="M6.6 8.2 11.2 1.8h1.6l4.6 6.4h-2.6L12 4.4 9.2 8.2zM1.8 9.2h20.4l-2.3 11.2a2 2 0 0 1-2 1.6H6.1a2 2 0 0 1-2-1.6zM7.6 12.2v6.4h1.8v-6.4zM11.1 12.2v6.4h1.8v-6.4zM14.6 12.2v6.4h1.8v-6.4z" fill-rule="evenodd"/>',
  jardim: '<path d="M6.6 14h10.8l-1.6 8H8.2zM10.9 9h2.2v5h-2.2zM11.4 9.6C11.4 5.4 8.4 3 3.2 3c0 4.4 3 6.6 8.2 6.6zM12.6 8.6c0-3.8 2.6-6.6 8.4-6.6 0 4.8-3.2 6.6-8.4 6.6z"/>',
  utilidades: '<path d="M7.8 8.6V5.8A2.2 2.2 0 0 1 10 3.6h4a2.2 2.2 0 0 1 2.2 2.2v2.8h-2.4V6h-3.6v2.6zM2.4 8.6h19.2v11.8H2.4zM2.4 13h19.2v1.8H2.4zM10.4 12.2h3.2v3.4h-3.2z" fill-rule="evenodd"/>',
  cadeado: '<path d="M6.5 10V7.5a5.5 5.5 0 0 1 11 0V10h1.3a1.2 1.2 0 0 1 1.2 1.2v9.6a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 20.8v-9.6A1.2 1.2 0 0 1 5.2 10zM9 10h6V7.5a3 3 0 0 0-6 0zM11 14.2h2v4h-2z" fill-rule="evenodd"/>'
};

window.icone = function (id, cls) {
  var d = window.ICONES[id] || window.ICONES.casa;
  return '<svg class="' + (cls || "ico") + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + d + "</svg>";
};
