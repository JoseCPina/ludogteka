import type { ReactNode } from "react";
import { BedDouble, ChevronRight, LogIn, LogOut } from "lucide-react";
import { Enlace } from "@/components/ui/enlace";
import { Tarjeta } from "@/components/ui/tarjeta";

/**
 * Llegan hoy · Se van hoy · Siguen aquí ahora, en UNA tarjeta de tres columnas (docs/diseno/DESIGN.md; bloque
 * `widget-component` de shadcn/studio; Mobbin: Wrike «To do this week» con el conteo en el título y Sweatpals, la lista
 * de check-in del día). Cada renglón lleva al check-in o al check-out de su estancia. Lo usan el tablero del día
 * (recepción) y el de cada módulo (Guardería, Hotel).
 */
export type FilaMovimiento = {
  estancia_id: string;
  reserva_id?: string;
  perro_nombre: string;
  servicio_nombre: string;
  categoria?: string;
};

export function ListaPerros({ filas, vacio, destino, detalle, extra }: { filas: FilaMovimiento[]; vacio: string; destino: (f: FilaMovimiento) => string; detalle?: (f: FilaMovimiento) => string; extra?: (f: FilaMovimiento) => ReactNode }) {
  if (filas.length === 0) return <p className="py-2 text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="-mx-2 flex flex-col">
      {filas.map((f) => (
        <li key={f.estancia_id}>
          <Enlace href={destino(f)} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring" forma="bloque">
            <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full bg-morado-suave text-sm font-bold text-morado">
              {f.perro_nombre.trim().charAt(0).toUpperCase() || "·"}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-semibold text-foreground">{f.perro_nombre}</span>
              <span className="block truncate text-xs text-muted-foreground">{detalle ? detalle(f) : f.servicio_nombre}</span>
            </span>
            {extra?.(f)}
            <ChevronRight aria-hidden="true" className="size-4 flex-none text-n-400" />
          </Enlace>
        </li>
      ))}
    </ul>
  );
}

export function MovimientosDia({
  llegan,
  seVan,
  dentro,
  detalle,
  saldoDe,
}: {
  llegan: FilaMovimiento[];
  seVan: FilaMovimiento[];
  dentro: FilaMovimiento[];
  detalle?: (f: FilaMovimiento) => string;
  /** Cobros parciales: lo que debe la cuenta de quien se va hoy (de cuenta_totales_reserva); sin saldo, nada. */
  saldoDe?: (f: FilaMovimiento) => number | null;
}) {
  const debe = (f: FilaMovimiento) => {
    const s = saldoDe?.(f) ?? 0;
    return s >= 1 ? (
      <span className="flex-none rounded-full bg-coral-suave px-2 py-0.5 text-xs font-semibold tabular-nums text-coral-oscuro" data-debe={s.toFixed(2)}>
        Debe ${s.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    ) : null;
  };
  const columnas: { titulo: string; filas: FilaMovimiento[]; vacio: string; icono: ReactNode; destino: (f: FilaMovimiento) => string; extra?: (f: FilaMovimiento) => ReactNode }[] = [
    { titulo: "Llegan hoy", filas: llegan, vacio: "Nadie más por llegar.", icono: <LogIn />, destino: (f) => `/reservas/estancias/${f.estancia_id}/checkin` },
    { titulo: "Se van hoy", filas: seVan, vacio: "Nadie más por salir.", icono: <LogOut />, destino: (f) => `/reservas/estancias/${f.estancia_id}/checkout`, extra: saldoDe ? debe : undefined },
    { titulo: "Siguen aquí ahora", filas: dentro, vacio: "No hay nadie dentro.", icono: <BedDouble />, destino: (f) => `/reservas/estancias/${f.estancia_id}/checkout` },
  ];
  return (
    <Tarjeta data-movimientos-dia="">
      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
        {columnas.map((col) => (
          <section key={col.titulo} className="flex min-w-0 flex-col">
            <header className="flex items-center gap-2 px-4 pt-3 pb-1 sm:px-5">
              <span aria-hidden="true" className="text-n-500 [&_svg]:size-4">{col.icono}</span>
              <h2 className="text-[0.9375rem] font-semibold text-foreground">{col.titulo}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-n-700">{col.filas.length}</span>
            </header>
            <div className="px-4 pb-3 sm:px-5">
              <ListaPerros filas={col.filas} vacio={col.vacio} destino={col.destino} detalle={detalle} extra={col.extra} />
            </div>
          </section>
        ))}
      </div>
    </Tarjeta>
  );
}
