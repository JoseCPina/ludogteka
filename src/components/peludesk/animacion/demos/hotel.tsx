"use client";

import { Pantalla } from "./pantalla";
import { useContador } from "../usar";

// Tablero de cupo: los mosaicos aparecen con escala de 0.7 a 1; después un
// check-in ocupa un lugar y un check-out lo libera.
const LUGARES = 12;
const OCUPADOS = [0, 1, 3, 4, 6, 8, 9];
const ENTRA = 5; // lugar que ocupa el check-in
const SALE = 3; // lugar que libera el check-out

export default function DemoHotel() {
  return (
    <Pantalla altura="h-[300px]" tiempos={[300, 2200, 3300, 4600]} etiqueta="Ejemplo animado de Hotel y guardería: tablero de cupo, un check-in que ocupa un lugar y un check-out que lo libera.">
      {({ paso, ciclo }) => {
        const ocupa = (i: number) => {
          let o = OCUPADOS.includes(i);
          if (i === ENTRA && paso >= 3) o = true;
          if (i === SALE && paso >= 4) o = false;
          return o;
        };
        const total = Array.from({ length: LUGARES }, (_, i) => i).filter(ocupa).length;
        return <Tablero paso={paso} ciclo={ciclo} total={total} ocupa={ocupa} />;
      }}
    </Pantalla>
  );
}

function Tablero({ paso, ciclo, total, ocupa }: { paso: number; ciclo: number; total: number; ocupa: (i: number) => boolean }) {
  const n = useContador(total, paso >= 2, 600);
  return (
    <div key={ciclo} className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">Cupo de hoy</p>
        <p className="text-sm font-bold tabular-nums text-n-900">
          {paso >= 2 ? Math.round(n) : 0} / {LUGARES}
        </p>
      </div>
      <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {Array.from({ length: LUGARES }, (_, i) => (
          <li key={i} className="aspect-[5/3]">
            {paso >= 1 && (
              <div
                className={`pd-mosaico flex h-full items-center justify-center rounded-lg border text-[10px] font-bold ${ocupa(i) ? "border-menta bg-menta-suave text-menta-oscuro" : "border-dashed border-n-300 bg-white/70 text-n-500"}`}
                style={{ animationDelay: `${i * 70}ms`, transition: "background-color 300ms, border-color 300ms" }}
              >
                {ocupa(i) ? "Ocupado" : "Libre"}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col gap-1.5">
        {paso >= 3 && (
          <p className="pd-pop rounded-lg bg-white px-3 py-1.5 text-xs text-n-800">
            <span className="font-bold text-menta-oscuro">Check-in</span> · Rocky llegó a las 9:05
          </p>
        )}
        {paso >= 4 && (
          <p className="pd-pop rounded-lg bg-white px-3 py-1.5 text-xs text-n-800">
            <span className="font-bold text-morado">Check-out</span> · Nala se va a las 18:30
          </p>
        )}
      </div>
    </div>
  );
}
