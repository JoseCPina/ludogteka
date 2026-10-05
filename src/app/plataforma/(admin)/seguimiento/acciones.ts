"use server";

import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";
import { metaConfigurada, sincronizarPlantillas } from "@/lib/seguimiento/meta";

const NO_AUTORIZADO: ResultadoPlataforma = { error: "Solo la administración de PeluDesk." };

/** Pausa o reanuda TODO el envío del seguimiento de pruebas (con su sesión: la base lo comprueba y lo deja en la bitácora). */
export async function pausarSeguimiento(pausa: boolean): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const { error } = await s.supabase.rpc("plataforma_seguimiento_pausar", { p_pausa: pausa });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/seguimiento");
  return { error: null, exito: pausa ? "Seguimiento en pausa: no sale ningún mensaje." : "Seguimiento reanudado." };
}

/** Consulta a Meta el estado de las 4 plantillas y lo guarda; con `enviar`, manda a revisión las que Meta todavía no tiene. */
export async function revisarPlantillas(enviar: boolean): Promise<ResultadoPlataforma> {
  if (!(await sesionPlataforma())) return NO_AUTORIZADO;
  if (!metaConfigurada()) return { error: "Faltan WHATSAPP_TOKEN o PELUDESK_WABA_ID en las variables de Vercel." };
  try {
    const r = await sincronizarPlantillas({ enviarFaltantes: enviar });
    revalidatePath("/plataforma/seguimiento");
    return { error: null, exito: r.map((x) => `${x.nombre}: ${x.estado} (${x.accion})`).join(" · ") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No pudimos consultar a Meta." };
  }
}
