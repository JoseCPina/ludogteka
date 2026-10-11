"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { armarBorrador, ErrorBorrador, type NombreDiagnostico } from "@/lib/dictado/borrador";
import { dictadoConfigurado, ErrorTranscripcion, transcribir } from "@/lib/dictado/scribe";
import { MAX_SEGUNDOS_DICTADO, MIMES_AUDIO, mimeBase, type EstadoDictado, type ResultadoDictado } from "@/lib/dictado/tipos";
import { traducirError } from "../../../reservas/traducir-error";

const BUCKET = "dictados-audio";
const MAX_BYTES = 25 * 1024 * 1024;
const mensajeDe = (error: { code?: string; message: string } | null) => (error ? traducirError(error) : "No pudimos guardar esto. Intenta de nuevo.");

/** El contador y las opciones del dictado para el panel de la consulta. */
export async function estadoDictado(): Promise<EstadoDictado & { configurado: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("vet_dictado_estado");
  const estado = (data as EstadoDictado | null) ?? { permitido: false };
  return { ...estado, configurado: dictadoConfigurado() };
}

/**
 * Paso 1: registra el dictado (permiso, aviso al dueño, minutos del mes) y da la URL firmada para subir
 * el audio DIRECTO a Storage (una función de Vercel no recibe más de 4.5 MB).
 */
export async function prepararDictado(
  consultaId: string,
  segundos: number,
  mime: string,
  avisoConfirmado: boolean
): Promise<{ error: string | null; dictadoId?: string; ruta?: string; urlFirmada?: string }> {
  const tipo = mimeBase(mime);
  const extension = MIMES_AUDIO[tipo];
  if (!extension) return { error: "Tu navegador grabó un formato de audio que no podemos leer. Prueba con Chrome o Safari actualizados." };
  const seg = Math.round(segundos);
  if (!(seg >= 1) || seg > MAX_SEGUNDOS_DICTADO) return { error: `Un dictado dura de 1 segundo a ${MAX_SEGUNDOS_DICTADO / 60} minutos.` };
  if (!dictadoConfigurado()) return { error: "El dictado todavía no está configurado en PeluDesk (falta la llave del servicio de voz). Avísale a PeluDesk." };
  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("vet_dictado_iniciar", { p_consulta: consultaId, p_segundos: seg, p_aviso: avisoConfirmado });
  if (error || !id) return { error: mensajeDe(error) };
  const negocio = await negocioActual();
  const ruta = `${negocio.id}/${consultaId}/${id as string}.${extension}`;
  const admin = createSupabaseAdminClient(negocio.id);
  const { data, error: errorFirma } = await admin.storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (errorFirma || !data) {
    await supabase.rpc("vet_dictado_error", { p_id: id, p_error: "No se pudo preparar la subida del audio." });
    return { error: "No pudimos preparar la subida del audio. Intenta de nuevo." };
  }
  return { error: null, dictadoId: id as string, ruta, urlFirmada: data.signedUrl };
}

/**
 * Paso 2: transcribe, arma el borrador SOAP y borra el audio (salvo que el negocio lo conserve 30 días).
 * La transcripción y el borrador se devuelven al navegador y NO se guardan en ninguna tabla.
 */
export async function transcribirDictado(dictadoId: string, consultaId: string, ruta: string): Promise<ResultadoDictado> {
  const negocio = await negocioActual();
  if (!ruta.startsWith(`${negocio.id}/${consultaId}/${dictadoId}.`)) return { error: "Ese audio no es de este dictado." };
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient(negocio.id);
  const borrarAudio = () => admin.storage.from(BUCKET).remove([ruta]);

  const { error: errorMarca } = await supabase.rpc("vet_dictado_marcar_transcribiendo", { p_id: dictadoId });
  if (errorMarca) {
    await borrarAudio();
    return { error: mensajeDe(errorMarca) };
  }
  const fallar = async (mensaje: string): Promise<ResultadoDictado> => {
    await supabase.rpc("vet_dictado_error", { p_id: dictadoId, p_error: mensaje });
    await borrarAudio();
    return { error: mensaje };
  };

  const { data: archivo, error: errorDescarga } = await admin.storage.from(BUCKET).download(ruta);
  if (errorDescarga || !archivo) return fallar("El audio no llegó completo. Graba de nuevo.");
  if (archivo.size > MAX_BYTES || archivo.size < 200) return fallar("El audio está vacío o es demasiado grande. Graba de nuevo.");
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const mime = mimeBase(archivo.type || "audio/webm");

  let transcripcion;
  try {
    transcripcion = await transcribir(bytes, ruta.slice(ruta.lastIndexOf("/") + 1), mime);
  } catch (e) {
    return fallar(e instanceof ErrorTranscripcion ? e.message : "No pudimos transcribir el audio. Intenta de nuevo.");
  }
  if (!transcripcion.texto) return fallar("No se escuchó nada en el audio. Revisa el micrófono y graba de nuevo.");

  // Mascota y catálogo para el borrador.
  const { data: detalle } = await supabase.rpc("vet_consulta_detalle", { p_id: consultaId });
  const mascota = (detalle as { mascota?: { nombre: string; especie: string | null } } | null)?.mascota ?? { nombre: "la mascota", especie: null };
  const { data: catalogoCrudo } = await supabase.rpc("vet_diagnosticos_nombres", { p_especie: mascota.especie === "perro" || mascota.especie === "gato" ? mascota.especie : null });
  const catalogo = (catalogoCrudo ?? []) as NombreDiagnostico[];

  const { data: estadoAntes } = await supabase.rpc("vet_dictado_estado");
  const conservar = Boolean((estadoAntes as EstadoDictado | null)?.conservar_audio);

  let borrador;
  let ia = "";
  let errorBorrador: string | null = null;
  try {
    const r = await armarBorrador({ transcripcion: transcripcion.texto, mascota, catalogo });
    borrador = r.borrador;
    ia = r.modelo;
  } catch (e) {
    errorBorrador = e instanceof ErrorBorrador ? e.message : "No pudimos armar el borrador con IA.";
  }

  // La transcripción ya costó: se cobran los minutos aunque la IA no haya podido armar el borrador.
  const { data: minutos, error: errorListo } = await supabase.rpc("vet_dictado_listo", {
    p_id: dictadoId,
    p_segundos: transcripcion.segundos || null,
    p_caracteres: transcripcion.texto.length,
    p_stt: "elevenlabs",
    p_stt_modelo: transcripcion.modelo,
    p_ia: ia || null,
    p_audio_path: conservar ? ruta : null,
  });
  if (!conservar) await borrarAudio();
  if (errorListo) return { error: mensajeDe(errorListo), transcripcion: transcripcion.texto };

  const { data: estadoDespues } = await supabase.rpc("vet_dictado_estado");
  const e = (estadoDespues as EstadoDictado | null) ?? { permitido: true };
  return { error: errorBorrador, transcripcion: transcripcion.texto, borrador, minutos: minutos as number, usados: e.usados, tope: e.tope };
}

/** Escuchar un dictado que el negocio decidió conservar (30 días). */
export async function urlAudioGuardado(dictadoId: string): Promise<{ error: string | null; url?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: ruta, error } = await supabase.rpc("vet_dictado_audio_ruta", { p_id: dictadoId });
  if (error || !ruta) return { error: mensajeDe(error) };
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(ruta as string, 120);
  return data?.signedUrl ? { error: null, url: data.signedUrl } : { error: "No pudimos abrir el audio." };
}
