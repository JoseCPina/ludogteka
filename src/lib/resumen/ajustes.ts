import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULTS, SECCIONES, type Seccion } from "./config";

export type Ajustes = { pausa: boolean; hora: number; secciones: Seccion[]; umbralGasto: number; umbralHoras: number };

const TODAS = SECCIONES.map((s) => s.clave) as Seccion[];

export function interpretarAjustes(filas: { clave: string; valor: string }[]): Ajustes {
  const v = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  const num = (k: string, d: number, min: number, max: number) => {
    const n = Number(v[k]);
    return Number.isFinite(n) && n >= min && n <= max ? n : d;
  };
  const secciones = v.secciones === undefined ? TODAS : (v.secciones.split(",").map((s) => s.trim()).filter((s): s is Seccion => (TODAS as string[]).includes(s)) as Seccion[]);
  return { pausa: v.pausa === "si", hora: Math.floor(num("hora", DEFAULTS.hora, 0, 23)), secciones, umbralGasto: num("umbral_gasto", DEFAULTS.umbral_gasto, 0, 100000), umbralHoras: num("umbral_horas", DEFAULTS.umbral_horas, 0.25, 72) };
}

export async function leerAjustes(): Promise<Ajustes> {
  const { data } = await createSupabaseAdminClient().from("resumen_ajustes").select("clave, valor").is("deleted_at", null);
  return interpretarAjustes((data ?? []) as { clave: string; valor: string }[]);
}
