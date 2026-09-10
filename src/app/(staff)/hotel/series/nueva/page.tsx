import { PaginaNuevaSerie } from "@/app/(staff)/reservas/modulo/pagina-nueva-serie";
import { MODULOS } from "@/lib/modulos";

export default function HotelNuevaSeriePage() {
  return <PaginaNuevaSerie modulo={MODULOS.hotel} />;
}
