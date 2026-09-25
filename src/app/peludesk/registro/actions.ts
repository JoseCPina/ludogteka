"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { correoSinteticoDeTelefono } from "@/lib/auth/identidad";
import { normalizarTelefono } from "@/lib/telefono";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { NEGOCIO_ORIGINAL_ID } from "@/lib/negocio/legado";

export type EstadoRegistro = { error: string | null };

// De qué negocio se copia la configuración base (servicios, requisitos,
// alertas, horario): el mismo modelo que usa la plataforma al dar de alta.
const MODELO = process.env.PELUDESK_NEGOCIO_MODELO_ID ?? NEGOCIO_ORIGINAL_ID;
const DIAS_PRUEBA = 30;

/**
 * Prueba gratis desde peludesk.mx, sin que nadie de PeluDesk intervenga:
 * la cuenta de la persona (entra con su teléfono y su contraseña), su
 * negocio en <slug>.peludesk.mx con la configuración base y ella como
 * admin, y 30 días de prueba. Luego la sesión se abre en el dominio del
 * negocio (/auth/entrar) y aterriza en /bienvenida.
 *
 * Límites (en la base, registrar_negocio_prueba): un negocio por teléfono,
 * tres registros por IP al día. Y un campo trampa que una persona no ve.
 */
export async function registrarPrueba(_previo: EstadoRegistro, fd: FormData): Promise<EstadoRegistro> {
  if (String(fd.get("sitio_web") ?? "")) return { error: "No pudimos registrar tu negocio. Intenta de nuevo." };

  const nombre = String(fd.get("nombre") ?? "").trim();
  const negocio = String(fd.get("negocio") ?? "").trim();
  const ciudad = String(fd.get("ciudad") ?? "").trim();
  const telefono = normalizarTelefono(String(fd.get("telefono") ?? ""));
  const password = String(fd.get("password") ?? "");

  if (nombre.length < 3) return { error: "Escribe tu nombre." };
  if (negocio.length < 3 || negocio.length > 60) return { error: "Escribe el nombre de tu negocio (de 3 a 60 letras)." };
  if (!telefono) return { error: "Escribe tu teléfono a diez dígitos." };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
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

  const { data: filas, error: errorNegocio } = await admin.rpc("registrar_negocio_prueba", {
    p_nombre: negocio,
    p_ciudad: ciudad || null,
    p_telefono: telefono,
    p_ip: ip,
    p_persona_id: personaId,
    p_modelo: MODELO,
    p_dias: DIAS_PRUEBA,
  });
  const alta = (filas as { negocio_id: string; slug: string }[] | null)?.[0];
  if (errorNegocio || !alta) {
    if (creadaAqui) await admin.auth.admin.deleteUser(personaId);
    console.error("[registro] registrar_negocio_prueba", errorNegocio?.code, errorNegocio?.message);
    // Los motivos de los límites los redacta la base para mostrarse tal cual.
    const propio = errorNegocio?.code === "P0001" && /teléfono|conexión/.test(errorNegocio.message);
    return { error: propio ? errorNegocio!.message : "No pudimos abrir tu negocio. Intenta de nuevo en un momento." };
  }

  // Sesión en SU dominio: un link de un solo uso que se canjea allá.
  const { data: link, error: errorLink } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const destino = urlDelNegocio({ slug: alta.slug, dominio: null, url_publica: null });
  if (errorLink || !link.properties?.hashed_token) {
    console.error("[registro] generateLink", errorLink?.message);
    redirect(`${destino}/login`);
  }
  redirect(`${destino}/auth/entrar?token_hash=${encodeURIComponent(link.properties.hashed_token)}&next=/bienvenida`);
}
