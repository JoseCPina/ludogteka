import { formatearDiaSemana } from "@/lib/formato";
import type { ModuloEstancia } from "@/lib/modulos";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilaCalendario = {
  fecha: string;
  cupo_diurno: number | null;
  ocupado_diurno: number;
  disponible_diurno: number | null;
  cupo_nocturno: number | null;
  ocupado_nocturno: number;
  disponible_nocturno: number | null;
  cupo_estado: string;
};

// La ocupación es de TODA la casa en los dos módulos, a propósito. El cupo es del mismo espacio físico: si el módulo de
// guardería mostrara solo a los perros de guardería (10/35 cuando además hay 8 de hotel adentro), recepción
// sobrevendería creyendo que le quedan 25 lugares.
//
// El desglose por categoría no necesita ningún dato nuevo: `estancias` solo admite guardería y hotel, `ocupado_diurno`
// las cuenta a las dos y `ocupado_nocturno` solo a hotel — así que lo de guardería ese día es la resta.
function desglose(fila: FilaCalendario) {
  return {
    hotel: fila.ocupado_nocturno,
    guarderia: Math.max(fila.ocupado_diurno - fila.ocupado_nocturno, 0),
  };
}

/**
 * Una barra de ocupación contra el cupo (Mobbin: Luma «At a Glance», conteo grande, capacidad y barra). Lleno o sin
 * cupo configurado se DICE con texto, no solo con el color.
 */
function Barra({ etiqueta, icono, ocupado, cupo, disponible }: { etiqueta: string; icono: React.ReactNode; ocupado: number; cupo: number | null; disponible: number | null }) {
  const sinCupo = cupo === null || disponible === null;
  const lleno = !sinCupo && disponible <= 0;
  const pct = sinCupo || !cupo ? 0 : Math.min(100, Math.round((ocupado / cupo) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="flex items-center gap-1 font-medium text-muted-foreground [&_svg]:size-3.5">
          {icono}
          {etiqueta}
        </span>
        {sinCupo ? (
          <span className="font-semibold text-coral-oscuro">Sin configurar</span>
        ) : (
          <span className={cn("font-semibold tabular-nums", lleno ? "text-coral-oscuro" : "text-n-700")}>
            {ocupado}/{cupo}
            {lleno && <span className="ml-1 font-bold">· Lleno</span>}
          </span>
        )}
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", lleno ? "bg-coral-oscuro" : pct >= 80 ? "bg-ambar" : "bg-menta-oscuro")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TablaOcupacion({ filas, modulo }: { filas: FilaCalendario[]; modulo: ModuloEstancia }) {
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="ocupacion-casa">
      <div>
        <h2 id="ocupacion-casa" className="text-lg font-semibold text-foreground">
          Ocupación de la casa
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Estos números son de <strong className="font-semibold text-n-700">toda la casa</strong>, no solo de {modulo.etiqueta.toLowerCase()}: guardería y hotel
          comparten el mismo espacio. Diurno lo consumen los dos; nocturno solo hotel — un día puede tener lugar de día y estar lleno de noche.
        </p>
      </div>
      {/* Rediseño (bloque statistics-component; Mobbin: Turo, el día en su círculo con el de hoy relleno, y Luma, la
          barra contra el cupo): 14 días en una cuadrícula que en el celular se acomoda en dos columnas (QA S27: nada
          se recorta ni se desliza de lado). */}
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7" data-ocupacion-movil>
        {filas.map((d, i) => {
          const { hotel, guarderia } = desglose(d);
          const dia = Number(d.fecha.slice(8, 10));
          return (
            <li key={d.fecha} className={cn("flex flex-col gap-2.5 rounded-lg border bg-card p-3 shadow-tarjeta", i === 0 ? "border-primary/40" : "border-border")}>
              <div className="flex items-center gap-2">
                <span className={cn("grid size-8 flex-none place-items-center rounded-full text-sm font-bold tabular-nums", i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{dia}</span>
                <span className="text-sm font-medium capitalize text-n-700">{i === 0 ? "Hoy" : formatearDiaSemana(d.fecha)}</span>
              </div>
              <Barra etiqueta="Diurno (toda la casa)" icono={<Sun />} ocupado={d.ocupado_diurno} cupo={d.cupo_diurno} disponible={d.disponible_diurno} />
              <p className="-mt-1.5 text-[0.6875rem] text-muted-foreground">
                <span className={modulo.categoria === "guarderia" ? "font-bold text-n-700" : ""}>{guarderia} guardería</span>
                {" · "}
                <span className={modulo.categoria === "hotel" ? "font-bold text-n-700" : ""}>{hotel} hotel</span>
              </p>
              <Barra etiqueta="Nocturno (hotel)" icono={<Moon />} ocupado={d.ocupado_nocturno} cupo={d.cupo_nocturno} disponible={d.disponible_nocturno} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
