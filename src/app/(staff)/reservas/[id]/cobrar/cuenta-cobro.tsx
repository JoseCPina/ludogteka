"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { abrirTurno } from "../../turno-actions";
import { registrarCobro, registrarDevolucion, type MetodoPago } from "../../cobro-actions";
import { consumirBono, type ItemTipoBono } from "../../bono-actions";
import { aplicarDescuento, cancelarDescuento, type TipoDescuento } from "../../descuento-actions";

export type LineaCuenta = {
  tipo: string;
  origenId: string;
  servicioId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
  cantidadCubiertaPorBono: number;
};

export type Totales = {
  totalCuenta: number;
  totalCobrado: number;
  totalPropinas: number;
  totalDevuelto: number;
  totalBono: number;
  totalDescuento: number;
  saldo: number;
};

export type BonoDisponible = {
  id: string;
  servicioIncluidoId: string | null;
  servicioNombre: string;
  cantidadDisponible: number;
};

export type MotivoDescuento = { id: string; etiqueta: string };

export type DescuentoHistorial = {
  id: string;
  etiqueta: string;
  tipo: string;
  valor: number;
  montoAplicado: number;
  motivoAdicional: string | null;
  autorizadoPorNombre: string | null;
  cancelado: boolean;
  motivoCancelacion: string | null;
  creadoEn: string;
  creadoPorNombre: string;
};

export type CobroHistorial = {
  id: string;
  notas: string | null;
  creadoEn: string;
  creadoPorNombre: string;
  metodos: { metodo: string; monto: number; propina: number }[];
};

export type DevolucionHistorial = {
  id: string;
  cobroId: string;
  motivo: string;
  creadoEn: string;
  autorizadoPorNombre: string;
  metodos: { metodo: string; monto: number }[];
};

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  terminal: "Terminal",
  transferencia: "Transferencia",
};

const ETIQUETA_TIPO: Record<string, string> = {
  estancia: "Estancia",
  cargo: "Cargo",
  estetica: "Estética",
};

function dinero(v: number): string {
  return `$${v.toFixed(2)}`;
}

type FilaMetodo = { metodo: MetodoPago; monto: string; propina: string };

function NuevaFilaMetodo(): FilaMetodo {
  return { metodo: "efectivo", monto: "", propina: "0" };
}

export function CuentaCobro({
  reservaId,
  lineas,
  totales,
  turnoAbierto,
  cobros: cobrosIniciales,
  devoluciones,
  bonosDisponibles,
  catalogoDescuentos,
  descuentos,
  topeRecepcion,
  esAdmin,
}: {
  reservaId: string;
  lineas: LineaCuenta[];
  totales: Totales;
  turnoAbierto: boolean;
  cobros: CobroHistorial[];
  devoluciones: DevolucionHistorial[];
  bonosDisponibles: BonoDisponible[];
  catalogoDescuentos: MotivoDescuento[];
  descuentos: DescuentoHistorial[];
  topeRecepcion: number;
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const [aplicandoBonoIdx, setAplicandoBonoIdx] = useState<number | null>(null);
  const [bonoElegidoId, setBonoElegidoId] = useState("");
  const [cantidadBono, setCantidadBono] = useState("1");
  const [aplicandoBono, setAplicandoBono] = useState(false);

  function restantePorCubrir(l: LineaCuenta) {
    return l.cantidad - l.cantidadCubiertaPorBono;
  }

  function bonosParaLinea(l: LineaCuenta) {
    if (restantePorCubrir(l) <= 0) return [];
    return bonosDisponibles.filter((b) => b.servicioIncluidoId === l.servicioId && b.cantidadDisponible > 0);
  }

  function abrirAplicarBono(i: number) {
    const opciones = bonosParaLinea(lineas[i]);
    setAplicandoBonoIdx(i);
    setBonoElegidoId(opciones[0]?.id ?? "");
    setCantidadBono(String(restantePorCubrir(lineas[i])));
  }

  async function confirmarAplicarBono() {
    if (aplicandoBonoIdx === null) return;
    const linea = lineas[aplicandoBonoIdx];
    const cantidad = Number(cantidadBono);
    if (!bonoElegidoId) {
      setError("Elige un bono.");
      return;
    }
    if (!Number.isFinite(cantidad) || cantidad < 1) {
      setError("La cantidad debe ser al menos 1.");
      return;
    }
    if (cantidad > restantePorCubrir(linea)) {
      setError(`Esa línea solo tiene ${restantePorCubrir(linea)} unidad(es) sin cubrir.`);
      return;
    }
    setAplicandoBono(true);
    setError(null);
    const res = await consumirBono(
      reservaId,
      bonoElegidoId,
      linea.tipo as ItemTipoBono,
      linea.origenId,
      cantidad
    );
    setAplicandoBono(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAplicandoBonoIdx(null);
    router.refresh();
  }

  const [aplicandoDescuento, setAplicandoDescuento] = useState(false);
  const [catalogoDescuentoId, setCatalogoDescuentoId] = useState(catalogoDescuentos[0]?.id ?? "");
  const [tipoDescuento, setTipoDescuento] = useState<TipoDescuento>("porcentaje");
  const [valorDescuento, setValorDescuento] = useState("");
  const [motivoAdicionalDescuento, setMotivoAdicionalDescuento] = useState("");
  const [guardandoDescuento, setGuardandoDescuento] = useState(false);

  const totalDescontadoActivo = descuentos
    .filter((d) => !d.cancelado)
    .reduce((sum, d) => sum + d.montoAplicado, 0);
  const saldoDisponibleParaDescuento = totales.totalCuenta - totalDescontadoActivo;
  const valorNumDescuento = Number(valorDescuento) || 0;
  const montoEstimadoDescuento =
    tipoDescuento === "porcentaje" ? round2((totales.totalCuenta * valorNumDescuento) / 100) : valorNumDescuento;
  const pasaTope = montoEstimadoDescuento > topeRecepcion;

  function round2(v: number) {
    return Math.round(v * 100) / 100;
  }

  async function enviarDescuento() {
    if (valorNumDescuento <= 0) {
      setError("El valor del descuento debe ser mayor a cero.");
      return;
    }
    if (pasaTope && !esAdmin) {
      setError(
        `Este descuento ($${montoEstimadoDescuento.toFixed(2)}) pasa el tope de recepción ($${topeRecepcion.toFixed(2)}). Pide a un admin que lo aplique.`
      );
      return;
    }
    if (pasaTope && !motivoAdicionalDescuento.trim()) {
      setError("Un descuento arriba del tope necesita un motivo por escrito.");
      return;
    }
    setGuardandoDescuento(true);
    setError(null);
    const res = await aplicarDescuento(
      reservaId,
      catalogoDescuentoId,
      tipoDescuento,
      valorNumDescuento,
      motivoAdicionalDescuento
    );
    setGuardandoDescuento(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAplicandoDescuento(false);
    setValorDescuento("");
    setMotivoAdicionalDescuento("");
    router.refresh();
  }

  const [cancelandoDescuentoId, setCancelandoDescuentoId] = useState<string | null>(null);
  const [motivoCancelarDescuento, setMotivoCancelarDescuento] = useState("");
  const [cancelandoDescuento, setCancelandoDescuento] = useState(false);

  async function confirmarCancelarDescuento() {
    if (!cancelandoDescuentoId) return;
    if (!motivoCancelarDescuento.trim()) {
      setError("Escribe el motivo de la cancelación.");
      return;
    }
    setCancelandoDescuento(true);
    setError(null);
    const res = await cancelarDescuento(reservaId, cancelandoDescuentoId, motivoCancelarDescuento);
    setCancelandoDescuento(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCancelandoDescuentoId(null);
    setMotivoCancelarDescuento("");
    router.refresh();
  }

  // Bloque D trae la pantalla completa de turno — aquí solo lo mínimo
  // para no bloquear el cobro si nadie lo abrió todavía hoy.
  const [abriendoTurno, setAbriendoTurno] = useState(false);
  const [fondoInicial, setFondoInicial] = useState("");
  const [notasApertura, setNotasApertura] = useState("");
  const [cargandoTurno, setCargandoTurno] = useState(false);

  const [notasCobro, setNotasCobro] = useState("");
  const [metodos, setMetodos] = useState<FilaMetodo[]>([NuevaFilaMetodo()]);
  const [cobrando, setCobrando] = useState(false);

  const [devolviendoCobroId, setDevolviendoCobroId] = useState<string | null>(null);
  const [motivoDevolucion, setMotivoDevolucion] = useState("");
  const [metodosDevolucion, setMetodosDevolucion] = useState<{ metodo: MetodoPago; monto: string }[]>([
    { metodo: "efectivo", monto: "" },
  ]);
  const [devolviendo, setDevolviendo] = useState(false);

  const totalMetodos = metodos.reduce((sum, m) => sum + (Number(m.monto) || 0), 0);

  async function accionAbrirTurno() {
    const fondo = Number(fondoInicial);
    if (!Number.isFinite(fondo) || fondo < 0) {
      setError("El fondo inicial debe ser un número mayor o igual a cero.");
      return;
    }
    setCargandoTurno(true);
    setError(null);
    const res = await abrirTurno(fondo, notasApertura);
    setCargandoTurno(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAbriendoTurno(false);
    router.refresh();
  }

  function actualizarMetodo(i: number, cambios: Partial<FilaMetodo>) {
    setMetodos((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...cambios } : m)));
  }

  async function enviarCobro() {
    const payload = metodos.map((m) => ({
      metodo: m.metodo,
      monto: Number(m.monto) || 0,
      propina: Number(m.propina) || 0,
    }));
    if (payload.some((m) => m.monto <= 0)) {
      setError("Cada método debe tener un monto mayor a cero.");
      return;
    }
    setCobrando(true);
    setError(null);
    const res = await registrarCobro(reservaId, notasCobro, payload);
    setCobrando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setNotasCobro("");
    setMetodos([NuevaFilaMetodo()]);
    router.refresh();
  }

  async function enviarDevolucion() {
    if (!devolviendoCobroId) return;
    const payload = metodosDevolucion.map((m) => ({ metodo: m.metodo, monto: Number(m.monto) || 0 }));
    if (payload.some((m) => m.monto <= 0)) {
      setError("Cada método a devolver debe tener un monto mayor a cero.");
      return;
    }
    if (!motivoDevolucion.trim()) {
      setError("Escribe el motivo de la devolución.");
      return;
    }
    setDevolviendo(true);
    setError(null);
    const res = await registrarDevolucion(reservaId, devolviendoCobroId, motivoDevolucion, payload);
    setDevolviendo(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDevolviendoCobroId(null);
    setMotivoDevolucion("");
    setMetodosDevolucion([{ metodo: "efectivo", monto: "" }]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-n-200 bg-n-100 px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Concepto
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                Cantidad
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                Precio unit.
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                Total
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                Bono
              </th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-n-500">
                  Esta reserva no tiene nada cobrable.
                </td>
              </tr>
            ) : (
              lineas.map((l, i) => {
                const opcionesBono = l.tipo === "bono" ? [] : bonosParaLinea(l);
                return (
                  <tr key={i}>
                    <td className="border-b border-n-200 px-4 py-2.5 text-n-900">
                      <span className="mr-2 rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
                        {ETIQUETA_TIPO[l.tipo] ?? l.tipo}
                      </span>
                      {l.descripcion}
                    </td>
                    <td className="border-b border-n-200 px-4 py-2.5 text-right tabular-nums text-n-700">
                      {l.cantidad}
                    </td>
                    <td className="border-b border-n-200 px-4 py-2.5 text-right tabular-nums text-n-700">
                      {dinero(l.precioUnitario)}
                    </td>
                    <td className="border-b border-n-200 px-4 py-2.5 text-right tabular-nums font-semibold text-n-900">
                      {dinero(l.total)}
                    </td>
                    <td className="border-b border-n-200 px-4 py-2.5 text-right">
                      {l.cantidadCubiertaPorBono > 0 && (
                        <span className="mr-2 text-xs font-semibold text-turquesa-oscuro">
                          {l.cantidadCubiertaPorBono}/{l.cantidad} con bono
                        </span>
                      )}
                      {opcionesBono.length > 0 && (
                        <Button type="button" variante="secundario" onClick={() => abrirAplicarBono(i)}>
                          Pagar con bono
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {aplicandoBonoIdx !== null && (
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-turquesa bg-turquesa-suave p-4">
          <p className="font-semibold text-turquesa-oscuro">
            Pagar &quot;{lineas[aplicandoBonoIdx].descripcion}&quot; con bono
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <Select label="Bono" value={bonoElegidoId} onChange={(e) => setBonoElegidoId(e.target.value)}>
                {bonosParaLinea(lineas[aplicandoBonoIdx]).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.servicioNombre} ({b.cantidadDisponible} disponibles)
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-28">
              <Field
                label="Cantidad"
                type="number"
                min="1"
                max={restantePorCubrir(lineas[aplicandoBonoIdx])}
                value={cantidadBono}
                onChange={(e) => setCantidadBono(e.target.value)}
                ayuda={`Máx. ${restantePorCubrir(lineas[aplicandoBonoIdx])}`}
              />
            </div>
            <Button type="button" disabled={aplicandoBono} onClick={confirmarAplicarBono}>
              {aplicandoBono ? "Aplicando…" : "Confirmar"}
            </Button>
            <Button type="button" variante="secundario" onClick={() => setAplicandoBonoIdx(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-6 rounded-lg border border-n-200 bg-n-50 p-4 text-sm">
        <span className="text-n-600">
          Total cuenta: <span className="font-semibold text-n-900">{dinero(totales.totalCuenta)}</span>
        </span>
        <span className="text-n-600">
          Cobrado: <span className="font-semibold text-n-900">{dinero(totales.totalCobrado)}</span>
        </span>
        <span className="text-n-600">
          Devuelto: <span className="font-semibold text-n-900">{dinero(totales.totalDevuelto)}</span>
        </span>
        <span className="text-n-600">
          Cubierto con bono: <span className="font-semibold text-n-900">{dinero(totales.totalBono)}</span>
        </span>
        <span className="text-n-600">
          Descuento: <span className="font-semibold text-n-900">{dinero(totales.totalDescuento)}</span>
        </span>
        <span className="text-n-600">
          Propinas: <span className="font-semibold text-n-900">{dinero(totales.totalPropinas)}</span>
        </span>
        <span className={`font-bold ${totales.saldo > 0 ? "text-naranja-oscuro" : "text-verde-oscuro"}`}>
          Saldo: {dinero(totales.saldo)}
          {totales.saldo < 0 ? " (a favor del cliente)" : ""}
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-n-900">Descuentos</p>
          {!aplicandoDescuento && saldoDisponibleParaDescuento > 0 && catalogoDescuentos.length > 0 && (
            <Button type="button" variante="secundario" onClick={() => setAplicandoDescuento(true)}>
              Aplicar descuento
            </Button>
          )}
        </div>

        {aplicandoDescuento && (
          <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label="Motivo"
                value={catalogoDescuentoId}
                onChange={(e) => setCatalogoDescuentoId(e.target.value)}
              >
                {catalogoDescuentos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.etiqueta}
                  </option>
                ))}
              </Select>
              <Select
                label="Tipo"
                value={tipoDescuento}
                onChange={(e) => setTipoDescuento(e.target.value as TipoDescuento)}
              >
                <option value="porcentaje">Porcentaje</option>
                <option value="monto_fijo">Monto fijo</option>
              </Select>
              <Field
                label={tipoDescuento === "porcentaje" ? "Porcentaje" : "Monto"}
                type="number"
                min="0"
                step="0.01"
                value={valorDescuento}
                onChange={(e) => setValorDescuento(e.target.value)}
              />
            </div>

            {valorNumDescuento > 0 && (
              <p className={`text-sm ${pasaTope ? "font-semibold text-naranja-oscuro" : "text-n-600"}`}>
                Equivale a {dinero(montoEstimadoDescuento)}
                {pasaTope
                  ? ` — pasa el tope de recepción (${dinero(topeRecepcion)}). ${esAdmin ? "Necesita motivo." : "Solo un admin puede aplicarlo."}`
                  : ""}
              </p>
            )}

            {pasaTope && (
              <Field
                label="Motivo (obligatorio arriba del tope)"
                value={motivoAdicionalDescuento}
                onChange={(e) => setMotivoAdicionalDescuento(e.target.value)}
                placeholder="ej. Autorizado por incidente con el perro"
              />
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                disabled={guardandoDescuento || (pasaTope && !esAdmin)}
                onClick={enviarDescuento}
              >
                {guardandoDescuento ? "Aplicando…" : "Confirmar descuento"}
              </Button>
              <Button type="button" variante="secundario" onClick={() => setAplicandoDescuento(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {descuentos.length === 0 ? (
          <p className="text-sm text-n-500">Ningún descuento aplicado todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {descuentos.map((d) => (
              <li
                key={d.id}
                className={`rounded-md border px-3 py-2 ${d.cancelado ? "border-n-200 bg-n-50" : "border-n-200 bg-white"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={d.cancelado ? "text-n-500 line-through" : "font-semibold text-n-900"}>
                    {d.etiqueta} — {d.tipo === "porcentaje" ? `${d.valor}%` : dinero(d.valor)}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={`tabular-nums font-semibold ${d.cancelado ? "text-n-500 line-through" : "text-n-900"}`}>
                      {dinero(d.montoAplicado)}
                    </span>
                    {!d.cancelado && cancelandoDescuentoId !== d.id && (
                      <Button type="button" variante="peligro" onClick={() => setCancelandoDescuentoId(d.id)}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-n-500">
                  {d.creadoPorNombre}
                  {d.autorizadoPorNombre ? ` · autorizó ${d.autorizadoPorNombre}` : ""}
                  {d.motivoAdicional ? ` · ${d.motivoAdicional}` : ""}
                </p>
                {d.cancelado && d.motivoCancelacion && (
                  <p className="mt-1 text-xs text-n-500">Cancelado: {d.motivoCancelacion}</p>
                )}
                {cancelandoDescuentoId === d.id && (
                  <div className="mt-2 flex flex-col gap-2 border-t border-n-200 pt-2">
                    <Field
                      label="Motivo de la cancelación"
                      value={motivoCancelarDescuento}
                      onChange={(e) => setMotivoCancelarDescuento(e.target.value)}
                      placeholder="ej. Se capturó por error"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variante="peligro"
                        disabled={cancelandoDescuento}
                        onClick={confirmarCancelarDescuento}
                      >
                        {cancelandoDescuento ? "Cancelando…" : "Confirmar cancelación"}
                      </Button>
                      <Button
                        type="button"
                        variante="secundario"
                        onClick={() => {
                          setCancelandoDescuentoId(null);
                          setMotivoCancelarDescuento("");
                        }}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!turnoAbierto ? (
        <div className="rounded-lg border-[1.5px] border-amarillo bg-amarillo-suave p-4">
          <p className="font-bold text-amarillo-oscuro">No hay turno de caja abierto</p>
          <p className="mt-1 text-sm text-amarillo-oscuro">
            Ábrelo con el fondo inicial para poder registrar cobros.
          </p>
          {!abriendoTurno ? (
            <Button type="button" className="mt-3" onClick={() => setAbriendoTurno(true)}>
              Abrir turno
            </Button>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field
                label="Fondo inicial"
                type="number"
                min="0"
                step="0.01"
                value={fondoInicial}
                onChange={(e) => setFondoInicial(e.target.value)}
                autoFocus
              />
              <Field
                label="Notas (opcional)"
                value={notasApertura}
                onChange={(e) => setNotasApertura(e.target.value)}
              />
              <Button type="button" disabled={cargandoTurno} onClick={accionAbrirTurno}>
                {cargandoTurno ? "Abriendo…" : "Confirmar apertura"}
              </Button>
              <Button type="button" variante="secundario" onClick={() => setAbriendoTurno(false)}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
          <p className="font-semibold text-n-900">Registrar cobro</p>
          {metodos.map((m, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Select
                  label="Método"
                  value={m.metodo}
                  onChange={(e) => actualizarMetodo(i, { metodo: e.target.value as MetodoPago })}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="terminal">Terminal</option>
                  <option value="transferencia">Transferencia</option>
                </Select>
              </div>
              <div className="w-32">
                <Field
                  label="Monto"
                  type="number"
                  min="0"
                  step="0.01"
                  value={m.monto}
                  onChange={(e) => actualizarMetodo(i, { monto: e.target.value })}
                />
              </div>
              <div className="w-32">
                <Field
                  label="Propina"
                  type="number"
                  min="0"
                  step="0.01"
                  value={m.propina}
                  onChange={(e) => actualizarMetodo(i, { propina: e.target.value })}
                />
              </div>
              {metodos.length > 1 && (
                <Button
                  type="button"
                  variante="secundario"
                  onClick={() => setMetodos((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  Quitar
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variante="secundario"
            className="self-start"
            onClick={() => setMetodos((prev) => [...prev, NuevaFilaMetodo()])}
          >
            + Repartir en otro método
          </Button>

          <Textarea label="Notas (opcional)" value={notasCobro} onChange={(e) => setNotasCobro(e.target.value)} />

          <p className="text-sm text-n-600">
            Total de este cobro: <span className="font-semibold text-n-900">{dinero(totalMetodos)}</span>
          </p>

          <Button type="button" disabled={cobrando} onClick={enviarCobro} className="self-start">
            {cobrando ? "Cobrando…" : "Registrar cobro"}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Cobros de esta reserva</h2>
        {cobrosIniciales.length === 0 ? (
          <p className="text-sm text-n-500">Todavía no hay ningún cobro.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {cobrosIniciales.map((c) => {
              const devolucionesDeEste = devoluciones.filter((d) => d.cobroId === c.id);
              const totalCobro = c.metodos.reduce((sum, m) => sum + m.monto, 0);
              const totalPropina = c.metodos.reduce((sum, m) => sum + m.propina, 0);
              const totalDevuelto = devolucionesDeEste.reduce(
                (sum, d) => sum + d.metodos.reduce((s2, m) => s2 + m.monto, 0),
                0
              );
              return (
                <li key={c.id} className="rounded-lg border border-n-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-n-900">
                      {dinero(totalCobro)}
                      {totalPropina > 0 ? ` + ${dinero(totalPropina)} propina` : ""}
                    </p>
                    <p className="text-xs text-n-500">
                      {formatearFecha(c.creadoEn)} · {c.creadoPorNombre}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-n-600">
                    {c.metodos
                      .map(
                        (m) =>
                          `${ETIQUETA_METODO[m.metodo] ?? m.metodo}: ${dinero(m.monto)}${
                            m.propina > 0 ? ` (+${dinero(m.propina)} propina)` : ""
                          }`
                      )
                      .join(" · ")}
                  </p>
                  {c.notas && <p className="mt-1 text-sm text-n-500">{c.notas}</p>}

                  {devolucionesDeEste.length > 0 && (
                    <div className="mt-2 border-t border-n-200 pt-2">
                      {devolucionesDeEste.map((d) => (
                        <p key={d.id} className="text-sm text-naranja-oscuro">
                          Devuelto {dinero(d.metodos.reduce((s, m) => s + m.monto, 0))} — {d.motivo} (autorizó{" "}
                          {d.autorizadoPorNombre}, {formatearFecha(d.creadoEn)})
                        </p>
                      ))}
                    </div>
                  )}

                  {esAdmin && totalDevuelto < totalCobro && (
                    <div className="mt-2 border-t border-n-200 pt-2">
                      {devolviendoCobroId !== c.id ? (
                        <Button
                          type="button"
                          variante="secundario"
                          onClick={() => {
                            setDevolviendoCobroId(c.id);
                            setMotivoDevolucion("");
                            setMetodosDevolucion([{ metodo: "efectivo", monto: "" }]);
                          }}
                        >
                          Registrar devolución
                        </Button>
                      ) : (
                        <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3">
                          {metodosDevolucion.map((m, i) => (
                            <div key={i} className="flex flex-wrap items-end gap-3">
                              <div className="w-40">
                                <Select
                                  label="Método"
                                  value={m.metodo}
                                  onChange={(e) =>
                                    setMetodosDevolucion((prev) =>
                                      prev.map((x, idx) =>
                                        idx === i ? { ...x, metodo: e.target.value as MetodoPago } : x
                                      )
                                    )
                                  }
                                >
                                  <option value="efectivo">Efectivo</option>
                                  <option value="terminal">Terminal</option>
                                  <option value="transferencia">Transferencia</option>
                                </Select>
                              </div>
                              <div className="w-32">
                                <Field
                                  label="Monto"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={m.monto}
                                  onChange={(e) =>
                                    setMetodosDevolucion((prev) =>
                                      prev.map((x, idx) => (idx === i ? { ...x, monto: e.target.value } : x))
                                    )
                                  }
                                />
                              </div>
                            </div>
                          ))}
                          <Field
                            label="Motivo"
                            value={motivoDevolucion}
                            onChange={(e) => setMotivoDevolucion(e.target.value)}
                            placeholder="ej. Se canceló una noche ya cobrada"
                          />
                          <div className="flex gap-2">
                            <Button type="button" variante="peligro" disabled={devolviendo} onClick={enviarDevolucion}>
                              {devolviendo ? "Guardando…" : "Confirmar devolución"}
                            </Button>
                            <Button type="button" variante="secundario" onClick={() => setDevolviendoCobroId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
