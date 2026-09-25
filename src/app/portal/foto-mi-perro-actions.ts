"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { obtenerSesionConRol } from "@/lib/auth/sesion";

const BUCKET = "perros-archivos";
const PESO_MAXIMO = 4 * 1024 * 1024;

export type ResultadoFotoMiPerro = { error: string | null; url?: string | null };

/**
 * El dueño sube o reemplaza la foto de identificación de su perro desde el
 * portal. Se aplica directo: es una foto, no un documento que recepción
 * tenga que confirmar.
 *
 * Misma forma que el comprobante sanitario: el servidor comprueba que
 * quien la manda es el dueño PRINCIPAL y que el perro no ha fallecido,
 * sube la foto con la secret key (el dueño no tiene escritura en el
 * bucket) a la MISMA ruta que usa recepción (reemplazar es un upsert, sin
 * huérfanos), y guarda la ruta por una RPC que vuelve a exigir lo mismo
 * del lado de la base.
 */
export async function subirFotoMiPerro(perroId: string, formData: FormData): Promise<ResultadoFotoMiPerro> {
  const archivo = formData.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "No recibimos la foto." };
  if (!archivo.type.startsWith("image/")) return { error: "Ese archivo no es una imagen." };
  if (archivo.size > PESO_MAXIMO) return { error: "La foto pesa demasiado. Elige una más ligera." };

  const sesion = await obtenerSesionConRol();
  if (!sesion?.clienteId) return { error: "Tu cuenta no está ligada a un expediente." };

  const supabase = await createSupabaseServerClient();
  const { data: perro } = await supabase
    .from("perros")
    .select("id, cliente_id, fallecido, foto_path")
    .eq("id", perroId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!perro || perro.cliente_id !== sesion.clienteId) {
    return { error: "Este perro no es tuyo directamente: solo su dueño principal puede cambiar la foto." };
  }
  if (perro.fallecido) return { error: "La foto de un perro que falleció se queda como está." };

  // Misma regla que recepción (prepararRutaFotoPerro): si ya hay foto se
  // reutiliza su ruta; si no, la fija por primera vez.
  const path = (perro.foto_path as string | null) ?? `${perro.cliente_id}/${perroId}/perfil/foto.jpg`;

  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(path, archivo, { upsert: true, contentType: "image/jpeg" });
  if (errorSubida) return { error: "No pudimos subir la foto. Intenta de nuevo." };

  const { error: errorGuardar } = await supabase.rpc("actualizar_foto_mi_perro", {
    p_perro_id: perroId,
    p_foto_path: path,
  });
  if (errorGuardar) return { error: errorGuardar.message || "No pudimos guardar la foto." };

  const { data: firmada } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);

  revalidatePath("/portal");
  revalidatePath(`/portal/perros/${perroId}`);
  return { error: null, url: firmada?.signedUrl ?? null };
}
