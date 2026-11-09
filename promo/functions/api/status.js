// GET /api/status → informa ao app o que está configurado (sem revelar segredos)
import { json } from "../../lib/comum.js";

export async function onRequestGet({ env }) {
  return json({ ia: !!env.GEMINI_API_KEY, senha: !!env.APP_SENHA, modelo: env.GEMINI_MODEL || "gemini-2.5-flash" });
}
