import { planSucursal, planUnico } from "@/lib/peludesk/plan";
import { precioRecordatorioVigente } from "@/lib/recordatorios/precio";
import type { PreciosAyuda } from "./precios";

/** Los precios de los artículos de ayuda, de la base: los mismos que leen la landing, /precios y el bot. */
export async function preciosAyuda(): Promise<PreciosAyuda> {
  const [plan, sucursal, recordatorio] = await Promise.all([planUnico(), planSucursal(), precioRecordatorioVigente()]);
  return {
    mensual: plan?.mensual ?? null,
    anual: plan?.anual ?? null,
    sucursal: sucursal?.mensual ?? null,
    recordatoriosGratis: recordatorio?.gratisMes ?? null,
  };
}
