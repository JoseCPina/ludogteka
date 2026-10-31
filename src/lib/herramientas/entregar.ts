import plantilla from "./plantilla.json";
import { ClienteWA, configWhatsApp, graphBase, marcarNumeroContesta, VERSION_GRAPH } from "@/lib/whatsapp/infra";
import { limpiarVariable } from "@/lib/recordatorios/plantillas";

/**
 * Entrega por WhatsApp del resultado de una herramienta pública, desde el número de PeluDesk, con la plantilla
 * UTILITY `peludesk_herramienta_v1` (texto único en plantilla.json). Un solo intento: si Meta no la acepta (la
 * plantilla sigue en revisión, el número no tiene WhatsApp), la persona ya vio el resultado en pantalla y el
 * prospecto queda registrado igual; se devuelve el motivo para anotarlo. Nunca lanza.
 */
export const PLANTILLA_HERRAMIENTA = plantilla;

export function textoEntrega(nombre: string, resumen: string, url: string): string {
  return plantilla.cuerpo.replace("{{1}}", nombre).replace("{{2}}", resumen).replace("{{3}}", url);
}

let estadoPlantilla: { leido: number; aprobada: boolean } | null = null;

/** ¿Meta ya aprobó la plantilla como UTILITY? Se consulta a lo más una vez cada 10 minutos. */
export async function plantillaHerramientaAprobada(): Promise<boolean> {
  if (process.env.VERCEL_ENV !== "production" && process.env.WHATSAPP_GRAPH_URL) return true; // dobles de las pruebas
  if (estadoPlantilla && Date.now() - estadoPlantilla.leido < 10 * 60_000) return estadoPlantilla.aprobada;
  const waba = process.env.PELUDESK_WABA_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN;
  if (!waba || !token) return false;
  try {
    const r = await fetch(`${graphBase()}/${VERSION_GRAPH}/${waba}/message_templates?fields=name,status,language,category&name=${plantilla.nombre}&limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await r.json().catch(() => ({}))) as { data?: { name: string; status: string; language?: string; category?: string }[] };
    const p = (j.data ?? []).find((x) => x.name === plantilla.nombre && (!x.language || x.language === plantilla.idioma));
    const aprobada = p?.status === "APPROVED" && p.category === "UTILITY";
    estadoPlantilla = { leido: Date.now(), aprobada };
    return aprobada;
  } catch (e) {
    console.error("[herramientas] estado de la plantilla", e instanceof Error ? e.message : e);
    return false;
  }
}

export type ResultadoEntrega = { enviado: boolean; motivo?: string; waId?: string | null };

export async function entregarPorWhatsApp(o: { telefono: string; nombre?: string | null; resumen: string; url: string; herramienta: string; prospectoId?: string | null }): Promise<ResultadoEntrega> {
  const cfg = configWhatsApp();
  if (!cfg.token || !cfg.phoneNumberId) return { enviado: false, motivo: "WhatsApp sin configurar" };
  if (!(await plantillaHerramientaAprobada())) return { enviado: false, motivo: "plantilla sin aprobar" };
  const digitos = o.telefono.replace(/\D/g, "").slice(-10);
  if (digitos.length !== 10) return { enviado: false, motivo: "teléfono inválido" };
  const wa = new ClienteWA(cfg.token, cfg.phoneNumberId, marcarNumeroContesta);
  const parametros = [limpiarVariable(o.nombre?.split(/\s+/)[0] || "", 40) || "hola", limpiarVariable(o.resumen, 600), o.url.slice(0, 500)];
  try {
    const r = await wa.plantillaConParametros(`52${digitos}`, plantilla.nombre, parametros, [], {
      origen: "bot",
      refId: o.prospectoId ?? null,
      etiqueta: `Herramienta ${o.herramienta}`,
    });
    return r.ok ? { enviado: true, waId: r.id ?? null } : { enviado: false, motivo: `${r.estado ?? "red"}${r.codigo ? `/${r.codigo}` : ""}: ${r.error ?? "sin detalle"}` };
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
