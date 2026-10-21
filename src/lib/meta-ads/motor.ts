import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { crearApiMeta } from "./api";
import { asegurarCampanas, type ResultadoCampanas } from "./campanas";
import { sincronizarAudiencias } from "./sincronizar";

// Arma la sincronización con las variables del servidor (META_ADS_TOKEN y META_AD_ACCOUNT_ID, sensibles en Vercel;
// nunca al navegador ni a los registros). Fuera de producción META_ADS_API_URL apunta al doble de las pruebas y
// META_ANUNCIOS_URL a donde se sirven las imágenes de los anuncios.
const enPrueba = (n: string) => (process.env.VERCEL_ENV !== "production" ? process.env[n]?.trim().replace(/\/$/, "") || null : null);

export async function correrSincronizacionMeta(origen: "cron" | "manual") {
  const token = process.env.META_ADS_TOKEN?.trim();
  const cuenta = process.env.META_AD_ACCOUNT_ID?.trim();
  const api = token && cuenta ? crearApiMeta({ token, cuenta, url: enPrueba("META_ADS_API_URL") ?? undefined }) : null;
  const db = createSupabaseAdminClient();
  const r = await sincronizarAudiencias({ db, api, origen });
  // Después de las listas: públicos similares, campaña de clic a WhatsApp (en PAUSADO) y sus últimos 7 días.
  let campanas: ResultadoCampanas | null = null;
  if (api && r.estado !== "ocupada" && r.estado !== "sin_credenciales") {
    try {
      campanas = await asegurarCampanas({ db, api, urlImagenes: enPrueba("META_ANUNCIOS_URL") ?? "https://peludesk.mx/peludesk/anuncios" });
    } catch (e) {
      campanas = { creados: [], errores: [e instanceof Error ? e.message : String(e)], activados: [], insights: 0, manuales: [], editados: [], adoptados: [] };
    }
    if (r.corridaId) await db.from("meta_audiencias_corridas").update({ resumen: { ...r.resumen, campanas } }).eq("id", r.corridaId);
  }
  return { ...r, campanas };
}
