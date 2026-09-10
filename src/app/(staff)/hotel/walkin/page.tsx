import { PaginaNuevaReserva } from "@/app/(staff)/reservas/modulo/pagina-nueva";
import { MODULOS } from "@/lib/modulos";

export default function HotelWalkinPage() {
  return <PaginaNuevaReserva modulo={MODULOS.hotel} esWalkin />;
}
