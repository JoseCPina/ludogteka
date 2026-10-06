import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";

/**
 * Qué métodos se pueden capturar a mano en este negocio, para quien llama:
 * «Terminal» no, si hay Mercado Pago o Clip elegido; «Tarjeta (registro
 * manual)» sí, con el permiso. Las pantallas que venden algo (pases) y
 * cobran con métodos lo usan igual que la cuenta de cobro.
 */
export type OpcionesCobroManual = { terminalManualBloqueada: boolean; puedeTarjetaManual: boolean };

export async function cargarOpcionesCobroManual(): Promise<OpcionesCobroManual> {
  const supabase = await createSupabaseServerClient();
  const [sesion, { data }] = await Promise.all([obtenerSesionConRol(), supabase.rpc("terminal_manual_bloqueada")]);
  return { terminalManualBloqueada: Boolean(data), puedeTarjetaManual: tienePermiso(sesion, "tarjeta_manual") };
}
