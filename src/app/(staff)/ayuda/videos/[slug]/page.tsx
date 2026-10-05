import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cargarTutorialesVisibles, duracionTexto } from "@/lib/tutoriales";
import { articuloPorSlug } from "@/lib/ayuda";
import { ReproductorTutorial } from "@/components/ayuda/reproductor-tutorial";

export default async function VideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sesion = await obtenerSesionConRol();
  const supabase = await createSupabaseServerClient();
  const videos = await cargarTutorialesVisibles(supabase, { rol: sesion?.rol ?? "", permisos: sesion?.permisos ?? [], modulos: sesion?.modulos ?? [] });
  const video = videos.find((v) => v.slug === slug);
  if (!video) notFound();
  // El que sigue en la serie; si ese todavía no está (o no es de tus módulos), el siguiente que sí.
  const siguiente = videos.find((v) => v.slug === video.siguiente) ?? videos.find((v) => v.orden > video.orden) ?? null;
  const articulos = video.articulos.map((s) => articuloPorSlug(s)).filter((a) => a !== null);

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <Link href="/ayuda/videos" className="text-sm font-semibold text-morado hover:underline">← Videos</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">{video.titulo}</h1>
        <p className="mt-1 text-n-600">{video.resumen} {video.duracion_s ? `· ${duracionTexto(video.duracion_s)}` : ""}</p>
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
        <Link href={`/ayuda/videos/${siguiente.slug}`} className="rounded-lg border border-n-200 bg-n-50 p-4 hover:border-morado" data-siguiente-video>
          <span className="text-sm text-n-600">Siguiente video</span>
          <span className="block font-semibold text-n-900">{siguiente.titulo} →</span>
        </Link>
      )}
    </div>
  );
}
