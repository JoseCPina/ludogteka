// Produce un video de producto de PeluDesk, de la app de verdad al MP4.
//
//   node scripts/videos/producir.mjs <video> [opciones]
//
//   --grabar            vuelve a grabar las tomas de la app (si falta alguna, graba sola)
//   --tomas a,b         graba solo esas tomas
//   --solo-grabar       graba y termina
//   --base <url>        de dónde se graba (http://patitasyco.localhost:3001; con `next start` prendido)
//   --formatos 16x9,9x16
//   --calidad draft|standard|high   (standard por omisión)
//   --sin-render        solo arma los proyectos de HyperFrames (para abrirlos en el Studio)
//
// Sale en public/peludesk/redes/videos/:
//   <video>-16x9.mp4, <video>-16x9-subtitulos.mp4, <video>-9x16.mp4, <video>-9x16-subtitulos.mp4,
//   <video>-<formato>.srt y <video>-<formato>.jpg (portada)
// y el guion con tiempos en scripts/videos/videos/<video>/GUION.md.
//
// Las tomas son SIEMPRE del negocio de demostración (Patitas & Co.): nunca
// datos de Ludogteka ni de un cliente real. Detalle en scripts/videos/README.md.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { construir, tiempos } from "./lib/composicion.mjs";
import { grabar } from "./lib/grabar.mjs";
import { generarVoz, montarAudio } from "./lib/voz.mjs";
import { srt } from "./lib/subtitulos.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");

// En la nube, el fetch de Node solo sale por el proxy de la sesión si se le dice.
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}

const args = process.argv.slice(2);
const opcion = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const bandera = (n) => args.includes(`--${n}`);
const nombre = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
if (!nombre) {
  console.log("Uso: node scripts/videos/producir.mjs <video> [--grabar] [--base url] [--formatos 16x9,9x16] [--calidad standard] [--sin-render]");
  console.log("Videos:", fs.readdirSync(path.join(AQUI, "videos")).join(", "));
  process.exit(1);
}
const BASE = opcion("base", "http://patitasyco.localhost:3001");
const FORMATOS = opcion("formatos", "16x9,9x16").split(",");
const CALIDAD = opcion("calidad", "standard");
const guion = (await import(pathToFileURL(path.join(AQUI, "videos", nombre, "guion.mjs")).href)).default;
const GRAB = path.join(AQUI, "grabaciones", nombre);
const BUILD = path.join(AQUI, ".build", nombre);
const SALIDA = path.join(RAIZ, "public/peludesk/redes/videos");

// El negocio de las tomas tiene que ser el demo: lo dice el host.
if (!/^https?:\/\/patitasyco\./.test(BASE)) throw new Error(`Las tomas se graban solo del demo (patitasyco). Base recibida: ${BASE}`);

// ── 1. Grabar ──
const elegidas = opcion("tomas")?.split(",");
const faltan = Object.keys(guion.tomas).filter((t) => (elegidas ? elegidas.includes(t) : !fs.existsSync(path.join(GRAB, `${t}.json`))));
if (bandera("grabar") || faltan.length) {
  console.log(`Grabando ${bandera("grabar") ? "todas las tomas" : faltan.join(", ")} desde ${BASE}`);
  const ok = await contesta(`${BASE}/demo`);
  if (!ok) throw new Error(`No contesta ${BASE}. Prende la app (npm run build && npm run start -- -p 3001).`);
  for (const [t, toma] of Object.entries(guion.tomas)) {
    if (!bandera("grabar") && !faltan.includes(t)) continue;
    await grabar({ base: BASE, salida: GRAB, nombre: t, ...toma });
  }
}
if (bandera("solo-grabar")) process.exit(0);

// ── 2. Voz (o pista vacía) ──
const escenas = tiempos(guion);
const total = escenas.at(-1).fin;
const voz = await generarVoz({ escenas, total, dir: path.join(BUILD, "voz") });
console.log(voz.generada ? "Voz generada con ElevenLabs" : "Sin ELEVENLABS_API_KEY: pista de audio vacía, lista para montar la voz");

// ── 3. Componer y renderizar ──
const hf = path.join(AQUI, "node_modules/.bin/hyperframes");
if (!fs.existsSync(hf)) throw new Error("Falta HyperFrames: cd scripts/videos && npm ci");
const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_SKIP_SKILLS: "1" };
env.HYPERFRAMES_BROWSER_PATH ??= navegadorLocal();
fs.mkdirSync(SALIDA, { recursive: true });

for (const formato of FORMATOS) {
  const dir = path.join(BUILD, formato);
  const { subtitulos } = construir({ guion, formato, dir, grabaciones: GRAB, alineacion: voz.alineacion });
  console.log(`\n[${formato}] proyecto en ${path.relative(RAIZ, dir)} (${total} s, ${escenas.length} escenas, ${subtitulos.length} subtítulos)`);
  const lint = spawnSync(hf, ["lint"], { cwd: dir, env, encoding: "utf8" });
  const hallazgos = (lint.stdout + lint.stderr).split("\n").filter((l) => /error|✗/i.test(l));
  if (lint.status !== 0) { console.log(lint.stdout, lint.stderr); throw new Error(`hyperframes lint falló en ${formato}`); }
  if (hallazgos.length) console.log(hallazgos.join("\n"));
  fs.writeFileSync(path.join(SALIDA, `${nombre}-${formato}.srt`), srt(subtitulos));
  if (bandera("sin-render")) continue;

  for (const conSubs of [false, true]) {
    const crudo = path.join(dir, `render${conSubs ? "-subtitulos" : ""}.mp4`);
    const t0 = Date.now();
    const r = spawnSync(hf, ["render", "-q", CALIDAD, "-f", "30", "--video-frame-format", "png", "--variables", JSON.stringify({ subtitulos: conSubs }), "-o", crudo], { cwd: dir, env, encoding: "utf8" });
    if (r.status !== 0) { console.log(r.stdout.slice(-3000), r.stderr.slice(-3000)); throw new Error(`Falló el render ${formato}${conSubs ? " con subtítulos" : ""}`); }
    const final = path.join(SALIDA, `${nombre}-${formato}${conSubs ? "-subtitulos" : ""}.mp4`);
    montarAudio(crudo, voz.pista, final);
    console.log(`  ✔ ${path.relative(RAIZ, final)} · ${(fs.statSync(final).size / 1e6).toFixed(1)} MB · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (!conSubs) {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(guion.portada ?? 1), "-i", final, "-frames:v", "1", "-q:v", "3", path.join(SALIDA, `${nombre}-${formato}.jpg`)]);
    }
  }
}

// ── 4. Guion con tiempos ──
fs.writeFileSync(path.join(AQUI, "videos", nombre, "GUION.md"), guionMd());
console.log(`\nGuion con tiempos: ${path.relative(RAIZ, path.join(AQUI, "videos", nombre, "GUION.md"))}`);

function guionMd() {
  const t = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
  const filas = escenas.map((e, i) => {
    const desde = e.inicio + (e.voz?.desde ?? 0), hasta = e.inicio + (e.voz?.hasta ?? e.duracion - 0.3);
    return `## ${i + 1}. ${e.titulo} · ${t(e.inicio)}–${t(e.fin)} (${e.duracion} s)

- **Pantalla:** ${e.pantalla}
- **Texto en pantalla:** ${e.texto}
- **Locución** (${t(desde)}–${t(hasta)}, ${(hasta - desde).toFixed(1)} s): «${e.voz.texto}»
`;
  });
  return `# ${guion.titulo}

Generado por \`node scripts/videos/producir.mjs ${nombre}\`: no se edita a mano (el guion vive en \`guion.mjs\`).

Duración: ${total} s. Las escenas se traslapan ${guion.traslape} s para la transición.
La voz se lee dentro de la ventana de cada escena; los subtítulos (\`public/peludesk/redes/videos/${nombre}-<formato>.srt\`) usan esos mismos tiempos.

${filas.join("\n")}`;
}

// <slug>.localhost no lo resuelve Node: se pega a 127.0.0.1 con el Host puesto.
async function contesta(url) {
  const u = new URL(url);
  if (!u.hostname.endsWith(".localhost")) return fetch(url).then((r) => r.ok).catch(() => false);
  const http = await import("node:http");
  return new Promise((listo) => {
    const req = http.get({ host: "127.0.0.1", port: u.port || 80, path: u.pathname, headers: { Host: u.host }, timeout: 20000 }, (res) => { res.resume(); listo(res.statusCode < 400); });
    req.on("error", () => listo(false));
    req.on("timeout", () => { req.destroy(); listo(false); });
  });
}

function navegadorLocal() {
  if (process.platform === "win32") return undefined; // HyperFrames baja el suyo (npx hyperframes browser ensure)
  const raiz = "/opt/pw-browsers";
  if (!fs.existsSync(raiz)) return undefined;
  const d = fs.readdirSync(raiz).filter((x) => x.startsWith("chromium_headless_shell-")).sort().reverse()[0];
  const p = d && path.join(raiz, d, "chrome-headless-shell-linux64/chrome-headless-shell");
  return p && fs.existsSync(p) ? p : undefined;
}
