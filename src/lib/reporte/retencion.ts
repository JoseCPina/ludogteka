import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_REPORTES } from "./constantes";

/**
 * Tarea diaria de borrado (solo servidor, secret key SIN negocio: recorre a
 * todos). Borra de Storage lo vencido y marca la fila; nunca toca lo vigente:
 *  · media_perro con vencida_at nulo y (expira_at < ahora, o la quitó el
 *    personal, o se quedó «subiendo» más de un día);
 *  · tarjetas de reportes_guarderia con tarjeta_expira_at < ahora (los datos
 *    del reporte se conservan, solo se va la imagen).
 * Solo se marca vencida si Storage confirmó el borrado. Idempotente.
 * `ahora` se inyecta para poder simular el reloj en las pruebas.
 */
const LOTE = 100;
const MAX_FILAS = 1000;

export type ResultadoRetencion = {
  media: { revisadas: number; borradas: number; fallidas: number };
  tarjetas: { revisadas: number; borradas: number; fallidas: number };
};

async function borrarDeStorage(admin: SupabaseClient, rutas: string[]): Promise<boolean> {
  const { error } = await admin.storage.from(BUCKET_REPORTES).remove(rutas);
  return !error;
}

export async function ejecutarRetencion(admin: SupabaseClient, ahora: Date = new Date()): Promise<ResultadoRetencion> {
  const iso = ahora.toISOString();
  const haceUnDia = new Date(ahora.getTime() - 86_400_000).toISOString();
  const resultado: ResultadoRetencion = {
    media: { revisadas: 0, borradas: 0, fallidas: 0 },
    tarjetas: { revisadas: 0, borradas: 0, fallidas: 0 },
  };

  // ── Fotos y videos ──
  const { data: media } = await admin
    .from("media_perro")
    .select("id, negocio_id, path, expira_at, quitada_at, estado, created_at")
    .is("vencida_at", null)
    .is("deleted_at", null)
    .or(`expira_at.lt.${iso},quitada_at.not.is.null,and(estado.eq.subiendo,created_at.lt.${haceUnDia})`)
    .order("expira_at")
    .limit(MAX_FILAS);
  // Defensa extra: se vuelve a comprobar en código, nunca se confía solo en el filtro.
  const vencidas = (media ?? []).filter(
    (m) =>
      new Date(m.expira_at as string).getTime() < ahora.getTime() ||
      m.quitada_at !== null ||
      (m.estado === "subiendo" && new Date(m.created_at as string).getTime() < ahora.getTime() - 86_400_000)
  );
  resultado.media.revisadas = vencidas.length;
  for (let i = 0; i < vencidas.length; i += LOTE) {
    const lote = vencidas.slice(i, i + LOTE);
    if (await borrarDeStorage(admin, lote.map((m) => m.path as string))) {
      const { error } = await admin
        .from("media_perro")
        .update({ vencida_at: iso, estado: "vencida" })
        .in("id", lote.map((m) => m.id as string));
      if (error) resultado.media.fallidas += lote.length;
      else resultado.media.borradas += lote.length;
    } else {
      resultado.media.fallidas += lote.length;
    }
  }

  // ── Tarjetas ──
  const { data: tarjetas } = await admin
    .from("reportes_guarderia")
    .select("id, tarjeta_path, tarjeta_expira_at")
    .not("tarjeta_path", "is", null)
    .is("tarjeta_vencida_at", null)
    .lt("tarjeta_expira_at", iso)
    .order("tarjeta_expira_at")
    .limit(MAX_FILAS);
  const caducadas = (tarjetas ?? []).filter(
    (t) => t.tarjeta_path && t.tarjeta_expira_at && new Date(t.tarjeta_expira_at as string).getTime() < ahora.getTime()
  );
  resultado.tarjetas.revisadas = caducadas.length;
  for (let i = 0; i < caducadas.length; i += LOTE) {
    const lote = caducadas.slice(i, i + LOTE);
    if (await borrarDeStorage(admin, lote.map((t) => t.tarjeta_path as string))) {
      const { error } = await admin
        .from("reportes_guarderia")
        .update({ tarjeta_vencida_at: iso })
        .in("id", lote.map((t) => t.id as string));
      if (error) resultado.tarjetas.fallidas += lote.length;
      else resultado.tarjetas.borradas += lote.length;
    } else {
      resultado.tarjetas.fallidas += lote.length;
    }
  }
  return resultado;
}
