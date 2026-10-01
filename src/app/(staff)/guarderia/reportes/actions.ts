"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { traducirError } from "@/app/(staff)/reservas/traducir-error";
import { cargarPlantilla } from "@/lib/reporte/carga";
import { contactoDelPerro, enlaceWhatsApp, mensajeReporte, nuevoToken, urlReporte } from "@/lib/reporte/enlaces";
import { generarTarjeta } from "@/lib/reporte/tarjeta-servidor";
import { metaDeReporte } from "@/lib/reporte/meta";
import { respuestasDeContenido, type ContenidoReporte, type RespuestasReporte } from "@/lib/reporte/tipos";
import type { MetaReporte, ResultadoGuardar } from "./tipos";

// Un reporte es de UN perro y de UN día: nada aquí trabaja en bloque.

type Cliente = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function guardar(perroId: string, respuestas: RespuestasReporte, estado: "borrador" | "listo") {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reporte_guardar", { p_perro_id: perroId, p_respuestas: respuestas, p_estado: estado });
  if (error) return { supabase, error: traducirError(error), reporteId: null as string | null };
  return { supabase, error: null, reporteId: (data as { id: string }).id };
}

async function metaDe(supabase: Cliente, reporteId: string, perroId: string): Promise<MetaReporte> {
  const negocio = await negocioActual();
  const { data: p } = await supabase.from("perros").select("nombre").eq("id", perroId).maybeSingle();
  const nombre = `reporte-${String(p?.nombre ?? "perro").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`;
  return metaDeReporte(supabase, negocio.id, { reporteId }, nombre);
}

/** Autoguardado: siempre como borrador (si ya estaba listo, vuelve a borrador hasta que se deje listo otra vez). */
export async function guardarBorrador(perroId: string, respuestas: RespuestasReporte): Promise<ResultadoGuardar> {
  const r = await guardar(perroId, respuestas, "borrador");
  if (r.error || !r.reporteId) return { error: r.error ?? "No pudimos guardar." };
  revalidatePath("/guarderia/reportes");
  return { error: null, meta: await metaDe(r.supabase, r.reporteId, perroId) };
}

/** Guarda como listo y dibuja la imagen. */
export async function dejarListo(perroId: string, respuestas: RespuestasReporte): Promise<ResultadoGuardar> {
  const r = await guardar(perroId, respuestas, "listo");
  if (r.error || !r.reporteId) return { error: r.error ?? "No pudimos guardar." };
  const tarjeta = await generarTarjeta(r.reporteId);
  revalidatePath("/guarderia/reportes");
  const meta = await metaDe(r.supabase, r.reporteId, perroId);
  if (!tarjeta.ok) return { error: `El reporte quedó listo, pero no pudimos dibujar la imagen: ${tarjeta.error}`, meta };
  return { error: null, meta };
}

/** La imagen venció o quedó vieja: se vuelve a dibujar (los datos del reporte se conservan). */
export async function regenerarImagen(reporteId: string, perroId: string): Promise<ResultadoGuardar> {
  const supabase = await createSupabaseServerClient();
  const tarjeta = await generarTarjeta(reporteId);
  if (!tarjeta.ok) return { error: tarjeta.error };
  revalidatePath("/guarderia/reportes");
  return { error: null, meta: await metaDe(supabase, reporteId, perroId) };
}

/** Las marcas del último reporte ANTERIOR del perro, solo de opciones que existen hoy. Quien llama las muestra como borrador. */
export async function copiarDeAyer(perroId: string): Promise<{ error: string | null; respuestas?: RespuestasReporte }> {
  const supabase = await createSupabaseServerClient();
  const { data: dia } = await supabase.rpc("fecha_negocio");
  const { data: previo } = await supabase
    .from("reportes_guarderia")
    .select("contenido")
    .eq("perro_id", perroId)
    .lt("fecha", String(dia))
    .is("deleted_at", null)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!previo) return { error: "Este perro todavía no tiene un reporte anterior." };
  const { secciones } = await cargarPlantilla(supabase);
  const vigentes = new Map(secciones.map((s) => [s.clave, new Set(s.opciones.map((o) => o.clave))]));
  const anteriores = respuestasDeContenido(previo.contenido as ContenidoReporte);
  const respuestas: RespuestasReporte = {};
  for (const [clave, claves] of vigentes) {
    respuestas[clave] = { opciones: (anteriores[clave]?.opciones ?? []).filter((o) => claves.has(o)), otro: null, texto: null };
  }
  return { error: null, respuestas };
}

/** Crea la liga, marca el reporte como enviado y devuelve el wa.me al teléfono principal del dueño. */
export async function enviarReporte(reporteId: string, perroId: string): Promise<{ error: string | null; url?: string; meta?: MetaReporte }> {
  const supabase = await createSupabaseServerClient();
  const contacto = await contactoDelPerro(supabase, perroId);
  // Sin teléfono no se crea nada: el reporte no se marca como enviado.
  if (contacto.error || !contacto.telefono) return { error: contacto.error ?? "Falta el teléfono del dueño." };
  const negocio = await negocioActual();
  const { token, hash } = nuevoToken();
  const { error } = await supabase.rpc("reporte_crear_enlace", { p_reporte_id: reporteId, p_hash: hash });
  if (error) return { error: traducirError(error) };
  revalidatePath("/guarderia/reportes");
  const url = enlaceWhatsApp(
    contacto.telefono,
    mensajeReporte({ dueno: contacto.dueno, perro: contacto.perro, negocio: negocio.nombre, url: urlReporte(negocio, token) })
  );
  return { error: null, url, meta: await metaDe(supabase, reporteId, perroId) };
}
