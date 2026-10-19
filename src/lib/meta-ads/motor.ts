import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { crearApiMeta } from "./api";
import { sincronizarAudiencias } from "./sincronizar";

// Arma la sincronización con las variables del servidor (META_ADS_TOKEN y META_AD_ACCOUNT_ID, sensibles en Vercel;
// nunca al navegador ni a los registros). Fuera de producción META_ADS_API_URL apunta al doble de las pruebas.
const enPrueba = (n: string) => (process.env.VERCEL_ENV !== "production" ? process.env[n]?.trim().replace(/\/$/, "") || null : null);

export async function correrSincronizacionMeta(origen: "cron" | "manual") {
  const token = process.env.META_ADS_TOKEN?.trim();
  const cuenta = process.env.META_AD_ACCOUNT_ID?.trim();
  const api = token && cuenta ? crearApiMeta({ token, cuenta, url: enPrueba("META_ADS_API_URL") ?? undefined }) : null;
  return sincronizarAudiencias({ db: createSupabaseAdminClient(), api, origen });
}
