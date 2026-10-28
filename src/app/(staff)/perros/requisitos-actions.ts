"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

const BUCKET = "perros-archivos";

export type EstadoRequisitoForm = { error: string | null; id?: string; registros?: RegistroFinal[] };

export async function crearRequisitoAplicado(
  perroId: string,
  datos: {
    tipoRequisitoId: string;
    fechaAplicacion: string;
    detalle: string | null;
    notas: string | null;
  }
): Promise<EstadoRequisitoForm> {
  if (!datos.tipoRequisitoId) return { error: "Elige qué tipo de requisito estás registrando." };
  if (!datos.fechaAplicacion) return { error: "Escribe la fecha de aplicación." };

  const supabase = await createSupabaseServerClient();
  // fecha_negocio(), no new Date() — barrido de zona horaria, Fase 4.
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  if (datos.fechaAplicacion > (hoyData as string)) {
    return { error: "La fecha de aplicación no puede ser futura." };
  }

  const { data, error } = await supabase
    .from("requisitos_sanitarios_aplicados")
    .insert({
      perro_id: perroId,
      tipo_requisito_id: datos.tipoRequisitoId,
      fecha_aplicacion: datos.fechaAplicacion,
      detalle: datos.detalle,
      notas: datos.notas,
    })
    .select("id")
    .single();

  // 23505: ya hay uno del mismo tipo y fecha (el mensaje de la base dice qué hacer).
  if (error) return { error: error.code === "23505" ? error.message : "No pudimos guardar el registro. Intenta de nuevo." };

  revalidatePath(`/perros/${perroId}`);
  return { error: null, id: data.id, registros: await registrosDe(supabase, [{ t: "requisitos_sanitarios_aplicados", i: data.id }]) };
}

export async function guardarComprobanteRequisito(
  requisitoAplicadoId: string,
  perroId: string,
  path: string
): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("requisitos_sanitarios_aplicados")
    .update({ comprobante_path: path })
    .eq("id", requisitoAplicadoId);

  if (error) return { error: "Guardamos el registro, pero no pudimos guardar el comprobante." };

  revalidatePath(`/perros/${perroId}`);
  return { error: null, registros: await registrosDe(supabase, [{ t: "requisitos_sanitarios_aplicados", i: requisitoAplicadoId }]) };
}

export async function obtenerUrlComprobante(requisitoAplicadoId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: registro } = await supabase
    .from("requisitos_sanitarios_aplicados")
    .select("comprobante_path")
    .eq("id", requisitoAplicadoId)
    .single();

  if (!registro?.comprobante_path) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(registro.comprobante_path, 60 * 60);

  return error ? null : data.signedUrl;
}

export async function corregirRequisitoAplicado(
  perroId: string,
  id: string,
  datos: { fechaAplicacion: string; detalle: string; notas: string; motivo: string }
): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  if (!datos.fechaAplicacion) return { error: "Escribe la fecha de aplicación." };
  if (datos.motivo.trim().length < 5) return { error: "Escribe el motivo de la corrección." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("corregir_requisito_aplicado", {
    p_id: id,
    p_fecha: datos.fechaAplicacion,
    p_detalle: datos.detalle,
    p_notas: datos.notas,
    p_motivo: datos.motivo,
  });
  if (error) return { error: error.message };
  revalidatePath(`/perros/${perroId}`);
  return { error: null, registros: await registrosDe(supabase, [{ t: "requisitos_sanitarios_aplicados", i: id }]) };
}

export async function anularRequisitoAplicado(
  perroId: string,
  id: string,
  motivo: string
): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la anulación." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("anular_requisito_aplicado", { p_id: id, p_motivo: motivo });
  if (error) return { error: error.message };
  revalidatePath(`/perros/${perroId}`);
  return { error: null, registros: await registrosDe(supabase, [{ t: "requisitos_sanitarios_aplicados", i: id }]) };
}
