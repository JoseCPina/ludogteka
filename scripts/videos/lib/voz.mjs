// La voz del video.
//
// Sin ELEVENLABS_API_KEY: una pista de audio en silencio del largo del video,
// para montar encima la voz grabada (el guion.md dice qué se lee y cuándo).
// Con ELEVENLABS_API_KEY (y opcional ELEVENLABS_VOICE_ID): genera la
// locución de cada escena con timestamps, la coloca en su segundo y
// devuelve la alineación para que los subtítulos caigan exactos.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const MODELO = "eleven_multilingual_v2";

export async function generarVoz({ escenas, total, dir }) {
  const llave = process.env.ELEVENLABS_API_KEY;
  fs.mkdirSync(dir, { recursive: true });
  const pista = path.join(dir, "voz.wav");
  if (!llave) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(total), pista]);
    return { pista, generada: false, alineacion: null };
  }
  const voz = process.env.ELEVENLABS_VOICE_ID;
  if (!voz) throw new Error("Hay ELEVENLABS_API_KEY pero falta ELEVENLABS_VOICE_ID (la voz en español que se usará).");
  const alineacion = {};
  const entradas = [];
  for (const e of escenas) {
    if (!e.voz?.texto) continue;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": llave, "content-type": "application/json" },
      body: JSON.stringify({ text: e.voz.texto, model_id: MODELO, language_code: "es", voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2 } }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) throw new Error(`ElevenLabs respondió ${r.status} en la escena ${e.id}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const mp3 = path.join(dir, `voz-${e.id}.mp3`);
    fs.writeFileSync(mp3, Buffer.from(j.audio_base64, "base64"));
    const a = j.alignment;
    alineacion[e.id] = { caracteres: a.characters, inicios: a.character_start_times_seconds, fines: a.character_end_times_seconds };
    const largo = a.character_end_times_seconds.at(-1);
    const ventana = (e.voz.hasta ?? e.duracion - 0.3) - e.voz.desde;
    if (largo > ventana + 0.3) console.warn(`  ⚠ la voz de ${e.id} dura ${largo.toFixed(1)} s y la escena le da ${ventana.toFixed(1)} s`);
    entradas.push({ mp3, en: e.inicio + e.voz.desde });
  }
  const args = ["-y", "-loglevel", "error", "-f", "lavfi", "-t", String(total), "-i", "anullsrc=r=48000:cl=stereo"];
  entradas.forEach((x) => args.push("-i", x.mp3));
  const filtros = entradas.map((x, i) => `[${i + 1}:a]aresample=48000,adelay=${Math.round(x.en * 1000)}:all=1[a${i}]`);
  const mezcla = `[0:a]${entradas.map((_, i) => `[a${i}]`).join("")}amix=inputs=${entradas.length + 1}:normalize=0,atrim=0:${total}[salida]`;
  args.push("-filter_complex", [...filtros, mezcla].join(";"), "-map", "[salida]", pista);
  execFileSync("ffmpeg", args);
  return { pista, generada: true, alineacion };
}

// Le pone la pista al video sin volver a codificar la imagen.
export function montarAudio(video, pista, salida) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-i", pista, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", salida]);
}
