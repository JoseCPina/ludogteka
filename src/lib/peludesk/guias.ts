import fs from "node:fs";
import path from "node:path";
import { SLUGS_ALTERNATIVA, SLUGS_GUIA } from "@/lib/peludesk/rutas-publicas";

/** Guías por búsqueda concreta: content/guias/<slug>.json. Solo lo que la app hace. */
export type Guia = {
  slug: string;
  titulo: string;
  h1: string;
  descripcion: string;
  gancho: string;
  captura: { nombre: string; alt: string; celular?: boolean };
  secciones: { h2: string; parrafos?: string[]; lista?: string[] }[];
  preguntas: [string, string][];
  relacionadas: string[];
};

const LEER = (carpeta: string, slug: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", carpeta, `${slug}.json`), "utf8"));

export function guia(slug: string): Guia | null {
  if (!(SLUGS_GUIA as readonly string[]).includes(slug)) return null;
  return { ...LEER("guias", slug), slug };
}
export const todasLasGuias = (): Guia[] => SLUGS_GUIA.map((s) => guia(s)).filter((g): g is Guia => g !== null);

export type Alternativa = {
  slug: string; nombre: string; sitio: string; giro: string; resumen: string; precio: string; idioma: string; cfdi: string; pagos: string;
  conviene: string[]; noConviene: string[]; peludesk: string;
};
export function alternativa(slug: string): Alternativa | null {
  if (!(SLUGS_ALTERNATIVA as readonly string[]).includes(slug)) return null;
  return { ...LEER("alternativas", slug), slug };
}
export const todasLasAlternativas = (): Alternativa[] => SLUGS_ALTERNATIVA.map((s) => alternativa(s)).filter((a): a is Alternativa => a !== null);
export const FICHA_PELUDESK: { precio: string; idioma: string; cfdi: string; pagos: string } = LEER("alternativas", "_peludesk");

/** Fecha de la última revisión de las comparativas. */
export const REVISADO_ALTERNATIVAS = "2026-10-18";
