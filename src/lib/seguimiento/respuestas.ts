// Qué quiso decir quien contesta un mensaje de seguimiento. Una baja nunca
// se adivina: solo frases cortas y claras (un «ya no me deja entrar» es una
// pregunta de soporte, no una baja).

export type TipoRespuesta = "respuesta" | "boton_ayuda" | "boton_plan" | "ahora_no" | "baja";

const normalizar = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();

const FRASES_BAJA = new Set([
  "baja", "dar de baja", "dame de baja", "me doy de baja", "quiero la baja", "quiero baja", "baja por favor",
  "no gracias", "no gracias gracias", "ya no", "ya no quiero", "ya no me escriban", "no me escriban", "no me escriban mas",
  "no me manden mensajes", "ya no me manden mensajes", "no quiero mensajes", "stop", "unsubscribe", "cancelar mensajes",
]);

export function clasificarRespuesta(texto: string): TipoRespuesta {
  const t = normalizar(texto);
  if (t === "necesito ayuda") return "boton_ayuda";
  if (t === "elegir un plan") return "boton_plan";
  if (t === "ahora no") return "ahora_no";
  if (FRASES_BAJA.has(t)) return "baja";
  // «BAJA» seguido de pocas palabras («baja de aquí», «baja por favor ya»).
  if (/^baja( [a-zñ]+){0,3}$/.test(t) && !/ (precio|costo|plan|cuenta|servicio)/.test(t)) return "baja";
  return "respuesta";
}

export const TEXTO_AHORA_NO = "Va, sin problema. Aquí seguimos por si nos necesitas 🐾";
export const TEXTO_BAJA = "Listo, no te escribimos más con estos mensajes. Si más adelante nos necesitas, escríbenos aquí mismo.";
