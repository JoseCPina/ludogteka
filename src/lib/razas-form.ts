import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import type { PropuestaRazaVista } from "@/lib/razas-propuesta";

export type ContextoRazaFormulario = {
  // «Precios y tarifas» (o admin): ve y usa el selector de grupo de precio.
  puedeAsignarGrupo: boolean;
  grupos: { id: string; nombre: string }[];
  // La propuesta pendiente a la que ya está ligado el perro (si lo está).
  propuesta: PropuestaRazaVista | null;
};

/**
 * Lo que el formulario del perro necesita para resolver una raza fuera del
 * catálogo. Los grupos de precio SOLO se leen si la persona puede
 * asignarlos: quien no tiene «Precios y tarifas» no recibe ni sus nombres.
 */
export async function contextoRazaFormulario(supabase: SupabaseClient, perroId: string | null): Promise<ContextoRazaFormulario> {
  const sesion = await obtenerSesionConRol();
  const puedeAsignarGrupo = tienePermiso(sesion, "tarifas");
  const [{ data: grupos }, vinculo] = await Promise.all([
    puedeAsignarGrupo
      ? supabase.from("grupos_raza").select("id, nombre").is("deleted_at", null).order("orden")
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    perroId
      ? supabase
          .from("razas_propuestas_perros")
          .select("razas_propuestas!inner(nombre, estado, grupo_raza_id, grupos_raza(nombre))")
          .eq("perro_id", perroId)
          .is("deleted_at", null)
          .eq("razas_propuestas.estado", "pendiente")
          .is("razas_propuestas.deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
  ]);
  const fila = (vinculo.data?.[0] as unknown as { razas_propuestas: { nombre: string; grupos_raza: { nombre: string } | null } } | undefined)?.razas_propuestas;
  return {
    puedeAsignarGrupo,
    grupos: (grupos ?? []) as { id: string; nombre: string }[],
    propuesta: fila ? { nombre: fila.nombre, grupoNombre: fila.grupos_raza?.nombre ?? null, enviada: true, datos: null } : null,
  };
}
