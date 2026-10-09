"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { BUCKET_PUBLICO } from "@/lib/negocio/publico";
import { esErrorSoloLectura, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import sharp from "sharp";
import { avisosDeLogo, extensionDeLogo, svgPeligroso } from "@/lib/logo";

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

async function subirImagen(
  fd: FormData,
  carpeta: string,
  opciones: { tipos?: string[]; maxBytes?: number } = {},
): Promise<{ error: string | null; path?: string; archivo?: File; supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>> }> {
  const { supabase, puede } = await puedeEditar();
  if (!puede) return { error: "Solo un admin, o quien tenga el permiso «Configuración del negocio», edita el perfil." };
  const { data: escribible } = await supabase.rpc("negocio_escribible");
  if (escribible === false) return { error: MENSAJE_SOLO_LECTURA };
  const archivo = fd.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Escoge una foto." };
  if (!(opciones.tipos ?? TIPOS).includes(archivo.type)) return { error: opciones.tipos ? "El logo tiene que ser PNG, JPG, WebP o SVG." : "La foto tiene que ser JPG, PNG o WebP." };
  if (archivo.size > (opciones.maxBytes ?? MAX_BYTES)) return { error: `La foto pesa demasiado (máximo ${Math.round((opciones.maxBytes ?? MAX_BYTES) / 1024 / 1024)} MB).` };
  const negocio = await negocioActual();
  const extension = extensionDeLogo(archivo.type) ?? "jpg";
  const path = `${negocio.id}/${carpeta}/${crypto.randomUUID()}.${extension}`;
  const { error } = await createSupabaseAdminClient(negocio.id).storage.from(BUCKET_PUBLICO).upload(path, archivo, { contentType: archivo.type, upsert: false });
  if (error) {
    console.error("[perfil] subir", error.message);
    return { error: "No pudimos subir la foto. Intenta de nuevo." };
  }
  return { error: null, path, archivo, supabase };
}

// El logo se guarda TAL CUAL (PNG con transparencia, SVG, etc.): antes se
// recomprimía a JPG de 600 px y perdía la transparencia. El servidor lee sus
// dimensiones reales, las valida y las guarda.
export async function subirLogo(fd: FormData): Promise<ResultadoPerfil> {
  const archivo = fd.get("foto");
  if (archivo instanceof File && archivo.size > 0) {
    let ancho: number | null = null;
    let alto: number | null = null;
    try {
      const buffer = Buffer.from(await archivo.arrayBuffer());
      if (archivo.type === "image/svg+xml" && svgPeligroso(buffer.toString("utf8"))) return { error: "Ese SVG trae código que no se permite. Expórtalo de nuevo como imagen limpia, o súbelo como PNG." };
      const meta = await sharp(buffer).metadata();
      ancho = meta.width ?? null;
      alto = meta.height ?? null;
    } catch {
      return { error: "No pudimos leer esa imagen. Prueba con otro archivo PNG, JPG, WebP o SVG." };
    }
    const bloqueos = avisosDeLogo({ tipo: archivo.type, bytes: archivo.size, ancho, alto }).filter((a) => a.nivel === "error");
    if (bloqueos.length) return { error: bloqueos[0].texto };
    fd.set("ancho", String(ancho ?? ""));
    fd.set("alto", String(alto ?? ""));
  }
  const r = await subirImagen(fd, "logo", { tipos: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"], maxBytes: 2 * 1024 * 1024 });
  if (r.error || !r.path || !r.supabase) return { error: r.error };
  const ancho = Number(fd.get("ancho")) || null;
  const alto = Number(fd.get("alto")) || null;
  const id = await perfilId(r.supabase);
  const cambios = { logo_path: r.path, logo_ancho: ancho, logo_alto: alto };
  const { error } = id
    ? await r.supabase.from("negocio_perfil").update(cambios).eq("id", id)
    : await r.supabase.from("negocio_perfil").insert(cambios);
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
