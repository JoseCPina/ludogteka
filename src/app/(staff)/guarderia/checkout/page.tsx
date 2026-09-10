import { ListaCheckout } from "@/app/(staff)/reservas/modulo/lista-checkout";
import { MODULOS } from "@/lib/modulos";

export default function GuarderiaCheckoutPage() {
  return <ListaCheckout modulo={MODULOS.guarderia} />;
}
