/**
 * Los dos flujos de alta por link.
 *
 * La diferencia no es cosmética: es cuánto se le puede pedir a alguien
 * antes de que abandone el formulario. Quien va a dejar a su perro a
 * dormir acepta contestar quién es su veterinario; quien viene dos horas
 * a bañarlo, no — y lo que esa persona sí quiere saber es cuánto va a
 * costar, que es lo que el negocio no alcanza a explicar por WhatsApp.
 *
 * El contrato de cada flujo NO se define aquí: sale de
 * `tipos_contrato.categorias_servicio` (Fase 11) en
 * `tipos_contrato_de_alta()`. Estas categorías son las mismas que usa esa
 * función, y están aquí solo para que la pantalla pueda decir de qué
 * habla.
 *
 * En estética NO hay contrato: el contrato cubre dejar al perro a cargo
 * del negocio, no traerlo a bañar y llevárselo en dos horas. Por eso ese
 * flujo no habla de firmar nada — y la base tampoco le genera ninguno.
 */
export const TIPOS_LINK_ALTA = {
  guarderia_hotel: {
    etiqueta: "Guardería y hotel",
    descripcion: "Expediente completo (veterinario, emergencia, alimentación) y su contrato.",
    categorias: ["guarderia", "hotel"] as const,
    expedienteCompleto: true,
    llevaContrato: true,
    muestraPrecioEstetica: false,
    mensajeWhatsApp: (nombre: string, url: string) =>
      `Hola ${nombre}, aquí puedes darte de alta en Ludogteka y registrar a tu perro para guardería u hotel: ${url}`,
    mensajeComplemento: (nombre: string, url: string) =>
      `Hola ${nombre}, para dejarnos a tu perro en guardería u hotel nos falta completar unos datos suyos y que firmes el contrato. Es rápido, aquí: ${url}`,
  },
  estetica: {
    etiqueta: "Estética",
    descripcion: "Lo básico más los precios del baño según la raza. Sin contrato.",
    categorias: ["estetica"] as const,
    expedienteCompleto: false,
    llevaContrato: false,
    muestraPrecioEstetica: true,
    mensajeWhatsApp: (nombre: string, url: string) =>
      `Hola ${nombre}, aquí puedes registrar a tu perro para su baño en Ludogteka y ver el precio estimado: ${url}`,
    mensajeComplemento: (nombre: string, url: string) =>
      `Hola ${nombre}, para el baño de tu perro nos falta completar un par de datos suyos. Es rápido, aquí: ${url}`,
  },
} as const;

export type TipoLinkAlta = keyof typeof TIPOS_LINK_ALTA;

export const TIPOS_LINK_ALTA_LISTA = Object.entries(TIPOS_LINK_ALTA).map(([clave, def]) => ({
  clave: clave as TipoLinkAlta,
  ...def,
}));

export function esTipoLinkAlta(valor: string): valor is TipoLinkAlta {
  return valor in TIPOS_LINK_ALTA;
}

// De qué módulo del negocio sale este link. Guardería y hotel comparten
// flujo porque comparten expediente: el perro que se queda de día y el
// que se queda a dormir necesitan los mismos datos.
export function tipoLinkDeModulo(modulo: string): TipoLinkAlta {
  return modulo === "estetica" ? "estetica" : "guarderia_hotel";
}
