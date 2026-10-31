import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { entregarPorWhatsApp } from "@/lib/herramientas/entregar";
import { registrarEventoHerramienta } from "@/lib/herramientas/telemetria";
import { SITIO } from "@/lib/peludesk/seo";
import { PATRON_INSCRIPCION, SESIONES, sesionPorClave } from "./sesiones";

/** Lo de la base de la Escuela: fechas y grabaciones (escuela_sesiones), inscripciones y el recordatorio. Solo servidor. */
export type SesionViva = { clave: string; orden: number; fecha_at: string | null; duracion_min: number; url_en_vivo: string | null; youtube_id: string | null; inscritos: number };

export async function sesionesVivas(): Promise<SesionViva[]> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("escuela_sesiones_publicas");
    if (error) throw new Error(error.message);
    return ((data ?? []) as SesionViva[]).map((s) => ({ ...s, inscritos: Number(s.inscritos) }));
  } catch (e) {
    console.error("[escuela] sesiones", e instanceof Error ? e.message : e);
    return SESIONES.map((s, i) => ({ clave: s.clave, orden: i + 1, fecha_at: null, duracion_min: 60, url_en_vivo: null, youtube_id: null, inscritos: 0 }));
  }
}

/**
 * El webhook del bot: «Quiero inscribirme a la Escuela PeluDesk: <título> (<clave>)». Inscribe al teléfono (y lo deja
 * como prospecto por la herramienta «escuela» si no existía) y devuelve qué contestar; null si no es una inscripción.
 */
export async function atenderInscripcion(telefono: string, texto: string | null | undefined, perfil: string | null): Promise<string | null> {
  const m = PATRON_INSCRIPCION.exec(texto ?? "");
  if (!m) return null;
  const s = sesionPorClave(m[1].toLowerCase());
  if (!s) return "No encontramos esa sesión de la Escuela PeluDesk. Las sesiones están en peludesk.mx/escuela.";
  const tel = telefono.replace(/\D/g, "").slice(-10);
  try {
    const db = createSupabaseAdminClient();
    const { data: p } = await db.rpc("prospecto_registrar_herramienta", { p_telefono: tel, p_nombre: null, p_giro: null, p_ciudad: null, p_herramienta: "escuela" });
    const prospecto = p as { id: string; nuevo: boolean } | null;
    const { data: ya } = await db.from("escuela_inscripciones").select("id").eq("telefono_norm", tel).eq("sesion_clave", s.clave).is("deleted_at", null).maybeSingle();
    if (!ya) {
      await db.from("escuela_inscripciones").insert({ telefono_norm: tel, sesion_clave: s.clave, prospecto_id: prospecto?.id ?? null, nombre: perfil?.slice(0, 80) ?? null });
      await registrarEventoHerramienta({ herramienta: "escuela", evento: "telefono", prospectoId: prospecto?.id ?? null, sinFiltroNavegador: true });
    }
    const { data: viva } = await db.from("escuela_sesiones").select("fecha_at").eq("clave", s.clave).is("deleted_at", null).maybeSingle();
    const cuando = viva?.fecha_at ? `Es el ${new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(viva.fecha_at as string))} (hora del centro).` : "Todavía no tiene fecha: te avisamos por aquí en cuanto la tenga.";
    return `${ya ? "Ya estabas inscrito" : "Listo, quedaste inscrito"} a «${s.titulo}» de la Escuela PeluDesk. ${cuando} Una hora antes te mandamos la liga. Para preparar la sesión, cuéntanos de qué giro es tu negocio y en qué ciudad está.`;
  } catch (e) {
    console.error("[escuela] inscripción", e instanceof Error ? e.message : e);
    return "No pudimos registrar tu inscripción en este momento. Intenta de nuevo en un minuto.";
  }
}

/** El recordatorio una hora antes: a cada inscrito sin recordatorio de una sesión que empieza en 45 a 75 minutos. */
export async function mandarRecordatorios(): Promise<{ sesiones: number; enviados: number; fallidos: number; motivo?: string }> {
  const db = createSupabaseAdminClient();
  const ahora = Date.now();
  const { data: sesiones } = await db.from("escuela_sesiones").select("clave, fecha_at, url_en_vivo").is("deleted_at", null).not("fecha_at", "is", null).gte("fecha_at", new Date(ahora + 45 * 60_000).toISOString()).lte("fecha_at", new Date(ahora + 75 * 60_000).toISOString());
  const salida = { sesiones: (sesiones ?? []).length, enviados: 0, fallidos: 0 as number, motivo: undefined as string | undefined };
  for (const s of sesiones ?? []) {
    const info = sesionPorClave(s.clave as string);
    if (!info) continue;
    const { data: inscritos } = await db.from("escuela_inscripciones").select("id, telefono_norm, nombre, prospecto_id").eq("sesion_clave", s.clave).is("deleted_at", null).is("recordatorio_enviado_at", null).limit(500);
    for (const i of inscritos ?? []) {
      const r = await entregarPorWhatsApp({ telefono: i.telefono_norm as string, nombre: (i.nombre as string | null) ?? null, resumen: `La sesión «${info.titulo}» de la Escuela PeluDesk empieza en una hora.`, url: (s.url_en_vivo as string | null) ?? `${SITIO}/escuela/${s.clave}`, herramienta: "escuela", prospectoId: (i.prospecto_id as string | null) ?? null });
      // Un solo intento por inscrito (nunca dos recordatorios iguales): se anota aunque Meta no lo haya aceptado.
      await db.from("escuela_inscripciones").update({ recordatorio_enviado_at: new Date().toISOString(), recordatorio_wa_id: r.waId ?? null }).eq("id", i.id);
      if (r.enviado) salida.enviados++;
      else {
        salida.fallidos++;
        salida.motivo = r.motivo;
        if (/plantilla|configurar/.test(r.motivo ?? "")) return salida;
      }
    }
  }
  return salida;
}
