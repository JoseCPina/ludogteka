"use client";

import { Pantalla } from "./pantalla";

export default function DemoMemoria() {
  return (
    <Pantalla altura="h-[190px] sm:h-[150px]" nota={false} tiempos={[300, 1200, 2000]} etiqueta="Ejemplo animado de la memoria del negocio: una nota que dice Recordado: Firulais no tolera el secador.">
      {({ paso, ciclo }) => (
        <div key={ciclo} className="flex h-full flex-col justify-center gap-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">
            <span className="rounded-full bg-white px-2 py-0.5 text-n-800">Ficha de Firulais</span>
            {paso >= 1 && <span className="pd-entra">Nota del equipo</span>}
          </div>
          {paso >= 2 && (
            <p className="pd-pop flex w-fit max-w-full items-start gap-2 rounded-xl border border-menta bg-menta-suave px-3 py-2.5 text-sm font-semibold text-morado">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-menta-oscuro" />
              <span>
                Recordado: <span className="pd-escribe">Firulais no tolera el secador.</span>
              </span>
            </p>
          )}
          {paso >= 3 && <p className="pd-entra text-[11px] text-n-600">Datos de ejemplo</p>}
        </div>
      )}
    </Pantalla>
  );
}
