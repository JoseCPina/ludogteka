import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";
import { firmarRutas, resolverEnlace } from "@/lib/reporte/enlaces";
import { LigaNoDisponible, MarcoLiga } from "@/components/publico/marco-liga";
import { Galeria, type ItemGaleria } from "./galeria";

// Liga pública de una galería de fotos y videos (/f/<token>): sin sesión.
// Solo los archivos de ESA galería que siguen vigentes; nada del dueño.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const negocio = await negocioActual();
  return {
    title: `Fotos y videos · ${negocio.nombre}`,
    robots: { index: false, follow: false },
    openGraph: { title: `Fotos y videos · ${negocio.nombre}`, images: [] },
  };
}

export default async function GaleriaPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const enlace = await resolverEnlace(admin, negocio.id, token, "galeria");

  if (enlace.estado !== "ok" || !enlace.galeria_id) {
    return (
      <MarcoLiga>
        <LigaNoDisponible negocio={negocio.nombre} vencida={enlace.estado === "vencido"} />
      </MarcoLiga>
    );
  }

  const { data: galeria } = await admin
    .from("galerias_perro")
    .select("perro_id")
    .eq("negocio_id", negocio.id)
    .eq("id", enlace.galeria_id)
    .is("deleted_at", null)
    .maybeSingle();
  const perroId = (galeria?.perro_id as string | undefined) ?? null;
  const { data: perro } = perroId
    ? await admin.from("perros").select("nombre").eq("negocio_id", negocio.id).eq("id", perroId).maybeSingle()
    : { data: null };
  const { data: items } = perroId
    ? await admin
        .from("galeria_items")
        .select("orden, media_id")
        .eq("negocio_id", negocio.id)
        .eq("galeria_id", enlace.galeria_id)
        .is("deleted_at", null)
        .order("orden")
    : { data: [] };
  const ids = (items ?? []).map((i) => i.media_id as string);
  const { data: media } =
    perroId && ids.length
      ? await admin
          .from("media_perro")
          .select("id, tipo, path")
          .eq("negocio_id", negocio.id)
          .eq("perro_id", perroId)
          .in("id", ids)
          .eq("estado", "lista")
          .is("quitada_at", null)
          .is("vencida_at", null)
          .is("deleted_at", null)
          .gt("expira_at", new Date().toISOString())
      : { data: [] };
  const porId = new Map((media ?? []).map((m) => [m.id as string, m]));
  const vigentes = ids.map((id) => porId.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  const firmadas = await firmarRutas(admin, vigentes.map((m) => m.path as string));
  const lista: ItemGaleria[] = vigentes.flatMap((m) => {
    const url = firmadas.get(m.path as string);
    return url ? [{ id: m.id as string, tipo: m.tipo as "foto" | "video", url }] : [];
  });
  const nombre = (perro?.nombre as string | undefined) ?? "tu perro";

  if (lista.length === 0) {
    return (
      <MarcoLiga>
        <section role="status" className="rounded-xl border border-n-200 bg-white p-6">
          <h1 className="text-xl font-bold text-n-900">Estas fotos y videos ya se borraron</h1>
          <p className="mt-2 text-n-700">Por privacidad se borran a los pocos días. Pídele a {negocio.nombre} que te los mande de nuevo.</p>
        </section>
      </MarcoLiga>
    );
  }

  return (
    <MarcoLiga>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-n-600">Fotos y videos</p>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">{nombre}</h1>
      </header>
      <Galeria items={lista} perro={nombre} />
      <p className="text-sm text-n-600">Disponible hasta el {formatearFecha(enlace.expira_at, negocio.zona_horaria)}. Después se borran.</p>
    </MarcoLiga>
  );
}
