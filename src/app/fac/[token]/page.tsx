import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { resolverEnlaceFactura } from "@/components/cfdi/enlace";
import { dinero } from "@/components/cfdi/textos";
import { LigaNoDisponible, MarcoLiga } from "@/components/publico/marco-liga";

// Link público para bajar una factura (PDF y XML): sin sesión, noindex.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const negocio = await negocioActual();
  return { title: `Tu factura · ${negocio.nombre}`, robots: { index: false, follow: false }, openGraph: { title: `Tu factura · ${negocio.nombre}`, images: [] } };
}

export default async function FacturaPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const negocio = await negocioActual();
  const r = await resolverEnlaceFactura(createSupabaseAdminClient(negocio.id), negocio.id, token);
  if (r.estado !== "ok") {
    return (
      <MarcoLiga>
        <LigaNoDisponible negocio={negocio.nombre} vencida={r.estado === "vencido"} />
      </MarcoLiga>
    );
  }
  const f = r.factura;
  return (
    <MarcoLiga>
      <section className="flex flex-col gap-3 rounded-xl border border-n-200 bg-white p-6">
        <h1 className="text-xl font-bold text-n-900">Tu factura {`${f.serie ?? ""}${f.folio ?? ""}`}</h1>
        <p className="text-n-700">
          Factura de {negocio.nombre} por {dinero(f.total)}. Descarga el PDF para verla y el XML para tu contador.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href={`/fac/${token}/pdf`} className="inline-flex min-h-12 items-center rounded-md bg-morado px-4 font-semibold text-white hover:bg-morado-oscuro">
            Descargar PDF
          </a>
          <a href={`/fac/${token}/xml`} className="inline-flex min-h-12 items-center rounded-md border-[1.5px] border-borde bg-white px-4 font-semibold text-n-900 hover:bg-n-100">
            Descargar XML
          </a>
        </div>
      </section>
    </MarcoLiga>
  );
}
