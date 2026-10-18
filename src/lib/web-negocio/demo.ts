import type { GiroWeb } from "./tema";

// «Ver cómo lo manejarías tú» desde la vista previa de un prospecto: abre la demo de PeluDesk (Patitas & Co., solo
// lectura) con la cuenta y en la pantalla que más le sirve a su giro. /demo/entrar/<rol>?ir=<clave> solo acepta
// estas claves (IR_DEMO), nunca una ruta suelta.

export const IR_DEMO = {
  estetica: "/estetica",
  calendario: "/reservas/calendario",
  agenda_clinica: "/veterinaria/agenda",
  // «consulta» se resuelve en /demo/entrar a la última consulta firmada del demo (si no hay, la agenda clínica).
  consulta: "/veterinaria/agenda",
} as const;
export type IrDemo = keyof typeof IR_DEMO;
export const esIrDemo = (v: string | null | undefined): v is IrDemo => !!v && Object.prototype.hasOwnProperty.call(IR_DEMO, v);

export const DEMO_POR_GIRO: Record<GiroWeb, { rol: "recepcion" | "veterinaria"; ir: IrDemo; texto: string }> = {
  veterinaria: { rol: "veterinaria", ir: "consulta", texto: "Entra como la médica de una clínica de ejemplo y abre una consulta: expediente, carnet y receta." },
  estetica: { rol: "recepcion", ir: "estetica", texto: "Entra como recepción de un negocio de ejemplo y mira la agenda de estética del día." },
  guarderia: { rol: "recepcion", ir: "calendario", texto: "Entra como recepción de un negocio de ejemplo y mira el calendario de reservas y la ocupación." },
  hotel: { rol: "recepcion", ir: "calendario", texto: "Entra como recepción de un negocio de ejemplo y mira el calendario del hotel: llegadas, salidas y cupo." },
};

/** El subdominio que le tocaría: sin acentos ni signos, como slug_libre (si ya está tomado, la base le pone otro). */
export function subdominioSugerido(nombre: string): string {
  const s = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/g, "");
  return s.length >= 3 ? s : "negocio";
}
