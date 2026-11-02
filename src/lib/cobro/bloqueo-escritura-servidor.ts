import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { ESTADOS_CON_BLOQUEO, textoBloqueo, type BloqueoEscritura, type MotivoBloqueo } from "@/lib/cobro/bloqueo-escritura";

/**
 * negocio_escribible y estado_cobro, una vez por petición: los leen el bloqueo de abajo y la franja de AvisoPlan (antes
 * cada uno los pedía por su cuenta: dos consultas repetidas en cada pantalla del personal).
 */
export const escrituraYCobro = cache(async (): Promise<{ escribible: unknown; cobro: unknown }> => {
  const supabase = await createSupabaseServerClient();
  const [{ data: escribible }, { data: cobro }] = await Promise.all([supabase.rpc("negocio_escribible"), supabase.rpc("estado_cobro")]);
  return { escribible, cobro };
});

/**
 * QA N151: ¿el negocio está en solo lectura por prueba vencida o falta de pago? El ÚNICO indicador que leen la franja
 * de arriba (AvisoPlan) y el bloqueo de botones (`<ProveedorEscritura>` en el layout del personal). Lo dicen las mismas
 * funciones de la base que impiden escribir (negocio_escribible, estado_cobro). Una vez por petición.
 */
export const bloqueoDeEscritura = cache(async (): Promise<BloqueoEscritura | null> => {
  const [{ escribible, cobro }, sesion] = await Promise.all([escrituraYCobro(), obtenerSesionConRol()]);
  const estado = (cobro as { estado?: string } | null)?.estado ?? null;
  if (escribible !== false || !estado || !ESTADOS_CON_BLOQUEO.includes(estado)) return null;
  return textoBloqueo(estado as MotivoBloqueo, sesion?.rol === "admin");
});
