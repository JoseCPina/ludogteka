import type { ReactNode } from "react";

// Chip de estado, como "Estados" del UI kit de PeluDesk: fondo suave de la
// familia y texto oscuro de la misma (todas las combinaciones pasan AA:
// scripts/diseno/contraste.mjs). Un punto del tono base para leerlo de un
// vistazo; el estado lo dice el texto, nunca solo el color.
export type TonoChip = "exito" | "pendiente" | "proceso" | "info" | "neutro";

const TONOS: Record<TonoChip, { chip: string; punto: string }> = {
  exito: { chip: "bg-menta-suave text-menta-oscuro", punto: "bg-menta-oscuro" },
  pendiente: { chip: "bg-coral-suave text-coral-oscuro", punto: "bg-coral-oscuro" },
  proceso: { chip: "bg-ambar-suave text-ambar-oscuro", punto: "bg-ambar-oscuro" },
  info: { chip: "bg-morado-suave text-morado", punto: "bg-morado" },
  neutro: { chip: "bg-n-100 text-n-700", punto: "bg-n-500" },
};

export function Chip({ tono = "neutro", punto = true, children, className = "" }: { tono?: TonoChip; punto?: boolean; children: ReactNode; className?: string }) {
  const t = TONOS[tono];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.chip} ${className}`}>
      {punto && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${t.punto}`} />}
      {children}
    </span>
  );
}
