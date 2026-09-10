import { ListaCheckout } from "@/app/(staff)/reservas/modulo/lista-checkout";
import { MODULOS } from "@/lib/modulos";

export default function HotelCheckoutPage() {
  return <ListaCheckout modulo={MODULOS.hotel} />;
}
