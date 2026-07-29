"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { sumarDiasFecha } from "@/lib/formato";
import { formatearTelefono } from "@/lib/telefono";
import { formatearDiasSemana } from "../series/dias-semana";
import {
  crearReserva,
  agregarEstanciaAReserva,
  type LineaReserva,
  type ResultadoLinea,
} from "../reserva-actions";

type Cliente = { id: string; nombre: string; telefono: string };
type Perro = { id: string; cliente_id: string; nombre: string };
type Servicio = { id: string; nombre: string; categoria: string };
type SerieActiva = { perroId: string; diasSemana: number[]; servicioNombre: string };

type Linea = {
  perroId: string;
  perroNombre: string;
  servicioId: string;
  fechaEntrada: string;
  fechaSalida: string;
  bloqueoSanitarioSuperado: boolean;
  motivoExcepcionSanitaria: string;
};

function lineaAPayload(linea: Linea, servicios: Servicio[]): LineaReserva {
  const esGuarderia = servicios.find((s) => s.id === linea.servicioId)?.categoria === "guarderia";
  return {
    perroId: linea.perroId,
    servicioId: linea.servicioId,
    fechaEntrada: linea.fechaEntrada,
    fechaSalida: esGuarderia ? sumarDiasFecha(linea.fechaEntrada, 1) : linea.fechaSalida,
    bloqueoSanitarioSuperado: linea.bloqueoSanitarioSuperado,
    motivoExcepcionSanitaria: linea.motivoExcepcionSanitaria,
  };
}

export function NuevaReservaForm({
  clientes,
  perros,
  servicios,
  seriesActivas,
  esAdmin,
  hoy,
}: {
  clientes: Cliente[];
  perros: Perro[];
  servicios: Servicio[];
  seriesActivas: SerieActiva[];
  esAdmin: boolean;
  hoy: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [resultados, setResultados] = useState<ResultadoLinea[] | null>(null);
  const [reservaId, setReservaId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [reintentando, setReintentando] = useState<Record<string, boolean>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    const qDigitos = q.replace(/\D/g, "");
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || (qDigitos && c.telefono.includes(qDigitos))
    );
  }, [clientes, busqueda]);

  const clienteElegido = clientes.find((c) => c.id === clienteId) ?? null;
  const perrosDelCliente = useMemo(
    () => perros.filter((p) => p.cliente_id === clienteId),
    [perros, clienteId]
  );

  function elegirCliente(id: string) {
    setClienteId(id);
    setLineas([]);
    setResultados(null);
    setReservaId(null);
    setErrorGeneral(null);
  }

  function cambiarCliente() {
    setClienteId(null);
    setBusqueda("");
    setLineas([]);
    setResultados(null);
    setReservaId(null);
    setErrorGeneral(null);
  }

  function alternarPerro(perro: Perro) {
    setLineas((prev) => {
      const existe = prev.some((l) => l.perroId === perro.id);
      if (existe) return prev.filter((l) => l.perroId !== perro.id);
      const primerServicio = servicios[0];
      return [
        ...prev,
        {
          perroId: perro.id,
          perroNombre: perro.nombre,
          servicioId: primerServicio?.id ?? "",
          fechaEntrada: hoy,
          fechaSalida: sumarDiasFecha(hoy, 1),
          bloqueoSanitarioSuperado: false,
          motivoExcepcionSanitaria: "",
        },
      ];
    });
  }

  function actualizarLinea(perroId: string, cambios: Partial<Linea>) {
    setLineas((prev) => prev.map((l) => (l.perroId === perroId ? { ...l, ...cambios } : l)));
  }

  async function enviar() {
    if (!clienteId) return;
    setEnviando(true);
    setErrorGeneral(null);
    const payload = lineas.map((l) => lineaAPayload(l, servicios));
    const res = await crearReserva(clienteId, notas, payload);
    setEnviando(false);
    if (res.error) {
      setErrorGeneral(res.error);
      return;
    }
    setResultados(res.resultados ?? []);
    setReservaId(res.reservaId ?? null);
  }

  async function reintentar(perroId: string) {
    if (!reservaId) return;
    const linea = lineas.find((l) => l.perroId === perroId);
    if (!linea) return;
    setReintentando((prev) => ({ ...prev, [perroId]: true }));
    const resultado = await agregarEstanciaAReserva(reservaId, lineaAPayload(linea, servicios));
    setReintentando((prev) => ({ ...prev, [perroId]: false }));
    setResultados((prev) => (prev ? prev.map((r) => (r.perroId === perroId ? resultado : r)) : [resultado]));
  }

  // Paso 1: elegir cliente.
  if (!clienteElegido) {
    return (
      <div className="flex flex-col gap-4">
        <div className="max-w-sm">
          <Field
            label="Buscar cliente por nombre o teléfono"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="ej. Ana o 444 123"
            autoFocus
          />
        </div>
        <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
          {clientesFiltrados.length === 0 ? (
            <p className="p-6 text-center text-n-600">Ningún cliente coincide con la búsqueda.</p>
          ) : (
            <ul className="divide-y divide-n-200">
              {clientesFiltrados.slice(0, 30).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => elegirCliente(c.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
                  >
                    <span className="font-semibold text-n-900">{c.nombre}</span>
                    <span className="tabular-nums text-n-600">{formatearTelefono(c.telefono)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Paso 3: resultados de un envío ya hecho.
  if (resultados) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-n-700">
          Reserva para <strong>{clienteElegido.nombre}</strong>:
        </p>
        <ul className="flex flex-col gap-3">
          {resultados.map((r) => {
            const linea = lineas.find((l) => l.perroId === r.perroId);
            const esBloqueoSanitario = !r.exito && r.motivo?.toLowerCase().includes("sanitario");
            return (
              <li
                key={r.perroId}
                className={`rounded-lg border-[1.5px] p-4 ${
                  r.exito ? "border-verde bg-verde-suave" : "border-naranja bg-naranja-suave"
                }`}
              >
                <p className={`font-bold ${r.exito ? "text-verde-oscuro" : "text-naranja-oscuro"}`}>
                  {linea?.perroNombre ?? "Perro"} — {r.exito ? "Reservado" : "No se pudo reservar"}
                </p>
                {r.exito && r.estanciaId && (
                  <Link
                    href={`/reservas/estancias/${r.estanciaId}/checkin`}
                    className="mt-1 inline-block text-sm font-semibold text-verde-oscuro hover:underline"
                  >
                    Hacer check-in ahora →
                  </Link>
                )}
                {!r.exito && <p className="mt-1 text-sm text-naranja-oscuro">{r.motivo}</p>}
                {esBloqueoSanitario && esAdmin && linea && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-naranja pt-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-naranja-oscuro">
                      <input
                        type="checkbox"
                        checked={linea.bloqueoSanitarioSuperado}
                        onChange={(e) =>
                          actualizarLinea(r.perroId, { bloqueoSanitarioSuperado: e.target.checked })
                        }
                      />
                      Autorizar excepción (solo admin)
                    </label>
                    {linea.bloqueoSanitarioSuperado && (
                      <>
                        <Field
                          label="Motivo de la excepción"
                          value={linea.motivoExcepcionSanitaria}
                          onChange={(e) =>
                            actualizarLinea(r.perroId, { motivoExcepcionSanitaria: e.target.value })
                          }
                          placeholder="ej. Dueño ya en el mostrador, autoriza admin"
                        />
                        <Button
                          type="button"
                          variante="secundario"
                          disabled={!linea.motivoExcepcionSanitaria.trim() || reintentando[r.perroId]}
                          onClick={() => reintentar(r.perroId)}
                          className="self-start"
                        >
                          {reintentando[r.perroId] ? "Reintentando…" : "Reintentar con excepción"}
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {!r.exito && !esBloqueoSanitario && (
                  <Button
                    type="button"
                    variante="secundario"
                    disabled={reintentando[r.perroId]}
                    onClick={() => reintentar(r.perroId)}
                    className="mt-3"
                  >
                    {reintentando[r.perroId] ? "Reintentando…" : "Reintentar"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-3">
          {reservaId && (
            <Link href={`/reservas/${reservaId}`}>
              <Button type="button">Ver reserva</Button>
            </Link>
          )}
          <Link href="/reservas/nueva">
            <Button type="button" variante="secundario">
              Nueva reserva
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Paso 2: elegir perros y capturar cada línea.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
        <div>
          <p className="text-sm text-n-600">Cliente</p>
          <p className="font-bold text-n-900">{clienteElegido.nombre}</p>
        </div>
        <Button type="button" variante="secundario" onClick={cambiarCliente}>
          Cambiar cliente
        </Button>
      </div>

      {perrosDelCliente.length === 0 ? (
        <Alert variante="advertencia" titulo="Este cliente no tiene perros registrados">
          Da de alta al perro antes de poder reservarle algo.
        </Alert>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Perros</h2>
          {perrosDelCliente.map((perro) => {
            const linea = lineas.find((l) => l.perroId === perro.id);
            const marcado = Boolean(linea);
            const servicioActual = servicios.find((s) => s.id === linea?.servicioId);
            const esGuarderia = servicioActual?.categoria === "guarderia";
            const seriesDelPerro = seriesActivas.filter((s) => s.perroId === perro.id);
            return (
              <div key={perro.id} className="rounded-lg border border-n-200 bg-white p-4">
                <label className="flex items-center gap-2 font-semibold text-n-900">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternarPerro(perro)}
                    className="h-4 w-4"
                  />
                  {perro.nombre}
                </label>

                {seriesDelPerro.length > 0 && (
                  <p className="mt-2 rounded-md bg-azul-suave px-3 py-2 text-sm text-azul">
                    Ya tiene serie recurrente:{" "}
                    {seriesDelPerro
                      .map((s) => `${s.servicioNombre} — ${formatearDiasSemana(s.diasSemana)}`)
                      .join("; ")}
                    . Revisa que esta reserva no choque con esos días.
                  </p>
                )}

                {linea && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Select
                      label="Servicio"
                      value={linea.servicioId}
                      onChange={(e) => actualizarLinea(perro.id, { servicioId: e.target.value })}
                    >
                      {servicios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </Select>
                    <Field
                      label={esGuarderia ? "Fecha" : "Entrada"}
                      type="date"
                      value={linea.fechaEntrada}
                      onChange={(e) => actualizarLinea(perro.id, { fechaEntrada: e.target.value })}
                    />
                    {!esGuarderia && (
                      <Field
                        label="Salida"
                        type="date"
                        value={linea.fechaSalida}
                        min={linea.fechaEntrada}
                        onChange={(e) => actualizarLinea(perro.id, { fechaSalida: e.target.value })}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Textarea
        label="Notas (opcional)"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Cualquier detalle de esta visita"
      />

      {errorGeneral && (
        <Alert variante="error" titulo="No pudimos crear la reserva">
          {errorGeneral}
        </Alert>
      )}

      <Button
        type="button"
        disabled={lineas.length === 0 || enviando}
        onClick={enviar}
        className="self-start"
      >
        {enviando ? "Guardando…" : "Crear reserva"}
      </Button>
    </div>
  );
}
