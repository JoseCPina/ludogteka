"use client";

import { Pantalla } from "./pantalla";
import { pesosEjemplo, useContador } from "../usar";

const COBROS: [string, string, number][] = [
  ["Luna", "Baño completo · efectivo", 390],
  ["Rocky", "Hotel, 2 noches · tarjeta", 540],
  ["Max", "Consulta · transferencia", 450],
  ["Kira", "Guardería · efectivo", 350],
];
const ESPERADO = 1730;

export default function DemoCobros() {
  return (
    <Pantalla altura="h-[470px] sm:h-[330px]" tiempos={[300, 1000, 1700, 2400, 3300, 4300]} etiqueta="Ejemplo animado de Cobros: una lista de cobros con su palomita y un corte de caja que cuadra sin diferencia.">
      {({ paso, ciclo }) => <Cuerpo key={ciclo} paso={paso} />}
    </Pantalla>
  );
}

function Cuerpo({ paso }: { paso: number }) {
  const contado = useContador(ESPERADO, paso >= 5, 900);
  return (
    <div className="grid h-full gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-n-200 bg-white p-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">Cobros del turno</p>
        <ul className="mt-2 flex flex-col gap-2">
          {COBROS.map(([quien, que, monto], i) => (
            <li key={quien} className="h-9">
              {paso >= 1 + i && (
                <div className="flex h-9 items-center gap-2">
                  <span className="pd-pop-check flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-menta-oscuro text-white">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[11px] text-n-800">
                    <span className="font-bold">{quien}</span> · {que}
                  </p>
                  <span className="text-xs font-bold tabular-nums text-n-900">${monto}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-dashed border-n-300 bg-white/60 p-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">Corte de caja</p>
        {paso >= 5 && (
          <div className="pd-pop mt-2 rounded-lg border border-n-200 bg-white p-3 text-xs">
            <p className="flex justify-between text-n-700">
              Esperado <span className="font-bold tabular-nums text-n-900">{pesosEjemplo(ESPERADO)}</span>
            </p>
            <p className="mt-1 flex justify-between text-n-700">
              Contado <span className="font-bold tabular-nums text-n-900">{pesosEjemplo(contado)}</span>
            </p>
            <p className="mt-1 flex justify-between border-t border-n-200 pt-1 text-n-700">
              Diferencia <span className="font-bold tabular-nums text-n-900">$0</span>
            </p>
          </div>
        )}
        {paso >= 6 && (
          <p className="pd-pop mt-3 inline-flex items-center gap-1.5 rounded-full bg-menta-suave px-3 py-1 text-xs font-bold text-menta-oscuro">
            <span className="pd-pop-check flex h-4 w-4 items-center justify-center rounded-full bg-menta-oscuro text-white">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            Caja cuadrada
          </p>
        )}
      </div>
    </div>
  );
}
