"use client";
import { esperarConTope } from "@/lib/ui/espera";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { crearLineaReceta, darDeBajaLineaReceta } from "./actions";

export type LineaReceta = {
  id: string;
  tamano_id: string;
  tamano_etiqueta: string;
  orden?: number;
  insumo_id: string;
  insumo_nombre: string;
  unidad_etiqueta: string;
  cantidad_consumo: number;
};

export type OpcionSimple = { id: string; nombre: string };

export function RecetaConsumo({
  servicioId,
  esAdmin,
  tamanos,
  insumos,
  lineas,
}: {
  servicioId: string;
  esAdmin: boolean;
  tamanos: { id: string; etiqueta: string }[];
  insumos: OpcionSimple[];
  lineas: LineaReceta[];
}) {
  const router = useRouter();
  const [tamanoId, setTamanoId] = useState("");
  const [insumoId, setInsumoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    setError(null);
    const res = await enviando.ejecutar(() => crearLineaReceta(servicioId, tamanoId, insumoId, Number(cantidad)));
    if (res.error) {
      setError(res.error);
      return;
    }
    setTamanoId("");
    setInsumoId("");
    setCantidad("");
    router.refresh();
  }

  async function quitar(lineaId: string) {
    const res = await esperarConTope(async () => {
      await darDeBajaLineaReceta(servicioId, lineaId);
      return { error: null };
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  const lineasPorTamano = new Map<string, LineaReceta[]>();
  for (const l of lineas) {
    const lista = lineasPorTamano.get(l.tamano_etiqueta) ?? [];
    lista.push(l);
    lineasPorTamano.set(l.tamano_etiqueta, lista);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {error}
        </Alert>
      )}

      {lineas.length === 0 ? (
        <p className="text-n-600">Todavía no hay receta de consumo para este servicio.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {[...lineasPorTamano.entries()].map(([tamanoEtiqueta, filas]) => (
            <div key={tamanoEtiqueta} className="rounded-lg border border-n-200 bg-white p-4">
              <p className="mb-2 font-bold text-n-900">{tamanoEtiqueta}</p>
              <ul className="flex flex-col gap-1.5">
                {filas.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-n-700">
                      {f.insumo_nombre} — {f.cantidad_consumo} {f.unidad_etiqueta}
                    </span>
                    {esAdmin && (
                      <button
                        type="button"
                        onClick={() => quitar(f.id)}
                        className="text-xs font-semibold text-naranja-oscuro hover:underline"
                      >
                        Quitar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {esAdmin && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
          <Select label="Tamaño" value={tamanoId} onChange={(e) => setTamanoId(e.target.value)} disabled={enviando.cargando}>
            <option value="">Elige un tamaño</option>
            {tamanos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.etiqueta}
              </option>
            ))}
          </Select>
          <Select label="Insumo" value={insumoId} onChange={(e) => setInsumoId(e.target.value)} disabled={enviando.cargando}>
            <option value="">Elige un insumo</option>
            {insumos.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre}
              </option>
            ))}
          </Select>
          <Field
            label="Cantidad"
            type="number"
            step="0.01"
            min="0"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            disabled={enviando.cargando}
            className="w-32"
          />
          <AccionesFormulario error={error}>
            <Button type="button" disabled={enviando.cargando || !tamanoId || !insumoId || !cantidad} onClick={agregar}>
              {enviando.cargando ? "Guardando…" : "Agregar línea"}
            </Button>
          </AccionesFormulario>
        </div>
      )}
    </div>
  );
}
