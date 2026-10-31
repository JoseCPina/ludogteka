import type { ReactNode } from "react";

/** Una cifra grande con su etiqueta arriba y una nota abajo: el resultado de una herramienta. */
export function Resultado({ etiqueta, valor, unidad, nota, children }: { etiqueta: string; valor: ReactNode; unidad?: string; nota?: ReactNode; children?: ReactNode }) {
  return (
    <div className="hta-aparece">
      <p className="hta-etiqueta">{etiqueta}</p>
      <p className="hta-cifra" data-resultado>
        {valor}
        {unidad && <small> {unidad}</small>}
      </p>
      {nota && <p className="mt-2 max-w-[56ch] text-n-700">{nota}</p>}
      {children}
    </div>
  );
}
