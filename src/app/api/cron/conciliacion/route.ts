import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioParaCobro } from "@/lib/pagos/conexion";
import { conciliarNegocio } from "@/lib/pagos/conciliacion";

/**
 * Conciliación de cobros con terminal contra Mercado Pago, cada hora (vercel.json).
 * Compara y MARCA (Necesita atención del negocio y administración de la
 * plataforma); nunca corrige. Vercel manda `Authorization: Bearer <CRON_SECRET>`.
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
  const { data: filas } = await createSupabaseAdminClient()
    .from("integraciones_cobro")
    .select("negocio_id")
    .eq("proveedor", "mercadopago")
    .eq("estado", "conectada")
    .is("deleted_at", null);
  const resumen: Record<string, unknown>[] = [];
  for (const f of filas ?? []) {
    const negocioId = f.negocio_id as string;
    try {
      const negocio = await negocioParaCobro(negocioId);
      if (!negocio) continue;
      const r = await conciliarNegocio(negocio);
      resumen.push("omitido" in r ? { negocioId, omitido: r.omitido } : { negocioId, revisados: r.revisados, pagos: r.pagos, hallazgos: r.hallazgos.length, ...r.guardado });
    } catch (e) {
      console.error("[conciliacion] falló", negocioId, e instanceof Error ? e.message : e);
      resumen.push({ negocioId, error: e instanceof Error ? e.message.slice(0, 120) : "error" });
    }
  }
  return NextResponse.json({ ok: true, negocios: resumen });
}
