"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

export type EstadoAccion = { error: string | null };
export type EstadoCrearCita = { error: string | null; citaId?: string };

export async function crearCita(datos: {
  peloMaltratado?: boolean;
  perroId: string;
  servicioId: string;
  empleadoId: string;
  inicio: string;
  estanciaId: string | null;
  // Raza sin grupo de precio en el negocio: el grupo de esta cita y por qué.
  grupoExcepcionId?: string | null;
  motivoExcepcion?: string | null;
  // Recargo manual (solo con «excepciones al reservar»; la base lo exige).
  recargo?: number | null;
  motivoRecargo?: string | null;
}): Promise<EstadoCrearCita> {
  if (!datos.perroId || !datos.servicioId || !datos.empleadoId || !datos.inicio) {
    return { error: "Completa perro, servicio, empleado y hora." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: reserva, error: errorReserva } = await supabase
    .from("perros")
    .select("cliente_id")
    .eq("id", datos.perroId)
    .single();
  if (errorReserva || !reserva) return { error: "No pudimos encontrar al perro." };

  const { data: reservaCreada, error: errorCrearReserva } = await supabase
    .from("reservas")
    .insert({ cliente_id: reserva.cliente_id })
    .select("id")
    .single();
  if (errorCrearReserva || !reservaCreada) {
    return { error: "No pudimos crear la reserva para esta cita." };
  }

  const { data, error } = await supabase
    .from("citas_estetica")
    .insert({
      reserva_id: reservaCreada.id,
      perro_id: datos.perroId,
      servicio_id: datos.servicioId,
      // Lo marca quien recibe al perro. No agrega un cargo: cambia el
      // precio al alternativo del MISMO servicio, y de eso se encarga el
      // trigger al cotizar.
      pelo_maltratado: datos.peloMaltratado ?? false,
      empleado_id: datos.empleadoId,
      inicio: datos.inicio,
      estancia_id: datos.estanciaId,
      ...(datos.recargo && datos.recargo > 0 ? { recargo: datos.recargo, recargo_motivo: datos.motivoRecargo ?? null } : {}),
      ...(datos.grupoExcepcionId ? { grupo_raza_excepcion_id: datos.grupoExcepcionId, excepcion_grupo_motivo: datos.motivoExcepcion ?? null } : {}),
    })
    .select("id")
    .single();

  if (error) {
    await supabase.from("reservas").delete().eq("id", reservaCreada.id);
    return { error: traducirError(error) };
  }

  revalidatePath("/estetica");
  return { error: null, citaId: data.id };
}

/** Pone, cambia o quita el recargo manual de una cita que todavía no se cierra. */
export async function aplicarRecargoCita(citaId: string, recargo: number, motivo: string): Promise<EstadoAccion> {
  if (!Number.isFinite(recargo) || recargo < 0 || recargo > 100000) return { error: "Escribe un recargo de cero para arriba." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("citas_estetica")
    .update({ recargo, recargo_motivo: recargo > 0 ? motivo.trim() || null : null })
    .eq("id", citaId);
  if (error) return { error: traducirError(error) };
  revalidatePath(`/estetica/${citaId}`);
  revalidatePath("/estetica");
  return { error: null };
}

export type EstadoReasignar = { error: string | null; de?: string; a?: string; ajusteNomina?: boolean; sinCambio?: boolean };

/**
 * Cambia (o quita) la estilista de una cita. Todo lo decide la base
 * (reasignar_estilista_cita): quién puede en cada estado, el motivo que pide,
 * que la estilista sea del negocio y esté activa, y el historial.
 */
export async function reasignarEstilista(
  citaId: string,
  empleadoId: string | null,
  motivo: string | null
): Promise<EstadoReasignar> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reasignar_estilista_cita", {
    p_cita_id: citaId,
    p_empleado_id: empleadoId,
    p_motivo: motivo,
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/estetica");
  revalidatePath(`/estetica/${citaId}`);
  revalidatePath("/recepcion");
  revalidatePath("/admin");
  const r = (data ?? {}) as { de?: string; a?: string; ajuste_nomina?: boolean; sin_cambio?: boolean };
  return { error: null, de: r.de, a: r.a, ajusteNomina: r.ajuste_nomina ?? false, sinCambio: r.sin_cambio ?? false };
}

export async function reagendarCita(citaId: string, nuevoInicio: string): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("citas_estetica")
    .update({ inicio: nuevoInicio, fin: null })
    .eq("id", citaId);

  if (error) return { error: traducirError(error) };
  revalidatePath("/estetica");
  return { error: null };
}

export async function cancelarCita(citaId: string): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("citas_estetica")
    .update({ estado: "cancelada" })
    .eq("id", citaId);

  if (error) return { error: traducirError(error) };
  revalidatePath("/estetica");
  return { error: null };
}

export async function marcarCitaNoLlego(citaId: string): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("citas_estetica")
    .update({ estado: "no_llego" })
    .eq("id", citaId);

  if (error) return { error: traducirError(error) };
  revalidatePath("/estetica");
  return { error: null };
}

export async function iniciarCita(
  citaId: string,
  entregadoPorNombre: string | null,
  entregadoPorTelefono: string | null
): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("citas_estetica")
    .update({
      estado: "en_curso",
      entregado_por_nombre: entregadoPorNombre,
      entregado_por_telefono: entregadoPorTelefono,
    })
    .eq("id", citaId);

  if (error) return { error: traducirError(error) };
  revalidatePath("/estetica");
  return { error: null };
}

export type AjusteConsumo = { insumo_id: string; cantidad: number };

export async function finalizarCita(
  citaId: string,
  recogidoPorNombre: string | null,
  recogidoPorTelefono: string | null,
  recogidoPorEsDueno: boolean | null,
  ajustesConsumo: AjusteConsumo[] = []
): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("finalizar_cita_con_consumo", {
    p_cita_id: citaId,
    p_recogido_por_nombre: recogidoPorNombre,
    p_recogido_por_telefono: recogidoPorTelefono,
    p_recogido_por_es_dueno: recogidoPorEsDueno,
    p_ajustes: ajustesConsumo,
  });

  if (error) return { error: traducirError(error) };
  revalidatePath("/estetica");
  return { error: null };
}

// ── Agendar: cotizar y completar los datos del perro ahí mismo ───────

export type CotizacionCita =
  | { error: string }
  | {
      error: null;
      estado: "ok" | "faltan_datos" | "sin_grupo" | "sin_precio" | "no_aplica" | "pelaje_no_ofrecido";
      precio?: number;
      faltan?: ("tamano" | "pelaje")[];
      motivo?: string | null;
      grupoNombre?: string | null;
      razaNombre?: string | null;
      rutaPrecios: string;
      maltratadoAplicado?: boolean;
    };

/** Lo que va a cobrar esta cita (sin escribir nada) o lo único que falta para saberlo. */
export async function cotizarCitaEstetica(
  perroId: string,
  servicioId: string,
  peloMaltratado: boolean,
  grupoExcepcionId: string | null
): Promise<CotizacionCita> {
  if (!perroId || !servicioId) return { error: "Elige un perro y un servicio." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cotizar_cita_estetica", {
    p_perro_id: perroId,
    p_servicio_id: servicioId,
    p_pelo_maltratado: peloMaltratado,
    p_grupo_excepcion_id: grupoExcepcionId,
  });
  if (error) return { error: traducirError(error) };
  const d = data as {
    estado: "ok" | "faltan_datos" | "sin_grupo" | "sin_precio" | "no_aplica" | "pelaje_no_ofrecido";
    precio?: number;
    faltan?: ("tamano" | "pelaje")[];
    motivo?: string | null;
    grupo_nombre?: string | null;
    raza_nombre?: string | null;
    ruta_precios: string;
    maltratado_aplicado?: boolean;
  };
  return {
    error: null,
    estado: d.estado,
    precio: d.precio === undefined ? undefined : Number(d.precio),
    faltan: d.faltan,
    motivo: d.motivo ?? null,
    grupoNombre: d.grupo_nombre ?? null,
    razaNombre: d.raza_nombre ?? null,
    rutaPrecios: d.ruta_precios,
    maltratadoAplicado: d.maltratado_aplicado,
  };
}

/** Guarda en el expediente del perro la talla y/o el pelaje que faltaban para cotizar. */
export async function completarTallaPelajeDelPerro(perroId: string, tamanoId: string | null, pelajeId: string | null): Promise<EstadoAccion> {
  if (!tamanoId && !pelajeId) return { error: "Elige lo que falta." };
  const supabase = await createSupabaseServerClient();
  const cambios: { tamano_id?: string; pelaje_id?: string } = {};
  if (tamanoId) cambios.tamano_id = tamanoId;
  if (pelajeId) cambios.pelaje_id = pelajeId;
  const { data, error } = await supabase.from("perros").update(cambios).eq("id", perroId).select("id");
  if (error) return { error: traducirError(error) };
  if (!data || data.length === 0) return { error: "No pudimos guardar: solo admin o recepción editan los datos del perro." };
  revalidatePath(`/perros/${perroId}`);
  return { error: null };
}
