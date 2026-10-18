// La lista del día «Contactar hoy»: primero los seguimientos que tocan (sin respuesta ni visita a su página a los N
// días del último mensaje; máximo dos y luego pausa), después los mejores prospectos nuevos con teléfono (WhatsApp)
// o Instagram. Cada renglón lleva su mensaje ya escrito. Idempotente: si ya hay lista del día, solo completa lo que
// falta. Sin imports de valores: la redacción llega como parámetro.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParaMensaje, TipoMensaje } from "./mensajes";

export type AjustesLista = { lista_whatsapp: number; lista_instagram: number; dias_seguimiento: number; max_seguimientos: number; firma: string };

export type OpcionesLista = {
  db: SupabaseClient;
  /** AAAA-MM-DD en la Ciudad de México. */
  fecha: string;
  /** https://peludesk.mx (o el de desarrollo) para armar el link a su página. */
  sitio: string;
  redactar: (lista: ParaMensaje[]) => Promise<Map<string, string>>;
  plantilla: (p: ParaMensaje) => string;
  ahora?: Date;
};

export type ResultadoLista = { whatsapp: number; instagram: number; seguimientos: number; pausados: number; nuevos: number; porIA: number; yaEstaba: boolean; retirados: number };

type Fila = {
  id: string; nombre: string; giro: string; ciudad: string; slug: string; etapa: string; telefono_norm: string | null; whatsapp: string | null; instagram: string | null;
  calificacion: number | null; resenas: number | null; canal_ultimo_contacto: string | null; ultimo_contacto_at: string | null; seguimientos: number;
  contacto_pausado_at: string | null; principal_id: string | null; negocio_cliente_id: string | null;
  clasificacion?: { servicios?: string[] } | null;
};

const PESO_GIRO: Record<string, number> = { guarderia: 3, hotel: 3, mixto: 3, estetica: 2, veterinaria: 1.5 };

/** Prioridad de un prospecto nuevo: giro (guardería y hotel primero), calificación y reseñas. */
export function puntaje(p: { giro: string; calificacion: number | null; resenas: number | null; whatsapp?: string | null; clasificacion?: { servicios?: string[] } | null }): number {
  // Un mixto vale como guardería u hotel solo si da alguno de los dos.
  const s = p.clasificacion?.servicios ?? [];
  const peso = p.giro === "mixto" && s.length ? (s.includes("guarderia") || s.includes("hotel") ? 3 : 2) : PESO_GIRO[p.giro] ?? 1;
  return peso * 2 + (p.calificacion ?? 3.5) + Math.log10((p.resenas ?? 0) + 1) * 1.5 + (p.whatsapp ? 0.5 : 0);
}

export const linkDe = (sitio: string, slug: string) => `${sitio.replace(/\/$/, "")}/para/${slug}`;

export async function armarLista(o: OpcionesLista): Promise<ResultadoLista> {
  const db = o.db;
  const ahora = o.ahora ?? new Date();
  const r: ResultadoLista = { whatsapp: 0, instagram: 0, seguimientos: 0, pausados: 0, nuevos: 0, porIA: 0, yaEstaba: false, retirados: 0 };
  const { data: aj, error: ea } = await db.from("prospeccion_ajustes").select("lista_whatsapp, lista_instagram, dias_seguimiento, max_seguimientos, firma").eq("id", 1).single();
  if (ea) throw new Error(ea.message);
  const ajustes = aj as AjustesLista;

  // Un renglón pendiente de un prospecto que se descartó después de armar la lista (p. ej. la limpieza de hotel y
  // guardería) sale de la lista; su lugar lo toma otro más abajo.
  const { data: pend, error: ep } = await db.from("prospectos_contactos").select("id, prospecto_id").eq("fecha", o.fecha).eq("estado", "pendiente").is("deleted_at", null).limit(1000);
  if (ep) throw new Error(ep.message);
  if ((pend ?? []).length) {
    const { data: desc, error: ed } = await db.from("prospectos").select("id, descarte_motivo").in("id", (pend ?? []).map((x) => x.prospecto_id as string)).eq("etapa", "descartado");
    if (ed) throw new Error(ed.message);
    const motivos = new Map((desc ?? []).map((x) => [x.id as string, (x.descarte_motivo as string | null) ?? "descartado"]));
    for (const x of pend ?? []) {
      if (!motivos.has(x.prospecto_id as string)) continue;
      const { error } = await db.from("prospectos_contactos").update({ deleted_at: ahora.toISOString() }).eq("id", x.id);
      if (error) throw new Error(error.message);
      await db.from("prospectos_eventos").insert({ prospecto_id: x.prospecto_id, tipo: "contacto", texto: `Sale de «Contactar hoy» (${motivos.get(x.prospecto_id as string)})` });
      r.retirados++;
    }
  }

  const { data: hoy, error: eh } = await db.from("prospectos_contactos").select("prospecto_id, canal").eq("fecha", o.fecha).is("deleted_at", null).limit(1000);
  if (eh) throw new Error(eh.message);
  const enHoy = new Set((hoy ?? []).map((x) => x.prospecto_id as string));
  const cupo = {
    whatsapp: Math.max(0, ajustes.lista_whatsapp - (hoy ?? []).filter((x) => x.canal === "whatsapp").length),
    instagram: Math.max(0, ajustes.lista_instagram - (hoy ?? []).filter((x) => x.canal === "instagram").length),
  };
  r.yaEstaba = (hoy ?? []).length > 0;

  // Los que ya recibieron algún mensaje alguna vez (un nuevo nunca se repite).
  const contactados = new Set<string>();
  for (let d = 0; ; d += 1000) {
    const { data, error } = await db.from("prospectos_contactos").select("prospecto_id").is("deleted_at", null).order("id").range(d, d + 999);
    if (error) throw new Error(error.message);
    for (const x of data ?? []) contactados.add(x.prospecto_id as string);
    if ((data ?? []).length < 1000) break;
  }

  const filas: Fila[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await db
      .from("prospectos")
      .select("id, nombre, giro, ciudad, slug, etapa, telefono_norm, whatsapp, instagram, calificacion, resenas, canal_ultimo_contacto, ultimo_contacto_at, seguimientos, contacto_pausado_at, principal_id, negocio_cliente_id, clasificacion")
      .is("deleted_at", null)
      .is("negocio_cliente_id", null)
      .is("principal_id", null)
      .in("etapa", ["nuevo", "contactado"])
      .order("id")
      .range(d, d + 999);
    if (error) throw new Error(error.message);
    filas.push(...((data ?? []) as Fila[]));
    if ((data ?? []).length < 1000) break;
  }

  const elegidos: { p: Fila; canal: "whatsapp" | "instagram"; tipo: TipoMensaje }[] = [];
  const limite = ahora.getTime() - ajustes.dias_seguimiento * 86_400_000;

  // 1. Seguimientos: contactados sin respuesta ni visita (una visita los pasa a «caliente» y ya no están aquí).
  const vencidos = filas
    .filter((p) => p.etapa === "contactado" && !p.contacto_pausado_at && p.ultimo_contacto_at && new Date(p.ultimo_contacto_at).getTime() <= limite && !enHoy.has(p.id))
    .sort((a, b) => a.ultimo_contacto_at!.localeCompare(b.ultimo_contacto_at!));
  for (const p of vencidos) {
    if (p.seguimientos >= ajustes.max_seguimientos) {
      await db.from("prospectos").update({ contacto_pausado_at: ahora.toISOString() }).eq("id", p.id);
      await db.from("prospectos_eventos").insert({ prospecto_id: p.id, tipo: "contacto", texto: `En pausa: ${p.seguimientos} seguimientos sin respuesta` });
      r.pausados++;
      continue;
    }
    const canal = p.canal_ultimo_contacto === "instagram" ? "instagram" : "whatsapp";
    if (cupo[canal] <= 0) continue;
    if (canal === "whatsapp" && !(p.whatsapp ?? p.telefono_norm)) continue;
    if (canal === "instagram" && !p.instagram) continue;
    cupo[canal]--;
    elegidos.push({ p, canal, tipo: p.seguimientos === 0 ? "seguimiento_1" : "seguimiento_2" });
    r.seguimientos++;
  }

  // 2. Nuevos: los mejores, primero WhatsApp y del resto Instagram.
  const nuevos = filas.filter((p) => p.etapa === "nuevo" && !contactados.has(p.id) && !enHoy.has(p.id)).sort((a, b) => puntaje(b) - puntaje(a) || a.id.localeCompare(b.id));
  const usados = new Set<string>();
  for (const p of nuevos) {
    if (cupo.whatsapp <= 0) break;
    if (!(p.whatsapp ?? p.telefono_norm)) continue;
    cupo.whatsapp--;
    usados.add(p.id);
    elegidos.push({ p, canal: "whatsapp", tipo: "primero" });
    r.nuevos++;
  }
  for (const p of nuevos) {
    if (cupo.instagram <= 0) break;
    if (usados.has(p.id) || !p.instagram) continue;
    cupo.instagram--;
    elegidos.push({ p, canal: "instagram", tipo: "primero" });
    r.nuevos++;
  }
  if (elegidos.length === 0) return r;

  // 3. El mensaje anterior (para que el seguimiento no lo repita) y la redacción.
  const anteriores = new Map<string, string>();
  const conSeg = elegidos.filter((e) => e.tipo !== "primero").map((e) => e.p.id);
  if (conSeg.length) {
    const { data } = await db.from("prospectos_contactos").select("prospecto_id, mensaje, fecha").in("prospecto_id", conSeg).is("deleted_at", null).order("fecha", { ascending: false }).limit(1000);
    for (const x of data ?? []) if (!anteriores.has(x.prospecto_id as string)) anteriores.set(x.prospecto_id as string, x.mensaje as string);
  }
  const paraMensaje: ParaMensaje[] = elegidos.map((e) => ({
    id: e.p.id,
    nombre: e.p.nombre,
    giro: e.p.giro,
    ciudad: e.p.ciudad,
    canal: e.canal,
    tipo: e.tipo,
    link: linkDe(o.sitio, e.p.slug),
    calificacion: e.p.calificacion,
    resenas: e.p.resenas,
    mensajeAnterior: anteriores.get(e.p.id) ?? null,
    servicios: e.p.clasificacion?.servicios ?? null,
  }));
  const redactados = new Map<string, string>();
  for (let i = 0; i < paraMensaje.length; i += 10) {
    try {
      for (const [k, v] of await o.redactar(paraMensaje.slice(i, i + 10))) redactados.set(k, v);
    } catch (e) {
      console.error("[prospectos] redactar", e instanceof Error ? e.message : e);
    }
  }

  const ordenBase = (hoy ?? []).length;
  const filasNuevas = paraMensaje.map((m, i) => {
    const ia = redactados.get(m.id);
    if (ia) r.porIA++;
    return { prospecto_id: m.id, fecha: o.fecha, canal: m.canal, tipo: m.tipo, orden: ordenBase + i, mensaje: ia ?? o.plantilla(m), redactado_por: ia ? "ia" : "plantilla" };
  });
  const { error: ei } = await db.from("prospectos_contactos").insert(filasNuevas);
  if (ei) throw new Error(`Guardar la lista: ${ei.message}`);
  r.whatsapp = filasNuevas.filter((x) => x.canal === "whatsapp").length;
  r.instagram = filasNuevas.filter((x) => x.canal === "instagram").length;
  return r;
}
