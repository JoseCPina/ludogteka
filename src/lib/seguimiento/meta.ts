import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { graphBase, VERSION_GRAPH } from "@/lib/whatsapp/infra";
import { PLANTILLAS, componentesParaMeta, type PlantillaSeguimiento } from "./plantillas";

// Las plantillas del seguimiento en Meta: crear (enviar a revisión), consultar
// su estado y guardarlo en seguimiento_pruebas_plantillas. El sistema NUNCA
// manda una plantilla cuyo estado guardado no sea APPROVED.
//
// Variables: WHATSAPP_TOKEN (el mismo del bot) y PELUDESK_WABA_ID (la cuenta de
// WhatsApp Business de PeluDesk; no es un secreto).

export type EstadoMeta = { nombre: string; estado: string; categoria: string | null; motivo: string | null };

type Json = { error?: { error_user_msg?: string; message?: string }; data?: unknown[]; status?: string; category?: string };

const token = () => process.env.WHATSAPP_TOKEN ?? "";
const waba = () => process.env.PELUDESK_WABA_ID?.trim() ?? "";
export const metaConfigurada = () => Boolean(token() && waba());

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

/** El estado de cada plantilla del seguimiento, tal como lo tiene Meta ahora (es_MX). */
export async function consultarEstados(): Promise<EstadoMeta[]> {
  const r = await graph(`/${waba()}/message_templates?name=peludesk_prueba&fields=name,status,category,language,rejected_reason&limit=100`);
  if (!r.ok) throw new Error(`Meta: ${mensajeDeError(r.json)}`);
  const filas = (r.json.data ?? []) as { name: string; status: string; category?: string; language?: string; rejected_reason?: string }[];
  return filas
    .filter((f) => f.language === "es_MX" || !f.language)
    .map((f) => ({ nombre: f.name, estado: f.status, categoria: f.category ?? null, motivo: f.rejected_reason && f.rejected_reason !== "NONE" ? f.rejected_reason : null }));
}

/** Manda a revisión una plantilla (MARKETING, es_MX). Devuelve el estado inicial que contesta Meta. */
export async function enviarARevision(p: PlantillaSeguimiento): Promise<{ ok: boolean; estado?: string; categoria?: string; error?: string }> {
  const r = await graph(`/${waba()}/message_templates`, {
    method: "POST",
    body: { name: p.nombre, language: "es_MX", category: p.categoria, components: componentesParaMeta(p) },
  });
  if (!r.ok) return { ok: false, error: mensajeDeError(r.json) };
  return { ok: true, estado: r.json.status ?? "PENDING", categoria: r.json.category };
}

/**
 * Consulta Meta y guarda el estado de las 4 plantillas. Con `enviarFaltantes`
 * manda a revisión las que Meta todavía no tiene. Devuelve cómo quedó cada una.
 */
export async function sincronizarPlantillas(opciones: { enviarFaltantes?: boolean } = {}): Promise<{ nombre: string; estado: string; accion: string }[]> {
  if (!metaConfigurada()) throw new Error("Falta WHATSAPP_TOKEN o PELUDESK_WABA_ID.");
  const sb = createSupabaseAdminClient();
  const estados = await consultarEstados();
  const resultado: { nombre: string; estado: string; accion: string }[] = [];
  for (const p of PLANTILLAS) {
    const en = estados.find((e) => e.nombre === p.nombre);
    let estado = en?.estado ?? "SIN_ENVIAR";
    let categoria = en?.categoria ?? null;
    let motivo = en?.motivo ?? null;
    let accion = en ? "consultada" : "no existe en Meta";
    let enviada = false;
    if (!en && opciones.enviarFaltantes) {
      const r = await enviarARevision(p);
      if (r.ok) {
        estado = r.estado ?? "PENDING";
        categoria = r.categoria ?? p.categoria;
        enviada = true;
        accion = "enviada a revisión";
      } else {
        estado = "ERROR_AL_ENVIAR";
        motivo = r.error ?? null;
        accion = "Meta la rechazó al crearla";
      }
    }
    const { error } = await sb.rpc("seguimiento_plantilla_guardar", { p_nombre: p.nombre, p_etapa: p.etapa, p_categoria: categoria, p_estado: estado, p_motivo: motivo, p_enviada: enviada });
    if (error) throw new Error(`seguimiento_plantilla_guardar: ${error.message}`);
    resultado.push({ nombre: p.nombre, estado, accion });
  }
  return resultado;
}
