"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { correoSinteticoDeTelefono } from "@/lib/auth/identidad";
import { normalizarTelefono } from "@/lib/telefono";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { NEGOCIO_ORIGINAL_ID } from "@/lib/negocio/legado";
import { DOCUMENTOS_LEGALES } from "@/lib/peludesk/legal";
import { COOKIE_CONSENTIMIENTO, leerConsentimiento } from "@/lib/peludesk/cookies";
import { origenDe } from "@/lib/peludesk/origen";
import { enviarConversion } from "@/lib/peludesk/capi";

// Lo que la persona escribió regresa con el error: React limpia el
// formulario al terminar la acción y sin esto tendría que capturar todo de
// nuevo. La contraseña nunca regresa.
export type ValoresRegistro = { nombre: string; negocio: string; ciudad: string; telefono: string; servicios: string[] };
// destino + eventId: el registro salió bien; el navegador manda CompleteRegistration
// al píxel (con ese mismo eventId, que el servidor usó en la API de conversiones)
// y luego entra al negocio. Es aquí, en peludesk.mx, donde vive el píxel: el
// negocio nuevo está en otro dominio y no lo lleva.
export type EstadoRegistro = { error: string | null; valores?: ValoresRegistro; destino?: string; eventId?: string };

// De qué negocio se copia la configuración base (servicios, requisitos,
// alertas, horario): el mismo modelo que usa la plataforma al dar de alta.
const MODELO = process.env.PELUDESK_NEGOCIO_MODELO_ID ?? NEGOCIO_ORIGINAL_ID;
const DIAS_PRUEBA = 15;
const SERVICIOS = ["estetica", "guarderia", "hotel", "veterinaria"];

/**
 * Prueba gratis desde peludesk.mx, sin que nadie de PeluDesk intervenga:
 * la cuenta de la persona (entra con su teléfono y su contraseña), su
 * negocio en <slug>.peludesk.mx con la configuración base y ella como
 * admin, y 15 días de prueba con todo el plan Completo, pero prendidos solo
 * los servicios que ofrece (y el plan sugerido según eso). Luego la sesión se abre en el dominio del
 * negocio (/auth/entrar) y aterriza en /bienvenida.
 *
 * Límites (en la base, registrar_negocio_prueba): un negocio por teléfono,
 * tres registros por IP al día. Y un campo trampa que una persona no ve.
 */
export async function registrarPrueba(previo: EstadoRegistro, fd: FormData): Promise<EstadoRegistro> {
  const valores: ValoresRegistro = {
    nombre: String(fd.get("nombre") ?? "").trim(),
    negocio: String(fd.get("negocio") ?? "").trim(),
    ciudad: String(fd.get("ciudad") ?? "").trim(),
    telefono: String(fd.get("telefono") ?? "").trim(),
    servicios: fd.getAll("servicios").map(String),
  };
  const r = await registrar(fd);
  return r.error ? { ...r, valores } : r;
}

async function registrar(fd: FormData): Promise<EstadoRegistro> {
  if (String(fd.get("sitio_web") ?? "")) return { error: "No pudimos registrar tu negocio. Intenta de nuevo." };

  const nombre = String(fd.get("nombre") ?? "").trim();
  const negocio = String(fd.get("negocio") ?? "").trim();
  const ciudad = String(fd.get("ciudad") ?? "").trim();
  const telefono = normalizarTelefono(String(fd.get("telefono") ?? ""));
  const password = String(fd.get("password") ?? "");
  // La casilla de términos y aviso: obligatoria, y se comprueba aquí, no solo en el navegador.
  if (fd.get("acepto") !== "on") return { error: "Para abrir tu negocio, acepta los términos y el aviso de privacidad." };

  if (nombre.length < 3) return { error: "Escribe tu nombre." };
  if (negocio.length < 3 || negocio.length > 60) return { error: "Escribe el nombre de tu negocio (de 3 a 60 letras)." };
  if (!telefono) return { error: "Escribe tu teléfono a diez dígitos." };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };
  const servicios = fd.getAll("servicios").map(String).filter((s) => SERVICIOS.includes(s));
  if (servicios.length === 0) return { error: "Escoge al menos un servicio que ofrece tu negocio." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const ua = h.get("user-agent")?.slice(0, 400) ?? null;
  const jar = await cookies();
  const consentimiento = leerConsentimiento(jar.get(COOKIE_CONSENTIMIENTO)?.value);
  const admin = createSupabaseAdminClient();

  const { data: motivo } = await admin.rpc("puede_registrar_prueba", { p_telefono: telefono, p_ip: ip });
  if (motivo) return { error: motivo as string };

  // La cuenta: su teléfono es su identidad. Si ese teléfono ya tiene cuenta
  // en PeluDesk (por ejemplo, es cliente de algún negocio), se usa ESA
  // cuenta, pero solo si la contraseña es la suya: así se comprueba que es
  // la misma persona, y nunca se toma una cuenta ajena.
  const { data: correoExistente } = await admin.rpc("email_de_persona_por_telefono", { p_telefono: telefono });
  let personaId: string;
  let email: string;
  let creadaAqui = false;
  if (correoExistente) {
    email = correoExistente as string;
    const comprobar = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: sesion, error } = await comprobar.auth.signInWithPassword({ email, password });
    if (error || !sesion.user) {
      return { error: "Ese teléfono ya tiene una cuenta en PeluDesk. Escribe la contraseña con la que ya entras para abrir tu negocio con esa misma cuenta." };
    }
    personaId = sesion.user.id;
    await comprobar.auth.signOut();
  } else {
    email = correoSinteticoDeTelefono(telefono);
    const { data: creado, error: errorCuenta } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre_completo: nombre },
    });
    if (errorCuenta || !creado.user) {
      console.error("[registro] createUser", errorCuenta?.message);
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo en un momento." };
    }
    personaId = creado.user.id;
    creadaAqui = true;
    // El nombre con el que la app la saluda (Auth no lo pasa solo al perfil).
    await admin.from("profiles").update({ nombre_completo: nombre }).eq("id", personaId);
  }

  // La evidencia de la aceptación (versión, fecha, IP y navegador) se guarda
  // ANTES de abrir el negocio: sin ella no se registra a nadie.
  const { error: errorAceptacion } = await admin.from("aceptaciones_legales").insert(
    (["terminos", "aviso_privacidad"] as const).map((documento) => ({
      persona_id: personaId,
      telefono,
      documento,
      version: DOCUMENTOS_LEGALES[documento].version,
      ip,
      user_agent: ua,
    }))
  );
  if (errorAceptacion) {
    if (creadaAqui) await admin.auth.admin.deleteUser(personaId);
    console.error("[registro] aceptaciones_legales", errorAceptacion.code, errorAceptacion.message);
    return { error: "No pudimos registrar tu aceptación. Intenta de nuevo en un momento." };
  }

  const { data: filas, error: errorNegocio } = await admin.rpc("registrar_negocio_prueba", {
    p_nombre: negocio,
    p_ciudad: ciudad || null,
    p_telefono: telefono,
    p_ip: ip,
    p_persona_id: personaId,
    p_modelo: MODELO,
    p_dias: DIAS_PRUEBA,
    p_servicios: servicios,
  });
  const alta = (filas as { negocio_id: string; slug: string }[] | null)?.[0];
  if (errorNegocio || !alta) {
    if (creadaAqui) await admin.auth.admin.deleteUser(personaId);
    console.error("[registro] registrar_negocio_prueba", errorNegocio?.code, errorNegocio?.message);
    // Los motivos de los límites los redacta la base para mostrarse tal cual.
    const propio = errorNegocio?.code === "P0001" && /teléfono|conexión/.test(errorNegocio.message);
    return { error: propio ? errorNegocio!.message : "No pudimos abrir tu negocio. Intenta de nuevo en un momento." };
  }

  // De dónde llegó (etiquetas utm siempre; el clic de Meta solo con marketing aceptado) y qué versión aceptó.
  const origen = origenDe((k) => fd.get(k), consentimiento.marketing);
  const { error: errorOrigen } = await admin
    .from("registros_prueba")
    .update({ ...origen, terminos_version: DOCUMENTOS_LEGALES.terminos.version, aviso_version: DOCUMENTOS_LEGALES.aviso_privacidad.version })
    .eq("negocio_id", alta.negocio_id);
  if (errorOrigen) console.error("[registro] origen", errorOrigen.code, errorOrigen.message);

  // API de conversiones de Meta, deduplicada con el píxel por el mismo event_id. Solo con marketing aceptado.
  const eventId = crypto.randomUUID();
  if (consentimiento.marketing) {
    await enviarConversion({
      nombre: "CompleteRegistration",
      eventId,
      url: "https://peludesk.mx/registro",
      ip,
      userAgent: ua,
      fbp: jar.get("_fbp")?.value ?? null,
      fbc: jar.get("_fbc")?.value ?? null,
      telefono,
      contenido: "negocio_de_prueba",
    });
  }

  // Sesión en SU dominio: un link de un solo uso que se canjea allá.
  const { data: link, error: errorLink } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const destino = urlDelNegocio({ slug: alta.slug, dominio: null, url_publica: null });
  if (errorLink || !link.properties?.hashed_token) {
    console.error("[registro] generateLink", errorLink?.message);
    return { error: null, destino: `${destino}/login`, eventId };
  }
  return { error: null, destino: `${destino}/auth/entrar?token_hash=${encodeURIComponent(link.properties.hashed_token)}&next=/bienvenida`, eventId };
}
