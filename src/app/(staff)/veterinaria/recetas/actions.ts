"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual, urlDelNegocio } from "@/lib/negocio/actual";
import { nuevoToken } from "@/lib/reporte/enlaces";
import { traducirError } from "../../reservas/traducir-error";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

// Recetas simples, espejo del SITPV, recetario especial y reporte mensual. Todo pasa por funciones
// de la base que comprueban el permiso (y que el emisor sea médico veterinario designado).

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const o = (v: string) => (v === "" ? null : v);
const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

// ── Receta simple ────────────────────────────────────────────────────

export async function emitirReceta(perroId: string, consultaId: string | null, fd: FormData): Promise<ResultadoAccion> {
  let lineas: unknown;
  try {
    lineas = JSON.parse(texto(fd, "lineas") || "[]");
  } catch {
    return { error: "No pudimos leer los medicamentos. Recarga la página e inténtalo de nuevo." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_receta_emitir", {
    p_perro: perroId,
    p_consulta: consultaId,
    p_lineas: lineas,
    p_diagnostico: o(texto(fd, "diagnostico")),
    p_observaciones: o(texto(fd, "observaciones")),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recetas");
  return { error: null, ir: `/veterinaria/recetas/${(data as { id: string }).id}` };
}

export async function anularReceta(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_receta_anular", { p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/recetas/${id}`);
  return { error: null, exito: "Receta anulada." };
}

export async function archivarReceta(id: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_receta_archivar", { p_id: id });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recetas");
  return { error: null, ir: "/veterinaria/recetas" };
}

/** Genera la liga del dueño (solo se guarda el sha256 del token) y el texto para mandarla por WhatsApp. */
export async function enviarReceta(id: string): Promise<{ error: string | null; url?: string }> {
  const supabase = await createSupabaseServerClient();
  const negocio = await negocioActual();
  const { token, hash } = nuevoToken();
  const { error } = await supabase.rpc("vet_receta_enlace", { p_id: id, p_token_hash: hash });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/recetas/${id}`);
  return { error: null, url: `${urlDelNegocio(negocio)}/rx/${token}` };
}

// ── Surtir contra un documento ───────────────────────────────────────

export async function surtirControlado(tipo: "receta" | "espejo" | "recetario", docId: string, fd: FormData): Promise<ResultadoAccion> {
  const lote = texto(fd, "lote_id");
  const cantidad = num(texto(fd, "cantidad"));
  if (!lote) return { error: "Elige el lote." };
  if (cantidad === null || !(cantidad > 0)) return { error: "Escribe la cantidad." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_surtir_controlado", {
    p_tipo: tipo,
    p_doc: docId,
    p_salidas: [{ lote_id: lote, cantidad }],
    p_perro: o(texto(fd, "perro_id")),
    p_consulta: null,
    p_motivo: o(texto(fd, "motivo")),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recetas", "layout");
  revalidatePath("/veterinaria/inventario", "layout");
  return { error: null, exito: "Salida registrada en el lote y en el libro de control." };
}

// ── Espejo del SITPV ─────────────────────────────────────────────────

export async function registrarEspejo(fd: FormData): Promise<ResultadoAccion> {
  const hospitalario = texto(fd, "uso") === "hospitalario";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_sitpv_registrar", {
    p_perro: o(texto(fd, "perro_id")),
    p_uso_hospitalario: hospitalario,
    p_insumo: texto(fd, "insumo_id"),
    p_registro_senasica: o(texto(fd, "registro_senasica")),
    p_lote: o(texto(fd, "lote_id")),
    p_presentacion: o(texto(fd, "presentacion")),
    p_dosis: o(texto(fd, "dosis")),
    p_intervalo: o(texto(fd, "intervalo")),
    p_duracion: o(texto(fd, "duracion")),
    p_cantidad_total: num(texto(fd, "cantidad_total")),
    p_parcialidades: texto(fd, "parcialidades") === "si",
    p_comprobante_compra: o(texto(fd, "comprobante_compra")),
    p_observaciones: o(texto(fd, "observaciones")),
    p_fecha: o(texto(fd, "fecha")),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recetas/sitpv");
  return { error: null, ir: `/veterinaria/recetas/sitpv/${(data as { id: string }).id}` };
}

export async function cancelarEspejo(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_sitpv_cancelar", { p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recetas/sitpv", "layout");
  return { error: null, exito: "Folio cancelado: saldrá en ceros en el reporte del mes." };
}

export async function archivarEspejo(id: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_sitpv_archivar", { p_id: id });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recetas/sitpv", "layout");
  return { error: null, ir: "/veterinaria/recetas/sitpv" };
}

// ── Recetario especial ───────────────────────────────────────────────

export async function registrarRecetario(fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_recetario_registrar", {
    p_perro: texto(fd, "perro_id"),
    p_insumo: texto(fd, "insumo_id"),
    p_folio: texto(fd, "folio"),
    p_codigo_barras: texto(fd, "codigo_barras"),
    p_fecha: o(texto(fd, "fecha")),
    p_dias: num(texto(fd, "dias")),
    p_cantidad_diaria: num(texto(fd, "cantidad_diaria")),
    p_indicaciones: o(texto(fd, "indicaciones")),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recetas/especial");
  return { error: null, ir: "/veterinaria/recetas/especial" };
}

export async function cancelarRecetario(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_recetario_cancelar", { p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recetas/especial");
  return { error: null, exito: "Recetario cancelado." };
}

export async function archivarRecetario(id: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_recetario_archivar", { p_id: id });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recetas/especial");
  return { error: null, exito: "Archivado." };
}

// ── Reporte mensual ──────────────────────────────────────────────────

export async function marcarReporte(medicoId: string, periodo: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_sitpv_reporte_marcar", { p_medico: medicoId, p_periodo: periodo, p_nota: o(texto(fd, "nota")) });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/recetas/sitpv", "layout");
  revalidatePath("/veterinaria");
  return { error: null, exito: "Marcado como reportado en el SITPV." };
}

// ── Producto y ajustes ───────────────────────────────────────────────

export async function guardarRegulatorioProducto(insumoId: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_producto_regulatorio_guardar", {
    p_insumo: insumoId,
    p_registro: o(texto(fd, "registro_senasica")),
    p_laboratorio: o(texto(fd, "laboratorio")),
    p_presentacion: o(texto(fd, "presentacion")),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/inventario/${insumoId}`);
  return { error: null, exito: "Datos del producto guardados." };
}

export async function guardarEspejoAntimicrobianos(fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_veterinaria_espejo_antimicrobianos", { p_activo: texto(fd, "espejo") === "si" });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/ajustes");
  return { error: null, exito: "Guardado." };
}
