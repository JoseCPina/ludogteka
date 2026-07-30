"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../reservas/traducir-error";

export type EstadoProveedorForm = { error: string | null; ok?: boolean };

function leerCampos(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    contacto_nombre: String(formData.get("contacto_nombre") ?? "").trim() || null,
    telefono: String(formData.get("telefono") ?? "").trim() || null,
    notas: String(formData.get("notas") ?? "").trim() || null,
  };
}

function validar(campos: ReturnType<typeof leerCampos>): string | null {
  if (!campos.nombre) return "Escribe un nombre.";
  return null;
}

export async function crearProveedor(
  _estadoPrevio: EstadoProveedorForm,
  formData: FormData
): Promise<EstadoProveedorForm> {
  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return { error };

  const supabase = await createSupabaseServerClient();
  const { error: dbError } = await supabase.from("proveedores").insert(campos);

  if (dbError) return { error: traducirError(dbError) };

  revalidatePath("/inventario/proveedores");
  redirect("/inventario/proveedores?creado=1");
}

export async function actualizarProveedor(
  id: string,
  _estadoPrevio: EstadoProveedorForm,
  formData: FormData
): Promise<EstadoProveedorForm> {
  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return { error };

  const supabase = await createSupabaseServerClient();
  const { error: dbError } = await supabase.from("proveedores").update(campos).eq("id", id);

  if (dbError) return { error: traducirError(dbError) };

  revalidatePath("/inventario/proveedores");
  revalidatePath(`/inventario/proveedores/${id}`);
  return { error: null, ok: true };
}

export async function darDeBajaProveedor(id: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("proveedores").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/inventario/proveedores");
}
