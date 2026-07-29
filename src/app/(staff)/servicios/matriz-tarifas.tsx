"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { CeldaTarifa, type ValorCelda } from "./celda-tarifa";
import { guardarTarifas, type FilaTarifaGuardar } from "./tarifas-actions";

type Opcion = { id: string; etiqueta: string };
type FilaVigente = {
  tamano_id: string | null;
  pelaje_id: string | null;
  cantidad_desde: number;
  cantidad_hasta: number | null;
  precio: number;
  no_aplica: boolean;
};
type Tramo = { clientId: string; desde: number; hasta: number | null };

function claveBaseline(
  desde: number,
  hasta: number | null,
  tamanoId: string | null,
  pelajeId: string | null
): string {
  return `${desde}|${hasta ?? ""}|${tamanoId ?? ""}|${pelajeId ?? ""}`;
}

function claveValor(tramoId: string, tamanoId: string | null, pelajeId: string | null): string {
  return `${tramoId}|${tamanoId ?? ""}|${pelajeId ?? ""}`;
}

function etiquetaTramo(t: { desde: number; hasta: number | null }): string {
  return t.hasta ? `${t.desde}–${t.hasta}` : `${t.desde}+`;
}

function derivarTramosIniciales(vigentes: FilaVigente[]): Tramo[] {
  const vistos = new Map<string, Tramo>();
  for (const v of vigentes) {
    const key = `${v.cantidad_desde}|${v.cantidad_hasta ?? ""}`;
    if (!vistos.has(key)) {
      vistos.set(key, { clientId: key, desde: v.cantidad_desde, hasta: v.cantidad_hasta });
    }
  }
  const lista = Array.from(vistos.values()).sort((a, b) => a.desde - b.desde);
  return lista.length > 0 ? lista : [{ clientId: "tramo-1", desde: 1, hasta: null }];
}

function tramosSeTraslapan(a: Tramo, b: Tramo): boolean {
  const aHasta = a.hasta ?? Infinity;
  const bHasta = b.hasta ?? Infinity;
  return a.desde <= bHasta && b.desde <= aHasta;
}

export function MatrizTarifas({
  servicioId,
  dependeTamano,
  dependePelaje,
  dependeCantidad,
  tamanos,
  pelajes,
  vigentes,
}: {
  servicioId: string;
  dependeTamano: boolean;
  dependePelaje: boolean;
  dependeCantidad: boolean;
  tamanos: Opcion[];
  pelajes: Opcion[];
  vigentes: FilaVigente[];
}) {
  const router = useRouter();
  const filas = dependeTamano ? tamanos : [{ id: "", etiqueta: "—" }];
  const columnas = dependePelaje ? pelajes : [{ id: "", etiqueta: "—" }];

  const [tramos, setTramos] = useState<Tramo[]>(() => derivarTramosIniciales(vigentes));
  const [valores, setValores] = useState<Map<string, ValorCelda>>(new Map());
  const [vigenciaDesde, setVigenciaDesde] = useState(hoyNegocio());
  const [errorTramos, setErrorTramos] = useState<string | null>(null);
  const [rellenos, setRellenos] = useState<Map<string, string>>(new Map());
  const [incremento, setIncremento] = useState({ valor: "", unidad: "porcentaje" as "porcentaje" | "monto" });
  const [previsualizando, setPrevisualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  const baselineMap = useMemo(() => {
    const m = new Map<string, { precio: number; no_aplica: boolean }>();
    for (const v of vigentes) {
      m.set(claveBaseline(v.cantidad_desde, v.cantidad_hasta, v.tamano_id, v.pelaje_id), {
        precio: v.precio,
        no_aplica: v.no_aplica,
      });
    }
    return m;
  }, [vigentes]);

  function obtenerBaseline(tramo: Tramo, tamanoId: string, pelajeId: string) {
    const baseline = baselineMap.get(
      claveBaseline(tramo.desde, tramo.hasta, tamanoId || null, pelajeId || null)
    );
    if (!baseline) return { estado: "sin_tarifa" as const, precio: null as number | null, no_aplica: false };
    return {
      estado: (baseline.no_aplica ? "no_aplica" : "disponible") as "no_aplica" | "disponible",
      precio: baseline.precio,
      no_aplica: baseline.no_aplica,
    };
  }

  function obtenerValor(tramoId: string, tamanoId: string, pelajeId: string): ValorCelda {
    const key = claveValor(tramoId, tamanoId, pelajeId);
    const tocado = valores.get(key);
    if (tocado) return tocado;
    const tramo = tramos.find((t) => t.clientId === tramoId)!;
    const base = obtenerBaseline(tramo, tamanoId, pelajeId);
    if (base.estado === "no_aplica") return { precio: "", no_aplica: true };
    if (base.estado === "disponible") return { precio: String(base.precio), no_aplica: false };
    return { precio: "", no_aplica: false };
  }

  function setValor(tramoId: string, tamanoId: string, pelajeId: string, nuevo: ValorCelda) {
    setValores((prev) => {
      const copia = new Map(prev);
      copia.set(claveValor(tramoId, tamanoId, pelajeId), nuevo);
      return copia;
    });
  }

  function agregarTramo() {
    const ultimo = tramos[tramos.length - 1];
    const nuevoDesde = ultimo?.hasta ? ultimo.hasta + 1 : (ultimo?.desde ?? 0) + 1;
    setTramos([...tramos, { clientId: crypto.randomUUID(), desde: nuevoDesde, hasta: null }]);
    setErrorTramos(null);
  }

  function quitarTramo(clientId: string) {
    setTramos(tramos.filter((t) => t.clientId !== clientId));
    setErrorTramos(null);
  }

  function actualizarTramo(clientId: string, campo: "desde" | "hasta", valor: number | null) {
    const nuevos = tramos.map((t) => (t.clientId === clientId ? { ...t, [campo]: valor } : t));
    const editado = nuevos.find((t) => t.clientId === clientId)!;
    const conflicto = nuevos.find((t) => t.clientId !== clientId && tramosSeTraslapan(t, editado));
    setErrorTramos(
      conflicto
        ? `El tramo ${etiquetaTramo(editado)} se traslapa con el tramo ${etiquetaTramo(conflicto)}.`
        : null
    );
    setTramos(nuevos);
  }

  function rellenarFila(tramoId: string, tamanoId: string) {
    const valor = rellenos.get(`fila-${tramoId}-${tamanoId}`) ?? "";
    if (!valor) return;
    for (const col of columnas) {
      setValor(tramoId, tamanoId, col.id, { precio: valor, no_aplica: false });
    }
  }

  function rellenarColumna(tramoId: string, pelajeId: string) {
    const valor = rellenos.get(`col-${tramoId}-${pelajeId}`) ?? "";
    if (!valor) return;
    for (const fila of filas) {
      setValor(tramoId, fila.id, pelajeId, { precio: valor, no_aplica: false });
    }
  }

  function aplicarIncrementoMasivo() {
    const monto = Number(incremento.valor);
    if (!incremento.valor || Number.isNaN(monto)) return;
    const nuevasValores = new Map(valores);
    for (const tramo of tramos) {
      for (const fila of filas) {
        for (const col of columnas) {
          const base = obtenerBaseline(tramo, fila.id, col.id);
          if (base.estado !== "disponible" || base.precio === null) continue;
          const nuevo =
            incremento.unidad === "porcentaje"
              ? base.precio * (1 + monto / 100)
              : base.precio + monto;
          nuevasValores.set(claveValor(tramo.clientId, fila.id, col.id), {
            precio: Math.max(0, Number(nuevo.toFixed(2))).toString(),
            no_aplica: false,
          });
        }
      }
    }
    setValores(nuevasValores);
  }

  const cambios = useMemo(() => {
    const lista: (FilaTarifaGuardar & {
      tramoEtiqueta: string;
      tamanoEtiqueta: string;
      pelajeEtiqueta: string;
      anterior: string;
    })[] = [];
    for (const tramo of tramos) {
      for (const fila of filas) {
        for (const col of columnas) {
          const valor = obtenerValor(tramo.clientId, fila.id, col.id);
          const base = obtenerBaseline(tramo, fila.id, col.id);

          const sinCambio =
            (base.estado === "disponible" &&
              !valor.no_aplica &&
              valor.precio !== "" &&
              Number(valor.precio) === base.precio) ||
            (base.estado === "no_aplica" && valor.no_aplica) ||
            (base.estado === "sin_tarifa" && !valor.no_aplica && valor.precio === "");

          if (sinCambio) continue;
          if (!valor.no_aplica && valor.precio === "") continue;

          const anterior =
            base.estado === "disponible"
              ? `$${base.precio!.toFixed(2)}`
              : base.estado === "no_aplica"
                ? "No aplica"
                : "Sin tarifa";

          lista.push({
            cantidad_desde: tramo.desde,
            cantidad_hasta: tramo.hasta,
            tamano_id: fila.id || null,
            pelaje_id: col.id || null,
            precio: valor.no_aplica ? null : Number(valor.precio),
            no_aplica: valor.no_aplica,
            tramoEtiqueta: etiquetaTramo(tramo),
            tamanoEtiqueta: fila.etiqueta,
            pelajeEtiqueta: col.etiqueta,
            anterior,
          });
        }
      }
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tramos, valores, baselineMap, filas, columnas]);

  async function confirmarGuardado() {
    setGuardando(true);
    setError(null);
    const resultado = await guardarTarifas(servicioId, vigenciaDesde, cambios);
    setGuardando(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    setExito(true);
    setPrevisualizando(false);
    setValores(new Map());
    router.refresh();
  }

  const vigenciaEsFutura = vigenciaDesde > hoyNegocio();

  if (previsualizando) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-n-900">Confirmar cambios</h2>
        {error && (
          <Alert variante="error" titulo="No se pudo guardar">
            {error}
          </Alert>
        )}
        <p className="text-n-600">
          Va a quedar vigente desde el <strong>{formatearFechaCalendario(vigenciaDesde)}</strong>.
        </p>
        <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-n-200 bg-n-100 px-4 py-2 text-left text-xs font-bold uppercase text-n-600">
                  Celda
                </th>
                <th className="border-b border-n-200 bg-n-100 px-4 py-2 text-left text-xs font-bold uppercase text-n-600">
                  Antes
                </th>
                <th className="border-b border-n-200 bg-n-100 px-4 py-2 text-left text-xs font-bold uppercase text-n-600">
                  Después
                </th>
              </tr>
            </thead>
            <tbody>
              {cambios.map((c, i) => (
                <tr key={i}>
                  <td className="border-b border-n-200 px-4 py-2 text-n-900">
                    {[c.tamanoEtiqueta, c.pelajeEtiqueta, dependeCantidad ? c.tramoEtiqueta : null]
                      .filter((v) => v && v !== "—")
                      .join(" · ")}
                  </td>
                  <td className="border-b border-n-200 px-4 py-2 tabular-nums text-n-600">
                    {c.anterior}
                  </td>
                  <td className="border-b border-n-200 px-4 py-2 tabular-nums font-semibold text-n-900">
                    {c.no_aplica ? "No aplica" : `$${c.precio!.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3">
          <Button type="button" disabled={guardando} onClick={confirmarGuardado}>
            {guardando ? "Guardando…" : "Confirmar y guardar"}
          </Button>
          <Button type="button" variante="secundario" disabled={guardando} onClick={() => setPrevisualizando(false)}>
            Seguir editando
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {exito && <Alert variante="exito" titulo="Tarifas guardadas" />}

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-n-200 bg-white p-4">
        <Field
          label="Vigente desde"
          type="date"
          value={vigenciaDesde}
          onChange={(e) => setVigenciaDesde(e.target.value)}
          className="max-w-[180px]"
        />
        <div className="flex items-end gap-2">
          <Field
            label="Incrementar precios actuales en"
            type="number"
            step="0.01"
            placeholder="ej. 10 o -5"
            value={incremento.valor}
            onChange={(e) => setIncremento({ ...incremento, valor: e.target.value })}
            className="max-w-[160px]"
          />
          <select
            value={incremento.unidad}
            onChange={(e) =>
              setIncremento({ ...incremento, unidad: e.target.value as "porcentaje" | "monto" })
            }
            className="min-h-12 rounded-md border-[1.5px] border-n-400 bg-white px-3 text-n-900"
          >
            <option value="porcentaje">%</option>
            <option value="monto">$</option>
          </select>
          <Button type="button" variante="secundario" onClick={aplicarIncrementoMasivo}>
            Aplicar a precios actuales
          </Button>
        </div>
      </div>

      {vigenciaEsFutura && (
        <Alert variante="advertencia" titulo="Esta vigencia empieza en el futuro">
          Si es un aumento temporal (como temporada alta), no olvides capturar después una segunda
          vigencia que regrese al precio normal — si no, se queda cobrando este precio para
          siempre.
        </Alert>
      )}

      {dependeCantidad && (
        <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-n-900">Tramos de cantidad</h3>
            <Button type="button" variante="secundario" onClick={agregarTramo}>
              Agregar tramo
            </Button>
          </div>
          {errorTramos && (
            <Alert variante="error" titulo="Tramos traslapados">
              {errorTramos}
            </Alert>
          )}
          <div className="flex flex-col gap-2">
            {tramos.map((t) => (
              <div key={t.clientId} className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-n-600">Desde</span>
                <input
                  type="number"
                  min={1}
                  value={t.desde}
                  onChange={(e) => actualizarTramo(t.clientId, "desde", Number(e.target.value))}
                  className="w-20 rounded-md border-[1.5px] border-n-400 px-2 py-1.5 text-sm tabular-nums"
                />
                <span className="text-sm text-n-600">hasta</span>
                <input
                  type="number"
                  min={1}
                  placeholder="sin tope"
                  value={t.hasta ?? ""}
                  onChange={(e) =>
                    actualizarTramo(
                      t.clientId,
                      "hasta",
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                  className="w-24 rounded-md border-[1.5px] border-n-400 px-2 py-1.5 text-sm tabular-nums"
                />
                {tramos.length > 1 && (
                  <Button
                    type="button"
                    variante="secundario"
                    className="min-h-9 px-3 text-xs"
                    onClick={() => quitarTramo(t.clientId)}
                  >
                    Quitar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tramos.map((tramo) => (
        <div key={tramo.clientId} className="flex flex-col gap-3">
          {dependeCantidad && (
            <h3 className="font-bold text-n-900">Tramo: {etiquetaTramo(tramo)}</h3>
          )}
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th></th>
                  {columnas.map((col) => (
                    <th key={col.id || "unica"} className="px-2 pb-1 text-center text-xs font-bold uppercase text-n-600">
                      {col.etiqueta}
                    </th>
                  ))}
                  {dependePelaje && <th></th>}
                </tr>
                {dependePelaje && (
                  <tr>
                    <th></th>
                    {columnas.map((col) => (
                      <th key={col.id || "unica"} className="px-2 pb-2">
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="valor"
                            className="w-16 rounded border border-n-300 px-1 py-1 text-xs"
                            onChange={(e) =>
                              setRellenos((prev) =>
                                new Map(prev).set(`col-${tramo.clientId}-${col.id}`, e.target.value)
                              )
                            }
                          />
                          <button
                            type="button"
                            title="Rellenar columna"
                            onClick={() => rellenarColumna(tramo.clientId, col.id)}
                            className="rounded border border-n-300 px-1.5 text-xs text-n-600 hover:bg-n-100"
                          >
                            ↓
                          </button>
                        </div>
                      </th>
                    ))}
                    <th></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.id || "unica"}>
                    <td className="pr-2 text-sm font-semibold text-n-900">{fila.etiqueta}</td>
                    {columnas.map((col) => (
                      <td key={col.id || "unica"} className="p-1">
                        <CeldaTarifa
                          estadoBase={obtenerBaseline(tramo, fila.id, col.id).estado}
                          valor={obtenerValor(tramo.clientId, fila.id, col.id)}
                          onChange={(nuevo) => setValor(tramo.clientId, fila.id, col.id, nuevo)}
                        />
                      </td>
                    ))}
                    {dependeTamano && (
                      <td className="pl-2">
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="valor"
                            className="w-16 rounded border border-n-300 px-1 py-1 text-xs"
                            onChange={(e) =>
                              setRellenos((prev) =>
                                new Map(prev).set(`fila-${tramo.clientId}-${fila.id}`, e.target.value)
                              )
                            }
                          />
                          <button
                            type="button"
                            title="Rellenar fila"
                            onClick={() => rellenarFila(tramo.clientId, fila.id)}
                            className="rounded border border-n-300 px-1.5 text-xs text-n-600 hover:bg-n-100"
                          >
                            →
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <Button
        type="button"
        className="self-start"
        disabled={Boolean(errorTramos)}
        onClick={() => {
          setError(null);
          setPrevisualizando(true);
        }}
      >
        Revisar y guardar
      </Button>
      {cambios.length === 0 && (
        <p className="text-sm text-n-500">Todavía no hay cambios para guardar.</p>
      )}
    </div>
  );
}
