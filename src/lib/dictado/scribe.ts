// Voz a texto: ElevenLabs Scribe (modelo scribe_v1).
//
// Por qué Scribe: reconoce español mexicano con muy buena exactitud (en las pruebas públicas
// de FLEURS es de los de menor error en español), acepta audio de navegador (webm/opus, mp4/aac)
// sin convertirlo, ya lo usa el proyecto (voz de los videos) y cuesta del orden de 0.4 USD por
// hora de audio. Alternativas revisadas: Deepgram Nova-3 (es-419, parecido en costo, requería otra
// cuenta) y gpt-4o-transcribe (parecido, también otra cuenta). Si cambia, solo cambia este archivo.
//
// La llave (ELEVENLABS_API_KEY) vive en las variables de entorno de Vercel: nunca en el repo.
// Fuera de producción, ELEVENLABS_API_URL apunta a un doble de pruebas; en producción se ignora.

const MODELO = "scribe_v1";
const TIMEOUT_MS = 90_000;

export class ErrorTranscripcion extends Error {
  constructor(mensaje: string, readonly transitorio = false) {
    super(mensaje);
  }
}

export type Transcripcion = { texto: string; segundos: number; idioma: string | null; modelo: string };

function base(): string {
  const sustituto = process.env.VERCEL_ENV !== "production" ? process.env.ELEVENLABS_API_URL?.trim().replace(/\/$/, "") : "";
  return sustituto || "https://api.elevenlabs.io";
}

export function dictadoConfigurado(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export async function transcribir(audio: Uint8Array, nombre: string, mime: string): Promise<Transcripcion> {
  const llave = process.env.ELEVENLABS_API_KEY?.trim();
  if (!llave) throw new ErrorTranscripcion("El dictado todavía no está configurado en PeluDesk (falta la llave del servicio de voz).");
  const formulario = new FormData();
  formulario.append("model_id", MODELO);
  formulario.append("language_code", "spa");
  formulario.append("tag_audio_events", "false");
  formulario.append("diarize", "false");
  formulario.append("file", new Blob([audio as BlobPart], { type: mime }), nombre);
  let r: Response;
  try {
    r = await fetch(`${base()}/v1/speech-to-text`, { method: "POST", headers: { "xi-api-key": llave }, body: formulario, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ErrorTranscripcion("No se pudo comunicar con el servicio de voz. Intenta de nuevo.", true);
  }
  const cuerpo = (await r.json().catch(() => ({}))) as {
    text?: string;
    language_code?: string;
    words?: { end?: number; start?: number; type?: string }[];
    detail?: { message?: string; status?: string } | string;
  };
  if (!r.ok) {
    const detalle = typeof cuerpo.detail === "string" ? cuerpo.detail : cuerpo.detail?.message ?? "";
    console.error("[dictado] Scribe rechazó el audio", r.status, detalle.slice(0, 200));
    if (r.status === 401 || r.status === 403) throw new ErrorTranscripcion("El servicio de voz rechazó la llave de PeluDesk. Avísale a PeluDesk.");
    if (r.status === 429 || r.status >= 500) throw new ErrorTranscripcion("El servicio de voz está saturado. Intenta de nuevo en un momento.", true);
    throw new ErrorTranscripcion("El servicio de voz no pudo leer ese audio. Graba de nuevo.");
  }
  const texto = (cuerpo.text ?? "").trim();
  const fin = Math.max(0, ...(cuerpo.words ?? []).map((p) => Number(p.end ?? 0)));
  return { texto, segundos: Math.ceil(fin), idioma: cuerpo.language_code ?? null, modelo: MODELO };
}
