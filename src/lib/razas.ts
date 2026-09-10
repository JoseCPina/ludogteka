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
    .select("id, nombre, alias, es_desconocida, grupos_raza(nombre, depende_tamano)")
    .is("deleted_at", null)
    .order("nombre");

  return ((data ?? []) as unknown as {
    id: string;
    nombre: string;
    alias: string[] | null;
    es_desconocida: boolean | null;
    grupos_raza: { nombre: string; depende_tamano: boolean } | null;
  }[]).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    alias: r.alias ?? [],
    es_desconocida: Boolean(r.es_desconocida),
    // El grupo solo viaja cuando quien mira es del negocio. En la
    // pantalla del cliente ni siquiera se manda: no tiene por qué saber
    // en qué cajón de precio cae su perro, y mandarlo invita a enseñarlo.
    ...(opciones.conGrupo
      ? {
          grupo_nombre: r.grupos_raza?.nombre,
          grupo_depende_tamano: r.grupos_raza?.depende_tamano ?? false,
        }
      : {}),
  }));
}

// "Bóxer" y "boxer", "shih tzu" y "shitzu": quien captura escribe como se
// dice, no como se escribe. Sin quitar acentos ni bajar a minúsculas, la
// búsqueda falla justo con las razas que más se teclean mal.
export function normalizarTextoRaza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Qué raza del catálogo corresponde EXACTAMENTE a un texto escrito a
 * mano, o null si no hay una sola respuesta obvia.
 *
 * Deliberadamente estricto: coincidencia exacta contra el nombre o
 * alguno de los alias, nada de parecidos. Esto alimenta la sugerencia de
 * la normalización en bloque, y esa pantalla escribe el grupo del que
 * sale el precio del baño. Una coincidencia laxa convertiría "pastor" en
 * "pastor alemán" a ciegas y cambiaría cuánto se le cobra a ese perro
 * sin que nadie lo haya decidido. Lo que no es obvio lo contesta una
 * persona.
 */
export function sugerirRaza(razas: RazaOpcion[], texto: string): RazaOpcion | null {
  const q = normalizarTextoRaza(texto);
  if (!q) return null;

  const coincidencias = razas.filter((raza) =>
    [raza.nombre, ...raza.alias].some((candidato) => normalizarTextoRaza(candidato) === q)
  );
  return coincidencias.length === 1 ? coincidencias[0] : null;
}

/**
 * Cuántos perros vivos todavía no tienen raza del catálogo.
 *
 * Es el número que hace visible el problema: mientras un perro no tenga
 * `raza_id`, su baño se cotiza con el grupo predeterminado (pelo corto,
 * el más barato). No es un dato faltante cualquiera — es dinero mal
 * cobrado en cada cita, sin que nadie se entere.
 */
export async function contarPerrosSinRazaCatalogo(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("perros")
    .select("id", { count: "exact", head: true })
    .is("raza_id", null)
    .is("deleted_at", null)
    .eq("fallecido", false);
  return count ?? 0;
}
