import fs from "node:fs";
import path from "node:path";
import type { NombreIlustracion } from "@/components/peludesk/ilustracion";

/**
 * Las tres páginas de aterrizaje por intención (guarderías, estéticas y
 * hoteles caninos): content/aterrizajes/<slug>.json. Solo dicen lo que la app
 * hace hoy (mismas fuentes que la landing y el centro de ayuda).
 */
export type Aterrizaje = {
  slug: string;
  titulo: string;
  h1: string;
  descripcion: string;
  gancho: string;
  alivios: { antes: string; ahora: string }[];
  funciones: { titulo: string; texto: string }[];
  preguntas: [string, string][];
  articulos: string[];
  ilustracion: NombreIlustracion;
};

export const SLUGS_ATERRIZAJE = [
  "software-para-guarderias-caninas",
  "software-para-esteticas-caninas",
  "software-para-hoteles-caninos",
] as const;

const CARPETA = path.join(process.cwd(), "content", "aterrizajes");

export function aterrizaje(slug: string): Aterrizaje | null {
  if (!(SLUGS_ATERRIZAJE as readonly string[]).includes(slug)) return null;
  const archivo = path.join(CARPETA, `${slug}.json`);
  if (!fs.existsSync(archivo)) return null;
  return { ...(JSON.parse(fs.readFileSync(archivo, "utf8")) as Omit<Aterrizaje, "slug">), slug };
}

export function todosLosAterrizajes(): Aterrizaje[] {
  return SLUGS_ATERRIZAJE.map((s) => aterrizaje(s)).filter((a): a is Aterrizaje => a !== null);
}
