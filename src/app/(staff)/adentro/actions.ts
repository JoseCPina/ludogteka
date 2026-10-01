"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { traducirError } from "../reservas/traducir-error";
import { BUCKET_REPORTES, MAX_FOTO_BYTES, MAX_VIDEO_BYTES } from "@/lib/reporte/constantes";
import { contactoDelPerro, enlaceWhatsApp, firmarRutas, mensajeGaleria, nuevoToken, urlGaleria } from "@/lib/reporte/enlaces";
import { formatearFecha } from "@/lib/formato";

export type MediaVigente = {
  id: string;
  tipo: "foto" | "video";
  url: string | null;
  bytes: number | null;
  duracion: number | null;
  /** «Se borra el 7 oct (en 5 días)» */
  borra: string;
  expiraAt: string;
};

function textoBorra(expiraAt: string, zona: string): string {
  const dias = Math.max(0, Math.ceil((new Date(expiraAt).getTime() - Date.now()) / 86_400_000));
  const cuando = dias === 0 ? "hoy" : dias === 1 ? "en 1 día" : `en ${dias} días`;
  return `Se borra el ${formatearFecha(expiraAt, zona)} (${cuando})`;
}

export async function prepararSubida(
  perroId: string,
  tipo: "foto" | "video",
  mime: string
): Promise<{ error: string | null; id?: string; urlFirmada?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("media_preparar", { p_perro_id: perroId, p_tipo: tipo, p_mime: mime });
  if (error) return { error: traducirError(error) };
  const fila = data as { id: string; path: string };
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const { data: firma, error: errorFirma } = await admin.storage.from(BUCKET_REPORTES).createSignedUploadUrl(fila.path);
  if (errorFirma || !firma) {
    await supabase.rpc("media_quitar", { p_id: fila.id });
    return { error: "No pudimos preparar la subida. Intenta de nuevo." };
  }
  return { error: null, id: fila.id, urlFirmada: firma.signedUrl };
}

export async function confirmarSubida(id: string, duracion: number | null): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const negocio = await negocioActual();
  const { data: fila } = await supabase
    .from("media_perro")
    .select("path, tipo")
    .eq("id", id)
    .eq("estado", "subiendo")
    .is("deleted_at", null)
    .maybeSingle();
  if (!fila) return { error: "No encontramos ese archivo." };
  const path = fila.path as string;
  // El tamaño real lo dice Storage, no el navegador.
  const admin = createSupabaseAdminClient(negocio.id);
  const carpeta = path.slice(0, path.lastIndexOf("/"));
  const nombre = path.slice(path.lastIndexOf("/") + 1);
  const { data: lista } = await admin.storage.from(BUCKET_REPORTES).list(carpeta, { search: nombre, limit: 5 });
  const objeto = (lista ?? []).find((o) => o.name === nombre);
  const bytes = Number((objeto?.metadata as { size?: number } | null)?.size ?? 0);
  const tope = fila.tipo === "video" ? MAX_VIDEO_BYTES : MAX_FOTO_BYTES;
  if (!objeto || bytes <= 0 || bytes > tope) {
    await supabase.rpc("media_quitar", { p_id: id });
    return { error: !objeto ? "El archivo no llegó completo. Vuelve a intentarlo." : "El archivo pasa del tamaño permitido." };
  }
  const { error } = await supabase.rpc("media_confirmar", { p_id: id, p_bytes: bytes, p_duracion: duracion });
  if (error) {
    await supabase.rpc("media_quitar", { p_id: id });
    return { error: traducirError(error) };
  }
  return { error: null };
}

export async function quitarMedia(id: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("media_quitar", { p_id: id });
  return { error: error ? traducirError(error) : null };
}

/** Lo vigente de un perro (fotos y videos listos que todavía no se borran), con URLs firmadas de corta vida. */
export async function listarMediaPerro(perroId: string): Promise<{ error: string | null; items: MediaVigente[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("media_perro")
    .select("id, tipo, path, bytes, duracion_s, expira_at, created_at")
    .eq("perro_id", perroId)
    .eq("estado", "lista")
    .is("quitada_at", null)
    .is("vencida_at", null)
    .is("deleted_at", null)
    .gt("expira_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return { error: traducirError(error), items: [] };
  const negocio = await negocioActual();
  const zona = await zonaActual();
  const urls = await firmarRutas(createSupabaseAdminClient(negocio.id), (data ?? []).map((m) => m.path as string));
  return {
    error: null,
    items: (data ?? []).map((m) => ({
      id: m.id as string,
      tipo: m.tipo as "foto" | "video",
      url: urls.get(m.path as string) ?? null,
      bytes: (m.bytes as number | null) ?? null,
      duracion: m.duracion_s == null ? null : Number(m.duracion_s),
      borra: textoBorra(m.expira_at as string, zona),
      expiraAt: m.expira_at as string,
    })),
  };
}

/** Crea la galería con lo escogido y devuelve el wa.me al dueño (nunca el archivo). */
export async function enviarGaleria(
  perroId: string,
  mediaIds: string[]
): Promise<{ error: string | null; whatsapp?: string }> {
  if (mediaIds.length === 0) return { error: "Escoge al menos una foto o un video." };
  const supabase = await createSupabaseServerClient();
  const contacto = await contactoDelPerro(supabase, perroId);
  if (contacto.error || !contacto.telefono) return { error: contacto.error ?? "Falta el teléfono del dueño." };
  const negocio = await negocioActual();
  const { token, hash } = nuevoToken();
  const { error } = await supabase.rpc("galeria_crear", { p_perro_id: perroId, p_media_ids: mediaIds, p_hash: hash });
  if (error) return { error: traducirError(error) };
  const mensaje = mensajeGaleria({ dueno: contacto.dueno, perro: contacto.perro, negocio: negocio.nombre, url: urlGaleria(negocio, token) });
  return { error: null, whatsapp: enlaceWhatsApp(contacto.telefono, mensaje) };
}
