// De la grabación cruda al paquete final de un video: audio (voz + música o
// silencio), master 1080p, versión 720p para la app, subtítulos SRT y VTT
// (es-MX), póster y miniatura de YouTube.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { abrirNavegador } from "../../lib/navegador.mjs";
import { partirSubtitulos, srt as aSrt } from "../../videos/lib/subtitulos.mjs";
import { mezclar } from "../../videos/lib/voz.mjs";
import { COLA } from "../../videos/lib/voz.mjs";

const AQUI = path.dirname(new URL(import.meta.url).pathname);
const FUENTE = path.join(AQUI, "../../../src/fuentes/outfit-latin.woff2");
export const MAX_MASTER_BYTES = 48 * 1024 * 1024; // el límite del proyecto es 50 MB por archivo
export const MAX_720_BYTES = 14.5 * 1024 * 1024;

export function sonoridad(archivo) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", archivo, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const m = [...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1);
  return m ? Number(m[1]) : null;
}

export function duracionDe(archivo) {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", archivo], { encoding: "utf8" }).trim());
}

/** Los tramos del video con su locución y dónde empieza de verdad cada uno (según la grabación). */
export function tramos({ guion, locs, tiempos }) {
  const sec = [
    { id: "titulo", ini: tiempos.titulo.ini, fin: tiempos.titulo.fin, texto: locs.find((l) => l.id === "titulo").texto },
    ...tiempos.escenas.map((t, i) => ({ id: `e${i + 1}`, ini: t.ini, fin: t.fin, texto: guion.escenas[i].dice })),
    { id: "resumen", ini: tiempos.resumen.ini, fin: tiempos.resumen.fin, texto: locs.find((l) => l.id === "resumen").texto },
    { id: "cierre", ini: tiempos.cierre.ini, fin: tiempos.cierre.fin, texto: locs.find((l) => l.id === "cierre").texto },
  ];
  return sec;
}

const INICIO_VOZ = 0.3;

/** Subtítulos (cue por frase corta) con la voz alineada si existe, o repartidos en la ventana del tramo. */
export function subtitulos({ secciones, alineaciones, largos }) {
  const escenas = secciones.map((s) => ({
    id: s.id,
    inicio: s.ini,
    duracion: s.fin - s.ini,
    voz: { texto: s.texto, desde: INICIO_VOZ, hasta: largos?.[s.id] ? INICIO_VOZ + largos[s.id] : Math.max(INICIO_VOZ + 1, s.fin - s.ini - 0.5) },
  }));
  const subs = partirSubtitulos(escenas, { max: 80, alineacion: alineaciones ?? undefined });
  // Sin cuadros muy cortos ni encimados.
  for (let i = 0; i < subs.length; i++) {
    if (subs[i].fin - subs[i].inicio < 0.8) subs[i].fin = subs[i].inicio + 0.8;
    if (subs[i + 1] && subs[i].fin > subs[i + 1].inicio - 0.02) subs[i].fin = subs[i + 1].inicio - 0.02;
  }
  return subs.filter((s) => s.fin > s.inicio);
}

const vttTiempo = (s) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), seg = Math.floor((ms % 60000) / 1000), mil = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(seg).padStart(2, "0")}.${String(mil).padStart(3, "0")}`;
};
export const aVtt = (subs) => "WEBVTT\n\n" + subs.map((s, i) => `${i + 1}\n${vttTiempo(s.inicio)} --> ${vttTiempo(s.fin)}\n${s.texto}\n`).join("\n");
export { aSrt };

/** La pista de audio del video: voz colocada en el segundo real de cada tramo + música, o silencio. */
export function pistaDeAudio({ dir, duracion, secciones, voces, largos, musica }) {
  const wav = path.join(dir, "audio.wav");
  if (!voces) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", duracion.toFixed(3), wav]);
    return { wav, conVoz: false };
  }
  const entradas = secciones.map((s) => ({ mp3: voces[s.id], en: s.ini + INICIO_VOZ, largo: largos[s.id] }));
  const args = ["-y", "-loglevel", "error", "-f", "lavfi", "-t", duracion.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo"];
  entradas.forEach((x) => args.push("-i", x.mp3));
  const filtros = entradas.map((x, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${(x.largo + COLA).toFixed(3)},afade=t=out:st=${x.largo.toFixed(3)}:d=${COLA},adelay=${Math.round(x.en * 1000)}:all=1[a${i}]`);
  const mezcla = `[0:a]${entradas.map((_, i) => `[a${i}]`).join("")}amix=inputs=${entradas.length + 1}:normalize=0,atrim=0:${duracion.toFixed(3)}[salida]`;
  const solo = path.join(dir, "voz.wav");
  args.push("-filter_complex", [...filtros, mezcla].join(";"), "-map", "[salida]", solo);
  execFileSync("ffmpeg", args);
  mezclar({ voz: solo, musica, total: duracion, salida: wav });
  return { wav, conVoz: true };
}

/** Master 1080p (H.264 CRF 18, 30 cps). Si pasa de 48 MB se vuelve a codificar con tope de bitrate. */
export function exportarMaster({ crudo, wav, salida, duracion }) {
  const base = ["-y", "-loglevel", "error", "-i", crudo, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-r", "30", "-c:v", "libx264", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-shortest", "-movflags", "+faststart"];
  execFileSync("ffmpeg", [...base, "-crf", "18", salida], { maxBuffer: 1 << 26 });
  let tam = fs.statSync(salida).size;
  let aplicado = "crf18";
  if (tam > MAX_MASTER_BYTES) {
    const bits = Math.floor(((MAX_MASTER_BYTES * 0.93) * 8) / duracion) - 160_000;
    execFileSync("ffmpeg", [...base, "-crf", "19", "-maxrate", String(bits), "-bufsize", String(bits * 2), salida], { maxBuffer: 1 << 26 });
    tam = fs.statSync(salida).size;
    aplicado = `crf19+maxrate${Math.round(bits / 1000)}k`;
  }
  return { tam, aplicado };
}

/** Versión de 720p para la app (menos de 15 MB). */
export function exportar720({ master, salida, duracion }) {
  const techo = Math.floor((MAX_720_BYTES * 0.92 * 8) / duracion) - 96_000;
  const maxrate = Math.max(300_000, Math.min(1_400_000, techo));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", master, "-vf", "scale=1280:720", "-r", "30", "-c:v", "libx264", "-preset", "slow", "-pix_fmt", "yuv420p", "-crf", "27", "-maxrate", String(maxrate), "-bufsize", String(maxrate * 2), "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-movflags", "+faststart", salida], { maxBuffer: 1 << 26 });
  return { tam: fs.statSync(salida).size, maxrate };
}

/** Póster (un cuadro limpio) y miniatura de YouTube 1280×720 con el título. */
export async function miniaturas({ master, dir, titulo, area, numero, instante }) {
  const cuadro = path.join(dir, "cuadro.jpg");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", instante.toFixed(2), "-i", master, "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "3", cuadro]);
  const poster = path.join(dir, "poster.jpg");
  fs.copyFileSync(cuadro, poster);
  const b64 = fs.readFileSync(cuadro).toString("base64");
  const fuente = fs.readFileSync(FUENTE).toString("base64");
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<html><head><style>
    @font-face{font-family:Outfit;font-weight:100 900;src:url(data:font/woff2;base64,${fuente}) format("woff2")}
    *{box-sizing:border-box}body{margin:0;width:1280px;height:720px;position:relative;overflow:hidden;font-family:Outfit,system-ui,sans-serif;background:#2b2447}
    .f{position:absolute;inset:0;background:url(data:image/jpeg;base64,${b64}) center/cover;filter:blur(2px) brightness(.55)}
    .v{position:absolute;inset:0;background:linear-gradient(100deg,rgba(43,36,71,.96) 0%,rgba(43,36,71,.82) 48%,rgba(43,36,71,.15) 100%)}
    .c{position:absolute;left:70px;top:0;bottom:0;width:760px;display:flex;flex-direction:column;justify-content:center;color:#fff}
    .a{align-self:flex-start;background:#a7d8c8;color:#3a3059;font-weight:700;font-size:30px;padding:8px 22px;border-radius:999px;margin-bottom:26px}
    h1{margin:0;font-size:${titulo.length > 52 ? 60 : 72}px;line-height:1.08;font-weight:800;text-wrap:balance}
    .p{margin-top:30px;font-size:34px;font-weight:600;color:#f5b85c}
    .m{position:absolute;right:56px;bottom:46px;width:360px;height:225px;border-radius:18px;border:6px solid #fff;background:url(data:image/jpeg;base64,${b64}) center/cover;box-shadow:0 18px 50px rgba(0,0,0,.45)}
  </style></head><body><div class="f"></div><div class="v"></div>
  <div class="c"><span class="a">${esc(area)}</span><h1>${esc(titulo)}</h1><div class="p">PeluDesk · Video ${esc(numero)}</div></div><div class="m"></div></body></html>`;
  const nav = await abrirNavegador();
  const pag = await (await nav.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await pag.setContent(html, { waitUntil: "load" });
  await pag.evaluate(() => document.fonts.ready);
  const miniatura = path.join(dir, "miniatura.jpg");
  await pag.screenshot({ path: miniatura, type: "jpeg", quality: 90 });
  await nav.close();
  fs.rmSync(cuadro, { force: true });
  return { poster, miniatura };
}

export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
