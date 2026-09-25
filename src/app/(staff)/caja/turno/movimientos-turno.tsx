import Link from "next/link";
import { formatearFecha } from "@/lib/formato";

export type MovimientoTurno = {
  id: string;
  tipo: string;
  fecha: string;
  reservaId: string | null;
  clienteNombre: string | null;
  descripcion: string;
  metodo: string;
  monto: number;
  propina: number;
  origen: string;
  hechoPorNombre: string;
};

export type ResumenMetodo = { metodo: string; origen: string; cobrado: number; propinas: number; devuelto: number };

const ETIQUETA_TIPO: Record<string, string> = {
  cobro: "Cobro",
  venta_bono: "Venta de bono",
  devolucion: "Devolución",
  retiro: "Retiro",
};
const ETIQUETA_METODO: Record<string, string> = { efectivo: "Efectivo", terminal: "Terminal", transferencia: "Transferencia" };
const ETIQUETA_ORIGEN: Record<string, string> = {
  manual: "a mano",
  mercadopago_point: "terminal por la app",
  mercadopago_link: "link de pago",
};

function dinero(v: number): string {
  return `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`;
}

/**
 * Lo que movió dinero en el turno, y el acumulado por método. El
 * acumulado separa lo que entró por la app (terminal integrada, links)
 * de lo capturado a mano: al cortar, lo de la app se coteja contra
 * Mercado Pago y lo manual contra el reporte de la terminal.
 */
export function MovimientosTurno({
  movimientos,
  resumen,
  zona,
}: {
  movimientos: MovimientoTurno[];
  resumen: ResumenMetodo[];
  zona: string;
}) {
  const porMetodo = ["efectivo", "terminal", "transferencia"].map((m) => {
    const filas = resumen.filter((r) => r.metodo === m);
    const manual = filas.find((r) => r.origen === "manual");
    const app = filas.filter((r) => r.origen !== "manual");
    const cobrado = filas.reduce((s, r) => s + r.cobrado, 0);
    const propinas = filas.reduce((s, r) => s + r.propinas, 0);
    const devuelto = filas.reduce((s, r) => s + r.devuelto, 0);
    return { metodo: m, cobrado, propinas, devuelto, neto: cobrado + propinas - devuelto, manual: manual?.cobrado ?? 0, app: app.reduce((s, r) => s + r.cobrado, 0) };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {porMetodo.map((m) => (
          <div key={m.metodo} className="rounded-lg border border-n-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-n-500">{ETIQUETA_METODO[m.metodo]}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-n-900">{dinero(m.neto)}</p>
            <p className="text-xs text-n-500">
              cobrado {dinero(m.cobrado)}
              {m.propinas > 0 ? ` · propinas ${dinero(m.propinas)}` : ""}
              {m.devuelto > 0 ? ` · devuelto ${dinero(m.devuelto)}` : ""}
            </p>
            {m.metodo !== "efectivo" && (
              <p className="mt-1 text-xs text-n-600">
                por la app {dinero(m.app)} · a mano {dinero(m.manual)}
              </p>
            )}
          </div>
        ))}
      </div>

      {movimientos.length === 0 ? (
        <p className="text-sm text-n-500">Todavía no hay movimientos en este turno.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                {["Hora", "Movimiento", "Cliente / motivo", "Método", "Monto"].map((h) => (
                  <th key={h} className={`border-b border-n-200 bg-n-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-n-600 ${h === "Monto" ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={`${m.tipo}-${m.id}`}>
                  <td className="border-b border-n-200 px-3 py-2 tabular-nums text-n-600">{formatearFecha(m.fecha, zona)}</td>
                  <td className="border-b border-n-200 px-3 py-2 text-n-900">
                    {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
                    {m.origen !== "manual" && <span className="ml-2 rounded-full bg-azul-suave px-2 py-0.5 text-xs font-semibold text-azul">{ETIQUETA_ORIGEN[m.origen]}</span>}
                  </td>
                  <td className="border-b border-n-200 px-3 py-2 text-n-700">
                    {m.reservaId ? (
                      <Link href={`/caja/cobrar/${m.reservaId}`} className="font-semibold text-azul hover:underline">
                        {m.clienteNombre ?? "Cuenta"}
                      </Link>
                    ) : (
                      m.clienteNombre
                    )}
                    {m.descripcion ? <span className="block text-xs text-n-500">{m.descripcion}</span> : null}
                    <span className="block text-xs text-n-500">{m.hechoPorNombre}</span>
                  </td>
                  <td className="border-b border-n-200 px-3 py-2 text-n-700">{ETIQUETA_METODO[m.metodo] ?? m.metodo}</td>
                  <td className={`border-b border-n-200 px-3 py-2 text-right tabular-nums font-semibold ${m.monto < 0 ? "text-naranja-oscuro" : "text-n-900"}`}>
                    {dinero(m.monto)}
                    {m.propina > 0 ? <span className="block text-xs font-normal text-n-500">+ propina {dinero(m.propina)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
