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
    // El contrato de guardería NO se firma aquí: se genera al comprar un
    // paquete (ver tipos_contrato.se_genera_al). Aquí va el general/hotel.
    descripcion: "Expediente completo (veterinario, emergencia, alimentación) y el contrato general. El de guardería se firma al comprar un paquete.",
    // Lo que el dueño ve en su cuenta, dicho como se lo diríamos en el
    // mostrador. Tiene que ser VERDAD: sale de lo que el portal muestra hoy
    // (desde el 23 de septiembre de 2026, citas y reservas con su historial
    // vía mis_visitas()). Si el portal cambia, se cambia aquí.
    cuentaMuestra:
      "las próximas reservas de guardería y hotel de tu perro y las que ya pasaron, las fotos y notas que le dejemos mientras se queda con nosotros, sus vacunas y comprobantes, y tus contratos",
    comoSeAgenda: "Para reservar, cambiar o cancelar nos escribes por WhatsApp.",
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
    cuentaMuestra:
      "las próximas citas de estética de tu perro y el historial de sus baños, su ficha con su foto (la puedes cambiar tú) y las fotos y notas que le dejemos cuando viene",
    comoSeAgenda: "Para agendar, cambiar o cancelar una cita nos escribes por WhatsApp.",
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
