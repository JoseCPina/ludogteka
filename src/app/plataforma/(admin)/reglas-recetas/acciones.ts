"use server";

import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { esErrorSoloLectura, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";

// Reglas regulatorias de recetas y controlados de Veterinaria. Solo la administración de PeluDesk las
// escribe, por funciones de la base que comprueban es_admin_plataforma() y dejan el antes y el
// después en plataforma_eventos.

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const entero = (v: string) => (v === "" ? null : Number(v));
const NO_AUTORIZADO: ResultadoPlataforma = { error: "Tu sesión de administración de PeluDesk terminó. Vuelve a entrar." };

function traducir(error: { code?: string; message: string }): string {
  if (esErrorSoloLectura(error)) return MENSAJE_SOLO_LECTURA;
  if (error.code === "42501") return "Esto solo lo hace la administración de PeluDesk.";
  if (error.code === "P0001") return error.message;
  return "No pudimos guardar esto. Intenta de nuevo.";
}

export async function guardarRegla(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const clave = texto(fd, "clave");
  const esLeyenda = clave.startsWith("leyenda_") || clave === "sitpv_url";
  const crudo = texto(fd, "valor");
  if (!clave || crudo === "") return { error: "Escribe el valor." };
  const valor = esLeyenda ? crudo : Number(crudo);
  if (!esLeyenda && !Number.isFinite(valor)) return { error: "Escribe un número." };
  const { error } = await s.supabase.rpc("plataforma_vet_regla_guardar", { p_clave: clave, p_valor: valor });
  if (error) return { error: traducir(error) };
  revalidatePath("/plataforma/reglas-recetas");
  return { error: null, exito: "Regla guardada. Los negocios la usan desde la siguiente receta." };
}

export async function guardarClasificacion(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const { error } = await s.supabase.rpc("plataforma_vet_clasificacion_guardar", {
    p_clave: texto(fd, "clave"),
    p_documento: texto(fd, "documento"),
    p_surtidos_max: entero(texto(fd, "surtidos_max")),
    p_ventana_meses: entero(texto(fd, "ventana_meses")),
    p_retencion_meses: entero(texto(fd, "retencion_meses")),
    p_libro_control: fd.get("libro_control") === "on",
    p_nota: texto(fd, "nota") || null,
  });
  if (error) return { error: traducir(error) };
  revalidatePath("/plataforma/reglas-recetas");
  return { error: null, exito: "Clasificación guardada." };
}
