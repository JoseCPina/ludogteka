"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFechaCalendario } from "@/lib/formato";
import { guardarPrecioPorDia, quitarPrecioPorDia } from "./tarifas-actions";

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export type PrecioDia = { id: string; dia_semana: number; precio: number; vigencia_desde: string };

/**
 * Precio distinto para un día de la semana. Reemplaza el precio de la
 * matriz ese día, para todas las tallas (p. ej. guardería día completo en
 * sábado, que es medio día). Lo aplica la base al reservar: la matriz de
 * arriba no cambia.
 */
export function PreciosPorDia({ servicioId, precios, hoy }: { servicioId: string; precios: PrecioDia[]; hoy: string }) {
  const router = useRouter();
  const [dia, setDia] = useState("6");
  const [precio, setPrecio] = useState("");
  const [vigencia, setVigencia] = useState(hoy);
  const envio = useEspera();
  const quitando = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => guardarPrecioPorDia(servicioId, Number(dia), Number(precio), vigencia));
    if (res.error) {
      setError(res.error);
      return;
    }
    setPrecio("");
    setExito("Precio guardado");
    router.refresh();
  }

  async function quitar(id: string) {
    setError(null);
    setExito(null);
    const res = await quitando.ejecutar(() => quitarPrecioPorDia(id, servicioId));
    if (res.error) {
      setError(res.error);
      return;
    }
    setExito("Precio quitado");
    router.refresh();
  }

  // El que aplica hoy por día es el de vigencia más reciente que ya empezó;
  // los de fecha futura se listan como programados.
  const vigentes = new Map<number, PrecioDia>();
  for (const p of [...precios].sort((a, b) => b.vigencia_desde.localeCompare(a.vigencia_desde))) {
    if (p.vigencia_desde <= hoy && !vigentes.has(p.dia_semana)) vigentes.set(p.dia_semana, p);
  }
  const programados = precios.filter((p) => p.vigencia_desde > hoy);

  return (
    <div className="flex flex-col gap-4">
      {vigentes.size === 0 && programados.length === 0 ? (
        <p className="text-n-600">Este servicio cuesta lo mismo todos los días.</p>
      ) : (
        <ul className="divide-y divide-n-200 rounded-lg border border-n-200 bg-white">
          {[...vigentes.values(), ...programados].map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-n-900">
                <strong>{DIAS[p.dia_semana]}</strong>:{" "}
                <span className="tabular-nums">${Number(p.precio).toFixed(2)}</span>
                <span className="text-sm text-n-600">
                  {p.vigencia_desde > hoy ? " · a partir del " : " · desde el "}
                  {formatearFechaCalendario(p.vigencia_desde)}
                </span>
              </span>
              <Button type="button" variante="secundario" cargando={quitando.cargando} onClick={() => quitar(p.id)}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Select label="Día" value={dia} onChange={(e) => setDia(e.target.value)}>
          {DIAS.slice(1).map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </Select>
        <Field label="Precio" type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        <Field label="Aplica desde" type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
      </div>
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" cargando={envio.cargando} onClick={guardar} disabled={!precio}>
          Guardar precio del día
        </Button>
      </AccionesFormulario>
    </div>
  );
}
