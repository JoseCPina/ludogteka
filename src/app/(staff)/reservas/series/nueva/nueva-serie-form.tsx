"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario } from "@/lib/formato";
import { formatearTelefono } from "@/lib/telefono";
import { DIAS_SEMANA, formatearDiasSemana } from "../dias-semana";
import { crearSerie, type ResultadoFecha } from "../../series-actions";

type Cliente = { id: string; nombre: string; telefono: string };
type Perro = { id: string; cliente_id: string; nombre: string };
type Servicio = { id: string; nombre: string; categoria: string };
type SerieActiva = { perroId: string; diasSemana: number[]; servicioNombre: string };

export function NuevaSerieForm({
  clientes,
  perros,
  servicios,
  seriesActivas,
  hoy,
}: {
  clientes: Cliente[];
  perros: Perro[];
  servicios: Servicio[];
  seriesActivas: SerieActiva[];
  hoy: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [perroId, setPerroId] = useState("");
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? "");
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [fechaInicio, setFechaInicio] = useState(hoy);
  const [tieneFin, setTieneFin] = useState(false);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoFecha[] | null>(null);
  const [serieId, setSerieId] = useState<string | null>(null);

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    const qDigitos = q.replace(/\D/g, "");
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || (qDigitos && c.telefono.includes(qDigitos))
    );
  }, [clientes, busqueda]);

  const clienteElegido = clientes.find((c) => c.id === clienteId) ?? null;
  const perrosDelCliente = useMemo(() => perros.filter((p) => p.cliente_id === clienteId), [perros, clienteId]);
  const seriesDelPerro = seriesActivas.filter((s) => s.perroId === perroId);

  function alternarDia(dia: number) {
    setDiasSemana((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia].sort()));
  }

  async function enviar() {
    setEnviando(true);
    setError(null);
    const res = await crearSerie(perroId, servicioId, diasSemana, fechaInicio, tieneFin ? fechaFin : null);
    setEnviando(false);
    if (res.error && !res.serieId) {
      setError(res.error);
      return;
    }
    setResultados(res.resultados ?? []);
    setSerieId(res.serieId ?? null);
  }

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
                    onClick={() => setClienteId(c.id)}
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

  if (resultados) {
    const creadas = resultados.filter((r) => r.exito);
    const noCupieron = resultados.filter((r) => !r.exito);
    return (
      <div className="flex flex-col gap-4">
        <Alert variante="exito" titulo="Serie creada">
          Se generaron {creadas.length} fecha{creadas.length === 1 ? "" : "s"} en las próximas 8 semanas.
        </Alert>
        {noCupieron.length > 0 && (
          <div className="rounded-lg border-[1.5px] border-naranja bg-naranja-suave p-4">
            <p className="font-bold text-naranja-oscuro">
              {noCupieron.length} fecha{noCupieron.length === 1 ? "" : "s"} no {noCupieron.length === 1 ? "cupo" : "cupieron"}
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-naranja-oscuro">
              {noCupieron.map((r) => (
                <li key={r.fecha}>
                  {formatearFechaCalendario(r.fecha)}: {r.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
        {creadas.length > 0 && (
          <div className="rounded-lg border border-n-200 bg-white p-4">
            <p className="font-semibold text-n-900">Fechas generadas</p>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm text-n-700">
              {creadas.map((r) => (
                <li key={r.fecha} className="rounded-full bg-verde-suave px-2.5 py-1 text-verde-oscuro">
                  {formatearFechaCalendario(r.fecha)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {serieId && (
            <Link href={`/reservas/series/${serieId}`}>
              <Button type="button">Ver serie</Button>
            </Link>
          )}
          <Link href="/reservas/series">
            <Button type="button" variante="secundario">
              Volver al listado
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
        <div>
          <p className="text-sm text-n-600">Cliente</p>
          <p className="font-bold text-n-900">{clienteElegido.nombre}</p>
        </div>
        <Button type="button" variante="secundario" onClick={() => setClienteId(null)}>
          Cambiar cliente
        </Button>
      </div>

      {perrosDelCliente.length === 0 ? (
        <Alert variante="advertencia" titulo="Este cliente no tiene perros registrados">
          Da de alta al perro antes de poder armarle una serie.
        </Alert>
      ) : (
        <>
          <Select label="Perro" value={perroId} onChange={(e) => setPerroId(e.target.value)}>
            <option value="">Elige un perro</option>
            {perrosDelCliente.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>

          {seriesDelPerro.length > 0 && (
            <Alert variante="advertencia" titulo="Este perro ya tiene serie recurrente">
              {seriesDelPerro
                .map((s) => `${s.servicioNombre} — ${formatearDiasSemana(s.diasSemana)}`)
                .join("; ")}
              . Revisa que esta serie nueva no choque con esa.
            </Alert>
          )}

          {perroId && (
            <>
              <Select label="Servicio" value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>

              <div>
                <p className="mb-1.5 text-sm font-semibold text-n-800">Días de la semana</p>
                <div className="flex flex-wrap gap-2">
                  {DIAS_SEMANA.map((d) => (
                    <button
                      key={d.valor}
                      type="button"
                      onClick={() => alternarDia(d.valor)}
                      className={`rounded-full border-[1.5px] px-3 py-1.5 text-sm font-semibold transition-colors ${
                        diasSemana.includes(d.valor)
                          ? "border-azul bg-azul-suave text-azul"
                          : "border-n-200 bg-white text-n-600 hover:border-n-300"
                      }`}
                    >
                      {d.corta}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Fecha de inicio"
                  type="date"
                  value={fechaInicio}
                  min={hoy}
                  onChange={(e) => setFechaInicio(e.target.value)}
                />
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 text-sm font-semibold text-n-800">
                    <input type="checkbox" checked={tieneFin} onChange={(e) => setTieneFin(e.target.checked)} />
                    Tiene fecha de fin
                  </label>
                  {tieneFin && (
                    <Field
                      label="Fecha de fin"
                      type="date"
                      value={fechaFin}
                      min={fechaInicio}
                      onChange={(e) => setFechaFin(e.target.value)}
                    />
                  )}
                </div>
              </div>

              {error && (
                <Alert variante="error" titulo="No pudimos crear la serie">
                  {error}
                </Alert>
              )}

              <Button
                type="button"
                disabled={diasSemana.length === 0 || !servicioId || enviando}
                onClick={enviar}
                className="self-start"
              >
                {enviando ? "Creando…" : "Crear serie y generar horizonte"}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
