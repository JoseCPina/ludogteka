import { NextResponse, type NextRequest } from "next/server";
import { modoSimulacion } from "@/lib/mercadopago/config";
import { aplicarPagoLink, contextoDeOrden } from "@/lib/mercadopago/registro";

// El "checkout" de un link de pago SIMULADO: en desarrollo, el link que
// se le mandaría al cliente apunta aquí, y abrirlo equivale a pagarlo.
// En producción con Mercado Pago configurado esta ruta no hace nada.
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, contexto: { params: Promise<{ ordenId: string }> }) {
  if (!modoSimulacion()) {
    return new NextResponse("Esta ruta solo existe en modo simulación.", { status: 404 });
  }
  const { ordenId } = await contexto.params;
  const ctx = await contextoDeOrden({ id: ordenId });
  const orden = ctx?.orden;
  if (!ctx || !orden || orden.tipo !== "link") {
    return new NextResponse("Link de pago simulado no encontrado.", { status: 404 });
  }
  const r = await aplicarPagoLink(ctx.admin, orden, {
    id: `SIM-PAY-${ordenId.slice(0, 8)}`,
    status: "approved",
    status_detail: "accredited",
    external_reference: ordenId,
    transaction_amount: orden.monto,
    payment_type_id: "account_money",
    installments: 1,
    live_mode: false,
  });
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Pago simulado</title>
<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1f2937">
<h1>Pago simulado</h1>
<p>Este link es de <strong>simulación</strong> (la app no tiene Mercado Pago configurado). No se movió dinero.</p>
<p>Orden <code>${ordenId}</code> · $${orden.monto.toFixed(2)} · estado: <strong>${r.estado}</strong>${r.registrado ? " · cobro registrado" : r.sinTurno ? " · se registrará al abrir turno" : ""}</p>
<p>Ya puedes cerrar esta pestaña.</p></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
