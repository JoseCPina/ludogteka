"use server";

import { registrosDe, registrosFinales } from "@/lib/concurrencia/registro-final";
import { cuentasPorEstancia, type CuentaEstancia } from "@/lib/cuentas/cuenta-estancia";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { revalidarModulosEstancia } from "./revalidar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";
import { motivoSinCargosNuevos } from "@/lib/caja/cargos-nuevos-servidor";
import { conControl } from "@/lib/concurrencia/servidor";
import { conflictoDeError, type Conflicto, type ControlVersion } from "@/lib/concurrencia/tipos";

export type EstadoAccion = { error: string | null; conflicto?: Conflicto | null; registros?: RegistroFinal[]; cuenta?: CuentaEstancia | null };

export type ResultadoAplicarCargo = { error: string | null; cargo: { id: string; precio: number } | null; registros?: RegistroFinal[]; cuenta?: CuentaEstancia | null };

// QA S41 (N144): la cuenta de la estancia como quedó, de la base (cuenta_lineas_estancia), para que la pantalla liste
// los cargos y el total al recibir la respuesta.
async function cuentaDeEstancia(supabase: SupabaseClient, estanciaId: string): Promise<CuentaEstancia | null> {
  const { data } = await supabase.from("estancias").select("reserva_id").eq("id", estanciaId).maybeSingle();
  if (!data?.reserva_id) return null;
  const { cuentas } = await cuentasPorEstancia(supabase, data.reserva_id as string);
  return cuentas.get(estanciaId) ?? null;
}

// Un cargo normal trae su precio de la matriz (lo resuelve el trigger).
// Uno de monto libre (comida especial) no tiene celda: recepción captura
// el importe y qué se le dio, y la base exige las dos cosas.
export async function aplicarCargo(
  estanciaId: string,
  servicioId: string,
  cantidad: number,
  notas: string,
  montoLibre?: { importe: number; descripcion: string }
): Promise<ResultadoAplicarCargo> {
  if (!servicioId) return { error: "Elige qué cargo aplicar.", cargo: null };
  if (!Number.isFinite(cantidad) || cantidad < 1) {
    return { error: "La cantidad debe ser al menos 1.", cargo: null };
  }
  if (montoLibre) {
    if (!Number.isFinite(montoLibre.importe) || montoLibre.importe <= 0) {
      return { error: "Captura el importe de este cargo.", cargo: null };
    }
    if (!montoLibre.descripcion.trim()) {
      return { error: "Describe qué se le dio.", cargo: null };
    }
  }

  const supabase = await createSupabaseServerClient();
  // Una estancia finalizada con la cuenta pagada ya no admite cargos (la pantalla tampoco los ofrece).
  const cerrada = await motivoSinCargosNuevos(supabase, estanciaId);
  if (cerrada) return { error: cerrada, cargo: null };
  const { data, error } = await supabase
    .from("cargos_aplicados")
    .insert({
      estancia_id: estanciaId,
      servicio_id: servicioId,
      cantidad,
      notas: notas.trim() || null,
      ...(montoLibre
        ? { precio: montoLibre.importe, descripcion: montoLibre.descripcion.trim() }
        : {}),
    })
    .select("id, precio")
    .single();

  if (error) return { error: traducirError(error), cargo: null };

  revalidarModulosEstancia();
  const [cuenta, registros] = await Promise.all([cuentaDeEstancia(supabase, estanciaId), registrosDe(supabase, [{ t: "cargos_aplicados", i: data.id }])]);
  return { error: null, cargo: { id: data.id, precio: data.precio }, cuenta, registros };
}

// Nunca se borra: se marca cancelado con motivo — es dinero, y el hueco
// clásico de caja es justo poder quitar un cargo sin dejar quién ni por
// qué.
export async function cancelarCargo(cargoId: string, motivo: string, control?: ControlVersion): Promise<EstadoAccion> {
  if (!motivo.trim()) return { error: "Escribe el motivo de la cancelación." };

  const supabase = await createSupabaseServerClient();
  const { error } = await conControl(supabase
    .from("cargos_aplicados")
    .update({ cancelado: true, motivo_cancelacion: motivo.trim() })
    .eq("id", cargoId), control);

  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error) } : { error: traducirError(error) };

  revalidarModulosEstancia();
  const registros = await registrosFinales(supabase, control, [{ t: "cargos_aplicados", i: cargoId }]);
  const estanciaId = registros.find((r) => r.t === "cargos_aplicados")?.datos?.estancia_id as string | undefined;
  return { error: null, registros, cuenta: estanciaId ? await cuentaDeEstancia(supabase, estanciaId) : undefined };
}
