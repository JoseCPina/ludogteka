"use server";

import { registrosFinales } from "@/lib/concurrencia/registro-final";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { normalizarTelefono } from "@/lib/telefono";
import { geocodificarYCalcularDistancia } from "@/lib/google-maps/distancia-cliente";
import { rutaDeVuelta } from "@/lib/clientes/volver";
import { descartarBorradorGuardado } from "@/lib/borradores/servidor";
import { conControl, controlDeFormulario } from "@/lib/concurrencia/servidor";
import { conflictoDeError } from "@/lib/concurrencia/tipos";

export type EstadoClienteForm = {
  error: string | null;
  ok?: boolean;
  conflicto?: import("@/lib/concurrencia/tipos").Conflicto | null;
  registros?: import("@/lib/concurrencia/tipos").RegistroFinal[];
  /** El updated_at que quedó al guardar: el formulario lo usa como su nueva versión sin esperar a repintarse. */
  version?: string | null;
};

function leerCampos(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefonoCrudo = String(formData.get("telefono") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const direccion = String(formData.get("direccion") ?? "").trim();
  const notas = String(formData.get("notas") ?? "").trim().slice(0, 2000);
  // La casilla de recordatorios por WhatsApp: solo cuenta si el formulario la trae (un checkbox apagado no se envía).
  const recordatorios = formData.get("recordatorios_whatsapp_presente") ? formData.get("recordatorios_whatsapp") === "si" : null;
  return { nombre, telefonoCrudo, email: email || null, direccion, notas: notas || null, recordatorios };
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
  return altaCliente(formData, null);
}

// Veterinaria (QA S30): sin mascota no hay consulta, así que el alta del dueño sigue directo a la de su mascota y de ahí a
// su ficha. Lo usa /clientes/nuevo cuando el negocio tiene Veterinaria.
export async function crearClienteYSuMascota(
  _estadoPrevio: EstadoClienteForm,
  formData: FormData
): Promise<EstadoClienteForm> {
  return altaCliente(formData, null, true);
}

// "Nuevo cliente → Capturarlo yo" desde un buscador (agendar, reservar,
// cobrar): del dueño se sigue directo a registrar su perro, y de ahí de
// vuelta a la pantalla de origen con el cliente elegido.
export async function crearClienteYVolver(
  volver: string,
  _estadoPrevio: EstadoClienteForm,
  formData: FormData
): Promise<EstadoClienteForm> {
  return altaCliente(formData, rutaDeVuelta(volver));
}

async function altaCliente(formData: FormData, volver: string | null, seguirConMascota = false): Promise<EstadoClienteForm> {
  const { nombre, telefonoCrudo, email, direccion, notas, recordatorios } = leerCampos(formData);
  const validado = validar(nombre, telefonoCrudo);
  if (validado.error) return validado;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clientes")
    .insert({ nombre, telefono: validado.telefono, email, recordatorios_whatsapp: recordatorios ?? true, recordatorios_whatsapp_origen: "mostrador", recordatorios_whatsapp_cambio_at: new Date().toISOString() })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Desde que el teléfono es la identidad del cliente hay DOS índices
      // únicos, y decirle a recepción que el problema es el correo cuando
      // el repetido era el teléfono la manda a revisar el campo
      // equivocado.
      if (error.message.includes("telefono")) {
        return {
          error:
            "Ya hay un cliente activo con ese teléfono. Búscalo en la lista: si es la misma persona, edítalo en vez de crear otro.",
        };
      }
      return { error: "Ya existe un cliente activo con ese correo." };
    }
    return { error: "No pudimos guardar al cliente. Intenta de nuevo." };
  }

  // Las notas internas viven en su propia tabla (solo personal): el dueño no las puede leer.
  if (notas) await supabase.rpc("cliente_notas_guardar", { p_cliente: data.id, p_notas: notas });

  // La distancia se calcula aquí, en el alta, y no cuando alguien se
  // acuerde de abrir la ficha: capturarla después es justo lo que hizo
  // que llevaran 0 de 14 clientes con dirección. Si Google falla, el
  // cliente YA quedó creado y la dirección guardada — el alta no se cae
  // por un servicio externo, y recepción ajusta la distancia a mano
  // desde la ficha.
  if (direccion) {
    await geocodificarYCalcularDistancia(supabase, data.id, direccion, await negocioActual());
  }

  // El alta quedó guardada: el borrador (si había) ya no hace falta.
  await Promise.all([descartarBorradorGuardado(supabase, "cliente_nuevo", ""), descartarBorradorGuardado(supabase, "cliente_nuevo", "corta")]);

  // Sin revalidatePath (QA S27): el redirect ya pinta la pantalla de destino con datos frescos (son dinámicas).
  if (volver) redirect(`/clientes/${data.id}/perros/nuevo?volver=${encodeURIComponent(volver)}`);
  if (seguirConMascota) redirect(`/clientes/${data.id}/perros/nuevo?alta=1`);
  redirect(`/clientes/${data.id}?creado=1`);
}

export async function actualizarCliente(
  id: string,
  _estadoPrevio: EstadoClienteForm,
  formData: FormData
): Promise<EstadoClienteForm> {
  const { nombre, telefonoCrudo, email, notas, recordatorios } = leerCampos(formData);
  const validado = validar(nombre, telefonoCrudo);
  if (validado.error) return { error: validado.error };

  const supabase = await createSupabaseServerClient();
  const control = controlDeFormulario(formData);
  // El consentimiento solo se toca si cambió (así no se pierde de dónde vino, p. ej. una baja por WhatsApp).
  const { data: previo } = recordatorios === null ? { data: null } : await supabase.from("clientes").select("recordatorios_whatsapp").eq("id", id).maybeSingle();
  const cambiaConsentimiento = recordatorios !== null && previo !== null && previo.recordatorios_whatsapp !== recordatorios;
  const { data: guardado, error } = await conControl(supabase
    .from("clientes")
    .update({
      nombre,
      telefono: validado.telefono,
      email,
      ...(!cambiaConsentimiento ? {} : { recordatorios_whatsapp: recordatorios, recordatorios_whatsapp_origen: "mostrador", recordatorios_whatsapp_cambio_at: new Date().toISOString() }),
    })
    .eq("id", id)
    .select("updated_at")
    .single(), control);

  if (error) {
    const conflicto = conflictoDeError(error);
    if (conflicto) return { error: null, conflicto, registros: await registrosFinales(supabase, control) };
    if (error.code === "23505") {
      // Desde que el teléfono es la identidad del cliente hay DOS índices
      // únicos, y decirle a recepción que el problema es el correo cuando
      // el repetido era el teléfono la manda a revisar el campo
      // equivocado.
      if (error.message.includes("telefono")) {
        return {
          error:
            "Ya hay un cliente activo con ese teléfono. Búscalo en la lista: si es la misma persona, edítalo en vez de crear otro.",
        };
      }
      return { error: "Ya existe un cliente activo con ese correo." };
    }
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  // Notas internas: tabla propia, solo personal (recepción y admin las editan).
  const { error: errorNotas } = await conControl(supabase.rpc("cliente_notas_guardar", { p_cliente: id, p_notas: notas ?? "" }), control);
  if (errorNotas) {
    return { error: "Guardamos los datos, pero no las notas internas. Intenta de nuevo." };
  }

  // Sin revalidatePath (QA S27: repintaba la ficha entera antes de responder y «Guardando…» duraba 2 a 4 s): el
  // formulario confirma al momento y pide router.refresh() para la cabecera.
  // La versión que se devuelve es la FINAL: `cliente_notas_guardar` vuelve a tocar el cliente (su updated_at cambia
  // después del UPDATE de arriba); con la de arriba, el siguiente guardado de esta misma pestaña chocaba (N120).
  const { data: final } = await supabase.from("clientes").select("updated_at").eq("id", id).maybeSingle();
  return { error: null, registros: await registrosFinales(supabase, controlDeFormulario(formData)), ok: true, version: ((final?.updated_at ?? guardado?.updated_at) as string | undefined) ?? null };
}

export async function darDeBajaCliente(id: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/clientes");
  redirect("/clientes");
}
