"use server";

import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { esErrorSoloLectura, mensajeSoloLectura } from "@/lib/solo-lectura";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { ConRegistros } from "@/lib/concurrencia/tipos";

// Catálogo compartido de diagnósticos de Veterinaria. Solo la administración de PeluDesk lo escribe,
// por funciones de la base que comprueban es_admin_plataforma() y dejan el cambio en plataforma_eventos.

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const NO_AUTORIZADO: ResultadoPlataforma = { error: "Tu sesión de administración de PeluDesk terminó. Vuelve a entrar." };

function traducir(error: { code?: string; message: string }): string {
  if (esErrorSoloLectura(error)) return mensajeSoloLectura(error);
  if (error.code === "42501") return "Esto solo lo hace la administración de PeluDesk.";
  if (error.code === "P0001") return error.message;
  return "No pudimos guardar esto. Intenta de nuevo.";
}

export async function guardarDiagnostico(fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const nombre = texto(fd, "nombre");
  const categoria = texto(fd, "categoria");
  if (!nombre || !categoria) return { error: "Escribe el nombre y la categoría del diagnóstico." };
  const especies = ["perro", "gato"].filter((e) => fd.get(`especie_${e}`) === "on");
  const sinonimos = texto(fd, "sinonimos").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  const id = texto(fd, "id");
  const { data, error } = await s.supabase.rpc("plataforma_guardar_diagnostico", {
    p_id: id || null, p_nombre: nombre, p_categoria: categoria, p_especies: especies.length ? especies : ["perro", "gato"], p_sinonimos: sinonimos,
  });
  if (error) return { error: traducir(error) };
  revalidatePath("/plataforma/diagnosticos");
  return {
    error: null,
    exito: id ? "Diagnóstico guardado." : "Diagnóstico agregado. Los negocios lo ven al momento.",
    registros: await registrosDe(s.supabase, [{ t: "vet_diagnosticos", i: (data as string | null) ?? id }]),
  };
}

export async function bajaDiagnostico(fd: FormData): Promise<ResultadoPlataforma & ConRegistros> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO_AUTORIZADO.error };
  const id = texto(fd, "id");
  if (!id) return { error: "Falta el diagnóstico." };
  const { error } = await s.supabase.rpc("plataforma_baja_diagnostico", { p_id: id });
  if (error) return { error: traducir(error) };
  revalidatePath("/plataforma/diagnosticos");
  return {
    error: null,
    exito: "Diagnóstico dado de baja. Las consultas que ya lo usan conservan su nombre.",
    registros: await registrosDe(s.supabase, [{ t: "vet_diagnosticos", i: id, datos: { id, deleted_at: new Date().toISOString() } }]),
  };
}
