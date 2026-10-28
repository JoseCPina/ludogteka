"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export type EstadoRetiro = { error: string | null; retiroId?: string; registros?: RegistroFinal[] };

export async function registrarRetiro(monto: number, motivo: string): Promise<EstadoRetiro> {
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto debe ser mayor a cero." };
  if (!motivo.trim()) return { error: "Escribe el motivo del retiro." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_retiro", { p_monto: monto, p_motivo: motivo });

  if (error) return { error: traducirError(error) };

  revalidatePath("/caja");
  revalidatePath("/caja/turno");
  return { error: null, retiroId: data as string, registros: await registrosDe(supabase, [{ t: "movimientos_caja", i: data as string }]) };
}

/** Cancelar un retiro (duplicado o equivocado) con motivo: baja lógica, nunca se borra. */
export async function cancelarRetiro(retiroId: string, motivo: string): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  if (!motivo.trim()) return { error: "Escribe por qué se cancela el retiro." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancelar_retiro", { p_id: retiroId, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  revalidatePath("/caja");
  revalidatePath("/caja/turno");
  return { error: null, registros: await registrosDe(supabase, [{ t: "movimientos_caja", i: retiroId }]) };
}

export type ResultadoCierre = {
  error: string | null;
  cerrado: boolean;
  corteId: string | null;
  esperadoEfectivo: number;
  esperadoTerminal: number;
  esperadoTransferencia: number;
  diferenciaEfectivo: number;
  diferenciaTerminal: number;
  diferenciaTransferencia: number;
  registros?: RegistroFinal[];
};

const RESULTADO_VACIO: Omit<ResultadoCierre, "error"> = {
  cerrado: false,
  corteId: null,
  esperadoEfectivo: 0,
  esperadoTerminal: 0,
  esperadoTransferencia: 0,
  diferenciaEfectivo: 0,
  diferenciaTerminal: 0,
  diferenciaTransferencia: 0,
};

export async function cerrarTurno(
  turnoId: string,
  conteoEfectivo: number,
  conteoTerminal: number,
  conteoTransferencia: number,
  explicacionDiferencias: string,
  notasCierre: string
): Promise<ResultadoCierre> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cerrar_turno", {
    p_turno_id: turnoId,
    p_conteo_efectivo: conteoEfectivo,
    p_conteo_terminal: conteoTerminal,
    p_conteo_transferencia: conteoTransferencia,
    p_explicacion_diferencias: explicacionDiferencias,
    p_notas_cierre: notasCierre,
  });

  if (error) return { error: traducirError(error), ...RESULTADO_VACIO };

  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila) return { error: "No pudimos leer el resultado del cierre.", ...RESULTADO_VACIO };

  // Sin revalidatePath (QA S30: «Enviar conteo» tardaba varios segundos porque repintaba /caja y /caja/turno antes de
  // responder): la pantalla pinta el cierre con esta respuesta y se refresca después.

  return {
    error: null,
    cerrado: fila.cerrado as boolean,
    corteId: fila.corte_id as string | null,
    esperadoEfectivo: Number(fila.esperado_efectivo),
    esperadoTerminal: Number(fila.esperado_terminal),
    esperadoTransferencia: Number(fila.esperado_transferencia),
    diferenciaEfectivo: Number(fila.diferencia_efectivo),
    diferenciaTerminal: Number(fila.diferencia_terminal),
    diferenciaTransferencia: Number(fila.diferencia_transferencia),
    registros: await registrosDe(supabase, [{ t: "turnos_caja", i: turnoId }]),
  };
}
