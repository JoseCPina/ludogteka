import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { renovarSiHaceFalta } from "@/lib/mercadopago/oauth";
import { RENOVAR_ANTES_DIAS } from "@/lib/mercadopago/config";
import type { CredencialesMp } from "@/lib/pagos/tipos";

/**
 * Renovación diaria de los permisos de Mercado Pago (vercel.json → crons).
 * El token de OAuth vive 180 días; se renueva cuando le quedan menos de
 * RENOVAR_ANTES_DIAS. También se renueva solo al cobrar (conexionDeCobro),
 * así que esto cubre al negocio que pasa semanas sin usar la terminal.
 * Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin CRON_SECRET no corre.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const limite = new Date(Date.now() + RENOVAR_ANTES_DIAS * 86_400_000).toISOString();
  const { data: filas } = await createSupabaseAdminClient()
    .from("integraciones_cobro")
    .select("negocio_id")
    .eq("proveedor", "mercadopago")
    .eq("estado", "conectada")
    .eq("modo", "oauth")
    .lt("token_expira_at", limite)
    .is("deleted_at", null);
  let renovadas = 0;
  let fallidas = 0;
  for (const f of filas ?? []) {
    const negocioId = f.negocio_id as string;
    const admin = createSupabaseAdminClient(negocioId);
    try {
      const { data: secreto } = await admin.rpc("integracion_leer_secreto", { p_proveedor: "mercadopago" });
      if (typeof secreto !== "string" || !secreto) continue;
      const antes = JSON.parse(secreto) as CredencialesMp;
      const despues = await renovarSiHaceFalta(admin, negocioId, antes);
      if (despues.expiraAt !== antes.expiraAt) renovadas += 1;
      else fallidas += 1;
    } catch (e) {
      fallidas += 1;
      console.error("[cron] no se pudo renovar Mercado Pago", negocioId, e);
    }
  }
  return NextResponse.json({ ok: true, revisadas: filas?.length ?? 0, renovadas, fallidas });
}
