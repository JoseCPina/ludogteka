// Envoltura del CLI oficial de OpenArt (https://github.com/OpenArt-AI/cli).
// Ninguna llave vive en el repo: la sesión es la de `openart login`
// (~/.openart/cli-credentials.json) o la variable OPENART_TOKEN.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const OPENART = process.env.OPENART_BIN
  || (process.platform === "win32" ? path.join(process.env.LOCALAPPDATA ?? "", "Programs/openart/bin/openart.exe") : "openart");

function correr(args, { timeoutMs = 15 * 60_000 } = {}) {
  return execFileSync(OPENART, args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
}

/** Créditos disponibles ahora. */
export function saldo() {
  const t = correr(["account", "--json"]);
  try {
    const j = JSON.parse(t);
    const v = j.credits ?? j.account?.credits ?? j.balance;
    if (typeof v === "number") return v;
  } catch { /* texto plano abajo */ }
  const m = /Credits:\s*([\d,]+)/.exec(correr(["account"]));
  if (!m) throw new Error("No pude leer el saldo de OpenArt (¿openart login?).");
  return Number(m[1].replace(/,/g, ""));
}

export function costo(modelo, modo) {
  const m = /(\d[\d,]*)\s*credits/.exec(correr(["model", "cost", "--model", modelo, "--mode", modo]));
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** Imagen (el CLI no deja elegir aspecto: sale 1:1; el recorte a 9:16 lo hace ffmpeg). */
export function imagen({ modelo, prompt, salida, referencias = [] }) {
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const args = ["generate", "image", prompt, "--model", modelo, "-o", salida, "--json", "--quiet"];
  for (const r of referencias) args.push("--image", r);
  return JSON.parse(correr(args));
}

/** Video imagen-a-video, 9:16. Veo trae audio que no se pide ni se usa (se quita al aprobar). */
export function video({ modelo, prompt, imagenInicial, salida, duracion = 4 }) {
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const args = ["generate", "video", prompt, "--model", modelo, "--image", imagenInicial, "--aspect-ratio", "9:16", "--duration", String(duracion), "-o", salida, "--timeout", "12m", "--json", "--quiet"];
  return JSON.parse(correr(args, { timeoutMs: 14 * 60_000 }));
}
export const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ia-"));
