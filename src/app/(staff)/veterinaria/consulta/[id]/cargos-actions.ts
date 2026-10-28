"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../../reservas/traducir-error";
import type { CargosConsulta } from "@/lib/veterinaria/cargos-consulta";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import type { SupabaseClient } from "@supabase/supabase-js";

// Los cargos de una consulta veterinaria. Cada función de la base comprueba el permiso
// de quien llama; aquí solo se arman los argumentos y se devuelve el resumen al día.

export type ResultadoCargos = { error: string | null; datos?: CargosConsulta; aviso?: string; registros?: RegistroFinal[] };

async function resumen(id: string): Promise<ResultadoCargos> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_consulta_cargos", { p_consulta: id });
  if (error) return { error: traducirError(error) };
  return { error: null, datos: data as CargosConsulta };
}

/** El resumen al día y, si se leyó, la consulta con sus cargos como registro final (lo clínico va en `datos`). */
async function conRegistrosDeConsulta(supabase: SupabaseClient, id: string): Promise<ResultadoCargos> {
  const r = await resumen(id);
  if (r.error) return r;
  return { ...r, registros: await registrosDe(supabase, [{ t: "vet_consultas", i: id, datos: { cargos: r.datos ?? null } }]) };
}

export async function cargarCargosConsulta(id: string): Promise<ResultadoCargos> {
  return resumen(id);
}

export async function agregarCargoConsulta(
  id: string,
  dato: { tipo: "procedimiento" | "medicamento"; concepto?: string; cantidad: number; precio?: number | null; servicioId?: string | null; insumoId?: string | null }
): Promise<ResultadoCargos> {
  if (!Number.isFinite(dato.cantidad) || dato.cantidad <= 0) return { error: "La cantidad debe ser mayor a cero." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_consulta_cargo_agregar", {
    p_consulta: id,
    p_tipo: dato.tipo,
    p_concepto: dato.concepto ?? null,
    p_cantidad: dato.cantidad,
    p_precio: dato.precio ?? null,
    p_servicio: dato.servicioId ?? null,
    p_insumo: dato.insumoId ?? null,
  });
  if (error) return { error: traducirError(error) };
  return conRegistrosDeConsulta(supabase, id);
}

export async function quitarCargoConsulta(id: string, cargoId: string, motivo: string): Promise<ResultadoCargos> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_consulta_cargo_quitar", { p_id: cargoId, p_motivo: motivo });
  if (error) return { error: traducirError(error) };
  return conRegistrosDeConsulta(supabase, id);
}

/** El precio de un cargo que no lo tenía, capturado al firmar; con permiso, también como precio de catálogo. */
export async function ponerPrecioCargo(id: string, cargoId: string, precio: number, guardarCatalogo: boolean): Promise<ResultadoCargos> {
  if (!Number.isFinite(precio) || precio <= 0) return { error: "Escribe un precio mayor a cero. Para no cobrarlo usa «Sin cobro» con su motivo." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_consulta_cargo_precio", { p_id: cargoId, p_precio: precio, p_guardar_catalogo: guardarCatalogo });
  if (error) return { error: traducirError(error) };
  return conRegistrosDeConsulta(supabase, id);
}

/** «Sin cobro» (cortesía o seguimiento incluido): la línea queda fuera de Caja, con su motivo a la vista. */
export async function sinCobroCargo(id: string, cargoId: string, motivo: string): Promise<ResultadoCargos> {
  if (motivo.trim().length < 3) return { error: "Escribe por qué no se cobra (cortesía, seguimiento incluido…)." };
  return quitarCargoConsulta(id, cargoId, `Sin cobro: ${motivo.trim()}`);
}

export async function restaurarCargoConsulta(id: string, cargoId: string): Promise<ResultadoCargos> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_consulta_cargo_restaurar", { p_id: cargoId });
  if (error) return { error: traducirError(error) };
  return conRegistrosDeConsulta(supabase, id);
}

export async function ajustarCargoConsulta(id: string, cargoId: string, cantidad: number, precio: number, motivo: string): Promise<ResultadoCargos> {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: "La cantidad debe ser mayor a cero." };
  if (!Number.isFinite(precio) || precio < 0) return { error: "Escribe el precio (cero si es cortesía)." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_consulta_cargo_ajustar", { p_id: cargoId, p_cantidad: cantidad, p_precio: precio, p_motivo: motivo });
  if (error) return { error: traducirError(error) };
  return conRegistrosDeConsulta(supabase, id);
}

/** Una consulta firmada con cargos sin precio: ya capturado el precio, pasa a Caja lo que falta. */
export async function pasarCargosACaja(id: string): Promise<ResultadoCargos> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_consulta_cobrar_pendientes", { p_consulta: id });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/consulta/${id}`);
  const r = await conRegistrosDeConsulta(supabase, id);
  const n = Number((data as { cargos?: number } | null)?.cargos ?? 0);
  return { ...r, registros: r.registros, aviso: n > 0 ? `Pasaron ${n} ${n === 1 ? "cargo" : "cargos"} a Caja.` : "No hay cargos con precio por pasar todavía." };
}
