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

/** Un dato de la comparativa y de dónde salió (sitio oficial del proveedor). */
export type Fuente = { nombre: string; url: string };
export type CampoAlternativa = "giro" | "precio" | "recordatorios" | "idioma" | "cfdi" | "pagos" | "modulos";
export type Alternativa = {
  slug: string; nombre: string; sitio: string; region: "internacional" | "latam";
  giro: string; resumen: string; precio: string; recordatorios: string; idioma: string; cfdi: string; pagos: string; modulos: string;
  /** En qué es mejor que PeluDesk: la comparativa tiene que decirlo. */
  mejorEn: string[];
  conviene: string[]; noConviene: string[]; peludesk: string;
  fuentes: Record<CampoAlternativa, Fuente[]>;
};
export function alternativa(slug: string): Alternativa | null {
  if (!(SLUGS_ALTERNATIVA as readonly string[]).includes(slug)) return null;
  return { ...LEER("alternativas", slug), slug };
}
export const todasLasAlternativas = (): Alternativa[] => SLUGS_ALTERNATIVA.map((s) => alternativa(s)).filter((a): a is Alternativa => a !== null);
// Sin precio: el de PeluDesk sale siempre de `planes` (planUnico()).
export const FICHA_PELUDESK: { idioma: string; cfdi: string; pagos: string } = LEER("alternativas", "_peludesk");

/** Fecha de la última revisión de las comparativas contra el sitio oficial de cada proveedor. */
export const REVISADO_ALTERNATIVAS = "2026-10-17";
export const REVISADO_ALTERNATIVAS_TEXTO = "17 de octubre de 2026";

/** Lo mismo de PeluDesk, para las filas de la tabla. */
export const FILA_PELUDESK: Record<CampoAlternativa, string> = {
  giro: "Clínica veterinaria, hotel y guardería, y estética, en un solo sistema.",
  precio: "",
  /** Sale de la base (wa_precios) en cada página: textosRecordatorios(). */
  recordatorios: "",
  idioma: "Español de México: app, ayuda, portal del dueño y bot de WhatsApp.",
  cfdi: "Sí, CFDI 4.0 desde el cobro, con Facturapi (etapa inicial).",
  pagos: "Mercado Pago (terminal Point Smart y link), efectivo, transferencia y tarjeta manual.",
  modulos: "Expediente clínico, recetas y SITPV, hospitalización, hotel y guardería con cupo y pases, estética por estilista, caja con cortes, inventario con lotes, empleados, gastos, reportes, portal del dueño (consulta) y página web.",
};
export const CAMPOS_ALTERNATIVA: [CampoAlternativa, string][] = [
  ["giro", "Para qué giro"],
  ["precio", "Precio"],
  ["recordatorios", "Recordatorios automáticos por WhatsApp"],
  ["idioma", "Idioma"],
  ["cfdi", "Factura CFDI 4.0"],
  ["pagos", "Pagos en México"],
  ["modulos", "Qué trae"],
];
