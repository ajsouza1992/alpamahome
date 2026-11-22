// Baixa o vídeo do anúncio (o pedido vem da página do produto)
chrome.runtime.onMessage.addListener((msg, _de, responder) => {
  if (!msg || msg.tipo !== "baixarVideo" || !Array.isArray(msg.urls)) return;
  let ok = 0, erros = 0, n = msg.urls.length;
  if (!n) { responder({ ok: 0 }); return; }
  msg.urls.forEach((url, i) => {
    chrome.downloads.download({ url, filename: `miga-videos/${msg.nome || "video"}${n > 1 ? "-" + (i + 1) : ""}.mp4`, conflictAction: "uniquify" }, (id) => {
      if (chrome.runtime.lastError || !id) erros++; else ok++;
      if (ok + erros === n) responder({ ok, erros });
    });
  });
  return true; // responde depois
});
