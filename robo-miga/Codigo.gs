/**
 * Robô da Miga Promo (Google Apps Script)
 * ---------------------------------------
 * Roda sozinho a cada 30 minutos, mesmo com o app fechado:
 *  1. Confere na loja o preço dos produtos do SITE e da MINHA LISTA (cada um no máximo a cada 6 horas).
 *  2. Põe o seu link de afiliado (Shopee) e o link direto do Mercado Livre com o seu código.
 *  3. Tira do site os anúncios ENCERRADOS e esconde os PAUSADOS.
 *  4. Refaz os pacotes que o site lê (vitrine/miga/pacotes).
 *  5. Manda um e-mail quando algum preço BAIXA (para você postar na hora).
 *  6. A cada 5 minutos: completa foto, nome e preço dos produtos da Shopee que o app não conseguiu ler
 *     (link curto s.shopee.com.br que a Shopee não deixa o servidor do site abrir).
 *
 * Precisa (Projeto > Configurações > Propriedades do script):
 *  - ROBO_CHAVE: a mesma chave cadastrada no Cloudflare (Variáveis e segredos) com o nome ROBO_CHAVE.
 * Opcional:
 *  - EMAIL: para onde mandar os avisos (sem isso, vai para a conta dona do robô).
 *  - QUEDA_MIN: queda mínima em % para avisar (padrão 10).
 *
 * Funções para rodar à mão (menu "Executar"):
 *  - instalar(): liga o robô (a cada 30 minutos + a conferência rápida da Shopee a cada 5 minutos).
 *  - testar(): roda uma vez agora e mostra o resumo no registro.
 *  - desinstalar(): desliga o robô.
 */

var CFG = {
  projeto: 'miga-promo-d4f51',
  site: 'https://www.migapromo.com',
  validadeHoras: 6,      // cada produto é conferido no máximo a cada 6 horas
  semLinkHoras: 1,       // produto do ML ainda sem o link direto: tenta de novo a cada 1 hora
  porRodada: 120,        // quantos produtos por rodada
  lote: 8,               // quantos pedidos ao mesmo tempo
  tempoMaxMs: 4.5 * 60 * 1000 // para antes do limite de 6 minutos do Google
};
var BASE_FS = 'https://firestore.googleapis.com/v1/projects/' + CFG.projeto + '/databases/(default)/documents';
var ML_FORA = ['closed', 'inactive'], ML_PAUSADO = ['paused', 'under_review', 'sumiu'];

/* ===================== Funções para você rodar ===================== */
function instalar() {
  desinstalar();
  ScriptApp.newTrigger('rodar').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('completarShopee').timeBased().everyMinutes(5).create();
  Logger.log('Robô ligado: roda a cada 30 minutos (e a Shopee pendente a cada 5). Rodando a primeira vez agora...');
  rodar();
}
function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (['rodar', 'completarShopee'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  Logger.log('Robô desligado.');
}
function testar() { var r = rodar(); Logger.log(JSON.stringify(r, null, 2)); }

/* ===================== Shopee pendente (a cada 5 minutos) ===================== */
/** O app marca em espacos/miga/robo/pendentes os produtos da Shopee que não conseguiu ler.
 *  Daqui (servidores do Google) o link curto abre: achamos o código do produto e pedimos os dados ao site. */
function completarShopee() {
  var pend = fsGet('espacos/miga/robo/pendentes'); // 1 leitura só, mesmo sem nada pendente
  var itens = (pend && pend.itens) || {}, ids = Object.keys(itens);
  if (!ids.length) return { pendentes: 0 };
  var chave = prop('ROBO_CHAVE'); if (!chave) throw new Error('Falta a ROBO_CHAVE nas Propriedades do script.');
  var res = { pendentes: ids.length, completos: 0, falhas: 0 };
  ids.slice(0, 15).forEach(function (id) {
    var link = itens[id], feito = false;
    try {
      var cod = codigoShopee(link);
      if (cod) {
        var r = UrlFetchApp.fetch(CFG.site + '/api/produto', pedidoApi('produto', { url: 'https://shopee.com.br/product/' + cod.loja + '/' + cod.item }, chave));
        var d = r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
        if (d && (d.imagem || d.preco)) {
          var it = fsGet('espacos/miga/lista/' + id);
          if (it) {
            var m = { pendenteRobo: null, diag: null, urlFinal: 'https://shopee.com.br/product/' + cod.loja + '/' + cod.item };
            if (d.nome && !it.nome) m.nome = d.nome;
            if (d.preco) m.precoNovo = d.preco;
            if (d.precoAntigo && d.precoAntigo > d.preco) m.precoAntigo = d.precoAntigo;
            if (d.imagem && !it.imagem) m.imagem = d.imagem;
            ['nota', 'vendidos', 'lojaOficial', 'comissao', 'comissaoValor'].forEach(function (k) { if (d[k] != null && d[k] !== false && d[k] !== '') m[k] = d[k]; });
            if (!it.textoEditado) m.texto = '';
            fsPatch('espacos/miga/lista/' + id, m);
          }
          feito = true; res.completos++;
        }
      }
    } catch (e) { console.log('Shopee ' + id + ': ' + e.message); }
    var tentativas = ((pend.tentativas || {})[id] || 0) + 1;
    if (feito || tentativas >= 6) tirarPendente(id); // depois de 6 tentativas (30 min) desiste: complete pelo app
    else { res.falhas++; fsReq('patch', 'espacos/miga/robo/pendentes?updateMask.fieldPaths=' + encodeURIComponent('tentativas.`' + id + '`'), { fields: { tentativas: { mapValue: { fields: (function () { var f = {}; f[id] = { integerValue: String(tentativas) }; return f; })() } } } }); }
  });
  console.log('Shopee pendente: ' + JSON.stringify(res));
  return res;
}
function tirarPendente(id) {
  var mask = ['itens.`' + id + '`', 'tentativas.`' + id + '`'].map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  fsReq('patch', 'espacos/miga/robo/pendentes?' + mask, { fields: {} }); // campo no "mask" e sem valor = apaga
}
/** Segue o link curto da Shopee e devolve { loja, item } */
function codigoShopee(link) {
  var atual = link;
  for (var pulo = 0; pulo < 8; pulo++) {
    var achou = idsShopee(atual); if (achou) return achou;
    var r = UrlFetchApp.fetch(atual, { followRedirects: false, muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36', 'Accept-Language': 'pt-BR,pt;q=0.9' } });
    var h = r.getHeaders(), destino = h.Location || h.location;
    if (destino) { atual = destino.indexOf('http') === 0 ? destino : 'https://shopee.com.br' + destino; continue; }
    var html = r.getContentText().slice(0, 400000);
    return idsShopee(html);
  }
  return idsShopee(atual);
}
function idsShopee(t) {
  t = String(t || ''); for (var i = 0; i < 3; i++) { try { var d = decodeURIComponent(t); if (d === t) break; t = d; } catch (e) { break; } }
  var m = t.match(/-i\.(\d{3,})\.(\d{3,})/) || t.match(/\/(?:product|opaanlp)\/(\d{3,})\/(\d{3,})/) || t.match(/shopid=(\d{3,})[^\d]+itemid=(\d{3,})/i);
  if (m) return { loja: m[1], item: m[2] };
  var m2 = t.match(/itemid=(\d{3,})[^\d]+shopid=(\d{3,})/i) || t.match(/"itemid"\s*:\s*(\d{3,})[^}]{0,200}?"shopid"\s*:\s*(\d{3,})/i);
  return m2 ? { loja: m2[2], item: m2[1] } : null;
}

/* ===================== Rodada ===================== */
function rodar() {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(5000)) return { pulou: 'outra rodada ainda está rodando' };
  var inicio = Date.now(), res = { conferidos: 0, precos: 0, links: 0, sairamDoSite: 0, pausados: 0, quedas: 0, erros: 0 };
  try {
    var chave = prop('ROBO_CHAVE');
    if (!chave || chave.length < 24) throw new Error('Falta a ROBO_CHAVE (24+ caracteres) nas Propriedades do script.');
    var cfgApp = fsGet('espacos/miga/config/app') || {};
    var ml = { word: cfgApp.mlMattWord || '', tool: cfgApp.mlMattTool || '' };
    var site = fsList('vitrine/miga/produtos'), lista = fsList('espacos/miga/lista');
    var siteMap = {}; site.forEach(function (p) { if (p.id) siteMap[p.id] = p; });
    var listaMap = {}; lista.forEach(function (i) { if (i.id) listaMap[i.id] = i; });

    // O que conferir: Minha lista + produtos só do site, dos mais antigos para os mais novos
    var estado = fsGet('espacos/miga/robo/estado') || {}; // memória do robô (as Propriedades do script são pequenas demais)
    var conf = estado.conf || {}, agora = Date.now(), tarefas = [];
    var velho = function (id, x) {
      var semLink = loja(x) === 'mercadolivre' && !x.linkML;
      var ultimo = Math.max(conf[id] || 0, semLink ? 0 : (x.precoConferidoEm || 0));
      return agora - ultimo > (semLink ? CFG.semLinkHoras : CFG.validadeHoras) * 36e5;
    };
    lista.forEach(function (i) { if (i.id && i.link && !i.carregando && velho(i.id, i)) tarefas.push({ id: i.id, link: i.link, lista: true, ult: conf[i.id] || 0 }); });
    site.forEach(function (p) { if (p.id && p.link && !listaMap[p.id] && velho(p.id, p)) tarefas.push({ id: p.id, link: p.link, lista: false, ult: conf[p.id] || 0 }); });
    tarefas.sort(function (a, b) { return a.ult - b.ult; });
    tarefas = tarefas.slice(0, CFG.porRodada);

    var alertados = estado.alertados || {}, quedaMin = Number(prop('QUEDA_MIN') || 10), quedas = [], mudouSite = false;
    for (var k = 0; k < tarefas.length; k += CFG.lote) {
      if (Date.now() - inicio > CFG.tempoMaxMs) break;
      var grupo = tarefas.slice(k, k + CFG.lote);
      var resp = UrlFetchApp.fetchAll(grupo.map(function (t) { return pedidoApi('produto', { url: t.link }, chave); }));
      for (var j = 0; j < grupo.length; j++) {
        var t = grupo[j], d = null;
        try { d = resp[j].getResponseCode() === 200 ? JSON.parse(resp[j].getContentText()) : null; } catch (e) { d = null; }
        if (resp[j].getResponseCode() === 401) throw new Error('O servidor recusou a ROBO_CHAVE. Confira se é igual à do Cloudflare.');
        if (!d) { res.erros++; continue; }
        conf[t.id] = Date.now(); res.conferidos++;
        var r = aplicar(t, d, listaMap, siteMap, ml, chave);
        if (r.preco) res.precos++; if (r.link) res.links++; if (r.saiu) res.sairamDoSite++; if (r.pausado) res.pausados++;
        if (r.mudouSite) mudouSite = true;
        if (r.queda && r.queda.pct >= quedaMin && alertados[t.id] !== r.queda.por) { quedas.push(r.queda); alertados[t.id] = r.queda.por; }
        if (r.queda && r.queda.pct >= quedaMin) alertados['_em_' + t.id] = Date.now();
      }
    }

    if (mudouSite) refazerPacotes();
    limparVelhos(conf, 30);
    Object.keys(alertados).forEach(function (k) { if (k.indexOf('_em_') === 0 && alertados[k] < Date.now() - 30 * 864e5) { delete alertados[k]; delete alertados[k.slice(4)]; } });
    fsSet('espacos/miga/robo/estado', { conf: conf, alertados: alertados, ultimaRodada: Date.now() });
    if (quedas.length) { avisarQuedas(quedas); res.quedas = quedas.length; }
    res.ms = Date.now() - inicio;
    console.log('Rodada: ' + JSON.stringify(res));
    return res;
  } finally { trava.releaseLock(); }
}

/** Aplica o que veio da loja num produto (Minha lista e/ou Site) */
function aplicar(t, d, listaMap, siteMap, ml, chave) {
  var r = { preco: false, link: false, saiu: false, pausado: false, mudouSite: false, queda: null };
  var st = d.statusML || '', fora = ML_FORA.indexOf(st) >= 0, pausado = ML_PAUSADO.indexOf(st) >= 0;
  var antigoDe = function (x) { return x.precoAntigo && x.precoAntigo > x.preco ? x.precoAntigo : null; };
  var it = t.lista ? listaMap[t.id] : null, p = siteMap[t.id] || null;

  // Minha lista
  if (it) {
    var mudou = {}, precoAntes = it.precoNovo || null;
    if (d.preco && (d.preco !== it.precoNovo || antigoDe(d) !== (it.precoAntigo || null))) { mudou.precoNovo = d.preco; mudou.precoAntigo = antigoDe(d); r.preco = true; }
    if (d.linkML && d.linkML !== it.linkML) { mudou.linkML = d.linkML; r.link = true; }
    if (!!it.pausadoML !== (fora || pausado)) mudou.pausadoML = fora || pausado;
    var af = shopeeAfiliado(it, chave); if (af) { mudou.linkOriginal = it.link; mudou.link = af; mudou.afOk = true; r.link = true; }
    if ((r.preco || mudou.linkML || af) && !it.textoEditado) mudou.texto = '';
    if (Object.keys(mudou).length) { fsPatch('espacos/miga/lista/' + t.id, mudou); for (var c in mudou) it[c] = mudou[c]; }
    if (r.preco && precoAntes && d.preco < precoAntes) r.queda = queda(it, precoAntes, d.preco, 'Minha lista', ml);
  }
  // Site
  if (p) {
    if (fora) { fsDelete('vitrine/miga/produtos/' + t.id); delete siteMap[t.id]; r.saiu = true; r.mudouSite = true; return r; }
    var nv = {}, precoSite = p.preco || null;
    if (d.preco && (d.preco !== p.preco || antigoDe(d) !== (p.precoAntigo || null) || p.indisponivel)) { nv.preco = d.preco; nv.precoAntigo = antigoDe(d); nv.indisponivel = false; r.preco = true; }
    var lm = linkDiretoML(d.linkML, ml); if (lm && lm !== p.linkML) { nv.linkML = lm; r.link = true; }
    if (!!p.pausado !== pausado) { nv.pausado = pausado; }
    if (it && it.afOk && it.link !== p.link) { nv.link = it.link; nv.afOk = true; r.link = true; }
    else if (!it) { var af2 = shopeeAfiliado(p, chave); if (af2) { nv.link = af2; nv.afOk = true; r.link = true; } }
    if (Object.keys(nv).length) {
      nv.precoConferidoEm = Date.now(); fsPatch('vitrine/miga/produtos/' + t.id, nv); for (var c2 in nv) p[c2] = nv[c2]; r.mudouSite = true;
      if (!r.queda && nv.preco && precoSite && nv.preco < precoSite) r.queda = queda(p, precoSite, nv.preco, 'Site', ml);
    }
  }
  r.pausado = pausado;
  return r;
}

function queda(x, de, por, onde, ml) {
  return { id: x.id, nome: String(x.nome || 'Produto'), de: de, por: por, pct: Math.round((1 - por / de) * 100), onde: onde, imagem: /^https:\/\//.test(x.imagem || '') ? x.imagem : '', link: (loja(x) === 'mercadolivre' && linkDiretoML(x.linkML, ml)) || x.link || '' };
}

/* ===================== Links de afiliado ===================== */
function loja(x) { var l = String(x.link || ''); return x.loja || (/shopee/i.test(l) ? 'shopee' : /mercadoli|meli\.la/i.test(l) ? 'mercadolivre' : ''); }
function linkOficialML(u) { return /mercadolivre\.com\/sec\/|meli\.la\//i.test(String(u || '')); }
function comCodigoML(u, ml) {
  var l = String(u || '').trim();
  if (!l || linkOficialML(l) || /[?&]matt_word=/.test(l) || !ml.word || !ml.tool) return l;
  return l + (l.indexOf('?') >= 0 ? '&' : '?') + 'matt_word=' + encodeURIComponent(ml.word) + '&matt_tool=' + encodeURIComponent(ml.tool);
}
function linkDiretoML(u, ml) { var l = u ? comCodigoML(String(u).split('#')[0], ml) : ''; return /[?&]matt_word=/.test(l) ? l : ''; }
/** Shopee ainda com o link comum: pede o seu link de afiliado ao servidor da Miga */
function shopeeAfiliado(x, chave) {
  if (loja(x) !== 'shopee' || x.afOk || x.linkOriginal || /(^|\/\/)s\.shopee\.com\.br\//.test(String(x.link || ''))) return '';
  try {
    var r = UrlFetchApp.fetch(CFG.site + '/api/afiliado', pedidoApi('afiliado', { url: x.urlFinal || x.link }, chave));
    var j = r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
    return j && j.link ? j.link : '';
  } catch (e) { return ''; }
}

/* ===================== Pacotes que o site lê ===================== */
function refazerPacotes() {
  var l = fsList('vitrine/miga/produtos').map(function (p) {
    var x = {}; for (var k in p) x[k] = p[k];
    if (String(x.imagem || '').indexOf('data:') === 0 && x.imagem.length > 60000) x.imagem = '';
    delete x.atualizadoEm; return x;
  });
  var pacotes = []; for (var i = 0; i < l.length; i += 150) pacotes.push(l.slice(i, i + 150));
  var cfg = fsGet('vitrine/miga') || {}, antes = Number(cfg.pacotes || 0);
  pacotes.forEach(function (pc, n) { fsSet('vitrine/miga/pacotes/p' + n, { itens: JSON.stringify(pc), n: pc.length, em: Date.now() }); });
  for (var m = pacotes.length; m < antes; m++) fsDelete('vitrine/miga/pacotes/p' + m);
  fsPatch('vitrine/miga', { pacotes: pacotes.length, pacotesEm: Date.now() });
}

/* ===================== E-mail de preço que baixou ===================== */
function avisarQuedas(q) {
  q.sort(function (a, b) { return b.pct - a.pct; });
  var brl = function (n) { return 'R$ ' + Number(n).toFixed(2).replace('.', ','); };
  var html = '<div style="font-family:Arial,sans-serif;max-width:560px">'
    + '<h2 style="color:#e8336d;margin:0 0 6px">Baixou! Hora de postar</h2>'
    + '<p style="color:#555;margin:0 0 14px">' + q.length + (q.length === 1 ? ' produto baixou' : ' produtos baixaram') + ' de preço agora:</p>'
    + q.map(function (x) {
      return '<table style="width:100%;border:1px solid #f0e8d8;border-radius:14px;margin:0 0 10px;padding:8px"><tr>'
        + (x.imagem ? '<td style="width:90px"><img src="' + esc(x.imagem) + '" width="84" height="84" style="border-radius:10px;object-fit:cover"></td>' : '')
        + '<td><b>' + esc(x.nome) + '</b><br><span style="color:#999;text-decoration:line-through">' + brl(x.de) + '</span> <b style="color:#e8336d;font-size:18px">' + brl(x.por) + '</b> '
        + '<span style="background:#e8336d;color:#fff;border-radius:99px;padding:1px 8px;font-size:12px">-' + x.pct + '%</span><br>'
        + '<small style="color:#888">' + esc(x.onde) + '</small>'
        + (x.link ? '<br><a href="' + esc(x.link) + '" style="color:#e8336d">Abrir na loja</a>' : '') + '</td></tr></table>';
    }).join('')
    + '<p style="color:#888;font-size:12px">Abra o app da Miga para postar. O preço já foi atualizado no app e no site.</p></div>';
  var para = prop('EMAIL') || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({ to: para, subject: 'Miga Promo: ' + (q.length === 1 ? 'baixou ' + q[0].pct + '% · ' + q[0].nome.slice(0, 40) : q.length + ' produtos baixaram de preço'), htmlBody: html, name: 'Robô da Miga Promo' });
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ===================== Servidor da Miga ===================== */
function pedidoApi(rota, corpo, chave) {
  return { url: CFG.site + '/api/' + rota, method: 'post', contentType: 'application/json', payload: JSON.stringify(corpo), headers: { 'x-robo-chave': chave }, muteHttpExceptions: true };
}

/* ===================== Firestore (com a conta dona do projeto) ===================== */
function fsReq(metodo, caminho, corpo) {
  var r = UrlFetchApp.fetch(BASE_FS + '/' + caminho, {
    method: metodo, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': CFG.projeto },
    payload: corpo ? JSON.stringify(corpo) : undefined
  });
  var cod = r.getResponseCode();
  if (cod === 404) return null;
  if (cod >= 300) throw new Error('Firestore ' + metodo + ' ' + caminho.split('?')[0] + ': ' + cod + ' ' + r.getContentText().slice(0, 200));
  var t = r.getContentText(); return t ? JSON.parse(t) : {};
}
function fsGet(path) { var d = fsReq('get', path); return d && d.fields ? campos(d.fields) : (d ? {} : null); }
function fsList(col) {
  var out = [], token = '';
  do {
    var d = fsReq('get', col + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    ((d && d.documents) || []).forEach(function (doc) { out.push(campos(doc.fields || {})); });
    token = d && d.nextPageToken;
  } while (token);
  return out;
}
function fsPatch(path, obj) {
  var mask = Object.keys(obj).map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  return fsReq('patch', path + '?' + mask, { fields: paraCampos(obj) });
}
function fsSet(path, obj) { return fsReq('patch', path, { fields: paraCampos(obj) }); }
function fsDelete(path) { return fsReq('delete', path); }
function deFS(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue; if ('nullValue' in v) return null; if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(deFS);
  if ('mapValue' in v) return campos(v.mapValue.fields || {});
  return null;
}
function campos(f) { var o = {}; for (var k in f) o[k] = deFS(f[k]); return o; }
function paraFS(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(paraFS) } };
  return { mapValue: { fields: paraCampos(x) } };
}
function paraCampos(o) { var f = {}; for (var k in o) f[k] = paraFS(o[k]); return f; }

/* ===================== Memória do robô ===================== */
function prop(k) { return props_().getProperty(k); }
function props_() { return PropertiesService.getScriptProperties(); }
/** Tira da memória as conferências com mais de N dias */
function limparVelhos(m, dias) { var lim = Date.now() - dias * 864e5; Object.keys(m).forEach(function (k) { if (m[k] < lim) delete m[k]; }); }
