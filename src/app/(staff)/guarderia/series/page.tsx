import { ListaSeries } from "@/app/(staff)/reservas/modulo/lista-series";
import { MODULOS } from "@/lib/modulos";

export default function GuarderiaSeriesPage() {
  return <ListaSeries modulo={MODULOS.guarderia} />;
}
