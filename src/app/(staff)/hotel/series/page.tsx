import { ListaSeries } from "@/app/(staff)/reservas/modulo/lista-series";
import { MODULOS } from "@/lib/modulos";

export default function HotelSeriesPage() {
  return <ListaSeries modulo={MODULOS.hotel} />;
}
