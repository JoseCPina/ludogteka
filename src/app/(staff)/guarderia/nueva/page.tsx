import { PaginaNuevaReserva } from "@/app/(staff)/reservas/modulo/pagina-nueva";
import { MODULOS } from "@/lib/modulos";

// N121: `?fecha=` (desde el calendario de reservas) deja la entrada en ese día.
export default async function GuarderiaNuevaPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha } = await searchParams;
  return <PaginaNuevaReserva modulo={MODULOS.guarderia} fecha={fecha ?? null} />;
}
