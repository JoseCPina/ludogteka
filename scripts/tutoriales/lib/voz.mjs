// La voz de la serie (ElevenLabs, voz «Regina» o la de ELEVENLABS_VOICE_ID) y su
// presupuesto.
//
// SIN ELEVENLABS_API_KEY el video sale «listo menos voz»: pista en silencio,
// subtítulos y locución en `guion.txt`; cuando la llave exista, `npm run
// tutoriales -- --video NN --solo-voz` (o `--voz` en toda la serie) agrega la voz
// SIN volver a grabar (la grabación se queda; solo cambia el audio) siempre que
// la voz no obligue a mover las escenas — si dura más que su escena, se vuelve
// a grabar ese video con las escenas alargadas.
//
// Presupuesto (B4): antes de generar se pregunta a la API cuántos caracteres
// quedan del mes; no se gasta si quedaría menos del 5 % del plan; cada frase se
// guarda con el hash de lo que se pidió (texto, voz, ajustes, velocidad): lo
// ya generado no se vuelve a pagar. Si no alcanza, ese video queda «listo
// menos voz» y el corredor sigue con los demás.
import fs from "node:fs";
import path from "node:path";
import { frase } from "../../videos/lib/voz.mjs";
import { finDelSonido, generarMusica } from "../../videos/lib/voz.mjs";

const AQUI = path.dirname(new URL(import.meta.url).pathname);
export const DIR_AUDIO = path.join(AQUI, "../audio");
export const PISO_PRESUPUESTO = 0.05;

const llave = () => process.env.ELEVENLABS_API_KEY;
export const hayLlave = () => Boolean(llave() && process.env.ELEVENLABS_VOICE_ID);

/** Cuánto queda del plan este mes (caracteres), según la API. null si no hay llave o no responde. */
export async function cuota() {
  if (!llave()) return null;
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": llave() }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { error: `ElevenLabs respondió ${r.status}` };
    const j = await r.json();
    const limite = Number(j.character_limit), usados = Number(j.character_count);
    return { plan: j.tier, limite, usados, quedan: limite - usados, reinicia: j.next_character_count_reset_unix ?? null };
  } catch (e) {
    return { error: String(e) };
  }
}

export const caracteres = (locs) => locs.reduce((s, l) => s + (l.texto?.length ?? 0), 0);

/**
 * Genera (o toma de la caché) la locución de cada tramo. Devuelve
 * { largos, voces } o null si no hay voz posible (sin llave y sin caché).
 */
export async function generarLocuciones({ numero, locs, presupuesto }) {
  const dir = path.join(DIR_AUDIO, numero);
  fs.mkdirSync(dir, { recursive: true });
  const voz = process.env.ELEVENLABS_VOICE_ID;
  const hayCache = fs.readdirSync(dir).some((f) => f.startsWith("voz-"));
  if (!hayLlave() && !hayCache) return null;
  if (!voz && !hayCache) return null;
  const nuevos = hayLlave() ? caracteres(locs) : 0;
  if (hayLlave() && presupuesto && nuevos > presupuesto.disponibles) {
    throw Object.assign(new Error(`El presupuesto de voz no alcanza (${nuevos} caracteres y quedan ${presupuesto.disponibles} sobre el piso del 5 %).`), { codigo: "sin_presupuesto" });
  }
  const largos = {};
  const voces = {};
  const alineaciones = {};
  let gastados = 0;
  for (const [i, l] of locs.entries()) {
    const antes = fs.readdirSync(dir).length;
    const f = await frase({ texto: l.texto, anterior: locs[i - 1]?.texto, siguiente: locs[i + 1]?.texto, velocidad: 1, voz, llave: llave(), dir });
    if (fs.readdirSync(dir).length > antes) gastados += l.texto.length;
    largos[l.id] = finDelSonido(f.mp3);
    voces[l.id] = f.mp3;
    alineaciones[l.id] = { caracteres: f.caracteres, inicios: f.inicios, fines: f.fines };
  }
  // La caché se queda solo con lo que usa el guion de hoy.
  const usados = new Set(Object.values(voces).map((m) => path.basename(m, ".mp3")));
  for (const f of fs.readdirSync(dir)) if (f.startsWith("voz-") && !usados.has(f.replace(/\.(mp3|json)$/, ""))) fs.rmSync(path.join(dir, f));
  return { largos, voces, alineaciones, gastados };
}

/** Las 2–3 pistas de música de la serie: se generan UNA vez y se reutilizan (se recortan a cada video). */
export const PISTAS_MUSICA = [
  { id: "a", prompt: "Instrumental ligero y cálido para tutoriales de software: guitarra acústica suave, marimba y pads discretos, tempo medio-lento, optimista, sin voces, sin clímax, loop limpio." },
  { id: "b", prompt: "Instrumental tranquilo para tutoriales: piano eléctrico suave, bajo redondo y percusión mínima, tempo medio, amigable, sin voces, sin clímax." },
  { id: "c", prompt: "Instrumental suave estilo lo-fi limpio para tutoriales: ukulele, glockenspiel y ritmo suave, positivo y discreto, sin voces, sin clímax." },
];
export const LARGO_MUSICA_S = 270;

export async function musicaDeLaSerie(numero) {
  const cache = path.join(DIR_AUDIO, "_musica");
  const pista = PISTAS_MUSICA[Number(numero) % PISTAS_MUSICA.length];
  return generarMusica({ total: LARGO_MUSICA_S, prompt: pista.prompt, cache });
}
