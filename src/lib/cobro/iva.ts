// El IVA de la suscripción de PeluDesk, en un solo lugar (se puede usar en
// el navegador: no toca Stripe ni la base).
//
// `planes` guarda el precio SIN IVA (lo que captura la plataforma). De aquí
// salen las tres cifras que tienen que coincidir al centavo: lo que se le
// enseña al admin ("+ IVA" debajo), el resumen antes de pagar (con IVA) y el
// precio que se da de alta en Stripe (IVA incluido, tax_behavior inclusive,
// igual que Menteo). Si cambia la tasa, se cambia aquí y se mueven juntas.

/** 16 %, la tasa general en México. */
export const TASA_IVA = 0.16;

/** El anual cobra diez mensualidades por doce meses («2 meses gratis»). */
export const MESES_QUE_SE_PAGAN_AL_ANIO = 10;

export type Periodicidad = "mensual" | "anual";

export type Desglose = { neto: number; iva: number; total: number };

/** De un precio sin IVA en pesos, las tres cifras en CENTAVOS. */
export function conIva(netoPesos: number): Desglose {
  const neto = Math.round(Number(netoPesos) * 100);
  const total = Math.round(neto * (1 + TASA_IVA));
  return { neto, iva: total - neto, total };
}

/** El precio sin IVA (en pesos) de un plan en esa periodicidad. */
export function netoDe(precioMensual: number, periodicidad: Periodicidad): number {
  return periodicidad === "anual" ? Number(precioMensual) * MESES_QUE_SE_PAGAN_AL_ANIO : Number(precioMensual);
}

/** `123456` centavos → "$1,234.56"; sin decimales cuando son cero. */
export function pesosDeCentavos(centavos: number): string {
  const pesos = centavos / 100;
  const decimales = Number.isInteger(pesos) ? 0 : 2;
  return pesos.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Suma de varios desgloses (plan + complementos). */
export function sumar(partes: Desglose[]): Desglose {
  return partes.reduce((a, b) => ({ neto: a.neto + b.neto, iva: a.iva + b.iva, total: a.total + b.total }), { neto: 0, iva: 0, total: 0 });
}
