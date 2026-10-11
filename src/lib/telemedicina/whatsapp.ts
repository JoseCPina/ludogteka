// La liga de la teleconsulta por WhatsApp: con la plantilla UTILITY de Meta si ya está aprobada,
// o con el mensaje armado para wa.me (lo manda la persona desde su teléfono).
import { graphBase, VERSION_GRAPH } from "@/lib/whatsapp/infra";
import plantilla from "./plantilla-teleconsulta.json";

export const NOMBRE_PLANTILLA_TELECONSULTA = plantilla.nombre;
export const IDIOMA_PLANTILLA_TELECONSULTA = plantilla.idioma;

/** ¿Meta aprobó la plantilla COMO UTILITY? Se pregunta en cada envío. */
export async function plantillaTeleconsultaAprobada(): Promise<boolean> {
  const waba = process.env.PELUDESK_WABA_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN;
  if (!waba || !token) return false;
  try {
    const r = await fetch(`${graphBase()}/${VERSION_GRAPH}/${waba}/message_templates?name=${plantilla.nombre}&fields=name,status,language,category&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await r.json().catch(() => ({}))) as { data?: { name: string; status: string; language?: string; category?: string }[] };
    return (j.data ?? []).some((p) => p.name === plantilla.nombre && p.status === "APPROVED" && p.category === "UTILITY" && (!p.language || p.language === plantilla.idioma));
  } catch {
    return false;
  }
}

const limpiar = (t: string, largo = 60) => t.replace(/[\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, largo);

/** «jueves 16 de octubre a las 5:30 p. m.» en la hora del negocio. */
export function textoCuando(instante: string, zona: string): string {
  const d = new Date(instante);
  const partes = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone: zona }).formatToParts(d);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("weekday")} ${p("day")} de ${p("month")} a las ${p("hour")}:${p("minute")} ${p("dayPeriod").replace(/\./g, "").replace(/^([ap])\s?m$/i, "$1. m.")}`.replace(/ +/g, " ").trim();
}

export type DatosLiga = { dueno: string; mascota: string; medico: string; negocio: string; cuando: string; liga: string; telefonoNegocio: string };

/** Los parámetros de la plantilla, en su orden. */
export function parametrosPlantilla(d: DatosLiga): string[] {
  const tel = d.telefonoNegocio.replace(/\D/g, "").slice(-10);
  return [
    limpiar(d.dueno.split(" ")[0] ?? "") || "cliente",
    limpiar(d.mascota),
    limpiar(d.medico),
    limpiar(d.negocio),
    limpiar(d.cuando, 80),
    d.liga,
    tel.length === 10 ? `${tel.slice(0, 3)} ${tel.slice(3, 6)} ${tel.slice(6)}` : "el del consultorio",
  ];
}

/** El mismo mensaje, para mandarlo a mano con wa.me. */
export function mensajeManual(d: DatosLiga): string {
  const tel = d.telefonoNegocio.replace(/\D/g, "").slice(-10);
  return (
    `Hola ${d.dueno.split(" ")[0] || ""}. ${d.mascota} tiene una teleconsulta con ${d.medico} en ${d.negocio} el ${d.cuando}. ` +
    `Para entrar, firma el consentimiento y abre este enlace desde tu celular, sin instalar nada: ${d.liga}` +
    (tel.length === 10 ? ` Cualquier duda, llámanos al ${tel}.` : "")
  );
}
