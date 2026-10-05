"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual } from "@/lib/negocio/actual";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { articulosDelNegocio } from "@/lib/ayuda";
import { cargarTutorialesVisibles } from "@/lib/tutoriales";
import {
  LIMITE_HISTORIAL,
  MAX_PREGUNTAS_DIA,
  MAX_TOKENS_ASISTENTE,
  procesarRespuesta,
  promptFijo,
  promptVariable,
} from "@/lib/ayuda/asistente";
import { costoMxn, TOPE_MENSUAL_MXN } from "@/lib/whatsapp/agente";
import { Anthropic, configWhatsApp, DatosSupabase } from "@/lib/whatsapp/infra";
import { avisarTelegramTicket } from "@/lib/soporte/notificar";

// Ayuda dentro de la app: el asistente y los tickets. Solo admin y
// recepción (la base lo vuelve a comprobar en cada función).

const BUCKET = "soporte-capturas";
const MAX_CAPTURA = 6 * 1024 * 1024;

function limpiarError(msg: string): string {
  return msg.replace(/^.*?ERROR:\s*/, "");
}

export type RespuestaAsistente = {
  error: string | null;
  conversacionId?: string;
  texto?: string;
  articulos?: { slug: string; titulo: string }[];
  video?: { slug: string; titulo: string } | null;
  sinRespuesta?: boolean;
  motivo?: string | null;
};

/**
 * Una pregunta al asistente. Nunca lee datos del negocio: el modelo solo
 * recibe la documentación de los módulos activos, el rol, el nombre del
 * negocio y la pantalla. Topes: 40 preguntas por persona al día y el
 * presupuesto mensual de IA de PeluDesk (el mismo del bot de WhatsApp).
 */
export async function preguntarAsistente(datos: { conversacionId: string | null; pregunta: string; pantalla: string | null }): Promise<RespuestaAsistente> {
  const pregunta = datos.pregunta.trim().slice(0, 1500);
  if (!pregunta) return { error: "Escribe tu pregunta." };
  const sesion = await obtenerSesionConRol();
  if (!sesion || !["admin", "recepcion"].includes(sesion.rol)) return { error: "La ayuda es para admin y recepción." };
  const landing = await cargarNegocioLanding();
  if (landing.plan === "demo") return { error: "En el demo el asistente no está disponible. Revisa los artículos de Ayuda." };

  const supabase = await createSupabaseServerClient();
  const { data: hoy } = await supabase.rpc("asistente_preguntas_hoy");
  if (Number(hoy ?? 0) >= MAX_PREGUNTAS_DIA) {
    return { error: `Ya van ${MAX_PREGUNTAS_DIA} preguntas hoy. Busca en los artículos o crea un ticket y te contestamos.` };
  }
  const plataforma = new DatosSupabase();
  const inicioMes = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const tope = Number(process.env.WHATSAPP_IA_TOPE_MENSUAL_MXN) > 0 ? Number(process.env.WHATSAPP_IA_TOPE_MENSUAL_MXN) : TOPE_MENSUAL_MXN;
  if ((await plataforma.gastoIADesde(inicioMes)) >= tope) {
    return { error: "El asistente no está disponible por ahora. Busca en los artículos o crea un ticket y te contestamos." };
  }

  const negocio = await negocioActual();
  const articulos = articulosDelNegocio(sesion.modulos);
  const permitidos = new Set(articulos.map((a) => a.slug));
  // Los videos publicados que esta persona puede ver: el asistente puede recomendar UNO.
  const videos = await cargarTutorialesVisibles(supabase, { rol: sesion.rol, permisos: sesion.permisos, modulos: sesion.modulos }).catch(() => []);
  const videosPermitidos = new Map(videos.map((v) => [v.numero, { slug: v.slug, titulo: v.titulo }] as const));

  // La conversación anterior (solo la de esta persona: la RLS lo asegura).
  const historial: { role: "user" | "assistant"; content: string }[] = [];
  if (datos.conversacionId) {
    const { data: previos } = await supabase
      .from("soporte_mensajes_asistente")
      .select("quien, texto, articulos")
      .eq("conversacion_id", datos.conversacionId)
      .order("created_at", { ascending: false })
      .limit(LIMITE_HISTORIAL);
    for (const m of (previos ?? []).reverse()) {
      const citas = ((m.articulos as string[]) ?? []).map((s) => `[[articulo:${s}]]`).join("\n");
      historial.push({ role: m.quien === "persona" ? "user" : "assistant", content: `${m.texto}${citas ? `\n${citas}` : ""}` });
    }
  }
  if (historial[0]?.role === "assistant") historial.shift();
  historial.push({ role: "user", content: pregunta });

  const hoyTexto = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: negocio.zona_horaria }).format(new Date());
  const cfg = configWhatsApp();
  const ia = new Anthropic(cfg.anthropic, cfg.anthropicWorkspace);
  let resultado;
  let tokens = { in: 0, out: 0 };
  try {
    const system = [
      { type: "text" as const, text: promptFijo(articulos), cache_control: { type: "ephemeral" as const } },
      {
        type: "text" as const,
        text: promptVariable({ negocio: negocio.nombre, rol: sesion.rol as "admin" | "recepcion", modulos: sesion.modulos, pantalla: datos.pantalla, hoy: hoyTexto, videos: videos.map((v) => ({ numero: v.numero, titulo: v.titulo, articulos: v.articulos })) }),
      },
    ];
    // Sin herramientas: «no está documentado» y «fuera de alcance» van como
    // marcas de texto (ver src/lib/ayuda/asistente.ts).
    const r = await ia.responder(system, historial, [], MAX_TOKENS_ASISTENTE);
    tokens = { in: r.tokensIn, out: r.tokensOut };
    resultado = procesarRespuesta(r.texto, permitidos, videosPermitidos);
  } catch (e) {
    console.error("[ayuda] el asistente no contestó", e instanceof Error ? e.message : e);
    await plataforma.registrarUsoIA({ telefono: `app:${negocio.slug}`, tokensIn: 0, tokensOut: 0, costoMxn: 0, resultado: "error" });
    return { error: "El asistente no contestó. Vuelve a intentar en un momento o crea un ticket." };
  }
  await plataforma.registrarUsoIA({
    telefono: `app:${negocio.slug}`,
    tokensIn: tokens.in,
    tokensOut: tokens.out,
    costoMxn: costoMxn(tokens.in, tokens.out),
    resultado: resultado.sinRespuesta ? "escalo" : "respondio",
  });

  const { data: conv, error } = await supabase.rpc("asistente_guardar", {
    p_conversacion_id: datos.conversacionId,
    p_pantalla: datos.pantalla,
    p_pregunta: pregunta,
    p_respuesta: resultado.texto,
    p_articulos: resultado.articulos,
    p_sin_respuesta: resultado.sinRespuesta,
  });
  if (error) return { error: limpiarError(error.message) };
  return {
    error: null,
    conversacionId: conv as string,
    texto: resultado.texto,
    articulos: resultado.articulos.map((slug) => ({ slug, titulo: articulos.find((a) => a.slug === slug)?.titulo ?? slug })),
    video: resultado.video,
    sinRespuesta: resultado.sinRespuesta,
    motivo: resultado.motivo,
  };
}

export type ResultadoTicket = { error: string | null; ticketId?: string; numero?: number };

/**
 * Crear un ticket. Se adjuntan solos la pantalla, el navegador y la
 * conversación con el asistente (si la hubo); la captura es opcional.
 */
export async function crearTicket(formData: FormData): Promise<ResultadoTicket> {
  const asunto = String(formData.get("asunto") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const pantalla = String(formData.get("pantalla") ?? "").trim() || null;
  const navegador = String(formData.get("navegador") ?? "").trim() || null;
  const conversacionId = String(formData.get("conversacion_id") ?? "").trim() || null;
  const sinDocumentar = formData.get("sin_documentar") === "1";
  const captura = formData.get("captura");
  if (!asunto) return { error: "Escribe el asunto." };
  if (!descripcion) return { error: "Cuéntanos qué pasó." };
  if (captura instanceof File && captura.size > 0) {
    if (!captura.type.startsWith("image/")) return { error: "La captura tiene que ser una imagen." };
    if (captura.size > MAX_CAPTURA) return { error: "La captura pesa más de 6 MB." };
  }
  const sesion = await obtenerSesionConRol();
  if (!sesion || !["admin", "recepcion"].includes(sesion.rol)) return { error: "Solo admin o recepción crean tickets de soporte." };
  if ((await cargarNegocioLanding()).plan === "demo") return { error: "En el demo no se crean tickets." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("crear_ticket", {
    p_asunto: asunto,
    p_descripcion: descripcion,
    p_pantalla: pantalla,
    p_navegador: navegador,
    p_conversacion_id: conversacionId,
    p_sin_documentar: sinDocumentar,
  });
  if (error) return { error: limpiarError(error.message) };
  const t = data as { id: string; numero: number };
  const negocio = await negocioActual();

  if (captura instanceof File && captura.size > 0) {
    // La sube el servidor (el bucket no tiene políticas) y la ruta la valida la base.
    const ext = (captura.type.split("/")[1] ?? "png").replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
    const ruta = `${negocio.id}/${t.id}/captura.${ext}`;
    const admin = createSupabaseAdminClient(negocio.id);
    const { error: eSubir } = await admin.storage.from(BUCKET).upload(ruta, captura, { contentType: captura.type, upsert: true });
    if (!eSubir) await supabase.rpc("adjuntar_captura_ticket", { p_ticket_id: t.id, p_path: ruta });
    else console.error("[soporte] no se subió la captura", t.id, eSubir.message);
  }

  await avisarTelegramTicket({
    id: t.id,
    numero: t.numero,
    negocio: negocio.nombre,
    persona: sesion.nombreCompleto ?? sesion.user.email ?? "—",
    rol: sesion.rol,
    asunto,
    texto: descripcion,
    pantalla,
    nuevo: true,
    sinDocumentar,
  });
  revalidatePath("/ayuda");
  return { error: null, ticketId: t.id, numero: t.numero };
}

export async function responderTicket(ticketId: string, texto: string): Promise<{ error: string | null }> {
  if (!texto.trim()) return { error: "Escribe tu mensaje." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("responder_ticket", { p_ticket_id: ticketId, p_texto: texto.trim() });
  if (error) return { error: limpiarError(error.message) };
  const { data: t } = await supabase.from("soporte_tickets").select("id, numero, asunto, rol, pantalla").eq("id", ticketId).single();
  const sesion = await obtenerSesionConRol();
  const negocio = await negocioActual();
  if (t) {
    await avisarTelegramTicket({
      id: t.id as string,
      numero: t.numero as number,
      negocio: negocio.nombre,
      persona: sesion?.nombreCompleto ?? sesion?.user.email ?? "—",
      rol: t.rol as string,
      asunto: t.asunto as string,
      texto: texto.trim(),
      pantalla: t.pantalla as string | null,
      nuevo: false,
    });
  }
  revalidatePath(`/ayuda/tickets/${ticketId}`);
  revalidatePath("/ayuda");
  return { error: null };
}

export async function marcarTicketVisto(ticketId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("marcar_ticket_visto", { p_ticket_id: ticketId });
}
