import fs from "node:fs";
import path from "node:path";
import { contarPalabras } from "@/lib/peludesk/markdown";

/**
 * El blog de peludesk.mx: cada artículo es un archivo Markdown en
 * content/blog/<slug>.md con su frontmatter (ver CLAUDE.md, «Blog»).
 * Se leen del disco (next.config.ts los incluye en la función); si un
 * archivo no cumple el formato, el build falla en la prueba
 * `scripts/auditoria/sitio-publico.mjs`, no en producción.
 */
export const CATEGORIAS = {
  guarderias: { nombre: "Guarderías", descripcion: "Abrir, operar y cuidar una guardería canina: requisitos, vacunas, contratos." },
  hoteles: { nombre: "Hoteles", descripcion: "Pensión y hotel canino: cupo, reservas y estancias sin sobrecupo." },
  dinero: { nombre: "Dinero y precios", descripcion: "Cómo fijar precios, cerrar la caja y saber cuánto ganas de verdad." },
} as const;
export type CategoriaBlog = keyof typeof CATEGORIAS;

export const POR_PAGINA = 9;

export type Articulo = {
  slug: string;
  titulo: string;
  descripcion: string;
  fecha: string;
  actualizado: string;
  categoria: CategoriaBlog;
  imagen: string;
  cuerpo: string;
  palabras: number;
  minutos: number;
};

const CARPETA = path.join(process.cwd(), "content", "blog");

function valor(v: string): string {
  const t = v.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) ? t.slice(1, -1) : t;
}

export function parsearArticulo(slug: string, crudo: string): Articulo {
  const m = crudo.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`content/blog/${slug}.md: falta el frontmatter (--- … ---).`);
  const meta: Record<string, string> = {};
  for (const linea of m[1].split("\n")) {
    const i = linea.indexOf(":");
    if (i > 0) meta[linea.slice(0, i).trim()] = valor(linea.slice(i + 1));
  }
  for (const c of ["titulo", "descripcion", "fecha", "categoria", "imagen"]) {
    if (!meta[c]) throw new Error(`content/blog/${slug}.md: falta «${c}» en el frontmatter.`);
  }
  if (!(meta.categoria in CATEGORIAS)) throw new Error(`content/blog/${slug}.md: categoría «${meta.categoria}» desconocida.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.fecha)) throw new Error(`content/blog/${slug}.md: «fecha» va como AAAA-MM-DD.`);
  const cuerpo = m[2].trim();
  const palabras = contarPalabras(cuerpo);
  return {
    slug,
    titulo: meta.titulo,
    descripcion: meta.descripcion,
    fecha: meta.fecha,
    actualizado: meta.actualizado || meta.fecha,
    categoria: meta.categoria as CategoriaBlog,
    imagen: meta.imagen,
    cuerpo,
    palabras,
    minutos: Math.max(1, Math.round(palabras / 200)),
  };
}

let cache: Articulo[] | null = null;

export function todosLosArticulos(): Articulo[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  if (!fs.existsSync(CARPETA)) return [];
  const lista = fs
    .readdirSync(CARPETA)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parsearArticulo(f.slice(0, -3), fs.readFileSync(path.join(CARPETA, f), "utf8")))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.titulo.localeCompare(b.titulo, "es"));
  cache = lista;
  return lista;
}

export function articuloPorSlug(slug: string): Articulo | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return todosLosArticulos().find((a) => a.slug === slug) ?? null;
}

/** Los de la misma categoría primero, y luego los más recientes. */
export function relacionados(a: Articulo, cuantos = 3): Articulo[] {
  const otros = todosLosArticulos().filter((x) => x.slug !== a.slug);
  return [...otros.filter((x) => x.categoria === a.categoria), ...otros.filter((x) => x.categoria !== a.categoria)].slice(0, cuantos);
}

export const imagenDeArticulo = (a: Pick<Articulo, "imagen">) => `/peludesk/ilustraciones/${a.imagen}@2x.webp`;

export function fechaLarga(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
