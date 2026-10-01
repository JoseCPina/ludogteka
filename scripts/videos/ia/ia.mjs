// Pipeline de tomas de IA (OpenArt) para los videos de PeluDesk.
//
//   node scripts/videos/ia/ia.mjs estado   <video>
//   node scripts/videos/ia/ia.mjs imagenes <video> [--toma T1]        3 variantes por toma
//   node scripts/videos/ia/ia.mjs elegir   <video> <toma> <n> [x]     la mejor imagen → cuadro inicial 9:16 (x: 0..1, recorte horizontal)
//   node scripts/videos/ia/ia.mjs videos   <video> [--toma T1] [--modelo kling-v3] [--n 2]
//   node scripts/videos/ia/ia.mjs revisar  <video> <toma> <n>         12 cuadros + segundo pase (se MIRAN)
//   node scripts/videos/ia/ia.mjs veredicto <video> <toma> <n> aprobada|rechazada "motivo"
//   node scripts/videos/ia/ia.mjs hoja     <video>                    hojas de contactos en public/.../_revision/
//   node scripts/videos/ia/ia.mjs saldo
//
// Todo queda en un manifiesto por toma (manifiestos/<video>/<toma>.json): modelo,
// prompt, créditos reales (diferencia de saldo) y resultado del control de
// calidad. Lo aprobado no se regenera nunca. Reglas en reglas-realismo.md.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as oa from "./lib/openart.mjs";
import { revisar, hojaDeContactos } from "./lib/calidad.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");
const MAX_GENERACIONES_VIDEO = 24;
const [, , cmd, video, ...resto] = process.argv;
const opcion = (n, d) => { const i = resto.indexOf(`--${n}`); return i >= 0 ? resto[i + 1] : d; };

if (cmd === "saldo") { console.log(oa.saldo()); process.exit(0); }
if (!cmd || !video) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 13).join("\n")); process.exit(1); }

const guion = JSON.parse(fs.readFileSync(path.join(AQUI, "videos", video, "guion.json"), "utf8"));
const CACHE = path.join(AQUI, "cache", video);
const MANI = path.join(AQUI, "manifiestos", video);
fs.mkdirSync(MANI, { recursive: true });
const archivoM = (t) => path.join(MANI, `${t}.json`);
const leer = (t) => (fs.existsSync(archivoM(t)) ? JSON.parse(fs.readFileSync(archivoM(t), "utf8")) : { toma: t, imagenes: [], videos: [], aprobado: null });
const guardar = (m) => fs.writeFileSync(archivoM(m.toma), JSON.stringify(m, null, 2) + "\n");
const presupuestoPath = path.join(MANI, "_presupuesto.json");
const presupuesto = () => (fs.existsSync(presupuestoPath) ? JSON.parse(fs.readFileSync(presupuestoPath, "utf8")) : { generacionesVideo: 0, creditos: 0, saldoInicial: null, rechazadas: [] });
const guardarP = (p) => fs.writeFileSync(presupuestoPath, JSON.stringify(p, null, 2) + "\n");
const tomasElegidas = () => (opcion("toma") ? [opcion("toma")] : Object.keys(guion.tomas));

const REGLAS_IMAGEN = " Tall, narrow composition made for a vertical phone screen: every subject is compact and stacked, together occupying only the central 45% of the image width, with plain empty background on both sides, generous headroom and floor space. Documentary realism, natural light, no text, no logos, no signs, no other animals in the scene unless stated, no hands in the foreground, simple collars without tags.";

/** Corre una generación y devuelve los créditos que costó de verdad (saldo antes − después). */
function gastar(fn) {
  const antes = oa.saldo();
  const p = presupuesto();
  if (p.saldoInicial === null) { p.saldoInicial = antes; guardarP(p); }
  fn();
  const gasto = antes - oa.saldo();
  const q = presupuesto();
  q.creditos += gasto;
  guardarP(q);
  return gasto;
}

if (cmd === "estado") {
  const p = presupuesto();
  console.log(`Generaciones de video: ${p.generacionesVideo}/${MAX_GENERACIONES_VIDEO} · créditos gastados: ${p.creditos} · saldo ahora: ${oa.saldo()}`);
  for (const t of Object.keys(guion.tomas)) {
    const m = leer(t);
    console.log(`${t}: imágenes ${m.imagenes.length} (elegida ${m.elegida ?? "—"}) · videos ${m.videos.map((v) => `#${v.n}:${v.qc?.estado ?? "sin revisar"}`).join(" ") || "—"} · aprobado: ${m.aprobado ?? "no"}`);
  }
}

if (cmd === "imagenes") {
  for (const t of tomasElegidas()) {
    const m = leer(t);
    if (m.aprobado) { console.log(`${t}: ya aprobada, no se regenera.`); continue; }
    if (resto.includes("--nuevas")) for (const i of m.imagenes) i.descartada = true;
    const falta = 3 - m.imagenes.filter((i) => !i.descartada).length;
    for (let k = 0; k < falta; k++) {
      const n = m.imagenes.length + 1;
      const prompt = guion.tomas[t].imagen + REGLAS_IMAGEN;
      const salida = path.join(CACHE, t, `imagen-${n}.png`);
      const gasto = gastar(() => oa.imagen({ modelo: guion.modeloImagen, prompt, salida }));
      m.imagenes.push({ n, archivo: path.relative(AQUI, salida), modelo: guion.modeloImagen, prompt, creditos: gasto });
      guardar(m);
      console.log(`${t} imagen ${n}: ${gasto} créditos`);
    }
    // Hoja de comparación con el recorte 9:16 central de cada variante.
    const hoja = path.join(CACHE, t, "comparar-imagenes.png");
    const vivas = m.imagenes.filter((i) => !i.descartada);
    const entradas = vivas.flatMap((i) => ["-i", path.join(AQUI, i.archivo)]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...entradas, "-filter_complex", `${vivas.map((_, k) => `[${k}:v]crop=576:1024:224:0[c${k}]`).join(";")};${vivas.map((_, k) => `[c${k}]`).join("")}hstack=inputs=${vivas.length}`, "-frames:v", "1", hoja]);
    console.log(`${t}: compara en ${hoja}`);
  }
}

if (cmd === "elegir") {
  const [t, n, cx] = resto;
  const m = leer(t);
  const img = m.imagenes.find((i) => i.n === Number(n));
  if (!img) throw new Error("No existe esa imagen");
  const x = Math.round((1024 - 576) * Number(cx ?? 0.5));
  const salida = path.join(CACHE, t, `inicio-${n}.png`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(AQUI, img.archivo), "-vf", `crop=576:1024:${x}:0,scale=1080:1920:flags=lanczos`, salida]);
  m.elegida = Number(n);
  m.cuadroInicial = { archivo: path.relative(AQUI, salida), recorteX: x };
  guardar(m);
  console.log(`${t}: imagen ${n} elegida; cuadro inicial ${salida}`);
}

if (cmd === "videos") {
  const n = Number(opcion("n", 2));
  const modelo = opcion("modelo", guion.modeloVideo);
  for (const t of tomasElegidas()) {
    const m = leer(t);
    if (m.aprobado) { console.log(`${t}: ya aprobada, no se regenera.`); continue; }
    if (!m.cuadroInicial) throw new Error(`${t}: elige antes la imagen (elegir)`);
    for (let k = 0; k < n; k++) {
      if (presupuesto().generacionesVideo >= MAX_GENERACIONES_VIDEO) throw new Error(`Tope de ${MAX_GENERACIONES_VIDEO} generaciones de video alcanzado.`);
      const nv = m.videos.length + 1;
      const prompt = guion.tomas[t].video + " Photorealistic, natural motion, the subject keeps the same identity throughout, no new objects appear.";
      const salida = path.join(CACHE, t, `video-${nv}-${modelo}.mp4`);
      const gasto = gastar(() => oa.video({ modelo, prompt, imagenInicial: path.join(AQUI, m.cuadroInicial.archivo), salida, duracion: guion.tomas[t].duracion }));
      const p = presupuesto(); p.generacionesVideo += 1; guardarP(p);
      m.videos.push({ n: nv, archivo: path.relative(AQUI, salida), modelo, prompt, creditos: gasto, qc: null });
      guardar(m);
      console.log(`${t} video ${nv} (${modelo}): ${gasto} créditos · generaciones ${p.generacionesVideo}/${MAX_GENERACIONES_VIDEO}`);
    }
  }
}

if (cmd === "revisar") {
  const [t, n] = resto;
  const v = leer(t).videos.find((x) => x.n === Number(n));
  const r = revisar(path.join(AQUI, v.archivo), path.join(CACHE, t, `qc-${n}`));
  console.log(`${t} video ${n}: ${r.duracion.toFixed(2)} s · SSIM mínimo entre vecinos ${r.ssimMinimo?.toFixed(3) ?? "?"} (par ${r.ssimPeorPar})`);
  for (const h of r.hojas) console.log("  hoja:", h);
  console.log("  tira:", r.tira);
}

if (cmd === "veredicto") {
  const [t, n, estado, ...motivo] = resto;
  const m = leer(t);
  const v = m.videos.find((x) => x.n === Number(n));
  v.qc = { estado, motivo: motivo.join(" "), fecha: new Date().toISOString() };
  if (estado === "aprobada") {
    const final = path.join(CACHE, "aprobadas", `${t}.mp4`);
    fs.mkdirSync(path.dirname(final), { recursive: true });
    // Sin audio (Veo siempre lo trae), 30 fps, 9:16.
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(AQUI, v.archivo), "-an", "-vf", "scale=1080:1920,fps=30", "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-pix_fmt", "yuv420p", final]);
    m.aprobado = path.relative(AQUI, final);
  } else {
    const p = presupuesto();
    p.rechazadas.push({ toma: t, video: Number(n), modelo: v.modelo, motivo: v.qc.motivo });
    guardarP(p);
  }
  guardar(m);
  console.log(`${t} video ${n}: ${estado}`);
}

if (cmd === "hoja") {
  const dir = path.join(RAIZ, "public/peludesk/redes/videos/_revision", video);
  for (const t of Object.keys(guion.tomas)) {
    const m = leer(t);
    if (m.aprobado) hojaDeContactos(path.join(AQUI, m.aprobado), path.join(dir, `${t}.jpg`));
  }
  console.log("Hojas en", path.relative(RAIZ, dir));
}
