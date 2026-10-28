"use server";

import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { ConRegistros } from "@/lib/concurrencia/tipos";

// Todo con la sesión de la plataforma: la base vuelve a comprobar
// es_admin_plataforma en la función.
export async function guardarYoutube(fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: "Tu sesión de administración de PeluDesk terminó. Vuelve a entrar." };
  const numero = String(fd.get("numero") ?? "");
  let id = String(fd.get("youtube") ?? "").trim();
  // Se acepta el link completo (watch, youtu.be o embed) y se queda con el id.
  const m = id.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) id = m[1];
  const { error } = await s.supabase.rpc("plataforma_tutorial_youtube", { p_numero: numero, p_youtube_id: id });
  if (error) return { error: error.message.replace(/^.*?ERROR:\s*/, "") };
  revalidatePath("/plataforma/tutoriales");
  return {
    error: null,
    exito: id ? "Guardado: el video ya se ve con el reproductor de YouTube." : "Quitado: vuelve a verse el archivo propio.",
    // El tutorial se identifica por su número: va lo que quedó.
    registros: await registrosDe(s.supabase, [{ t: "tutoriales", i: numero, datos: { numero, youtube_id: id || null } }]),
  };
}
