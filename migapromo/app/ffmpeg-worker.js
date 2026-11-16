// Worker do conversor de áudio (ffmpeg.wasm). Fica no mesmo site do app (o navegador exige),
// e carrega o resto do conversor do CDN. Usado só quando o celular grava o som em Opus dentro do MP4.
import "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js";
