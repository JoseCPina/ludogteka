"use server";

import { registrosDe, registrosFinales } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { zonaActual } from "@/lib/negocio/actual";
import { fechaLocalDeInstante, horaLocalDeInstante, instanteDeHoraLocal, sumarDiasFecha } from "@/lib/formato";
import { unirFrases } from "@/lib/texto/frases";
import { conControl } from "@/lib/concurrencia/servidor";
import { conflictoDeError, type Conflicto, type ControlVersion } from "@/lib/concurrencia/tipos";

export type EstadoAccion = { error: string | null; conflicto?: Conflicto | null; registros?: RegistroFinal[] };
export type EstadoCrearCita = {
  error: string | null;
  /** N30: el mismo perro ya tiene cita ese día; NO se agendó y se pide confirmar. */
  duplicada?: string;
  citaId?: string; reservaId?: string; fin?: string; precio?: number; tarifaGuarderia?: boolean;
  registros?: RegistroFinal[];
};

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
  // N30: la persona ya vio el aviso de «este perro ya tiene cita ese día» y quiere otra.
  confirmarDuplicada?: boolean;
}): Promise<EstadoCrearCita> {
  if (!datos.perroId || !datos.servicioId || !datos.empleadoId || !datos.inicio) {
    return { error: "Completa perro, servicio, empleado y hora." };
  }

  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const dia = fechaLocalDeInstante(datos.inicio, zona);

  // QA N44: el choque real (la estilista ya tiene a otra mascota a esa hora, o está ausente) se dice ANTES de crear
  // nada, con el mismo texto de la base; nunca «No pudimos crear la reserva».
  const choque = async () => {
    const { data: serv } = await supabase.from("servicios").select("duracion_minutos").eq("id", datos.servicioId).maybeSingle();
    const fin = new Date(new Date(datos.inicio).getTime() + (Number(serv?.duracion_minutos) || 60) * 60000).toISOString();
    const { data: texto } = await supabase.rpc("cita_estetica_choques_texto", { p_empleado: datos.empleadoId, p_inicio: datos.inicio, p_fin: fin, p_excluir: null });
    return typeof texto === "string" && texto ? texto : null;
  };

  // QA S18 (N95): las revisiones previas (el perro, la otra cita del día y el choque) van en paralelo: antes eran
  // cinco viajes a la base uno tras otro antes de intentar guardar.
  const [{ data: reserva, error: errorReserva }, { data: delDia }, choqueAntes] = await Promise.all([
    supabase.from("perros").select("cliente_id").eq("id", datos.perroId).single(),
    datos.confirmarDuplicada
      ? Promise.resolve({ data: null })
      : supabase
          .from("citas_estetica")
          .select("id, inicio, estado, perros(nombre), servicios!citas_estetica_servicio_id_fkey(nombre)")
          .eq("perro_id", datos.perroId)
          .is("deleted_at", null)
          .not("estado", "in", "(cancelada,no_llego)")
          .gte("inicio", instanteDeHoraLocal(`${dia}T00:00`, zona))
          .lt("inicio", instanteDeHoraLocal(`${sumarDiasFecha(dia, 1)}T00:00`, zona))
          .order("inicio"),
    choque(),
  ]);
  if (errorReserva || !reserva) return { error: "No pudimos encontrar al perro." };

  // N30: la misma mascota con otra cita viva ese día (en la fecha del negocio): se avisa antes de crear una segunda.
  if (!datos.confirmarDuplicada) {
    if (delDia && delDia.length > 0) {
      const una = (c: (typeof delDia)[number]) => {
        const serv = Array.isArray(c.servicios) ? c.servicios[0] : c.servicios;
        return `${(serv as { nombre?: string } | null)?.nombre ?? "una cita"} a las ${horaLocalDeInstante(c.inicio as string, zona)}`;
      };
      const perro = Array.isArray(delDia[0].perros) ? delDia[0].perros[0] : delDia[0].perros;
      return {
        error: null,
        // No se guardó nada: se pide confirmar.
        registros: [],
        duplicada: unirFrases(`${(perro as { nombre?: string } | null)?.nombre ?? "Esta mascota"} ya tiene ${delDia.length === 1 ? "una cita" : "citas"} ese día: ${delDia.map(una).join(" y ")}`, "¿Agendar otra de todos modos?"),
      };
    }
  }

  if (choqueAntes) return { error: choqueAntes };

  // La cuenta de la cita la crea la base para cualquier persona del personal (la estilista no inserta en reservas).
  const { data: reservaId, error: errorCrearReserva } = await supabase.rpc("crear_reserva_para_cita", { p_perro_id: datos.perroId });
  const reservaCreada = typeof reservaId === "string" ? { id: reservaId } : null;
  if (errorCrearReserva || !reservaCreada) {
    return { error: errorCrearReserva ? traducirError(errorCrearReserva) : "No pudimos abrir la cuenta de esta cita. Intenta de nuevo." };
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
    await supabase.rpc("borrar_reserva_vacia", { p_reserva_id: reservaCreada.id });
    // Un «empalme» de la base (23P01) no es del perro: es de la estilista (otra persona la ocupó entre la revisión y
    // el guardado). Se dice con el mismo texto.
    if (error.code === "23P01") {
      const texto = await choque();
      if (texto) return { error: texto };
      return { error: "Esa estilista ya tiene otra cita a esa hora. Escoge a otra persona u otro horario." };
    }
    // El aviso de permiso solo cuando de verdad es de permiso (la política de la cita: una estilista agenda en SU
    // agenda). Cualquier otro rechazo dice lo que dijo la base.
    if (error.code === "42501" && /row-level security|políti|permission/i.test(error.message ?? "")) {
      const { data: yo } = await supabase.auth.getUser();
      if (yo.user && yo.user.id !== datos.empleadoId) return { error: "Solo puedes agendar en tu propia agenda: escoge tu nombre en «Empleado»." };
    }
    const texto = traducirError(error);
    // Lo que la base no explicó se escribe en los logs con su código: así se encontró N95 (55000 de un record sin asignar).
    if (/^No pudimos guardar/.test(texto)) console.error("[estetica] crearCita", error.code, error.message);
    return { error: texto };
  }

  // Sin revalidatePath (QA S27): repintaba «Agendar cita» entera (todos los clientes y perros) antes de responder;
  // la agenda se lee fresca al abrirla.
  return {
    error: null,
    registros: await registrosDe(supabase, [{ t: "citas_estetica", i: data.id }, { t: "reservas", i: reservaCreada.id }]),
    citaId: data.id, reservaId: reservaCreada.id, fin: data.fin as string, precio: Number(data.precio), tarifaGuarderia: Boolean(data.tarifa_guarderia),
  };
}

/** Pone, cambia o quita el recargo manual de una cita que todavía no se cierra. */
export async function aplicarRecargoCita(citaId: string, recargo: number, motivo: string, control?: ControlVersion): Promise<EstadoAccion> {
  if (!Number.isFinite(recargo) || recargo < 0 || recargo > 100000) return { error: "Escribe un recargo de cero para arriba." };
  const supabase = await createSupabaseServerClient();
  const { error } = await conControl(supabase
    .from("citas_estetica")
    .update({ recargo, recargo_motivo: recargo > 0 ? motivo.trim() || null : null })
    .eq("id", citaId), control);
  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error), registros: await registrosFinales(supabase, control) } : { error: traducirError(error) };
  revalidatePath(`/estetica/${citaId}`);
  revalidatePath("/estetica");
  return { error: null, registros: await registrosFinales(supabase, control) };
}

export type AusenteEnTramo = { profileId: string; texto: string };

/** Quién tiene una ausencia aprobada que cubre ese tramo (para no ofrecerlo al agendar). La base vuelve a revisar al guardar. */
export async function estilistasAusentesEnTramo(inicio: string, fin: string): Promise<AusenteEnTramo[]> {
  if (!inicio || !fin) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("estilistas_ausentes", { p_inicio: inicio, p_fin: fin });
  if (error) return [];
  const { textoAusencia } = await import("@/lib/estetica/ausencias");
  return ((data ?? []) as { profile_id: string; tipo: string; desde: string; hasta: string; hora_desde: string | null; hora_hasta: string | null }[]).map((a) => ({
    profileId: a.profile_id,
    texto: textoAusencia(a),
  }));
}

export type EstadoReasignar = { error: string | null; de?: string; a?: string; ajusteNomina?: boolean; sinCambio?: boolean; conflicto?: Conflicto | null; registros?: RegistroFinal[] };

/**
 * Cambia (o quita) la estilista de una cita. Todo lo decide la base
 * (reasignar_estilista_cita): quién puede en cada estado, el motivo que pide,
 * que la estilista sea del negocio y esté activa, y el historial.
 */
export async function reasignarEstilista(
  citaId: string,
  empleadoId: string | null,
  motivo: string | null,
  control?: ControlVersion
): Promise<EstadoReasignar> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await conControl(supabase.rpc("reasignar_estilista_cita", {
    p_cita_id: citaId,
    p_empleado_id: empleadoId,
    p_motivo: motivo,
  }), control);
  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error), registros: await registrosFinales(supabase, control) } : { error: traducirError(error) };
  revalidatePath("/estetica");
  revalidatePath(`/estetica/${citaId}`);
  revalidatePath("/recepcion");
  revalidatePath("/admin");
  const r = (data ?? {}) as { de?: string; a?: string; ajuste_nomina?: boolean; sin_cambio?: boolean };
  return { error: null, registros: await registrosFinales(supabase, control), de: r.de, a: r.a, ajusteNomina: r.ajuste_nomina ?? false, sinCambio: r.sin_cambio ?? false };
}

export type ResultadoAgenda = { error: string | null; urlWhatsApp?: string; fueraDeHorario?: boolean; nuevoInicio?: string; conflicto?: Conflicto | null; registros?: RegistroFinal[] };

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
export async function reprogramarCita(citaId: string, nuevoInicio: string, motivo: string, control?: ControlVersion): Promise<ResultadoAgenda> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await conControl(supabase.rpc("reprogramar_cita_estetica", { p_cita_id: citaId, p_inicio: nuevoInicio, p_motivo: motivo.trim() || null }), control);
  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error), registros: await registrosFinales(supabase, control) } : { error: traducirError(error) };
  const d = (data ?? {}) as DatosCambio;
  revalidatePath("/estetica");
  revalidatePath(`/estetica/${citaId}`);
  revalidatePath("/recepcion");
  return {
    error: null,
    registros: await registrosFinales(supabase, control),
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
export async function cancelarCita(citaId: string, motivo: string, noLlego = false, control?: ControlVersion): Promise<ResultadoAgenda> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await conControl(supabase.rpc("cancelar_cita_estetica", { p_cita_id: citaId, p_motivo: motivo.trim() || null, p_no_llego: noLlego }), control);
  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error), registros: await registrosFinales(supabase, control) } : { error: traducirError(error) };
  const d = (data ?? {}) as DatosCambio;
  revalidatePath("/estetica");
  revalidatePath(`/estetica/${citaId}`);
  revalidatePath("/recepcion");
  return {
    error: null,
    registros: await registrosFinales(supabase, control),
    urlWhatsApp: noLlego
      ? undefined
      : await linkWhatsApp(
          d,
          (c) => `Hola ${c.cliente}, te confirmamos de ${c.negocio} que la cita de ${c.perro} (${c.servicio}) del ${c.cuando} quedó cancelada. Cuando quieras, agendamos otra. 🐾`,
          d.inicio
        ),
  };
}

/**
 * QA S36: una cita iniciada por error («En curso») regresa a reservada o se cancela con motivo. Solo sin cobros ni
 * consumo de inventario (lo revisa la base, `deshacer_inicio_cita`); queda en el historial de la cita.
 */
export async function deshacerInicioCita(citaId: string, destino: "reservada" | "cancelada", motivo: string): Promise<ResultadoAgenda> {
  if (destino === "cancelada" && motivo.trim().length < 3) return { error: "Escribe el motivo de la cancelación." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("deshacer_inicio_cita", { p_cita_id: citaId, p_destino: destino, p_motivo: motivo.trim() || null });
  if (error) return { error: traducirError(error) };
  revalidatePath("/estetica");
  revalidatePath(`/estetica/${citaId}`);
  revalidatePath("/recepcion");
  return { error: null, registros: await registrosDe(supabase, [{ t: "citas_estetica", i: citaId }]) };
}

/** Quita una cita de la agenda (capturada por error o duplicada): no se borra, queda en el historial. Pide el permiso «Eliminar citas». */
export async function eliminarCita(citaId: string, motivo: string, control?: ControlVersion): Promise<ResultadoAgenda> {
  if (motivo.trim().length < 5) return { error: "Escribe el motivo por el que se elimina la cita." };
  const supabase = await createSupabaseServerClient();
  const { error } = await conControl(supabase.rpc("eliminar_cita_estetica", { p_cita_id: citaId, p_motivo: motivo.trim() }), control);
  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error), registros: await registrosFinales(supabase, control) } : { error: traducirError(error) };
  revalidatePath("/estetica");
  revalidatePath("/recepcion");
  return { error: null, registros: await registrosFinales(supabase, control) };
}

/** Pone, quita o restablece la tarifa «cliente de guardería» de una cita (la base vuelve a cotizar y exige permiso y motivo). */
export async function cambiarTarifaGuarderia(citaId: string, modo: "auto" | "si" | "no", motivo: string, control?: ControlVersion): Promise<EstadoAccion & { precio?: number }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await conControl(supabase.rpc("cambiar_tarifa_guarderia_cita", { p_cita_id: citaId, p_modo: modo, p_motivo: motivo.trim() || null }), control);
  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error), registros: await registrosFinales(supabase, control) } : { error: traducirError(error) };
  revalidatePath("/estetica");
  revalidatePath(`/estetica/${citaId}`);
  return { error: null, registros: await registrosFinales(supabase, control), precio: Number((data as { precio_despues?: number } | null)?.precio_despues ?? 0) };
}

export async function iniciarCita(
  citaId: string,
  entregadoPorNombre: string | null,
  entregadoPorTelefono: string | null,
  opciones?: { confirmarOtroDia?: boolean; control?: ControlVersion }
): Promise<EstadoAccion & { otroDia?: string }> {
  const supabase = await createSupabaseServerClient();
  // Una cita de otro día no se recibe sin preguntar (QA S14: se hizo el check-in el domingo de una cita del lunes).
  if (!opciones?.confirmarOtroDia) {
    const { data: cita } = await supabase.from("citas_estetica").select("inicio").eq("id", citaId).maybeSingle();
    if (cita?.inicio) {
      const zona = await zonaActual();
      const dia = fechaLocalDeInstante(cita.inicio as string, zona);
      const hoy = fechaLocalDeInstante(new Date().toISOString(), zona);
      if (dia !== hoy) {
        const cuando = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: zona }).format(new Date(cita.inicio as string));
        return { error: null, otroDia: `Esta cita es del ${cuando}, ${dia < hoy ? "ya pasó" : "no es de hoy"}. ¿Recibir a la mascota de todos modos?` };
      }
    }
  }
  const { error } = await conControl(supabase
    .from("citas_estetica")
    .update({
      estado: "en_curso",
      entregado_por_nombre: entregadoPorNombre,
      entregado_por_telefono: entregadoPorTelefono,
    })
    .eq("id", citaId), opciones?.control);

  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error) } : { error: traducirError(error) };
  // QA S41 (N141): sin revalidatePath (la respuesta esperaba a que se volviera a pintar la página y el botón seguía en
  // «Guardando…»); la cita como quedó va en la respuesta y la pantalla la pinta. La agenda se lee fresca al abrirla.
  return { error: null, registros: await registrosFinales(supabase, opciones?.control, [{ t: "citas_estetica", i: citaId }]) };
}

export type AjusteConsumo = { insumo_id: string; cantidad: number };

export async function finalizarCita(
  citaId: string,
  recogidoPorNombre: string | null,
  recogidoPorTelefono: string | null,
  recogidoPorEsDueno: boolean | null,
  ajustesConsumo: AjusteConsumo[] = []
): Promise<EstadoAccion & { recogido?: { nombre: string | null; esDueno: boolean | null } }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("finalizar_cita_con_consumo", {
    p_cita_id: citaId,
    p_recogido_por_nombre: recogidoPorNombre,
    p_recogido_por_telefono: recogidoPorTelefono,
    p_recogido_por_es_dueno: recogidoPorEsDueno,
    p_ajustes: ajustesConsumo,
  });

  if (error) return { error: traducirError(error) };
  // QA S27: la pantalla pinta «Recogió» con lo que quedó guardado, sin revalidatePath (repintaba la página
  // antes de responder y «Recogió: —» se quedaba unos segundos). La agenda se lee fresca al volver a ella.
  const { data } = await supabase.from("citas_estetica").select("recogido_por_nombre, recogido_por_es_dueno").eq("id", citaId).maybeSingle();
  return {
    error: null,
    registros: await registrosDe(supabase, [{ t: "citas_estetica", i: citaId }]),
    recogido: { nombre: (data?.recogido_por_nombre as string | null) ?? recogidoPorNombre, esDueno: (data?.recogido_por_es_dueno as boolean | null) ?? recogidoPorEsDueno },
  };
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
