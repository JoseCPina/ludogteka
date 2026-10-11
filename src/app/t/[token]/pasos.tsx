import type { ReactNode } from "react";

/** Un paso de la teleconsulta: número, estado y, si falta, lo que hay que hacer. */
export function Paso({ numero, titulo, hecho, detalle, children }: { numero: number; titulo: string; hecho: boolean; detalle: string; children?: ReactNode }) {
  return (
    <li className={`flex flex-col gap-3 rounded-xl border p-4 ${hecho ? "border-menta bg-menta-suave" : "border-n-200 bg-white"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${hecho ? "bg-menta-oscuro text-white" : "bg-n-100 text-n-700"}`}>
          {hecho ? "✓" : numero}
        </span>
        <div>
          <h2 className="text-lg font-bold text-n-900">{titulo}</h2>
          <p className="text-n-700">{detalle}</p>
        </div>
      </div>
      {children}
    </li>
  );
}
