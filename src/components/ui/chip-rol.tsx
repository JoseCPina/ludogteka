import { Chip, type TonoChip } from "./chip";

const TONO_ROL: Record<string, TonoChip> = {
  admin: "info",
  recepcion: "exito",
  estetica: "proceso",
  cliente: "neutro",
};

const ETIQUETAS_ROL: Record<string, string> = {
  admin: "Admin",
  recepcion: "Recepción",
  estetica: "Estética",
  cliente: "Cliente",
};

/** `etiqueta`: la que da etiquetaDePersona (un médico con el rol de estética es «Médico veterinario»). */
export function ChipRol({ rol, etiqueta }: { rol: string; etiqueta?: string }) {
  return (
    <Chip tono={TONO_ROL[rol] ?? "neutro"} punto={false}>
      <span data-etiqueta-rol>{etiqueta ?? ETIQUETAS_ROL[rol] ?? rol}</span>
    </Chip>
  );
}
