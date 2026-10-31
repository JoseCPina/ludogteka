import { createHash, randomInt } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clienteSinSesion } from "@/lib/supabase/sesion-por-rol";
import { normalizarTelefono } from "@/lib/telefono";
import { correoSinteticoDeTelefono } from "@/lib/auth/identidad";
import { numeroBot } from "@/lib/directorio/reclamo";
import { hoyNegocio } from "@/lib/formato";

/**
 * Entrar a la app para dueños por teléfono, sin contraseña (docs/app-duenos/PLAN.md, Fase 0).
 *
 * La persona escribe su número, ve un código de 6 letras y números en pantalla y lo manda ELLA al WhatsApp de PeluDesk
 * («ENTRAR ABC123»). El webhook del bot comprueba que el código exista, no haya vencido y venga de ESE número
 * (atenderEntrada); la pantalla pregunta cada pocos segundos y, verificado, canjea la entrada por una sesión:
 * la cuenta de Auth del teléfono (la misma que usa en el portal de cualquier negocio, o una nueva si no tenía) por
 * enlace mágico, en la cookie del portal. Así no hace falta una plantilla de autenticación de Meta y la verificación
 * es real: el mensaje llega del teléfono que dijo ser.
 */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I
const VIGENCIA_MIN = 15;
const TOPE_POR_DIA = 8;

export const PATRON_ENTRADA = /\bENTRAR\s*[:\-]?\s*([A-Za-z0-9]{6})\b/i;
export const textoEntrada = (codigo: string) => `ENTRAR ${codigo}`;

export type EstadoEntrada = { id: string; estado: "pendiente" | "verificada" | "usada" | "vencida"; codigo: string; waUrl: string | null; telefonoUlt4: string };

function codigoNuevo(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

function aEstado(r: { id: string; codigo: string; estado: EstadoEntrada["estado"]; telefono: string; expira_at: string }): EstadoEntrada {
  const bot = numeroBot();
  const vencida = r.estado === "pendiente" && new Date(r.expira_at).getTime() < Date.now();
  return {
    id: r.id,
    codigo: r.codigo,
    estado: vencida ? "vencida" : r.estado,
    telefonoUlt4: r.telefono.slice(-4),
    waUrl: bot ? `https://wa.me/${bot}?text=${encodeURIComponent(textoEntrada(r.codigo))}` : null,
  };
}

export async function pedirEntrada(o: { telefono: string; ip: string | null; userAgent: string | null }): Promise<{ error: string | null; entrada?: EstadoEntrada }> {
  const tel = normalizarTelefono(o.telefono);
  if (!tel) return { error: "Escribe tu número de WhatsApp a diez dígitos." };
  const db = createSupabaseAdminClient();
  const dia = hoyNegocio("America/Mexico_City");
  const ipHash = o.ip ? createHash("sha256").update(`${o.ip}|${dia}`).digest("hex").slice(0, 32) : null;
  // Un código pendiente del mismo teléfono que no ha vencido se reusa (recargar no genera otro).
  const { data: previo } = await db
    .from("app_entradas")
    .select("id, codigo, estado, telefono, expira_at")
    .eq("telefono", tel)
    .eq("estado", "pendiente")
    .gte("expira_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previo) return { error: null, entrada: aEstado(previo as Parameters<typeof aEstado>[0]) };
  const { count } = await db.from("app_entradas").select("id", { count: "exact", head: true }).eq("telefono", tel).gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= TOPE_POR_DIA) return { error: "Ya pediste varios códigos hoy. Manda el último que te dimos o intenta mañana." };
  for (let intento = 0; intento < 3; intento++) {
    const { data, error } = await db
      .from("app_entradas")
      .insert({ telefono: tel, codigo: codigoNuevo(), ip_hash: ipHash, user_agent: o.userAgent?.slice(0, 200) ?? null, expira_at: new Date(Date.now() + VIGENCIA_MIN * 60_000).toISOString(), updated_at: new Date().toISOString() })
      .select("id, codigo, estado, telefono, expira_at")
      .maybeSingle();
    if (error?.code === "23505") continue;
    if (error || !data) {
      console.error("[app] entrada", error?.message);
      return { error: "No pudimos generar tu código. Intenta de nuevo." };
    }
    return { error: null, entrada: aEstado(data as Parameters<typeof aEstado>[0]) };
  }
  return { error: "No pudimos generar tu código. Intenta de nuevo." };
}

export async function estadoEntrada(id: string): Promise<EstadoEntrada | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await createSupabaseAdminClient().from("app_entradas").select("id, codigo, estado, telefono, expira_at").eq("id", id).is("deleted_at", null).maybeSingle();
  return data ? aEstado(data as Parameters<typeof aEstado>[0]) : null;
}

/** El webhook del bot: «ENTRAR ABC123» desde un número. Devuelve qué contestar, o null si no es una entrada. Nunca lanza. */
export async function atenderEntrada(telefonoWa: string, texto: string | null | undefined): Promise<{ texto: string; verificada: boolean } | null> {
  const m = PATRON_ENTRADA.exec(texto ?? "");
  if (!m) return null;
  const codigo = m[1].toUpperCase();
  const tel = normalizarTelefono(telefonoWa);
  try {
    const db = createSupabaseAdminClient();
    const { data: fila } = await db.from("app_entradas").select("id, telefono, estado, expira_at").eq("codigo", codigo).in("estado", ["pendiente", "verificada"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!fila) return { texto: "No encontramos ese código o ya venció. Regresa a la app y pide uno nuevo.", verificada: false };
    if (!tel || fila.telefono !== tel) return { texto: "Ese código se pidió con otro número. Mándalo desde el número que escribiste en la app, o pide uno nuevo con este.", verificada: false };
    if (fila.estado === "verificada") return { texto: "Ese código ya está verificado. Regresa a la app: ya puedes entrar.", verificada: true };
    if (new Date(fila.expira_at as string).getTime() < Date.now()) {
      await db.from("app_entradas").update({ estado: "vencida" }).eq("id", fila.id);
      return { texto: "Ese código ya venció. Regresa a la app y pide uno nuevo: toma un segundo.", verificada: false };
    }
    await db.from("app_entradas").update({ estado: "verificada", verificada_at: new Date().toISOString() }).eq("id", fila.id).eq("estado", "pendiente");
    return { texto: "Listo, ya te reconocimos. Regresa a la app: la pantalla entra sola.", verificada: true };
  } catch (e) {
    console.error("[app] entrada webhook", e instanceof Error ? e.message : e);
    return { texto: "No pudimos verificar tu código en este momento. Intenta de nuevo en un minuto.", verificada: false };
  }
}

/** La cuenta de Auth de un teléfono: la que ya tiene (portal de cualquier negocio) o una nueva. */
async function cuentaDelTelefono(tel: string): Promise<{ email: string; nueva: boolean } | null> {
  const admin = createSupabaseAdminClient();
  const { data: existente } = await admin.rpc("email_de_persona_por_telefono", { p_telefono: tel });
  if (typeof existente === "string" && existente) return { email: existente, nueva: false };
  const email = correoSinteticoDeTelefono(tel);
  const { data: creado, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { telefono: tel, origen: "app_duenos" } });
  if (error) {
    // Puede existir sin membresía en ningún negocio (ya entró a la app antes): se usa tal cual.
    if (/already|exists|registered/i.test(error.message)) return { email, nueva: false };
    console.error("[app] crear cuenta", error.message);
    return null;
  }
  return creado.user ? { email, nueva: true } : null;
}

/** Abre la sesión en la cookie del portal (la de la app) con un enlace mágico canjeado en el servidor. */
async function abrirSesionPorEmail(email: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties?.hashed_token) {
    console.error("[app] generateLink", error?.message);
    return false;
  }
  const { data: canje, error: e2 } = await clienteSinSesion().auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (e2 || !canje.session) {
    console.error("[app] verifyOtp", e2?.message);
    return false;
  }
  const servidor = await createSupabaseServerClient("portal");
  await servidor.auth.setSession({ access_token: canje.session.access_token, refresh_token: canje.session.refresh_token });
  return true;
}

/** La pantalla, al ver la entrada verificada: la marca usada y abre la sesión. */
export async function canjearEntrada(id: string): Promise<{ error: string | null; nueva?: boolean }> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "No encontramos esa entrada." };
  const db = createSupabaseAdminClient();
  const { data: fila } = await db.from("app_entradas").select("id, telefono, estado, verificada_at").eq("id", id).eq("estado", "verificada").maybeSingle();
  if (!fila) return { error: "Esa entrada ya no sirve. Pide un código nuevo." };
  // Una entrada verificada se canjea una sola vez y dentro de los 10 minutos siguientes.
  if (Date.now() - new Date(fila.verificada_at as string).getTime() > 10 * 60_000) {
    await db.from("app_entradas").update({ estado: "vencida" }).eq("id", fila.id);
    return { error: "Pasó mucho tiempo desde que mandaste el código. Pide uno nuevo." };
  }
  const { data: marcada } = await db.from("app_entradas").update({ estado: "usada", usada_at: new Date().toISOString() }).eq("id", fila.id).eq("estado", "verificada").select("id").maybeSingle();
  if (!marcada) return { error: "Esa entrada ya se usó. Pide un código nuevo." };
  const cuenta = await cuentaDelTelefono(fila.telefono as string);
  if (!cuenta) return { error: "No pudimos abrir tu cuenta. Intenta de nuevo en un momento." };
  if (!(await abrirSesionPorEmail(cuenta.email))) return { error: "No pudimos abrir tu sesión. Intenta de nuevo." };
  return { error: null, nueva: cuenta.nueva };
}

/** Quien ya tiene contraseña (clientes de un negocio) puede entrar con ella; es el camino secundario. */
export async function entrarConContrasena(o: { telefono: string; password: string }): Promise<{ error: string | null }> {
  const tel = normalizarTelefono(o.telefono);
  if (!tel) return { error: "Escribe tu número de WhatsApp a diez dígitos." };
  if (!o.password) return { error: "Escribe tu contraseña." };
  const admin = createSupabaseAdminClient();
  const { data: email } = await admin.rpc("email_de_persona_por_telefono", { p_telefono: tel });
  if (typeof email !== "string" || !email) return { error: "No encontramos una cuenta con contraseña para ese número. Entra con el código por WhatsApp." };
  const { data, error } = await clienteSinSesion().auth.signInWithPassword({ email, password: o.password });
  if (error || !data.session) return { error: "La contraseña no coincide. Si no la recuerdas, entra con el código por WhatsApp." };
  const servidor = await createSupabaseServerClient("portal");
  await servidor.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  return { error: null };
}
