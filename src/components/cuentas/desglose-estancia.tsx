import { pesosCuenta, salioAntes, textoLinea, type CuentaEstancia } from "@/lib/cuentas/cuenta-estancia";

/**
 * QA R50 (N136): el desglose de una estancia con las líneas de la base (cuenta_lineas_estancia): la estancia, sus cargos
 * y extras, las correcciones con su motivo y el total, que es la misma cifra que suman el encabezado de la reserva, Caja
 * y el calendario. Ninguna pantalla multiplica «precio × noches» por su cuenta.
 */
export function DesgloseEstancia({
  cuenta,
  actualizando = false,
  partes = "todo",
}: {
  cuenta: CuentaEstancia | null;
  actualizando?: boolean;
  /**
   * QA R54 (N144): la lista de cargos de una estancia (`CargosSeccion`) va entre la base y el total: «base» pinta solo la
   * línea de la estancia y sus correcciones; «total», solo el total. «todo», las líneas y el total.
   */
  partes?: "todo" | "base" | "total";
}) {
  if (partes === "base" && !cuenta) return null;
  if (!cuenta || partes === "total") {
    if (cuenta && partes === "total") {
      return (
        <p className="font-bold text-n-900" data-total-estancia={cuenta.total.toFixed(2)}>
          Total de la estancia: {pesosCuenta(cuenta.total)}
          {actualizando && <span className="ml-2 text-xs font-normal text-n-500">Actualizando…</span>}
        </p>
      );
    }
    return (
      <p className="text-sm text-n-600" data-total-estancia="0">
        Total de la estancia: <span className="font-bold text-n-900">{pesosCuenta(0)}</span>
      </p>
    );
  }
  const reducida = salioAntes(cuenta);
  const lineas = partes === "base" ? cuenta.lineas.filter((l) => l.tipo === "estancia" || l.tipo === "ajuste") : cuenta.lineas;
  return (
    <div className="flex flex-col gap-1 text-sm" data-desglose-cuenta-estancia>
      <ul className="flex flex-col gap-1">
        {lineas.map((l) => {
          const t = textoLinea(l, reducida);
          return (
            <li key={`${l.tipo}-${l.origenId}`} className="text-n-700" data-linea-estancia={l.tipo}>
              <span>
                {/* QA S41 (N144): la línea de la estancia misma se rotula como su base (no es un cargo). */}
                {l.tipo === "estancia" ? `Base de la estancia · ${t.etiqueta} = ${t.monto}` : `${t.etiqueta}: ${t.monto}`}
              </span>
              {t.detalle && <span className="block text-xs text-n-600">{t.detalle}</span>}
            </li>
          );
        })}
      </ul>
      {partes === "todo" && (
        <p className="font-bold text-n-900" data-total-estancia={cuenta.total.toFixed(2)}>
          Total de la estancia: {pesosCuenta(cuenta.total)}
          {actualizando && <span className="ml-2 text-xs font-normal text-n-500">Actualizando…</span>}
        </p>
      )}
    </div>
  );
}
