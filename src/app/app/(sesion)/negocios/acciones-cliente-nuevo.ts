"use server";

import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cotizarParaClienteNuevo, direccionDesdeUbicacion } from "@/lib/recoleccion/distancia";
import { avisarSolicitudAlNegocio } from "@/lib/app/solicitudes";
import { mensajeParaDueno } from "@/lib/app/mensajes";
import { mensajeSoloLectura } from "@/lib/solo-lectura";

/**
 * Hacerse cliente de un negocio PeluDesk desde la app (docs/app-duenos/FASE-3.md, «Cliente nuevo»). Quien pide todavía no
 * es miembro del negocio: la RLS no le deja leer nada de él, así que aquí se comprueba su sesión y lo demás corre con la
 * secret key atada al negocio, pasándole a la base QUIÉN pide. Nunca se le cree el dueño ni los km a quien llama.
 */
const UUID = /^[0-9a-f-]{36}$/i;
const POR_DIA = 5;
const SIN_SESION = "Tu sesión terminó. Entra otra vez.";

function rechazo(error: { code?: string; message?: string }): string {
  const texto = (error.message ?? "").trim();
  if (error.code === "42501" && /solo lectura|En la demo no se guardan/.test(texto)) return mensajeSoloLectura(error);
  return texto ? mensajeParaDueno(texto) : "No pudimos guardarlo. Intenta de nuevo.";
}

async function aceptaClientes(negocioId: string): Promise<boolean> {
  const { data } = await createSupabaseAdminClient(negocioId).from("negocios").select("acepta_clientes_app, estado").eq("id", negocioId).is("deleted_at", null).maybeSingle();
  return data?.acepta_clientes_app === true;
}

// registro-final: solo lee el cupo; no cambia nada.
export async function cupoClienteNuevoApp(negocioId: string, servicioId: string, entrada: string, salida: string): Promise<{ error: string | null; datos?: unknown }> {
  if (!(await sesionApp())) return { error: SIN_SESION };
  if (!UUID.test(negocioId) || !UUID.test(servicioId)) return { error: "Escoge el servicio." };
  if (!(await aceptaClientes(negocioId))) return { error: "Este negocio recibe clientes nuevos por WhatsApp." };
  const { data, error } = await createSupabaseAdminClient(negocioId).rpc("portal_disponibilidad_estancia", { p_servicio: servicioId, p_entrada: entrada, p_salida: salida });
  if (error) return { error: rechazo(error) };
  const d = data as { hay_cupo: boolean; dias: { fecha: string; abre: boolean; cupo: number | null; disponible: number }[] };
  return { error: null, datos: { hayCupo: d.hay_cupo, dias: d.dias } };
}

// registro-final: solo lee las horas libres; no cambia nada.
export async function horasClienteNuevoApp(negocioId: string, servicioId: string, fecha: string): Promise<{ error: string | null; datos?: unknown }> {
  if (!(await sesionApp())) return { error: SIN_SESION };
  if (!UUID.test(negocioId) || !UUID.test(servicioId)) return { error: "Escoge el servicio." };
  if (!(await aceptaClientes(negocioId))) return { error: "Este negocio recibe clientes nuevos por WhatsApp." };
  const { data, error } = await createSupabaseAdminClient(negocioId).rpc("portal_horas_disponibles", { p_servicio: servicioId, p_fecha: fecha });
  if (error) return { error: rechazo(error) };
  return { error: null, datos: data };
}

// registro-final: solo cotiza; no cambia nada que el dueño vea.
export async function cotizarRecoleccionNuevoApp(negocioId: string, direccion: string): Promise<{ error: string | null; datos?: { km: number; precio: number | null }; lat?: number | null; lng?: number | null }> {
  const s = await sesionApp();
  if (!s) return { error: SIN_SESION };
  if (!UUID.test(negocioId)) return { error: "Negocio inválido." };
  const r = await cotizarParaClienteNuevo({ negocioId, duenoId: s.dueno.id, direccion });
  if (r.error) return { error: r.error };
  if ((r.km ?? 0) > 60) return { error: "Esa dirección queda a más de 60 km del negocio. Pregúntale si puede pasar por tu mascota." };
  return { error: null, datos: { km: r.km!, precio: r.precio ?? null }, lat: r.lat ?? null, lng: r.lng ?? null };
}

// registro-final: solo propone una dirección; no cambia nada.
export async function direccionDeUbicacionNuevoApp(negocioId: string, lat: number, lng: number): Promise<{ error: string | null; direccion?: string }> {
  const s = await sesionApp();
  if (!s) return { error: SIN_SESION };
  if (!UUID.test(negocioId)) return { error: "Negocio inválido." };
  return direccionDesdeUbicacion(negocioId, { duenoId: s.dueno.id }, lat, lng);
}

export async function pedirClienteNuevoApp(
  negocioId: string,
  mascotaId: string,
  servicioId: string,
  entrada: string | null,
  salida: string | null,
  horas: number | null,
  inicioIso: string | null,
  recoleccion: { direccion: string; hora?: string | null; notas?: string | null } | null,
  consentido: boolean
): Promise<{ error: string | null; datos?: { id: string; estado: string; updated_at: string }; registros?: { t: string; i: string; datos: unknown }[] }> {
  const s = await sesionApp();
  if (!s) return { error: SIN_SESION };
  if (!UUID.test(negocioId) || !UUID.test(mascotaId) || !UUID.test(servicioId)) return { error: "Escoge la mascota y el servicio." };
  if (consentido !== true) return { error: "Confirma qué datos se comparten con el negocio." };
  const db = createSupabaseAdminClient();
  const { count } = await db.from("solicitudes_reserva").select("id", { count: "exact", head: true }).eq("dueno_id", s.dueno.id).eq("es_cliente_nuevo", true).gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  if ((count ?? 0) >= POR_DIA) return { error: `Ya pediste ser cliente ${POR_DIA} veces hoy. Espera su respuesta o inténtalo mañana.` };
  let conKm: Record<string, unknown> | null = null;
  if (recoleccion?.direccion?.trim()) {
    // Los km los vuelve a calcular el servidor por la dirección, nunca se le creen a la app.
    const q = await cotizarParaClienteNuevo({ negocioId, duenoId: s.dueno.id, direccion: recoleccion.direccion });
    if (q.error) return { error: q.error };
    if ((q.km ?? 0) > 60) return { error: "Esa dirección queda a más de 60 km del negocio. Pregúntale si puede pasar por tu mascota." };
    conKm = { direccion: recoleccion.direccion.trim(), lat: q.lat ?? null, lng: q.lng ?? null, punto: "negocio", km: q.km, hora: recoleccion.hora ?? null, notas: recoleccion.notas ?? null };
  }
  const { data, error } = await createSupabaseAdminClient(negocioId).rpc("app_pedir_cliente_nuevo", {
    p_dueno: s.dueno.id, p_mascota: mascotaId, p_servicio: servicioId, p_entrada: entrada, p_salida: salida,
    p_horas: horas && horas > 0 ? Math.round(horas) : null, p_inicio: inicioIso ? new Date(inicioIso).toISOString() : null, p_recoleccion: conKm, p_consentido: true,
  });
  if (error) return { error: rechazo(error) };
  const d = data as { id: string; estado: string; updated_at: string };
  avisarSolicitudAlNegocio({ negocioId, solicitudId: d.id });
  return { error: null, datos: d, registros: [{ t: "solicitudes_reserva", i: d.id, datos: d }] };
}

export async function cancelarClienteNuevoApp(negocioId: string, solicitudId: string): Promise<{ error: string | null; datos?: { id: string; estado: string; updated_at: string }; registros?: { t: string; i: string; datos: unknown }[] }> {
  const s = await sesionApp();
  if (!s) return { error: SIN_SESION };
  if (!UUID.test(negocioId) || !UUID.test(solicitudId)) return { error: "Solicitud inválida." };
  const { data, error } = await createSupabaseAdminClient(negocioId).rpc("app_cancelar_cliente_nuevo", { p_id: solicitudId, p_dueno: s.dueno.id });
  if (error) return { error: rechazo(error) };
  const d = data as { id: string; estado: string; updated_at: string };
  return { error: null, datos: d, registros: [{ t: "solicitudes_reserva", i: d.id, datos: d }] };
}
