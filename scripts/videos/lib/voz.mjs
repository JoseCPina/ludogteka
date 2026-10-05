// La voz y la música del video.
//
// Sin ELEVENLABS_API_KEY: una pista de audio en silencio del largo del video,
// para montar encima la voz grabada (el GUION.md dice qué se lee y cuándo).
//
// Con ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID:
//   - la locución de cada escena (con timestamps letra por letra), en tono
//     de plática: estabilidad media, sin "estilo" (el estilo alto es el que
//     suena a comercial), y con el texto de la escena anterior y la siguiente
//     para que la entonación siga de una a otra;
//   - si una frase no cabe en su ventana (voz.desde → voz.hasta), se vuelve
//     a pedir un poco más rápida (hasta VELOCIDAD_MAX); si ni así cabe, el
//     script se detiene y dice cuánto falta: se ajusta el guion, nunca se
//     corta la voz;
//   - la música de fondo (Eleven Music, instrumental) del largo del video.
//
// Todo lo generado se guarda en scripts/videos/audio/<video>/ con el hash de
// lo que se pidió: volver a producir no vuelve a gastar créditos mientras no
// cambie el texto, la voz o los ajustes.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const MODELO = "eleven_multilingual_v2";
const AJUSTES = { stability: 0.55, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
const VELOCIDAD_MAX = 1.05; // más rápido ya suena apurado: mejor alargar la escena
// Aire mínimo entre el final de una frase y el principio de la siguiente.
export const AIRE = 0.25;
// Desvanecido después del último sonido de cada frase.
export const COLA = 0.12;
// Nivel (RMS, 0–1) debajo del cual ya no hay voz: unos -46 dBFS.
export const SILENCIO = 0.005;

// Dónde termina de verdad el sonido de un audio (no la última letra de la
// alineación: la última sílaba suena un poco más).
export function finDelSonido(archivo) {
  const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", archivo, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { maxBuffer: 1 << 28 });
  const m = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
  const paso = 160; // 10 ms
  let fin = 0;
  for (let i = 0; i + paso <= m.length; i += paso) {
    let sum = 0;
    for (let j = i; j < i + paso; j++) sum += m[j] * m[j];
    if (Math.sqrt(sum / paso) / 32768 > SILENCIO) fin = (i + paso) / 16000;
  }
  return fin;
}

const API = "https://api.elevenlabs.io";
const hash = (x) => crypto.createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0, 10);

export async function pedir(ruta, cuerpo, llave) {
  for (let intento = 1; ; intento++) {
    const r = await fetch(API + ruta, {
      method: "POST",
      headers: { "xi-api-key": llave, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(240000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (r.ok) return r;
    const txt = (await r.text()).slice(0, 300);
    if (intento < 3 && (r.status === 0 || r.status === 429 || r.status >= 500)) {
      await new Promise((ok) => setTimeout(ok, 3000 * intento));
      continue;
    }
    throw new Error(`ElevenLabs respondió ${r.status} en ${ruta.split("?")[0]}: ${txt}`);
  }
}

// Una frase con timestamps, desde la caché o de la API.
export async function frase({ texto, anterior, siguiente, velocidad, voz, llave, dir }) {
  const pedido = { modelo: MODELO, voz, texto, anterior, siguiente, velocidad, ajustes: AJUSTES };
  const base = path.join(dir, `voz-${hash(pedido)}`);
  if (fs.existsSync(base + ".json") && fs.existsSync(base + ".mp3")) {
    return { mp3: base + ".mp3", ...JSON.parse(fs.readFileSync(base + ".json", "utf8")) };
  }
  if (!llave) throw new Error("Falta ELEVENLABS_API_KEY para generar la voz.");
  const r = await pedir(`/v1/text-to-speech/${voz}/with-timestamps?output_format=mp3_44100_128`, {
    text: texto,
    model_id: MODELO,
    language_code: "es",
    previous_text: anterior || undefined,
    next_text: siguiente || undefined,
    voice_settings: { ...AJUSTES, speed: velocidad },
  }, llave);
  const j = await r.json();
  fs.writeFileSync(base + ".mp3", Buffer.from(j.audio_base64, "base64"));
  const a = j.alignment;
  const meta = { texto, velocidad, caracteres: a.characters, inicios: a.character_start_times_seconds, fines: a.character_end_times_seconds };
  fs.writeFileSync(base + ".json", JSON.stringify(meta));
  return { mp3: base + ".mp3", ...meta };
}

/**
 * Genera la locución de cada escena y la acomoda en su ventana.
 * Devuelve { pista, generada, alineacion, colocacion } donde colocacion dice,
 * por escena, en qué segundo absoluto empieza y termina la voz.
 */
export async function generarVoz({ escenas, total, dir, cache }) {
  const llave = process.env.ELEVENLABS_API_KEY;
  const voz = process.env.ELEVENLABS_VOICE_ID;
  fs.mkdirSync(dir, { recursive: true });
  const pista = path.join(dir, "voz.wav");
  const conVoz = escenas.filter((e) => e.voz?.texto);
  const hayCache = cache && fs.existsSync(cache) && fs.readdirSync(cache).some((f) => f.startsWith("voz-"));
  if (!llave && !hayCache) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(total), pista]);
    return { pista, generada: false, alineacion: null, colocacion: null };
  }
  if (!voz) throw new Error("Hay ELEVENLABS_API_KEY pero falta ELEVENLABS_VOICE_ID (la voz en español que se usará).");
  fs.mkdirSync(cache, { recursive: true });

  const alineacion = {};
  const colocacion = {};
  const entradas = [];
  const problemas = [];
  for (const [i, e] of conVoz.entries()) {
    const ventana = (e.voz.hasta ?? e.duracion - 0.3) - e.voz.desde;
    const anterior = conVoz[i - 1]?.voz.texto, siguiente = conVoz[i + 1]?.voz.texto;
    let velocidad = e.voz.velocidad ?? 1;
    let f = await frase({ texto: e.voz.texto, anterior, siguiente, velocidad, voz, llave, dir: cache });
    let largo = finDelSonido(f.mp3);
    if (largo > ventana && !e.voz.velocidad) {
      velocidad = Math.min(VELOCIDAD_MAX, Math.ceil((largo / ventana) * 1.03 * 100) / 100);
      f = await frase({ texto: e.voz.texto, anterior, siguiente, velocidad, voz, llave, dir: cache });
      largo = finDelSonido(f.mp3);
    }
    if (largo > ventana + 0.05) problemas.push(`${e.id}: la voz dura ${largo.toFixed(2)} s y la ventana es de ${ventana.toFixed(2)} s (velocidad ${velocidad}). Alarga la escena o acorta el texto.`);
    alineacion[e.id] = { caracteres: f.caracteres, inicios: f.inicios, fines: f.fines };
    const en = e.inicio + e.voz.desde;
    colocacion[e.id] = { desde: en, hasta: en + largo, corte: en + largo + COLA, ventanaHasta: en + ventana, velocidad };
    entradas.push({ mp3: f.mp3, en, largo });
  }
  // Una frase no puede pisar a la siguiente ni pasarse del final.
  for (let i = 0; i < conVoz.length; i++) {
    const a = colocacion[conVoz[i].id], b = conVoz[i + 1] && colocacion[conVoz[i + 1].id];
    if (b && a.hasta + AIRE > b.desde) problemas.push(`${conVoz[i].id} termina en ${a.hasta.toFixed(2)} s y ${conVoz[i + 1].id} empieza en ${b.desde.toFixed(2)} s: se pisan.`);
    if (a.hasta > total - 0.3) problemas.push(`${conVoz[i].id} termina en ${a.hasta.toFixed(2)} s y el video dura ${total} s.`);
  }
  // La caché se queda solo con lo que usa el guion de hoy.
  const usados = new Set(entradas.map((x) => path.basename(x.mp3, ".mp3")));
  for (const f of fs.readdirSync(cache)) if (f.startsWith("voz-") && !usados.has(f.replace(/\.(mp3|json)$/, ""))) fs.rmSync(path.join(cache, f));
  if (problemas.length) throw new Error("La voz no cabe:\n  " + problemas.join("\n  "));

  // Cada frase se corta donde termina su última letra (+ un respiro) con un
  // desvanecido corto: sin colas de ruido ni chasquidos.
  const args = ["-y", "-loglevel", "error", "-f", "lavfi", "-t", String(total), "-i", "anullsrc=r=48000:cl=stereo"];
  entradas.forEach((x) => args.push("-i", x.mp3));
  // El desvanecido empieza DESPUÉS del último sonido: no se come nada de la voz.
  const filtros = entradas.map((x, i) => {
    const hasta = x.largo + COLA;
    return `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${hasta.toFixed(3)},afade=t=out:st=${x.largo.toFixed(3)}:d=${COLA},adelay=${Math.round(x.en * 1000)}:all=1[a${i}]`;
  });
  const mezcla = `[0:a]${entradas.map((_, i) => `[a${i}]`).join("")}amix=inputs=${entradas.length + 1}:normalize=0,atrim=0:${total}[salida]`;
  args.push("-filter_complex", [...filtros, mezcla].join(";"), "-map", "[salida]", pista);
  execFileSync("ffmpeg", args);
  return { pista, generada: true, alineacion, colocacion };
}

/**
 * Música de fondo con Eleven Music (instrumental), del largo del video.
 * Devuelve la ruta del mp3 o null si no hay llave ni caché.
 */
export async function generarMusica({ total, prompt, cache }) {
  const llave = process.env.ELEVENLABS_API_KEY;
  const largo = Math.max(10000, Math.ceil(total + 1.5) * 1000);
  const pedido = { prompt, largo, instrumental: true };
  fs.mkdirSync(cache, { recursive: true });
  const mp3 = path.join(cache, `musica-${hash(pedido)}.mp3`);
  if (fs.existsSync(mp3)) return mp3;
  if (!llave) return null;
  const r = await pedir("/v1/music?output_format=mp3_44100_128", { prompt, music_length_ms: largo, model_id: "music_v1", force_instrumental: true }, llave);
  fs.writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
  return mp3;
}

// Sonoridad integrada (LUFS) de un audio.
function lufs(archivo) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", archivo, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const m = [...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1);
  if (!m) throw new Error(`No pude medir la sonoridad de ${archivo}`);
  return Number(m[1]);
}

/**
 * Mezcla la voz con la música con ganancias fijas (nada de normalizador
 * dinámico: sube la música en los silencios). La voz queda en -16 LUFS (lo
 * que esperan Reels, TikTok y YouTube), la música `bajoLaVoz` dB debajo, y
 * mientras hay voz la música baja otro poco (sidechain). Entra y sale con
 * desvanecido; un limitador cuida los picos.
 */
export function mezclar({ voz, musica, total, salida, bajoLaVoz = 16 }) {
  const gVoz = -16 - lufs(voz);
  if (!musica) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", voz, "-af", `volume=${gVoz.toFixed(2)}dB,alimiter=limit=0.84:level=false,aresample=48000`, "-t", String(total), salida]);
    return salida;
  }
  const gMus = -16 - bajoLaVoz - lufs(musica);
  const filtro = [
    `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total},volume=${gMus.toFixed(2)}dB,afade=t=in:d=0.8,afade=t=out:st=${(total - 1.8).toFixed(2)}:d=1.8[m]`,
    `[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=${gVoz.toFixed(2)}dB,asplit=2[v][vc]`,
    `[m][vc]sidechaincompress=threshold=0.03:ratio=3:attack=60:release=500[md]`,
    `[v][md]amix=inputs=2:normalize=0,alimiter=limit=0.84:level=false,atrim=0:${total}[out]`,
  ].join(";");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", voz, "-i", musica, "-filter_complex", filtro, "-map", "[out]", salida]);
  return salida;
}

// Le pone la pista al video sin volver a codificar la imagen.
export function montarAudio(video, pista, salida) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-i", pista, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", salida]);
}
