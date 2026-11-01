"use server";

import { redirect } from "next/navigation";
import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { subirFotoApp, tipoImagen, PESO_MAXIMO_FOTO } from "@/lib/app/fotos";
import { crearAviso } from "@/lib/app/avisos";
import { hoyMx } from "@/lib/app/cartilla-util";

/** Alta de una mascota en la app: nombre, especie, sexo, nacimiento y foto (opcional). Navega a leer su cartilla. */
// registro-final: crea la mascota y navega a su cartilla
export async function crearMascota(form: FormData): Promise<{ error: string | null }> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const nombre = String(form.get("nombre") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const especie = String(form.get("especie") ?? "perro");
  const sexo = String(form.get("sexo") ?? "");
  const nacimiento = String(form.get("fecha_nacimiento") ?? "").trim();
  const especieDetalle = String(form.get("especie_detalle") ?? "").trim().slice(0, 40);
  const raza = String(form.get("raza") ?? "").trim().slice(0, 60);
  if (nombre.length < 1) return { error: "Escribe cómo se llama." };
  if (!["perro", "gato", "otro"].includes(especie)) return { error: "Escoge qué es." };
  if (nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) return { error: "La fecha de nacimiento no se entiende." };
  if (nacimiento && nacimiento > hoyMx()) return { error: "La fecha de nacimiento no puede ser futura." };
  const foto = form.get("foto");
  let contentType: ReturnType<typeof tipoImagen> = null;
  if (foto instanceof File && foto.size > 0) {
    contentType = tipoImagen(foto);
    if (!contentType) return { error: "La foto tiene que ser una imagen (JPG, PNG o WebP)." };
    if (foto.size > PESO_MAXIMO_FOTO) return { error: "La foto pesa más de 8 MB. Toma otra o escoge una más chica." };
  }
  const supabase = await createSupabaseServerClient("portal");
  const { data, error } = await supabase
    .from("mascotas")
    .insert({ dueno_id: s.user.id, nombre, especie, especie_detalle: especie === "otro" ? especieDetalle || null : null, sexo: sexo === "macho" || sexo === "hembra" ? sexo : null, fecha_nacimiento: nacimiento || null, raza_texto: raza || null, origen: "app", updated_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) return { error: "No pudimos guardar a tu mascota. Intenta de nuevo." };
  if (foto instanceof File && contentType) {
    const { path } = await subirFotoApp({ duenoId: s.user.id, mascotaId: data.id, carpeta: "perfil", archivo: foto, contentType });
    if (path) await supabase.from("mascotas").update({ foto_path: path }).eq("id", data.id);
  }
  await crearAviso({ duenoId: s.user.id, tipo: "bienvenida", titulo: `${nombre} ya está en tu app`, cuerpo: "Súbele la foto de su cartilla y te avisamos cuando le toque cada vacuna.", url: `/mascotas/${data.id}/cartilla/leer`, mascotaId: data.id, push: false });
  redirect(`/mascotas/${data.id}/cartilla/leer?nueva=1`);
}

/** Foto de perfil de una mascota ya creada. */
export async function cambiarFoto(mascotaId: string, form: FormData): Promise<{ error: string | null; registros?: import("@/lib/concurrencia/tipos").RegistroFinal[] }> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return { error: "Escoge una foto." };
  const contentType = tipoImagen(foto);
  if (!contentType) return { error: "La foto tiene que ser una imagen (JPG, PNG o WebP)." };
  if (foto.size > PESO_MAXIMO_FOTO) return { error: "La foto pesa más de 8 MB." };
  const supabase = await createSupabaseServerClient("portal");
  const { data: mia } = await supabase.from("mascotas").select("id").eq("id", mascotaId).is("deleted_at", null).maybeSingle();
  if (!mia) return { error: "No encontramos esa mascota." };
  const { path, error } = await subirFotoApp({ duenoId: s.user.id, mascotaId, carpeta: "perfil", archivo: foto, contentType });
  if (!path) return { error: error ?? "No pudimos guardar la foto." };
  await supabase.from("mascotas").update({ foto_path: path }).eq("id", mascotaId);
  const { registrosDe } = await import("@/lib/concurrencia/registro-final");
  return { error: null, registros: await registrosDe(supabase, [{ t: "mascotas", i: mascotaId }]) };
}
