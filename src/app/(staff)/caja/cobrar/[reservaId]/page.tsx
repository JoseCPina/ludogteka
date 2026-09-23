import { PantallaCobro } from "@/app/(staff)/reservas/[id]/cobrar/pantalla-cobro";

// El mismo cobro de la reserva, abierto desde el mostrador.
export default async function CobrarDesdeCajaPage({ params }: { params: Promise<{ reservaId: string }> }) {
  const { reservaId } = await params;
  return <PantallaCobro reservaId={reservaId} volverHref="/caja" volverEtiqueta="Caja" />;
}
