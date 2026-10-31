"use server";

import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";
import { mandarAAprobar, metaPlantillasConfigurada, plantillaPorNombre, sincronizarPlantillas } from "@/lib/whatsapp/plantillas";

const NO_AUTORIZADO: ResultadoPlataforma = { error: "Solo la administración de PeluDesk." };
const RUTA = "/plataforma/plantillas-whatsapp";

/** Manda a revisión UNA plantilla del catálogo (corre en Vercel, con las variables de ahí). */
export async function mandarPlantilla(nombre: string): Promise<ResultadoPlataforma> { // registro-final: la plataforma recarga la lista con revalidatePath
  if (!(await sesionPlataforma())) return NO_AUTORIZADO;
  const p = plantillaPorNombre(nombre);
  if (!p) return { error: "Esa plantilla no está en el catálogo del código." };
  if (!metaPlantillasConfigurada()) return { error: "Faltan WHATSAPP_TOKEN o PELUDESK_WABA_ID en las variables de Vercel." };
  const r = await mandarAAprobar(p);
  if (!r.ok) return { error: `Meta no la aceptó: ${r.error}` };
  revalidatePath(RUTA);
  return { error: null, exito: `${p.nombre}: enviada a revisión (${r.estado}, ${r.categoria}). Meta suele contestar en minutos; recarga para ver el estado.` };
}

/** Consulta Meta y, si se pide, manda las que falten; guarda la revisión para la pantalla. */
export async function revisarPlantillas(enviarFaltantes: boolean): Promise<ResultadoPlataforma> { // registro-final: la plataforma recarga la lista con revalidatePath
  if (!(await sesionPlataforma())) return NO_AUTORIZADO;
  if (!metaPlantillasConfigurada()) return { error: "Faltan WHATSAPP_TOKEN o PELUDESK_WABA_ID en las variables de Vercel." };
  try {
    const r = await sincronizarPlantillas({ enviarFaltantes });
    revalidatePath(RUTA);
    const enviadas = r.filas.filter((f) => f.accion === "enviada a revisión").map((f) => f.nombre);
    const fallidas = r.filas.filter((f) => f.accion === "Meta la rechazó al crearla").map((f) => `${f.nombre} (${f.motivo})`);
    const faltan = r.filas.filter((f) => f.estado === "NO_EXISTE").length;
    const partes = [enviadas.length ? `Enviadas a revisión: ${enviadas.join(", ")}.` : null, fallidas.length ? `Meta no aceptó: ${fallidas.join("; ")}.` : null, !enviarFaltantes && faltan ? `Faltan ${faltan} por mandar.` : null, "Estado actualizado."];
    return { error: null, exito: partes.filter(Boolean).join(" ") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No pudimos consultar a Meta." };
  }
}
