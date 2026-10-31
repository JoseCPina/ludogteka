import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota } from "@/lib/app/datos";
import { LeerCartilla } from "./leer";

export default async function LeerCartillaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const m = await miMascota(id);
  if (!m) notFound();
  return (
    <>
      <Link href={`/mascotas/${m.id}`} className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← {m.nombre}</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Cartilla por foto</span>
        <h1 className="apd-titulo">{q.nueva ? `Listo, ${m.nombre} ya está aquí` : `La cartilla de ${m.nombre}`}</h1>
        <p className="apd-linea">Tómale foto a su cartilla de papel y la pasamos a limpio: vacunas, desparasitaciones, lotes y fechas. Tú revisas y confirmas; después te avisamos cuando le toque cada dosis.</p>
      </div>
      <section className="apd-seccion">
        <LeerCartilla mascotaId={m.id} nombre={m.nombre} nueva={Boolean(q.nueva)} />
      </section>
    </>
  );
}
