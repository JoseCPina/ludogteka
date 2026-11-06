"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mensajeDeError } from "@/lib/empleados/errores";
import type { ResultadoAccion } from "@/lib/empleados/tipos";
import { despacharAvisosAlTerminar } from "@/lib/app/avisos-negocio";
import { instanteDeHoraLocal } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";

// «Pedir lugar» (docs/app-duenos/FASE-3.md): la base decide quién puede y qué sigue faltando. Cada salida vuelve a la lista
// con `ir`, que la lee de nuevo.
async function resolver(rpc: string, args: Record<string, unknown>): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(rpc, args);
  if (error) return { error: mensajeDeError(error) };
  despacharAvisosAlTerminar();
  return { error: null, ir: `/solicitudes?hecho=${Date.now()}` };
}

export async function aceptarSolicitud(id: string): Promise<ResultadoAccion> {
  return resolver("solicitud_aceptar", { p_id: id, p_motivo: null });
}

export async function aceptarConExcepcion(id: string, datos: FormData): Promise<ResultadoAccion> {
  const motivo = String(datos.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "Escribe el motivo de la excepción." };
  return resolver("solicitud_aceptar", { p_id: id, p_motivo: motivo });
}

export async function rechazarSolicitud(id: string, datos: FormData): Promise<ResultadoAccion> {
  const motivo = String(datos.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { error: "Escribe el motivo: el dueño lo va a leer." };
  return resolver("solicitud_rechazar", { p_id: id, p_motivo: motivo });
}

export async function agendarEvaluacion(id: string, datos: FormData): Promise<ResultadoAccion> {
  const cuando = String(datos.get("cuando") ?? "");
  if (!cuando) return { error: "Escoge el día y la hora de la evaluación." };
  return resolver("solicitud_agendar_evaluacion", { p_id: id, p_cuando: instanteDeHoraLocal(cuando, await zonaActual()) });
}
