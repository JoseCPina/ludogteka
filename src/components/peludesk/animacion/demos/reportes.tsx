"use client";

import { Pantalla } from "./pantalla";
import { pesosEjemplo, useContador } from "../usar";

const DIAS = [
  ["L", 5200],
  ["M", 6900],
  ["M", 4300],
  ["J", 8100],
  ["V", 9600],
  ["S", 11200],
  ["D", 3300],
] as const;
const MAX = 12000;
const TOTAL = DIAS.reduce((a, [, v]) => a + v, 0);
const DONA = [
  { n: "Estética", v: 40, color: "#4b3f72" },
  { n: "Guardería y hotel", v: 35, color: "#1f6b57" },
  { n: "Veterinaria", v: 25, color: "#f28c82" },
];

export default function DemoReportes() {
  return (
    <Pantalla altura="h-[330px]" tiempos={[300, 1900, 2600]} etiqueta="Ejemplo animado de Reportes: gráfica de barras con los ingresos de la semana, una dona por servicio y cifras que suben hasta su valor.">
      {({ paso, ciclo }) => <Cuerpo key={ciclo} paso={paso} />}
    </Pantalla>
  );
}

function Cuerpo({ paso }: { paso: number }) {
  const total = useContador(TOTAL, paso >= 1, 1300);
  const R = 15.9;
  let acum = 0;
  return (
    <div className="flex h-full flex-col">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">Ingresos de la semana</p>
        <p className="text-2xl font-bold tabular-nums text-n-900">{pesosEjemplo(total)}</p>
      </div>
      <div className="mt-2 grid flex-1 grid-cols-[1fr_auto] items-end gap-4">
        <div className="flex h-[170px] items-end gap-2 border-b border-n-300">
          {DIAS.map(([d, v], i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
              <div
                className={`w-full rounded-t-md bg-morado ${paso >= 1 ? "pd-barra" : "opacity-0"}`}
                style={{ height: `${(v / MAX) * 100}%`, animationDelay: `${i * 90}ms` }}
              />
              <span className="mt-1 text-[10px] font-semibold text-n-600">{d}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2 pb-2">
          <svg viewBox="0 0 36 36" width="104" height="104" className="-rotate-90" aria-hidden="true">
            <circle cx="18" cy="18" r={R} fill="none" stroke="#ebe3d8" strokeWidth="5" />
            {paso >= 2 &&
              DONA.map((s) => {
                const ini = acum;
                acum += s.v;
                return (
                  <circle
                    key={s.n}
                    className="pd-dona"
                    cx="18"
                    cy="18"
                    r={R}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="5"
                    pathLength={100}
                    strokeDasharray={`${s.v - 1} ${101 - s.v}`}
                    strokeDashoffset={-ini}
                    style={{ animationDelay: `${ini * 12}ms` }}
                  />
                );
              })}
          </svg>
          <ul className="flex flex-col gap-0.5">
            {DONA.map((s) => (
              <li key={s.n} className="flex items-center gap-1.5 text-[10px] text-n-700">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.n}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
