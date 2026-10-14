"use client";

import { Pantalla } from "./pantalla";

const CITAS = [
  { hora: "09:00", quien: "Rocky · corte", color: "bg-menta-suave border-menta text-morado" },
  { hora: "10:00", quien: "Luna · baño completo", color: "bg-morado-suave border-morado/30 text-morado" },
  { hora: "11:30", quien: "Max · baño exprés", color: "bg-coral-suave border-coral text-coral-oscuro" },
  { hora: "13:00", quien: "Kira · rapado", color: "bg-ambar-suave border-ambar text-ambar-oscuro" },
];
const TALLAS = ["Chico", "Mediano", "Grande"];
const PELAJES = ["Corto", "Medio", "Largo"];
const PRECIOS = [
  [250, 290, 330],
  [350, 390, 440],
  [490, 540, 600],
];

export default function DemoEstetica() {
  return (
    <Pantalla altura="h-[500px] sm:h-[330px]" tiempos={[300, 1000, 1700, 2400, 3400, 4600]} etiqueta="Ejemplo animado de Estética: la agenda del día con sus citas y la tabla de precios por talla y pelaje.">
      {({ paso, ciclo }) => (
        <div key={ciclo} className="grid h-full gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-n-200 bg-white p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">Agenda de hoy</p>
            <ul className="mt-2 flex flex-col gap-2">
              {CITAS.map((c, i) => (
                <li key={c.hora} className="h-8">
                  {paso >= 1 + i && (
                    <p className={`pd-desliza flex h-8 items-center gap-2 rounded-lg border px-2 text-[11px] font-semibold ${c.color}`}>
                      <span className="tabular-nums">{c.hora}</span>
                      {c.quien}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-dashed border-n-300 bg-white/60 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">Baño completo · precio</p>
            {paso >= 5 && (
              <div className="pd-pop mt-2 overflow-hidden rounded-lg border border-n-200 bg-white text-[11px]">
                <div className="grid grid-cols-4 bg-n-100 font-bold text-n-800">
                  <span className="px-2 py-1">Talla</span>
                  {PELAJES.map((p) => (
                    <span key={p} className="px-2 py-1">{p}</span>
                  ))}
                </div>
                {TALLAS.map((t, r) => (
                  <div key={t} className="grid grid-cols-4 border-t border-n-200 tabular-nums">
                    <span className="px-2 py-1 font-semibold text-n-800">{t}</span>
                    {PRECIOS[r].map((precio, c) => (
                      <span key={c} className={`px-2 py-1 ${r === 1 && c === 1 ? "pd-celda bg-morado font-bold text-white" : "text-n-700"}`}>
                        ${precio}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {paso >= 5 && <p className="pd-entra mt-2 text-[11px] font-semibold text-menta-oscuro">Mediano · pelo medio: $390, sin calcular a mano.</p>}
          </div>
        </div>
      )}
    </Pantalla>
  );
}
