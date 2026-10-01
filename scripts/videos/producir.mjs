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
//   --sin-musica        sin música de fondo
//   --solo-voz          genera y revisa la voz (y la música) sin grabar ni renderizar
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
import { generarVoz, generarMusica, mezclar, montarAudio, AIRE, SILENCIO } from "./lib/voz.mjs";
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
// La música de fondo por omisión: la misma para toda la serie.
const MUSICA = "Warm, gentle acoustic instrumental for a short product video about a small dog daycare and grooming business. Soft acoustic guitar and light marimba, subtle shaker, relaxed friendly groove around 96 bpm, steady and unobtrusive from start to finish, no drops, no big build-ups, no vocals. Background bed that stays under a spoken voiceover.";
const BASE = opcion("base", "http://patitasyco.localhost:3001");
const FORMATOS = opcion("formatos", "16x9,9x16").split(",");
const CALIDAD = opcion("calidad", "standard");
const guion = (await import(pathToFileURL(path.join(AQUI, "videos", nombre, "guion.mjs")).href)).default;
const GRAB = path.join(AQUI, "grabaciones", guion.grabaciones ?? nombre); // `grabaciones`: reutiliza las tomas de otro video
const BUILD = path.join(AQUI, ".build", nombre);
const SALIDA = path.join(RAIZ, "public/peludesk/redes/videos");

// El negocio de las tomas tiene que ser el demo: lo dice el host.
if (!/^https?:\/\/patitasyco\./.test(BASE)) throw new Error(`Las tomas se graban solo del demo (patitasyco). Base recibida: ${BASE}`);

// ── 1. Grabar ──
const elegidas = opcion("tomas")?.split(",");
const faltan = Object.keys(guion.tomas).filter((t) => (elegidas ? elegidas.includes(t) : !fs.existsSync(path.join(GRAB, `${t}.json`))));
if (!bandera("solo-voz") && (bandera("grabar") || faltan.length)) {
  console.log(`Grabando ${bandera("grabar") ? "todas las tomas" : faltan.join(", ")} desde ${BASE}`);
  const ok = await contesta(`${BASE}/demo`);
  if (!ok) throw new Error(`No contesta ${BASE}. Prende la app (npm run build && npm run start -- -p 3001).`);
  for (const [t, toma] of Object.entries(guion.tomas)) {
    if (!bandera("grabar") && !faltan.includes(t)) continue;
    await grabar({ base: BASE, salida: GRAB, nombre: t, ...toma });
  }
}
if (bandera("solo-grabar")) process.exit(0);

// ── 2. Voz (o pista vacía) y música ──
const escenas = tiempos(guion);
const total = escenas.at(-1).fin;
const CACHE_AUDIO = path.join(AQUI, "audio", nombre);
const voz = await generarVoz({ escenas, total, dir: path.join(BUILD, "voz"), cache: CACHE_AUDIO });
console.log(voz.generada ? "Voz generada con ElevenLabs (o de la caché de audio/)" : "Sin ELEVENLABS_API_KEY: pista de audio vacía, lista para montar la voz");
const musica = voz.generada && !bandera("sin-musica") ? await generarMusica({ total, prompt: guion.musica ?? MUSICA, cache: CACHE_AUDIO }) : null;
if (musica) console.log("Música de fondo: " + path.relative(RAIZ, musica));
const pistaFinal = voz.generada ? mezclar({ voz: voz.pista, musica, total, salida: path.join(BUILD, "voz", "mezcla.wav") }) : voz.pista;
if (voz.generada) verificarVoz();
if (bandera("solo-voz")) {
  fs.writeFileSync(path.join(AQUI, "videos", nombre, "GUION.md"), guionMd());
  process.exit(0);
}

// ── 3. Componer y renderizar ──
const hfBin = path.join(AQUI, "node_modules/hyperframes/bin/hyperframes.mjs");
if (!fs.existsSync(hfBin)) throw new Error("Falta HyperFrames: cd scripts/videos && npm ci");
// Se corre con el mismo Node (en Windows, node_modules/.bin/hyperframes es un .cmd que spawn no abre).
const hf = process.execPath;
const hfArgs = (...a) => [hfBin, ...a];
const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_SKIP_SKILLS: "1" };
env.HYPERFRAMES_BROWSER_PATH ??= navegadorLocal();
// Captura por segmentos: en la captura continua, con un solo navegador (8 GB
// de RAM), el render se trababa siempre en el mismo cuadro; por segmentos no,
// y un reintento reanuda (--resume) en vez de empezar de cero.
env.HF_SEGMENTED_CAPTURE ??= "true";
fs.mkdirSync(SALIDA, { recursive: true });

for (const formato of FORMATOS) {
  const dir = path.join(BUILD, formato);
  const { subtitulos } = construir({ guion, formato, dir, grabaciones: GRAB, alineacion: voz.alineacion });
  console.log(`\n[${formato}] proyecto en ${path.relative(RAIZ, dir)} (${total} s, ${escenas.length} escenas, ${subtitulos.length} subtítulos)`);
  const lint = spawnSync(hf, hfArgs("lint"), { cwd: dir, env, encoding: "utf8" });
  const hallazgos = (lint.stdout + lint.stderr).split("\n").filter((l) => /error|✗/i.test(l));
  if (lint.status !== 0) { console.log(lint.stdout, lint.stderr); throw new Error(`hyperframes lint falló en ${formato}`); }
  if (hallazgos.length) console.log(hallazgos.join("\n"));
  fs.writeFileSync(path.join(SALIDA, `${nombre}-${formato}.srt`), srt(subtitulos));
  if (bandera("sin-render")) continue;

  // Una sola pasada completa (sin subtítulos); los subtítulos se renderizan
  // aparte, transparentes, y ffmpeg los pone encima.
  const renderizar = (args, nombreLog, envExtra = {}) => {
    for (let intento = 1; intento <= 3; intento++) {
      // La salida va a un archivo, no a un tubo: la barra de progreso escribe
      // miles de renglones.
      const log = path.join(dir, nombreLog);
      const fd = fs.openSync(log, "w");
      const r = spawnSync(hf, hfArgs("render", "-q", CALIDAD, "-f", "30", ...args, ...(intento > 1 ? ["--resume"] : [])), { cwd: dir, env: { ...env, ...envExtra }, stdio: ["ignore", fd, fd] });
      fs.closeSync(fd);
      if (r.status === 0) return;
      const salida = fs.readFileSync(log, "utf8");
      // Si se traba ("capture stalled"), se reintenta hasta dos veces.
      if (!/capture stalled|timed out/i.test(salida) || intento === 3) { console.log(salida.slice(-3000)); throw new Error(`Falló el render ${formato} (registro: ${path.relative(RAIZ, log)})`); }
      console.log(`  … el render se trabó, reintento ${intento + 1} de 3`);
    }
  };
  const t0 = Date.now();
  const limpio = path.join(dir, "render.mp4");
  renderizar(["--video-frame-format", "jpg", "--variables", JSON.stringify({ subtitulos: false }), "-o", limpio], "render.log");
  const capa = path.join(dir, "subtitulos.mov");
  // Sin segmentos: la captura segmentada arma MP4 y ProRes (con transparencia) no cabe ahí.
  renderizar(["-c", "capas/subtitulos.html", "--format", "mov", "-o", capa], "render-subtitulos.log", { HF_SEGMENTED_CAPTURE: "false" });
  const conSubtitulos = path.join(dir, "render-subtitulos.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", limpio, "-i", capa, "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]", "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-r", "30", "-movflags", "+faststart", conSubtitulos]);
  fs.rmSync(capa, { force: true });

  for (const conSubs of [false, true]) {
    const crudo = conSubs ? conSubtitulos : limpio;
    const final = path.join(SALIDA, `${nombre}-${formato}${conSubs ? "-subtitulos" : ""}.mp4`);
    montarAudio(crudo, pistaFinal, final);
    comprobarMp4(final);
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
    const real = voz.colocacion?.[e.id];
    const desde = real?.desde ?? e.inicio + (e.voz?.desde ?? 0), hasta = real?.hasta ?? e.inicio + (e.voz?.hasta ?? e.duracion - 0.3);
    return `## ${i + 1}. ${e.titulo} · ${t(e.inicio)}–${t(e.fin)} (${e.duracion} s)

- **Pantalla:** ${e.pantalla}
- **Texto en pantalla:** ${e.texto}
- **Locución** (${t(desde)}–${t(hasta)}, ${(hasta - desde).toFixed(1)} s${real ? `, voz real${real.velocidad !== 1 ? ` a ${real.velocidad}x` : ""}` : ""}): «${e.voz.texto}»
`;
  });
  return `# ${guion.titulo}

Generado por \`node scripts/videos/producir.mjs ${nombre}\`: no se edita a mano (el guion vive en \`guion.mjs\`).

Duración: ${total} s. Las escenas se traslapan ${guion.traslape} s para la transición.
${voz.generada
  ? `Voz de ElevenLabs con los tiempos reales de la voz generada${musica ? ", con música de fondo de Eleven Music" : ""}; los subtítulos (\`public/peludesk/redes/videos/${nombre}-<formato>.srt\`) van alineados palabra por palabra a esa voz.`
  : `La voz se lee dentro de la ventana de cada escena; los subtítulos (\`public/peludesk/redes/videos/${nombre}-<formato>.srt\`) usan esos mismos tiempos.`}

${filas.join("\n")}`;
}

// La voz de cada escena termina sola, antes del final de su escena y sin
// pisar la siguiente. En la pista de voz (sin música): justo antes del corte
// de cada frase (su desvanecido) ya no hay sonido, o sea que el corte no se
// comió nada; y el último sonido cae antes del final de la escena.
function verificarVoz() {
  const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", voz.pista, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { maxBuffer: 1 << 28 });
  const muestras = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
  const rms = (a, b) => {
    const i0 = Math.max(0, Math.floor(a * 16000)), i1 = Math.min(muestras.length, Math.floor(b * 16000));
    let s = 0; for (let i = i0; i < i1; i++) s += muestras[i] * muestras[i];
    return i1 > i0 ? Math.sqrt(s / (i1 - i0)) / 32768 : 0;
  };
  const fallas = [];
  const conVoz = escenas.filter((e) => voz.colocacion?.[e.id]);
  for (const [i, e] of conVoz.entries()) {
    const c = voz.colocacion[e.id];
    const sig = conVoz[i + 1] && voz.colocacion[conVoz[i + 1].id];
    const enCorte = rms(c.hasta, c.corte);
    console.log(`  voz ${e.id}: ${c.desde.toFixed(2)}–${c.hasta.toFixed(2)} s · escena ${e.inicio.toFixed(2)}–${e.fin.toFixed(2)} s · sobran ${(e.fin - c.hasta).toFixed(2)} s · en el corte ${(20 * Math.log10(enCorte || 1e-9)).toFixed(0)} dBFS${c.velocidad !== 1 ? ` · ${c.velocidad}x` : ""}`);
    if (enCorte > SILENCIO) fallas.push(`${e.id}: todavía hay voz al cortarla (${c.hasta.toFixed(2)} s)`);
    if (c.corte > e.fin - AIRE / 2) fallas.push(`${e.id}: la voz termina en ${c.corte.toFixed(2)} s y la escena en ${e.fin.toFixed(2)} s`);
    if (sig && c.corte + AIRE > sig.desde) fallas.push(`${e.id}: la voz termina en ${c.corte.toFixed(2)} s y la siguiente empieza en ${sig.desde.toFixed(2)} s`);
  }
  if (fallas.length) throw new Error("La voz se corta:\n  " + fallas.join("\n  "));
}

// El MP4 final: audio y video del mismo largo que el guion.
function comprobarMp4(archivo) {
  const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,duration", "-of", "json", archivo]).toString());
  const d = Object.fromEntries(info.streams.map((s) => [s.codec_type, Number(s.duration)]));
  if (!d.audio || Math.abs(d.audio - total) > 0.15 || Math.abs(d.video - total) > 0.15) throw new Error(`${path.basename(archivo)}: video ${d.video} s, audio ${d.audio} s, guion ${total} s`);
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
