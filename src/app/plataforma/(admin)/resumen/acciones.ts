"use server";

import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";
import { correrResumen } from "@/lib/resumen/correr";
import { SECCIONES } from "@/lib/resumen/config";

// Todo con la sesión de la plataforma: la base vuelve a comprobar
// es_admin_plataforma en la función de ajustes; el resumen (secret key) solo
// corre después de comprobarla.
const NO_AUTORIZADO: ResultadoPlataforma = { error: "Tu sesión de administración de PeluDesk terminó. Vuelve a entrar." };

export async function guardarAjustes(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const hora = Number(fd.get("hora"));
  const gasto = Number(fd.get("umbral_gasto"));
  const horas = Number(fd.get("umbral_horas"));
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) return { error: "La hora va de 0 a 23." };
  if (!Number.isFinite(gasto) || gasto < 0) return { error: "El umbral de gasto no puede ser negativo." };
  if (!Number.isFinite(horas) || horas < 0.25) return { error: "El tiempo sin contestar es de al menos 15 minutos (0.25 h)." };
  const validas = new Set<string>(SECCIONES.map((x) => x.clave));
  const secciones = fd.getAll("seccion").map(String).filter((x) => validas.has(x));
  const { error } = await s.supabase.rpc("plataforma_resumen_ajustes", { p_valores: { hora: String(hora), umbral_gasto: String(gasto), umbral_horas: String(horas), secciones: secciones.join(",") } });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/resumen");
  return { error: null, exito: "Guardado." };
}

export async function pausarResumen(pausa: boolean): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const { error } = await s.supabase.rpc("plataforma_resumen_ajustes", { p_valores: { pausa: pausa ? "si" : "no" } });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/resumen");
  return { error: null, exito: pausa ? "Pausado: el resumen automático no sale hasta que lo reanudes." : "Reanudado." };
}

export async function enviarAhora(): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  try {
    const r = await correrResumen({ origen: "manual" });
    revalidatePath("/plataforma/resumen");
    if (r.estado === "enviado") return { error: null, exito: `Enviado a Telegram (${r.partes} ${r.partes === 1 ? "mensaje" : "mensajes"}).${r.fuentesFallidas?.length ? ` No se pudo leer: ${r.fuentesFallidas.join(", ")}.` : ""}` };
    if (r.estado === "ya_enviado") return { error: "Ese resumen se está enviando en este momento. Espera un minuto y revisa la lista." };
    return { error: r.error ?? "No se pudo enviar." };
  } catch (e) {
    console.error("[resumen] enviar ahora", e instanceof Error ? e.message : e);
    return { error: "No se pudo enviar el resumen. Revisa los registros de Vercel." };
  }
}
