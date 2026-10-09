"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { zonaActual } from "@/lib/negocio/actual";

export type EstadoAccion = { error: string | null };
export type EstadoCrearCita = { error: string | null; citaId?: string; reservaId?: string; fin?: string; precio?: number; tarifaGuarderia?: boolean };

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
  // Tarifa «cliente de guardería»: «auto» (la propone la base), «si» (a mano) o «no» (quitarla, con motivo).
  tarifaModo?: "auto" | "si" | "no";
  motivoTarifa?: string | null;
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
      ...(datos.tarifaModo && datos.tarifaModo !== "auto" ? { tarifa_guarderia_modo: datos.tarifaModo, tarifa_guarderia_motivo: datos.motivoTarifa ?? null } : {}),
      ...(datos.grupoExcepcionId ? { grupo_raza_excepcion_id: datos.grupoExcepcionId, excepcion_grupo_motivo: datos.motivoExcepcion ?? null } : {}),
    })
    .select("id, fin, precio, tarifa_guarderia")
    .single();

  if (error) {
    await supabase.from("reservas").delete().eq("id", reservaCreada.id);
    return { error: traducirError(error) };
  }

  revalidatePath("/estetica");
  return { error: null, citaId: data.id, reservaId: reservaCreada.id, fin: data.fin as string, precio: Number(data.precio), tarifaGuarderia: Boolean(data.tarifa_guarderia) };
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

export type ResultadoAgenda = { error: string | null; urlWhatsApp?: string; fueraDeHorario?: boolean; nuevoInicio?: string };

type DatosCambio = { cliente_nombre?: string | null; cliente_telefono?: string | null; perro_nombre?: string | null; servicio_nombre?: string | null; inicio_despues?: string; inicio?: string; fuera_de_horario?: boolean };

// El aviso al cliente: la app no manda nada sola (no hay confirmaciones
// automáticas de citas); deja listo el WhatsApp con el mensaje, como en las
// demás pantallas, y quien atiende decide si lo manda.
async function linkWhatsApp(d: DatosCambio, plantilla: (c: { cliente: string; perro: string; servicio: string; cuando: string; negocio: string }) => string, instante: string | undefined): Promise<string | undefined> {
  const telefono = String(d.cliente_telefono ?? "").replace(/\D/g, "").slice(-10);
  if (telefono.length < 10 || !instante) return undefined;
  const [negocio, zona] = await Promise.all([cargarNegocioLanding(), zonaActual()]);
  const cuando = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: zona }).format(new Date(instante));
  const mensaje = plantilla({ cliente: String(d.cliente_nombre ?? "").split(" ")[0] || "hola", perro: String(d.perro_nombre ?? "tu perro"), servicio: String(d.servicio_nombre ?? "su cita"), cuando, negocio: negocio.nombre });
  return `https://wa.me/52${telefono}?text=${encodeURIComponent(mensaje)}`;
}

/** Cambia la fecha y la hora de una cita (la base revisa empalmes, cobro y estado, y deja el historial). */
export async function reprogramarCita(citaId: string, nuevoInicio: string, motivo: string): Promise<ResultadoAgenda> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reprogramar_cita_estetica", { p_cita_id: citaId, p_inicio: nuevoInicio, p_motivo: motivo.trim() || null });
  if (error) return { error: traducirError(error) };
  const d = (data ?? {}) as DatosCambio;
  revalidatePath("/estetica");
  revalidatePath(`/estetica/${citaId}`);
  revalidatePath("/recepcion");
  return {
    error: null,
    fueraDeHorario: Boolean(d.fuera_de_horario),
    nuevoInicio: d.inicio_despues,
    urlWhatsApp: await linkWhatsApp(
      d,
      (c) => `Hola ${c.cliente}, te escribimos de ${c.negocio}: movimos la cita de ${c.perro} (${c.servicio}) al ${c.cuando}. Si no te funciona, avísanos y la acomodamos. 🐾`,
      d.inicio_despues
    ),
  };
}

/** «Cancelada» (con motivo) o «no se presentó» (sin motivo obligatorio): dos estados distintos. */
export async function cancelarCita(citaId: string, motivo: string, noLlego = false): Promise<ResultadoAgenda> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancelar_cita_estetica", { p_cita_id: citaId, p_motivo: motivo.trim() || null, p_no_llego: noLlego });
  if (error) return { error: traducirError(error) };
  const d = (data ?? {}) as DatosCambio;
  revalidatePath("/estetica");
  revalidatePath(`/estetica/${citaId}`);
  revalidatePath("/recepcion");
  return {
    error: null,
    urlWhatsApp: noLlego
      ? undefined
      : await linkWhatsApp(
          d,
          (c) => `Hola ${c.cliente}, te confirmamos de ${c.negocio} que la cita de ${c.perro} (${c.servicio}) del ${c.cuando} quedó cancelada. Cuando quieras, agendamos otra. 🐾`,
          d.inicio
        ),
  };
}

/** Quita una cita de la agenda (capturada por error o duplicada): no se borra, queda en el historial. Pide el permiso «Eliminar citas». */
export async function eliminarCita(citaId: string, motivo: string): Promise<ResultadoAgenda> {
  if (motivo.trim().length < 5) return { error: "Escribe el motivo por el que se elimina la cita." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("eliminar_cita_estetica", { p_cita_id: citaId, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  revalidatePath("/estetica");
  revalidatePath("/recepcion");
  return { error: null };
}

/** Pone, quita o restablece la tarifa «cliente de guardería» de una cita (la base vuelve a cotizar y exige permiso y motivo). */
export async function cambiarTarifaGuarderia(citaId: string, modo: "auto" | "si" | "no", motivo: string): Promise<EstadoAccion & { precio?: number }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cambiar_tarifa_guarderia_cita", { p_cita_id: citaId, p_modo: modo, p_motivo: motivo.trim() || null });
  if (error) return { error: traducirError(error) };
  revalidatePath("/estetica");
  revalidatePath(`/estetica/${citaId}`);
  return { error: null, precio: Number((data as { precio_despues?: number } | null)?.precio_despues ?? 0) };
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
      // Tarifa «cliente de guardería»: se aplicó, de dónde sale y cuánto costaría normal.
      tarifaGuarderia?: boolean;
      tarifaOrigen?: "auto" | "manual" | null;
      tarifaServicio?: string | null;
      precioNormal?: number | null;
      tarifaElegible?: boolean;
      tarifaAplicable?: boolean;
      tarifaAviso?: string | null;
    };

/** Lo que va a cobrar esta cita (sin escribir nada) o lo único que falta para saberlo. */
export async function cotizarCitaEstetica(
  perroId: string,
  servicioId: string,
  peloMaltratado: boolean,
  grupoExcepcionId: string | null,
  tarifaModo: "auto" | "si" | "no" = "auto"
): Promise<CotizacionCita> {
  if (!perroId || !servicioId) return { error: "Elige un perro y un servicio." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cotizar_cita_estetica", {
    p_perro_id: perroId,
    p_servicio_id: servicioId,
    p_pelo_maltratado: peloMaltratado,
    p_grupo_excepcion_id: grupoExcepcionId,
    p_tarifa_modo: tarifaModo,
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
    tarifa_guarderia?: boolean;
    tarifa_guarderia_origen?: "auto" | "manual" | null;
    servicio_tarifa_nombre?: string | null;
    precio_normal?: number | null;
    tarifa_guarderia_elegible?: boolean;
    tarifa_guarderia_aplicable?: boolean;
    tarifa_guarderia_aviso?: string | null;
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
    tarifaGuarderia: Boolean(d.tarifa_guarderia),
    tarifaOrigen: d.tarifa_guarderia_origen ?? null,
    tarifaServicio: d.servicio_tarifa_nombre ?? null,
    precioNormal: d.precio_normal === undefined || d.precio_normal === null ? null : Number(d.precio_normal),
    tarifaElegible: Boolean(d.tarifa_guarderia_elegible),
    tarifaAplicable: Boolean(d.tarifa_guarderia_aplicable),
    tarifaAviso: d.tarifa_guarderia_aviso ?? null,
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
