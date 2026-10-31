import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Fotos de la app para dueños (bucket privado app-mascotas; ruta {dueño}/{mascota}/…). El servidor sube y firma. */
export const BUCKET_APP = "app-mascotas";
export const PESO_MAXIMO_FOTO = 8 * 1024 * 1024;

export function tipoImagen(archivo: File): "image/jpeg" | "image/png" | "image/webp" | null {
  if (archivo.type === "image/jpeg" || archivo.type === "image/jpg") return "image/jpeg";
  if (archivo.type === "image/png") return "image/png";
  if (archivo.type === "image/webp") return "image/webp";
  return null;
}

export async function subirFotoApp(o: { duenoId: string; mascotaId: string; carpeta: "perfil" | "cartilla"; archivo: File | Blob; contentType: string }): Promise<{ path: string | null; error: string | null }> {
  const ext = o.contentType === "image/png" ? "png" : o.contentType === "image/webp" ? "webp" : "jpg";
  const path = `${o.duenoId}/${o.mascotaId}/${o.carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await createSupabaseAdminClient().storage.from(BUCKET_APP).upload(path, o.archivo, { upsert: false, contentType: o.contentType });
  if (error) {
    console.error("[app] subir foto", error.message);
    return { path: null, error: "No pudimos guardar la foto. Intenta de nuevo." };
  }
  return { path, error: null };
}

export async function urlFirmadaApp(path: string | null | undefined, segundos = 3600): Promise<string | null> {
  if (!path) return null;
  const { data } = await createSupabaseAdminClient().storage.from(BUCKET_APP).createSignedUrl(path, segundos);
  return data?.signedUrl ?? null;
}

export async function bajarFotoApp(path: string): Promise<Buffer | null> {
  const { data } = await createSupabaseAdminClient().storage.from(BUCKET_APP).download(path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}
