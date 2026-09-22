"use server";

import { revalidatePath } from "next/cache";
import { revalidarModulosEstancia } from "./revalidar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";

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
    return { perroId: linea.perroId, exito: false, motivo: traducirError(error), estanciaId: null };
  }

  // Guardería de día completo: si el dueño tiene pases o mensualidad
  // vigentes, la base los usa sola (el que vence primero) y dice qué
  // queda. Para hotel o por hora responde no_aplica y no pasa nada.
  // Si esto falla, la estancia ya quedó creada: se reporta el día como
  // pagado suelto y el pase se puede aplicar después desde el check-in.
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

export type EstadoAccionEstancia = { error: string | null };

export async function cancelarEstancia(estanciaId: string): Promise<EstadoAccionEstancia> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("estancias")
    .update({ estado: "cancelada" })
    .eq("id", estanciaId);

  if (error) return { error: traducirError(error) };
  revalidarModulosEstancia();
  return { error: null };
}

export async function marcarNoLlego(estanciaId: string): Promise<EstadoAccionEstancia> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("estancias")
    .update({ estado: "no_llego" })
    .eq("id", estanciaId);

  if (error) return { error: traducirError(error) };
  revalidarModulosEstancia();
  return { error: null };
}

export async function moverFechas(
  estanciaId: string,
  fechaEntrada: string,
  fechaSalida: string
): Promise<EstadoAccionEstancia> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("estancias")
    .update({ fecha_entrada: fechaEntrada, fecha_salida: fechaSalida })
    .eq("id", estanciaId);

  if (error) return { error: traducirError(error) };
  revalidarModulosEstancia();
  return { error: null };
}

export type ResultadoCancelarReserva = { error: string | null; canceladas: number; noCancelables: number };

// Cancela solo las estancias todavía en reservada/confirmada. Una que ya
// hizo check-in (en_curso) no se puede cancelar — el perro ya está
// adentro, eso ya no es una cancelación — se deja tal cual, sin error,
// solo se cuenta como "no cancelable" para que la pantalla lo explique.
export async function cancelarReserva(reservaId: string): Promise<ResultadoCancelarReserva> {
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

  let canceladas = 0;
  for (const e of cancelables) {
    const { error } = await supabase.from("estancias").update({ estado: "cancelada" }).eq("id", e.id);
    if (!error) canceladas++;
  }

  revalidarModulosEstancia();
  revalidatePath(`/reservas/${reservaId}`);
  return { error: null, canceladas, noCancelables };
}
