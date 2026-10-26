// El Flow «PeluDesk · Prueba gratis» del lado del servidor: ofrecerlo (una fila en wa_flow_sesiones por envío), lo
// que el endpoint lee y guarda de cada sesión, abrir el negocio al completarlo (igual que /registro), la liga de
// entrada de un solo uso y el respaldo por texto. Todo con la secret key y SOLO tablas de la plataforma, salvo el
// alta del negocio (las mismas funciones que /registro) y la página del prospecto.
import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { correoSinteticoDeTelefono } from "@/lib/auth/identidad";
import { MARCA_CAMBIO_PASSWORD } from "@/lib/auth/cambio-obligatorio";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { NEGOCIO_ORIGINAL_ID } from "@/lib/negocio/legado";
import { DOCUMENTOS_LEGALES } from "@/lib/peludesk/legal";
import { urlPlataforma } from "@/lib/pagos/urls";
import { publicarPaginaDeProspecto } from "@/lib/web-negocio/publicar";
import { avisarOperador } from "@/lib/soporte/notificar";
import type { ProspectoContexto } from "../agente";
import { ClienteWA, configWhatsApp, marcarNumeroContesta, registroDeProspecto } from "../infra";
import { CTA_FLOW, type DatosFlow, esGiro, giroDeProspecto, serviciosDeGiro } from "./definicion";
import type { DepsIntercambio, EstadoSesion, SesionFlow } from "./intercambio";

export type PuntoFlow =
  | "saludo" | "menu" | "precio" | "prueba" | "prospeccion" | "anuncio" | "manual"
  // Los del guion de ventas (src/lib/whatsapp/ventas/).
  | "cierre" | "objecion" | "funcion" | "ya_cuenta" | "cliente" | "seguimiento";

const MODELO = process.env.PELUDESK_NEGOCIO_MODELO_ID ?? NEGOCIO_ORIGINAL_ID;
const DIAS_PRUEBA = 15;
export const VIGENCIA_ACCESO_MS = 24 * 3600_000;
/** Sin abrir el Flow en este tiempo (y sin escribir nada), el bot manda la prueba por texto. */
export const ESPERA_RESPALDO_MS = 10 * 60_000;

export function configFlow() {
  return {
    flowId: process.env.WHATSAPP_FLOW_ID?.trim() ?? "",
    // En Vercel la llave va con sus saltos de línea; si alguien la pegó con «\n» literales, también sirve.
    llavePrivada: (process.env.WHATSAPP_FLOW_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim(),
    frase: process.env.WHATSAPP_FLOW_PASSPHRASE?.trim() || undefined,
    borrador: process.env.WHATSAPP_FLOW_BORRADOR === "1",
  };
}

const tel10 = (telefono: string) => (/^52[0-9]{10}$/.test(telefono) ? telefono.slice(2) : null);
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

export function clienteWA() {
  const cfg = configWhatsApp();
  return new ClienteWA(cfg.token, cfg.phoneNumberId, marcarNumeroContesta);
}

type FilaSesion = {
  id: string;
  flow_token: string;
  telefono: string;
  punto: PuntoFlow;
  fuente: string;
  prospecto_id: string | null;
  anuncio_id: string | null;
  ref: string | null;
  estado: EstadoSesion;
  enviado_at: string;
  datos: Partial<DatosFlow> | null;
  intentos: number;
  updated_at: string;
};

const COLUMNAS = "id, flow_token, telefono, punto, fuente, prospecto_id, anuncio_id, ref, estado, enviado_at, datos, intentos, updated_at";

function fuenteDe(p: ProspectoContexto | null | undefined): string {
  if (!p) return "directo";
  if (p.anuncio || p.fuente === "anuncio_meta") return "anuncio_meta";
  return p.fuente === "manual" ? "manual" : "google_places";
}

/**
 * Manda el Flow con el botón «Probar gratis». false = no salió (sin Flow configurado, número de fuera de México o
 * Meta lo rechazó): quien llama manda el texto de siempre.
 */
export async function ofrecerFlow(telefono: string, punto: PuntoFlow, cuerpo: string, prospecto?: ProspectoContexto | null, wa: ClienteWA = clienteWA(), pie?: string): Promise<boolean> {
  const cfg = configFlow();
  if (!cfg.flowId || !tel10(telefono)) return false;
  const sb = createSupabaseAdminClient();
  const flowToken = randomBytes(24).toString("base64url");
  const ref = prospecto?.por === "referencia" && prospecto.slug ? prospecto.slug.slice(-5) : null;
  const { data: fila, error } = await sb
    .from("wa_flow_sesiones")
    .insert({
      flow_token: flowToken,
      telefono,
      punto,
      fuente: fuenteDe(prospecto),
      prospecto_id: prospecto?.id ?? null,
      anuncio_id: prospecto?.anuncioId && /^[0-9]{1,40}$/.test(prospecto.anuncioId) ? prospecto.anuncioId : null,
      ref: ref && /^[a-z0-9]{5}$/.test(ref) ? ref : null,
    })
    .select("id")
    .single();
  if (error || !fila) {
    console.error("[whatsapp-flow] no se guardó la sesión", error?.message);
    return false;
  }
  const r = await wa.flow(telefono, { cuerpo, flowId: cfg.flowId, flowToken, cta: CTA_FLOW, borrador: cfg.borrador, pie });
  if (!r.ok) {
    await sb.from("wa_flow_sesiones").update({ respaldo_at: new Date().toISOString(), error: `No salió: ${(r.error ?? "sin detalle").slice(0, 400)}` }).eq("id", fila.id);
    return false;
  }
  if (r.id) await sb.from("wa_flow_sesiones").update({ wa_message_id: r.id }).eq("id", fila.id);
  return true;
}

async function sesionPorToken(flowToken: string): Promise<FilaSesion | null> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(flowToken)) return null;
  const { data } = await createSupabaseAdminClient().from("wa_flow_sesiones").select(COLUMNAS).eq("flow_token", flowToken).is("deleted_at", null).maybeSingle();
  return (data as FilaSesion | null) ?? null;
}

/** El prospecto de la sesión, o el de ese teléfono (el número desde el que le escribió al bot, o el de Google). */
async function prospectoDe(s: Pick<FilaSesion, "prospecto_id" | "telefono">) {
  const sb = createSupabaseAdminClient();
  const cols = "id, nombre, giro, ciudad, slug, fuente, correo, anuncio_at";
  if (s.prospecto_id) {
    const { data } = await sb.from("prospectos").select(cols).eq("id", s.prospecto_id).is("deleted_at", null).maybeSingle();
    if (data) return data;
  }
  const t = tel10(s.telefono);
  if (!t) return null;
  const { data: porBot } = await sb.from("prospectos").select(cols).eq("whatsapp_bot", t).is("deleted_at", null).order("updated_at", { ascending: false }).limit(1);
  if (porBot?.[0]) return porBot[0];
  const { data: porTel } = await sb.from("prospectos").select(cols).eq("telefono_norm", t).is("deleted_at", null).is("principal_id", null).order("created_at").limit(1);
  return porTel?.[0] ?? null;
}

const aSesion = (f: FilaSesion): SesionFlow => ({ id: f.id, telefono: f.telefono, estado: f.estado, enviadoAt: f.enviado_at, datos: f.datos ?? {} });

/** Los puertos del endpoint, con la base de verdad. `alCompletar` deja corriendo el alta (la ruta usa after()). */
export function depsIntercambio(alCompletar: (flowToken: string) => void): DepsIntercambio {
  const tokens = new Map<string, string>();
  return {
    ahora: () => new Date(),
    async sesion(flowToken) {
      const f = await sesionPorToken(flowToken);
      if (f) tokens.set(f.id, f.flow_token);
      return f ? aSesion(f) : null;
    },
    async prellenado(s) {
      const p = await prospectoDe({ ...(await filaPorId(s.id)), telefono: s.telefono });
      if (!p) return {};
      return { giro: giroDeProspecto(p.giro as string), negocio: String(p.nombre ?? "").slice(0, 60), ciudad: String(p.ciudad ?? "").slice(0, 80) };
    },
    async marcarAbierta(s) {
      await createSupabaseAdminClient().from("wa_flow_sesiones").update({ estado: "abierto", abierto_at: new Date().toISOString() }).eq("id", s.id).eq("estado", "enviado");
    },
    async guardarDatos(s, d) {
      await createSupabaseAdminClient().from("wa_flow_sesiones").update({ datos: d }).eq("id", s.id).in("estado", ["enviado", "abierto", "error"]);
    },
    async completar(s, d) {
      const ahora = new Date().toISOString();
      await createSupabaseAdminClient()
        .from("wa_flow_sesiones")
        .update({ estado: "completado", datos: d, completado_at: ahora, abierto_at: ahora, error: null })
        .eq("id", s.id)
        .in("estado", ["enviado", "abierto", "error"]);
      const token = tokens.get(s.id);
      if (token) alCompletar(token);
    },
  };
}

async function filaPorId(id: string): Promise<{ prospecto_id: string | null }> {
  const { data } = await createSupabaseAdminClient().from("wa_flow_sesiones").select("prospecto_id").eq("id", id).maybeSingle();
  return { prospecto_id: (data?.prospecto_id as string | null) ?? null };
}

// ───────────────────────────── la liga de entrada

/** Crea la liga de un solo uso (24 h). El token solo viaja en el mensaje; la base guarda su SHA-256. */
export async function crearAcceso(a: { personaId: string; negocioId: string; telefono: string; sesionId: string | null; destino: "/bienvenida" | "/admin" }): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await createSupabaseAdminClient()
    .from("wa_accesos")
    .insert({
      token_hash: sha256(token),
      persona_id: a.personaId,
      negocio_destino_id: a.negocioId,
      telefono: a.telefono,
      sesion_id: a.sesionId,
      destino: a.destino,
      expira_at: new Date(Date.now() + VIGENCIA_ACCESO_MS).toISOString(),
    });
  if (error) throw new Error(`wa_accesos: ${error.message}`);
  return `${urlPlataforma()}/entrar/${token}`;
}

export type Canje =
  | { ok: true; personaId: string; negocioId: string; destino: "/bienvenida" | "/admin" }
  | { ok: false; motivo: "no_existe" | "usada" | "vencida" };

/** Gasta la liga: una sola vez (la condición va en el mismo UPDATE: dos clics a la vez, uno gana). */
export async function canjearAcceso(token: string): Promise<Canje> {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return { ok: false, motivo: "no_existe" };
  const sb = createSupabaseAdminClient();
  const hash = sha256(token);
  const ahora = new Date().toISOString();
  const { data } = await sb
    .from("wa_accesos")
    .update({ usado_at: ahora })
    .eq("token_hash", hash)
    .is("usado_at", null)
    .is("deleted_at", null)
    .gt("expira_at", ahora)
    .select("persona_id, negocio_destino_id, destino");
  const f = data?.[0];
  if (f) return { ok: true, personaId: f.persona_id as string, negocioId: f.negocio_destino_id as string, destino: f.destino === "/admin" ? "/admin" : "/bienvenida" };
  const { data: fila } = await sb.from("wa_accesos").select("usado_at").eq("token_hash", hash).is("deleted_at", null).maybeSingle();
  if (!fila) return { ok: false, motivo: "no_existe" };
  return { ok: false, motivo: fila.usado_at ? "usada" : "vencida" };
}

// ───────────────────────────── mensajes

const dominioDe = (url: string) => url.replace(/^https?:\/\//, "");

export function mensajeCuentaNueva(nombre: string, url: string, liga: string): string {
  return [
    `Listo, *${nombre}* ya está abierto en PeluDesk con 15 días de prueba gratis.`,
    `Tu dirección: ${dominioDe(url)}`,
    `Entra aquí (la liga sirve una sola vez y dura 24 horas):\n${liga}`,
    "Tus primeros tres pasos:\n1. Escoge tu contraseña al entrar: con ella y tu teléfono entras después.\n2. Captura los datos de tu negocio: horario, dirección y logo.\n3. Revisa tus servicios y precios, y da de alta a tu primer cliente.",
  ].join("\n\n");
}

export function mensajeYaTenia(nombre: string, url: string, liga: string): string {
  return [
    `Ya tienes *${nombre}* en PeluDesk, así que no abrimos otro negocio.`,
    `Tu dirección: ${dominioDe(url)}`,
    `Entra aquí (la liga sirve una sola vez y dura 24 horas):\n${liga}`,
    `Después entras con tu teléfono y tu contraseña en ${dominioDe(url)}/login.`,
  ].join("\n\n");
}

/** El link de prueba por texto para la persona de esta sesión (el mismo que daría el bot). */
async function registroDeSesion(s: Pick<FilaSesion, "prospecto_id" | "telefono" | "anuncio_id">): Promise<string> {
  const p = await prospectoDe(s);
  if (!p) return registroDeProspecto(null);
  return registroDeProspecto({
    nombre: String(p.nombre ?? ""),
    giro: String(p.giro ?? ""),
    ciudad: (p.ciudad as string | null) ?? null,
    servicios: [],
    pagina: `${urlPlataforma()}/para/${p.slug}`,
    slug: String(p.slug ?? ""),
    por: "telefono",
    anuncio: Boolean(p.anuncio_at),
    anuncioId: s.anuncio_id,
    fuente: (p.fuente as string | null) ?? null,
  });
}

export async function textoRespaldo(s: Pick<FilaSesion, "prospecto_id" | "telefono" | "anuncio_id">): Promise<string> {
  return `¿No se abrió el formulario? También puedes abrir tu prueba gratis de 15 días desde aquí:\n${await registroDeSesion(s)}`;
}

// ───────────────────────────── abrir el negocio

async function apuntar(telefono: string, texto: string) {
  const { error } = await createSupabaseAdminClient().from("wa_mensajes").insert({ telefono, quien: "agente", texto });
  if (error) console.error("[whatsapp-flow] no se apuntó el mensaje", error.message);
}

async function enviarYApuntar(telefono: string, texto: string, sinVista = false) {
  const r = await clienteWA().texto(telefono, texto, { sinVista });
  // El historial del bot (lo lee la administración y el modelo) nunca guarda una liga de entrada que todavía sirve.
  if (r.ok) await apuntar(telefono, texto.replace(/\/entrar\/[A-Za-z0-9_-]+/g, "/entrar/[liga de un solo uso]"));
  else console.error("[whatsapp-flow] no salió el mensaje", r.error);
  return r.ok;
}

/**
 * Abre el negocio de una sesión completada (o manda su acceso si ya tenía uno). Idempotente: toma la sesión con un
 * UPDATE condicionado al estado, así que el endpoint, el aviso del webhook (nfm_reply) y la tarea de respaldo
 * pueden llamarla a la vez y solo uno la atiende. Nunca lanza.
 */
export async function procesarSesion(flowToken: string): Promise<EstadoSesion | null> {
  const sb = createSupabaseAdminClient();
  const s = await sesionPorToken(flowToken);
  if (!s) return null;
  // Una que se quedó «creando» más de 5 minutos (la función se cortó) se vuelve a tomar.
  const atorada = s.estado === "creando" && Date.now() - Date.parse(s.updated_at) > 5 * 60_000 && s.intentos < 3;
  if (s.estado !== "completado" && !atorada) return s.estado;
  const { data: tomada } = await sb
    .from("wa_flow_sesiones")
    .update({ estado: "creando", intentos: s.intentos + 1 })
    .eq("id", s.id)
    .eq("estado", s.estado)
    .eq("updated_at", s.updated_at)
    .select("id");
  if (!tomada?.length) return s.estado;

  const fallo = async (motivo: string, aviso: string) => {
    await sb.from("wa_flow_sesiones").update({ estado: "error", error: motivo.slice(0, 500), terminado_at: new Date().toISOString() }).eq("id", s.id);
    await enviarYApuntar(s.telefono, aviso);
    await avisarOperador("⚠️ El formulario de prueba gratis no abrió la cuenta", [`WhatsApp ${s.telefono}`, motivo.slice(0, 300), `${urlPlataforma()}/plataforma/prospectos`]);
    return "error" as const;
  };

  try {
    const d = s.datos ?? {};
    const telefono = tel10(s.telefono);
    if (!telefono || !esGiro(d.giro) || !d.negocio || !d.nombre) {
      return await fallo("Sesión sin datos completos o número de fuera de México", `No pudimos abrir tu cuenta desde aquí. Hazlo en:\n${await registroDeSesion(s)}`);
    }

    // ¿Ya administra un negocio? Se le manda su acceso y no se abre otro.
    const { data: cuenta } = await sb.rpc("bot_cuenta_por_telefono", { p_telefono: s.telefono });
    const negocioPrevio = ((cuenta as { negocios?: { negocio_id: string; nombre: string; slug: string; dominio: string | null; url_publica: string | null }[] } | null)?.negocios ?? [])[0];
    if (negocioPrevio) return await yaTenia(s, telefono, negocioPrevio);

    const { data: motivo } = await sb.rpc("puede_registrar_prueba", { p_telefono: telefono, p_ip: null });
    if (motivo) {
      // Un negocio por teléfono: si el que abrió sigue ahí, su acceso; si no, el motivo tal cual lo redacta la base.
      const { data: reg } = await sb.from("registros_prueba").select("negocio_id, negocios(id, nombre, slug, dominio, url_publica, deleted_at)").eq("telefono", telefono).is("deleted_at", null).order("created_at", { ascending: false }).limit(1);
      const n = reg?.[0]?.negocios as unknown as { id: string; nombre: string; slug: string; dominio: string | null; url_publica: string | null; deleted_at: string | null } | null;
      if (n && !n.deleted_at) return await yaTenia(s, telefono, { negocio_id: n.id, nombre: n.nombre, slug: n.slug, dominio: n.dominio, url_publica: n.url_publica });
      return await fallo(String(motivo), String(motivo));
    }

    // La cuenta: su teléfono de WhatsApp (verificado por Meta) es su identidad. Si ya tiene cuenta en PeluDesk (es
    // cliente de algún negocio, por ejemplo) se usa esa; si no, una nueva sin contraseña conocida que escoge al entrar.
    const { data: correoExistente } = await sb.rpc("email_de_persona_por_telefono", { p_telefono: telefono });
    let personaId: string | null = null;
    let creadaAqui = false;
    if (correoExistente) {
      const { data: id } = await sb.rpc("usuario_por_email", { p_email: correoExistente as string });
      personaId = (id as string | null) ?? null;
    }
    if (!personaId) {
      const { data: creado, error: errorCuenta } = await sb.auth.admin.createUser({
        email: correoSinteticoDeTelefono(telefono),
        password: randomBytes(24).toString("base64url"),
        email_confirm: true,
        user_metadata: { nombre_completo: d.nombre },
        app_metadata: { [MARCA_CAMBIO_PASSWORD]: true },
      });
      if (errorCuenta || !creado.user) return await fallo(`createUser: ${errorCuenta?.message ?? "sin usuario"}`, `No pudimos crear tu cuenta. Inténtalo en un momento o hazlo en:\n${await registroDeSesion(s)}`);
      personaId = creado.user.id;
      creadaAqui = true;
      await sb.from("profiles").update({ nombre_completo: d.nombre }).eq("id", personaId);
    }
    const deshacer = async () => {
      if (creadaAqui && personaId) await sb.auth.admin.deleteUser(personaId);
    };

    // La aceptación (casilla de la pantalla de confirmación) se guarda ANTES de abrir el negocio, como en /registro.
    const { error: errorAceptacion } = await sb.from("aceptaciones_legales").insert(
      (["terminos", "aviso_privacidad"] as const).map((documento) => ({
        persona_id: personaId,
        telefono,
        documento,
        version: DOCUMENTOS_LEGALES[documento].version,
        ip: null,
        user_agent: "WhatsApp Flow",
        origen: "whatsapp_flow",
      })),
    );
    if (errorAceptacion) {
      await deshacer();
      return await fallo(`aceptaciones_legales: ${errorAceptacion.message}`, `No pudimos registrar tu aceptación. Inténtalo en un momento o hazlo en:\n${await registroDeSesion(s)}`);
    }

    const { data: filas, error: errorNegocio } = await sb.rpc("registrar_negocio_prueba", {
      p_nombre: d.negocio,
      p_ciudad: d.ciudad || null,
      p_telefono: telefono,
      p_ip: null,
      p_persona_id: personaId,
      p_modelo: MODELO,
      p_dias: DIAS_PRUEBA,
      p_servicios: serviciosDeGiro(d.giro),
    });
    const alta = (filas as { negocio_id: string; slug: string }[] | null)?.[0];
    if (errorNegocio || !alta) {
      await deshacer();
      const propio = errorNegocio?.code === "P0001" && /teléfono|conexión/.test(errorNegocio.message);
      return await fallo(`registrar_negocio_prueba: ${errorNegocio?.message ?? "sin fila"}`, propio ? errorNegocio!.message : `No pudimos abrir tu negocio. Inténtalo en un momento o hazlo en:\n${await registroDeSesion(s)}`);
    }

    // De dónde llegó: WhatsApp, el Flow, dónde se ofreció, el anuncio y la referencia de su página.
    const { error: errorOrigen } = await sb
      .from("registros_prueba")
      .update({
        utm_source: "whatsapp",
        utm_medium: "flow",
        utm_campaign: `flow_${s.punto}`,
        utm_content: s.anuncio_id,
        referente: s.ref ? `ref. ${s.ref}` : null,
        terminos_version: DOCUMENTOS_LEGALES.terminos.version,
        aviso_version: DOCUMENTOS_LEGALES.aviso_privacidad.version,
      })
      .eq("negocio_id", alta.negocio_id);
    if (errorOrigen) console.error("[whatsapp-flow] origen", errorOrigen.message);

    // El prospecto (por su ref, su anuncio o su teléfono) pasa a «en prueba», ligado al negocio, y su página se publica.
    const p = await prospectoDe(s);
    if (p) {
      await sb
        .from("prospectos")
        .update({ etapa: "en_prueba", negocio_cliente_id: alta.negocio_id, cliente_por: "telefono", ...(d.correo && !p.correo ? { correo: d.correo } : {}) })
        .eq("id", p.id);
      await sb.from("prospectos_eventos").insert({ prospecto_id: p.id, tipo: "etapa", texto: "Abrió su prueba gratis desde el formulario de WhatsApp" });
      if (p.slug) await publicarPaginaDeProspecto(alta.negocio_id, String(p.slug));
    }

    const url = urlDelNegocio({ slug: alta.slug, dominio: null, url_publica: null });
    const liga = await crearAcceso({ personaId: personaId!, negocioId: alta.negocio_id, telefono: s.telefono, sesionId: s.id, destino: "/bienvenida" });
    await sb
      .from("wa_flow_sesiones")
      .update({ estado: "cuenta_creada", negocio_creado_id: alta.negocio_id, prospecto_id: p?.id ?? s.prospecto_id, terminado_at: new Date().toISOString(), error: null })
      .eq("id", s.id);
    await enviarYApuntar(s.telefono, mensajeCuentaNueva(d.negocio, url, liga), true);
    await avisarOperador("🐾 Prueba gratis abierta desde WhatsApp", [`${d.negocio} · ${d.ciudad || "sin ciudad"} · ${d.nombre}`, `WhatsApp ${s.telefono} · ${s.fuente}${s.anuncio_id ? ` · anuncio ${s.anuncio_id}` : ""}${s.ref ? ` · ref. ${s.ref}` : ""}`, url]);
    return "cuenta_creada";
  } catch (e) {
    console.error("[whatsapp-flow] procesar", e instanceof Error ? e.message : e);
    return await fallo(e instanceof Error ? e.message : String(e), `No pudimos abrir tu cuenta desde aquí. Inténtalo en un momento o hazlo en:\n${await registroDeSesion(s).catch(() => registroDeProspecto(null))}`);
  }
}

async function yaTenia(s: FilaSesion, _telefono: string, n: { negocio_id: string; nombre: string; slug: string; dominio: string | null; url_publica: string | null }): Promise<EstadoSesion> {
  const sb = createSupabaseAdminClient();
  const { data: correo } = await sb.rpc("email_de_persona_por_telefono", { p_telefono: _telefono });
  const { data: personaId } = correo ? await sb.rpc("usuario_por_email", { p_email: correo as string }) : { data: null };
  const url = urlDelNegocio({ slug: n.slug, dominio: n.dominio, url_publica: n.url_publica });
  await sb.from("wa_flow_sesiones").update({ estado: "ya_tenia", negocio_creado_id: n.negocio_id, terminado_at: new Date().toISOString(), error: null }).eq("id", s.id);
  if (!personaId) {
    await enviarYApuntar(s.telefono, `Ya tienes *${n.nombre}* en PeluDesk, así que no abrimos otro negocio. Entra con tu teléfono y tu contraseña en ${dominioDe(url)}/login.`);
    return "ya_tenia";
  }
  const liga = await crearAcceso({ personaId: personaId as string, negocioId: n.negocio_id, telefono: s.telefono, sesionId: s.id, destino: "/admin" });
  await enviarYApuntar(s.telefono, mensajeYaTenia(n.nombre, url, liga), true);
  return "ya_tenia";
}

// ───────────────────────────── la tarea de respaldo

/**
 * Cada pocos minutos: (1) al que no abrió el Flow en 10 minutos y no ha escrito nada desde entonces, la prueba por
 * texto (una vez por envío; el del saludo no: el menú ya es el camino por texto); (2) las sesiones completadas que
 * nadie atendió (la función se cortó) se abren.
 */
export async function correrRespaldos(): Promise<{ respaldos: number; altas: number }> {
  const sb = createSupabaseAdminClient();
  const ahora = Date.now();
  const { data: sinAbrir } = await sb
    .from("wa_flow_sesiones")
    .select("id, telefono, punto, prospecto_id, anuncio_id, enviado_at")
    .eq("estado", "enviado")
    .is("respaldo_at", null)
    .is("deleted_at", null)
    .lt("enviado_at", new Date(ahora - ESPERA_RESPALDO_MS).toISOString())
    .gt("enviado_at", new Date(ahora - 23 * 3600_000).toISOString())
    .order("enviado_at")
    .order("id")
    .limit(50);
  let respaldos = 0;
  for (const s of sinAbrir ?? []) {
    const { data: marcada } = await sb.from("wa_flow_sesiones").update({ respaldo_at: new Date().toISOString() }).eq("id", s.id).is("respaldo_at", null).select("id");
    if (!marcada?.length || s.punto === "saludo") continue;
    const { count: escribio } = await sb.from("wa_mensajes").select("id", { count: "exact", head: true }).eq("telefono", s.telefono).eq("quien", "usuario").gt("created_at", s.enviado_at).is("deleted_at", null);
    const { count: otroDespues } = await sb.from("wa_flow_sesiones").select("id", { count: "exact", head: true }).eq("telefono", s.telefono).gt("enviado_at", s.enviado_at).is("deleted_at", null);
    if ((escribio ?? 0) > 0 || (otroDespues ?? 0) > 0) continue;
    // El guion de ventas ofrece el botón en casi cada respuesta: el respaldo por texto sale una vez al día por teléfono.
    const { count: yaHubo } = await sb.from("wa_mensajes").select("id", { count: "exact", head: true }).eq("telefono", s.telefono).eq("quien", "agente").like("texto", "¿No se abrió el formulario?%").gt("created_at", new Date(ahora - 24 * 3600_000).toISOString());
    if ((yaHubo ?? 0) > 0) continue;
    if (await enviarYApuntar(s.telefono, await textoRespaldo(s))) respaldos++;
  }
  const { data: pendientes } = await sb
    .from("wa_flow_sesiones")
    .select("flow_token")
    .in("estado", ["completado", "creando"])
    .is("deleted_at", null)
    .lt("updated_at", new Date(ahora - 60_000).toISOString())
    .lt("intentos", 3)
    .order("updated_at")
    .order("id")
    .limit(10);
  let altas = 0;
  for (const p of pendientes ?? []) if ((await procesarSesion(p.flow_token as string)) === "cuenta_creada") altas++;
  return { respaldos, altas };
}
