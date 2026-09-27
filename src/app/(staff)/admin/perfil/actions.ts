"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { BUCKET_PUBLICO } from "@/lib/negocio/publico";
import { esErrorSoloLectura, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";

export type ResultadoPerfil = { error: string | null; exito?: string };

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 6 * 1024 * 1024;

function mensaje(error: { code?: string; message?: string }): string {
  return esErrorSoloLectura(error) ? MENSAJE_SOLO_LECTURA : "No se pudo guardar. Intenta de nuevo.";
}

async function puedeEditar() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("tiene_permiso", { p_permiso: "configuracion_negocio" });
  return { supabase, puede: data === true };
}

// Después de cada cambio: si con esto el perfil quedó completo a tiempo, la
// base le da la página web gratis (evaluar_web_gratis decide, no la pantalla).
async function refrescar(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  await supabase.rpc("evaluar_web_gratis");
  revalidatePath("/admin/perfil");
  revalidatePath("/bienvenida");
  revalidatePath("/");
}

async function perfilId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data } = await supabase.from("negocio_perfil").select("id").is("deleted_at", null).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function guardarPerfil(fd: FormData): Promise<ResultadoPerfil> {
  const { supabase, puede } = await puedeEditar();
  if (!puede) return { error: "Solo un admin, o quien tenga el permiso «Configuración del negocio», edita el perfil." };
  const campos = {
    descripcion: String(fd.get("descripcion") ?? "").trim().slice(0, 600) || null,
    direccion: String(fd.get("direccion") ?? "").trim().slice(0, 200) || null,
  };
  const id = await perfilId(supabase);
  const { error } = id
    ? await supabase.from("negocio_perfil").update(campos).eq("id", id)
    : await supabase.from("negocio_perfil").insert(campos);
  if (error) return { error: mensaje(error) };
  await refrescar(supabase);
  return { error: null, exito: "Perfil guardado" };
}

async function subirImagen(fd: FormData, carpeta: string): Promise<{ error: string | null; path?: string; supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>> }> {
  const { supabase, puede } = await puedeEditar();
  if (!puede) return { error: "Solo un admin, o quien tenga el permiso «Configuración del negocio», edita el perfil." };
  const { data: escribible } = await supabase.rpc("negocio_escribible");
  if (escribible === false) return { error: MENSAJE_SOLO_LECTURA };
  const archivo = fd.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Escoge una foto." };
  if (!TIPOS.includes(archivo.type)) return { error: "La foto tiene que ser JPG, PNG o WebP." };
  if (archivo.size > MAX_BYTES) return { error: "La foto pesa demasiado (máximo 6 MB)." };
  const negocio = await negocioActual();
  const extension = archivo.type === "image/png" ? "png" : archivo.type === "image/webp" ? "webp" : "jpg";
  const path = `${negocio.id}/${carpeta}/${crypto.randomUUID()}.${extension}`;
  const { error } = await createSupabaseAdminClient(negocio.id).storage.from(BUCKET_PUBLICO).upload(path, archivo, { contentType: archivo.type, upsert: false });
  if (error) {
    console.error("[perfil] subir", error.message);
    return { error: "No pudimos subir la foto. Intenta de nuevo." };
  }
  return { error: null, path, supabase };
}

export async function subirLogo(fd: FormData): Promise<ResultadoPerfil> {
  const r = await subirImagen(fd, "logo");
  if (r.error || !r.path || !r.supabase) return { error: r.error };
  const id = await perfilId(r.supabase);
  const { error } = id
    ? await r.supabase.from("negocio_perfil").update({ logo_path: r.path }).eq("id", id)
    : await r.supabase.from("negocio_perfil").insert({ logo_path: r.path });
  if (error) return { error: mensaje(error) };
  await refrescar(r.supabase);
  revalidatePath("/", "layout");
  return { error: null, exito: "Logo guardado" };
}

export async function subirFoto(fd: FormData): Promise<ResultadoPerfil> {
  const r = await subirImagen(fd, "fotos");
  if (r.error || !r.path || !r.supabase) return { error: r.error };
  const { count } = await r.supabase.from("negocio_fotos").select("id", { count: "exact", head: true }).is("deleted_at", null);
  const { error } = await r.supabase.from("negocio_fotos").insert({ path: r.path, orden: (count ?? 0) + 1 });
  if (error) return { error: mensaje(error) };
  await refrescar(r.supabase);
  return { error: null, exito: "Foto agregada" };
}

// Quitar una foto: baja lógica (el archivo se queda en Storage).
export async function quitarFoto(id: string): Promise<ResultadoPerfil> {
  const { supabase, puede } = await puedeEditar();
  if (!puede) return { error: "Solo un admin, o quien tenga el permiso «Configuración del negocio», edita el perfil." };
  const { error } = await supabase.from("negocio_fotos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: mensaje(error) };
  await refrescar(supabase);
  return { error: null };
}
