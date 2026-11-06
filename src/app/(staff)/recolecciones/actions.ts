"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "@/app/(staff)/reservas/traducir-error";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { geocodificarDireccion } from "@/lib/google-maps/geocodificar";
import { apartarConsulta, hayLlaveMaps, mensajeTope } from "@/lib/google-maps/cuota";
import { negocioActual } from "@/lib/negocio/actual";
import type { Cotizacion, PedidoRecoleccion, Recoleccion } from "@/lib/recoleccion/tipos";

// Recolección a domicilio (migración 20261203004100). Todo pasa por las funciones recoleccion_*: la base decide quién
// puede (personal, o el dueño de la cuenta), resuelve el precio por km con la tarifa del negocio y liga el cargo a la
// cuenta. Aquí solo se geocodifica una dirección nueva (con la llave de PeluDesk y su tope por negocio) y se traduce.

export type ResultadoCotizar = { error: string | null; cotizacion?: Cotizacion; lat?: number | null; lng?: number | null; simulado?: boolean };
export type ResultadoRecoleccion = { error: string | null; recoleccion?: Recoleccion; registros?: RegistroFinal[] };

/** La dirección guardada del cliente y los puntos de partida, para abrir «Incluir recolección» ya llenado. */
// registro-final: solo lee.
export async function datosParaRecoleccion(clienteId: string): Promise<{ error: string | null; direccion?: string | null; puntos?: { negocio: string | null; base: string | null } }> {
  const supabase = await createSupabaseServerClient();
  const [{ data: cli }, { data: puntos }] = await Promise.all([
    supabase.from("clientes").select("direccion").eq("id", clienteId).maybeSingle(),
    supabase.rpc("recoleccion_puntos_partida"),
  ]);
  const p = (puntos ?? {}) as { negocio?: { direccion: string | null } | null; base?: { direccion: string | null } | null };
  return { error: null, direccion: (cli?.direccion as string | null) ?? null, puntos: { negocio: p.negocio?.direccion ?? null, base: p.base?.direccion ?? null } };
}

/**
 * Cotiza: si la dirección es la guardada del cliente, la base usa su distancia; si es nueva, se geocodifica aquí (una
 * consulta contra el tope del mes) y la base calcula los km. Sin Google (sin llave o sin cuota) la pantalla pide los km a mano.
 */
// registro-final: solo cotiza; no cambia nada.
export async function cotizarRecoleccion(clienteId: string, direccion: string, punto: "negocio" | "base", kmManual?: number | null): Promise<ResultadoCotizar> {
  const dir = direccion.trim();
  if (dir.length < 5) return { error: "Escribe la dirección de la recolección." };
  const supabase = await createSupabaseServerClient();
  // Primero sin gastar: la base dice si la dirección es la guardada (y ya tiene km).
  const primera = await supabase.rpc("recoleccion_cotizar", { p_cliente: clienteId, p_direccion: dir, p_lat: null, p_lng: null, p_punto: punto });
  if (primera.error) return { error: traducirError(primera.error) };
  let cot = primera.data as Cotizacion;
  let lat: number | null = cot.origen_km === "guardada" ? cot.lat_guardada : null;
  let lng: number | null = cot.origen_km === "guardada" ? cot.lng_guardada : null;
  let simulado = false;
  if (cot.km == null && kmManual == null) {
    // Dirección nueva: geocodificar (con la ciudad del negocio y centrada en su local).
    const negocio = await negocioActual();
    const [{ data: suc }, { data: neg }] = await Promise.all([
      supabase.from("sucursales").select("lat, lng").eq("negocio_id", negocio.id).is("deleted_at", null).order("activo", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("negocios").select("ciudad").eq("id", negocio.id).maybeSingle(),
    ]);
    if (hayLlaveMaps()) {
      const c = await apartarConsulta(supabase, "geocodificar");
      if (!c.permitida) return { error: `${mensajeTope(c)} Escribe los km a mano.` };
    }
    const g = await geocodificarDireccion(dir, { ciudad: (neg?.ciudad as string | null) ?? null, centro: suc?.lat && suc?.lng ? { lat: Number(suc.lat), lng: Number(suc.lng) } : null });
    if (!g.ok) return { error: `${g.error} Escribe los km a mano.` };
    lat = g.lat;
    lng = g.lng;
    simulado = Boolean(g.simulado);
    const segunda = await supabase.rpc("recoleccion_cotizar", { p_cliente: clienteId, p_direccion: dir, p_lat: lat, p_lng: lng, p_punto: punto });
    if (segunda.error) return { error: traducirError(segunda.error) };
    cot = segunda.data as Cotizacion;
  }
  if (kmManual != null && Number.isFinite(kmManual) && kmManual >= 0) {
    // Km a mano: el precio es la tarifa × esos km (misma cuenta que hará el cargo).
    const cant = Math.max(1, Math.ceil(kmManual));
    cot = { ...cot, km: kmManual, origen_km: "sin_datos", cantidad: cant, precio: cot.precio_km != null ? Math.round(cot.precio_km * cant * 100) / 100 : null };
  }
  if (cot.sin_tarifa) return { error: cot.sin_tarifa, cotizacion: cot, lat, lng, simulado };
  return { error: null, cotizacion: cot, lat, lng, simulado };
}

export async function guardarRecoleccion(
  destino: { reservaId: string; estanciaId?: string | null; citaId?: string | null; fecha?: string | null },
  pedido: PedidoRecoleccion
): Promise<ResultadoRecoleccion> {
  if (!destino.reservaId) return { error: "Falta la reserva." };
  if (pedido.direccion.trim().length < 5) return { error: "Escribe la dirección de la recolección." };
  if (!Number.isFinite(pedido.km) || pedido.km < 0) return { error: "Falta la distancia (km) de la recolección: cotízala primero." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("recoleccion_guardar", {
    p_reserva: destino.reservaId,
    p_estancia: destino.estanciaId ?? null,
    p_cita: destino.citaId ?? null,
    p_fecha: destino.fecha ?? null,
    p_hora: pedido.hora || null,
    p_direccion: pedido.direccion.trim(),
    p_lat: pedido.lat,
    p_lng: pedido.lng,
    p_punto: pedido.punto,
    p_km: pedido.km,
    p_notas: pedido.notas.trim() || null,
    p_guardar_direccion: pedido.guardarDireccion,
  });
  if (error) return { error: traducirError(error) };
  const r = data as Recoleccion;
  return { error: null, recoleccion: r, registros: await registrosDe(supabase, [{ t: "recolecciones", i: r.id, datos: r }, { t: "cargos_aplicados", i: r.cargo_id }, { t: "reservas", i: r.reserva_id }]) };
}

export async function marcarRecoleccion(id: string, estado: "en_camino" | "recogido" | "pendiente"): Promise<ResultadoRecoleccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("recoleccion_marcar", { p_id: id, p_estado: estado });
  if (error) return { error: traducirError(error) };
  const r = data as Recoleccion;
  return { error: null, recoleccion: r, registros: await registrosDe(supabase, [{ t: "recolecciones", i: r.id, datos: r }]) };
}

export async function cancelarRecoleccion(id: string, motivo: string): Promise<ResultadoRecoleccion> {
  if (motivo.trim().length < 3) return { error: "Escribe por qué se cancela la recolección." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("recoleccion_cancelar", { p_id: id, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  const r = data as Recoleccion;
  return { error: null, recoleccion: r, registros: await registrosDe(supabase, [{ t: "recolecciones", i: r.id, datos: r }, { t: "cargos_aplicados", i: r.cargo_id }, { t: "reservas", i: r.reserva_id }]) };
}
