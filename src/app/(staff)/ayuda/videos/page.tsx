import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { AREAS_TUTORIALES, cargarTutorialesVisibles, duracionTexto, urlArchivoTutorial } from "@/lib/tutoriales";

// Los videos tutoriales que esta persona puede ver, por área. Solo lo
// publicado y de los módulos prendidos del negocio.
export default async function VideosPage() {
  const sesion = await obtenerSesionConRol();
  const supabase = await createSupabaseServerClient();
  const videos = await cargarTutorialesVisibles(supabase, { rol: sesion?.rol ?? "", permisos: sesion?.permisos ?? [], modulos: sesion?.modulos ?? [] });
  const areas = Object.entries(AREAS_TUTORIALES).map(([clave, nombre]) => ({ clave, nombre, videos: videos.filter((v) => v.area === clave) })).filter((a) => a.videos.length);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/ayuda" className="text-sm font-semibold text-morado hover:underline">← Ayuda</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Videos</h1>
        <p className="mt-1 text-n-600">Cómo se hace cada cosa, paso a paso, con la app de verdad. Con subtítulos y a la velocidad que quieras.</p>
      </div>

      {videos.length === 0 ? (
        <div data-sin-videos className="rounded-lg border border-n-200 bg-n-50 p-6">
          <p className="font-semibold text-n-900">Estamos preparando los videos.</p>
          <p className="mt-1 text-n-600">Mientras tanto, los artículos de <Link href="/ayuda" className="font-semibold text-morado hover:underline">Ayuda</Link> te explican cada pantalla paso a paso.</p>
        </div>
      ) : (
        areas.map((a) => (
          <section key={a.clave} className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-n-900">{a.nombre}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {a.videos.map((v) => (
                <li key={v.slug}>
                  <Link href={`/ayuda/videos/${v.slug}`} className="flex h-full gap-3 rounded-lg border border-n-200 bg-white p-3 hover:border-morado" data-video={v.numero}>
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
                      {v.duracion_s ? <span className="text-xs text-n-500">{duracionTexto(v.duracion_s)}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
