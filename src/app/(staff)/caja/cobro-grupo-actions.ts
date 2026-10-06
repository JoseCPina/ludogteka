"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "@/app/(staff)/reservas/traducir-error";
import type { LineaMetodo } from "@/app/(staff)/reservas/cobro-actions";

export type EstadoCobroGrupo = { error: string | null; grupoId?: string };

/**
 * Cobrar juntas varias cuentas de la MISMA persona: un solo pago, un solo
 * folio y una sola propina, repartidos entre las cuentas en el orden en que
 * vienen (la más antigua primero). Todo lo decide la base (registrar_cobro_grupo):
 * misma persona, saldos, nada que deje menos de un peso, el folio, el turno.
 */
export async function registrarCobroGrupo(
  partes: { reservaId: string; monto: number }[],
  notas: string,
  metodos: LineaMetodo[]
): Promise<EstadoCobroGrupo> {
  if (partes.length < 2) return { error: "Para cobrar juntas se necesitan al menos dos cuentas." };
  if (metodos.length === 0) return { error: "Agrega al menos un método de pago." };
  if (metodos.some((m) => !Number.isFinite(m.monto) || m.monto <= 0)) return { error: "Cada método debe tener un monto mayor a cero." };
  if (partes.some((p) => !Number.isFinite(p.monto) || p.monto <= 0)) return { error: "Cada cuenta debe recibir un monto mayor a cero." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_cobro_grupo", {
    p_partes: partes.map((p) => ({ reserva_id: p.reservaId, monto: p.monto })),
    p_notas: notas,
    p_metodos: metodos,
  });
  if (error) return { error: traducirError(error) };

  for (const p of partes) {
    revalidatePath(`/reservas/${p.reservaId}`);
    revalidatePath(`/reservas/${p.reservaId}/cobrar`);
    revalidatePath(`/caja/cobrar/${p.reservaId}`);
  }
  revalidatePath("/caja");
  revalidatePath("/caja/turno");
  return { error: null, grupoId: (data as { grupo_id: string }).grupo_id };
}
