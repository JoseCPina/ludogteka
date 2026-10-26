"use server";

import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { registrarTarifaMeta } from "@/lib/recordatorios/tarifa-meta";

/** La plataforma revisa la hoja de tarifas de Meta a mano (lo mismo que hace la tarea una vez al día). */
export async function revisarTarifaMeta(): Promise<{ error: string | null; exito?: string }> {
  await exigirPlataforma();
  try {
    const r = await registrarTarifaMeta();
    return { error: null, exito: r.startsWith("nuevo") ? `Precio nuevo guardado (${r.slice(7)}).` : `Sin cambio (${r.slice(11)}).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer la hoja de Meta." };
  }
}
