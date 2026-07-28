"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET = "perros-archivos";

export type EstadoRequisitoForm = { error: string | null; id?: string };

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  if (datos.fechaAplicacion > hoyISO()) {
    return { error: "La fecha de aplicación no puede ser futura." };
  }

  const supabase = await createSupabaseServerClient();
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

  if (error) return { error: "No pudimos guardar el registro. Intenta de nuevo." };

  revalidatePath(`/perros/${perroId}`);
  return { error: null, id: data.id };
}

export async function guardarComprobanteRequisito(
  requisitoAplicadoId: string,
  perroId: string,
  path: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("requisitos_sanitarios_aplicados")
    .update({ comprobante_path: path })
    .eq("id", requisitoAplicadoId);

  if (error) return { error: "Guardamos el registro, pero no pudimos guardar el comprobante." };

  revalidatePath(`/perros/${perroId}`);
  return { error: null };
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
