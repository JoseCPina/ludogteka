import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { ENCABEZADOS_NEGOCIO, ENCABEZADO_PLATAFORMA } from "@/lib/negocio/resolver";
import { SLUG_DEMO } from "@/lib/peludesk/landing";
import { ARTICULOS } from "@/lib/ayuda";
import { CATEGORIAS, POR_PAGINA, todosLosArticulos } from "@/lib/peludesk/blog";
import { SLUGS_ATERRIZAJE } from "@/lib/peludesk/aterrizajes";
import { DOCUMENTOS_LEGALES } from "@/lib/peludesk/legal";
import { SITIO } from "@/lib/peludesk/seo";

const fechaIso = (v: string) => new Date(`${v}T12:00:00Z`);

// peludesk.mx: solo páginas públicas e indexables (nada de /plataforma,
// /demo, /peludesk/redes ni /api). Una sola versión del host, el canónico.
function sitemapPlataforma(): MetadataRoute.Sitemap {
  const arts = todosLosArticulos();
  const ultimaEntrada = arts.map((a) => a.actualizado).sort().at(-1);
  const paginas = Math.ceil(arts.length / POR_PAGINA);
  const categoriasUsadas = (Object.keys(CATEGORIAS) as (keyof typeof CATEGORIAS)[]).filter((c) => arts.some((a) => a.categoria === c));
  return [
    { url: `${SITIO}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITIO}/registro`, changeFrequency: "monthly", priority: 0.8 },
    ...SLUGS_ATERRIZAJE.map((s) => ({ url: `${SITIO}/${s}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: `${SITIO}/blog`, lastModified: ultimaEntrada ? fechaIso(ultimaEntrada) : undefined, changeFrequency: "weekly", priority: 0.7 },
    ...Array.from({ length: Math.max(0, paginas - 1) }, (_, i) => ({ url: `${SITIO}/blog/pagina/${i + 2}`, changeFrequency: "weekly" as const, priority: 0.4 })),
    ...categoriasUsadas.map((c) => ({ url: `${SITIO}/blog/categoria/${c}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...arts.map((a) => ({ url: `${SITIO}/blog/${a.slug}`, lastModified: fechaIso(a.actualizado), changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITIO}/ayuda`, changeFrequency: "monthly", priority: 0.5 },
    ...ARTICULOS.map((a) => ({ url: `${SITIO}/ayuda/${a.slug}`, changeFrequency: "monthly" as const, priority: 0.4 })),
    ...Object.values(DOCUMENTOS_LEGALES).map((d) => ({ url: `${SITIO}${d.ruta}`, lastModified: fechaIso(d.version), changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  if (h.get(ENCABEZADO_PLATAFORMA) === "1") return sitemapPlataforma();
  if (h.get(ENCABEZADOS_NEGOCIO.slug) === SLUG_DEMO) return [];
  const negocio = await cargarNegocioLanding();
  const url = (negocio.landing?.url_publica ?? urlDelNegocio(negocio)).replace(/\/$/, "");
  return [{ url: `${url}/`, changeFrequency: "monthly", priority: 1 }];
}
