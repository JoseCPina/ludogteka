import { PantallaCobro } from "./pantalla-cobro";

export default async function CobrarReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PantallaCobro reservaId={id} volverHref={`/reservas/${id}`} volverEtiqueta="Detalle de la reserva" />;
}
