import { planSucursal, planUnico } from "./plan";

// Lo que preguntan los prospectos antes de contratar (factura, soporte, sucursales, recordatorios, cancelación,
// Excel y plan anual) para la landing, /precios y la página de cada giro. Los textos viven en respuestas-fijas.ts
// (los mismos que contesta el bot sin escalar); los montos salen de la base (planes), nunca del código.

export { WHATSAPP_SOPORTE, WHATSAPP_SOPORTE_LINK, RESPUESTA_FACTURA, RESPUESTA_SOPORTE } from "./respuestas-fijas";
import { RESPUESTA_FACTURA, RESPUESTA_SOPORTE, RESPUESTA_CANCELACION, RESPUESTA_MIGRACION, RESPUESTA_RECORDATORIOS, respuestaAnual, respuestaSucursales as sucursales } from "./respuestas-fijas";

export function respuestaSucursales(plan: { mensual: number } | null, sucursal: { mensual: number } | null): string {
  return sucursales({ mensual: plan?.mensual ?? null, anual: null, sucursal: sucursal?.mensual ?? null });
}

/** Las preguntas de contratación, con los precios vigentes. */
export async function preguntasDeContratacion(): Promise<[string, string][]> {
  const [plan, sucursal] = await Promise.all([planUnico(), planSucursal()]);
  return [
    ["¿Me dan factura?", RESPUESTA_FACTURA],
    ["¿Cómo es el soporte?", RESPUESTA_SOPORTE],
    ["¿Y si tengo varias sucursales?", respuestaSucursales(plan, sucursal)],
    ["¿Los recordatorios por WhatsApp cuestan aparte?", RESPUESTA_RECORDATORIOS],
    ["¿Puedo cancelar cuando quiera?", RESPUESTA_CANCELACION],
    ["Tengo todo en Excel, ¿lo puedo pasar?", RESPUESTA_MIGRACION],
    ["¿Hay plan anual?", respuestaAnual({ mensual: plan?.mensual ?? null, anual: plan?.anual ?? null, sucursal: null })],
  ];
}
