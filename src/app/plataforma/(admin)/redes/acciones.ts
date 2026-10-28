"use server";

import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { instanteDeHoraLocal } from "@/lib/formato";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { ConRegistros, RegistroFinal } from "@/lib/concurrencia/tipos";
import { filasDeLaSerie, filasDeUnVideo, type Red } from "@/lib/redes/serie";
import { correrPublicador } from "@/lib/redes/publicador";
import { conectarTikTok as canjearTikTok, urlAutorizarTikTok } from "@/lib/redes/tiktok";

// Todo con la sesión de la plataforma: la base vuelve a comprobar
// es_admin_plataforma en cada función. El publicador (secret key) solo corre
// después de comprobarla, y en segundo plano (after) para no dejar el botón
// esperando lo que tarde Meta.
const NO_AUTORIZADO: ResultadoPlataforma = { error: "Tu sesión de administración de PeluDesk terminó. Vuelve a entrar." };
const ZONA = "America/Mexico_City";

// Las publicaciones de esos videos como quedaron (una sola lectura: programar la serie toca muchas filas).
async function publicacionesDe(supabase: SupabaseClient, videos: string[]): Promise<RegistroFinal[]> {
  const { data } = await supabase
    .from("redes_publicaciones")
    .select("*")
    .in("video", [...new Set(videos)])
    .eq("prueba", false)
    .is("deleted_at", null);
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    t: "redes_publicaciones",
    i: f.id as string,
    version: (f.updated_at as string | null) ?? null,
    datos: f,
  }));
}

function publicarEnSegundoPlano() {
  after(async () => {
    try {
      await correrPublicador();
    } catch (e) {
      console.error("[redes] publicar ahora", e instanceof Error ? e.message : e);
    }
  });
}

export async function cargarSerie(): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const filas = filasDeLaSerie();
  const { data, error } = await s.supabase.rpc("plataforma_redes_programar", { p_filas: filas });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/redes");
  return {
    error: null,
    exito: Number(data) ? `Se agregaron ${data} publicaciones al calendario.` : "El calendario ya estaba completo (los pies se actualizaron).",
    registros: await publicacionesDe(s.supabase, filas.map((f) => f.video)),
  };
}

export async function agregarARed(video: string, red: Red | "todas"): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const filas = filasDeUnVideo(video, red);
  if (!filas.length) return { error: "Ese video no está en la serie." };
  // La base no duplica: solo agrega las redes que ese video todavía no tiene.
  const { data, error } = await s.supabase.rpc("plataforma_redes_programar", { p_filas: filas });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/redes");
  return {
    error: null,
    exito: Number(data) ? `Se agregó (${data}). Sale en su hora, o antes con «Publicar ahora».` : "Ya la tenía.",
    registros: await publicacionesDe(s.supabase, [video]),
  };
}

export async function reprogramar(id: string, fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const valor = String(fd.get("fecha") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return { error: "Escoge la fecha y la hora." };
  const { error } = await s.supabase.rpc("plataforma_redes_reprogramar", { p_id: id, p_fecha: instanteDeHoraLocal(valor, ZONA) });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/redes");
  return { error: null, exito: "Reprogramada.", registros: await registrosDe(s.supabase, [{ t: "redes_publicaciones", i: id }]) };
}

/** Mueve TODAS las redes de un video a la misma fecha y hora (Ciudad de México). */
export async function reprogramarVideo(video: string, fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const valor = String(fd.get("fecha") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return { error: "Escoge la fecha y la hora." };
  const { data, error } = await s.supabase.from("redes_publicaciones").select("id").eq("video", video).eq("prueba", false).is("deleted_at", null).in("estado", ["programada", "reintentar", "fallida"]);
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Ese video no tiene publicaciones por mover." };
  const cuando = instanteDeHoraLocal(valor, ZONA);
  for (const f of data) {
    const { error: e } = await s.supabase.rpc("plataforma_redes_reprogramar", { p_id: f.id, p_fecha: cuando });
    if (e) return { error: e.message };
  }
  revalidatePath("/plataforma/redes");
  return {
    error: null,
    exito: `Reprogramadas ${data.length} publicaciones a la misma hora.`,
    registros: await registrosDe(s.supabase, data.map((f) => ({ t: "redes_publicaciones", i: f.id as string }))),
  };
}

export async function publicarAhora(id: string): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const { error } = await s.supabase.rpc("plataforma_redes_publicar_ahora", { p_id: id });
  if (error) return { error: error.message };
  publicarEnSegundoPlano();
  revalidatePath("/plataforma/redes");
  return { error: null, exito: "Se está publicando. El aviso llega a Telegram; recarga en un par de minutos.", registros: await registrosDe(s.supabase, [{ t: "redes_publicaciones", i: id }]) };
}

export async function cancelar(id: string): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const { error } = await s.supabase.rpc("plataforma_redes_cancelar", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/redes");
  return { error: null, exito: "Cancelada.", registros: await registrosDe(s.supabase, [{ t: "redes_publicaciones", i: id }]) };
}

export async function resolver(id: string, salio: boolean, fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const url = String(fd.get("url") ?? "").trim();
  if (url && !/^https:\/\//.test(url)) return { error: "El enlace empieza con https://" };
  const { error } = await s.supabase.rpc("plataforma_redes_resolver", { p_id: id, p_salio: salio, p_url: url || null });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/redes");
  return { error: null, exito: salio ? "Anotada como publicada." : "Reprogramada para la siguiente corrida.", registros: await registrosDe(s.supabase, [{ t: "redes_publicaciones", i: id }]) };
}

export async function pausar(pausa: boolean): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const { error } = await s.supabase.rpc("plataforma_redes_pausar", { p_pausa: pausa });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/redes");
  return {
    error: null,
    exito: pausa ? "Pausado: no sale nada hasta que lo reanudes." : "Reanudado.",
    // El ajuste se identifica por su clave: va lo que quedó.
    registros: await registrosDe(s.supabase, [{ t: "redes_ajustes", i: "pausa", datos: { clave: "pausa", valor: pausa ? "si" : "no" } }]),
  };
}

export async function linkTikTok(): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const link = urlAutorizarTikTok(randomBytes(12).toString("hex"));
  if (!link) return { error: "Faltan TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET en Vercel." };
  return { error: null, link, etiquetaLink: "Ábrelo con la sesión de TikTok de PeluDesk, autoriza y copia el código que te enseña" };
}

export async function conectarTikTok(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const code = String(fd.get("code") ?? "").trim();
  if (!code) return { error: "Pega el código que te enseñó TikTok." };
  try {
    const { cuenta } = await canjearTikTok(code);
    revalidatePath("/plataforma/redes");
    return { error: null, exito: `TikTok conectado${cuenta ? ` (${cuenta})` : ""}.` };
  } catch (e) {
    return { error: `TikTok no aceptó el código: ${e instanceof Error ? e.message : "error"}. Los códigos caducan en minutos: pide uno nuevo.` };
  }
}

export async function probar(red: string): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  if (!["facebook", "instagram", "tiktok"].includes(red)) return { error: "Red desconocida." };
  const archivo = red === "facebook" ? "un-dia-en-tu-guarderia-16x9.mp4" : "un-dia-en-tu-guarderia-9x16-subtitulos.mp4";
  const { data, error } = await s.supabase.rpc("plataforma_redes_probar", { p_red: red, p_archivo: archivo });
  if (error) return { error: error.message };
  publicarEnSegundoPlano();
  revalidatePath("/plataforma/redes");
  return {
    error: null,
    exito: "Prueba en camino (privada o borrador). El resultado llega a Telegram y aquí.",
    registros: await registrosDe(s.supabase, [{ t: "redes_publicaciones", i: data as string | null }]),
  };
}
