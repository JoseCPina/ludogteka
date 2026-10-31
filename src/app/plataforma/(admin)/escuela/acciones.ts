"use server";

import { revalidatePath } from "next/cache";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { instanteDeHoraLocal } from "@/lib/formato";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";
import { sesionPorClave } from "@/lib/escuela/sesiones";

const ZONA = "America/Mexico_City";

/** Guarda fecha, duración, liga en vivo y grabación de una sesión (la base exige es_admin_plataforma). */
export async function guardarSesion(clave: string, fd: FormData): Promise<ResultadoPlataforma> { // registro-final: la plataforma recarga la lista con revalidatePath
  if (!sesionPorClave(clave)) return { error: "Sesión desconocida." };
  const { supabase } = await exigirPlataforma();
  const fecha = String(fd.get("fecha") ?? "").trim();
  const url = String(fd.get("url_en_vivo") ?? "").trim();
  const yt = String(fd.get("youtube_id") ?? "").trim();
  if (url && !/^https:\/\//.test(url)) return { error: "La liga en vivo tiene que empezar con https://." };
  if (yt && !/^[A-Za-z0-9_-]{6,20}$/.test(yt)) return { error: "El id de YouTube no se ve bien (son las letras y números después de v=)." };
  const duracion = Math.min(240, Math.max(15, Number(fd.get("duracion")) || 60));
  const { error } = await supabase.from("escuela_sesiones").update({ fecha_at: fecha ? instanteDeHoraLocal(fecha, ZONA) : null, duracion_min: duracion, url_en_vivo: url || null, youtube_id: yt || null }).eq("clave", clave);
  if (error) return { error: error.message };
  revalidatePath("/plataforma/escuela");
  return { error: null, exito: "Sesión guardada" };
}
