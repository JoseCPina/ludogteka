"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoPerroForm = { error: string | null; ok?: boolean };

function leerCampos(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const raza = String(formData.get("raza") ?? "").trim();
  const sexo = String(formData.get("sexo") ?? "");
  const esterilizado = String(formData.get("esterilizado") ?? "");
  const fecha_nacimiento = String(formData.get("fecha_nacimiento") ?? "");
  const tamano_id = String(formData.get("tamano_id") ?? "");
  const pelaje_id = String(formData.get("pelaje_id") ?? "");
  const alimentacion_notas = String(formData.get("alimentacion_notas") ?? "").trim();
  const temperamento_notas = String(formData.get("temperamento_notas") ?? "").trim();

  return {
    nombre,
    raza: raza || null,
    sexo: sexo || null,
    esterilizado: esterilizado === "" ? null : esterilizado === "si",
    fecha_nacimiento: fecha_nacimiento || null,
    tamano_id: tamano_id || null,
    pelaje_id: pelaje_id || null,
    alimentacion_notas: alimentacion_notas || null,
    temperamento_notas: temperamento_notas || null,
  };
}

export async function crearPerro(
  clienteId: string,
  _estadoPrevio: EstadoPerroForm,
  formData: FormData
): Promise<EstadoPerroForm> {
  const campos = leerCampos(formData);
  if (!campos.nombre) return { error: "Escribe el nombre del perro." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("perros")
    .insert({ cliente_id: clienteId, ...campos })
    .select("id")
    .single();

  if (error) {
    return { error: "No pudimos guardar al perro. Intenta de nuevo." };
  }

  revalidatePath(`/clientes/${clienteId}`);
  redirect(`/perros/${data.id}?creado=1`);
}

export async function actualizarPerro(
  perroId: string,
  _estadoPrevio: EstadoPerroForm,
  formData: FormData
): Promise<EstadoPerroForm> {
  const campos = leerCampos(formData);
  if (!campos.nombre) return { error: "Escribe el nombre del perro." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("perros")
    .update(campos)
    .eq("id", perroId)
    .select("cliente_id")
    .single();

  if (error) {
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  revalidatePath(`/perros/${perroId}`);
  if (data?.cliente_id) revalidatePath(`/clientes/${data.cliente_id}`);
  return { error: null, ok: true };
}
