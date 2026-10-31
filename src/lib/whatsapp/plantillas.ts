import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { graphBase, VERSION_GRAPH } from "./infra";
import { PLANTILLAS as SEGUIMIENTO, componentesParaMeta } from "@/lib/seguimiento/plantillas";
import { PLANTILLA_VENTAS, PLANTILLA_VENTAS_BOTON, PLANTILLA_VENTAS_CUERPO, PLANTILLA_VENTAS_PIE } from "./ventas/guion";
import recordatorios from "@/lib/recordatorios/plantillas.json";
import herramienta from "@/lib/herramientas/plantilla.json";
import carnet from "@/lib/carnet/plantilla-recordatorio.json";
import teleconsulta from "@/lib/telemedicina/plantilla-teleconsulta.json";
import perdida from "@/lib/app/plantilla-perdida.json";

/**
 * El catálogo ÚNICO de las plantillas de WhatsApp de PeluDesk (las que el bot y las tareas mandan desde el número de
 * PeluDesk) y lo que se hace con ellas en Meta: consultar su estado y mandar a aprobar las que falten. Los textos no
 * viven aquí: cada plantilla se arma desde su fuente (el JSON o el módulo que también la manda), así lo que se manda a
 * revisión es exactamente lo que después se envía. Lo usan /plataforma/plantillas-whatsapp (estado y botón «Mandar a
 * aprobar») y la tarea diaria /api/cron/plantillas-whatsapp (manda sola las que falten: una plantilla nueva en el
 * catálogo entra a revisión en la siguiente corrida). Corre en Vercel: WHATSAPP_TOKEN y PELUDESK_WABA_ID son
 * «Sensitive» y no se pueden bajar a una computadora.
 *
 * Una plantilla aprobada no se edita: cambiar un texto es una plantilla nueva (_v2) en su fuente; la vieja se retira
 * en Meta cuando la nueva está aprobada (scripts/whatsapp/meta.mjs plantilla-carnet-retirar es el ejemplo).
 */
export type CategoriaPlantilla = "UTILITY" | "MARKETING";
export type PlantillaPeluDesk = {
  nombre: string;
  idioma: string;
  categoria: CategoriaPlantilla;
  /** Para qué la usa el sistema, en una frase. */
  uso: string;
  /** Dónde vive su texto. */
  fuente: string;
  componentes: unknown[];
};

const cuerpo = (text: string, ejemplo: string[]) => ({ type: "BODY", text, ...(ejemplo.length ? { example: { body_text: [ejemplo] } } : {}) });
const botones = (textos: string[]) => (textos.length ? [{ type: "BUTTONS", buttons: textos.map((t) => ({ type: "QUICK_REPLY", text: t })) }] : []);
const NOMBRE_RECORDATORIO: Record<string, string> = {
  estetica: "cita de estética del día siguiente",
  veterinaria: "cita de veterinaria del día siguiente",
  llegada: "llegada a guardería u hotel del día siguiente",
  listo: "«ya está listo» para la entrega",
  vacuna: "próxima dosis según el carnet (con botones)",
};
const ETAPA_SEGUIMIENTO: Record<string, string> = { dia5: "día 5", dia10: "día 10", dia15: "día 15" };

export const PLANTILLAS_PELUDESK: PlantillaPeluDesk[] = [
  {
    nombre: herramienta.nombre,
    idioma: herramienta.idioma,
    categoria: "UTILITY",
    uso: "Entrega del resultado de una herramienta pública de peludesk.mx a quien dejó su WhatsApp; también la liga de la Escuela una hora antes.",
    fuente: "src/lib/herramientas/plantilla.json",
    componentes: [cuerpo(herramienta.cuerpo, herramienta.ejemplo), { type: "FOOTER", text: herramienta.pie }],
  },
  ...Object.entries(recordatorios.plantillas).map(([tipo, p]) => ({
    nombre: p.nombre,
    idioma: recordatorios.idioma,
    categoria: "UTILITY" as const,
    uso: `Recordatorio automático: ${NOMBRE_RECORDATORIO[tipo] ?? tipo}.`,
    fuente: "src/lib/recordatorios/plantillas.json",
    componentes: [cuerpo(p.cuerpo, p.ejemplo), { type: "FOOTER", text: recordatorios.pie }, ...botones((p.botones as { texto: string }[]).map((b) => b.texto))],
  })),
  {
    nombre: carnet.nombre,
    idioma: carnet.idioma,
    categoria: carnet.categoria as CategoriaPlantilla,
    uso: "Próxima dosis del carnet (Veterinaria), desde la clínica.",
    fuente: "src/lib/carnet/plantilla-recordatorio.json",
    componentes: [cuerpo(carnet.cuerpo, carnet.ejemplos)],
  },
  {
    nombre: perdida.nombre,
    idioma: perdida.idioma,
    categoria: "UTILITY",
    uso: "App para dueños: aviso a los negocios PeluDesk de la zona cuando un dueño marca a su mascota como perdida (docs/app-duenos/FASE-1.md).",
    fuente: "src/lib/app/plantilla-perdida.json",
    componentes: [cuerpo(perdida.cuerpo, perdida.ejemplos)],
  },
  {
    nombre: teleconsulta.nombre,
    idioma: teleconsulta.idioma,
    categoria: teleconsulta.categoria as CategoriaPlantilla,
    uso: "La liga de una teleconsulta (Veterinaria).",
    fuente: "src/lib/telemedicina/plantilla-teleconsulta.json",
    componentes: [cuerpo(teleconsulta.cuerpo, teleconsulta.ejemplos)],
  },
  {
    nombre: "peludesk_seguimiento_v1",
    idioma: "es_MX",
    categoria: "UTILITY",
    uso: "Reabrir la ventana de 24 horas con quien dejó una pregunta en el bot y ya tiene respuesta.",
    fuente: "src/lib/whatsapp/plantillas.ts",
    componentes: [cuerpo("Hola, te escribimos de PeluDesk por la pregunta que nos dejaste por aquí. Ya tenemos tu respuesta; contéstanos este mensaje y te la mandamos.", [])],
  },
  {
    nombre: PLANTILLA_VENTAS,
    idioma: "es_MX",
    categoria: "MARKETING",
    uso: "Seguimiento de ventas fuera de la ventana de 24 horas (máximo 2 por persona).",
    fuente: "src/lib/whatsapp/ventas/guion.ts",
    componentes: [cuerpo(PLANTILLA_VENTAS_CUERPO, []), { type: "FOOTER", text: PLANTILLA_VENTAS_PIE }, ...botones([PLANTILLA_VENTAS_BOTON])],
  },
  ...SEGUIMIENTO.map((p) => ({
    nombre: p.nombre,
    idioma: "es_MX",
    categoria: "MARKETING" as const,
    uso: `Seguimiento de la prueba gratis, ${ETAPA_SEGUIMIENTO[p.etapa] ?? p.etapa}${p.variante === "perfil" ? " (perfil completo)" : p.variante === "sin_perfil" ? " (sin perfil)" : ""}.`,
    fuente: "src/lib/seguimiento/plantillas.ts",
    componentes: componentesParaMeta(p),
  })),
];

export const plantillaPorNombre = (nombre: string) => PLANTILLAS_PELUDESK.find((p) => p.nombre === nombre) ?? null;

/** Lo que Meta dice de una plantilla. */
export type EstadoEnMeta = { nombre: string; idioma: string; estado: string; categoria: string | null; motivo: string | null; calidad: string | null };

/** Una fila de la pantalla: la plantilla del catálogo y cómo está en Meta (`estado` «NO_EXISTE» si no la tiene). */
export type FilaPlantilla = PlantillaPeluDesk & { estado: string; categoriaMeta: string | null; motivo: string | null; calidad: string | null };

type Json = { error?: { error_user_msg?: string; message?: string; code?: number }; data?: unknown[]; paging?: { next?: string }; status?: string; category?: string; id?: string };

const token = () => process.env.WHATSAPP_TOKEN ?? "";
const waba = () => process.env.PELUDESK_WABA_ID?.trim() ?? "";
export const metaPlantillasConfigurada = () => Boolean(token() && waba());

async function graph(ruta: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; estado: number; json: Json }> {
  const r = await fetch(`${graphBase()}/${VERSION_GRAPH}${ruta}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await r.json().catch(() => ({}))) as Json;
  return { ok: r.ok && !json.error, estado: r.status, json };
}
const mensajeDeError = (j: Json): string => j.error?.error_user_msg ?? j.error?.message ?? "Meta no dio detalle";

/** Todas las plantillas de la WABA de PeluDesk tal como las tiene Meta ahora (hasta 200). Lanza si Meta no contesta. */
export async function plantillasEnMeta(): Promise<EstadoEnMeta[]> {
  if (!metaPlantillasConfigurada()) throw new Error("Faltan WHATSAPP_TOKEN o PELUDESK_WABA_ID en las variables de Vercel.");
  const r = await graph(`/${waba()}/message_templates?fields=name,status,category,language,rejected_reason,quality_score&limit=200`);
  if (!r.ok) throw new Error(`Meta: ${mensajeDeError(r.json)}`);
  const filas = (r.json.data ?? []) as { name: string; status: string; category?: string; language?: string; rejected_reason?: string; quality_score?: { score?: string } }[];
  return filas.map((f) => ({
    nombre: f.name,
    idioma: f.language ?? "es_MX",
    estado: f.status,
    categoria: f.category ?? null,
    motivo: f.rejected_reason && f.rejected_reason !== "NONE" ? f.rejected_reason : null,
    calidad: f.quality_score?.score && f.quality_score.score !== "UNKNOWN" ? f.quality_score.score : null,
  }));
}

/** Manda una plantilla del catálogo a revisión. Devuelve el estado inicial que contesta Meta (normalmente PENDING). */
export async function mandarAAprobar(p: PlantillaPeluDesk): Promise<{ ok: boolean; estado?: string; categoria?: string; error?: string }> {
  if (!metaPlantillasConfigurada()) return { ok: false, error: "Faltan WHATSAPP_TOKEN o PELUDESK_WABA_ID en las variables de Vercel." };
  const r = await graph(`/${waba()}/message_templates`, { method: "POST", body: { name: p.nombre, language: p.idioma, category: p.categoria, components: p.componentes } });
  if (!r.ok) return { ok: false, error: mensajeDeError(r.json) };
  return { ok: true, estado: r.json.status ?? "PENDING", categoria: r.json.category ?? p.categoria };
}

/** El catálogo junto con su estado en Meta, y las plantillas que Meta tiene y el código ya no usa. */
export async function estadoDePlantillas(): Promise<{ filas: FilaPlantilla[]; otras: EstadoEnMeta[] }> {
  const enMeta = await plantillasEnMeta();
  const filas = PLANTILLAS_PELUDESK.map((p) => {
    const m = enMeta.find((x) => x.nombre === p.nombre && x.idioma === p.idioma) ?? enMeta.find((x) => x.nombre === p.nombre);
    return { ...p, estado: m?.estado ?? "NO_EXISTE", categoriaMeta: m?.categoria ?? null, motivo: m?.motivo ?? null, calidad: m?.calidad ?? null };
  });
  const nuestras = new Set(PLANTILLAS_PELUDESK.map((p) => p.nombre));
  return { filas, otras: enMeta.filter((m) => !nuestras.has(m.nombre)) };
}

export type ResultadoSincronizacion = { revisado_at: string; filas: { nombre: string; estado: string; categoria: string | null; motivo: string | null; accion: string }[]; otras: string[] };
const CLAVE_CONFIG = "plantillas_meta";

/**
 * Consulta Meta y, con `enviarFaltantes`, manda a revisión las del catálogo que Meta no tiene. Guarda el resultado en
 * wa_config (clave plantillas_meta) para que la pantalla diga cuándo fue la última revisión aunque Meta no conteste.
 */
export async function sincronizarPlantillas(o: { enviarFaltantes: boolean }): Promise<ResultadoSincronizacion> {
  const { filas, otras } = await estadoDePlantillas();
  const salida: ResultadoSincronizacion = { revisado_at: new Date().toISOString(), filas: [], otras: otras.map((x) => `${x.nombre} [${x.idioma}] ${x.estado}`) };
  for (const f of filas) {
    let { estado, motivo } = f;
    let categoria = f.categoriaMeta;
    let accion = f.estado === "NO_EXISTE" ? "no existe en Meta" : "consultada";
    if (f.estado === "NO_EXISTE" && o.enviarFaltantes) {
      const r = await mandarAAprobar(f);
      if (r.ok) {
        estado = r.estado ?? "PENDING";
        categoria = r.categoria ?? f.categoria;
        accion = "enviada a revisión";
      } else {
        estado = "ERROR_AL_ENVIAR";
        motivo = r.error ?? null;
        accion = "Meta la rechazó al crearla";
      }
    }
    salida.filas.push({ nombre: f.nombre, estado, categoria, motivo, accion });
  }
  const sb = createSupabaseAdminClient();
  await sb.from("wa_config").update({ deleted_at: new Date().toISOString() }).eq("clave", CLAVE_CONFIG).is("deleted_at", null);
  const { error } = await sb.from("wa_config").insert({ clave: CLAVE_CONFIG, valor: JSON.stringify(salida) });
  if (error) console.error("[plantillas] wa_config", error.message);
  return salida;
}

/** La última sincronización guardada (la de la tarea diaria o la del botón), o null. */
export async function ultimaSincronizacion(): Promise<ResultadoSincronizacion | null> {
  const { data } = await createSupabaseAdminClient().from("wa_config").select("valor").eq("clave", CLAVE_CONFIG).is("deleted_at", null).maybeSingle();
  if (!data?.valor) return null;
  try {
    return JSON.parse(data.valor as string) as ResultadoSincronizacion;
  } catch {
    return null;
  }
}
