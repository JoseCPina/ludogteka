import { MarkdownAyuda } from "@/lib/ayuda/markdown";
import type { Articulo } from "@/lib/ayuda";
import type { Tutorial } from "@/lib/tutoriales";
import { VideosDelArticulo } from "./videos-del-articulo";

/** Un artículo de ayuda: título, para qué sirve, la captura del demo y los pasos. */
export function ArticuloAyuda({ articulo, linkDe, videos = [] }: { articulo: Articulo; linkDe?: (href: string) => string; videos?: Tutorial[] }) {
  return (
    <article className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-n-900">{articulo.titulo}</h1>
        <p className="mt-1 text-n-600">{articulo.resumen}</p>
      </div>
      <VideosDelArticulo videos={videos} />
      {articulo.captura && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/ayuda/capturas/${articulo.captura}`}
          alt={`Captura de pantalla: ${articulo.titulo} (negocio de ejemplo)`}
          loading="lazy"
          className="h-auto w-full rounded-lg border border-n-200 bg-white"
        />
      )}
      <MarkdownAyuda texto={articulo.cuerpo} linkDe={linkDe} />
    </article>
  );
}
