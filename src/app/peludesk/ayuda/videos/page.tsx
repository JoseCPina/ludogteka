import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AREAS_TUTORIALES, COLUMNAS_TUTORIAL, duracionTexto, tieneVideo, urlArchivoTutorial, type Tutorial } from "@/lib/tutoriales";
import { PieSitio } from "@/components/peludesk/sitio";
import { metaPagina } from "@/lib/peludesk/seo";
import { EncabezadoAyuda } from "../encabezado";

export const metadata: Metadata = metaPagina({
  titulo: "Videos tutoriales — Ayuda de PeluDesk",
  descripcion: "Cómo se hace cada cosa en PeluDesk, paso a paso y con la app de verdad: clientes, estética, guardería, hotel, caja, inventario y más.",
  ruta: "/ayuda/videos",
});
export const dynamic = "force-dynamic";

export default async function VideosPublicos() {
  const { data } = await createSupabaseAdminClient().from("tutoriales").select(COLUMNAS_TUTORIAL).eq("publicado", true).is("deleted_at", null).order("orden");
  const videos = ((data ?? []) as unknown as Tutorial[]).filter(tieneVideo);
  const areas = Object.entries(AREAS_TUTORIALES).map(([clave, nombre]) => ({ clave, nombre, videos: videos.filter((v) => v.area === clave) })).filter((a) => a.videos.length);
  return (
    <div className="min-h-full bg-n-50">
      <EncabezadoAyuda />
      <main id="contenido" className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
        <div>
          <Link href="/ayuda" className="text-sm font-semibold text-morado hover:underline">← Ayuda</Link>
          <h1 className="mt-1 text-3xl font-bold text-n-900">Videos tutoriales</h1>
          <p className="mt-1 max-w-3xl text-n-700">Cómo se hace cada cosa, paso a paso, con la app de verdad.</p>
        </div>
        {areas.length === 0 && <p className="rounded-lg border border-n-200 bg-white p-6 text-n-700">Estamos preparando los videos.</p>}
        {areas.map((a) => (
          <section key={a.clave} className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-n-900">{a.nombre}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {a.videos.map((v) => (
                <li key={v.slug}>
                  <Link href={`/ayuda/videos/${v.slug}`} className="flex h-full gap-3 rounded-lg border border-n-200 bg-white p-3 hover:border-morado">
                    <span className="grid h-16 w-28 flex-none place-items-center overflow-hidden rounded-md bg-n-100">
                      {v.poster_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urlArchivoTutorial(v.poster_path) ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="text-2xl text-morado">▶</span>
                      )}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold text-n-900">{v.titulo}</span>
                      <span className="text-sm text-n-600">{v.resumen}</span>
                      <span className="text-xs text-n-500">{duracionTexto(v.duracion_s)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <PieSitio />
    </div>
  );
}
