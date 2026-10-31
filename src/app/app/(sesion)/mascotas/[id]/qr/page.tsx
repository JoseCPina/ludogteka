import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota } from "@/lib/app/datos";
import { urlApp } from "@/lib/negocio/host";
import { QrPlaca } from "./qr";

export default async function QrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await miMascota(id);
  if (!m) notFound();
  return (
    <>
      <Link href={`/mascotas/${m.id}`} className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← {m.nombre}</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Su placa</span>
        <h1 className="apd-titulo">El QR de {m.nombre}</h1>
        <p className="apd-linea">Para su placa o su collar. Si se llega a perder, quien la encuentre te escribe desde ahí.</p>
      </div>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
        <QrPlaca url={`${urlApp()}/m/${m.tokenPublico}`} nombre={m.nombre} />
      </section>
    </>
  );
}
