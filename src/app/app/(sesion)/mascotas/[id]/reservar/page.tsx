import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota } from "@/lib/app/datos";
import { serviciosApp, datosDeNegociosApp } from "@/lib/app/negocios";
import { hoyNegocio } from "@/lib/formato";
import { Reservar, type NegocioReserva } from "./reservar";

/**
 * Reservar guardería u hotel (App para dueños · Fase 3, pantalla 7; docs/app-duenos/FASE-3.md): servicio → fechas →
 * cupo real por noche (o por día) → «Reservar» → si al negocio le falta su contrato firmado, la firma ahí mismo. La base
 * valida cupo, requisitos, evaluación y traslapes, y aplica el pase si lo hay. Referencia: Mobbin app-reservar-fecha-cupo
 * (Octopus Energy: lo lleno dice «Lleno»; Booking.com) y el bloque multi-step-form de shadcn/studio.
 */
export default async function ReservarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ negocio?: string }> }) {
  const { id } = await params;
  const { negocio: negocioPedido } = await searchParams;
  const m = await miMascota(id);
  if (!m) notFound();
  const datos = await datosDeNegociosApp();
  const negocios: NegocioReserva[] = (
    await Promise.all(
      m.vinculos.map(async (v) => {
        const servicios = (await serviciosApp(v.negocioId)).filter((s) => s.categoria === "guarderia" || s.categoria === "hotel");
        if (servicios.length === 0) return null;
        return {
          id: v.negocioId,
          nombre: v.negocioNombre,
          hoy: hoyNegocio(datos.get(v.negocioId)?.zona ?? "America/Mexico_City"),
          servicios: servicios.map((s) => ({ id: s.id, nombre: s.nombre, categoria: s.categoria, unidad: s.unidad, incluye: s.incluye })),
        };
      })
    )
  ).filter((n): n is NegocioReserva => n !== null);

  return (
    <>
      <Link href={`/mascotas/${m.id}`} className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← {m.nombre}</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Reservar</span>
        <h1 className="apd-titulo">Guardería u hotel para {m.nombre}</h1>
        <p className="apd-linea">Escoge las fechas y te decimos al momento si hay lugar.</p>
      </div>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
        {negocios.length > 0 ? (
          <Reservar mascotaId={m.id} nombre={m.nombre} negocios={negocios} negocioInicial={negocios.some((n) => n.id === negocioPedido) ? negocioPedido! : negocios[0].id} />
        ) : (
          <div className="apd-tarjeta" data-sin-hotel>
            <p style={{ fontWeight: 800 }}>Ningún negocio de {m.nombre} ofrece guardería u hotel aquí</p>
            <p className="apd-nota" style={{ marginTop: "0.3rem" }}>Cuando un negocio donde ya la conocen tenga guardería u hotel con PeluDesk, se reserva desde aquí.</p>
          </div>
        )}
      </section>
    </>
  );
}
