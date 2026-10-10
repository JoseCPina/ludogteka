"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormularioAccion } from "@/components/formulario-accion";
import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";
import { useZonaNegocio } from "@/components/zona-negocio";
import { registrarAjusteLote, registrarEntradaLote, registrarSalidaLote } from "../../actions";
import { AVISO_FOLIO_RECETA, ESTADOS_CADUCIDAD, TIPOS_MOVIMIENTO_LOTE } from "../../comun";

export type MovimientoLote = {
  id: string;
  tipo: string;
  cantidad: number; // en unidad de consumo
  motivo: string | null;
  folio_receta: string | null;
  created_at: string;
};

export type LoteFila = {
  id: string;
  codigo: string;
  fecha_caducidad: string | null;
  proveedor: string | null;
  saldo: number; // en unidad de consumo
  estado: string;
  movimientos: MovimientoLote[];
};

type Accion = "surtido" | "merma" | "caducado" | "ajuste";

const TITULO: Record<Accion, string> = { surtido: "Surtir", merma: "Registrar merma", caducado: "Sacar por caducidad", ajuste: "Ajustar" };

export function LotesProducto({
  insumoId,
  puedeEscribir,
  exigeFolio,
  unidadCompra,
  unidadConsumo,
  lotes,
}: {
  insumoId: string;
  puedeEscribir: boolean;
  exigeFolio: boolean;
  unidadCompra: string;
  unidadConsumo: string;
  lotes: LoteFila[];
}) {
  const zona = useZonaNegocio();
  const [entradaAbierta, setEntradaAbierta] = useState(false);
  const [abierto, setAbierto] = useState<{ lote: string; accion: Accion } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {exigeFolio && (
        <p role="note" className="rounded-md border-l-4 border-ambar bg-ambar-suave px-3 py-2 text-sm font-semibold text-ambar-oscuro">
          {AVISO_FOLIO_RECETA}
        </p>
      )}

      {puedeEscribir && (
        <div className="flex flex-col gap-3">
          <div>
            <Button type="button" variante={entradaAbierta ? "primario" : "secundario"} onClick={() => setEntradaAbierta((v) => !v)}>
              Registrar entrada
            </Button>
          </div>
          {entradaAbierta && (
            <FormularioAccion
              accion={(fd) => registrarEntradaLote(insumoId, fd)}
              textoBoton="Registrar entrada"
              textoExito="Entrada registrada"
              reiniciar
              className="rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Código de lote" name="codigo" required ayuda="El que viene en la caja o el frasco." />
                <Field label="Fecha de caducidad" name="caducidad" type="date" required />
                <Field label={`Cantidad (${unidadCompra})`} name="cantidad" type="number" step="0.01" min="0" required />
                <Field label="Proveedor (opcional)" name="proveedor" />
              </div>
              <Field label="Notas (opcional)" name="notas" />
            </FormularioAccion>
          )}
        </div>
      )}

      {lotes.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">Este producto todavía no tiene lotes. Registra la primera entrada.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lotes.map((l) => {
            const est = ESTADOS_CADUCIDAD[l.estado] ?? ESTADOS_CADUCIDAD.vigente;
            const resaltado = l.saldo > 0 && (l.estado === "caducado" || l.estado === "por_caducar");
            const vacio = l.saldo <= 0;
            return (
              <li
                key={l.id}
                className={`rounded-lg border bg-white p-4 ${resaltado ? (l.estado === "caducado" ? "border-coral" : "border-ambar") : "border-n-200"} ${vacio ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-n-900">Lote {l.codigo}</p>
                    <p className="text-sm text-n-600">
                      {l.fecha_caducidad ? `Caduca el ${formatearFechaCalendario(l.fecha_caducidad)}` : "Sin fecha de caducidad"}
                      {l.proveedor ? ` · ${l.proveedor}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold tabular-nums text-n-900">
                      {l.saldo.toLocaleString("es-MX")} {unidadConsumo}
                    </span>
                    {!vacio && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${est.estilo}`}>{est.etiqueta}</span>}
                    {vacio && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">Agotado</span>}
                  </div>
                </div>

                {puedeEscribir && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["surtido", "merma", "caducado", "ajuste"] as Accion[])
                      .filter((a) => a === "ajuste" || !vacio)
                      .map((a) => (
                        <Button
                          key={a}
                          type="button"
                          variante={abierto?.lote === l.id && abierto.accion === a ? "primario" : "secundario"}
                          className="min-h-10 px-3 text-sm"
                          onClick={() => setAbierto(abierto?.lote === l.id && abierto.accion === a ? null : { lote: l.id, accion: a })}
                        >
                          {a === "surtido" ? "Surtir" : a === "merma" ? "Merma" : a === "caducado" ? "Caducado" : "Ajuste"}
                        </Button>
                      ))}
                  </div>
                )}

                {puedeEscribir && abierto?.lote === l.id && (
                  <div className="mt-3">
                    {abierto.accion === "ajuste" ? (
                      <FormularioAccion
                        accion={(fd) => registrarAjusteLote(insumoId, l.id, fd)}
                        textoBoton="Registrar ajuste"
                        reiniciar
                        className="rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4"
                      >
                        <Select label="Sentido" name="sentido" defaultValue="positivo">
                          <option value="positivo">Hay más que en el sistema (+)</option>
                          <option value="negativo">Hay menos que en el sistema (−)</option>
                        </Select>
                        <Field label={`Cantidad (${unidadConsumo})`} name="cantidad" type="number" step="0.01" min="0" required />
                        <Field label="Motivo" name="motivo" required />
                      </FormularioAccion>
                    ) : (
                      <FormularioAccion
                        accion={(fd) => registrarSalidaLote(insumoId, l.id, abierto.accion as "surtido" | "merma" | "caducado", fd)}
                        textoBoton={TITULO[abierto.accion]}
                        reiniciar
                        className="rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4"
                      >
                        <Field label={`Cantidad (${unidadConsumo})`} name="cantidad" type="number" step="0.01" min="0" required />
                        {abierto.accion === "surtido" ? (
                          <>
                            <Field label="Folio de receta (opcional)" name="folio_receta" ayuda={exigeFolio ? AVISO_FOLIO_RECETA : undefined} />
                            <Field label="Nota (opcional)" name="motivo" />
                          </>
                        ) : (
                          <Field label="Motivo" name="motivo" required />
                        )}
                      </FormularioAccion>
                    )}
                  </div>
                )}

                {l.movimientos.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-morado">Historial del lote ({l.movimientos.length})</summary>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {l.movimientos.map((m) => {
                        const t = TIPOS_MOVIMIENTO_LOTE[m.tipo];
                        return (
                          <li key={m.id} className="rounded-md border border-n-200 px-3 py-2 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="flex items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t?.estilo ?? "bg-n-100 text-n-700"}`}>{t?.etiqueta ?? m.tipo}</span>
                                <span className="font-semibold tabular-nums text-n-900">
                                  {t?.entrada ? "+" : "−"}
                                  {m.cantidad.toLocaleString("es-MX")} {unidadConsumo}
                                </span>
                              </span>
                              <span className="text-n-500">{formatearFecha(m.created_at, zona)}</span>
                            </div>
                            {m.motivo && <p className="mt-1 text-n-600">{m.motivo}</p>}
                            {m.folio_receta && <p className="mt-1 text-n-600">Folio de receta: {m.folio_receta}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
