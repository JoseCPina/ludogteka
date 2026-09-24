import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaqueteDePerro } from "./pase-para-fecha";

// Los day pass y mensualidades que pueden importar al reservar: los que
// siguen activos o se agotaron (para poder decir "ya no le quedan"). Los
// vencidos hace tiempo no se traen. Lectura del staff (bonos_clientes_estado
// ya no es legible para el cliente).
export async function cargarPaquetesDePerros(supabase: SupabaseClient): Promise<PaqueteDePerro[]> {
  const { data } = await supabase
    .from("bonos_clientes_estado")
    .select(
      "id, perro_id, servicio_nombre, servicio_incluido_id, cantidad_total, cantidad_disponible, fecha_compra, fecha_vencimiento, estado, ilimitado"
    )
    .in("estado", ["activo", "agotado", "vencido"])
    .not("perro_id", "is", null);
  return ((data ?? []) as PaqueteDePerro[]).map((p) => ({ ...p, ilimitado: Boolean(p.ilimitado) }));
}
