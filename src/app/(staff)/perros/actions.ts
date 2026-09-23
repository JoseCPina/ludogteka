"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hrefDeVuelta, rutaDeVuelta } from "@/lib/clientes/volver";

export type EstadoPerroForm = { error: string | null; ok?: boolean };

function leerCampos(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const raza = String(formData.get("raza") ?? "").trim();
  // El buscador manda las dos cosas: el id del catálogo, que es lo que
  // decide el precio de estética, y el texto, que es lo que se lee en la
  // ficha. Cuando la raza no está en el catálogo llega solo el texto y el
  // perro cotiza con el grupo por defecto — a propósito, para no obligar
  // a nadie a escoger una raza que no es.
  const raza_id = String(formData.get("raza_id") ?? "").trim();
  const sexo = String(formData.get("sexo") ?? "");
  const esterilizado = String(formData.get("esterilizado") ?? "");
  const fecha_nacimiento = String(formData.get("fecha_nacimiento") ?? "");
  const tamano_id = String(formData.get("tamano_id") ?? "");
  const pelaje_id = String(formData.get("pelaje_id") ?? "");
  const alimentacion_notas = String(formData.get("alimentacion_notas") ?? "").trim();
  const temperamento_notas = String(formData.get("temperamento_notas") ?? "").trim();
  const texto = (clave: string) => String(formData.get(clave) ?? "").trim() || null;

  return {
    nombre,
    raza: raza || null,
    raza_id: raza_id || null,
    sexo: sexo || null,
    esterilizado: esterilizado === "" ? null : esterilizado === "si",
    fecha_nacimiento: fecha_nacimiento || null,
    tamano_id: tamano_id || null,
    pelaje_id: pelaje_id || null,
    alimentacion_notas: alimentacion_notas || null,
    temperamento_notas: temperamento_notas || null,
    contacto_emergencia_nombre: texto("contacto_emergencia_nombre"),
    contacto_emergencia_telefono: texto("contacto_emergencia_telefono"),
    veterinario_nombre: texto("veterinario_nombre"),
    veterinario_telefono: texto("veterinario_telefono"),
    veterinario_clinica: texto("veterinario_clinica"),
  };
}

// Lo que se puede llenar desde "Capturar ahora" (pendientes para guardería
// y hotel). Es la talla más los campos que pide el alta de guardería y
// hotel: los mismos de pendientes_para_estancia().
const CAMPOS_COMPLETABLES = [
  "raza",
  "raza_id",
  "sexo",
  "fecha_nacimiento",
  "tamano_id",
  "pelaje_id",
  "alimentacion_notas",
  "contacto_emergencia_nombre",
  "contacto_emergencia_telefono",
  "veterinario_nombre",
  "veterinario_telefono",
  "veterinario_clinica",
] as const;

/**
 * "Capturar ahora": recepción llena en el mostrador lo que le falta a un
 * perro para guardería u hotel, con el dueño enfrente. Solo escribe los
 * campos que vienen llenos en el formulario (que solo pinta los vacíos):
 * nunca borra un dato que ya estaba.
 */
export async function completarParaEstancia(
  perroId: string,
  _estadoPrevio: EstadoPerroForm,
  formData: FormData
): Promise<EstadoPerroForm> {
  const cambios: Record<string, string> = {};
  for (const clave of CAMPOS_COMPLETABLES) {
    const valor = String(formData.get(clave) ?? "").trim();
    if (valor) cambios[clave] = valor;
  }
  if (Object.keys(cambios).length === 0) {
    return { error: "No capturaste nada. Llena al menos un dato." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("perros")
    .update(cambios)
    .eq("id", perroId)
    .select("cliente_id")
    .single();

  if (error) {
    return { error: "No pudimos guardar los datos. Intenta de nuevo." };
  }

  revalidatePath(`/perros/${perroId}`);
  if (data?.cliente_id) revalidatePath(`/clientes/${data.cliente_id}`);
  return { error: null, ok: true };
}

export async function crearPerro(
  clienteId: string,
  _estadoPrevio: EstadoPerroForm,
  formData: FormData
): Promise<EstadoPerroForm> {
  return altaPerro(clienteId, formData, null);
}

// Segundo paso de "Nuevo cliente → Capturarlo yo" desde un buscador: con
// el perro guardado se regresa a la pantalla de origen con el dueño ya
// elegido (ver src/lib/clientes/volver.ts).
export async function crearPerroYVolver(
  clienteId: string,
  volver: string,
  _estadoPrevio: EstadoPerroForm,
  formData: FormData
): Promise<EstadoPerroForm> {
  return altaPerro(clienteId, formData, rutaDeVuelta(volver));
}

async function altaPerro(clienteId: string, formData: FormData, volver: string | null): Promise<EstadoPerroForm> {
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
  if (volver) redirect(hrefDeVuelta(volver, clienteId));
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
