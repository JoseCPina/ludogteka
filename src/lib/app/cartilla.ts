import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RegistroLeido } from "./cartilla-ia";
import { aRegistro, diasEntre, fechaLarga, hoyMx, instanteMx, proximas, sumarDias, type RegistroCartilla } from "./cartilla-util";

export * from "./cartilla-util";

/**
 * La cartilla digital de la app para dueños: lo que el dueño confirmó de la foto, lo que capturó a mano y, después,
 * lo que registre un negocio o una vet por QR. Cada registro con próxima dosis programa sus recordatorios
 * (app_recordatorios): 7 días antes y el mismo día, a las 10 de la mañana (hora del centro de México).
 */
export async function cartillaDe(mascotaId: string): Promise<RegistroCartilla[]> {
  const supabase = await createSupabaseServerClient("portal");
  const { data } = await supabase
    .from("mascotas_cartilla")
    .select("id, tipo, nombre, subtipo, lote, laboratorio, fecha_aplicacion, proxima_dosis, fuente, confianza, notas")
    .eq("mascota_id", mascotaId)
    .is("deleted_at", null)
    .order("fecha_aplicacion", { ascending: false, nullsFirst: false })
    .order("id");
  return ((data ?? []) as Record<string, unknown>[]).map(aRegistro);
}

/** Guarda registros confirmados (de la foto o a mano) con la sesión del dueño (RLS: su mascota) y reprograma recordatorios. */
export async function guardarRegistros(mascotaId: string, registros: (RegistroLeido & { notas?: string | null })[], fuente: "foto" | "manual", fotoId: string | null): Promise<{ error: string | null; ids: string[] }> {
  const supabase = await createSupabaseServerClient("portal");
  const filas = registros
    .filter((r) => r.nombre?.trim())
    .map((r) => ({
      mascota_id: mascotaId,
      tipo: r.tipo === "desparasitacion" ? "desparasitacion" : "vacuna",
      nombre: r.nombre.trim().slice(0, 80),
      subtipo: r.tipo === "desparasitacion" ? (r.subtipo ?? null) : null,
      lote: r.lote?.trim().slice(0, 40) || null,
      laboratorio: r.laboratorio?.trim().slice(0, 60) || null,
      fecha_aplicacion: r.fecha_aplicacion || null,
      proxima_dosis: r.proxima_dosis || null,
      fuente,
      confianza: fuente === "foto" ? Math.max(0, Math.min(1, Number(r.confianza ?? 1))) : null,
      foto_id: fotoId,
      notas: r.notas?.trim().slice(0, 300) || null,
      updated_at: new Date().toISOString(),
    }));
  if (!filas.length) return { error: "No hay nada que guardar.", ids: [] };
  const { data, error } = await supabase.from("mascotas_cartilla").insert(filas).select("id");
  if (error) return { error: "No pudimos guardar la cartilla. Intenta de nuevo.", ids: [] };
  const ids = ((data ?? []) as { id: string }[]).map((x) => x.id);
  if (fotoId) await supabase.from("mascotas_cartilla_fotos").update({ confirmada_at: new Date().toISOString(), registros: ids.length }).eq("id", fotoId);
  await programarRecordatorios(mascotaId);
  return { error: null, ids };
}

/**
 * Reprograma los recordatorios pendientes de una mascota a partir de su cartilla y sus medicamentos. Idempotente: lo
 * pendiente que ya no corresponde se omite y lo nuevo se crea; lo ya enviado no se toca. Corre con la llave de
 * servicio (la tabla la escribe solo el servidor) después de comprobar que la mascota es de quien llama… o desde
 * el cron, sin sesión.
 */
export async function programarRecordatorios(mascotaId: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { data: m } = await db.from("mascotas").select("id, dueno_id, nombre, fallecido, deleted_at, recordatorios_apagados").eq("id", mascotaId).maybeSingle();
  if (!m || m.deleted_at || m.fallecido || m.recordatorios_apagados) {
    await db.from("app_recordatorios").update({ estado: "omitido" }).eq("mascota_id", mascotaId).eq("estado", "pendiente");
    return;
  }
  const { data: filas } = await db.from("mascotas_cartilla").select("id, tipo, nombre, fecha_aplicacion, proxima_dosis").eq("mascota_id", mascotaId).is("deleted_at", null);
  const registros = ((filas ?? []) as Record<string, unknown>[]).map(aRegistro);
  const hoy = hoyMx();
  const deseados = new Map<string, { tipo: string; ref_id: string; para_at: string; titulo: string; cuerpo: string }>();
  for (const r of proximas(registros)) {
    if (!r.proximaDosis || diasEntre(hoy, r.proximaDosis) < -1) continue;
    const que = r.tipo === "vacuna" ? `la vacuna ${r.nombre}` : `la desparasitación (${r.nombre})`;
    for (const [dias, cuando] of [[7, "en una semana"], [0, "hoy"]] as const) {
      const fecha = sumarDias(r.proximaDosis, -dias);
      if (fecha < hoy) continue;
      const para = instanteMx(fecha, 10);
      deseados.set(`${r.tipo}|${r.id}|${para}`, { tipo: r.tipo, ref_id: r.id, para_at: para, titulo: `A ${m.nombre} le toca ${que}`, cuerpo: dias === 0 ? `Hoy le toca ${que}. Si ya se la pusieron, anótalo en su cartilla.` : `Le toca ${que} ${cuando} (${fechaLarga(r.proximaDosis)}). Si quieres, pide su cita desde aquí.` });
    }
  }
  // Medicamentos activos: una toma por hora del día, los próximos 14 días.
  const { data: meds } = await db.from("mascotas_medicamentos").select("id, nombre, dosis, horas, fecha_inicio, fecha_fin, activo").eq("mascota_id", mascotaId).is("deleted_at", null).eq("activo", true);
  for (const med of (meds ?? []) as { id: string; nombre: string; dosis: string | null; horas: string[]; fecha_inicio: string; fecha_fin: string | null }[]) {
    for (let d = 0; d < 14; d++) {
      const fecha = sumarDias(hoy, d);
      if (fecha < med.fecha_inicio || (med.fecha_fin && fecha > med.fecha_fin)) continue;
      for (const hora of med.horas ?? []) {
        const [hh, mm] = hora.split(":").map(Number);
        const para = instanteMx(fecha, hh, mm);
        if (new Date(para).getTime() < Date.now() - 10 * 60_000) continue;
        deseados.set(`medicamento|${med.id}|${para}`, { tipo: "medicamento", ref_id: med.id, para_at: para, titulo: `${m.nombre}: ${med.nombre}`, cuerpo: `Le toca ${med.nombre}${med.dosis ? ` (${med.dosis})` : ""}.` });
      }
    }
  }
  const { data: pendientes } = await db.from("app_recordatorios").select("id, tipo, ref_id, para_at").eq("mascota_id", mascotaId).eq("estado", "pendiente").is("deleted_at", null);
  const existentes = new Map(((pendientes ?? []) as { id: string; tipo: string; ref_id: string; para_at: string }[]).map((p) => [`${p.tipo}|${p.ref_id}|${new Date(p.para_at).toISOString()}`, p.id]));
  const sobran = [...existentes.entries()].filter(([k]) => !deseados.has(k)).map(([, id]) => id);
  if (sobran.length) await db.from("app_recordatorios").update({ estado: "omitido" }).in("id", sobran);
  const nuevos = [...deseados.entries()].filter(([k]) => !existentes.has(k)).map(([, v]) => ({ ...v, dueno_id: m.dueno_id, mascota_id: mascotaId, created_by: null, updated_at: new Date().toISOString() }));
  if (nuevos.length) {
    const { error } = await db.from("app_recordatorios").upsert(nuevos, { onConflict: "tipo,ref_id,para_at", ignoreDuplicates: true });
    if (error) console.error("[app] programar recordatorios", error.message);
  }
}

