import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Los servicios que una pantalla puede ofrecer para agendar o reservar,
 * cada uno con la respuesta a "¿se puede cobrar hoy?".
 *
 * La base ya sabe cuáles se pueden cobrar (`servicios_cotizables`: vivo y
 * con al menos un precio vigente que no sea "no aplica"). Lo que este
 * helper agrega es la OTRA mitad del contrato con recepción: un servicio
 * que existe y al que le falta precio no se esconde, se muestra
 * deshabilitado diciendo qué falta. Si se ocultara, un olvido de captura
 * parecería un servicio que no existe, y nadie sabría que hay que ir a
 * capturarlo.
 *
 * Estética hace lo contrario a propósito (lee solo de la vista): ahí el
 * catálogo lo escoge el dueño desde su celular y no hay a quién avisarle.
 */
export type ServicioOfrecible = {
  id: string;
  nombre: string;
  categoria: string;
  unidad: string;
  cotizable: boolean;
};

export async function cargarServiciosOfrecibles(
  supabase: SupabaseClient,
  categorias: string[],
  opciones: { excluirUnidades?: string[] } = {}
): Promise<{ servicios: ServicioOfrecible[]; error: { message: string } | null }> {
  const [{ data: todos, error: errorTodos }, { data: cotizables, error: errorCotizables }] =
    await Promise.all([
      supabase
        .from("servicios")
        .select("id, nombre, categoria, unidad")
        .in("categoria", categorias)
        .is("deleted_at", null)
        .order("orden"),
      supabase.from("servicios_cotizables").select("id").in("categoria", categorias),
    ]);

  const error = errorTodos ?? errorCotizables;
  if (error) return { servicios: [], error };

  const idsCotizables = new Set((cotizables ?? []).map((c) => c.id as string));
  const excluir = new Set(opciones.excluirUnidades ?? []);

  return {
    error: null,
    servicios: (todos ?? [])
      .filter((s) => !excluir.has(s.unidad as string))
      .map((s) => ({
        id: s.id as string,
        nombre: s.nombre as string,
        categoria: s.categoria as string,
        unidad: s.unidad as string,
        cotizable: idsCotizables.has(s.id as string),
      })),
  };
}

export function primerCotizable(servicios: ServicioOfrecible[]): ServicioOfrecible | undefined {
  return servicios.find((s) => s.cotizable);
}
