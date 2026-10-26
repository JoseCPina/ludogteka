import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TASA_IVA } from "@/lib/cobro/iva";

/**
 * El precio de los recordatorios automáticos por WhatsApp, de la base (tabla `wa_precios`, de la plataforma):
 * nunca una cifra escrita en el código. Lo que nos cobra Meta por mensaje de utilidad en México, convertido a
 * pesos con el tipo de cambio del día de corte; al negocio se le cobra el doble, redondeado a centavos, más IVA.
 * Cada negocio tiene `gratis_mes` mensajes entregados gratis por mes calendario.
 *
 * Lo leen la landing, /precios, el bot de ventas, «Módulos y plan» y la plataforma.
 */
export type PrecioRecordatorio = {
  /** Pesos por mensaje, sin IVA (lo que se le cobra al negocio por cada uno arriba de los gratis). */
  precio: number;
  /** Pesos por mensaje con IVA (para el resumen; la cifra principal es la de sin IVA). */
  precioConIva: number;
  /** Mensajes entregados gratis por mes calendario. */
  gratisMes: number;
  /** Lo que nos cobra Meta por mensaje, en pesos (solo para la plataforma). */
  costoMxn: number;
  /** AAAA-MM-DD desde cuándo vale. */
  vigenteDesde: string;
};

/** Centavos con IVA de un precio sin IVA en pesos (4 decimales: Stripe acepta fracción de centavo). */
export function centavosConIva(precio: number): number {
  return Math.round(precio * (1 + TASA_IVA) * 100 * 10_000) / 10_000;
}

export async function precioRecordatorioVigente(): Promise<PrecioRecordatorio | null> {
  try {
    // La llave de servicio: funciona dentro y fuera de una petición (tarea, webhook, landing); la tabla es pública.
    const supabase = createSupabaseAdminClient();
    // Día UTC: la vigencia es por día y unas horas de diferencia no cambian el precio publicado.
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: fila } = await supabase
      .from("wa_precios")
      .select("precio_mxn, gratis_mes, costo_mxn, vigente_desde")
      .is("deleted_at", null)
      .lte("vigente_desde", hoy)
      .order("vigente_desde", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!fila) return null;
    const precio = Number(fila.precio_mxn);
    return {
      precio,
      precioConIva: Math.round(precio * (1 + TASA_IVA) * 100) / 100,
      gratisMes: Number(fila.gratis_mes),
      costoMxn: Number(fila.costo_mxn),
      vigenteDesde: String(fila.vigente_desde),
    };
  } catch {
    return null;
  }
}

/** «$0.31» (sin decimales de más; siempre dos). */
export function pesosRecordatorio(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
