import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { COLUMNAS_TUTORIAL, duracionTexto, tieneVideo, type Tutorial } from "@/lib/tutoriales";
import { articuloPorSlug } from "@/lib/ayuda";
import { articulosDeVideo } from "@/lib/ayuda/videos";
import { ReproductorTutorial } from "@/components/ayuda/reproductor-tutorial";
import { PieSitio } from "@/components/peludesk/sitio";
import { JsonLd, metaPagina, migas } from "@/lib/peludesk/seo";
import { ldVideo, type TutorialConFecha } from "@/lib/peludesk/ld-ayuda";
import { EncabezadoAyuda } from "../../encabezado";

export const dynamic = "force-dynamic";

async function cargar(slug: string): Promise<{ video: TutorialConFecha; siguiente: Tutorial | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("tutoriales").select(`${COLUMNAS_TUTORIAL}, created_at`).eq("slug", slug).eq("publicado", true).is("deleted_at", null).maybeSingle();
  const video = data as unknown as TutorialConFecha | null;
  if (!video || !tieneVideo(video)) return null;
  // El que sigue en la serie; si ese todavía no está publicado, el siguiente que sí.
  const { data: despues } = await admin.from("tutoriales").select(COLUMNAS_TUTORIAL).eq("publicado", true).is("deleted_at", null).gt("orden", video.orden).order("orden").limit(20);
  const posteriores = ((despues ?? []) as unknown as Tutorial[]).filter(tieneVideo);
  const siguiente = posteriores.find((v) => v.slug === video.siguiente) ?? posteriores[0] ?? null;
  return { video, siguiente };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await cargar((await params).slug);
  return r
    ? { ...metaPagina({ titulo: `${r.video.titulo} — Videos de PeluDesk`, descripcion: r.video.resumen, ruta: `/ayuda/videos/${r.video.slug}` }) }
    : { robots: { index: false } };
}

export default async function VideoPublico({ params }: { params: Promise<{ slug: string }> }) {
  const r = await cargar((await params).slug);
  if (!r) notFound();
  const { video, siguiente } = r;
  const articulos = articulosDeVideo(video.numero).map((s) => articuloPorSlug(s)).filter((a) => a !== null);
  return (
    <div className="min-h-full bg-n-50">
      <JsonLd datos={[{ "@context": "https://schema.org", ...ldVideo(video) }, migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Ayuda", ruta: "/ayuda" }, { nombre: "Videos", ruta: "/ayuda/videos" }, { nombre: video.titulo, ruta: `/ayuda/videos/${video.slug}` }])]} />
      <EncabezadoAyuda />
      <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-8">
        <Link href="/ayuda/videos" className="text-sm font-semibold text-morado hover:underline">← Todos los videos</Link>
        <div>
          <h1 className="text-3xl font-bold text-n-900">{video.titulo}</h1>
          <p className="mt-1 text-n-700">{video.resumen} {video.duracion_s ? `· ${duracionTexto(video.duracion_s)}` : ""}</p>
        </div>
        <ReproductorTutorial t={video} />
        {articulos.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="text-base font-bold text-n-900">Si prefieres leerlo</h2>
            <ul className="list-disc pl-5 text-n-700">
              {articulos.map((a) => (
                <li key={a!.slug}><Link href={`/ayuda/${a!.slug}`} className="font-semibold text-morado hover:underline">{a!.titulo}</Link></li>
              ))}
            </ul>
          </section>
        )}
        {siguiente && (
          <Link href={`/ayuda/videos/${siguiente.slug}`} className="rounded-lg border border-n-200 bg-white p-4 hover:border-morado">
            <span className="text-sm text-n-600">Siguiente video</span>
            <span className="block font-semibold text-n-900">{siguiente.titulo} →</span>
          </Link>
        )}
      </main>
      <PieSitio />
    </div>
  );
}
