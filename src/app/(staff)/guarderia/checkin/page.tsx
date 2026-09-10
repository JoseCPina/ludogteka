import { ListaCheckin } from "@/app/(staff)/reservas/modulo/lista-checkin";
import { MODULOS } from "@/lib/modulos";

export default function GuarderiaCheckinPage() {
  return <ListaCheckin modulo={MODULOS.guarderia} />;
}
