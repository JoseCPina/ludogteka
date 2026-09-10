import { TableroModulo } from "@/app/(staff)/reservas/modulo/tablero";
import { MODULOS } from "@/lib/modulos";

export default function HotelPage() {
  return <TableroModulo modulo={MODULOS.hotel} />;
}
