import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";
import { firmarRutas, resolverEnlace } from "@/lib/reporte/enlaces";
import { LigaNoDisponible, MarcoLiga } from "@/components/publico/marco-liga";

// Liga pública del reporte de comportamiento (/r/<token>): sin sesión. Solo
// muestra la tarjeta, el nombre del perro y la fecha; nada del dueño, de
// otros perros ni de dinero. El token se valida contra ESTE negocio.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const negocio = await negocioActual();
  return {
    title: `Reporte del día · ${negocio.nombre}`,
    robots: { index: false, follow: false },
    openGraph: { title: `Reporte del día · ${negocio.nombre}`, images: [] },
  };
}

export default async function ReportePublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const enlace = await resolverEnlace(admin, negocio.id, token, "reporte");

  if (enlace.estado !== "ok" || !enlace.reporte_id) {
    return (
      <MarcoLiga>
        <LigaNoDisponible negocio={negocio.nombre} vencida={enlace.estado === "vencido"} />
      </MarcoLiga>
    );
  }

  const { data: reporte } = await admin
    .from("reportes_guarderia")
    .select("perro_id, fecha, tarjeta_path, tarjeta_vencida_at")
    .eq("negocio_id", negocio.id)
    .eq("id", enlace.reporte_id)
    .is("deleted_at", null)
    .maybeSingle();
  const { data: perro } = reporte
    ? await admin.from("perros").select("nombre").eq("negocio_id", negocio.id).eq("id", reporte.perro_id as string).maybeSingle()
    : { data: null };

  const ruta = reporte && !reporte.tarjeta_vencida_at ? (reporte.tarjeta_path as string | null) : null;
  const nombre = (perro?.nombre as string | undefined) ?? "tu perro";
  const [vista, descarga] =
    reporte && ruta
      ? await Promise.all([
          firmarRutas(admin, [ruta]),
          firmarRutas(admin, [ruta], { descargar: `reporte-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg` }),
        ])
      : [new Map<string, string>(), new Map<string, string>()];
  const urlVista = ruta ? vista.get(ruta) : undefined;
  if (!reporte || !ruta || !urlVista) {
    return (
      <MarcoLiga>
        <LigaNoDisponible negocio={negocio.nombre} vencida />
      </MarcoLiga>
    );
  }

  return (
    <MarcoLiga>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-n-600">Reporte del día</p>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">{nombre}</h1>
        <p className="text-n-700">{formatearFechaCalendario(reporte.fecha as string)}</p>
      </header>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urlVista}
        alt={`Reporte de comportamiento de ${nombre}, ${formatearFechaCalendario(reporte.fecha as string)}`}
        width={1080}
        height={1350}
        className="h-auto w-full rounded-xl border border-n-200 bg-white shadow-sm"
      />
      {descarga.get(ruta) && (
        <a
          href={descarga.get(ruta)}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-morado px-5 font-semibold text-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
        >
          Guardar imagen
        </a>
      )}
      <p className="text-sm text-n-600">Disponible hasta el {formatearFecha(enlace.expira_at, negocio.zona_horaria)}.</p>
    </MarcoLiga>
  );
}
