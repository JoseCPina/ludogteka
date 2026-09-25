import { ReactNode } from "react";
import { conEnlaces } from "./texto-con-enlaces";

type Variante = "error" | "advertencia" | "exito" | "info";

// Como las alertas del UI kit de PeluDesk: fondo suave de la familia y un
// ícono en círculo. El círculo va en el tono OSCURO de la familia con el
// símbolo blanco: en el tono base (menta, coral, ámbar) el símbolo no
// llegaría al 3:1 que pide un gráfico (scripts/diseno/contraste.mjs).
const estilos: Record<Variante, { fondo: string; borde: string; texto: string; circulo: string }> = {
  error: { fondo: "bg-coral-suave", borde: "border-coral", texto: "text-coral-oscuro", circulo: "bg-coral-oscuro" },
  advertencia: { fondo: "bg-ambar-suave", borde: "border-ambar", texto: "text-ambar-oscuro", circulo: "bg-ambar-oscuro" },
  exito: { fondo: "bg-menta-suave", borde: "border-menta", texto: "text-menta-oscuro", circulo: "bg-menta-oscuro" },
  info: { fondo: "bg-morado-suave", borde: "border-morado/30", texto: "text-morado", circulo: "bg-morado" },
};

function Simbolo({ variante }: { variante: Variante }) {
  const trazo = { stroke: "#fff", strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
      {variante === "exito" && <path d="M5 10.5l3.2 3.2L15 6.8" {...trazo} />}
      {variante === "error" && <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" {...trazo} />}
      {variante === "advertencia" && (
        <>
          <path d="M10 5v6" {...trazo} />
          <circle cx="10" cy="14.8" r="1.4" fill="#fff" />
        </>
      )}
      {variante === "info" && (
        <>
          <circle cx="10" cy="5.4" r="1.4" fill="#fff" />
          <path d="M10 9v6" {...trazo} />
        </>
      )}
    </svg>
  );
}

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
      className={`flex gap-3 rounded-lg border p-4 ${s.fondo} ${s.borde}`}
    >
      <span className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full ${s.circulo}`}>
        <Simbolo variante={variante} />
      </span>
      <div>
        <strong className={`block font-semibold ${s.texto}`}>{titulo}</strong>
        {children && <span className="text-sm text-n-700">{conEnlaces(children)}</span>}
      </div>
    </div>
  );
}
