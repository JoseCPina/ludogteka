"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizarTelefono } from "@/lib/telefono";

export type EstadoClienteForm = { error: string | null; ok?: boolean };

function leerCampos(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefonoCrudo = String(formData.get("telefono") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  return { nombre, telefonoCrudo, email: email || null };
}

function validar(nombre: string, telefonoCrudo: string): EstadoClienteForm & { telefono?: string } {
  if (!nombre) return { error: "Escribe el nombre del dueño." };
  const telefono = normalizarTelefono(telefonoCrudo);
  if (!telefono) {
    return {
      error: "El teléfono debe tener 10 dígitos. Puedes escribirlo con espacios o guiones.",
    };
  }
  return { error: null, telefono };
}

export async function crearCliente(
  _estadoPrevio: EstadoClienteForm,
  formData: FormData
): Promise<EstadoClienteForm> {
  const { nombre, telefonoCrudo, email } = leerCampos(formData);
  const validado = validar(nombre, telefonoCrudo);
  if (validado.error) return validado;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clientes")
    .insert({ nombre, telefono: validado.telefono, email })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un cliente activo con ese correo." };
    }
    return { error: "No pudimos guardar al cliente. Intenta de nuevo." };
  }

  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}?creado=1`);
}

export async function actualizarCliente(
  id: string,
  _estadoPrevio: EstadoClienteForm,
  formData: FormData
): Promise<EstadoClienteForm> {
  const { nombre, telefonoCrudo, email } = leerCampos(formData);
  const validado = validar(nombre, telefonoCrudo);
  if (validado.error) return validado;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clientes")
    .update({ nombre, telefono: validado.telefono, email })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un cliente activo con ese correo." };
    }
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  return { error: null, ok: true };
}

export async function darDeBajaCliente(id: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/clientes");
  redirect("/clientes");
}
