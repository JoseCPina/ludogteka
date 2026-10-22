"use server";

import { revalidatePath } from "next/cache";
import { revalidarModulosEstancia } from "./revalidar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";
import { mensajeTraslapeDeEstancia } from "@/lib/reservas/traslape-detalle";
import { mensajeTraslapeConDetalle, type EstanciaQueChoca } from "@/lib/reservas/traslape";
import { describirDevolucion } from "@/lib/bonos/descripcion";
import { conControl } from "@/lib/concurrencia/servidor";
import { conflictoDeError, type Conflicto, type ControlVersion } from "@/lib/concurrencia/tipos";

export type LineaReserva = {
  perroId: string;
  servicioId: string;
  fechaEntrada: string;
  fechaSalida: string;
  // Solo para servicios que se cobran por hora (guardería ocasional): el
  // estimado con el que se reserva. Al check-out sube a las reales.
  horas?: number | null;
  bloqueoSanitarioSuperado?: boolean;
  motivoExcepcionSanitaria?: string;
  // Misma forma que la sanitaria: solo admin, siempre con motivo.
  bloqueoComportamientoSuperado?: boolean;
  motivoExcepcionComportamiento?: string;
  // false = recepción escogió pagar el día suelto aunque tenga pases.
  usarPase?: boolean;
};

// Qué pasó con el bono al reservar guardería: si se usó uno (cuál y qué le
// queda) o si el día se paga suelto.
export type BonoAplicado = {
  aplicado: boolean;
  motivo?: string;
  nombre?: string;
  ilimitado?: boolean;
  usados?: number;
  total?: number;
  restantes?: number;
  vence?: string | null;
};

export type ResultadoLinea = {
  perroId: string;
  exito: boolean;
  motivo: string | null;
  estanciaId: string | null;
  bono?: BonoAplicado | null;
};

export type EstadoCrearReserva = {
  error: string | null;
  reservaId?: string;
  resultados?: ResultadoLinea[];
};

async function insertarEstancia(reservaId: string, linea: LineaReserva): Promise<ResultadoLinea> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("estancias")
    .insert({
      reserva_id: reservaId,
      perro_id: linea.perroId,
      servicio_id: linea.servicioId,
      fecha_entrada: linea.fechaEntrada,
      fecha_salida: linea.fechaSalida,
      horas: linea.horas ?? null,
      bloqueo_sanitario_superado: linea.bloqueoSanitarioSuperado ?? false,
      motivo_excepcion_sanitaria: linea.motivoExcepcionSanitaria || null,
      bloqueo_comportamiento_superado: linea.bloqueoComportamientoSuperado ?? false,
      motivo_excepcion_comportamiento: linea.motivoExcepcionComportamiento || null,
    })
    .select("id")
    .single();

  if (error) {
    const motivo = error.code === "23P01"
      ? await mensajeTraslapeDeEstancia(supabase, { perroId: linea.perroId, entrada: linea.fechaEntrada, salida: linea.fechaSalida })
      : traducirError(error, { fecha: linea.fechaEntrada });
    return { perroId: linea.perroId, exito: false, motivo, estanciaId: null };
  }

  // Guardería de día completo: si el perro tiene pases o mensualidad
  // vigentes, la base los usa sola (el que vence primero) y dice qué
  // queda. Para hotel o por hora responde no_aplica y no pasa nada.
  // Si esto falla, la estancia ya quedó creada: se reporta el día como
  // pagado suelto y el pase se puede aplicar después desde el check-in.
  if (linea.usarPase === false) {
    return {
      perroId: linea.perroId,
      exito: true,
      motivo: null,
      estanciaId: data.id,
      bono: { aplicado: false, motivo: "elegido_suelto" },
    };
  }
  const { data: bonoData } = await supabase.rpc("aplicar_bono_a_estancia", { p_estancia_id: data.id });
  const bono = (bonoData as BonoAplicado | null) ?? null;

  return { perroId: linea.perroId, exito: true, motivo: null, estanciaId: data.id, bono };
}

export async function crearReserva(
  clienteId: string,
  notas: string,
  lineas: LineaReserva[]
): Promise<EstadoCrearReserva> {
  if (!clienteId) return { error: "Elige un cliente." };
  if (lineas.length === 0) return { error: "Agrega al menos un perro a la reserva." };

  const supabase = await createSupabaseServerClient();
  const { data: reserva, error: errorReserva } = await supabase
    .from("reservas")
    .insert({ cliente_id: clienteId, notas: notas.trim() || null })
    .select("id")
    .single();

  if (errorReserva || !reserva) {
    return { error: "No pudimos crear la reserva. Intenta de nuevo." };
  }

  const resultados: ResultadoLinea[] = [];
  for (const linea of lineas) {
    resultados.push(await insertarEstancia(reserva.id, linea));
  }

  const huboExito = resultados.some((r) => r.exito);
  if (!huboExito) {
    // Encabezado vacío, sin ninguna estancia adentro — no vale la pena
    // dejarlo, sería una reserva fantasma en el listado.
    await supabase.from("reservas").delete().eq("id", reserva.id);
    return { error: null, resultados };
  }

  revalidarModulosEstancia();
  return { error: null, reservaId: reserva.id, resultados };
}

// Mismo primitivo que crearReserva usa por línea, expuesto aparte para
// reintentar SOLO las líneas que fallaron (p. ej. con la excepción
// sanitaria ya marcada) sin re-insertar las que ya se guardaron bien.
export async function agregarEstanciaAReserva(
  reservaId: string,
  linea: LineaReserva
): Promise<ResultadoLinea> {
  const resultado = await insertarEstancia(reservaId, linea);
  if (resultado.exito) revalidarModulosEstancia();
  return resultado;
}

export type EstadoAccionEstancia = { error: string | null; aviso?: string | null; conflicto?: Conflicto | null; version?: string | null };

type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// QA N43: la estancia cambió desde que la pantalla la leyó. El aviso dice además en cuánto quedó la cuenta.
async function conflictoDeEstancia(supabase: Supa, error: Parameters<typeof conflictoDeError>[0], estanciaId: string): Promise<Conflicto | null> {
  const c = conflictoDeError(error);
  if (!c) return null;
  const { data: est } = await supabase.from("estancias").select("reserva_id").eq("id", estanciaId).maybeSingle();
  if (est?.reserva_id) {
    const { data: t } = await supabase.rpc("cuenta_totales_reserva", { p_reserva_id: est.reserva_id }).maybeSingle();
    const total = (t as { total_cuenta?: number } | null)?.total_cuenta;
    if (total !== undefined && total !== null) c.extra = [`total $${Number(total).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`];
  }
  return c;
}

export type VistaPreviaFechas = {
  error: string | null;
  totalAntes?: number;
  saldoAntes?: number;
  totalDespues?: number;
  saldoDespues?: number;
};

/** Cuánto queda la cuenta con otras fechas, sin guardar nada (la persona lo ve antes de «Guardar fechas»). */
export async function cotizarFechas(estanciaId: string, fechaEntrada: string, fechaSalida: string): Promise<VistaPreviaFechas> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("estancia_cotizar_fechas", { p_estancia_id: estanciaId, p_entrada: fechaEntrada, p_salida: fechaSalida });
  if (error) return { error: traducirError(error, { fecha: fechaEntrada }) };
  const d = data as { error: string | null; total_antes: number; saldo_antes: number; total_despues: number | null; saldo_despues: number | null };
  if (d.error) {
    if (/traslap|exclu|23P01/i.test(d.error)) {
      const { data: est } = await supabase.from("estancias").select("perro_id").eq("id", estanciaId).maybeSingle();
      if (est?.perro_id) return { error: await mensajeTraslapeDeEstancia(supabase, { perroId: est.perro_id, entrada: fechaEntrada, salida: fechaSalida, excluir: estanciaId }) };
    }
    return { error: /^[A-Za-z ]+ (violates|value)/.test(d.error) ? "No se pueden poner esas fechas. Revisa la entrada y la salida." : d.error };
  }
  return {
    error: null,
    totalAntes: Number(d.total_antes ?? 0),
    saldoAntes: Number(d.saldo_antes ?? 0),
    totalDespues: Number(d.total_despues ?? 0),
    saldoDespues: Number(d.saldo_despues ?? 0),
  };
}

// Qué pasó con el pase de una estancia que se acaba de cancelar. El
// trigger de la base ya devolvió lo devolvible; aquí solo se lee el
// ledger para decirlo: "se devolvió 1 pase (quedan 8)" o "no se devolvió:
// el bono venció el …".
async function avisoDevolucionDeEstancia(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  estanciaId: string,
  desde: string
): Promise<string | null> {
  const { data: movimientos } = await supabase
    .from("movimientos_bono")
    .select("tipo, cantidad, created_at, bonos_clientes(cantidad_disponible, fecha_vencimiento, servicios(nombre))")
    .eq("item_tipo", "estancia")
    .eq("item_id", estanciaId)
    .order("created_at");
  if (!movimientos || movimientos.length === 0) return null;

  const porBono = new Map<string, { nombre: string; neto: number; devueltos: number; restantes: number; vence: string | null }>();
  for (const m of movimientos) {
    const b = (Array.isArray(m.bonos_clientes) ? m.bonos_clientes[0] : m.bonos_clientes) as unknown as
      | { cantidad_disponible: number; fecha_vencimiento: string | null; servicios: { nombre: string } | { nombre: string }[] | null }
      | null;
    const servicio = Array.isArray(b?.servicios) ? b?.servicios[0] : b?.servicios;
    const nombre = servicio?.nombre ?? "bono";
    const fila = porBono.get(nombre) ?? { nombre, neto: 0, devueltos: 0, restantes: b?.cantidad_disponible ?? 0, vence: b?.fecha_vencimiento ?? null };
    if (m.tipo === "consumo") fila.neto += m.cantidad as number;
    if (m.tipo === "devolucion") {
      fila.neto -= m.cantidad as number;
      if ((m.created_at as string) >= desde) fila.devueltos += m.cantidad as number;
    }
    porBono.set(nombre, fila);
  }
  const detalle = Array.from(porBono.values())
    .filter((f) => f.devueltos > 0 || f.neto > 0)
    .map((f) => ({
      bono: f.nombre,
      pases: f.devueltos > 0 ? f.devueltos : f.neto,
      devuelto: f.devueltos > 0,
      vencio: f.vence,
      restantes: f.restantes,
    }));
  return describirDevolucion({
    devueltos: detalle.filter((d) => d.devuelto).reduce((s, d) => s + d.pases, 0),
    perdidos: detalle.filter((d) => !d.devuelto).reduce((s, d) => s + d.pases, 0),
    detalle,
  });
}

// QA S15: el motivo es opcional y queda en la estancia (quién y cuándo los pone la base) y en la bitácora.
const motivoLimpio = (motivo?: string | null) => (motivo ?? "").trim().slice(0, 500) || null;

export async function cancelarEstancia(estanciaId: string, control?: ControlVersion, motivo?: string | null): Promise<EstadoAccionEstancia> {
  const supabase = await createSupabaseServerClient();
  const desde = new Date(Date.now() - 5000).toISOString();
  const { error } = await conControl(supabase
    .from("estancias")
    .update({ estado: "cancelada", motivo_cancelacion: motivoLimpio(motivo) })
    .eq("id", estanciaId), control);

  if (error) {
    const conflicto = await conflictoDeEstancia(supabase, error, estanciaId);
    if (conflicto) return { error: null, conflicto };
    return { error: traducirError(error) };
  }
  const aviso = await avisoDevolucionDeEstancia(supabase, estanciaId, desde);
  revalidarModulosEstancia();
  // El total, lo cobrado y lo devuelto del encabezado de la reserva se recalculan (R35).
  revalidatePath("/reservas/[id]", "page");
  return { error: null, aviso };
}

export async function marcarNoLlego(estanciaId: string, control?: ControlVersion): Promise<EstadoAccionEstancia> {
  const supabase = await createSupabaseServerClient();
  const { error } = await conControl(supabase
    .from("estancias")
    .update({ estado: "no_llego" })
    .eq("id", estanciaId), control);

  if (error) {
    const conflicto = await conflictoDeEstancia(supabase, error, estanciaId);
    if (conflicto) return { error: null, conflicto };
    return { error: traducirError(error) };
  }
  revalidarModulosEstancia();
  revalidatePath("/reservas/[id]", "page");
  return { error: null };
}

// Mover fechas (y extender la salida en el check-out): el total que resulta lo calcula la base al guardar y tiene
// que ser el que la persona vio en la vista previa (`totalVisto`); si no, no se guarda. Con la versión leída.
export async function moverFechas(
  estanciaId: string,
  fechaEntrada: string,
  fechaSalida: string,
  control: ControlVersion & { totalVisto: number }
): Promise<EstadoAccionEstancia> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await conControl(
    supabase.rpc("estancia_mover_fechas", { p_estancia_id: estanciaId, p_entrada: fechaEntrada, p_salida: fechaSalida, p_total_visto: control.totalVisto }),
    control
  );

  if (error) {
    const conflicto = await conflictoDeEstancia(supabase, error, estanciaId);
    if (conflicto) return { error: null, conflicto };
    if (error.code === "23P01") {
      const { data: est } = await supabase.from("estancias").select("perro_id").eq("id", estanciaId).maybeSingle();
      if (est?.perro_id) return { error: await mensajeTraslapeDeEstancia(supabase, { perroId: est.perro_id, entrada: fechaEntrada, salida: fechaSalida, excluir: estanciaId }) };
    }
    if (error.hint === "total_distinto") return { error: error.message };
    return { error: traducirError(error, { fecha: fechaEntrada }) };
  }
  revalidarModulosEstancia();
  return { error: null, version: (data as { version?: string } | null)?.version ?? null };
}

export type ResultadoCancelarReserva = {
  error: string | null;
  canceladas: number;
  noCancelables: number;
  // Qué pasó con los pases de las estancias canceladas, si había.
  avisos?: string[];
  conflicto?: Conflicto | null;
};

// Cancela solo las estancias todavía en reservada/confirmada. Una que ya
// hizo check-in (en_curso) no se puede cancelar — el perro ya está
// adentro, eso ya no es una cancelación — se deja tal cual, sin error,
// solo se cuenta como "no cancelable" para que la pantalla lo explique.
export async function cancelarReserva(reservaId: string, control?: ControlVersion, motivo?: string | null): Promise<ResultadoCancelarReserva> {
  const supabase = await createSupabaseServerClient();
  const { data: estancias, error: errorLectura } = await supabase
    .from("estancias")
    .select("id, estado")
    .eq("reserva_id", reservaId)
    .is("deleted_at", null);

  if (errorLectura || !estancias) {
    return { error: "No pudimos leer la reserva. Intenta de nuevo.", canceladas: 0, noCancelables: 0 };
  }

  const cancelables = estancias.filter((e) => e.estado === "reservada" || e.estado === "confirmada");
  const noCancelables = estancias.length - cancelables.length;

  const desde = new Date(Date.now() - 5000).toISOString();
  let canceladas = 0;
  const avisos: string[] = [];
  for (const e of cancelables) {
    const { error } = await conControl(supabase.from("estancias").update({ estado: "cancelada", motivo_cancelacion: motivoLimpio(motivo) }).eq("id", e.id), control);
    if (error) {
      const conflicto = await conflictoDeEstancia(supabase, error, e.id);
      if (conflicto) {
        revalidarModulosEstancia();
        return { error: null, canceladas, noCancelables, avisos, conflicto };
      }
    }
    if (!error) {
      canceladas++;
      const aviso = await avisoDevolucionDeEstancia(supabase, e.id, desde);
      if (aviso) avisos.push(aviso);
    }
  }

  revalidarModulosEstancia();
  revalidatePath(`/reservas/${reservaId}`);
  return { error: null, canceladas, noCancelables, avisos };
}

// Lo que le falta a una mascota para reservar guardería u hotel y la base rechazaría (vacunas vencidas o sin
// registro): se consulta al elegirla, para avisar antes de «Crear reserva». Mismas reglas que
// pendientes_para_estancia(), que a su vez replica el trigger de estancias.
export async function consultarSanitariosPendientes(
  perroId: string
): Promise<{ error: string | null; faltan: string[]; recomendados: string[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("pendientes_para_estancia", { p_perro_ids: [perroId] });
  if (error) return { error: "No pudimos revisar las vacunas de esta mascota.", faltan: [], recomendados: [] };
  const filas = (data ?? []) as { clave: string; etiqueta: string }[];
  const faltan = filas.filter((f) => f.clave.startsWith("sanitario:")).map((f) => f.etiqueta);
  // N8: los datos del expediente (nacimiento, alimentación, contacto de emergencia, veterinario…) se recomiendan para
  // hotel y guardería, pero no impiden reservar.
  const recomendados = filas.filter((f) => f.clave.startsWith("campo:")).map((f) => f.etiqueta);
  return { error: null, faltan, recomendados };
}

// N10: ¿la mascota ya tiene una reserva (hotel O guardería) que se traslapa con estas fechas? Se consulta al elegirla
// y al cambiar fechas o servicio, para avisar antes de «Crear reserva». Es la misma comprobación que hace la base al
// guardar (un perro no puede estar en dos estancias a la vez, sea del mismo módulo o del otro).
export async function consultarChoqueReserva(
  perroId: string,
  entrada: string,
  salida: string
): Promise<{ error: string | null; mensaje: string | null }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada) || !/^\d{4}-\d{2}-\d{2}$/.test(salida) || salida <= entrada) return { error: null, mensaje: null };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("estancia_que_choca", { p_perro: perroId, p_entrada: entrada, p_salida: salida, p_excluir: null });
  if (error) return { error: "No pudimos revisar las reservas de esta mascota.", mensaje: null };
  if (!data) return { error: null, mensaje: null };
  return { error: null, mensaje: mensajeTraslapeConDetalle(data as EstanciaQueChoca) };
}
