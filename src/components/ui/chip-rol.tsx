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

export function ChipRol({ rol }: { rol: string }) {
  return (
    <Chip tono={TONO_ROL[rol] ?? "neutro"} punto={false}>
      {ETIQUETAS_ROL[rol] ?? rol}
    </Chip>
  );
}
