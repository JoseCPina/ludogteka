import { TableroModulo } from "@/app/(staff)/reservas/modulo/tablero";
import { MODULOS } from "@/lib/modulos";

export default function GuarderiaPage() {
  return <TableroModulo modulo={MODULOS.guarderia} />;
}
