import definicion from "./plantillas.json";

/**
 * Las plantillas de los recordatorios automáticos (texto exacto en plantillas.json: lo mismo que Meta aprobó, lo que
 * sale al cliente y lo que se guarda en recordatorios_wa.texto). Sin imports de servidor: lo usan la tarea, el
 * webhook, las pantallas y las pruebas.
 */
export type TipoRecordatorio = "estetica" | "veterinaria" | "llegada" | "listo" | "vacuna";
export type AccionRecordatorio = "confirmo" | "pide_cambio" | "agendar" | "despues";

export const TIPOS_RECORDATORIO: TipoRecordatorio[] = ["estetica", "veterinaria", "llegada", "listo", "vacuna"];

export const ETIQUETA_TIPO: Record<TipoRecordatorio, string> = {
  estetica: "Cita de estética (día anterior)",
  veterinaria: "Cita veterinaria (día anterior)",
  llegada: "Llegada a hotel o guardería (día anterior)",
  listo: "Listo para recoger (al terminar la estética)",
  vacuna: "Próxima vacuna o desparasitación (7 días antes)",
};

export const ETIQUETA_RESPUESTA: Record<AccionRecordatorio, string> = {
  confirmo: "Confirmó por WhatsApp",
  pide_cambio: "Pidió cambiarla",
  agendar: "Quiere agendar",
  despues: "Contestó «Después»",
};

export const PIE = definicion.pie;
export const IDIOMA = definicion.idioma;

export type Plantilla = {
  nombre: string;
  cuerpo: string;
  ejemplo: string[];
  botones: { texto: string; accion: string }[];
};

export function plantillaDe(tipo: TipoRecordatorio): Plantilla {
  return (definicion.plantillas as Record<TipoRecordatorio, Plantilla>)[tipo];
}

/** El cuerpo con sus variables puestas: lo que lee el cliente. */
export function textoDe(tipo: TipoRecordatorio, parametros: string[]): string {
  return plantillaDe(tipo).cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => parametros[Number(n) - 1] ?? "");
}

/** El payload de cada botón: `rec:<id>:<acción>` (lo lee el webhook). */
export function payloadsDe(tipo: TipoRecordatorio, id: string): string[] {
  return plantillaDe(tipo).botones.map((b) => `rec:${id}:${b.accion}`);
}

const ACCIONES = new Set<AccionRecordatorio>(["confirmo", "pide_cambio", "agendar", "despues"]);

/** De un payload de botón, el recordatorio y la acción; null si no es de un recordatorio. */
export function leerPayload(payload: string | null | undefined): { id: string; accion: AccionRecordatorio } | null {
  const m = /^rec:([0-9a-f-]{36}):([a-z_]+)$/.exec(payload ?? "");
  if (!m || !ACCIONES.has(m[2] as AccionRecordatorio)) return null;
  return { id: m[1], accion: m[2] as AccionRecordatorio };
}

// ───────────────────────── Las variables de cada tipo

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Meta rechaza saltos de línea, tabuladores y más de 4 espacios seguidos en una variable. */
export function limpiarVariable(t: string | null | undefined, maximo = 60): string {
  return (t ?? "").replace(/[\n\t\r]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, maximo);
}

/** «jueves 30 de octubre» de un instante, en la zona del negocio. */
export function diaEnTexto(instante: string | Date, zona: string): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instante));
  const [a, m, d] = f.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${d} de ${MESES[m - 1]}`;
}

/** «11:00» / «16:30» de un instante, en la zona del negocio. */
export function horaEnTexto(instante: string | Date, zona: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: zona, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(instante));
}

/** «9:00» de un `HH:MM:SS` de la base. */
export function horaDeTiempo(t: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  return m ? `${Number(m[1])}:${m[2]}` : null;
}

export type FilaParaEnviar = {
  id: string;
  tipo: TipoRecordatorio;
  cliente_nombre: string;
  telefono: string | null;
  perros: string | null;
  negocio_nombre: string;
  servicio: string | null;
  medico: string | null;
  detalle: string | null;
  para_at: string;
  hora_llegada: string | null;
  zona: string;
};

/** Las variables de la plantilla de una fila de recordatorios_tomar. */
export function parametrosDe(f: FilaParaEnviar): string[] {
  const cliente = limpiarVariable(f.cliente_nombre.split(/\s+/)[0]) || "hola";
  const perro = limpiarVariable(f.perros, 80) || "tu mascota";
  const negocio = limpiarVariable(f.negocio_nombre, 80);
  switch (f.tipo) {
    case "estetica":
      return [cliente, perro, negocio, diaEnTexto(f.para_at, f.zona), horaEnTexto(f.para_at, f.zona), limpiarVariable(f.servicio) || "estética"];
    case "veterinaria":
      return [cliente, perro, negocio, diaEnTexto(f.para_at, f.zona), horaEnTexto(f.para_at, f.zona), limpiarVariable(f.medico) || "tu médico veterinario"];
    case "llegada":
      return [cliente, negocio, perro, diaEnTexto(f.para_at, f.zona), horaDeTiempo(f.hora_llegada) ?? "la hora de apertura"];
    case "listo":
      return [cliente, perro, negocio];
    case "vacuna":
      return [cliente, perro, negocio, limpiarVariable(f.detalle, 80) || "vacuna", diaEnTexto(f.para_at, f.zona)];
  }
}
