import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { INDEXNOW_LLAVE } from "@/lib/peludesk/indexnow";
import { SITIO } from "@/lib/peludesk/seo";
import { correrIndexNow, type Almacen } from "@/lib/seo/indexnow-auto";

/**
 * IndexNow automático (vercel.json → crons, cada hora al minuto 53): lee el sitemap de peludesk.mx, compara la
 * huella del contenido de cada página con la última que avisó y manda a IndexNow solo las URL nuevas o cambiadas.
 * Como corre cada hora, un despliegue se avisa a más tardar en la hora siguiente; sin cambios no manda nada.
 * Cada envío queda en `indexnow_envios` con la respuesta. Vercel manda `Authorization: Bearer <CRON_SECRET>`;
 * sin CRON_SECRET no corre. Fuera de producción INDEXNOW_SITIO_URL / INDEXNOW_API_URL apuntan a dobles
 * (en producción se ignoran).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const enPrueba = (n: string) => (process.env.VERCEL_ENV !== "production" ? process.env[n]?.trim().replace(/\/$/, "") || null : null);

function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

function almacen(): Almacen {
  const db = createSupabaseAdminClient();
  return {
    async huellas() {
      const mapa = new Map<string, string>();
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await db.from("indexnow_urls").select("url, huella").is("deleted_at", null).order("url").order("id").range(desde, desde + 999);
        if (error) throw new Error(error.message);
        for (const f of data ?? []) mapa.set(f.url as string, f.huella as string);
        if ((data ?? []).length < 1000) break;
      }
      return mapa;
    },
    async guardar(filas) {
      const ahora = new Date().toISOString();
      for (let i = 0; i < filas.length; i += 200) {
        const { error } = await db.from("indexnow_urls").upsert(
          filas.slice(i, i + 200).map((f) => ({ ...f, enviada_at: ahora })),
          { onConflict: "url" }
        );
        if (error) throw new Error(error.message);
      }
    },
    async registrar(envio) {
      const { error } = await db.from("indexnow_envios").insert(envio);
      if (error) throw new Error(error.message);
    },
  };
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    const r = await correrIndexNow({
      sitio: enPrueba("INDEXNOW_SITIO_URL") ?? SITIO,
      llave: INDEXNOW_LLAVE,
      apiUrl: enPrueba("INDEXNOW_API_URL") ?? "https://api.indexnow.org/IndexNow",
      almacen: almacen(),
      origen: "cron",
    });
    return NextResponse.json({ ok: r.estado !== "fallido", ...r });
  } catch (e) {
    console.error("[cron] indexnow", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
