import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { fechaLocalDeInstante, horaLocalDeInstante, formatearFechaCalendario } from "@/lib/formato";
import { dinero } from "@/lib/dinero";
import { Enlace } from "@/components/ui/enlace";
import { SiPuedeAbrir } from "@/components/acceso-contexto";
import { ETIQUETA_METODO, etiquetaMovimiento, type MovimientoCaja } from "./tipos";

type Detalle = {
  movimiento: MovimientoCaja & { hecho_por: string | null };
  turno_id: string;
  turno_abierto: boolean;
  ciego: boolean;
  reserva_id?: string;
  cliente?: { id: string; nombre: string } | null;
  cobro?: { id: string; fecha: string; origen: string | null; notas: string | null; cobro_por: string | null; anulado: boolean; anulacion_motivo: string | null; metodos: { metodo: string; monto: number | null; propina: number | null; ajuste: boolean }[] } | null;
  lineas?: { tipo: string; descripcion: string; cantidad: number; precio_unitario: number; total: number }[] | null;
  citas?: { id: string; inicio: string; servicio: string | null; estado: string }[] | null;
  tarjeta_manual?: { folio: string; banco: string | null; ultimos4: string | null } | null;
  factura?: { id: string; serie: string | null; folio: string | null; estado: string } | null;
  devoluciones?: { fecha: string; motivo: string | null; autorizo: string | null; monto: number | null }[] | null;
  caja?: { motivo: string | null; nota: string | null; cancelado: boolean; motivo_cancelacion: string | null } | null;
  gasto?: { id: string; concepto: string; comprobante_path: string | null } | null;
};

const ORIGEN: Record<string, string> = { manual: "En mostrador", mercadopago_link: "Link de pago", mercadopago_terminal: "Terminal integrada", clip: "Clip" };
const monto = (x: number | null | undefined) => (x == null ? "Al cerrar el turno" : dinero(Number(x)));

/**
 * El detalle de un movimiento de caja (`caja_movimiento_detalle`): qué se cobró (las líneas de la cuenta), de qué cita o
 * estancia viene, cómo se pagó, comprobante (folio de la tarjeta o el del gasto), factura si la hay y quién lo hizo, con
 * enlaces a la cuenta y al cliente. La base ya quitó los montos del turno abierto a quien no es admin y la factura o el
 * gasto a quien no tiene su permiso.
 */
export async function DetalleMovimiento({ mov, zona }: { mov: string; zona: string }) {
  const [tipo, id] = mov.split(":");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("caja_movimiento_detalle", { p_tipo: tipo, p_id: id });
  if (error || !data) return <p className="text-sm text-coral-oscuro" role="alert">{error?.message ?? "No encontramos ese movimiento."}</p>;
  const d = data as Detalle;
  const m = d.movimiento;
  const e = etiquetaMovimiento(m);
  let comprobanteUrl: string | null = null;
  if (d.gasto?.comprobante_path) {
    const negocio = await negocioActual();
    comprobanteUrl = (await createSupabaseAdminClient(negocio.id).storage.from("gastos-comprobantes").createSignedUrl(d.gasto.comprobante_path, 3600)).data?.signedUrl ?? null;
  }
  return (
    <div className="flex flex-col gap-4 text-sm" data-detalle={mov}>
      <div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.clase}`}>{e.etiqueta}</span>
        <p className="mt-2 text-2xl font-bold tabular-nums text-n-900" data-detalle-monto={m.monto ?? ""}>{monto(m.monto)}</p>
        <p className="text-n-600">
          {formatearFechaCalendario(fechaLocalDeInstante(m.fecha, zona))} · {horaLocalDeInstante(m.fecha, zona)}
          {m.metodo ? ` · ${ETIQUETA_METODO[m.metodo] ?? m.metodo}` : ""}
          {d.turno_abierto ? " · turno abierto" : ""}
        </p>
        {m.hecho_por && <p className="text-n-600">Lo hizo {m.hecho_por}</p>}
        {d.ciego && <p className="mt-1 text-ambar-oscuro">Corte ciego: los montos de este turno se ven al cerrarlo.</p>}
      </div>

      {(d.cliente || d.reserva_id) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {d.cliente && <SiPuedeAbrir href={`/clientes/${d.cliente.id}`}><Enlace href={`/clientes/${d.cliente.id}`} data-ir-cliente>{d.cliente.nombre}</Enlace></SiPuedeAbrir>}
          {d.reserva_id && <Enlace href={`/caja/cobrar/${d.reserva_id}`} data-ir-cuenta>Ver la cuenta</Enlace>}
        </div>
      )}

      {d.cobro && (
        <section>
          <h3 className="font-semibold text-n-900">El cobro</h3>
          <p className="text-n-600">{ORIGEN[d.cobro.origen ?? "manual"] ?? d.cobro.origen} · cobró {d.cobro.cobro_por ?? "—"}{d.cobro.anulado ? " · anulado" : ""}</p>
          {d.cobro.anulado && d.cobro.anulacion_motivo && <p className="text-coral-oscuro">Motivo: {d.cobro.anulacion_motivo}</p>}
          <ul className="mt-1 flex flex-col gap-0.5">
            {(d.cobro.metodos ?? []).map((x, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{ETIQUETA_METODO[x.metodo] ?? x.metodo}{x.ajuste ? " (ajuste)" : ""}{x.propina ? ` · propina ${monto(x.propina)}` : ""}</span>
                <span className="tabular-nums">{monto(x.monto)}</span>
              </li>
            ))}
          </ul>
          {d.cobro.notas && <p className="mt-1 text-n-600">Notas: {d.cobro.notas}</p>}
        </section>
      )}

      {d.lineas && d.lineas.length > 0 && (
        <section>
          <h3 className="font-semibold text-n-900">Lo que se cobró (la cuenta)</h3>
          <ul className="mt-1 flex flex-col gap-0.5" data-detalle-lineas>
            {d.lineas.map((l, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="min-w-0">{l.descripcion}{Number(l.cantidad) > 1 ? ` × ${l.cantidad}` : ""}</span>
                <span className="tabular-nums">{dinero(Number(l.total))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.citas && d.citas.length > 0 && (
        <section>
          <h3 className="font-semibold text-n-900">Viene de</h3>
          <ul className="mt-1 flex flex-col gap-0.5">
            {d.citas.map((c) => (
              <li key={c.id}><Enlace href={`/estetica/${c.id}`}>{c.servicio ?? "Cita de estética"} · {formatearFechaCalendario(fechaLocalDeInstante(c.inicio, zona))}</Enlace></li>
            ))}
          </ul>
        </section>
      )}

      {d.tarjeta_manual && (
        <section>
          <h3 className="font-semibold text-n-900">Comprobante</h3>
          <p>Voucher {d.tarjeta_manual.folio}{d.tarjeta_manual.banco ? ` · ${d.tarjeta_manual.banco}` : ""}{d.tarjeta_manual.ultimos4 ? ` · •••• ${d.tarjeta_manual.ultimos4}` : ""}</p>
        </section>
      )}

      {d.factura && (
        <section>
          <h3 className="font-semibold text-n-900">Factura</h3>
          <p>{[d.factura.serie, d.factura.folio].filter(Boolean).join("-") || "Factura"} · {d.factura.estado} · <Enlace href={`/caja/facturas/${d.factura.id}/pdf`} enTexto>PDF</Enlace></p>
        </section>
      )}

      {d.devoluciones && d.devoluciones.length > 0 && (
        <section>
          <h3 className="font-semibold text-n-900">Devoluciones de este cobro</h3>
          <ul className="mt-1 flex flex-col gap-0.5">
            {d.devoluciones.map((x, i) => (
              <li key={i}>{formatearFechaCalendario(fechaLocalDeInstante(x.fecha, zona))} · {monto(x.monto)}{x.autorizo ? ` · autorizó ${x.autorizo}` : ""}{x.motivo ? ` · ${x.motivo}` : ""}</li>
            ))}
          </ul>
        </section>
      )}

      {d.caja && (
        <section>
          <h3 className="font-semibold text-n-900">{m.tipo === "ingreso_efectivo" ? "Efectivo agregado" : "Retiro"}</h3>
          <p>{d.caja.motivo}{d.caja.nota ? ` — ${d.caja.nota}` : ""}</p>
          {d.caja.cancelado && <p className="text-coral-oscuro">Cancelado{d.caja.motivo_cancelacion ? `: ${d.caja.motivo_cancelacion}` : ""}</p>}
        </section>
      )}

      {d.gasto && (
        <section>
          <h3 className="font-semibold text-n-900">Gasto</h3>
          <p>{d.gasto.concepto} · <Enlace href={`/gastos?gasto=${d.gasto.id}`} enTexto>Ver en Gastos</Enlace></p>
          {comprobanteUrl && <Enlace href={comprobanteUrl} target="_blank" rel="noopener" enTexto>Ver comprobante</Enlace>}
        </section>
      )}
    </div>
  );
}
