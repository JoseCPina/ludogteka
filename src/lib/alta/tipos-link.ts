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
 */
export const TIPOS_LINK_ALTA = {
  guarderia_hotel: {
    etiqueta: "Guardería y hotel",
    descripcion: "Expediente completo: veterinario, contacto de emergencia y alimentación.",
    categorias: ["guarderia", "hotel"] as const,
    expedienteCompleto: true,
    muestraPrecioEstetica: false,
    mensajeWhatsApp: (nombre: string, url: string) =>
      `Hola ${nombre}, aquí puedes darte de alta en Ludogteka y registrar a tu perro para guardería u hotel: ${url}`,
    mensajeComplemento: (nombre: string, url: string) =>
      `Hola ${nombre}, para dejarnos a tu perro en guardería u hotel nos falta completar unos datos suyos y que firmes el contrato. Es rápido, aquí: ${url}`,
  },
  estetica: {
    etiqueta: "Estética",
    descripcion: "Lo básico más el precio estimado del baño según la raza.",
    categorias: ["estetica"] as const,
    expedienteCompleto: false,
    muestraPrecioEstetica: true,
    mensajeWhatsApp: (nombre: string, url: string) =>
      `Hola ${nombre}, aquí puedes registrar a tu perro para su baño en Ludogteka y ver el precio estimado: ${url}`,
    mensajeComplemento: (nombre: string, url: string) =>
      `Hola ${nombre}, para el baño de tu perro nos falta que firmes el contrato de estética y completar un par de datos. Aquí: ${url}`,
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
