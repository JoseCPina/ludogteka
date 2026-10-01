/**
 * El resumen diario de PeluDesk en la bandeja de Telegram del bot (el chat
 * vinculado en /plataforma/whatsapp). Lo corre la tarea de Vercel cada hora
 * (/api/cron/resumen: manda a la hora configurada o, si ese día aún no salió,
 * en la siguiente) y «Enviar ahora» de /plataforma/resumen.
 *
 * Nunca se manda dos veces el mismo día: resumen_reservar toma el día de
 * forma atómica (una fila por fecha; un envío que murió a la mitad se retoma
 * pasados 10 minutos). Cubre el día anterior completo en hora de la Ciudad
 * de México. Una fuente caída no frena el resumen: sale con «No pude leer».
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DatosSupabase, TelegramHttp, configWhatsApp } from "@/lib/whatsapp/infra";
import { leerAjustes } from "./ajustes";
import { bloques, fotoDe, fuentesFallidas, partir, type Foto, type Reunido } from "./formato";
import * as f from "./fuentes";

export type Resultado = { estado: "enviado" | "pausado" | "aun_no" | "ya_enviado" | "fallido"; dia: string; partes?: number; fuentesFallidas?: string[]; error?: string };

export async function reunir(dia: string, hoy: string): Promise<Reunido> {
  const ajustes = await leerAjustes();
  const lunes = f.diaSemana(hoy) === 1;
  const db = await f.leer(() => f.datosInternos(dia, ajustes.umbralHoras));
  const publicadas = db.ok ? db.datos.redes.publicadas : [];
  // La campaña va primero: de ahí salen los anuncios cuyos comentarios se leen en Instagram.
  const camp = await f.leer(() => f.campana(dia, lunes));
  const idsAnuncio = camp.ok ? camp.datos.anuncios.flatMap((a) => (a.igMedia ? [a.igMedia] : [])) : [];
  const quiere = (s: (typeof ajustes.secciones)[number]) => ajustes.secciones.includes(s);
  const [ig, fb, tt, token] = await Promise.all([
    f.leer(() => f.instagram(dia, publicadas, quiere("comentarios") ? idsAnuncio : [])),
    f.leer(() => f.facebook(publicadas)),
    f.leer(() => f.tiktok()),
    f.leer(() => f.tokenMeta()),
  ]);
  const { data } = await createSupabaseAdminClient().from("resumenes_diarios").select("snapshot").eq("estado", "enviado").lt("fecha", dia).is("deleted_at", null).order("fecha", { ascending: false }).limit(1);
  const previo = ((data?.[0]?.snapshot as Foto | null) ?? null);
  return { dia, lunes, ajustes, db, ig, fb, tt, camp, token, previo };
}

async function cerrar(id: string, cambios: Record<string, unknown>) {
  const { error } = await createSupabaseAdminClient().from("resumenes_diarios").update(cambios).eq("id", id);
  if (error) console.error("[resumen] no se pudo anotar el envío", error.message);
}

/** `dia` solo lo pasan las pruebas de desarrollo (la ruta lo ignora en producción). */
export async function correrResumen({ origen, ahora = new Date(), dia: diaForzado }: { origen: "cron" | "manual"; ahora?: Date; dia?: string }): Promise<Resultado> {
  const dia = diaForzado ?? f.sumarDias(f.diaCDMX(ahora), -1);
  const hoy = f.sumarDias(dia, 1);
  const ajustes = await leerAjustes();
  if (origen === "cron") {
    if (ajustes.pausa) return { estado: "pausado", dia };
    if (f.horaCDMX(ahora) < ajustes.hora) return { estado: "aun_no", dia };
  }
  const { data: id, error } = await createSupabaseAdminClient().rpc("resumen_reservar", { p_fecha: dia, p_origen: origen, p_forzar: origen === "manual" });
  if (error) throw new Error(`resumen_reservar: ${error.message}`);
  if (!id) return { estado: "ya_enviado", dia };
  let partesEnviadas = 0;
  try {
    const chat = Number(await new DatosSupabase().config("telegram_chat_operador")) || null;
    if (!chat) throw new Error("No hay bandeja de Telegram vinculada (/plataforma/whatsapp → Vincular mi Telegram).");
    const telegram = new TelegramHttp(configWhatsApp().telegramToken);
    let r: Reunido | null = null;
    let mensajes: string[];
    try {
      r = await reunir(dia, hoy);
      mensajes = partir(bloques(r));
    } catch (e) {
      mensajes = [`<b>PeluDesk · resumen del ${dia}</b>\n\nNo pude armar el resumen: ${f.limpiarMotivo(e instanceof Error ? e.message : String(e)).replace(/</g, "&lt;")}`];
    }
    for (const m of mensajes) {
      if (!(await telegram.enviar(chat, m))) throw new Error("Telegram no aceptó el mensaje.");
      partesEnviadas += 1;
    }
    const fallidas = r ? fuentesFallidas(r) : ["todo"];
    const { data: previa } = await createSupabaseAdminClient().from("resumenes_diarios").select("veces").eq("id", id as string).single();
    await cerrar(id as string, { estado: "enviado", texto: mensajes.join("\n\n———\n\n"), partes: mensajes.length, fuentes_fallidas: fallidas, snapshot: r ? fotoDe(r) : null, error: null, enviado_at: new Date().toISOString(), bloqueo_hasta: null, veces: Number(previa?.veces ?? 0) + 1 });
    return { estado: "enviado", dia, partes: mensajes.length, fuentesFallidas: fallidas };
  } catch (e) {
    const msg = f.limpiarMotivo(e instanceof Error ? e.message : String(e));
    console.error("[resumen] falló", msg);
    // Si ya salió una parte, no se reintenta solo (se duplicaría): queda enviado a medias y se avisa en la pantalla.
    await cerrar(id as string, partesEnviadas ? { estado: "enviado", partes: partesEnviadas, error: `Se enviaron ${partesEnviadas} partes y luego falló: ${msg}`, enviado_at: new Date().toISOString(), bloqueo_hasta: null } : { estado: "fallido", error: msg, bloqueo_hasta: null });
    return { estado: "fallido", dia, error: msg };
  }
}
