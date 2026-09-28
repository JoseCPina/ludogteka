import { NextResponse, type NextRequest } from "next/server";
import { conexionDeCobro, negocioParaCobro } from "@/lib/pagos/conexion";
import { remotoDeLink } from "@/lib/pagos/adaptadores";
import { aplicarEstado, contextoDeOrden } from "@/lib/pagos/registro";

// El "checkout" de un link de pago SIMULADO (demo, negocios en prueba,
// desarrollo): el link que se le mandaría al cliente apunta aquí, y
// abrirlo equivale a pagarlo. Solo sirve para órdenes marcadas como
// simuladas, y la base se niega a dar por pagada una simulada de un
// negocio real.
export const dynamic = "force-dynamic";

function pagina(titulo: string, cuerpo: string, status = 200) {
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>
<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#2b2a33">
<h1>${titulo}</h1>${cuerpo}</body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(_request: NextRequest, contexto: { params: Promise<{ ordenId: string }> }) {
  const { ordenId } = await contexto.params;
  const ctx = await contextoDeOrden({ id: ordenId });
  const orden = ctx?.orden;
  if (!ctx || !orden || orden.tipo !== "link" || !orden.simulado) {
    return pagina("Link no encontrado", "<p>Este link de pago simulado no existe.</p>", 404);
  }
  const negocio = await negocioParaCobro(orden.negocio_id);
  const cx = negocio ? await conexionDeCobro(negocio) : null;
  if (!cx || !cx.simulado) return pagina("Link no disponible", "<p>Este negocio ya no cobra en simulación.</p>", 404);
  try {
    const r = await aplicarEstado(
      ctx.admin,
      cx,
      orden,
      remotoDeLink(
        { id: `SIM-PAY-${ordenId.slice(0, 8)}`, status: "approved", status_detail: "accredited", external_reference: ordenId, transaction_amount: orden.monto, payment_type_id: "account_money", installments: 1, live_mode: false },
        orden
      )
    );
    return pagina(
      "Pago simulado",
      `<p><strong>Simulación: no mueve dinero.</strong> Este link es de prueba.</p>
<p>$${orden.monto.toFixed(2)} · estado: <strong>${r.estado}</strong>${r.registrado ? " · cobro registrado" : r.sinTurno ? " · se registrará al abrir turno" : ""}</p>
<p>Ya puedes cerrar esta pestaña.</p>`
    );
  } catch (e) {
    console.error("[cobro] link simulado", ordenId, e);
    return pagina("No se pudo simular", `<p>${e instanceof Error ? e.message : "Error"}</p>`, 409);
  }
}
