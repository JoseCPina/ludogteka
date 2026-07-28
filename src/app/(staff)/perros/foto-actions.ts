"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET = "perros-archivos";
// Bastante larga para que no expire en medio de un turno normal, pero el
// componente igual sabe pedir una nueva si la pestaña lleva abierta más
// tiempo que esto (ver PerroFoto.manejarErrorImagen).
const EXPIRACION_SEGUNDOS = 60 * 60;

export async function obtenerUrlFotoPerro(perroId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: perro } = await supabase
    .from("perros")
    .select("foto_path")
    .eq("id", perroId)
    .single();

  if (!perro?.foto_path) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(perro.foto_path, EXPIRACION_SEGUNDOS);

  return error ? null : data.signedUrl;
}

// Si el perro ya tiene una foto, reutiliza la MISMA ruta (reemplazar es un
// upsert sobre el mismo objeto, sin huérfanos). Solo calcula una ruta
// nueva la primera vez — y esa ruta, una vez guardada, ya no cambia ni
// aunque el perro cambie de dueño después (perro_historial_dueno): la
// carpeta {cliente_id} es organización al momento de la primera foto, no
// se recalcula luego.
export async function prepararRutaFotoPerro(perroId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: perro } = await supabase
    .from("perros")
    .select("foto_path, cliente_id")
    .eq("id", perroId)
    .single();

  if (!perro) return null;
  if (perro.foto_path) return perro.foto_path;
  return `${perro.cliente_id}/${perroId}/perfil/foto.jpg`;
}

export async function guardarFotoPerro(
  perroId: string,
  path: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data: perro, error } = await supabase
    .from("perros")
    .update({ foto_path: path })
    .eq("id", perroId)
    .select("cliente_id")
    .single();

  if (error) return { error: "No pudimos guardar la foto." };

  revalidatePath(`/perros/${perroId}`);
  if (perro?.cliente_id) revalidatePath(`/clientes/${perro.cliente_id}`);
  return { error: null };
}
