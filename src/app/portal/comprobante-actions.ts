"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";

const BUCKET = "perros-archivos";
const PESO_MAXIMO = 4 * 1024 * 1024;

export type ResultadoProponer = { error: string | null; id?: string };

/**
 * El dueño manda la foto de su carnet o comprobante desde el portal.
 *
 * Queda como PROPUESTO: no es un registro sanitario y no levanta ningún
 * bloqueo hasta que recepción lo confirme contra el documento. La foto la
 * sube el servidor con la secret key DESPUÉS de comprobar que quien la
 * manda es el dueño principal del perro (el dueño no tiene permiso de
 * escritura en el bucket), y la fila se inserta con la sesión del dueño,
 * así que el RLS vuelve a comprobar lo mismo por su cuenta.
 */
export async function proponerComprobante(perroId: string, formData: FormData): Promise<ResultadoProponer> {
  const tipoId = String(formData.get("tipo_requisito_id") ?? "").trim();
  const fecha = String(formData.get("fecha_aplicacion") ?? "").trim();
  const detalle = String(formData.get("detalle") ?? "").trim() || null;
  const archivo = formData.get("foto");

  if (!tipoId) return { error: "Elige de qué es el comprobante." };
  if (!fecha) return { error: "Escribe la fecha en que se aplicó." };
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Falta la foto del comprobante: es lo que recepción va a revisar." };
  }
  if (!archivo.type.startsWith("image/")) return { error: "Ese archivo no es una imagen." };
  if (archivo.size > PESO_MAXIMO) {
    return { error: "La foto pesa demasiado. Toma una más ligera o recórtala." };
  }

  const sesion = await obtenerSesionConRol();
  if (!sesion?.clienteId) return { error: "Tu cuenta no está ligada a un expediente." };

  const supabase = await createSupabaseServerClient();

  // Solo el dueño principal. Un acceso compartido ve el expediente pero
  // no actúa sobre él, igual que con la firma de contratos.
  const { data: perro } = await supabase
    .from("perros")
    .select("id, cliente_id")
    .eq("id", perroId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!perro || perro.cliente_id !== sesion.clienteId) {
    return { error: "Este perro no es tuyo directamente: solo su dueño principal puede mandar comprobantes." };
  }

  const { data: hoy } = await supabase.rpc("fecha_negocio");
  if (fecha > (hoy as string)) return { error: "La fecha de aplicación no puede ser futura." };

  const { data: tipo } = await supabase
    .from("tipos_requisito_sanitario")
    .select("id")
    .eq("id", tipoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tipo) return { error: "Ese tipo de requisito no existe." };

  // Una propuesta pendiente por tipo: la segunda foto del mismo carnet
  // solo duplica trabajo en la bandeja.
  const { data: pendiente } = await supabase
    .from("requisitos_sanitarios_propuestos")
    .select("id")
    .eq("perro_id", perroId)
    .eq("tipo_requisito_id", tipoId)
    .eq("estado", "pendiente")
    .is("deleted_at", null)
    .maybeSingle();
  if (pendiente) {
    return { error: "Ya nos mandaste un comprobante de esto y lo estamos revisando. Si quieres cambiarlo, espera a que recepción lo revise." };
  }

  const id = crypto.randomUUID();
  const path = `${perro.cliente_id}/${perroId}/requisitos-propuestos/${id}/comprobante.jpg`;
  const admin = createSupabaseAdminClient();

  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(path, archivo, { upsert: false, contentType: archivo.type });
  if (errorSubida) return { error: "No pudimos guardar la foto. Intenta de nuevo." };

  const { error: errorFila } = await supabase.from("requisitos_sanitarios_propuestos").insert({
    id,
    perro_id: perroId,
    tipo_requisito_id: tipoId,
    fecha_aplicacion: fecha,
    detalle,
    comprobante_path: path,
    created_by: sesion.user.id,
  });

  if (errorFila) {
    // La foto ya subió y la fila no: se limpia para no dejar huérfanos.
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "No pudimos registrar el comprobante. Intenta de nuevo." };
  }

  revalidatePath(`/portal/perros/${perroId}`);
  revalidatePath("/recepcion");
  return { error: null, id };
}
