import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * El demo al día (vercel.json → crons, cada hora; QA S31). Nadie opera el demo (es de solo lectura), así que lo
 * sembrado para los días siguientes se vuelve pasado sin check-in. `estancias_poner_al_dia` le hace el check-in y el
 * check-out a su hora (o lo deja «No llegó») y saca a quien se quedó con la salida vencida: el demo nunca enseña
 * «Llegadas atrasadas» ni una ocupación desfasada. Vercel manda `Authorization: Bearer <CRON_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    const admin = createSupabaseAdminClient();
    const { data: demos, error } = await admin.from("negocios").select("id, slug").eq("plan", "demo").order("slug");
    if (error) throw error;
    const resultado: Record<string, unknown> = {};
    for (const n of demos ?? []) {
      const { data, error: e } = await createSupabaseAdminClient(n.id).rpc("estancias_poner_al_dia", { p_negocio: n.id, p_modo: "atender" });
      if (e) throw e;
      resultado[n.slug] = data;
    }
    return NextResponse.json({ ok: true, demos: resultado });
  } catch (e) {
    console.error("[cron] demo al día", e);
    return NextResponse.json({ ok: false, error: "No se pudo poner al día el demo." }, { status: 500 });
  }
}
