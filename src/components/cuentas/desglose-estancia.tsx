import { pesosCuenta, salioAntes, textoLinea, type CuentaEstancia } from "@/lib/cuentas/cuenta-estancia";

/**
 * QA R50 (N136): el desglose de una estancia con las líneas de la base (cuenta_lineas_estancia): la estancia, sus cargos
 * y extras, las correcciones con su motivo y el total, que es la misma cifra que suman el encabezado de la reserva, Caja
 * y el calendario. Ninguna pantalla multiplica «precio × noches» por su cuenta.
 */
export function DesgloseEstancia({ cuenta, actualizando = false }: { cuenta: CuentaEstancia | null; actualizando?: boolean }) {
  if (!cuenta) {
    return (
      <p className="text-sm text-n-600" data-total-estancia="0">
        Total de la estancia: <span className="font-bold text-n-900">{pesosCuenta(0)}</span>
      </p>
    );
  }
  const reducida = salioAntes(cuenta);
  return (
    <div className="flex flex-col gap-1 text-sm" data-desglose-cuenta-estancia>
      <ul className="flex flex-col gap-1">
        {cuenta.lineas.map((l) => {
          const t = textoLinea(l, reducida);
          return (
            <li key={`${l.tipo}-${l.origenId}`} className="text-n-700" data-linea-estancia={l.tipo}>
              <span>
                {l.tipo === "estancia" ? `${t.etiqueta} = ${t.monto}` : `${t.etiqueta}: ${t.monto}`}
              </span>
              {t.detalle && <span className="block text-xs text-n-600">{t.detalle}</span>}
            </li>
          );
        })}
      </ul>
      <p className="font-bold text-n-900" data-total-estancia={cuenta.total.toFixed(2)}>
        Total de la estancia: {pesosCuenta(cuenta.total)}
        {actualizando && <span className="ml-2 text-xs font-normal text-n-500">Actualizando…</span>}
      </p>
    </div>
  );
}
