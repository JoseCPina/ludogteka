"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

export type EstadoInsumoForm = { error: string | null; ok?: boolean };

async function convertirABase(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  unidadId: string,
  cantidad: number
): Promise<number | null> {
  const { data } = await supabase
    .from("unidades_medida")
    .select("equivalencia_en_base")
    .eq("id", unidadId)
    .single();
  if (!data) return null;
  return cantidad * Number(data.equivalencia_en_base);
}

function leerCampos(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    categoria_id: String(formData.get("categoria_id") ?? ""),
    unidad_compra_id: String(formData.get("unidad_compra_id") ?? ""),
    unidad_consumo_id: String(formData.get("unidad_consumo_id") ?? ""),
    stock_minimo_consumo: Number(formData.get("stock_minimo_consumo") ?? 0),
    existencia_inicial_consumo: Number(formData.get("existencia_inicial_consumo") ?? 0),
    requiere_caducidad: formData.get("requiere_caducidad") === "on",
    dias_aviso_caducidad_crudo: String(formData.get("dias_aviso_caducidad") ?? "").trim(),
  };
}

function validar(campos: ReturnType<typeof leerCampos>): string | null {
  if (!campos.nombre) return "Escribe un nombre.";
  if (!campos.categoria_id) return "Elige una categoría.";
  if (!campos.unidad_compra_id) return "Elige la unidad de compra.";
  if (!campos.unidad_consumo_id) return "Elige la unidad de consumo.";
  if (campos.stock_minimo_consumo < 0) return "El stock mínimo no puede ser negativo.";
  if (campos.existencia_inicial_consumo < 0) return "La existencia inicial no puede ser negativa.";
  if (
    campos.requiere_caducidad &&
    campos.dias_aviso_caducidad_crudo &&
    Number(campos.dias_aviso_caducidad_crudo) <= 0
  ) {
    return "Los días de aviso de caducidad deben ser mayores a 0.";
  }
  return null;
}

export async function crearInsumo(
  _estadoPrevio: EstadoInsumoForm,
  formData: FormData
): Promise<EstadoInsumoForm> {
  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return { error };

  const supabase = await createSupabaseServerClient();

  const stockMinimoBase = await convertirABase(supabase, campos.unidad_consumo_id, campos.stock_minimo_consumo);
  const existenciaInicialBase = await convertirABase(
    supabase,
    campos.unidad_consumo_id,
    campos.existencia_inicial_consumo
  );
  if (stockMinimoBase === null || existenciaInicialBase === null) {
    return { error: "No pudimos leer la unidad de consumo elegida." };
  }

  const { error: dbError } = await supabase.from("insumos").insert({
    nombre: campos.nombre,
    categoria_id: campos.categoria_id,
    unidad_compra_id: campos.unidad_compra_id,
    unidad_consumo_id: campos.unidad_consumo_id,
    stock_minimo: stockMinimoBase,
    existencia_inicial: existenciaInicialBase,
    requiere_caducidad: campos.requiere_caducidad,
    dias_aviso_caducidad: campos.dias_aviso_caducidad_crudo ? Number(campos.dias_aviso_caducidad_crudo) : null,
  });

  if (dbError) return { error: traducirError(dbError) };

  revalidatePath("/inventario");
  redirect(`/inventario?creado=1`);
}

export async function actualizarInsumo(
  id: string,
  _estadoPrevio: EstadoInsumoForm,
  formData: FormData
): Promise<EstadoInsumoForm> {
  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return { error };

  const supabase = await createSupabaseServerClient();

  const stockMinimoBase = await convertirABase(supabase, campos.unidad_consumo_id, campos.stock_minimo_consumo);
  const existenciaInicialBase = await convertirABase(
    supabase,
    campos.unidad_consumo_id,
    campos.existencia_inicial_consumo
  );
  if (stockMinimoBase === null || existenciaInicialBase === null) {
    return { error: "No pudimos leer la unidad de consumo elegida." };
  }

  const { error: dbError } = await supabase
    .from("insumos")
    .update({
      nombre: campos.nombre,
      categoria_id: campos.categoria_id,
      unidad_compra_id: campos.unidad_compra_id,
      unidad_consumo_id: campos.unidad_consumo_id,
      stock_minimo: stockMinimoBase,
      existencia_inicial: existenciaInicialBase,
      requiere_caducidad: campos.requiere_caducidad,
      dias_aviso_caducidad: campos.dias_aviso_caducidad_crudo ? Number(campos.dias_aviso_caducidad_crudo) : null,
    })
    .eq("id", id);

  if (dbError) return { error: traducirError(dbError) };

  revalidatePath("/inventario");
  revalidatePath(`/inventario/${id}`);
  return { error: null, ok: true };
}

export async function darDeBajaInsumo(id: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("insumos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/inventario");
}
