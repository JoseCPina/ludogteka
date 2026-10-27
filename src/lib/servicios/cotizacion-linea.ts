// QA R50 (N133): el precio de una línea (perro + servicio + fechas) o lo único que falta para saberlo, tal como lo
// cobra la base (cotizar_linea_servicio). Toda pantalla que da de alta un servicio con precio lo pregunta al marcar el
// perro y no deja guardar mientras falte: nunca se entera hasta «Crear reserva».

export type DatoDePrecio = "tamano" | "pelaje";

export type CotizacionLinea =
  | { estado: "ok"; precio: number; cantidad: number; unidad: string; total: number }
  | { estado: "faltan_datos"; faltan: DatoDePrecio[]; perro: string }
  | { estado: "sin_precio" | "no_aplica" | "otro"; mensaje: string };

/** Lo que dice la pantalla cuando al perro le falta un dato del que depende el precio. */
export function textoFaltaDato(perro: string, faltan: DatoDePrecio[]): string {
  const talla = faltan.includes("tamano");
  const pelaje = faltan.includes("pelaje");
  if (talla && pelaje) return `Falta la talla y el pelaje de ${perro}: sin ellos no se puede calcular el precio`;
  if (pelaje) return `Falta el pelaje de ${perro}: sin él no se puede calcular el precio`;
  return `Falta la talla de ${perro}: sin ella no se puede calcular el precio`;
}

const UNIDADES: Record<string, [string, string]> = {
  noche: ["noche", "noches"],
  dia: ["día", "días"],
  hora: ["hora", "horas"],
};

/** «2 noches», «1 día», «3 horas». */
export function cantidadConUnidad(cantidad: number, unidad: string): string {
  const [uno, varios] = UNIDADES[unidad] ?? ["vez", "veces"];
  return `${cantidad} ${cantidad === 1 ? uno : varios}`;
}

export const pesos = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «Precio: 2 noches × $450.00 = $900.00» (o «Precio: $450.00» cuando es una sola unidad de un servicio por día o por vez). */
export function textoPrecioLinea(c: { precio: number; cantidad: number; unidad: string; total: number }): string {
  if (c.cantidad === 1 && c.unidad !== "noche" && c.unidad !== "hora") return `Precio: ${pesos(c.total)}`;
  return `Precio: ${cantidadConUnidad(c.cantidad, c.unidad)} × ${pesos(c.precio)} = ${pesos(c.total)}`;
}

/** De la respuesta de la base (jsonb) a la cotización de la pantalla. */
export function leerCotizacion(data: unknown): CotizacionLinea {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.estado === "ok" && d.precio != null) {
    return { estado: "ok", precio: Number(d.precio), cantidad: Number(d.cantidad ?? 1), unidad: String(d.unidad ?? ""), total: Number(d.total ?? d.precio) };
  }
  if (d.estado === "faltan_datos") {
    return { estado: "faltan_datos", faltan: ((d.faltan as string[] | undefined) ?? []).filter((x): x is DatoDePrecio => x === "tamano" || x === "pelaje"), perro: String(d.perro ?? "el perro") };
  }
  if (d.estado === "sin_precio" || d.estado === "no_aplica") {
    return { estado: d.estado, mensaje: String(d.mensaje ?? "Este servicio no tiene precio para este perro.") };
  }
  // Estética: sin grupo de raza o pelaje que no se ofrece (Agendar cita los resuelve con su propio aviso).
  return { estado: "otro", mensaje: String(d.mensaje ?? "No se puede calcular el precio de este servicio para este perro.") };
}
