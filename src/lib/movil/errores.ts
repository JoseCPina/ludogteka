import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Los cierres que manda la app nativa al siguiente arranque (apps/duenos-movil/src/lib/errores.ts). Es pública porque un
 * cierre puede pasar antes de entrar: por eso se limita por tamaño, por IP y por día, y se vuelve a limpiar lo que llega.
 */
const POR_ENVIO = 10;
const POR_IP_AL_DIA = 50;
const TOTAL_AL_DIA = 5000;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function limpiar(texto: string): string {
  return texto
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[correo]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(UUID, ":id")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[numero]");
}
const texto = (v: unknown, largo: number): string | null => (typeof v === "string" && v.trim() ? limpiar(v.trim()).slice(0, largo) : null);

export async function registrarErroresApp(lista: unknown): Promise<{ error: string | null; guardados?: number }> {
  if (!Array.isArray(lista)) return { error: "No entendimos la petición." };
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipHash = ip ? createHash("sha256").update(`app-errores:${ip}`).digest("hex") : null;
  const db = createSupabaseAdminClient();
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: total } = await db.from("app_errores").select("id", { count: "exact", head: true }).gte("created_at", desde);
  if ((total ?? 0) >= TOTAL_AL_DIA) return { error: null, guardados: 0 };
  if (ipHash) {
    const { count } = await db.from("app_errores").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", desde);
    if ((count ?? 0) >= POR_IP_AL_DIA) return { error: null, guardados: 0 };
  }
  const filas = lista.slice(0, POR_ENVIO).flatMap((x) => {
    const e = (x ?? {}) as Record<string, unknown>;
    const mensaje = texto(e.mensaje, 500);
    if (!mensaje) return [];
    const cuando = typeof e.ocurrido_at === "string" ? Date.parse(e.ocurrido_at) : NaN;
    return [{
      mensaje,
      stack: texto(e.stack, 4000),
      pantalla: texto(e.pantalla, 200),
      version: texto(e.version, 60) ?? "?",
      modelo: texto(e.modelo, 100),
      sistema: texto(e.sistema, 60),
      fatal: e.fatal === true,
      ocurrido_at: new Date(Number.isNaN(cuando) ? Date.now() : cuando).toISOString(),
      ip_hash: ipHash,
    }];
  });
  if (!filas.length) return { error: null, guardados: 0 };
  const { error } = await db.from("app_errores").insert(filas);
  if (error) {
    console.error("[movil] errores", error.message);
    return { error: "No pudimos guardarlo." };
  }
  return { error: null, guardados: filas.length };
}
