"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { usaVeterinaria } from "@/lib/plan/modulos";
import { validarFila, type DatosFila, type FilaCruda } from "@/lib/importador/validar";

// Cada acción vuelve a comprobar el permiso (la base también): la pantalla solo
// esconde el botón. Nada de aquí crea una llave de servidor: todo corre con la
// sesión de quien importa, así que las reglas y políticas de siempre aplican.

export type Modo = "omitir" | "actualizar";

export type Progreso = {
  id: string;
  estado: "preparada" | "procesando" | "completada" | "deshecha" | "cancelada";
  total: number;
  filas: number;
  pendientes: number;
  creadas: number;
  actualizadas: number;
  omitidas: number;
  errores: number;
  deshechas: number;
  clientes_creados: number;
  mascotas_creadas: number;
  modo: Modo;
  con_clinicos: boolean;
  nombre_archivo: string;
  creada_at: string;
  terminada_at: string | null;
  deshecha_at: string | null;
  razas_sin_catalogo: { texto: string; cuenta: number }[];
};

type Fallo = { error: string };

async function contexto(): Promise<{ ok: false; error: string } | { ok: true; conClinicos: boolean }> {
  const sesion = await obtenerSesionConRol();
  if (!sesion || !tienePermiso(sesion, "importar_datos")) {
    return { ok: false, error: "Necesitas el permiso «Importar clientes y mascotas»." };
  }
  const conClinicos = usaVeterinaria(sesion.modulos) && tienePermiso(sesion, "editar_ficha_clinica");
  return { ok: true, conClinicos };
}

function mensaje(e: { message?: string; code?: string } | null): string {
  if (!e) return "No se pudo completar. Intenta de nuevo.";
  if (e.code === "42501" || /solo lectura/i.test(e.message ?? "")) return e.message ?? "No tienes permiso para esto.";
  // Las funciones de la base hablan en español y dicen qué falta.
  if (e.message && /[a-záéíóú]{4,} /i.test(e.message) && !/^(function|relation|column|syntax)/i.test(e.message)) return e.message;
  return "No se pudo completar. Intenta de nuevo.";
}

export type FilaRevisada = {
  n: number;
  error: string | null;
  avisos: string[];
  datos: DatosFila | null;
  cliente: "nuevo" | "existente" | null;
  clienteNombre: string | null;
  mascota: "ninguna" | "nueva" | "existente" | "de_otro";
  mascotaPor: "microchip" | "nombre" | null;
  raza: "catalogo" | "ambigua" | "sin_coincidencia" | "vacia";
  razaNombre: string | null;
  // Los pone la pantalla al mirar TODO el archivo: el mismo dueño o la misma mascota en dos filas.
  repetidoCliente?: number | null;
  repetidaMascota?: number | null;
};

/** Vista previa: valida cada fila y la cruza con lo que ya hay en el negocio. */
export async function revisarFilas(
  filas: { n: number; valores: FilaCruda }[]
): Promise<Fallo | { error: null; filas: FilaRevisada[]; conClinicos: boolean }> {
  const ctx = await contexto();
  if (!ctx.ok) return { error: ctx.error };
  if (filas.length === 0 || filas.length > 1000) return { error: "La vista previa llega en bloques de hasta 1,000 filas." };

  const validadas = filas.map((f) => ({ n: f.n, ...validarFila(f.valores, ctx.conClinicos) }));
  const paraCruzar = validadas
    .filter((v) => v.datos)
    .map((v) => ({
      n: v.n,
      telefono: v.datos!.c_telefono,
      mascota: v.datos!.m_nombre ?? "",
      microchip: v.datos!.m_microchip ?? "",
      especie: v.datos!.m_especie ?? "perro",
      raza: v.datos!.m_raza ?? "",
      tamano: v.datos!.m_tamano ?? "",
      pelaje: v.datos!.m_pelaje ?? "",
    }));

  const cruce = new Map<number, Record<string, unknown>>();
  if (paraCruzar.length > 0) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("importacion_revisar", { p_filas: paraCruzar });
    if (error) return { error: mensaje(error) };
    for (const r of (data ?? []) as Record<string, unknown>[]) cruce.set(Number(r.n), r);
  }

  const salida: FilaRevisada[] = validadas.map((v) => {
    const c = cruce.get(v.n);
    const traeMascota = Boolean(v.datos?.m_nombre);
    // La misma regla que valida al procesar: una mascota NUEVA sin lo obligatorio del negocio no se importa.
    const faltantes = Array.isArray(c?.faltantes) ? (c.faltantes as string[]) : [];
    const errorFaltantes =
      !v.error && traeMascota && faltantes.length > 0
        ? `A la mascota «${v.datos?.m_nombre}» le falta: ${faltantes.join(", ")}. Complétalo en el archivo (en «raza» puedes poner «Mestizo»).`
        : null;
    return {
      n: v.n,
      error: v.error ?? errorFaltantes,
      avisos: v.avisos,
      datos: v.datos,
      cliente: !v.datos ? null : c?.cliente_id ? "existente" : "nuevo",
      clienteNombre: (c?.cliente_nombre as string | null) ?? null,
      mascota: !traeMascota ? "ninguna" : c?.perro_de_otro ? "de_otro" : c?.perro_id ? "existente" : "nueva",
      mascotaPor: (c?.perro_por as "microchip" | "nombre" | null) ?? null,
      raza: ((c?.raza_estado as FilaRevisada["raza"]) ?? "vacia"),
      razaNombre: (c?.raza_nombre as string | null) ?? null,
    };
  });
  return { error: null, filas: salida, conClinicos: ctx.conClinicos };
}

export async function crearImportacion(args: {
  nombreArchivo: string;
  huella: string;
  modo: Modo;
  mapeo: Record<string, string>;
  total: number;
}): Promise<Fallo | { error: null; id: string; reusada: boolean; estado: string; fecha: string | null; conClinicos: boolean }> {
  const ctx = await contexto();
  if (!ctx.ok) return { error: ctx.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("importacion_crear", {
    p_nombre_archivo: args.nombreArchivo,
    p_huella: args.huella,
    p_modo: args.modo,
    p_con_clinicos: ctx.conClinicos,
    p_mapeo: args.mapeo,
    p_total: args.total,
  });
  if (error) return { error: mensaje(error) };
  const r = data as { id: string; estado: string; reusada: boolean; fecha?: string; con_clinicos?: boolean };
  return { error: null, id: r.id, reusada: r.reusada, estado: r.estado, fecha: r.fecha ?? null, conClinicos: ctx.conClinicos };
}

/** Sube un bloque de filas (reenviarlo no duplica: la base ignora el número ya subido). */
export async function agregarFilas(
  id: string,
  filas: { n: number; valores: FilaCruda }[]
): Promise<Fallo | { error: null; agregadas: number }> {
  const ctx = await contexto();
  if (!ctx.ok) return { error: ctx.error };
  if (filas.length === 0 || filas.length > 1000) return { error: "Las filas llegan en bloques de hasta 1,000." };
  const paquete = filas.map((f) => {
    const v = validarFila(f.valores, ctx.conClinicos);
    return {
      n: f.n,
      datos: v.datos ?? f.valores,
      error: v.error ?? undefined,
    };
  });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("importacion_agregar_filas", { p_id: id, p_filas: paquete });
  if (error) return { error: mensaje(error) };
  return { error: null, agregadas: Number(data ?? 0) };
}

export async function procesarLote(id: string): Promise<Fallo | { error: null; progreso: Progreso }> {
  const ctx = await contexto();
  if (!ctx.ok) return { error: ctx.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("importacion_procesar_lote", { p_id: id, p_max: 40 });
  if (error) return { error: mensaje(error) };
  return { error: null, progreso: data as Progreso };
}

export async function obtenerProgreso(id: string): Promise<Fallo | { error: null; progreso: Progreso }> {
  const ctx = await contexto();
  if (!ctx.ok) return { error: ctx.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("importacion_progreso", { p_id: id });
  if (error) return { error: mensaje(error) };
  return { error: null, progreso: data as Progreso };
}

export async function cancelarImportacion(id: string): Promise<Fallo | { error: null; progreso: Progreso }> {
  const ctx = await contexto();
  if (!ctx.ok) return { error: ctx.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("importacion_cancelar", { p_id: id });
  if (error) return { error: mensaje(error) };
  revalidatePath("/admin/importar");
  return { error: null, progreso: data as Progreso };
}

export async function revisarDeshacer(
  id: string
): Promise<Fallo | { error: null; puede: boolean; bloqueos: { tipo?: string; nombre?: string; motivo: string; cuenta?: number }[] }> {
  const ctx = await contexto();
  if (!ctx.ok) return { error: ctx.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("importacion_deshacer_revisar", { p_id: id });
  if (error) return { error: mensaje(error) };
  const r = data as { puede: boolean; bloqueos: { tipo?: string; nombre?: string; motivo: string; cuenta?: number }[] };
  return { error: null, puede: r.puede, bloqueos: r.bloqueos ?? [] };
}

export async function deshacerImportacion(id: string): Promise<Fallo | { error: null; progreso: Progreso }> {
  const ctx = await contexto();
  if (!ctx.ok) return { error: ctx.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("importacion_deshacer", { p_id: id });
  if (error) return { error: mensaje(error) };
  revalidatePath("/admin/importar");
  revalidatePath("/clientes");
  return { error: null, progreso: data as Progreso };
}
