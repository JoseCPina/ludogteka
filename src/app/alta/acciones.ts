"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/telefono";
import { geocodificarYCalcularDistancia } from "@/lib/google-maps/distancia-cliente";
import type { DatosAlta, PerroCreado, ResultadoAlta } from "./tipos";

const BUCKET = "perros-archivos";

// Todo el alta pasa por el servidor con la secret key, nunca por el
// navegador: la pantalla es pública (sin sesión, solo con el token del
// link) y lo que hay que crear —una cuenta de Auth, un expediente y sus
// perros— no puede quedar al alcance de quien tenga el link y sepa abrir
// la consola del navegador. El token autoriza a llamar a esta acción; la
// acción es la que decide qué se escribe.
export async function completarAlta(token: string, datos: DatosAlta): Promise<ResultadoAlta> {
  const nombre = datos.nombre.trim();
  const email = datos.email.trim().toLowerCase();
  const telefono = normalizarTelefono(datos.telefono);

  if (!nombre) return { error: "Escribe tu nombre." };
  if (!telefono) {
    return { error: "El teléfono debe tener 10 dígitos. Puedes escribirlo con espacios o guiones." };
  }
  if (!email || !email.includes("@")) return { error: "Escribe un correo válido." };
  if (datos.password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }
  if (datos.perros.length === 0) return { error: "Agrega al menos un perro." };
  if (datos.perros.some((p) => !p.nombre.trim())) {
    return { error: "Cada perro necesita un nombre." };
  }

  const admin = createSupabaseAdminClient();

  // Se valida el token ANTES de crear la cuenta, aunque
  // completar_alta_cliente lo vuelva a validar dentro de su transacción:
  // sin esto, un link vencido dejaría atrás una cuenta de Auth creada
  // para nada. La validación de la función sigue siendo la que manda —
  // esta es solo para no ensuciar por adelantado.
  const { data: invitacion } = await admin
    .from("invitaciones_cliente")
    .select("id, usada_at, cancelada_at, expira_at")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!invitacion) return { error: "Este link de alta no existe." };
  if (invitacion.cancelada_at) {
    return { error: "Este link fue cancelado. Pídele uno nuevo a recepción." };
  }
  if (invitacion.usada_at) return { error: "Este link ya se usó." };
  if (new Date(invitacion.expira_at as string) <= new Date()) {
    return { error: "Este link ya venció. Pídele uno nuevo a recepción." };
  }

  // email_confirm: true a propósito. La persona no llegó por un correo
  // que haya que verificar: llegó por un link que recepción le mandó a su
  // WhatsApp y está capturando frente a la pantalla. Pedirle además que
  // salga a confirmar un correo para poder entrar rompería el alta justo
  // en el último paso, que es donde más gente se cae.
  const { data: creado, error: errorCuenta } = await admin.auth.admin.createUser({
    email,
    password: datos.password,
    email_confirm: true,
  });

  if (errorCuenta || !creado?.user) {
    const mensaje = errorCuenta?.message ?? "";
    if (/already|registered|exists/i.test(mensaje)) {
      return {
        error:
          "Ya existe una cuenta con ese correo. Si es tuya, inicia sesión; si no, usa otro correo o avísale a recepción.",
      };
    }
    return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
  }

  const userId = creado.user.id;

  const { data: resultado, error: errorAlta } = await admin.rpc("completar_alta_cliente", {
    p_token: token,
    p_user_id: userId,
    p_cliente: { nombre, telefono, email, direccion: datos.direccion.trim() },
    p_perros: datos.perros.map((p) => ({
      nombre: p.nombre.trim(),
      raza: p.raza,
      raza_id: p.raza_id,
      sexo: p.sexo,
      fecha_nacimiento: p.fecha_nacimiento,
      tamano_id: p.tamano_id,
      pelaje_id: p.pelaje_id,
      alimentacion_notas: p.alimentacion_notas,
      contacto_emergencia_nombre: p.contacto_emergencia_nombre,
      contacto_emergencia_telefono: normalizarTelefono(p.contacto_emergencia_telefono) ?? p.contacto_emergencia_telefono,
      veterinario_nombre: p.veterinario_nombre,
      veterinario_telefono: normalizarTelefono(p.veterinario_telefono) ?? p.veterinario_telefono,
      veterinario_clinica: p.veterinario_clinica,
    })),
  });

  if (errorAlta) {
    // Compensación: la cuenta se creó fuera de la transacción de la base
    // (Auth es otro sistema), así que si el expediente no se pudo crear
    // hay que deshacerla a mano. Si no, queda una cuenta sin expediente
    // — exactamente la cuenta huérfana que este flujo viene a evitar, y
    // encima bloqueando ese correo para el siguiente intento.
    await admin.auth.admin.deleteUser(userId);
    return { error: errorAlta.message || "No pudimos completar tu alta. Intenta de nuevo." };
  }

  const salida = resultado as { cliente_id: string; perros: PerroCreado[] } | null;
  return {
    error: null,
    clienteId: salida?.cliente_id,
    perros: salida?.perros ?? [],
  };
}

// La distancia se calcula justo después del alta, no dentro: geocodificar
// y medir la ruta son llamadas HTTP a Google, y meterlas en la transacción
// que crea el expediente haría que un timeout de un servicio ajeno tumbe
// un alta completa. Aquí, si falla, el expediente ya quedó bien: la
// dirección está guardada y recepción ajusta la distancia a mano desde la
// ficha. Por eso ni siquiera devuelve error a la pantalla del dueño — no
// hay nada que él pueda hacer al respecto.
//
// Autorización por el mismo token, acotada al expediente que ESA
// invitación creó: con el token de otra persona no se le puede recalcular
// (ni cobrar cuota de Google) sobre un cliente ajeno.
export async function calcularDistanciaAlta(token: string): Promise<{ error: string | null }> {
  const admin = createSupabaseAdminClient();

  const { data: invitacion } = await admin
    .from("invitaciones_cliente")
    .select("cliente_id")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!invitacion?.cliente_id) return { error: "Este link no tiene un alta completada." };

  const { data: cliente } = await admin
    .from("clientes")
    .select("direccion")
    .eq("id", invitacion.cliente_id)
    .maybeSingle();

  const direccion = (cliente?.direccion as string | null) ?? "";
  if (!direccion.trim()) return { error: null };

  const resultado = await geocodificarYCalcularDistancia(admin, invitacion.cliente_id, direccion);
  return { error: resultado.error };
}

// La foto va aparte del alta y después: pesa, y si falla la subida no
// tiene por qué tumbar un expediente ya bueno. La autorización no es la
// sesión (todavía no hay) sino el mismo token, acotado a los perros del
// expediente que ESA invitación creó — con el token de otra persona no se
// le puede cambiar la foto a un perro ajeno.
export async function subirFotoAlta(
  token: string,
  perroId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const archivo = formData.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "No recibimos la foto." };
  }
  if (archivo.size > 8 * 1024 * 1024) {
    return { error: "La foto pesa más de 8 MB. Toma una más ligera." };
  }
  if (!archivo.type.startsWith("image/")) {
    return { error: "Ese archivo no es una imagen." };
  }

  const admin = createSupabaseAdminClient();

  const { data: invitacion } = await admin
    .from("invitaciones_cliente")
    .select("cliente_id")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!invitacion?.cliente_id) return { error: "Este link no tiene un alta completada." };

  const { data: perro } = await admin
    .from("perros")
    .select("id, cliente_id")
    .eq("id", perroId)
    .maybeSingle();

  if (!perro || perro.cliente_id !== invitacion.cliente_id) {
    return { error: "Ese perro no es de esta alta." };
  }

  const extension = archivo.type === "image/png" ? "png" : "jpg";
  const ruta = `${perro.cliente_id}/${perroId}/perfil/foto.${extension}`;

  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type });

  if (errorSubida) return { error: "No pudimos guardar la foto." };

  const { error: errorPerro } = await admin
    .from("perros")
    .update({ foto_path: ruta })
    .eq("id", perroId);

  if (errorPerro) return { error: "No pudimos guardar la foto." };

  return { error: null };
}
