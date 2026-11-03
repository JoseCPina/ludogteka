import Link from "next/link";
import { notFound } from "next/navigation";
import { contratosPorFirmarApp, vinculosApp } from "@/lib/app/negocios";
import { FirmarContratoApp } from "@/components/app/firmar-contrato-app";
import { nombreDeContrato } from "@/lib/app/contratos-texto";

/** Leer y firmar un contrato (App para dueños · Fase 3, pantalla 3). Solo de un negocio donde la persona tiene vínculo. */
export default async function ContratoPage({ params }: { params: Promise<{ negocio: string; id: string }> }) {
  const { negocio, id } = await params;
  const [vinculos, pendientes] = await Promise.all([vinculosApp(), contratosPorFirmarApp()]);
  const v = vinculos.find((x) => x.negocioId === negocio);
  if (!v) notFound();
  const c = pendientes.find((x) => x.id === id && x.negocioId === negocio);
  return (
    <>
      <Link href="/contratos" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Contratos</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>{v.negocioNombre}</span>
        <h1 className="apd-titulo">{c ? nombreDeContrato(c.tipoNombre) : "Contrato"}</h1>
      </div>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
        <FirmarContratoApp negocioId={negocio} contratoId={id} tipoNombre={c?.tipoNombre ?? "este negocio"} />
      </section>
    </>
  );
}
