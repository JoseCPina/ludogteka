"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Enlace } from "@/components/ui/enlace";
import { dinero } from "@/lib/dinero";
import { cuentaPorCobrar } from "@/lib/caja/cuenta-por-cobrar";
import { alPublicarRegistros } from "@/components/concurrencia/registro-vivo";
import { conTope } from "@/lib/ui/espera";
import { cuentaDeReserva } from "@/app/(staff)/reservas/cuenta-viva-actions";

type Cuenta = { total: number; cobrado: number; devuelto: number; saldo: number; todaCancelada: boolean };

/**
 * QA S63 (N170): el encabezado de la cuenta de una reserva (total, cobrado, devuelto, saldo y «Cobrar»). Se pinta con
 * lo que trajo la página y, en cuanto una acción de esta pestaña termina (cancelar, cobrar, aplicar un cargo, mover
 * fechas: todas publican su registro final), vuelve a pedir la cuenta a la base y se repinta, sin esperar a que la
 * página se recargue. Nunca enseña «Cobrar» con la línea en $0 y el encabezado en $500.
 */
export function EncabezadoCuentaReserva({ reservaId, inicial, acciones }: { reservaId: string; inicial: Cuenta; acciones?: ReactNode }) {
  const [vivo, setVivo] = useState<Cuenta | null>(null);
  const [base, setBase] = useState(inicial);
  // La página refrescada trae otra cuenta: esa manda.
  if (base !== inicial) {
    setBase(inicial);
    setVivo(null);
  }
  const pedida = useRef(0);
  useEffect(
    () =>
      alPublicarRegistros(() => {
        const n = ++pedida.current;
        conTope(cuentaDeReserva(reservaId))
          .then((c) => {
            if (c && n === pedida.current) setVivo(c);
          })
          .catch(() => {});
      }),
    [reservaId]
  );
  const c = vivo ?? base;
  const hayQueCobrar = cuentaPorCobrar(c.saldo);
  return (
    <>
      <dl className="flex flex-col items-end text-sm text-n-700" data-totales-reserva>
        <div className="flex gap-1">
          <dt>Total{c.todaCancelada ? " (cancelada)" : ""}:</dt>
          <dd className="font-semibold text-n-900" data-total-cuenta>{dinero(c.total)}</dd>
        </div>
        {c.cobrado > 0 && (
          <div className="flex gap-1">
            <dt>Cobrado:</dt>
            <dd className="font-semibold text-n-900" data-total-cobrado>{dinero(c.cobrado)}</dd>
          </div>
        )}
        {c.devuelto > 0 && (
          <div className="flex gap-1">
            <dt>Devuelto:</dt>
            <dd className="font-semibold text-n-900" data-total-devuelto>{dinero(c.devuelto)}</dd>
          </div>
        )}
      </dl>
      <p className={`text-sm font-bold ${c.saldo > 0.005 ? "text-coral-oscuro" : c.saldo < -0.005 ? "text-ambar-oscuro" : "text-menta-oscuro"}`} data-saldo-reserva={c.saldo.toFixed(2)}>
        {c.saldo < -0.005 ? `Saldo a favor: devolver ${dinero(-c.saldo)}` : `Saldo: ${dinero(c.saldo)}`}
      </p>
      {c.todaCancelada && (
        <p className="max-w-xs text-right text-sm text-n-700" data-reserva-cancelada-cuenta>
          {hayQueCobrar
            ? `Reserva cancelada, pero la cuenta todavía debe ${dinero(c.saldo)} (de un total de ${dinero(c.total)}): es lo que sí se cobra.`
            : c.saldo < -0.005
              ? `Reserva cancelada: hay ${dinero(-c.saldo)} a favor del cliente que se devuelve desde la cuenta.`
              : "Reserva cancelada: no hay nada por cobrar."}
        </p>
      )}
      <div className="flex gap-2">
        {(!c.todaCancelada || hayQueCobrar || c.saldo < -0.005) && (
          <Enlace href={`/reservas/${reservaId}/cobrar`} data-cobrar-reserva>
            {/* N129: sin saldo por cobrar no se ofrece «Cobrar»: la cuenta pagada se abre para ver sus cobros. */}
            {c.todaCancelada ? (hayQueCobrar ? `Cobrar ${dinero(c.saldo)}` : c.saldo < -0.005 ? "Devolver el saldo a favor" : "Ver la cuenta") : hayQueCobrar ? "Cobrar" : c.saldo < -0.005 ? "Devolver el saldo a favor" : "Ver cobros"}
          </Enlace>
        )}
        {acciones}
      </div>
    </>
  );
}
