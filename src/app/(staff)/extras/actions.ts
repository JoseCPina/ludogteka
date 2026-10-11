"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";
import { revalidarModulosEstancia } from "../reservas/revalidar";

export type ResultadoExtra = { error: string | null };
export type ResultadoAgregar = { error: string | null; cubierto?: boolean; creados?: number };

function refrescar() {
  revalidatePath("/extras");
  revalidatePath("/recepcion");
  revalidatePath("/admin");
  revalidarModulosEstancia();
}

// Toda la lógica y los permisos viven en la base (funciones extra_*): aquí solo se
// llaman con la sesión de quien está en el mostrador y se traduce el error.
async function llamar(fn: string, args: Record<string, unknown>): Promise<{ error: string | null; data: unknown }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error: traducirError(error), data: null };
  refrescar();
  return { error: null, data };
}

const horaONull = (h: string) => (h && /^\d{2}:\d{2}$/.test(h) ? h : null);

export async function agregarExtra(a: {
  estanciaId: string;
  extraId: string;
  fecha: string;
  hora: string;
  cantidad: number;
  zonaId: string;
  direccion: string;
  sentido: string;
  notas: string;
  yaHecho: boolean;
}): Promise<ResultadoAgregar> {
  if (!a.extraId) return { error: "Elige qué servicio extra agregar." };
  if (!a.fecha) return { error: "Elige la fecha." };
  const r = await llamar("extra_agregar", {
    p_estancia: a.estanciaId,
    p_extra: a.extraId,
    p_fecha: a.fecha,
    p_hora: horaONull(a.hora),
    p_cantidad: a.cantidad,
    p_zona: a.zonaId || null,
    p_direccion: a.direccion.trim() || null,
    p_sentido: a.sentido || null,
    p_notas: a.notas.trim() || null,
    p_ya_hecho: a.yaHecho,
  });
  if (r.error) return { error: r.error };
  const d = (r.data ?? {}) as { cubierto?: boolean };
  return { error: null, cubierto: Boolean(d.cubierto) };
}

export async function programarExtra(a: {
  estanciaId: string;
  extraId: string;
  desde: string;
  hasta: string;
  hora: string;
  cantidad: number;
  zonaId: string;
  direccion: string;
  sentido: string;
  notas: string;
}): Promise<ResultadoAgregar> {
  if (!a.extraId) return { error: "Elige qué servicio extra programar." };
  const r = await llamar("extra_programar", {
    p_estancia: a.estanciaId,
    p_extra: a.extraId,
    p_desde: a.desde,
    p_hasta: a.hasta,
    p_hora: horaONull(a.hora),
    p_cantidad: a.cantidad,
    p_zona: a.zonaId || null,
    p_direccion: a.direccion.trim() || null,
    p_sentido: a.sentido || null,
    p_notas: a.notas.trim() || null,
  });
  if (r.error) return { error: r.error };
  return { error: null, creados: Number(r.data ?? 0) };
}

export async function marcarExtraHecho(id: string): Promise<ResultadoAgregar> {
  const r = await llamar("extra_marcar_hecho", { p_id: id });
  if (r.error) return { error: r.error };
  return { error: null, cubierto: Boolean((r.data as { cubierto?: boolean } | null)?.cubierto) };
}

export async function salirTraslado(id: string): Promise<ResultadoExtra> {
  return { error: (await llamar("extra_traslado_salir", { p_id: id })).error };
}

export async function avisoTrasladoEnviado(id: string): Promise<ResultadoExtra> {
  return { error: (await llamar("extra_traslado_avisado", { p_id: id })).error };
}

export async function cancelarExtra(id: string, motivo: string): Promise<ResultadoExtra> {
  if (!motivo.trim()) return { error: "Escribe el motivo de la cancelación." };
  return { error: (await llamar("extra_cancelar", { p_id: id, p_motivo: motivo })).error };
}

// ── Catálogo (permiso «Editar catálogo de servicios extra») ──
export async function guardarExtraCatalogo(a: {
  id: string | null;
  nombre: string;
  descripcion: string;
  tipo: string;
  unidad: string;
  precio: number;
  claseFiscal: string;
  claveProdServ: string;
  activo: boolean;
}): Promise<ResultadoExtra & { id?: string }> {
  const r = await llamar("extra_guardar", {
    p_id: a.id,
    p_nombre: a.nombre,
    p_descripcion: a.descripcion,
    p_tipo: a.tipo,
    p_unidad: a.unidad,
    p_precio: Number.isFinite(a.precio) ? a.precio : 0,
    p_clase_fiscal: a.claseFiscal,
    p_clave_prod_serv: a.claveProdServ,
    p_activo: a.activo,
  });
  revalidatePath("/extras/catalogo");
  return { error: r.error, id: (r.data as string | null) ?? undefined };
}

export async function guardarZonaExtra(a: {
  id: string | null;
  extraId: string;
  nombre: string;
  kmHasta: number | null;
  precio: number;
  activo: boolean;
}): Promise<ResultadoExtra> {
  const r = await llamar("extra_zona_guardar", {
    p_id: a.id,
    p_extra: a.extraId,
    p_nombre: a.nombre,
    p_km_hasta: a.kmHasta,
    p_precio: Number.isFinite(a.precio) ? a.precio : 0,
    p_activo: a.activo,
  });
  revalidatePath("/extras/catalogo");
  return { error: r.error };
}

export async function guardarPaqueteExtra(a: {
  extraId: string;
  sesiones: number | null;
  precio: number;
  vigenciaDias: number | null;
}): Promise<ResultadoExtra> {
  const r = await llamar("extra_paquete_guardar", {
    p_extra: a.extraId,
    p_sesiones: a.sesiones,
    p_precio: a.precio,
    p_vigencia_dias: a.vigenciaDias,
  });
  revalidatePath("/extras/catalogo");
  return { error: r.error };
}
