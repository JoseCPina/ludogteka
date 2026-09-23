import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { modoSimulacion, webhookSecret } from "@/lib/mercadopago/config";
import { validarFirmaWebhook } from "@/lib/mercadopago/webhook";
import { consultarOrdenPoint } from "@/lib/mercadopago/point";
import { leerOrdenLocal, sincronizarOrdenPoint, sincronizarPagoPorId } from "@/lib/mercadopago/registro";

// Webhook de Mercado Pago. Público (no hay sesión: llama Mercado Pago),
// pero NADA se registra sin firma válida: el secreto del panel es lo que
// prueba que la notificación viene de Mercado Pago y no de alguien que
// conoce la URL. Y aun con firma válida, el pago se lee de la API con el
// access token (nunca del cuerpo de la notificación) antes de registrar.
//
// Mercado Pago espera 200/201 en menos de 22 s y reintenta si no; el
// registro es idempotente, así que un reintento tardío no duplica nada.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secreto = webhookSecret();
  const url = new URL(request.url);
  const dataIdQuery = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const tipoQuery = url.searchParams.get("type") ?? url.searchParams.get("topic");

  let cuerpo: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = {};
  }
  const dataId = dataIdQuery ?? (cuerpo.data?.id != null ? String(cuerpo.data.id) : null);
  const tipo = tipoQuery ?? cuerpo.type ?? "";

  if (!secreto) {
    // Sin secreto no se puede validar nada: se contesta 200 para que
    // Mercado Pago no reintente en bucle, y se deja rastro en los logs.
    console.error("[mercadopago] webhook recibido sin MERCADOPAGO_WEBHOOK_SECRET configurado; ignorado.", { tipo, dataId });
    return NextResponse.json({ ok: false, motivo: "sin_secreto" }, { status: 200 });
  }

  const firma = validarFirmaWebhook({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    secreto,
  });
  if (!firma.valida) {
    console.warn("[mercadopago] firma inválida:", firma.motivo, { tipo, dataId });
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }
  if (!dataId) return NextResponse.json({ ok: true, motivo: "sin_id" });

  const admin = createSupabaseAdminClient();
  try {
    if (tipo === "order" || tipo === "orders") {
      // Point: data.id es el id de la orden en Mercado Pago (ORD…).
      const { data: fila } = await admin.from("mp_ordenes").select("id").eq("mp_order_id", dataId).maybeSingle();
      if (!fila) return NextResponse.json({ ok: true, motivo: "orden_desconocida" });
      const orden = await leerOrdenLocal(admin, fila.id as string);
      if (!orden) return NextResponse.json({ ok: true });
      // En simulación no hay API a la que preguntar: la orden se resuelve sola.
      const remota = modoSimulacion() ? undefined : await consultarOrdenPoint(dataId);
      const r = await sincronizarOrdenPoint(admin, orden, remota);
      return NextResponse.json({ ok: true, estado: r.estado, registrado: r.registrado });
    }
    if (tipo === "payment") {
      const r = await sincronizarPagoPorId(admin, dataId);
      return NextResponse.json({ ok: true, estado: r?.estado ?? "ignorado", registrado: r?.registrado ?? false });
    }
    return NextResponse.json({ ok: true, motivo: "tipo_ignorado", tipo });
  } catch (e) {
    console.error("[mercadopago] error procesando webhook", { tipo, dataId, error: e instanceof Error ? e.message : String(e) });
    // 500 para que Mercado Pago reintente: el registro es idempotente.
    return NextResponse.json({ error: "No se pudo procesar." }, { status: 500 });
  }
}

// Mercado Pago a veces hace GET para validar la URL.
export async function GET() {
  return NextResponse.json({ ok: true });
}
