import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { conexionDeCobro, negocioParaCobro } from "@/lib/pagos/conexion";
import { contextoDeOrden, sincronizarTerminal } from "@/lib/pagos/registro";

/**
 * Webhook de Clip. Cada negocio tiene SU URL (…/api/clip/webhook/<token>),
 * que pega en el portal de Clip; el token (solo su sha256 vive en la base)
 * dice de qué negocio es. Clip no firma sus notificaciones de forma
 * documentada, así que nada se toma del cuerpo: se busca la orden de ESE
 * negocio por la referencia o el id del cobro, y se le pregunta a Clip con
 * las credenciales de ese negocio. Un cobro de otro negocio no se alcanza.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, contexto: { params: Promise<{ token: string }> }) {
  const { token } = await contexto.params;
  if (!token || token.length < 20) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  const { data: fila } = await createSupabaseAdminClient()
    .from("integraciones_cobro")
    .select("negocio_id")
    .eq("proveedor", "clip")
    .eq("webhook_token_hash", createHash("sha256").update(token).digest("hex"))
    .is("deleted_at", null)
    .maybeSingle();
  if (!fila) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  const negocioId = fila.negocio_id as string;

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = {};
  }
  const datos = (cuerpo.data && typeof cuerpo.data === "object" ? cuerpo.data : cuerpo) as Record<string, unknown>;
  const referencia = typeof datos.reference === "string" ? datos.reference : null;
  const idClip = [datos.pinpad_request_id, datos.pinpadRequestId, datos.id].find((v) => typeof v === "string") as string | undefined;

  const negocio = await negocioParaCobro(negocioId);
  const cx = negocio ? await conexionDeCobro(negocio) : null;
  if (!cx || cx.proveedor !== "clip" || cx.simulado) {
    console.warn("[clip] notificación sin conexión activa", { negocioId });
    return NextResponse.json({ ok: false, motivo: "sin_conexion" });
  }

  const ctx =
    (referencia ? await contextoDeOrden({ id: referencia }, negocioId) : null) ??
    (idClip ? await contextoDeOrden({ mp_order_id: idClip, proveedor: "clip" }, negocioId) : null);
  if (!ctx || ctx.orden.proveedor !== "clip") {
    console.warn("[clip] notificación de una orden que no es de este negocio", { negocioId, referencia, idClip });
    return NextResponse.json({ ok: false, motivo: "orden_desconocida" });
  }
  try {
    const r = await sincronizarTerminal(ctx.admin, cx, ctx.orden);
    return NextResponse.json({ ok: true, estado: r.estado, registrado: r.registrado });
  } catch (e) {
    console.error("[clip] error procesando webhook", { negocioId, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo procesar." }, { status: 500 });
  }
}
