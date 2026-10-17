import Link from "next/link";
import { duracionTexto, type Tutorial } from "@/lib/tutoriales";
import { videosDeArticulo } from "@/lib/ayuda/videos";
import { ReproductorTutorial } from "./reproductor-tutorial";

/** Los videos publicados de un artículo, en el orden del mapeo (src/lib/ayuda/videos.ts). Los que el negocio no puede ver ya vienen filtrados en `disponibles`. */
export function videosParaArticulo(slug: string, disponibles: Tutorial[]): Tutorial[] {
  return videosDeArticulo(slug)
    .map((n) => disponibles.find((t) => t.numero === n))
    .filter((t): t is Tutorial => Boolean(t));
}

/**
 * El video (o los videos) que explican un artículo: arriba del texto, cada uno con su título y su duración, en el
 * reproductor de los tutoriales. Un video «por actualizar» sigue mostrándose con la versión publicada. Sin videos
 * no pinta nada.
 */
export function VideosDelArticulo({ videos }: { videos: Tutorial[] }) {
  if (videos.length === 0) return null;
  return (
    <section className="flex flex-col gap-4" data-videos-del-articulo aria-label={videos.length === 1 ? "Video de este artículo" : "Videos de este artículo"}>
      {videos.map((v) => (
        <div key={v.slug} className="flex flex-col gap-2" data-video-del-articulo={v.numero}>
          <p className="text-base font-bold text-n-900">
            <Link href={`/ayuda/videos/${v.slug}`} className="hover:underline">{v.titulo}</Link>
            {v.duracion_s ? <>{" "}<span className="ml-1 text-sm font-normal text-n-600">· {duracionTexto(v.duracion_s)}</span></> : null}
          </p>
          <ReproductorTutorial t={v} />
        </div>
      ))}
    </section>
  );
}
