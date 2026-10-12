// ¿Puede editar la ficha clínica (especie, microchip, folio, notas clínicas)? El permiso «Editar ficha clínica», o ser
// médico veterinario designado (un MVZ con rol de estética no puede recibir permisos por persona, y es quien más la necesita).
// La base decide con vet_puede; esto solo lo pregunta para mostrar u ocultar la pantalla.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/auth/permisos";

export async function puedeEditarFichaClinica(sesion: Parameters<typeof tienePermiso>[0]): Promise<boolean> {
  if (!sesion) return false;
  if (tienePermiso(sesion, "editar_ficha_clinica")) return true;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("vet_puede", { p_permiso: "editar_ficha_clinica" });
  return data === true;
}
