"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

/** Cliente nuevo: crea el cliente y el expediente con lo compartido, liga la mascota de la app y nace la reserva o la cita. */
export async function aceptarClienteNuevo(id: string, datos: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("solicitud_aceptar", {
    p_id: id,
    p_motivo: String(datos.get("motivo") ?? "").trim() || null,
    p_tamano: String(datos.get("tamano") ?? "") || null,
    p_pelaje: String(datos.get("pelaje") ?? "") || null,
  });
  if (error) return { error: mensajeDeError(error) };
  await copiarFoto(data as { cliente_id: string; perro_id: string; negocio_id: string; datos_compartidos: { mascota?: { foto_path?: string | null } } | null });
  despacharAvisosAlTerminar();
  return { error: null, ir: `/solicitudes?hecho=${Date.now()}` };
}

// La foto vive en el bucket de la app; el expediente lee la suya de perros-archivos. Sin foto, el expediente queda igual.
async function copiarFoto(s: { cliente_id: string; perro_id: string; negocio_id: string; datos_compartidos: { mascota?: { foto_path?: string | null } } | null }) {
  const ruta = s.datos_compartidos?.mascota?.foto_path;
  if (!ruta) return;
  try {
    const admin = createSupabaseAdminClient(s.negocio_id);
    const { data: archivo, error } = await admin.storage.from("app-mascotas").download(ruta);
    if (error || !archivo) throw new Error(error?.message ?? "sin archivo");
    const destino = `${s.cliente_id}/${s.perro_id}/foto-app-${Date.now()}.${ruta.split(".").pop() ?? "jpg"}`;
    const subida = await admin.storage.from("perros-archivos").upload(destino, archivo, { contentType: archivo.type || "image/jpeg" });
    if (subida.error) throw new Error(subida.error.message);
    await admin.from("perros").update({ foto_path: destino }).eq("id", s.perro_id).eq("negocio_id", s.negocio_id);
  } catch (e) {
    console.error("[solicitudes] foto", e instanceof Error ? e.message : e);
  }
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
