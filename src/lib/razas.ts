import type { SupabaseClient } from "@supabase/supabase-js";
import type { RazaOpcion } from "@/components/selector-raza";

/**
 * El catálogo de razas para el buscador.
 *
 * Se manda entero al navegador (unas decenas de razas, unos pocos KB) en
 * vez de buscar contra la base a cada tecla: la lista casi no cambia, y
 * el alta la llena gente desde el celular, muchas veces con la señal del
 * estacionamiento. Filtrar en el cliente es instantáneo y no depende de
 * la red.
 *
 * Recibe el cliente de Supabase porque lo llaman desde permisos
 * distintos: las pantallas del negocio con la sesión del empleado, y el
 * alta pública con la secret key, que ahí no hay nadie autenticado
 * todavía. El contenido es el mismo — es un catálogo, no datos de nadie.
 */
export async function cargarRazas(
  supabase: SupabaseClient,
  opciones: { conGrupo?: boolean } = {}
): Promise<RazaOpcion[]> {
  const { data } = await supabase
    .from("razas")
    .select("id, nombre, alias, grupos_raza(nombre)")
    .is("deleted_at", null)
    .order("nombre");

  return ((data ?? []) as unknown as {
    id: string;
    nombre: string;
    alias: string[] | null;
    grupos_raza: { nombre: string } | null;
  }[]).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    alias: r.alias ?? [],
    // El grupo solo viaja cuando quien mira es del negocio. En la
    // pantalla del cliente ni siquiera se manda: no tiene por qué saber
    // en qué cajón de precio cae su perro, y mandarlo invita a enseñarlo.
    ...(opciones.conGrupo ? { grupo_nombre: r.grupos_raza?.nombre } : {}),
  }));
}
