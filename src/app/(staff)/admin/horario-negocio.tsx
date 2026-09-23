"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { guardarHorarioSemana, type DiaHorario } from "./configuracion-actions";

// Lunes primero, como se lee un horario; el número es el de la base
// (0 = domingo … 6 = sábado).
const DIAS = [
  { num: 1, nombre: "Lunes" },
  { num: 2, nombre: "Martes" },
  { num: 3, nombre: "Miércoles" },
  { num: 4, nombre: "Jueves" },
  { num: 5, nombre: "Viernes" },
  { num: 6, nombre: "Sábado" },
  { num: 0, nombre: "Domingo" },
];

type Fila = { abre: boolean; apertura: string; cierre: string };

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/**
 * El horario de atención por día. De aquí sale todo lo que depende de qué
 * días abre el negocio: en qué días se puede reservar guardería, cuándo se
 * entrega un perro de hotel, cuántos días trae una mensualidad y el
 * {{horario_guarderia}} del contrato.
 *
 * Guardar no reescribe el horario de días pasados: si la configuración
 * vigente es de antes de hoy, se crea una versión nueva con fecha de hoy.
 */
export function HorarioNegocio({ vigente }: { vigente: DiaHorario[] }) {
  const router = useRouter();
  const inicial = Object.fromEntries(
    DIAS.map((d) => {
      const v = vigente.find((x) => x.dia_semana === d.num);
      return [d.num, { abre: Boolean(v?.hora_apertura), apertura: hhmm(v?.hora_apertura ?? null), cierre: hhmm(v?.hora_cierre ?? null) }];
    })
  ) as Record<number, Fila>;
  const [filas, setFilas] = useState<Record<number, Fila>>(inicial);
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [aviso, setAviso] = useState<number>(0);

  function cambiar(num: number, cambio: Partial<Fila>) {
    setExito(null);
    setFilas((prev) => ({ ...prev, [num]: { ...prev[num], ...cambio } }));
  }

  async function guardar() {
    setError(null);
    setExito(null);
    const dias: DiaHorario[] = DIAS.map((d) => {
      const f = filas[d.num];
      return {
        dia_semana: d.num,
        hora_apertura: f.abre ? f.apertura || null : null,
        hora_cierre: f.abre ? f.cierre || null : null,
      };
    });
    const res = await envio.ejecutar(() => guardarHorarioSemana(dias));
    if (res.error) {
      setError(res.error);
      return;
    }
    setAviso(res.reservasEnDiasCerrados ?? 0);
    setExito("Horario guardado");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-n-600">
        De aquí sale en qué días se puede reservar guardería, cuándo se entrega un perro de hotel,
        cuántos días trae una mensualidad y el horario que dice el contrato.
      </p>

      <ul className="divide-y divide-n-200 rounded-lg border border-n-200">
        {DIAS.map((d) => {
          const f = filas[d.num];
          return (
            <li key={d.num} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <label className="flex w-36 items-center gap-2 font-semibold text-n-900">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={f.abre}
                  onChange={(e) => cambiar(d.num, { abre: e.target.checked })}
                />
                {d.nombre}
              </label>
              {f.abre ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${d.nombre}: abre`}
                    value={f.apertura}
                    onChange={(e) => cambiar(d.num, { apertura: e.target.value })}
                    className="min-h-12 rounded-md border-[1.5px] border-n-400 px-3 tabular-nums"
                  />
                  <span className="text-n-600">a</span>
                  <input
                    type="time"
                    aria-label={`${d.nombre}: cierra`}
                    value={f.cierre}
                    onChange={(e) => cambiar(d.num, { cierre: e.target.value })}
                    className="min-h-12 rounded-md border-[1.5px] border-n-400 px-3 tabular-nums"
                  />
                </div>
              ) : (
                <span className="text-n-600">Cerrado</span>
              )}
            </li>
          );
        })}
      </ul>

      {aviso > 0 && (
        <Alert variante="advertencia" titulo="Hay reservas en días que ya no abren">
          {aviso === 1 ? "Queda 1 reserva" : `Quedan ${aviso} reservas`} de hoy en adelante en un día
          cerrado (guardería ese día o salida de hotel ese día). No se cancelaron solas: revísalas en
          Guardería y Hotel.
        </Alert>
      )}

      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" cargando={envio.cargando} onClick={guardar}>
          Guardar horario
        </Button>
      </AccionesFormulario>
    </div>
  );
}
