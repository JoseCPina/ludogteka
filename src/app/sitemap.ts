import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { ENCABEZADOS_NEGOCIO, ENCABEZADO_PLATAFORMA } from "@/lib/negocio/resolver";
import { SLUG_DEMO } from "@/lib/peludesk/landing";
import { ARTICULOS } from "@/lib/ayuda";
import { CATEGORIAS, POR_PAGINA, todosLosArticulos } from "@/lib/peludesk/blog";
import { paginasDeVenta } from "@/lib/peludesk/paginas";
import { REVISADO_ALTERNATIVAS } from "@/lib/peludesk/guias";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTOS_LEGALES } from "@/lib/peludesk/legal";
import { SITIO } from "@/lib/peludesk/seo";
import { GIROS_MERCADO, slugDe } from "@/lib/mercado/catalogo";
import { ciudadesConDatos } from "@/lib/mercado/rangos";
import { ciudadesDirectorio, MINIMO_INDEXABLE } from "@/lib/directorio/consulta";
import { todasLasPlantillas } from "@/lib/herramientas/mensajes-whatsapp";
import { SESIONES } from "@/lib/escuela/sesiones";

const fechaIso = (v: string) => new Date(`${v}T12:00:00Z`);

// Las páginas por ciudad y giro del Índice de precios: solo las ciudades que juntan 8 precios o más.
async function paginasPorCiudad(): Promise<MetadataRoute.Sitemap> {
  const salida: MetadataRoute.Sitemap = [];
  for (const g of GIROS_MERCADO) {
    for (const c of await ciudadesConDatos(g.clave)) {
      salida.push({ url: `${SITIO}/precios-mercado/${g.clave}/${slugDe(c.ciudad)}`, lastModified: fechaIso(c.fecha), changeFrequency: "monthly", priority: 0.7 });
    }
  }
  return salida;
}

// Las páginas de ciudad del directorio con 10 negocios o más (las fichas no van: se descubren desde su ciudad, y una
// lista de miles de fichas haría que la tarea de IndexNow las pidiera todas cada hora).
async function paginasDirectorio(): Promise<MetadataRoute.Sitemap> {
  return (await ciudadesDirectorio()).filter((c) => c.n >= MINIMO_INDEXABLE).map((c) => ({ url: `${SITIO}/directorio/${c.giro}/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.6 }));
}

// peludesk.mx: solo páginas públicas e indexables (nada de /plataforma,
// /demo, /peludesk/redes ni /api). Una sola versión del host, el canónico.
async function sitemapPlataforma(): Promise<MetadataRoute.Sitemap> {
  const arts = todosLosArticulos();
  const ultimaEntrada = arts.map((a) => a.actualizado).sort().at(-1);
  const paginas = Math.ceil(arts.length / POR_PAGINA);
  const categoriasUsadas = (Object.keys(CATEGORIAS) as (keyof typeof CATEGORIAS)[]).filter((c) => arts.some((a) => a.categoria === c));
  return [
    { url: `${SITIO}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITIO}/registro`, changeFrequency: "monthly", priority: 0.8 },
    // Precios, giros, guías y comparativas: todo lo que registra paginas.ts, sin repetir la portada.
    ...paginasDeVenta()
      .filter((p) => p.ruta !== "/")
      .map((p) => ({
        url: `${SITIO}${p.ruta}`,
        ...(p.tipo === "alternativa" ? { lastModified: fechaIso(REVISADO_ALTERNATIVAS) } : {}),
        changeFrequency: "monthly" as const,
        priority: p.ruta === "/precios" || p.tipo === "giro" ? 0.9 : 0.8,
      })),
    ...(await paginasPorCiudad()),
    ...(await paginasDirectorio()),
    ...todasLasPlantillas().map((p) => ({ url: `${SITIO}/mensajes-whatsapp/${p.slug}`, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...SESIONES.map((s) => ({ url: `${SITIO}/escuela/${s.clave}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    { url: `${SITIO}/blog`, lastModified: ultimaEntrada ? fechaIso(ultimaEntrada) : undefined, changeFrequency: "weekly", priority: 0.7 },
    ...Array.from({ length: Math.max(0, paginas - 1) }, (_, i) => ({ url: `${SITIO}/blog/pagina/${i + 2}`, changeFrequency: "weekly" as const, priority: 0.4 })),
    ...categoriasUsadas.map((c) => ({ url: `${SITIO}/blog/categoria/${c}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...arts.map((a) => ({ url: `${SITIO}/blog/${a.slug}`, lastModified: fechaIso(a.actualizado), changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITIO}/ayuda`, changeFrequency: "monthly", priority: 0.5 },
    ...(await videosPublicados()),
    ...ARTICULOS.map((a) => ({ url: `${SITIO}/ayuda/${a.slug}`, changeFrequency: "monthly" as const, priority: 0.4 })),
    ...Object.values(DOCUMENTOS_LEGALES).map((d) => ({ url: `${SITIO}${d.ruta}`, lastModified: fechaIso(d.version.slice(0, 10)), changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}

// Los videos tutoriales publicados (cada uno con su página y su VideoObject).
async function videosPublicados(): Promise<MetadataRoute.Sitemap> {
  try {
    const { data } = await createSupabaseAdminClient().from("tutoriales").select("slug, updated_at, video_path, youtube_id").eq("publicado", true).is("deleted_at", null).order("orden");
    const lista = (data ?? []).filter((v) => v.video_path || v.youtube_id);
    return [
      ...(lista.length ? [{ url: `${SITIO}/ayuda/videos`, changeFrequency: "monthly" as const, priority: 0.4 }] : []),
      ...lista.map((v) => ({ url: `${SITIO}/ayuda/videos/${v.slug}`, lastModified: v.updated_at ? new Date(v.updated_at) : undefined, changeFrequency: "monthly" as const, priority: 0.4 })),
    ];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  if (h.get(ENCABEZADO_PLATAFORMA) === "1") return await sitemapPlataforma();
  if (h.get(ENCABEZADOS_NEGOCIO.slug) === SLUG_DEMO) return [];
  const negocio = await cargarNegocioLanding();
  const url = (negocio.landing?.url_publica ?? urlDelNegocio(negocio)).replace(/\/$/, "");
  return [{ url: `${url}/`, changeFrequency: "monthly", priority: 1 }];
}
