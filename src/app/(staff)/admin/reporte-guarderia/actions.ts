"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { traducirError } from "@/app/(staff)/reservas/traducir-error";
import { cargarPlantilla } from "@/lib/reporte/carga";
import { contenidoDeEjemplo } from "@/lib/reporte/ejemplo";
import { datosDeTarjeta, renderizarTarjetaJpeg } from "@/lib/reporte/tarjeta-servidor";
import type { ConfigEditable, ResultadoEditor, SeccionEditable, SeccionNueva } from "./tipos";

// La plantilla la edita SOLO admin: la base lo exige (políticas con is_admin()).

const HEX = /^#[0-9a-fA-F]{6}$/;

function clave(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  return `${base.length >= 2 ? base : "op"}_${randomBytes(2).toString("hex")}`;
}

async function exigirAdmin(): Promise<string | null> {
  const sesion = await obtenerSesionConRol();
  return sesion?.rol === "admin" ? null : "Solo un admin cambia la plantilla del reporte.";
}

function limpiar(v: string | null | undefined, max: number): string | null {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
}

export async function guardarConfig(c: ConfigEditable): Promise<ResultadoEditor> {
  const noAdmin = await exigirAdmin();
  if (noAdmin) return { error: noAdmin };
  if (!c.titulo.trim()) return { error: "Escribe el título de la tarjeta." };
  if (!Number.isInteger(c.retencion_dias) || c.retencion_dias < 1 || c.retencion_dias > 30) return { error: "Los días de retención van de 1 a 30." };
  for (const col of [c.color_primario, c.color_secundario, c.color_acento]) {
    if (col && !HEX.test(col)) return { error: "Un color no es válido." };
  }
  const supabase = await createSupabaseServerClient();
  const fila = {
    titulo: c.titulo.trim().slice(0, 60),
    subtitulo: (c.subtitulo ?? "").trim().slice(0, 90),
    color_primario: c.color_primario || null,
    color_secundario: c.color_secundario || null,
    color_acento: c.color_acento || null,
    retencion_dias: c.retencion_dias,
  };
  const { data: existente } = await supabase.from("reporte_config").select("id").is("deleted_at", null).maybeSingle();
  const { error } = existente
    ? await supabase.from("reporte_config").update(fila).eq("id", existente.id)
    : await supabase.from("reporte_config").insert(fila);
  if (error) return { error: traducirError(error) };
  revalidatePath("/admin/reporte-guarderia");
  return { error: null, ok: true };
}

export async function guardarSeccion(s: SeccionEditable): Promise<ResultadoEditor> {
  const noAdmin = await exigirAdmin();
  if (noAdmin) return { error: noAdmin };
  if (!s.titulo.trim()) return { error: "La sección necesita un nombre." };
  if (s.opciones.some((o) => !o.texto.trim())) return { error: "Una opción quedó sin texto: escríbelo o apágala." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("reporte_secciones")
    .update({
      titulo: s.titulo.trim().slice(0, 60),
      presentacion: s.presentacion,
      seleccion: s.seleccion,
      permite_otro: s.permite_otro,
      etiqueta_texto: s.presentacion === "texto" ? limpiar(s.etiqueta_texto, 40) ?? s.titulo.trim().slice(0, 40) : limpiar(s.etiqueta_texto, 40),
      columna: s.columna,
      color: s.color,
      icono: s.icono || null,
      activa: s.activa,
    })
    .eq("id", s.id);
  if (error) return { error: traducirError(error) };

  for (let i = 0; i < s.opciones.length; i += 1) {
    const o = s.opciones[i];
    const datos = { texto: o.texto.trim().slice(0, 80), icono: o.icono || null, activa: o.activa, en_buen_dia: o.en_buen_dia, orden: i + 1 };
    const r = o.id
      ? await supabase.from("reporte_opciones").update(datos).eq("id", o.id).eq("seccion_id", s.id)
      : await supabase.from("reporte_opciones").insert({ ...datos, seccion_id: s.id, clave: clave(o.texto) });
    if (r.error) return { error: traducirError(r.error) };
  }
  revalidatePath("/admin/reporte-guarderia");
  return { error: null, ok: true };
}

export async function crearSeccion(n: SeccionNueva): Promise<ResultadoEditor> {
  const noAdmin = await exigirAdmin();
  if (noAdmin) return { error: noAdmin };
  if (!n.titulo.trim()) return { error: "Ponle nombre a la sección." };
  const supabase = await createSupabaseServerClient();
  const { data: ultima } = await supabase.from("reporte_secciones").select("orden").is("deleted_at", null).order("orden", { ascending: false }).limit(1).maybeSingle();
  const texto = n.presentacion === "texto";
  const { error } = await supabase.from("reporte_secciones").insert({
    clave: clave(n.titulo),
    titulo: n.titulo.trim().slice(0, 60),
    presentacion: n.presentacion,
    seleccion: n.seleccion,
    permite_otro: texto ? false : n.permite_otro,
    etiqueta_texto: texto ? limpiar(n.etiqueta_texto, 40) ?? n.titulo.trim().slice(0, 40) : limpiar(n.etiqueta_texto, 40),
    columna: n.columna,
    color: n.color,
    orden: ((ultima?.orden as number | undefined) ?? 0) + 1,
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/admin/reporte-guarderia");
  return { error: null, ok: true };
}

/** Sube o baja una sección: cambia su lugar con la vecina. */
export async function moverSeccion(id: string, direccion: "arriba" | "abajo"): Promise<ResultadoEditor> {
  const noAdmin = await exigirAdmin();
  if (noAdmin) return { error: noAdmin };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("reporte_secciones").select("id, orden").is("deleted_at", null).order("orden").order("created_at");
  const lista = data ?? [];
  const i = lista.findIndex((s) => s.id === id);
  const j = direccion === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= lista.length) return { error: null, ok: true };
  // Se renumera toda la lista para no depender de huecos o empates.
  const nueva = lista.map((s) => s.id as string);
  [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
  for (let k = 0; k < nueva.length; k += 1) {
    const { error } = await supabase.from("reporte_secciones").update({ orden: k + 1 }).eq("id", nueva[k]);
    if (error) return { error: traducirError(error) };
  }
  revalidatePath("/admin/reporte-guarderia");
  return { error: null, ok: true };
}

/** La tarjeta con datos de ejemplo, con la plantilla y los colores que ya están guardados. */
export async function vistaPreviaTarjeta(): Promise<{ error: string | null; imagen?: string }> {
  const noAdmin = await exigirAdmin();
  if (noAdmin) return { error: noAdmin };
  try {
    const supabase = await createSupabaseServerClient();
    const { config, secciones } = await cargarPlantilla(supabase);
    const hoy = String((await supabase.rpc("fecha_negocio")).data);
    const jpeg = await renderizarTarjetaJpeg(await datosDeTarjeta(contenidoDeEjemplo(secciones, config), "Nombre del perro", hoy));
    return { error: null, imagen: `data:image/jpeg;base64,${jpeg.toString("base64")}` };
  } catch (e) {
    console.error("[reporte] vista previa", e);
    return { error: "No pudimos dibujar la vista previa. Intenta de nuevo." };
  }
}
