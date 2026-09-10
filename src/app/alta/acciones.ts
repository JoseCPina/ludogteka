"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/telefono";
import { correoSinteticoDeTelefono } from "@/lib/auth/identidad";
import { geocodificarYCalcularDistancia } from "@/lib/google-maps/distancia-cliente";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ContratoPendiente,
  DatosAlta,
  DatosComplemento,
  PerroCreado,
  ResultadoAlta,
  ResultadoComplemento,
} from "./tipos";

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
  // El correo dejó de ser obligatorio: es un dato de contacto más. Si lo
  // escriben, tiene que ser uno de verdad; si no, no se pide.
  if (email && !email.includes("@")) return { error: "Ese correo no se ve bien. Revísalo o déjalo vacío." };
  if (datos.crearCuenta && datos.password.length < 6) {
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

  // El teléfono no se verifica (decisión del negocio: nada de SMS), así
  // que esta es la única barrera contra que dos personas terminen
  // peleándose un expediente. Se pregunta ANTES de crear la cuenta de
  // Auth, aunque completar_alta_cliente lo vuelva a decidir dentro de su
  // transacción: sin esto, un teléfono ya registrado dejaría atrás una
  // cuenta huérfana en cada intento.
  const { data: estadoTel } = await admin.rpc("estado_telefono_alta", {
    p_telefono: telefono,
  });
  const estado = (Array.isArray(estadoTel) ? estadoTel[0] : estadoTel) as
    | { existe_cliente: boolean; tiene_cuenta: boolean; nombre: string | null }
    | null;

  if (estado?.tiene_cuenta) {
    return {
      error:
        "Ya hay una cuenta registrada con ese teléfono. Si es tuya, inicia sesión; si no la recuerdas, pídele a recepción que te la restablezca desde el mismo WhatsApp.",
    };
  }

  // email_confirm: true a propósito. La persona no llegó por un correo
  // que haya que verificar: llegó por un link que recepción le mandó a su
  // WhatsApp y está capturando frente a la pantalla. Pedirle además que
  // salga a confirmar un correo para poder entrar rompería el alta justo
  // en el último paso, que es donde más gente se cae.
  let userId: string | null = null;

  if (datos.crearCuenta) {
    // La cuenta se registra con un correo derivado del teléfono, no con el
    // correo que la persona haya escrito: así el login por teléfono
    // funciona siempre, y el correo de contacto puede cambiar (o no
    // existir) sin tocar la forma de entrar. Ver src/lib/auth/identidad.ts.
    const { data: creado, error: errorCuenta } = await admin.auth.admin.createUser({
      email: correoSinteticoDeTelefono(telefono),
      password: datos.password,
      email_confirm: true,
    });

    if (errorCuenta || !creado.user) {
      const mensaje = errorCuenta?.message ?? "";
      if (/already|registered|exists/i.test(mensaje)) {
        return {
          error:
            "Ya hay una cuenta registrada con ese teléfono. Si es tuya, inicia sesión; si no la recuerdas, pídele a recepción que te la restablezca.",
        };
      }
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }
    userId = creado.user.id;
  }

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
    if (userId) await admin.auth.admin.deleteUser(userId);
    return { error: errorAlta.message || "No pudimos completar tu alta. Intenta de nuevo." };
  }

  const salida = resultado as {
    cliente_id: string;
    perros: PerroCreado[];
    contratos: ContratoPendiente[];
  } | null;
  return {
    error: null,
    clienteId: salida?.cliente_id,
    perros: salida?.perros ?? [],
    contratos: salida?.contratos ?? [],
  };
}

// El otro flujo: un cliente que YA tiene expediente y ahora entra por el
// otro servicio. Aquí no se crea nada de cero — se rellena lo que falta y
// se genera el contrato que no ha firmado.
//
// La autorización tiene dos llaves, no una: el token del link dice de qué
// expediente hablamos, y la sesión del propio dueño dice que es él. El
// alta nueva no puede pedir sesión (todavía no existe la cuenta), pero un
// complemento sí, y ahí no hay razón para conformarse con menos: un link
// reenviado en un chat familiar no debería alcanzar para tocar el
// expediente de nadie.
export async function completarExpediente(
  token: string,
  datos: DatosComplemento
): Promise<ResultadoComplemento> {
  const admin = createSupabaseAdminClient();

  const { data: invitacion } = await admin
    .from("invitaciones_cliente")
    .select("id, cliente_id, usada_at, cancelada_at, expira_at")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!invitacion) return { error: "Este link no existe." };
  if (invitacion.cancelada_at) {
    return { error: "Este link fue cancelado. Pídele uno nuevo a recepción." };
  }
  if (invitacion.usada_at) return { error: "Este link ya se usó." };
  if (new Date(invitacion.expira_at as string) <= new Date()) {
    return { error: "Este link ya venció. Pídele uno nuevo a recepción." };
  }
  if (!invitacion.cliente_id) {
    return { error: "Este link es para un alta nueva, no para completar un expediente." };
  }

  // ¿Ya hay cuenta ligada a este expediente?
  const { data: perfil } = await admin
    .from("profiles")
    .select("id")
    .eq("cliente_id", invitacion.cliente_id)
    .limit(1)
    .maybeSingle();

  let userId: string | null = null;
  let creadoAqui = false;

  if (perfil) {
    // La sesión se lee del servidor, no de lo que mande la pantalla: el
    // id del usuario es justo el dato que no puede venir del cliente.
    const supabase = await createSupabaseServerClient();
    const { data: sesion } = await supabase.auth.getUser();
    if (!sesion.user) {
      return { error: "Inicia sesión con tu correo y contraseña para continuar." };
    }
    if (sesion.user.id !== perfil.id) {
      return { error: "Esa cuenta no es la de este expediente." };
    }
    userId = null; // ya está ligada: la función no tiene que ligar nada
  } else {
    if (datos.password.length < 6) {
      return { error: "La contraseña debe tener al menos 6 caracteres." };
    }

    // El teléfono sale del expediente, no de lo que mande la pantalla: es
    // el mismo con el que va a entrar, y no hay razón para volver a
    // pedírselo ni para dejar que lo cambie desde un formulario público.
    const { data: clienteDatos } = await admin
      .from("clientes")
      .select("telefono")
      .eq("id", invitacion.cliente_id)
      .single();
    const telefono = normalizarTelefono((clienteDatos?.telefono as string | null) ?? "");
    if (!telefono) {
      return { error: "Tu expediente no tiene un teléfono válido. Avísale a recepción." };
    }

    const { data: creado, error: errorCuenta } = await admin.auth.admin.createUser({
      email: correoSinteticoDeTelefono(telefono),
      password: datos.password,
      email_confirm: true,
    });

    if (errorCuenta || !creado.user) {
      const mensaje = errorCuenta?.message ?? "";
      if (/already|registered|exists/i.test(mensaje)) {
        return {
          error:
            "Ya hay una cuenta con tu teléfono. Inicia sesión; si no recuerdas la contraseña, pídele a recepción que te la restablezca.",
        };
      }
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }
    userId = creado.user.id;
    creadoAqui = true;
  }

  const { data: resultado, error } = await admin.rpc("completar_expediente_cliente", {
    p_token: token,
    p_user_id: userId,
    p_cliente: { direccion: datos.direccion.trim() },
    // Los teléfonos se normalizan igual que en el alta nueva, aquí y en
    // los perros nuevos: si no, el mismo número entra con guiones desde
    // un flujo y sin ellos desde el otro, y buscar por teléfono deja de
    // encontrarlo.
    p_perros: datos.perros.map((p) => ({
      ...p,
      ...(p.contacto_emergencia_telefono !== undefined && {
        contacto_emergencia_telefono:
          normalizarTelefono(p.contacto_emergencia_telefono) ?? p.contacto_emergencia_telefono,
      }),
      ...(p.veterinario_telefono !== undefined && {
        veterinario_telefono:
          normalizarTelefono(p.veterinario_telefono) ?? p.veterinario_telefono,
      }),
    })),
    p_perros_nuevos: datos.perrosNuevos.map((p) => ({
      ...p,
      contacto_emergencia_telefono:
        normalizarTelefono(p.contacto_emergencia_telefono) ?? p.contacto_emergencia_telefono,
      veterinario_telefono:
        normalizarTelefono(p.veterinario_telefono) ?? p.veterinario_telefono,
    })),
  });

  if (error) {
    // Misma compensación que el alta nueva: Auth es otro sistema y no
    // entra en la transacción de la base. Si el expediente no se pudo
    // completar, la cuenta recién creada se deshace — si no, queda una
    // cuenta huérfana que además bloquea ese correo para el siguiente
    // intento. La cuenta que YA existía nunca se toca.
    if (creadoAqui && userId) await admin.auth.admin.deleteUser(userId);
    return { error: error.message || "No pudimos completar tu expediente. Intenta de nuevo." };
  }

  const salida = resultado as {
    cliente_id: string;
    perros: PerroCreado[];
    contratos: ContratoPendiente[];
  } | null;
  return {
    error: null,
    clienteId: salida?.cliente_id,
    perros: salida?.perros ?? [],
    contratos: salida?.contratos ?? [],
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

/**
 * Iniciar sesión con teléfono desde una pantalla pública.
 *
 * La usa el link de complemento: ese link ya dice de qué expediente
 * hablamos, pero eso no basta para dejar entrar a nadie — la contraseña
 * es lo que prueba que quien lo abrió es el dueño. Se firma del lado del
 * servidor para que la cookie de sesión quede puesta antes de tocar el
 * expediente.
 */
export async function iniciarSesionPorTelefono(
  telefonoCrudo: string,
  password: string
): Promise<{ error: string | null }> {
  const telefono = normalizarTelefono(telefonoCrudo);
  if (!telefono) return { error: "Ese teléfono no se ve bien. Avísale a recepción." };
  if (!password) return { error: "Escribe tu contraseña." };

  const admin = createSupabaseAdminClient();
  const { data } = await admin.rpc("email_de_login_por_telefono", { p_telefono: telefono });
  const email = data as string | null;
  if (!email) {
    return { error: "Ese teléfono todavía no tiene cuenta. Créala aquí mismo." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error: "Esa contraseña no coincide. Si no la recuerdas, pídele a recepción que te la restablezca.",
    };
  }
  return { error: null };
}
