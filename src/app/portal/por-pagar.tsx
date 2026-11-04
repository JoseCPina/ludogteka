import type { SupabaseClient } from "@supabase/supabase-js";
import { dinero } from "@/lib/dinero";
import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";
import { formasDePago, type AbonosCuenta } from "@/lib/pagos/abonos";
import { PagarPortal } from "./pagar-portal";

/**
 * «Por pagar» del portal (cobros parciales, 3 de noviembre de 2026): las cuentas del dueño con saldo, lo que ya pagó y sus
 * abonos (fecha, forma de pago y monto), y «Pagar» por lo que falta. Todo sale de la cuenta de Caja por funciones del
 * dueño (`mis_pagos_pendientes`, `mis_abonos`); ninguna tabla con dinero. Sin saldo, no sale nada.
 */
export async function PorPagarPortal({ supabase, zona }: { supabase: SupabaseClient; zona: string }) {
  const [{ data }, { data: aFavorCrudo }] = await Promise.all([supabase.rpc("mis_pagos_pendientes"), supabase.rpc("mis_saldos_a_favor")]);
  const pagos = ((data ?? []) as { reserva_id: string; descripcion: string; perros: string; fecha_actividad: string; saldo: number }[]).filter((p) => Number(p.saldo) > 0);
  // QA S62 (N162): lo que el negocio le tiene que devolver (se cobró de más), de la misma cuenta.
  const aFavor = ((aFavorCrudo ?? []) as { reserva_id: string; descripcion: string; perros: string; fecha_actividad: string; a_favor: number }[]).filter((p) => Number(p.a_favor) > 0.005);
  if (pagos.length === 0 && aFavor.length === 0) return null;
  if (pagos.length === 0) return <SaldosAFavorPortal lista={aFavor} />;
  const abonos = await Promise.all(pagos.map(async (p) => ((await supabase.rpc("mis_abonos", { p_reserva: p.reserva_id })).data as AbonosCuenta | null) ?? null));
  return (
    <section className="flex flex-col gap-3" data-por-pagar-portal>
      <h2 className="text-lg font-semibold text-foreground">Por pagar</h2>
      <ul className="flex flex-col gap-3">
        {pagos.map((p, i) => {
          const a = abonos[i];
          return (
            <li key={p.reserva_id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-tarjeta" data-pago-portal={p.reserva_id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-n-900">{p.descripcion}</span>
                <span className="text-sm text-n-600">{p.perros}{p.fecha_actividad ? ` · ${formatearFechaCalendario(p.fecha_actividad)}` : ""}</span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-n-600">Total</dt><dd className="font-semibold text-n-900">{dinero(Number(a?.total ?? p.saldo))}</dd></div>
                <div><dt className="text-n-600">Ya pagaste</dt><dd className="font-semibold text-n-900" data-pagado>{dinero(Number(a?.pagado ?? 0))}</dd></div>
                <div><dt className="text-n-600">Te falta</dt><dd className="font-semibold text-coral-oscuro" data-saldo>{dinero(Number(p.saldo))}</dd></div>
              </dl>
              {a && a.abonos.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-n-700" data-abonos>
                  {a.abonos.map((ab, k) => (
                    <li key={k} className="flex justify-between gap-2" data-abono>
                      <span>{formatearFecha(ab.fecha, zona)} · {formasDePago(ab.formas, ab.por_link)}</span>
                      <span className="font-semibold tabular-nums">{dinero(Number(ab.monto))}</span>
                    </li>
                  ))}
                  {a.devoluciones.map((d, k) => (
                    <li key={`d${k}`} className="flex justify-between gap-2" data-devolucion>
                      <span>{formatearFecha(d.fecha, zona)} · Te devolvieron</span>
                      <span className="font-semibold tabular-nums">−{dinero(Number(d.monto))}</span>
                    </li>
                  ))}
                </ul>
              )}
              <PagarPortal reservaId={p.reserva_id} saldo={Number(p.saldo)} />
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-n-600">El link cobra solo lo que te falta. También puedes pagar todo o una parte en recepción.</p>
      {aFavor.length > 0 && <SaldosAFavorPortal lista={aFavor} />}
    </section>
  );
}

function SaldosAFavorPortal({ lista }: { lista: { reserva_id: string; descripcion: string; perros: string; fecha_actividad: string; a_favor: number }[] }) {
  return (
    <section className="flex flex-col gap-3" data-saldos-a-favor-portal>
      <h2 className="text-lg font-semibold text-foreground">Saldo a favor</h2>
      <ul className="flex flex-col gap-3">
        {lista.map((p) => (
          <li key={p.reserva_id} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 shadow-tarjeta" data-saldo-a-favor={Number(p.a_favor).toFixed(2)}>
            <span className="font-semibold text-n-900">{p.descripcion}</span>
            <span className="text-sm text-n-700">Te tienen que devolver <strong>{dinero(Number(p.a_favor))}</strong>: se cobró de más. El negocio te lo devuelve; si tienes dudas, pregúntales.</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
