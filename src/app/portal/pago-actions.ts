"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual } from "@/lib/negocio/actual";
import { linkDeSaldo, type ResultadoLinkSaldo } from "@/lib/pagos/link-de-saldo";

/** «Pagar» desde el portal: el link de Mercado Pago del negocio por el SALDO de una cuenta del dueño (cobros parciales). */
export async function pedirLinkPagoPortal(reservaId: string): Promise<ResultadoLinkSaldo> {
  const sesion = await obtenerSesionConRol();
  if (!sesion?.clienteId) return { error: "Tu sesión terminó. Entra otra vez." };
  if (!/^[0-9a-f-]{36}$/i.test(reservaId)) return { error: "Cuenta inválida." };
  const [supabase, negocio] = await Promise.all([createSupabaseServerClient(), negocioActual()]);
  return linkDeSaldo(supabase, negocio.id, reservaId, sesion.user.id);
}
