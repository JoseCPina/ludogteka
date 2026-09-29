import { NextResponse, type NextRequest } from "next/server";
import { appWebhookSecret, webhookSecretLegado } from "@/lib/mercadopago/config";
import { validarFirmaWebhook } from "@/lib/mercadopago/webhook";
import { consultarOrdenPoint, normalizarOrdenPoint } from "@/lib/mercadopago/point";
import { consultarPago } from "@/lib/mercadopago/links";
import { NEGOCIO_DE_LAS_LLAVES } from "@/lib/negocio/integraciones";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { remotoDeLink } from "@/lib/pagos/adaptadores";
import { conexionDeCobro, negocioParaCobro } from "@/lib/pagos/conexion";
import { aplicarEstado, contextoDeOrden, leerOrdenLocal, sincronizarTerminal } from "@/lib/pagos/registro";
import { sincronizarReembolsos } from "@/lib/pagos/reembolsos";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConexionCobro, OrdenLocal } from "@/lib/pagos/tipos";

// Después de aplicar el pago: si la orden está pagada, los reembolsos que
// Mercado Pago reporte y no conozcamos (hechos en su panel) entran a la caja.
async function reembolsosDe(admin: SupabaseClient, cx: ConexionCobro, orden: OrdenLocal, crudo: unknown): Promise<number> {
  const fresca = await leerOrdenLocal(admin, orden.id, orden.negocio_id);
  if (!fresca || fresca.estado !== "pagada") return 0;
  return sincronizarReembolsos(admin, cx, fresca, crudo);
}

/**
 * Webhook ÚNICO de Mercado Pago para todos los negocios de PeluDesk
 * (https://peludesk.mx/api/mercadopago/webhook; también responde en el
 * dominio de cada negocio, donde Ludogteka tenía el suyo).
 *
 * Nada se registra sin firma válida, y nada se toma del cuerpo:
 *   1. La firma dice de qué aplicación viene: la de PeluDesk (cuentas
 *      conectadas por OAuth) o la de Ludogteka (la llave del entorno, que
 *      solo puede ser de ESE negocio).
 *   2. El negocio sale de la cuenta que cobró (user_id → la cuenta que ese
 *      negocio conectó); con la firma de Ludogteka, solo Ludogteka.
 *   3. El recurso se lee de la API con el token DE ESE negocio (una orden o
 *      un pago de otra cuenta da 404), y su referencia tiene que ser una
 *      orden de ESE negocio. Un pago que apunte a la orden de otro negocio
 *      se rechaza y queda en los logs.
 * Mercado Pago espera 200/201 en menos de 22 s y reintenta si no; el
 * registro es idempotente, así que un reintento tardío no duplica nada.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rechazo(motivo: string, datos: Record<string, unknown>) {
  console.warn(`[mercadopago] notificación rechazada: ${motivo}`, datos);
  // 200: no tiene caso que Mercado Pago lo reintente.
  return NextResponse.json({ ok: false, motivo });
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const dataIdQuery = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const tipoQuery = url.searchParams.get("type") ?? url.searchParams.get("topic");

  let cuerpo: { type?: string; action?: string; user_id?: string | number; data?: { id?: string | number } } = {};
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = {};
  }
  const dataId = dataIdQuery ?? (cuerpo.data?.id != null ? String(cuerpo.data.id) : null);
  const tipo = tipoQuery ?? cuerpo.type ?? "";
  const userId = cuerpo.user_id != null ? String(cuerpo.user_id) : null;

  const firma = (secreto: string | null) =>
    secreto
      ? validarFirmaWebhook({ xSignature: request.headers.get("x-signature"), xRequestId: request.headers.get("x-request-id"), dataId, secreto }).valida
      : false;
  const deApp = firma(appWebhookSecret());
  const deLegado = !deApp && firma(webhookSecretLegado());
  if (!appWebhookSecret() && !webhookSecretLegado()) {
    console.error("[mercadopago] webhook sin ningún secreto configurado; ignorado.", { tipo, dataId });
    return NextResponse.json({ ok: false, motivo: "sin_secreto" }, { status: 200 });
  }
  if (!deApp && !deLegado) {
    console.warn("[mercadopago] firma inválida", { tipo, dataId });
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }
  // "Vinculación de aplicaciones" (mp-connect): llega al autorizar y al
  // quitar el permiso desde Mercado Pago. Visto en producción el 28 de
  // septiembre de 2026 (firmado con el secreto de la aplicación). Si el dueño
  // quitó el permiso, la conexión queda marcada para reconectar.
  if (tipo === "mp-connect" && deApp) {
    const accion = cuerpo.action ?? "";
    console.info("[mercadopago] vinculación", { accion, userId });
    if (userId && /deauthoriz|revok|unlink/i.test(accion)) {
      await createSupabaseAdminClient()
        .from("integraciones_cobro")
        .update({ estado: "error", ultimo_error: "Se quitó el permiso de PeluDesk desde Mercado Pago. Vuelve a conectar la cuenta." })
        .eq("proveedor", "mercadopago")
        .eq("cuenta_id", userId)
        .eq("estado", "conectada")
        .is("deleted_at", null);
    }
    return NextResponse.json({ ok: true, motivo: "vinculacion", accion });
  }
  if (!dataId) return NextResponse.json({ ok: true, motivo: "sin_id" });
  if (!["order", "orders", "payment"].includes(tipo)) return NextResponse.json({ ok: true, motivo: "tipo_ignorado", tipo });

  // ¿De qué negocio es?
  let negocioId: string | null = null;
  if (deApp) {
    if (!userId) return rechazo("sin_cuenta", { tipo, dataId });
    const { data: filas } = await createSupabaseAdminClient()
      .from("integraciones_cobro")
      .select("negocio_id")
      .eq("proveedor", "mercadopago")
      .eq("cuenta_id", userId)
      .eq("estado", "conectada")
      .is("deleted_at", null);
    if (!filas || filas.length !== 1) return rechazo(filas?.length ? "cuenta_ambigua" : "cuenta_desconocida", { tipo, dataId, userId });
    negocioId = filas[0].negocio_id as string;
  } else {
    negocioId = NEGOCIO_DE_LAS_LLAVES;
  }

  const negocio = await negocioParaCobro(negocioId);
  const cx = negocio ? await conexionDeCobro(negocio) : null;
  if (!cx || cx.proveedor !== "mercadopago" || cx.simulado) return rechazo("sin_conexion", { tipo, dataId, negocioId });
  if (deApp && cx.cuentaId && cx.cuentaId !== userId) return rechazo("otra_cuenta", { tipo, dataId, negocioId, userId });

  try {
    if (tipo === "order" || tipo === "orders") {
      // Point: data.id es la orden en Mercado Pago. Tiene que ser una orden
      // de ESTE negocio.
      const ctx = await contextoDeOrden({ mp_order_id: dataId, proveedor: "mercadopago" }, negocioId);
      if (!ctx) {
        const ajena = await contextoDeOrden({ mp_order_id: dataId, proveedor: "mercadopago" });
        return ajena ? rechazo("orden_de_otro_negocio", { dataId, negocioId, dueño: ajena.orden.negocio_id }) : NextResponse.json({ ok: true, motivo: "orden_desconocida" });
      }
      const crudo = await consultarOrdenPoint(cx, dataId);
      const remoto = normalizarOrdenPoint(crudo, ctx.orden.estado);
      const r = await aplicarEstado(ctx.admin, cx, ctx.orden, remoto);
      const reembolsos = await reembolsosDe(ctx.admin, cx, ctx.orden, crudo);
      return NextResponse.json({ ok: true, estado: r.estado, registrado: r.registrado, reembolsos });
    }

    // Pago (links): se lee con el token de este negocio; su referencia
    // tiene que ser una orden de este negocio.
    const pago = await consultarPago(cx, dataId);
    const ref = pago.external_reference;
    // Un pago sin nuestra referencia puede ser el de una terminal (su id de
    // /v1/payments), p. ej. al reembolsarlo desde el panel.
    const ctx = ref ? await contextoDeOrden({ id: ref }, negocioId) : await contextoDeOrden({ pago: String(pago.id ?? dataId) }, negocioId);
    if (!ctx) {
      const ajena = ref ? await contextoDeOrden({ id: ref }) : await contextoDeOrden({ pago: String(pago.id ?? dataId) });
      if (ajena) return rechazo("pago_a_orden_de_otro_negocio", { dataId, ref, negocioId, dueño: ajena.orden.negocio_id });
      return NextResponse.json({ ok: true, motivo: ref ? "orden_desconocida" : "sin_referencia" });
    }
    const r =
      ctx.orden.tipo === "link"
        ? await aplicarEstado(ctx.admin, cx, ctx.orden, remotoDeLink(pago, ctx.orden))
        : await sincronizarTerminal(ctx.admin, cx, ctx.orden);
    // En la terminal, los reembolsos se leen de la orden (el pago de la API
    // de pagos es el mismo dinero: con la orden basta y no se cuenta doble).
    const reembolsos = await reembolsosDe(ctx.admin, cx, ctx.orden, ctx.orden.tipo === "link" ? pago : undefined);
    return NextResponse.json({ ok: true, estado: r.estado, registrado: r.registrado, reembolsos });
  } catch (e) {
    console.error("[mercadopago] error procesando webhook", { tipo, dataId, negocioId, error: e instanceof Error ? e.message : String(e) });
    // 500 para que Mercado Pago reintente: el registro es idempotente.
    return NextResponse.json({ error: "No se pudo procesar." }, { status: 500 });
  }
}

// Mercado Pago a veces hace GET para validar la URL.
export async function GET() {
  return NextResponse.json({ ok: true });
}
