"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

// Inventario clínico. Todo va con la sesión de quien lo hace: la base
// comprueba «Administrar lotes e inventario clínico» en cada función.

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const numero = (fd: FormData, k: string) => {
  const v = texto(fd, k).replace(",", ".");
  return v === "" ? NaN : Number(v);
};

function refrescar(insumoId?: string) {
  revalidatePath("/veterinaria");
  revalidatePath("/veterinaria/inventario");
  if (insumoId) revalidatePath(`/veterinaria/inventario/${insumoId}`);
  revalidatePath("/inventario");
}

export async function guardarProductoClinico(fd: FormData): Promise<ResultadoAccion> {
  const id = texto(fd, "id");
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "Escribe el nombre del producto." };
  if (!id && (!texto(fd, "area_id") || !texto(fd, "unidad_compra_id") || !texto(fd, "unidad_consumo_id"))) {
    return { error: "Elige el área y las unidades de compra y de consumo." };
  }
  const supabase = await createSupabaseServerClient();
  // El mínimo se captura en la unidad de consumo y la base lo guarda en su unidad base.
  let unidadConsumoId = texto(fd, "unidad_consumo_id");
  if (id) {
    const { data: actual } = await supabase.from("insumos").select("unidad_consumo_id").eq("id", id).maybeSingle();
    unidadConsumoId = (actual?.unidad_consumo_id as string | undefined) ?? "";
  }
  let equivalencia = 1;
  if (unidadConsumoId) {
    const { data: u } = await supabase.from("unidades_medida").select("equivalencia_en_base").eq("id", unidadConsumoId).maybeSingle();
    if (!u) return { error: "No pudimos leer la unidad de consumo elegida." };
    equivalencia = Number(u.equivalencia_en_base);
  }
  const minimoConsumo = numero(fd, "stock_minimo");
  if (Number.isFinite(minimoConsumo) && minimoConsumo < 0) return { error: "El stock mínimo no puede ser negativo." };
  const { data, error } = await supabase.rpc("guardar_producto_clinico", {
    p_id: id || null,
    p_nombre: nombre,
    p_area_id: texto(fd, "area_id") || null,
    p_unidad_compra_id: texto(fd, "unidad_compra_id") || null,
    p_unidad_consumo_id: unidadConsumoId || null,
    p_stock_minimo: Number.isFinite(minimoConsumo) ? minimoConsumo * equivalencia : 0,
    p_dias_aviso_caducidad: Number.isFinite(numero(fd, "dias_aviso_caducidad")) ? numero(fd, "dias_aviso_caducidad") : 30,
    p_principio_activo_id: texto(fd, "principio_activo_id") || null,
    p_grupo_senasica: texto(fd, "grupo_senasica") || null,
    p_clasificacion_lgs: texto(fd, "clasificacion_lgs") || null,
    p_es_antimicrobiano: fd.get("es_antimicrobiano") === "on",
    p_clasificacion_por_confirmar: fd.get("clasificacion_por_confirmar") === "on",
  });
  if (error) return { error: traducirError(error) };
  refrescar(data as string);
  return id ? { error: null, exito: "Producto guardado." } : { error: null, ir: `/veterinaria/inventario/${data as string}` };
}

export async function activarLotesDeInsumo(fd: FormData): Promise<ResultadoAccion> {
  const insumoId = texto(fd, "insumo_id");
  if (!insumoId) return { error: "Elige el producto que quieres pasar a lotes." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("activar_lotes_insumo", { p_insumo_id: insumoId });
  if (error) return { error: traducirError(error) };
  refrescar(insumoId);
  // Para completar sus clasificaciones se abre su ficha.
  return { error: null, ir: `/veterinaria/inventario/${insumoId}` };
}

export async function registrarEntradaLote(insumoId: string, fd: FormData): Promise<ResultadoAccion> {
  const codigo = texto(fd, "codigo");
  const cantidad = numero(fd, "cantidad");
  if (!codigo) return { error: "Escribe el código de lote que viene en la caja." };
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: "La cantidad debe ser mayor a cero." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_lote_entrada", {
    p_insumo_id: insumoId,
    p_codigo: codigo,
    p_caducidad: texto(fd, "caducidad") || null,
    p_cantidad_compra: cantidad,
    p_proveedor: texto(fd, "proveedor") || null,
    p_notas: texto(fd, "notas") || null,
  });
  if (error) return { error: traducirError(error) };
  refrescar(insumoId);
  return { error: null, exito: "Entrada registrada." };
}

export async function registrarSalidaLote(insumoId: string, loteId: string, tipo: "surtido" | "merma" | "caducado", fd: FormData): Promise<ResultadoAccion> {
  const cantidad = numero(fd, "cantidad");
  const motivo = texto(fd, "motivo");
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: "La cantidad debe ser mayor a cero." };
  if (tipo !== "surtido" && !motivo) return { error: "Escribe el motivo." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_lote_salida", {
    p_lote_id: loteId,
    p_cantidad_consumo: cantidad,
    p_tipo: tipo,
    p_motivo: motivo || null,
    p_folio_receta: tipo === "surtido" ? texto(fd, "folio_receta") || null : null,
  });
  if (error) return { error: traducirError(error) };
  refrescar(insumoId);
  const aviso = (data as { aviso?: string | null } | null)?.aviso;
  const base = tipo === "surtido" ? "Surtido registrado." : tipo === "merma" ? "Merma registrada." : "Salida por caducidad registrada.";
  return { error: null, exito: aviso ? `${base} ${aviso}` : base };
}

export async function registrarAjusteLote(insumoId: string, loteId: string, fd: FormData): Promise<ResultadoAccion> {
  const cantidad = numero(fd, "cantidad");
  const motivo = texto(fd, "motivo");
  const sentido = texto(fd, "sentido") === "negativo" ? "negativo" : "positivo";
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: "La cantidad debe ser mayor a cero." };
  if (!motivo) return { error: "Escribe el motivo del ajuste." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_lote_ajuste", {
    p_lote_id: loteId,
    p_cantidad_consumo: cantidad,
    p_sentido: sentido,
    p_motivo: motivo,
  });
  if (error) return { error: traducirError(error) };
  refrescar(insumoId);
  return { error: null, exito: "Ajuste registrado." };
}
