"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";

export type EstadoAbrirTurno = {
  error: string | null;
  turnoId?: string;
  /** El turno que quedó abierto, para pintarlo sin esperar a que la pantalla se repinte (QA S30). */
  turno?: { id: string; fondoInicial: number; abiertoAt: string };
  /** Ya había un turno abierto con otra clave (lo abrió alguien más o desde otro lado): se sigue en ese. */
  yaHabiaUno?: boolean;
};

// Bloque D construye la pantalla completa de apertura/retiros/cierre con
// arqueo — esto es solo lo mínimo para que Bloque A (cobros) no quede
// bloqueado sin turno abierto. El unique index turnos_caja_un_abierto_idx
// es quien de verdad impide dos turnos abiertos a la vez, esto es solo el
// mensaje amable si ya hay uno.
//
// QA S30: idempotente por `clave` (uuid que genera cada formulario de apertura). Si la misma clave llega dos veces
// (doble clic, reintento después del tope), responde con el turno que ya abrió, no con un error.
export async function abrirTurno(fondoInicial: number, notas: string, clave?: string): Promise<EstadoAbrirTurno> {
  if (!Number.isFinite(fondoInicial) || fondoInicial < 0) {
    return { error: "El fondo inicial debe ser un número mayor o igual a cero." };
  }
  const claveApertura = clave && /^[0-9a-f-]{36}$/.test(clave) ? clave : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("turnos_caja")
    .insert({ fondo_inicial: fondoInicial, notas_apertura: notas.trim() || null, clave_apertura: claveApertura })
    .select("id, fondo_inicial, abierto_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: abierto } = await supabase
        .from("turnos_caja")
        .select("id, fondo_inicial, abierto_at, clave_apertura")
        .eq("estado", "abierto")
        .maybeSingle();
      if (abierto) {
        const turno = { id: abierto.id as string, fondoInicial: Number(abierto.fondo_inicial), abiertoAt: abierto.abierto_at as string };
        const mismo = claveApertura !== null && abierto.clave_apertura === claveApertura;
        return { error: null, turnoId: turno.id, turno, yaHabiaUno: !mismo };
      }
      return { error: "Ya hay un turno de caja abierto." };
    }
    return { error: traducirError(error) };
  }

  // QA S19: sin revalidar aquí (repintaba la pantalla antes de responder y después se volvía a pintar con el refresco
  // que hace cada pantalla que abre turno).
  return { error: null, turnoId: data.id, turno: { id: data.id as string, fondoInicial: Number(data.fondo_inicial), abiertoAt: data.abierto_at as string } };
}
