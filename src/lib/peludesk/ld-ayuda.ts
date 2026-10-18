import type { Articulo } from "@/lib/ayuda";
import { textoPlano } from "@/lib/ayuda";
import { urlArchivoTutorial, type Tutorial } from "@/lib/tutoriales";
import { SITIO } from "@/lib/peludesk/seo";

/** Un video con la fecha de alta que usa uploadDate. */
export type TutorialConFecha = Tutorial & { created_at?: string | null };

const iso8601 = (s: number) => `PT${Math.floor(s / 60)}M${Math.round(s % 60)}S`;

/** VideoObject de un tutorial publicado. */
export function ldVideo(v: TutorialConFecha) {
  const archivo = urlArchivoTutorial(v.video_path);
  const poster = urlArchivoTutorial(v.poster_path);
  return {
    "@type": "VideoObject",
    name: v.titulo,
    description: v.resumen || v.descripcion,
    inLanguage: "es-MX",
    ...(poster ? { thumbnailUrl: [poster] } : {}),
    ...(v.created_at ? { uploadDate: v.created_at } : {}),
    ...(v.duracion_s ? { duration: iso8601(v.duracion_s) } : {}),
    ...(archivo ? { contentUrl: archivo } : {}),
    ...(v.youtube_id ? { embedUrl: `https://www.youtube-nocookie.com/embed/${v.youtube_id}` } : {}),
    url: `${SITIO}/ayuda/videos/${v.slug}`,
  };
}

/** Pasos numerados del cuerpo del artículo (para HowTo). */
export function pasosDe(a: Articulo): { name: string; text: string }[] {
  const pasos: { name: string; text: string }[] = [];
  for (const linea of a.cuerpo.split("\n")) {
    const m = linea.match(/^\s*\d+\.\s+(.*\S)\s*$/);
    if (!m) continue;
    const text = m[1].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*`]/g, "").trim();
    const corte = text.search(/[.:;]/);
    pasos.push({ name: (corte > 8 && corte < 90 ? text.slice(0, corte) : text.slice(0, 80)).trim(), text });
  }
  return pasos;
}

/** HowTo si el artículo trae pasos numerados; si no, Article. Con video, lo incluye. */
export function ldArticuloAyuda(a: Articulo, videos: TutorialConFecha[] = []) {
  const url = `${SITIO}/ayuda/${a.slug}`;
  const base = {
    "@context": "https://schema.org",
    name: a.titulo,
    description: a.resumen,
    url,
    inLanguage: "es-MX",
    mainEntityOfPage: url,
    image: a.captura ? [`${SITIO}/ayuda/capturas/${a.captura}`] : [`${SITIO}/peludesk/capturas/tablero-escritorio-1600.webp`],
    publisher: { "@id": `${SITIO}/#organizacion` },
    author: { "@id": `${SITIO}/#organizacion` },
    ...(videos.length ? { video: videos.map(ldVideo) } : {}),
  };
  const pasos = pasosDe(a);
  if (pasos.length >= 2) {
    return { ...base, "@type": "HowTo", step: pasos.map((p, i) => ({ "@type": "HowToStep", position: i + 1, name: p.name, text: p.text })) };
  }
  return { ...base, "@type": "Article", headline: a.titulo.slice(0, 110), articleBody: textoPlano(a).slice(0, 600) };
}
