"use server";

import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { esErrorSoloLectura, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";

// Catálogo compartido de principios activos. Solo la administración de
// PeluDesk lo escribe, por funciones de la base que comprueban
// es_admin_plataforma() y dejan el cambio en plataforma_eventos.

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const NO_AUTORIZADO: ResultadoPlataforma = { error: "Tu sesión de administración de PeluDesk terminó. Vuelve a entrar." };

function traducir(error: { code?: string; message: string }): string {
  if (esErrorSoloLectura(error)) return MENSAJE_SOLO_LECTURA;
  if (error.code === "42501") return "Esto solo lo hace la administración de PeluDesk.";
  if (error.code === "P0001") return error.message;
  return "No pudimos guardar esto. Intenta de nuevo.";
}

export async function guardarPrincipioActivo(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "Escribe el nombre del principio activo." };
  const id = texto(fd, "id");
  const { error } = await s.supabase.rpc("plataforma_guardar_principio_activo", {
    p_id: id || null,
    p_nombre: nombre,
    p_grupo_senasica: texto(fd, "grupo_senasica") || null,
    p_clasificacion_lgs: texto(fd, "clasificacion_lgs") || null,
    p_es_antimicrobiano: fd.get("es_antimicrobiano") === "on",
    p_por_confirmar: fd.get("por_confirmar") === "on",
    p_nota: texto(fd, "nota") || null,
  });
  if (error) return { error: traducir(error) };
  revalidatePath("/plataforma/principios-activos");
  return { error: null, exito: id ? "Principio activo guardado." : "Principio activo agregado. Los negocios lo ven al momento." };
}

export async function bajaPrincipioActivo(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const id = texto(fd, "id");
  if (!id) return { error: "Falta el principio activo." };
  const { error } = await s.supabase.rpc("plataforma_baja_principio_activo", { p_id: id });
  if (error) return { error: traducir(error) };
  revalidatePath("/plataforma/principios-activos");
  return { error: null, exito: "Principio activo dado de baja. Los productos que ya lo usan conservan sus clasificaciones." };
}
