import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaqueteDePerro } from "./pase-para-fecha";
import { leerTodo } from "@/lib/supabase/paginar";

// Los day pass y mensualidades que pueden importar al reservar: los que
// siguen activos o se agotaron (para poder decir "ya no le quedan"). Los
// vencidos hace tiempo no se traen. Lectura del staff (bonos_clientes_estado
// ya no es legible para el cliente).
export async function cargarPaquetesDePerros(supabase: SupabaseClient): Promise<PaqueteDePerro[]> {
  // Todos, de 1,000 en 1,000: un negocio con años de pases pasa de ahí, y un paquete sin cargar es un día de pase que se cobra.
  const { data } = await leerTodo<Record<string, unknown>>(() =>
    supabase
      .from("bonos_clientes_estado")
      .select(
        "id, perro_id, servicio_nombre, servicio_incluido_id, cantidad_total, cantidad_disponible, fecha_compra, fecha_vencimiento, estado, ilimitado"
      )
      .in("estado", ["activo", "agotado", "vencido"])
      .not("perro_id", "is", null)
      .order("id")
  );
  return ((data ?? []) as PaqueteDePerro[]).map((p) => ({ ...p, ilimitado: Boolean(p.ilimitado) }));
}
