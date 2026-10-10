import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sincronizarCancelaciones, timbrarFactura } from "@/lib/cfdi/servicio";

/**
 * Cada hora (vercel.json → crons), por negocio con facturación activa:
 *  · la factura global de los periodos ya cerrados, SOLO si el negocio la tiene
 *    en automático (cfdi_config_negocio.global_automatica) — la regla pide
 *    emitirla dentro de las 24 horas siguientes al cierre del periodo;
 *  · el seguimiento de las cancelaciones que esperan al receptor.
 * Corre con la secret key atada a UN negocio por vez; nada de otro negocio se ve.
 * Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin CRON_SECRET no corre.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const global = createSupabaseAdminClient();
  const { data: negocios } = await global
    .from("cfdi_config_negocio")
    .select("negocio_id, global_automatica")
    .eq("activa", true)
    .not("llave_secreto_id", "is", null)
    .is("deleted_at", null);
  let globales = 0;
  let fallidas = 0;
  let canceladas = 0;
  for (const n of negocios ?? []) {
    const negocioId = n.negocio_id as string;
    const admin = createSupabaseAdminClient(negocioId);
    try {
      canceladas += await sincronizarCancelaciones(admin, negocioId);
      if (!n.global_automatica) continue;
      const { data: periodos } = await admin.rpc("cfdi_global_periodos");
      for (const p of (periodos ?? []) as { desde: string; hasta: string; factura_id: string | null; factura_estado: string | null }[]) {
        // Un borrador que falló se reintenta; uno «timbrando» o «por revisar» lo ve una persona.
        if (p.factura_estado === "timbrando" || p.factura_estado === "revisar") continue;
        let facturaId = p.factura_id;
        if (!facturaId) {
          const { data, error } = await admin.rpc("cfdi_preparar_global", { p_desde: p.desde, p_hasta: p.hasta });
          if (error) {
            console.error("[cfdi] cron preparar global", negocioId, error.message);
            fallidas += 1;
            continue;
          }
          facturaId = data as string;
        }
        const r = await timbrarFactura(admin, admin, negocioId, facturaId);
        if (r.error) {
          console.error("[cfdi] cron timbrar global", negocioId, r.error);
          fallidas += 1;
        } else globales += 1;
      }
    } catch (e) {
      fallidas += 1;
      console.error("[cfdi] cron", negocioId, e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ negocios: negocios?.length ?? 0, globales, canceladas, fallidas });
}
