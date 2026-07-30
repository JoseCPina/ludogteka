"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

export type EstadoRetiro = { error: string | null; retiroId?: string };

export async function registrarRetiro(monto: number, motivo: string): Promise<EstadoRetiro> {
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto debe ser mayor a cero." };
  if (!motivo.trim()) return { error: "Escribe el motivo del retiro." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_retiro", { p_monto: monto, p_motivo: motivo });

  if (error) return { error: traducirError(error) };

  revalidatePath("/caja");
  return { error: null, retiroId: data as string };
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

  if (fila.cerrado) {
    revalidatePath("/caja");
  }

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
  };
}
