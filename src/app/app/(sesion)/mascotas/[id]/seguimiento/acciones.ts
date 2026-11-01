"use server";

import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { hoyMx, programarRecordatorios } from "@/lib/app/cartilla";

type Resultado = { error: string | null; registros?: RegistroFinal[] };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function mia(id: string) {
  const s = await sesionApp();
  if (!s) return null;
  const supabase = await createSupabaseServerClient("portal");
  const { data } = await supabase.from("mascotas").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  return data ? supabase : null;
}

export async function agregarPeso(mascotaId: string, pesoTexto: string, fecha: string | null, notas: string | null): Promise<Resultado> {
  const supabase = await mia(mascotaId);
  if (!supabase) return { error: "No encontramos esa mascota." };
  const peso = Number(String(pesoTexto).replace(",", "."));
  if (!Number.isFinite(peso) || peso <= 0 || peso >= 200) return { error: "Escribe el peso en kilos (por ejemplo 12.5)." };
  if (fecha && !FECHA.test(fecha)) return { error: "La fecha no se entiende." };
  const { data, error } = await supabase.from("mascotas_pesos").insert({ mascota_id: mascotaId, peso_kg: Math.round(peso * 100) / 100, fecha: fecha || hoyMx(), notas: notas?.trim().slice(0, 200) || null, updated_at: new Date().toISOString() }).select("id").single();
  if (error) return { error: "No pudimos guardar el peso." };
  return { error: null, registros: await registrosDe(supabase, [{ t: "mascotas_pesos", i: data.id as string }]) };
}

export async function quitarPeso(mascotaId: string, id: string): Promise<Resultado> {
  const supabase = await mia(mascotaId);
  if (!supabase) return { error: "No encontramos esa mascota." };
  await supabase.from("mascotas_pesos").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("mascota_id", mascotaId);
  return { error: null, registros: await registrosDe(supabase, [{ t: "mascotas_pesos", i: id }]) };
}

export async function agregarMedicamento(mascotaId: string, m: { nombre: string; dosis: string | null; horas: string[]; fecha_inicio: string; fecha_fin: string | null; notas?: string | null }): Promise<Resultado> {
  const supabase = await mia(mascotaId);
  if (!supabase) return { error: "No encontramos esa mascota." };
  const nombre = m.nombre.trim().slice(0, 80);
  if (nombre.length < 1) return { error: "Escribe qué medicamento es." };
  const horas = [...new Set(m.horas.filter((h) => /^\d{2}:\d{2}$/.test(h)))].sort();
  if (!horas.length) return { error: "Pon al menos una hora del día." };
  if (!FECHA.test(m.fecha_inicio) || (m.fecha_fin && !FECHA.test(m.fecha_fin))) return { error: "Una fecha no se entiende." };
  if (m.fecha_fin && m.fecha_fin < m.fecha_inicio) return { error: "El fin no puede ser antes del inicio." };
  const { data, error } = await supabase.from("mascotas_medicamentos").insert({ mascota_id: mascotaId, nombre, dosis: m.dosis?.trim().slice(0, 80) || null, horas, fecha_inicio: m.fecha_inicio, fecha_fin: m.fecha_fin || null, notas: m.notas?.trim().slice(0, 200) || null, updated_at: new Date().toISOString() }).select("id").single();
  if (error) return { error: "No pudimos guardar el medicamento." };
  await programarRecordatorios(mascotaId);
  return { error: null, registros: await registrosDe(supabase, [{ t: "mascotas_medicamentos", i: data.id as string }]) };
}

export async function terminarMedicamento(mascotaId: string, id: string): Promise<Resultado> {
  const supabase = await mia(mascotaId);
  if (!supabase) return { error: "No encontramos esa mascota." };
  await supabase.from("mascotas_medicamentos").update({ activo: false }).eq("id", id).eq("mascota_id", mascotaId);
  await programarRecordatorios(mascotaId);
  return { error: null, registros: await registrosDe(supabase, [{ t: "mascotas_medicamentos", i: id }]) };
}

export async function agregarGasto(mascotaId: string, g: { concepto: string; monto: string; categoria: string; fecha: string | null }): Promise<Resultado> {
  const supabase = await mia(mascotaId);
  if (!supabase) return { error: "No encontramos esa mascota." };
  const concepto = g.concepto.trim().slice(0, 80);
  const monto = Number(String(g.monto).replace(/[^\d.,]/g, "").replace(",", "."));
  if (concepto.length < 1) return { error: "Escribe en qué fue el gasto." };
  if (!Number.isFinite(monto) || monto < 0 || monto > 1_000_000) return { error: "Escribe cuánto fue." };
  if (g.fecha && !FECHA.test(g.fecha)) return { error: "La fecha no se entiende." };
  const categoria = ["alimento", "veterinaria", "estetica", "guarderia_hotel", "medicinas", "accesorios", "otro"].includes(g.categoria) ? g.categoria : "otro";
  const { data, error } = await supabase.from("mascotas_gastos").insert({ mascota_id: mascotaId, concepto, monto: Math.round(monto * 100) / 100, categoria, fecha: g.fecha || hoyMx(), updated_at: new Date().toISOString() }).select("id").single();
  if (error) return { error: "No pudimos guardar el gasto." };
  return { error: null, registros: await registrosDe(supabase, [{ t: "mascotas_gastos", i: data.id as string }]) };
}

export async function quitarGasto(mascotaId: string, id: string): Promise<Resultado> {
  const supabase = await mia(mascotaId);
  if (!supabase) return { error: "No encontramos esa mascota." };
  await supabase.from("mascotas_gastos").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("mascota_id", mascotaId);
  return { error: null, registros: await registrosDe(supabase, [{ t: "mascotas_gastos", i: id }]) };
}
