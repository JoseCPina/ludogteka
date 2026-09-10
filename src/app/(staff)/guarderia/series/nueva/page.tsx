import { PaginaNuevaSerie } from "@/app/(staff)/reservas/modulo/pagina-nueva-serie";
import { MODULOS } from "@/lib/modulos";

export default function GuarderiaNuevaSeriePage() {
  return <PaginaNuevaSerie modulo={MODULOS.guarderia} />;
}
