import { formatearFecha, formatearHoraNegocio } from "@/lib/formato";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";
import { Enlace } from "@/components/ui/enlace";

export type MovimientoTurno = {
  id: string;
  tipo: string;
  fecha: string;
  reservaId: string | null;
  clienteNombre: string | null;
  descripcion: string;
  metodo: string;
  origen: string;
  // Si el cobro fue parte de un cobro junto (varias cuentas, un solo pago).
  grupoId?: string | null;
  hechoPorNombre: string;
  // «anulacion» o «edicion_monto» si es un ajuste de un cobro; «original_anulado» si es un cobro que se anuló después.
  ajusteTipo?: string | null;
};

const ETIQUETA_TIPO: Record<string, string> = {
  cobro: "Cobro",
  venta_bono: "Venta de bono",
  venta_mostrador: "Venta de mostrador",
  devolucion: "Devolución",
  retiro: "Retiro",
  ingreso_efectivo: "Efectivo agregado",
};
const ETIQUETA_AJUSTE: Record<string, string> = {
  anulacion: "ajuste: anulación",
  edicion_monto: "ajuste: monto corregido",
  original_anulado: "anulado después",
};
const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  terminal: "Terminal",
  transferencia: "Transferencia",
  tarjeta_manual: "Tarjeta manual (sin verificar)",
};
const MOTIVO_EFECTIVO: Record<string, string> = {
  cambio: "Cambio",
  ingreso: "Ingreso",
  prestamo_caja: "Préstamo de otra caja",
  aportacion_dueno: "Aportación del dueño",
  otro: "Otro",
};
const ETIQUETA_ORIGEN: Record<string, string> = {
  manual: "a mano",
  mercadopago_point: "terminal Mercado Pago",
  mercadopago_link: "link de pago",
  clip_terminal: "terminal Clip",
};

/**
 * Lo que movió dinero en el turno ABIERTO, sin un solo monto (QA R59, N148: corte ciego, regla de Fase 5). Quien va a
 * contar —recepción o admin— no ve ni recibe lo esperado: ni el acumulado por método, ni los totales de servicios y
 * ventas, ni el monto de cada movimiento (con un solo cobro con terminal, su monto ES el esperado de la terminal). La
 * página ni siquiera los pinta: solo hora, qué fue, de quién, el método y quién lo hizo. La comparación sale al
 * «Enviar conteo» (cerrar_turno) y el corte queda en «Turnos cerrados».
 */
export function MovimientosTurno({
  movimientos,
  zona,
  totalMovimientos,
  verMasHref,
}: {
  // Solo los más recientes (la página que se ve).
  movimientos: MovimientoTurno[];
  zona: string;
  totalMovimientos: number;
  verMasHref: string | null;
}) {
  return (
    <div className="flex flex-col gap-4" data-movimientos-ciegos>
      <p className="text-sm text-n-600">
        Corte ciego: mientras el turno esté abierto no se muestran montos ni totales por método. Se comparan con tu conteo al
        enviar el arqueo y quedan en el corte.
      </p>
      {totalMovimientos > movimientos.length && (
        <p className="text-sm text-n-600" data-movimientos-conteo>
          Se muestran los {movimientos.length} movimientos más recientes de {totalMovimientos}.
        </p>
      )}
      {movimientos.length === 0 ? (
        <p className="text-sm text-n-500">Todavía no hay movimientos en este turno.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
          <TablaResponsiva className="w-full border-collapse text-sm max-sm:block">
            <thead className="max-sm:hidden">
              <tr>
                {["Hora", "Movimiento", "Cliente / motivo", "Método"].map((h) => (
                  <th key={h} className="border-b border-n-200 bg-n-100 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {movimientos.map((m) => (
                <tr key={`${m.tipo}-${m.id}`} data-movimiento-ajuste={m.ajusteTipo ?? undefined} className={`max-sm:block max-sm:border-b max-sm:border-n-200 max-sm:px-3 max-sm:py-2 ${m.ajusteTipo === "original_anulado" ? "opacity-60" : ""}`}>
                  <td className="border-b border-n-200 px-3 py-2 max-sm:flex max-sm:justify-between max-sm:gap-3 max-sm:border-0 max-sm:px-0 max-sm:py-0.5 tabular-nums text-n-600"><span data-hora-movimiento>{formatearHoraNegocio(m.fecha, zona)}</span>
                  <span className="ml-2 text-xs text-n-500 sm:ml-0 sm:block">{formatearFecha(m.fecha, zona)}</span>
                </td>
                  <td className="border-b border-n-200 px-3 py-2 max-sm:block max-sm:border-0 max-sm:px-0 max-sm:py-0.5 text-n-900">
                    {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
                    {m.ajusteTipo && <span className="ml-2 rounded-full bg-ambar-suave px-2 py-0.5 text-xs font-semibold text-ambar-oscuro">{ETIQUETA_AJUSTE[m.ajusteTipo] ?? m.ajusteTipo}</span>}
                    {m.tipo === "ingreso_efectivo" ? (
                      <span className="ml-2 rounded-full bg-n-100 px-2 py-0.5 text-xs font-bold text-n-700" data-motivo-efectivo>{MOTIVO_EFECTIVO[m.origen] ?? m.origen}</span>
                    ) : (
                      m.origen !== "manual" && <span className="ml-2 rounded-full bg-morado-suave px-2 py-0.5 text-xs font-semibold text-morado">{ETIQUETA_ORIGEN[m.origen]}</span>
                    )}
                    {m.grupoId && (
                      <Enlace href={`/caja/recibo-junto/${m.grupoId}`} className="ml-2 text-xs" data-movimiento-junto>
                        cobro junto
                      </Enlace>
                    )}
                  </td>
                  <td className="border-b border-n-200 px-3 py-2 max-sm:block max-sm:border-0 max-sm:px-0 max-sm:py-0.5 text-n-700">
                    {m.reservaId ? (
                      <Enlace href={`/caja/cobrar/${m.reservaId}`}>
                        {m.clienteNombre ?? "Cuenta"}
                      </Enlace>
                    ) : (
                      m.clienteNombre
                    )}
                    {m.descripcion ? <span className="block text-xs text-n-500">{m.descripcion}</span> : null}
                    <span className="block text-xs text-n-500">{m.hechoPorNombre}</span>
                  </td>
                  <td className="border-b border-n-200 px-3 py-2 max-sm:flex max-sm:justify-between max-sm:gap-3 max-sm:border-0 max-sm:px-0 max-sm:py-0.5 text-n-700"><span className="hidden text-xs font-bold uppercase text-n-500 max-sm:inline">Método</span>{ETIQUETA_METODO[m.metodo] ?? m.metodo}</td>
                </tr>
              ))}
            </tbody>
          </TablaResponsiva>
        </div>
      )}
      {verMasHref && (
        <Enlace href={verMasHref} scroll={false} className="self-start text-sm" data-movimientos-ver-mas>
          Ver más movimientos
        </Enlace>
      )}
    </div>
  );
}
