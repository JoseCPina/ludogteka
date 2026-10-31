import { articuloPorSlug as articuloAyuda } from "@/lib/ayuda";
import { articuloPorSlug as articuloBlog } from "@/lib/peludesk/blog";
import { todosLosAterrizajes } from "@/lib/peludesk/aterrizajes";
import { todasLasAlternativas, todasLasGuias } from "@/lib/peludesk/guias";
import { herramientasPublicadas } from "@/lib/herramientas/lista";

/**
 * Registro de las páginas públicas de venta de peludesk.mx: lo leen el
 * sitemap, llms.txt, los enlaces «Te puede servir» y el pie. Una página
 * pública nueva se agrega aquí (y en rutas-publicas.ts si no es un caso ya
 * cubierto por una carpeta con slug).
 */
export type PaginaPublica = { ruta: string; titulo: string; descripcion: string; tipo: "producto" | "giro" | "guia" | "alternativa" | "precio" | "herramienta" };

export const PAGINAS_FIJAS: PaginaPublica[] = [
  { ruta: "/", titulo: "PeluDesk: software para veterinarias y negocios caninos", descripcion: "Un sistema para clínica veterinaria, hotel y guardería, y estética canina.", tipo: "producto" },
  { ruta: "/precios", titulo: "Precios de PeluDesk", descripcion: "Un solo plan con todos los módulos, sin costo inicial y con 15 días de prueba.", tipo: "precio" },
  { ruta: "/veterinaria", titulo: "Software para veterinarias", descripcion: "Expediente por consulta, carnet con QR, recetas, hospitalización e inventario con lotes.", tipo: "giro" },
  { ruta: "/alternativas", titulo: "Alternativas a PeluDesk", descripcion: "Comparativa de software para negocios caninos: qué hace cada uno y cuándo conviene.", tipo: "alternativa" },
];

export function paginasDeVenta(): PaginaPublica[] {
  return [
    ...PAGINAS_FIJAS,
    ...todosLosAterrizajes().map((a) => ({ ruta: `/${a.slug}`, titulo: a.titulo.replace(" | PeluDesk", ""), descripcion: a.descripcion, tipo: "giro" as const })),
    ...todasLasGuias().map((g) => ({ ruta: `/guias/${g.slug}`, titulo: g.h1, descripcion: g.descripcion, tipo: "guia" as const })),
    ...todasLasAlternativas().map((a) => ({ ruta: `/alternativas/${a.slug}`, titulo: `PeluDesk frente a ${a.nombre}`, descripcion: a.resumen, tipo: "alternativa" as const })),
    { ruta: "/herramientas", titulo: "Herramientas gratis para negocios de mascotas", descripcion: "Índice de precios por ciudad y más herramientas, sin cuenta.", tipo: "herramienta" as const },
    ...herramientasPublicadas().map((h) => ({ ruta: h.ruta, titulo: h.nombre, descripcion: h.que, tipo: "herramienta" as const })),
  ];
}

/** Título de cualquier ruta pública interna (venta, blog o ayuda), para los enlaces. */
export function tituloDeRuta(ruta: string): string | null {
  const blog = ruta.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blog) return articuloBlog(blog[1])?.titulo ?? null;
  const ayuda = ruta.match(/^\/ayuda\/([a-z0-9-]+)$/);
  if (ayuda) return articuloAyuda(ayuda[1])?.titulo ?? null;
  return paginasDeVenta().find((p) => p.ruta === ruta)?.titulo ?? null;
}
