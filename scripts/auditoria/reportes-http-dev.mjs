// Uso: node scripts/auditoria/reportes-http-dev.mjs   (SOLO DESARROLLO, Huellitas; servidor en :3001)
// Página NO segura (http://<ip-de-la-red>, sin crypto.randomUUID ni crypto.subtle):
// sube foto y video desde la galería y desde la cámara simulada en /adentro
// y comprueba que no truene nada. Pasa PUERTO_DEV / IP_RED si cambian.
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { prepararHuellitas } from "./reportes-datos-dev.mjs";
import { cookiesDe, PUERTO } from "./reportes-sesion-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const IP = process.env.IP_RED ?? Object.values(os.networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal)?.address;
let fallos = 0;
const ok = (c, t) => { console.log(`  ${c ? "✔" : "✘"} ${t}`); if (!c) fallos++; };
const D = await prepararHuellitas();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "http-"));
const jpg = path.join(tmp, "foto.jpg");
await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#4a90d9" } }).jpeg().toFile(jpg);
const mp4 = path.join(tmp, "video.mp4");
execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "3", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", "-shortest", mp4], { stdio: "ignore" });

const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addCookies(await cookiesDe(D.recepcionB, IP));
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(`http://${IP}:${PUERTO}/adentro`, { waitUntil: "networkidle" });
  const ent = await p.evaluate(() => ({ seguro: window.isSecureContext, uuid: typeof crypto.randomUUID, subtle: typeof crypto.subtle }));
  ok(ent.seguro === false && ent.uuid === "undefined", `contexto no seguro (isSecureContext=${ent.seguro}, randomUUID=${ent.uuid}, subtle=${ent.subtle})`);
  const fila = p.locator("li, article, section").filter({ hasText: "Firulais" }).filter({ has: p.locator("input[type=file]") }).last();
  const antes = await p.getByText(/Se borra/).count();
  const subir = async (selector, archivos, etiqueta) => {
    const n0 = await p.getByText(/Se borra/).count();
    await fila.locator(selector).first().setInputFiles(archivos);
    await p.waitForFunction((n) => [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /Se borra/.test(e.textContent ?? "")).length > n, n0, { timeout: 90000 }).catch(() => {});
    const cuerpo = await p.locator("body").innerText();
    ok(!/is not a function|no es una función|Error/i.test(cuerpo) && errores.length === 0, `${etiqueta}: sin errores${errores.length ? " → " + errores[0] : ""}`);
    ok((await p.getByText(/Se borra/).count()) > n0, `${etiqueta}: aparece subida`);
  };
  await subir('input[accept="image/*"][capture]', jpg, "foto desde la cámara");
  await subir('input[accept="video/*"][capture]', mp4, "video desde la cámara");
  await subir("input[multiple]", [jpg, mp4], "foto y video desde la galería");
  void antes;
  await p.screenshot({ path: path.join(os.tmpdir(), "reportes-http.png"), fullPage: true });
} finally {
  await nav.close();
}
console.log(fallos ? `\n✘ ${fallos} falla(s)` : "\n✔ Todo en orden.");
process.exit(fallos ? 1 : 0);
