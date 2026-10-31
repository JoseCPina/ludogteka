// La calculadora de comisiones de estilistas (/comisiones-groomers): con los servicios de una semana, cuánto se lleva
// la estilista y cuánto el negocio en los tres esquemas (porcentaje, pago fijo por servicio, sueldo más comisión).
// Pura: lo usan la pantalla y las pruebas.
export type RenglonSemana = { nombre: string; precio: number; cantidad: number; pagoFijo: number };

export type Esquemas = {
  /** Porcentaje de cada servicio para la estilista (0–100). */
  porcentaje: number;
  /** Sueldo semanal fijo + comisión (%) sobre todo lo producido. */
  sueldo: number;
  comisionSobreSueldo: number;
};

export type Resultado = { clave: "porcentaje" | "por_servicio" | "sueldo_mas_comision"; nombre: string; estilista: number; negocio: number; porcentajeReal: number; detalle: string };

export const ESQUEMAS_POR_OMISION: Esquemas = { porcentaje: 40, sueldo: 2000, comisionSobreSueldo: 15 };

export const SEMANA_EJEMPLO: RenglonSemana[] = [
  { nombre: "Baño completo · chico", precio: 250, cantidad: 8, pagoFijo: 90 },
  { nombre: "Baño completo · mediano", precio: 320, cantidad: 10, pagoFijo: 110 },
  { nombre: "Baño y corte · mediano", precio: 480, cantidad: 6, pagoFijo: 170 },
  { nombre: "Baño y corte · grande", precio: 650, cantidad: 3, pagoFijo: 230 },
  { nombre: "Corte de uñas", precio: 120, cantidad: 5, pagoFijo: 30 },
];

export const totalSemana = (r: RenglonSemana[]) => r.reduce((n, x) => n + (x.precio || 0) * (x.cantidad || 0), 0);
export const serviciosSemana = (r: RenglonSemana[]) => r.reduce((n, x) => n + (x.cantidad || 0), 0);

export function calcular(renglones: RenglonSemana[], e: Esquemas): Resultado[] {
  const total = totalSemana(renglones);
  const porcentaje = (total * (e.porcentaje || 0)) / 100;
  const porServicio = renglones.reduce((n, x) => n + (x.pagoFijo || 0) * (x.cantidad || 0), 0);
  const sueldoMas = (e.sueldo || 0) + (total * (e.comisionSobreSueldo || 0)) / 100;
  const r = (clave: Resultado["clave"], nombre: string, estilista: number, detalle: string): Resultado => ({ clave, nombre, estilista, negocio: total - estilista, porcentajeReal: total > 0 ? (estilista / total) * 100 : 0, detalle });
  return [
    r("porcentaje", "Por porcentaje", porcentaje, `${e.porcentaje} % de cada servicio`),
    r("por_servicio", "Pago fijo por servicio", porServicio, "lo que pusiste en «pago a la estilista» por cada servicio"),
    r("sueldo_mas_comision", "Sueldo más comisión", sueldoMas, `$${(e.sueldo || 0).toLocaleString("es-MX")} fijos a la semana + ${e.comisionSobreSueldo} % de lo producido`),
  ];
}

export const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;

/** La lectura en dos frases: cuál esquema le conviene a cada quien y qué tan parejos salen. */
export function lectura(res: Resultado[]): string {
  const [masEstilista] = [...res].sort((a, b) => b.estilista - a.estilista);
  const [masNegocio] = [...res].sort((a, b) => b.negocio - a.negocio);
  const dif = masEstilista.estilista - [...res].sort((a, b) => a.estilista - b.estilista)[0].estilista;
  return `Con esta semana, a la estilista le conviene «${masEstilista.nombre.toLowerCase()}» (${pesos(masEstilista.estilista)}) y al negocio «${masNegocio.nombre.toLowerCase()}» (${pesos(masNegocio.negocio)} para la casa). La diferencia entre el esquema que más y el que menos le paga es de ${pesos(dif)} a la semana.`;
}
