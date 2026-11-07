#!/usr/bin/env node
// Una tanda de grabación de videos tutoriales, de punta a punta (`npm run videos:regrabar`): lo que el último
// despliegue dejó «por actualizar» se regraba y se publica en producción, en vez de acumularse.
//
//   npm run videos:regrabar                       los «por actualizar» (desarrollo y producción) → graba → publica en PROD
//   npm run videos:regrabar -- --video 04,32      solo esos (aunque no estén marcados)
//   npm run videos:regrabar -- --sin-compilar     usa la build que ya hay en .next
//   npm run videos:regrabar -- --sin-sembrar      no rehace el demo (ya está limpio)
//   npm run videos:regrabar -- --sin-publicar     graba y revisa, no sube nada
//
// Pasos: (1) RAM libre (pide 8 GB antes de arrancar el segundo proceso pesado); (2) rehace el demo de desarrollo
// (sembrar-demo --rehacer + sembrar-veterinaria, con sus cuentas gemelas del corredor); (3) compila la app (NODE_OPTIONS
// de la máquina); (4) levanta el doble de Google en el 4457 y `next start -p 3001` apuntando a él (ningún video gasta
// una consulta real); (5) corre el corredor (`tutoriales.mjs --marcados --regrabar --prod`): voz «Regina», QC y
// publicación; (6) apaga la app y el doble, pase lo que pase. SOLO en desarrollo, solo el demo (lo exige el corredor).
// Las llaves (ElevenLabs, Daily, Anthropic) salen de .env.local; nunca se imprimen.
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { levantarDobleGoogle, PUERTO_DOBLE } from "./lib/doble-google.mjs";

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PUERTO = Number(val("--puerto") ?? 3001);
const GB = (b) => (b / 1073741824).toFixed(1);

function env() {
  const e = { ...process.env };
  for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) e[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
  }
  e.NODE_USE_ENV_PROXY = "1";
  return e;
}
const correr = (cmd, a, extra = {}) => {
  const r = spawnSync(cmd, a, { stdio: "inherit", shell: process.platform === "win32", env: env(), ...extra });
  if (r.status !== 0) throw new Error(`${cmd} ${a.join(" ")} salió con ${r.status}`);
};
const arriba = () => new Promise((resolve) => {
  http.get({ host: "127.0.0.1", port: PUERTO, path: "/login", headers: { host: "patitasyco.localhost" }, timeout: 8000 }, (r) => { r.resume(); resolve(r.statusCode < 500); }).on("error", () => resolve(false)).on("timeout", function () { this.destroy(); resolve(false); });
});
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`RAM libre: ${GB(os.freemem())} GB de ${GB(os.totalmem())} GB`);
if (os.freemem() < 8 * 1073741824) throw new Error("Hacen falta al menos 8 GB libres para compilar y grabar (regla de la máquina).");
if (await arriba()) throw new Error(`Ya hay algo escuchando en el ${PUERTO}: una tanda a la vez.`);

if (!flag("--sin-sembrar")) {
  console.log("\n── Demo de desarrollo (rehacer) ──");
  correr("node", ["scripts/demo/sembrar-demo.mjs", "--rehacer"]);
  correr("node", ["scripts/demo/sembrar-veterinaria.mjs"]);
}
if (!flag("--sin-compilar")) {
  console.log("\n── Build ──");
  const t0 = Date.now();
  correr("npm", ["run", "build"]);
  console.log(`build en ${Math.round((Date.now() - t0) / 1000)} s`);
}

console.log("\n── App y doble de Google ──");
const doble = await levantarDobleGoogle(PUERTO_DOBLE);
const app = spawn("npm", ["run", "start", "--", "-p", String(PUERTO)], { shell: process.platform === "win32", env: { ...env(), GOOGLE_MAPS_API_KEY: "de-prueba", GOOGLE_API_URL: `http://127.0.0.1:${PUERTO_DOBLE}` }, stdio: ["ignore", "ignore", "inherit"], windowsHide: true });
const apagar = () => {
  try { doble.close(); } catch {}
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  else { try { process.kill(-app.pid, "SIGTERM"); } catch { try { app.kill("SIGTERM"); } catch {} } }
};
process.on("SIGINT", () => { apagar(); process.exit(130); });
let codigo = 1;
try {
  for (let i = 0; i < 60 && !(await arriba()); i++) await dormir(2000);
  if (!(await arriba())) throw new Error(`La app no respondió en el ${PUERTO}.`);
  console.log(`app en el ${PUERTO}, doble de Google en el ${PUERTO_DOBLE}`);

  console.log("\n── Corredor ──");
  const paso = ["scripts/tutoriales/tutoriales.mjs", "--regrabar"];
  if (val("--video")) paso.push("--video", val("--video")); else paso.push("--marcados");
  if (flag("--sin-publicar")) paso.push("--sin-publicar"); else paso.push("--prod");
  if (val("--limite")) paso.push("--limite", val("--limite"));
  const r = spawnSync(process.execPath, paso, { stdio: "inherit", env: { ...env(), MSYS_NO_PATHCONV: "1" } });
  codigo = r.status ?? 1;
} finally {
  apagar();
}
process.exit(codigo);
