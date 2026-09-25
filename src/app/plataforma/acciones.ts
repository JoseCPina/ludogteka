"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { SLUGS_RESERVADOS } from "@/lib/negocio/host";
import { generarPasswordTemporal } from "@/lib/auth/identidad";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";

// La administración de PeluDesk. Toda escritura va con la sesión de quien
// administra (su JWT): la base comprueba es_admin_plataforma() en cada
// función y política. La secret key solo se usa para lo que es de Auth
// (crear una cuenta, cambiar una contraseña, ver si un correo ya existe),
// y siempre DESPUÉS de comprobar la sesión de plataforma.

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const NO_AUTORIZADO: ResultadoPlataforma = { error: "Tu sesión de administración de PeluDesk terminó. Vuelve a entrar." };

export async function entrarPlataforma(_previo: { error: string | null }, fd: FormData): Promise<{ error: string | null }> {
  const email = texto(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu correo y tu contraseña." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Correo o contraseña incorrectos." };
  const { data: es } = await supabase.rpc("es_admin_plataforma");
  if (es !== true) {
    await supabase.auth.signOut();
    return { error: "Esa cuenta no es de la administración de PeluDesk." };
  }
  redirect("/plataforma");
}

export async function salirPlataforma() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/plataforma/entrar");
}

type NegocioParaLink = { id: string; slug: string; dominio: string | null; url_publica: string | null; nombre: string };

// El primer admin (o uno más) de un negocio. Si el correo ya tiene cuenta
// en PeluDesk, se le da la membresía y entra con su misma contraseña; si
// no, se crea la cuenta y se regresa un link de un solo uso, en el dominio
// DEL NEGOCIO, para que escoja su contraseña.
async function darAdmin(
  s: NonNullable<Awaited<ReturnType<typeof sesionPlataforma>>>,
  negocio: NegocioParaLink,
  email: string,
  nombre: string
): Promise<ResultadoPlataforma> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Escribe un correo válido para el admin." };
  const admin = createSupabaseAdminClient();
  const { data: existente } = await admin.rpc("usuario_por_email", { p_email: email });
  let personaId = existente as string | null;
  let link: string | undefined;
  if (!personaId) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: { nombre_completo: nombre || null } } });
    if (error || !data.user) return { error: "No pudimos crear la cuenta del admin. Intenta de nuevo." };
    personaId = data.user.id;
    if (nombre) await admin.from("profiles").update({ nombre_completo: nombre }).eq("id", personaId).is("nombre_completo", null);
    link = `${urlDelNegocio(negocio)}/auth/callback?token_hash=${data.properties.hashed_token}&type=invite`;
  }
  const { error } = await s.supabase.rpc("agregar_admin_negocio", { p_negocio_id: negocio.id, p_profile_id: personaId });
  if (error) return { error: error.message };
  return link
    ? { error: null, link, exito: `Se creó la cuenta de ${email}. Pásale este link (un solo uso) para que escoja su contraseña.` }
    : { error: null, exito: `${email} ya tenía cuenta en PeluDesk: ya es admin de ${negocio.nombre} y entra en ${urlDelNegocio(negocio)} con su misma contraseña.` };
}

async function negocioParaLink(s: NonNullable<Awaited<ReturnType<typeof sesionPlataforma>>>, id: string): Promise<NegocioParaLink | null> {
  const { data } = await s.supabase.rpc("plataforma_negocios");
  const n = ((data ?? []) as NegocioParaLink[]).find((x) => x.id === id);
  return n ?? null;
}

export async function crearNegocio(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const nombre = texto(fd, "nombre");
  const slug = texto(fd, "slug").toLowerCase();
  const zona = texto(fd, "zona");
  const ciudad = texto(fd, "ciudad");
  const dominio = texto(fd, "dominio").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const color = texto(fd, "color");
  const adminEmail = texto(fd, "admin_email").toLowerCase();
  const adminNombre = texto(fd, "admin_nombre");
  if (!nombre) return { error: "Escribe el nombre del negocio." };
  if (!/^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/.test(slug)) return { error: "La dirección corta solo lleva minúsculas, números y guiones (p. ej. huellitas)." };
  if (SLUGS_RESERVADOS.has(slug)) return { error: `«${slug}» está reservado para PeluDesk. Escoge otra dirección corta.` };
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "El color va como #RRGGBB." };
  if (!adminEmail) return { error: "Escribe el correo de quien va a administrar el negocio." };

  const { data: id, error } = await s.supabase.rpc("crear_negocio", {
    p_slug: slug,
    p_nombre: nombre,
    p_zona_horaria: zona || "America/Mexico_City",
    p_ciudad: ciudad || null,
    p_dominio: dominio || null,
  });
  if (error || !id) {
    if (error?.code === "23505") return { error: "Ya hay un negocio con esa dirección corta o ese dominio." };
    return { error: error?.message ?? "No pudimos dar de alta el negocio." };
  }
  if (color) {
    const { error: e2 } = await s.supabase.rpc("plataforma_actualizar_negocio", {
      p_negocio_id: id, p_nombre: nombre, p_zona_horaria: zona || "America/Mexico_City", p_ciudad: ciudad || null,
      p_dominio: dominio || null, p_url_publica: null, p_activo: true, p_marca: { color },
    });
    if (e2) return { error: `El negocio quedó dado de alta, pero no su color: ${e2.message}` };
  }
  await s.supabase.rpc("plataforma_registrar_evento", {
    p_accion: "crear_negocio", p_negocio_id: id, p_persona_id: null, p_motivo: null, p_detalle: { slug, nombre, zona },
  });
  const r = await darAdmin(s, { id: id as string, slug, dominio: dominio || null, url_publica: null, nombre }, adminEmail, adminNombre);
  revalidatePath("/plataforma");
  if (r.error) return { error: `El negocio quedó dado de alta, pero no su admin: ${r.error} Agrégalo desde la ficha del negocio.`, ir: `/plataforma/negocios/${id}` };
  return { ...r, ir: undefined, exito: `${nombre} quedó dado de alta. ${r.exito}` };
}

export async function agregarAdmin(negocioId: string, fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const negocio = await negocioParaLink(s, negocioId);
  if (!negocio) return { error: "Ese negocio no existe." };
  const r = await darAdmin(s, negocio, texto(fd, "admin_email").toLowerCase(), texto(fd, "admin_nombre"));
  revalidatePath(`/plataforma/negocios/${negocioId}`);
  return r;
}

export async function actualizarNegocio(negocioId: string, fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const color = texto(fd, "color");
  const favicon = texto(fd, "favicon");
  const urlPublica = texto(fd, "url_publica").toLowerCase().replace(/\/$/, "");
  const dominio = texto(fd, "dominio").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "El color va como #RRGGBB." };
  if (favicon && !/^\/(?!\/)[\w\-./]+$/.test(favicon) && !/^https:\/\/[^\s"'<>]+$/.test(favicon))
    return { error: "El ícono va como una ruta del sitio (/iconos/negocio.png) o una dirección https." };
  if (urlPublica && !/^https:\/\/[a-z0-9.-]+$/.test(urlPublica)) return { error: "La dirección pública va como https://www.ejemplo.mx, sin nada después." };
  const { error } = await s.supabase.rpc("plataforma_actualizar_negocio", {
    p_negocio_id: negocioId,
    p_nombre: texto(fd, "nombre"),
    p_zona_horaria: texto(fd, "zona"),
    p_ciudad: texto(fd, "ciudad") || null,
    p_dominio: dominio || null,
    p_url_publica: urlPublica || null,
    p_activo: fd.get("activo") === "on",
    p_marca: { color: color || null, favicon: favicon || null },
  });
  if (error) return { error: error.message };
  revalidatePath(`/plataforma/negocios/${negocioId}`);
  revalidatePath("/plataforma");
  return { error: null, exito: "Guardado. El dominio del negocio lo toma en menos de un minuto." };
}

// Soporte: restablecer la contraseña de una persona (en cualquier negocio,
// o en varios). Con motivo, y queda en la bitácora de la plataforma.
export async function restablecerPasswordPersona(personaId: string, motivo: string): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  if (motivo.trim().length < 5) return { error: "Escribe por qué (quién lo pidió y cómo se comprobó que era la persona)." };
  const { data: filas, error: errBusqueda } = await s.supabase.rpc("plataforma_buscar_personas_por_id", { p_persona_id: personaId });
  if (errBusqueda) return { error: errBusqueda.message };
  const persona = ((filas ?? []) as { persona_id: string; telefonos: string[] | null; es_plataforma: boolean }[])[0];
  if (!persona) return { error: "No encontramos a esa persona." };
  if (persona.es_plataforma) return { error: "La contraseña de la administración de PeluDesk no se cambia desde aquí." };
  // Primero la bitácora: si no se puede dejar constancia, no se cambia nada.
  const { error: errEvento } = await s.supabase.rpc("plataforma_registrar_evento", {
    p_accion: "restablecer_password", p_negocio_id: null, p_persona_id: personaId, p_motivo: motivo.trim(), p_detalle: {},
  });
  if (errEvento) return { error: errEvento.message };
  const password = generarPasswordTemporal();
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(personaId, { password });
  if (error) return { error: "No pudimos cambiar la contraseña. Intenta de nuevo." };
  const telefono = (persona.telefonos ?? [])[0];
  const mensaje =
    `Hola, te restablecimos tu contraseña de PeluDesk (la misma cuenta con la que entras a tus negocios).\n\n` +
    `Entra con tu teléfono y esta contraseña: ${password}\n\nCámbiala en cuanto entres.`;
  return {
    error: null,
    password,
    urlWhatsApp: telefono ? `https://wa.me/52${telefono}?text=${encodeURIComponent(mensaje)}` : undefined,
    exito: "Contraseña restablecida. Pásasela a la persona; no se vuelve a mostrar.",
  };
}

// ── Catálogos compartidos entre todos los negocios ──
export async function guardarRaza(fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  const id = texto(fd, "id");
  const nombre = texto(fd, "nombre");
  const alias = texto(fd, "alias").split(",").map((a) => a.trim()).filter(Boolean);
  if (!nombre) return { error: "Escribe el nombre de la raza." };
  const datos = { nombre, alias, es_desconocida: fd.get("es_desconocida") === "on" };
  const r = id
    ? await s.supabase.from("razas").update(datos).eq("id", id).select("id")
    : await s.supabase.from("razas").insert(datos).select("id");
  if (r.error) return { error: r.error.code === "23505" ? "Ya hay una raza con ese nombre." : r.error.message };
  if (!r.data?.length) return { error: "La base no dejó guardar (¿sigues siendo de la administración de PeluDesk?)." };
  await s.supabase.rpc("plataforma_registrar_evento", {
    p_accion: "editar_catalogo", p_negocio_id: null, p_persona_id: null, p_motivo: null, p_detalle: { tabla: "razas", id: r.data[0].id, ...datos },
  });
  revalidatePath("/plataforma/catalogos");
  return { error: null, exito: id ? "Raza guardada." : "Raza agregada. Cada negocio le asigna su grupo de precio." };
}

const CATALOGOS_ETIQUETA = new Set(["tamanos_categoria", "tipos_pelaje", "unidades_medida"]);

export async function guardarEtiqueta(tabla: string, fd: FormData): Promise<ResultadoPlataforma> {
  const s = await sesionPlataforma();
  if (!s) return NO_AUTORIZADO;
  if (!CATALOGOS_ETIQUETA.has(tabla)) return { error: "Catálogo desconocido." };
  const id = texto(fd, "id");
  const etiqueta = texto(fd, "etiqueta");
  if (!etiqueta) return { error: "Escribe la etiqueta." };
  const r = await s.supabase.from(tabla).update({ etiqueta }).eq("id", id).select("id");
  if (r.error) return { error: r.error.message };
  if (!r.data?.length) return { error: "La base no dejó guardar (¿sigues siendo de la administración de PeluDesk?)." };
  await s.supabase.rpc("plataforma_registrar_evento", {
    p_accion: "editar_catalogo", p_negocio_id: null, p_persona_id: null, p_motivo: null, p_detalle: { tabla, id, etiqueta },
  });
  revalidatePath("/plataforma/catalogos");
  return { error: null, exito: "Guardado." };
}
