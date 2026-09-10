import { PaginaNuevaReserva } from "@/app/(staff)/reservas/modulo/pagina-nueva";
import { MODULOS } from "@/lib/modulos";

export default function GuarderiaNuevaPage() {
  return <PaginaNuevaReserva modulo={MODULOS.guarderia} />;
}
