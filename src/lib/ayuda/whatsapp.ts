import { ARTICULOS } from "./index";
import { NOMBRE_GRUPO } from "./tipos";

/**
 * La misma documentación del centro de ayuda, para el bot de WhatsApp
 * cuando escribe un admin o alguien del personal: contesta sus dudas de uso
 * con esto y manda el link del artículo público (peludesk.mx/ayuda/…).
 * Va en un bloque aparte del system prompt, en caché.
 */
export function documentacionParaWhatsApp(urlPlataforma: string, videos: { slug: string; articulos: string[] }[] = []): string {
  const videoDe = (slug: string) => {
    const v = videos.find((x) => x.articulos.includes(slug));
    return v ? ` video="${urlPlataforma}/ayuda/videos/${v.slug}"` : "";
  };
  return [
    "=== DOCUMENTACIÓN DE USO (centro de ayuda de PeluDesk) ===",
    "Cuando un admin o alguien del personal pregunte cómo hacer algo en la app, contesta SOLO con lo que dice aquí, en pasos cortos, y termina con UN solo link, en su propio renglón: el del video si el artículo trae «video:», y si no, el del artículo («link:»). Nunca los dos. Si no está aquí, escala.",
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
