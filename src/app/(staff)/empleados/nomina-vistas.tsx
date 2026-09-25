import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";
import { Textarea } from "@/components/ui/textarea";
import { METODOS_PAGO, PERIODICIDADES, moneda, plural } from "@/lib/empleados/textos";
import type { Desglose, PagoNomina } from "@/lib/empleados/tipos";
import { Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { revertirPago } from "./nomina-actions";

function Renglon({ etiqueta, detalle, valor, signo = "+" }: { etiqueta: string; detalle?: string; valor: number; signo?: "+" | "−" }) {
  if (!valor && signo === "−") return null;
  return (
    <tr>
      <td className="border-b border-n-200 px-3 py-2">
        <span className="font-semibold text-n-900">{etiqueta}</span>
        {detalle && <span className="block text-xs text-n-600">{detalle}</span>}
      </td>
      <td className={`border-b border-n-200 px-3 py-2 text-right tabular-nums ${signo === "−" ? "text-coral-oscuro" : "text-n-900"}`}>
        {signo === "−" ? "−" : ""}
        {moneda(valor)}
      </td>
    </tr>
  );
}

// El desglose de un periodo: de dónde sale cada peso.
export function VistaDesglose({ d }: { d: Desglose }) {
  const e = d.esquema;
  const dias = d.dias;
  return (
    <div className="flex flex-col gap-3">
      {d.avisos.length > 0 && (
        <ul className="rounded-md border border-ambar bg-ambar-suave px-4 py-2 text-sm text-ambar-oscuro">
          {d.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-n-600">
        {plural(dias.programados, "día")} le tocaba trabajar · {dias.trabajados} {dias.trabajados === 1 ? "trabajado" : "trabajados"} ·{" "}
        {plural(dias.faltas, "falta")} · {plural(dias.retardos, "retardo")}
        {dias.vacaciones ? ` · ${plural(dias.vacaciones, "día")} de vacaciones` : ""}
        {dias.otras_ausencias ? ` · ${plural(dias.otras_ausencias, "día")} de otras ausencias` : ""}
      </p>
      <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <tbody>
            {e?.sueldo_monto ? (
              <Renglon
                etiqueta={`Sueldo ${PERIODICIDADES[e.sueldo_periodicidad ?? ""]?.toLowerCase() ?? ""}`}
                detalle={`${moneda(e.sueldo_monto)} por periodo · ${moneda(d.tarifa_dia_sueldo)} por día`}
                valor={d.sueldo}
              />
            ) : null}
            {e?.sueldo_monto ? (
              <Renglon etiqueta="Faltas" detalle={`${dias.faltas} × ${moneda(d.tarifa_dia_sueldo)}`} valor={d.descuento_faltas} signo="−" />
            ) : null}
            {e?.pago_por_dia ? (
              <Renglon
                etiqueta="Pago por día"
                detalle={`${dias.trabajados + dias.vacaciones} días (trabajados${dias.vacaciones ? " + vacaciones" : ""}) × ${moneda(e.pago_por_dia)}`}
                valor={d.pago_dias}
              />
            ) : null}
            <Renglon etiqueta="Comisiones" detalle={`${plural(d.comisiones_detalle.length, "servicio")} de estética que atendió`} valor={d.comisiones} />
            <Renglon etiqueta="Propinas" detalle={`De ${plural(d.propinas_detalle.length, "cobro")} de clientes que atendió`} valor={d.propinas} />
            <Renglon etiqueta="Adelantos" detalle={`${plural(d.adelantos_detalle.length, "adelanto")} por descontar`} valor={d.adelantos} signo="−" />
            <tr>
              <td className="px-3 py-3 text-base font-bold text-n-900">A pagar</td>
              <td className="px-3 py-3 text-right text-base font-bold tabular-nums text-n-900">{moneda(d.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {d.comisiones_detalle.length > 0 && (
        <details className="rounded-md border border-n-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-n-800">Comisiones, servicio por servicio</summary>
          <ul className="mt-2 flex flex-col gap-1 text-n-700">
            {d.comisiones_detalle.map((c) => (
              <li key={c.cita_id}>
                {formatearFechaCalendario(c.fecha)} · {c.servicio} · {c.perro} · precio {moneda(c.precio)} → <strong>{moneda(c.comision)}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
      {d.propinas_detalle.length > 0 && (
        <details className="rounded-md border border-n-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-n-800">Propinas, cobro por cobro</summary>
          <p className="mt-2 text-xs text-n-500">Si en una cuenta atendieron varias personas, la propina se reparte según el precio de lo que atendió cada una.</p>
          <ul className="mt-1 flex flex-col gap-1 text-n-700">
            {d.propinas_detalle.map((p) => (
              <li key={p.cobro_id}>
                {formatearFechaCalendario(p.fecha)} · propina del cobro {moneda(p.propina_total)} → le toca <strong>{moneda(p.propina)}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
      {d.adelantos_detalle.length > 0 && (
        <details className="rounded-md border border-n-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-n-800">Adelantos que se descuentan</summary>
          <ul className="mt-2 flex flex-col gap-1 text-n-700">
            {d.adelantos_detalle.map((a) => (
              <li key={a.adelanto_id}>
                {formatearFechaCalendario(a.fecha)} · {moneda(a.monto)}
                {a.motivo && ` · ${a.motivo}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Pagos registrados. Un pago nunca se borra: se revierte con un movimiento
// inverso y el periodo se vuelve a pagar.
export function ListaPagos({ pagos, puedeRevertir, zona }: { pagos: PagoNomina[]; puedeRevertir: boolean; zona: string }) {
  if (pagos.length === 0) return <p className="text-sm text-n-600">Todavía no hay pagos registrados.</p>;
  const revertidos = new Set(pagos.filter((p) => p.reverso_de).map((p) => p.reverso_de));
  return (
    <ul className="flex flex-col gap-2">
      {pagos.map((p) => {
        const esReverso = p.tipo === "reverso";
        const revertido = revertidos.has(p.id);
        return (
          <li key={p.id} className={`flex flex-col gap-2 rounded-md border bg-white p-3 ${esReverso ? "border-coral" : "border-n-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-n-900">
                  {esReverso ? "Reverso de pago" : "Pago"} · {formatearFechaCalendario(p.periodo_desde)} al {formatearFechaCalendario(p.periodo_hasta)}
                </p>
                <p className="text-sm text-n-600">
                  {esReverso ? `Registrado el ${formatearFechaCalendario(p.fecha_pago)}` : `Pagado el ${formatearFechaCalendario(p.fecha_pago)} · ${METODOS_PAGO[p.metodo ?? ""] ?? p.metodo}`}
                  {p.notas && ` · ${p.notas}`}
                  {p.motivo && ` · motivo: ${p.motivo}`}
                </p>
                {revertido && <p className="text-xs font-semibold text-coral-oscuro">Revertido</p>}
              </div>
              <span className={`text-lg font-bold tabular-nums ${esReverso ? "text-coral-oscuro" : "text-n-900"}`}>{moneda(p.total)}</span>
            </div>
            {!esReverso && "dias" in p.desglose && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-morado">Ver desglose</summary>
                <div className="mt-2">
                  <VistaDesglose d={p.desglose} />
                  <p className="mt-2 text-xs text-n-500">Capturado el {formatearFecha(p.created_at, zona)}.</p>
                </div>
              </details>
            )}
            {puedeRevertir && !esReverso && !revertido && (
              <div>
                <Desplegable texto="Revertir este pago" variante="secundario">
                  <FormularioAccion accion={revertirPago.bind(null, p.id)} textoBoton="Revertir" variante="peligro">
                    <Textarea
                      label="¿Por qué se revierte?"
                      name="motivo"
                      rows={2}
                      required
                      ayuda="Se registra el mismo pago en negativo; los adelantos que descontó vuelven a quedar pendientes."
                    />
                  </FormularioAccion>
                </Desplegable>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
