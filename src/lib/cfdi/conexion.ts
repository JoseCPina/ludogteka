import type { SupabaseClient } from "@supabase/supabase-js";
import { adaptadorFacturapi } from "./facturapi";
import type { AdaptadorPac, ConexionPac } from "./tipos";

/**
 * La llave del PAC de un negocio: la suya (Vault, la guarda el admin en
 * Administración → Facturación) y, SOLO fuera de producción, la de pruebas del
 * entorno (FACTURAPI_TEST_KEY, para desarrollo y vistas previas de Vercel).
 * En producción no hay respaldo: sin llave del negocio no se timbra.
 * `admin` es el cliente con la secret key atado al negocio.
 */
export async function conexionPac(admin: SupabaseClient): Promise<ConexionPac | null> {
  const { data } = await admin.rpc("cfdi_leer_llave");
  const fila = (Array.isArray(data) ? data[0] : data) as { llave?: string; modo?: string } | null;
  if (fila?.llave) {
    return { pac: "facturapi", llave: fila.llave, modo: fila.modo === "produccion" ? "produccion" : "pruebas", origen: "negocio" };
  }
  const prueba = process.env.VERCEL_ENV !== "production" ? process.env.FACTURAPI_TEST_KEY?.trim() : "";
  if (prueba) return { pac: "facturapi", llave: prueba, modo: "pruebas", origen: "entorno" };
  return null;
}

export function crearAdaptador(c: ConexionPac): AdaptadorPac {
  // Cambiar de PAC = otra rama aquí (Facturama): ninguna pantalla se entera.
  return adaptadorFacturapi(c);
}

export const SIN_LLAVE =
  "Todavía no hay una llave del PAC. Un admin la guarda en Administración → Facturación (en pruebas: la llave sk_test de Facturapi).";
