// Lo que comparten el dictado del navegador y el del servidor (sin "use server").

/** Un dictado dura hasta 15 minutos (la base acepta hasta 20). */
export const MAX_SEGUNDOS_DICTADO = 15 * 60;

export type EstadoDictado = {
  permitido: boolean;
  tope?: number;
  usados?: number;
  restantes?: number;
  cerca?: boolean;
  agotado?: boolean;
  conservar_audio?: boolean;
};

/** El borrador SOAP que arma la IA. Nada de esto se firma solo: el médico lo revisa en el expediente. */
export type BorradorSoap = {
  motivo: string | null;
  anamnesis: string | null;
  examen_fisico: string | null;
  hallazgos: string | null;
  plan: string | null;
  tratamiento: string | null;
  peso_kg: number | null;
  temperatura_c: number | null;
  frecuencia_cardiaca: number | null;
  frecuencia_respiratoria: number | null;
  condicion_corporal: number | null;
  mucosas: string | null;
  tllc_seg: number | null;
  hidratacion: string | null;
  diagnosticos: { ref_id: string; origen: "catalogo" | "negocio"; nombre: string; tipo: "presuntivo" | "definitivo"; nota: string }[];
  /** Diagnósticos que mencionó el médico y no están en el catálogo del negocio (para buscarlos a mano). */
  sin_catalogo: string[];
};

export type ResultadoDictado = {
  error: string | null;
  transcripcion?: string;
  borrador?: BorradorSoap;
  minutos?: number;
  usados?: number;
  tope?: number;
};

export const MIMES_AUDIO: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
  "video/webm": "webm",
  "video/mp4": "mp4",
};

/** Quita los parámetros del tipo (audio/webm;codecs=opus → audio/webm). */
export function mimeBase(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}
