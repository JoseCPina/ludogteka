import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { formatearFechaCalendario } from "@/lib/formato";
import { hashDeToken, tokenPlausible } from "@/lib/reporte/enlaces";
import { LigaNoDisponible, MarcoLiga } from "@/components/publico/marco-liga";

// Carnet verificable (/c/<token>): sin sesión. Solo el nombre de la mascota, el de su
// dueño, las vacunas vigentes y el negocio que lo emite. Nada de dinero ni datos clínicos.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const negocio = await negocioActual();
  return {
    title: `Carnet verificable · ${negocio.nombre}`,
    robots: { index: false, follow: false },
    openGraph: { title: `Carnet verificable · ${negocio.nombre}`, images: [] },
  };
}

type Publico = {
  mascota: string;
  especie: string | null;
  dueno: string;
  negocio: string;
  consultado: string;
  vacunas: { biologico: string; fecha_aplicacion: string; vigente_hasta: string }[];
};

export default async function CarnetPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const negocio = await negocioActual();
  let datos: Publico | null = null;
  if (tokenPlausible(token)) {
    const admin = createSupabaseAdminClient(negocio.id);
    const { data } = await admin.rpc("carnet_publico", { p_token_hash: hashDeToken(token) });
    datos = (data as Publico | null) ?? null;
  }
  if (!datos) {
    return (
      <MarcoLiga>
        <LigaNoDisponible negocio={negocio.nombre} vencida={false} />
      </MarcoLiga>
    );
  }
  return (
    <MarcoLiga>
      <article className="flex flex-col gap-4 rounded-xl border border-n-200 bg-white p-5">
        <header>
          <p className="text-xs font-bold uppercase tracking-wide text-menta-oscuro">Carnet verificado por {datos.negocio}</p>
          <h1 className="mt-1 text-3xl font-bold text-n-900">{datos.mascota}</h1>
          <p className="text-n-700">
            {datos.especie === "gato" ? "Gato" : datos.especie === "otro" ? "Otra especie" : "Perro"} · de {datos.dueno}
          </p>
        </header>
        <section>
          <h2 className="mb-2 text-lg font-bold text-n-900">Vacunas vigentes</h2>
          {datos.vacunas.length === 0 ? (
            <p className="text-n-700">No tiene vacunas vigentes registradas al {formatearFechaCalendario(datos.consultado)}.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-n-200">
              {datos.vacunas.map((v, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span className="font-semibold text-n-900">{v.biologico}</span>
                  <span className="text-sm text-n-700">
                    aplicada el {formatearFechaCalendario(v.fecha_aplicacion)} · vigente hasta {formatearFechaCalendario(v.vigente_hasta)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="text-xs text-n-500">Consultado el {formatearFechaCalendario(datos.consultado)}. Lo emite {datos.negocio}; la información es la que tiene registrada hoy.</p>
      </article>
    </MarcoLiga>
  );
}
