// Control de calidad AUTOMÁTICO de un video antes de publicarlo (B3).
// No parcha defectos de la app: los anota (`defectos`) para el reporte.
//
//   · formato: 1920×1080, 30 cps, H.264 yuv420p, con pista de audio;
//   · duración: de 55 s a 4 min (el avance, de 30 a 60 s);
//   · audio: sin silencios largos y a −16 LUFS (±2) cuando hay voz;
//   · subtítulos: se leen, no se encimen, caben en pantalla, terminan antes del video;
//   · fotogramas: ninguno en negro ni en blanco (pantalla sin cargar);
//   · pantallas: nunca /login, /plataforma ni una pantalla de error, ni la
//     palabra «Ludogteka» (todo es del demo ficticio);
//   · coherencia voz–acción: lo que la locución entre «comillas» existe en la
//     pantalla de ESA escena.
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { duracionDe, sonoridad } from "./render.mjs";

const sinAcentos = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PROHIBIDAS_RUTA = [/\/login/, /\/plataforma/, /\/sin-acceso/, /\/negocio-no-encontrado/, /\/pagina-no-encontrada/, /\/auth\//];
const PROHIBIDOS_TEXTO = [
  [/ludogteka/i, "aparece «Ludogteka»"],
  [/application error|internal server error|this page could not be found|algo salió mal|unhandled runtime error/i, "pantalla de error"],
  [/administración de la plataforma/i, "pantalla de la plataforma"],
  [/\bzz\b|prueba ui|auditor/i, "datos de pruebas internas"],
];

export function leerVtt(archivo) {
  const t = fs.readFileSync(archivo, "utf8").replace(/\r/g, "");
  const cues = [];
  for (const b of t.split(/\n\n+/).slice(1)) {
    const l = b.split("\n").filter(Boolean);
    const i = l.findIndex((x) => x.includes("-->"));
    if (i < 0) continue;
    const [a, z] = l[i].split("-->").map((x) => x.trim().split(":").reduce((s, p) => s * 60 + Number(p), 0));
    cues.push({ ini: a, fin: z, texto: l.slice(i + 1).join("\n") });
  }
  return cues;
}

export function qcVideo({ video, guion, master, vtt, muestras, conVoz, wav, secciones, permitirRutas = [] }) {
  const errores = [];
  const avisos = [];
  const m = {};

  // 1. Formato
  const sonda = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", master], { encoding: "utf8" }));
  const v = sonda.streams.find((s) => s.codec_type === "video");
  const a = sonda.streams.find((s) => s.codec_type === "audio");
  m.duracion = Number(sonda.format.duration);
  m.tamano = Number(sonda.format.size);
  if (!v || v.width !== 1920 || v.height !== 1080) errores.push(`resolución ${v?.width}×${v?.height} (debía ser 1920×1080)`);
  if (v && v.r_frame_rate !== "30/1") errores.push(`${v.r_frame_rate} cps (debían ser 30)`);
  if (v && (v.codec_name !== "h264" || v.pix_fmt !== "yuv420p")) errores.push(`codec ${v?.codec_name}/${v?.pix_fmt} (debía ser h264/yuv420p)`);
  if (!a) errores.push("no tiene pista de audio");

  // 2. Duración
  const [min, max] = video.id === "00" ? [28, 62] : [55, 255];
  if (m.duracion < min || m.duracion > max) errores.push(`dura ${m.duracion.toFixed(0)} s (debía estar entre ${min} y ${max})`);

  // 3. Audio
  if (conVoz && wav) {
    const lufs = sonoridad(wav);
    m.lufs = lufs;
    if (lufs === null || lufs < -18.5 || lufs > -13.5) errores.push(`sonoridad ${lufs} LUFS (debía ser −16 ±2)`);
    const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", wav, "-af", "silencedetect=n=-42dB:d=6", "-f", "null", "-"], { encoding: "utf8" });
    const largos = [...r.stderr.matchAll(/silence_duration:\s*([\d.]+)/g)].map((x) => Number(x[1]));
    if (largos.length) errores.push(`${largos.length} silencio(s) de 6 s o más en la voz`);
  } else {
    avisos.push("sin voz: pista en silencio (listo menos voz)");
  }

  // 4. Subtítulos
  const cues = vtt && fs.existsSync(vtt) ? leerVtt(vtt) : [];
  m.cues = cues.length;
  if (!cues.length) errores.push("no hay subtítulos");
  let prevFin = 0;
  for (const [i, c] of cues.entries()) {
    const lineas = c.texto.split("\n");
    if (lineas.length > 2 || lineas.some((x) => x.length > 84)) errores.push(`subtítulo ${i + 1} muy largo (${c.texto.length} letras)`);
    if (c.ini < prevFin - 0.001) errores.push(`subtítulo ${i + 1} se encima con el anterior`);
    if (c.fin <= c.ini) errores.push(`subtítulo ${i + 1} sin duración`);
    prevFin = c.fin;
  }
  if (cues.length && prevFin > m.duracion + 0.15) errores.push(`el último subtítulo termina en ${prevFin.toFixed(1)} s y el video dura ${m.duracion.toFixed(1)} s`);
  const hablado = secciones.reduce((s, x) => s + (x.fin - x.ini), 0);
  const cubierto = cues.reduce((s, c) => s + (c.fin - c.ini), 0);
  m.cobertura = Number((cubierto / hablado).toFixed(2));
  if (cues.length && cubierto / hablado < 0.45) errores.push(`los subtítulos cubren solo el ${(100 * cubierto / hablado).toFixed(0)} % del video`);

  // 5. Fotogramas (cada 5 s, en gris 160×90): ni negros ni blancos
  const crudo = execFileSync("ffmpeg", ["-loglevel", "error", "-i", master, "-vf", "fps=1/5,scale=160:90,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 26 });
  const n = Math.floor(crudo.length / (160 * 90));
  let malos = 0;
  for (let i = 0; i < n; i++) {
    let suma = 0;
    for (let j = 0; j < 160 * 90; j++) suma += crudo[i * 160 * 90 + j];
    const media = suma / (160 * 90);
    if (media < 6 || media > 250) malos++;
  }
  m.fotogramas = n;
  if (malos) errores.push(`${malos} fotograma(s) en negro o en blanco`);

  // 6. Pantallas prohibidas
  const defectos = [];
  for (const s of muestras ?? []) {
    let ruta = "";
    try { ruta = new URL(s.url).pathname; } catch { ruta = s.url; }
    if (PROHIBIDAS_RUTA.some((r) => r.test(ruta)) && !permitirRutas.some((p) => ruta.startsWith(p))) errores.push(`escena ${s.escena}: estuvo en ${ruta}`);
    for (const [re, motivo] of PROHIBIDOS_TEXTO) {
      if (re.test(s.visible ?? s.texto)) errores.push(`escena ${s.escena}: ${motivo} (a la vista)`);
      else if (re.test(s.texto)) defectos.push(`escena ${s.escena}: ${motivo} en la página, fuera de lo que se ve`);
    }
    if (/error|no se pudo|no pudimos|algo salió/i.test(s.texto.split("\n").slice(0, 40).join(" ")) && /no se pudo|no pudimos|algo salió/i.test(s.texto)) defectos.push(`escena ${s.escena}: la app mostró un aviso de error (${(s.texto.match(/(no se pudo|no pudimos|algo salió)[^\n]{0,80}/i) ?? [""])[0]})`);
  }
  for (const t of [video.titulo, guion.gancho, ...guion.escenas.flatMap((e) => [e.titulo, e.dice]), ...guion.resumen]) if (/ludogteka/i.test(t)) errores.push("el guion dice «Ludogteka»");

  // 7. Coherencia voz–acción: cada «término» de la locución existe en la pantalla de esa escena
  for (const [i, e] of guion.escenas.entries()) {
    const terminos = [...e.dice.matchAll(/«([^»]+)»/g)].map((x) => x[1]);
    if (!terminos.length) continue;
    const pantalla = sinAcentos((muestras ?? []).filter((s) => s.escena === i + 1).map((s) => s.texto).join("\n") + " " + JSON.stringify(e.pasos ?? [], (k, x) => (typeof x === "function" ? "" : x)));
    for (const t of terminos) if (!pantalla.includes(sinAcentos(t))) errores.push(`escena ${i + 1}: la locución dice «${t}» y no aparece en esa pantalla`);
  }
  return { ok: errores.length === 0, errores, avisos, defectos, metricas: m };
}
