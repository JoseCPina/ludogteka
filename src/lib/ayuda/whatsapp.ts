import { ARTICULOS } from "./index";
import { NOMBRE_GRUPO } from "./tipos";
import { videosDeArticulo } from "./videos";

/**
 * La misma documentación del centro de ayuda, para el bot de WhatsApp
 * cuando escribe un admin o alguien del personal: contesta sus dudas de uso
 * con esto y manda el link del artículo público (peludesk.mx/ayuda/…).
 * Va en un bloque aparte del system prompt, en caché.
 */
export function documentacionParaWhatsApp(urlPlataforma: string, videos: { numero: string; slug: string }[] = []): string {
  // Los videos del artículo (src/lib/ayuda/videos.ts) que ya están publicados, el principal primero.
  const videoDe = (slug: string) => {
    const publicados = videosDeArticulo(slug)
      .map((n) => videos.find((x) => x.numero === n))
      .filter((v): v is { numero: string; slug: string } => Boolean(v));
    return publicados.length ? ` video="${publicados.map((v) => `${urlPlataforma}/ayuda/videos/${v.slug}`).join(" ")}"` : "";
  };
  return [
    "=== DOCUMENTACIÓN DE USO (centro de ayuda de PeluDesk) ===",
    "Cuando un admin o alguien del personal pregunte cómo hacer algo en la app, contesta SOLO con lo que dice aquí, en pasos cortos, y termina con el link del artículo («link:») en su propio renglón. Si el artículo trae «video:», ofrece también el video: una frase corta («También lo tienes en video:») y su link en otro renglón (si trae varios, solo el primero). Un link por mensaje. Si no está aquí, escala.",
    ...ARTICULOS.map((a) =>
      [
        `<articulo titulo="${a.titulo}" tema="${NOMBRE_GRUPO[a.grupo] ?? a.grupo}" link="${urlPlataforma}/ayuda/${a.slug}"${videoDe(a.slug)}>`,
        a.resumen,
        a.cuerpo.trim(),
        "</articulo>",
      ].join("\n")
    ),
  ].join("\n");
}
