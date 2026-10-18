/**
 * El caso de Ludogteka, para las páginas públicas de peludesk.mx. Solo lo que
 * el negocio hace en PeluDesk (verificado en la app y en CLAUDE.md), sin
 * cifras. Las frases de «Equipo Ludogteka» son las tres que dio el negocio
 * (src/components/peludesk/animacion/ludogteka.tsx guarda las mismas); las
 * otras tres de esa sección no se citan fuera de la landing.
 */
export const LUDOGTEKA = {
  nombre: "Ludogteka",
  ciudad: "San Luis Potosí",
  url: "https://ludogteka.mx",
  instagram: "https://www.instagram.com/ludogteka/",
  frases: ["Nos hizo la vida mucho más fácil.", "Es muy práctico.", "Tenemos mejor control."],
  intro:
    "Ludogteka es un negocio canino de San Luis Potosí con guardería, hotel y estética. PeluDesk nació ahí: se hizo para su operación diaria y hoy es el primer negocio que lo usa.",
} as const;

export type CasoGiro = { titulo: string; texto: string; puntos: string[] };

export const CASO_POR_GIRO: Record<"guarderia" | "hotel" | "estetica" | "veterinaria", CasoGiro> = {
  guarderia: {
    titulo: "Cómo lo usa Ludogteka en su guardería",
    texto:
      "La guardería de Ludogteka abre de lunes a sábado y el horario vive en PeluDesk: el sistema no deja reservar un día cerrado. Cada perro tiene sus vacunas, su contrato y sus pases.",
    puntos: [
      "Reservas con cupo de toda la casa, y series para los perros que vienen siempre los mismos días.",
      "Day pass y mensualidad por perro, con el contrato del paquete firmado desde el celular del dueño.",
      "Cobro con la terminal de Mercado Pago conectada a la caja y corte de turno.",
    ],
  },
  hotel: {
    titulo: "Cómo lo usa Ludogteka en su hotel",
    texto:
      "El hotel de Ludogteka comparte cupo y expediente con la guardería: el mismo perro, el mismo contrato y la misma cuenta, sin capturar dos veces.",
    puntos: [
      "Reserva por noche con cupo, check-in con foto y pertenencias, y check-out con lo que se entrega.",
      "Recolección a domicilio cotizada por distancia y cobrada en la misma cuenta.",
      "Si un perro no lo recogen a tiempo, pasa a noche de hotel sin armar otra reserva.",
    ],
  },
  estetica: {
    titulo: "Cómo lo usa Ludogteka en su estética",
    texto:
      "La estética de Ludogteka cobra cada baño por grupo de raza y pelaje, y la cita ya cobrada queda en la caja del día.",
    puntos: [
      "Agenda por estilista, sin citas encimadas y con aviso si la persona tiene una ausencia aprobada.",
      "Precio del baño por raza, talla y pelaje, y un precio aparte si el pelo llega maltratado.",
      "Comisión y propina por estilista, y descuento de insumos al terminar la cita.",
    ],
  },
  veterinaria: {
    titulo: "Dónde se probó la parte clínica",
    texto:
      "Ludogteka no es una clínica veterinaria: usa PeluDesk para guardería, hotel y estética. De ahí vienen la base compartida de clientes, mascotas, cuentas, caja, contratos y portal. El módulo de Veterinaria se probó con una clínica de demostración y con el demo público; todavía no hay una clínica real que lo cite.",
    puntos: [
      "Los clientes y mascotas son los mismos de las demás áreas: un perro de la guardería puede ir a consulta sin darlo de alta otra vez.",
      "Lo clínico se cobra en la misma caja que usa Ludogteka para todo lo demás.",
      "Puedes ver el módulo completo en el demo, sin registrarte.",
    ],
  },
};
