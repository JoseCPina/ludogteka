import type { Metadata } from "next";
import { REDES_PELUDESK } from "@/lib/peludesk/landing";

/**
 * SEO de peludesk.mx: el host canónico es UNO (https://peludesk.mx; www
 * redirige en el middleware) y toda página pública se describe con metaPagina
 * para que title, descripción, canonical, Open Graph y robots salgan iguales.
 * El resto de la plataforma (/plataforma, /demo, /api) sigue en noindex.
 */
export const SITIO = "https://peludesk.mx";
export const IMAGEN_SOCIAL = { url: "/peludesk/capturas/tablero-escritorio-1600.webp", width: 1600, height: 1000 };

type Opciones = {
  titulo: string;
  descripcion: string;
  ruta: string;
  imagen?: { url: string; width?: number; height?: number; alt?: string };
  tipo?: "website" | "article";
  publicado?: string;
  actualizado?: string;
  seccion?: string;
  indexar?: boolean;
};

export function metaPagina(o: Opciones): Metadata {
  const imagen = o.imagen ?? IMAGEN_SOCIAL;
  return {
    metadataBase: new URL(SITIO),
    title: { absolute: o.titulo },
    description: o.descripcion,
    alternates: { canonical: o.ruta },
    robots: o.indexar === false ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: o.titulo,
      description: o.descripcion,
      url: o.ruta,
      siteName: "PeluDesk",
      locale: "es_MX",
      type: o.tipo ?? "website",
      images: [imagen],
      ...(o.tipo === "article"
        ? { publishedTime: o.publicado, modifiedTime: o.actualizado ?? o.publicado, section: o.seccion, authors: ["PeluDesk"] }
        : {}),
    },
    twitter: { card: "summary_large_image", title: o.titulo, description: o.descripcion, images: [imagen.url] },
  };
}

export const ORGANIZACION = {
  "@type": "Organization",
  "@id": `${SITIO}/#organizacion`,
  name: "PeluDesk",
  url: SITIO,
  logo: `${SITIO}/marca/peludesk/favicon-180.png`,
  sameAs: REDES_PELUDESK.map((r) => r.url),
};

export function JsonLd({ datos }: { datos: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, "\\u003c") }} />;
}

export function migas(items: { nombre: string; ruta: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.nombre, item: `${SITIO}${it.ruta}` })),
  };
}

export function preguntasFrecuentes(preguntas: readonly (readonly [string, string])[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "es-MX",
    mainEntity: preguntas.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}
