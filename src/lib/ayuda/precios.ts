import { conIva } from "@/lib/cobro/iva";
import type { Articulo } from "./tipos";

/**
 * Los precios de PeluDesk dentro de los artículos de ayuda: nunca una cifra escrita en el artículo. El artículo lleva
 * una marca (`{{plan}}`, `{{plan_anual}}`, `{{sucursal}}`, `{{recordatorios_gratis}}`) y quien lo enseña la llena con
 * lo que dice la base (`planes` y `wa_precios`), igual que la landing, /precios y el bot. Sin precios (no se pudieron
 * leer), la marca se vuelve una frase que manda a Módulos y plan, nunca una cifra vieja ni la marca cruda.
 *
 * Puro (sin base): lo usan el centro de ayuda, el asistente y el bot de WhatsApp. La lectura de la base está en
 * ./precios-servidor.ts.
 */
export type PreciosAyuda = {
  /** Pesos al mes del plan, sin IVA. */
  mensual: number | null;
  /** Pesos al año del plan anual, sin IVA. */
  anual: number | null;
  /** Pesos al mes de cada sucursal adicional, sin IVA. */
  sucursal: number | null;
  /** Recordatorios por WhatsApp entregados gratis al mes. */
  recordatoriosGratis: number | null;
};

const pesos = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

const MARCAS: Record<string, { con: (p: PreciosAyuda) => string | null; sin: string }> = {
  plan: {
    con: (p) => (p.mensual ? `${pesos(p.mensual)} al mes + IVA (${pesos(conIva(p.mensual).total / 100)} con IVA)` : null),
    sin: "el precio que ves en Módulos y plan, más IVA",
  },
  plan_anual: {
    con: (p) => (p.anual ? `${pesos(p.anual)} + IVA al año` : null),
    sin: "el precio anual que ves en Módulos y plan, más IVA",
  },
  sucursal: {
    con: (p) => (p.sucursal ? `${pesos(p.sucursal)} al mes + IVA` : null),
    sin: "la mitad del plan, más IVA",
  },
  recordatorios_gratis: {
    con: (p) => (p.recordatoriosGratis != null ? `${p.recordatoriosGratis} recordatorios entregados gratis al mes` : null),
    sin: "recordatorios entregados gratis cada mes (cuántos, en Módulos y plan)",
  },
};

const MARCA = /\{\{(plan|plan_anual|sucursal|recordatorios_gratis)\}\}/g;

/** El texto con cada marca llenada con la base (o con su frase sin cifra). */
export function conPrecios(texto: string, precios: PreciosAyuda | null): string {
  return texto.replace(MARCA, (_, clave: string) => (precios ? MARCAS[clave].con(precios) : null) ?? MARCAS[clave].sin);
}

/** El artículo con su cuerpo ya llenado. */
export function articuloConPrecios(a: Articulo, precios: PreciosAyuda | null): Articulo {
  return a.cuerpo.includes("{{") ? { ...a, cuerpo: conPrecios(a.cuerpo, precios) } : a;
}
