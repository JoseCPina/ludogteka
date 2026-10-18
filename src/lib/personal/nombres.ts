import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Nombre con el que se muestra a una persona del personal (autor de un cobro, un cargo, una anulación…).
 * Sale de nombre_de_persona() de la base: la ficha de empleado de ESTE negocio, luego la cuenta. Recepción no
 * puede leer `profiles` del personal, así que nunca se consulta esa tabla desde una pantalla.
 *
 * Sin nombre ni ficha: «Sin nombre (correo)» para un admin (para que sepa a quién ponerle nombre) y
 * «Sin nombre» para los demás; nunca un guion.
 */
export const SIN_NOMBRE = "Sin nombre";

export function textoSinNombre(correo: string | null | undefined, esAdmin: boolean): string {
  return esAdmin && correo ? `${SIN_NOMBRE} (${correo})` : SIN_NOMBRE;
}

export async function nombresDePersonal(
  supabase: SupabaseClient,
  ids: (string | null | undefined)[],
  opciones: { esAdmin: boolean; negocioId: string }
): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter((x): x is string => Boolean(x))));
  const salida = new Map<string, string>();
  if (unicos.length === 0) return salida;

  const filas = await Promise.all(
    unicos.map(async (id) => {
      const { data } = await supabase.rpc("nombre_de_persona", { p_profile: id, p_vacio: null });
      return [id, typeof data === "string" && data.trim() ? data.trim() : null] as const;
    })
  );
  const sinNombre: string[] = [];
  for (const [id, nombre] of filas) {
    if (nombre) salida.set(id, nombre);
    else sinNombre.push(id);
  }
  if (sinNombre.length === 0) return salida;

  // El correo solo lo ve un admin; se lee con la secret key de las cuentas que ya salieron en datos de este negocio.
  const admin = opciones.esAdmin ? createSupabaseAdminClient(opciones.negocioId) : null;
  await Promise.all(
    sinNombre.map(async (id) => {
      let correo: string | null = null;
      if (admin) {
        try {
          correo = (await admin.auth.admin.getUserById(id)).data.user?.email ?? null;
        } catch {
          correo = null;
        }
      }
      salida.set(id, textoSinNombre(correo, opciones.esAdmin));
    })
  );
  return salida;
}
