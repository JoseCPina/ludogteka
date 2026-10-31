"use client";

import { useId } from "react";

/** Un grupo de opciones excluyentes (giro, servicio, talla) como pastillas; accesible como grupo de radios. */
export function Selector<T extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
  nombre,
}: {
  etiqueta: string;
  opciones: { clave: T; nombre: string; detalle?: string }[];
  valor: T | null;
  onChange: (v: T) => void;
  nombre?: string;
}) {
  const id = useId();
  return (
    <div>
      <p id={id} className="hta-etiqueta">{etiqueta}</p>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2" data-selector={nombre}>
        {opciones.map((o) => (
          <button key={o.clave} type="button" role="radio" aria-checked={valor === o.clave} className="hta-opcion" onClick={() => onChange(o.clave)} data-sin-bloqueo>
            {o.nombre}
            {o.detalle && <small>{o.detalle}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}
