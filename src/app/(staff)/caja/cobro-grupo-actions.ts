"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "@/app/(staff)/reservas/traducir-error";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioIdActual } from "@/lib/negocio/actual";
import { avisoCobroReciente, type ControlCobro } from "@/lib/cobro/reciente";
import type { LineaMetodo } from "@/app/(staff)/reservas/cobro-actions";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export type EstadoCobroGrupo = { error: string | null; grupoId?: string; confirmar?: string; registros?: RegistroFinal[] };

/**
 * Cobrar juntas varias cuentas de la MISMA persona: un solo pago, un solo
 * folio y una sola propina, repartidos entre las cuentas en el orden en que
 * vienen (la más antigua primero). Todo lo decide la base (registrar_cobro_grupo):
 * misma persona, saldos, nada que deje menos de un peso, el folio, el turno.
 */
export async function registrarCobroGrupo(
  partes: { reservaId: string; monto: number }[],
  notas: string,
  metodos: LineaMetodo[],
  control?: ControlCobro
): Promise<EstadoCobroGrupo> {
  if (partes.length < 2) return { error: "Para cobrar juntas se necesitan al menos dos cuentas." };
  if (metodos.length === 0) return { error: "Agrega al menos un método de pago." };
  if (metodos.some((m) => !Number.isFinite(m.monto) || m.monto <= 0)) return { error: "Cada método debe tener un monto mayor a cero." };
  if (partes.some((p) => !Number.isFinite(p.monto) || p.monto <= 0)) return { error: "Cada cuenta debe recibir un monto mayor a cero." };

  const supabase = await createSupabaseServerClient();
  // N28: la revisión corre SIEMPRE en el servidor (también si la pantalla no mandó lo que veía).
  if (!control?.confirmado) {
    const sesion = await obtenerSesionConRol();
    const aviso = await avisoCobroReciente(supabase, partes.map((p) => p.reservaId), control, { esAdmin: sesion?.rol === "admin", negocioId: await negocioIdActual(), usuarioId: sesion?.user.id ?? null });
    if (aviso) return { error: null, confirmar: aviso, registros: await registrosDe(supabase, partes.map((p) => ({ t: "reservas", i: p.reservaId }))) };
  }
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
  const grupoId = (data as { grupo_id: string }).grupo_id;
  return {
    error: null,
    grupoId,
    registros: await registrosDe(supabase, [{ t: "cobros_grupo", i: grupoId }, ...partes.map((p) => ({ t: "reservas", i: p.reservaId }))]),
  };
}
