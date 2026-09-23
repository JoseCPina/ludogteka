"use client";

import { useMemo, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { TextoConEnlaces } from "@/components/ui/texto-con-enlaces";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario } from "@/lib/formato";
import { BuscadorClientes } from "@/components/buscador-clientes";
import type { ClienteBuscable } from "@/lib/clientes/buscables";
import { describirBonoAplicado } from "@/lib/bonos/descripcion";
import { primerCotizable, type ServicioOfrecible } from "@/lib/servicios/ofrecibles";
import { OpcionesServicio, AvisoServiciosSinPrecio } from "@/components/servicios/opciones-servicio";
import { formatearDiasSemana } from "../dias-semana";
import { SelectorDias } from "../selector-dias";
import { crearSerie, type ResultadoFecha } from "../../series-actions";

type Perro = { id: string; cliente_id: string; nombre: string };
type Servicio = ServicioOfrecible;
type SerieActiva = { perroId: string; diasSemana: number[]; servicioNombre: string };

export function NuevaSerieForm({
  clientes,
  perros,
  servicios,
  seriesActivas,
  hoy,
  base,
  diasSinGuarderia,
}: {
  clientes: ClienteBuscable[];
  perros: Perro[];
  servicios: Servicio[];
  seriesActivas: SerieActiva[];
  hoy: string;
  // Modulo desde el que se abrio ("/guarderia" u "/hotel").
  base: string;
  // Días de la semana (1 = lunes … 7 = domingo) en que guardería no abre.
  diasSinGuarderia: number[];
}) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [perroId, setPerroId] = useState("");
  const [servicioId, setServicioId] = useState(primerCotizable(servicios)?.id ?? "");
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [fechaInicio, setFechaInicio] = useState(hoy);
  const [tieneFin, setTieneFin] = useState(false);
  const [fechaFin, setFechaFin] = useState(hoy);
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoFecha[] | null>(null);
  const [serieId, setSerieId] = useState<string | null>(null);

  const clienteElegido = clientes.find((c) => c.id === clienteId) ?? null;
  const perrosDelCliente = useMemo(() => perros.filter((p) => p.cliente_id === clienteId), [perros, clienteId]);
  const seriesDelPerro = seriesActivas.filter((s) => s.perroId === perroId);
  const servicioElegido = servicios.find((s) => s.id === servicioId) ?? null;

  function alternarDia(dia: number) {
    setDiasSemana((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia].sort()));
  }

  async function enviar() {
    setError(null);
    const res = await enviando.ejecutar(() => crearSerie(perroId, servicioId, diasSemana, fechaInicio, tieneFin ? fechaFin : null));
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
        <BuscadorClientes clientes={clientes} onElegir={(c) => setClienteId(c.id)} nuevoCliente="guarderia_hotel" autoFocus />
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
                  {formatearFechaCalendario(r.fecha)}: {r.motivo ? <TextoConEnlaces texto={r.motivo} /> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        {creadas.length > 0 && (
          <div className="rounded-lg border border-n-200 bg-white p-4">
            <p className="font-semibold text-n-900">Fechas generadas</p>
            <p className="mt-0.5 text-sm text-n-600">
              {creadas.filter((r) => r.bono?.aplicado).length} con pase ·{" "}
              {creadas.filter((r) => !r.bono?.aplicado).length} de día suelto
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-n-700">
              {creadas.map((r) => (
                <li key={r.fecha} className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-semibold ${
                      r.bono?.aplicado ? "bg-verde-suave text-verde-oscuro" : "bg-n-100 text-n-700"
                    }`}
                  >
                    {formatearFechaCalendario(r.fecha)}
                  </span>
                  <span className="text-xs text-n-600">{describirBonoAplicado(r.bono) ?? "Día suelto."}</span>
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
          <Link href={`${base}/series`}>
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
              <AvisoServiciosSinPrecio servicios={servicios} />
              <Select label="Servicio" value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
                <OpcionesServicio servicios={servicios} />
              </Select>

              <SelectorDias
                dias={diasSemana}
                onAlternar={alternarDia}
                diasCerrados={servicioElegido?.categoria === "guarderia" ? diasSinGuarderia : []}
              />

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
                disabled={diasSemana.length === 0 || !servicioId || enviando.cargando}
                onClick={enviar}
                className="self-start"
              >
                {enviando.cargando ? "Creando…" : "Crear serie y generar horizonte"}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
