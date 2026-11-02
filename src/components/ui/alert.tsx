import { ReactNode } from "react";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { conEnlaces } from "./texto-con-enlaces";
import { tituloDeError } from "@/lib/validacion";

type Variante = "error" | "advertencia" | "exito" | "info";

// Como las alertas del UI kit de PeluDesk: fondo suave de la familia y un
// ícono en círculo. El círculo va en el tono OSCURO de la familia con el
// símbolo blanco: en el tono base (menta, coral, ámbar) el símbolo no
// llegaría al 3:1 que pide un gráfico (scripts/diseno/contraste.mjs).
const estilos: Record<Variante, { fondo: string; borde: string; texto: string; circulo: string }> = {
  error: { fondo: "bg-coral-suave", borde: "border-coral/50", texto: "text-coral-oscuro", circulo: "bg-coral-oscuro" },
  advertencia: { fondo: "bg-ambar-suave", borde: "border-ambar/60", texto: "text-ambar-oscuro", circulo: "bg-ambar-oscuro" },
  exito: { fondo: "bg-menta-suave", borde: "border-menta", texto: "text-menta-oscuro", circulo: "bg-menta-oscuro" },
  info: { fondo: "bg-morado-suave", borde: "border-morado/30", texto: "text-morado", circulo: "bg-morado" },
};

// Ícono de lucide por variante, en el tono OSCURO de la familia (sobre el fondo suave pasa 3:1 de sobra).
const ICONOS: Record<Variante, typeof CircleCheck> = { exito: CircleCheck, error: CircleX, advertencia: TriangleAlert, info: Info };
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
  const Icono = ICONOS[variante];
  // Un error de validación no se titula como si el sistema hubiera fallado.
  const tituloFinal = variante === "error" ? tituloDeError(titulo, children) : titulo;
  return (
    <div
      role={variante === "error" ? "alert" : "status"}
      data-slot="alert"
      className={`flex gap-3 rounded-lg border px-4 py-3 ${s.fondo} ${s.borde}`}
    >
      <Icono aria-hidden="true" strokeWidth={2} className={`mt-0.5 size-5 flex-none ${s.texto}`} />
      <div className="min-w-0">
        <strong className={`block font-semibold ${s.texto}`}>{tituloFinal}</strong>
        {children && <span className="text-sm text-n-700">{conEnlaces(children)}</span>}
      </div>
    </div>
  );
}
