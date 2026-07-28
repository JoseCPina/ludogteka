import { ReactNode } from "react";

type Variante = "error" | "advertencia" | "exito";

const estilos: Record<Variante, { fondo: string; borde: string; texto: string }> = {
  error: { fondo: "bg-naranja-suave", borde: "border-naranja", texto: "text-naranja-oscuro" },
  advertencia: { fondo: "bg-amarillo-suave", borde: "border-amarillo", texto: "text-amarillo-oscuro" },
  exito: { fondo: "bg-verde-suave", borde: "border-verde", texto: "text-verde-oscuro" },
};

export function Alert({
  variante,
  titulo,
  children,
}: {
  variante: Variante;
  titulo: string;
  children?: ReactNode;
}) {
  const s = estilos[variante];
  return (
    <div
      role={variante === "error" ? "alert" : "status"}
      className={`flex gap-3 rounded-md border-l-4 p-4 ${s.fondo} ${s.borde}`}
    >
      <div>
        <strong className={`block ${s.texto}`}>{titulo}</strong>
        {children && <span className="text-sm text-n-700">{children}</span>}
      </div>
    </div>
  );
}
