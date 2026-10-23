import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// QA S27: /reservas/estancias/<id> (quitarle «/checkout» al enlace) daba 404. El detalle de una estancia es el de su
// reserva, que lista sus estancias con su check-in, check-out y cobro.
export default async function EstanciaPage({ params }: { params: Promise<{ estanciaId: string }> }) {
  const { estanciaId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("estancias").select("reserva_id").eq("id", estanciaId).maybeSingle();
  if (!data?.reserva_id) notFound();
  redirect(`/reservas/${data.reserva_id}`);
}
