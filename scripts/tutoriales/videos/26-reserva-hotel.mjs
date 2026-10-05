// 26 · Reserva el hotel (recepción)
export default {
  inicio: "/hotel",
  gancho: "En el hotel el precio depende de las noches y de la talla del perro. Veamos cómo reservar varias noches sin errores.",
  escenas: [
    {
      titulo: "El tablero del hotel",
      dice: "En «Hotel» ves quién llega, quién sale y quién está hospedado. La ocupación es la de toda la casa, porque guardería y hotel comparten espacio.",
      pasos: [["resaltar", "Nueva reserva", 2400]],
    },
    {
      titulo: "Elige cliente y perro",
      dice: "Aprieta «Nueva reserva», busca al cliente y marca a su perro.",
      pasos: [["clic", "Nueva reserva", { nav: true }], ["clic", "Regina Solís"], ["marcar", "Toby"]],
    },
    {
      titulo: "Entrada y salida",
      dice: "Escribe la «Entrada» y la «Salida». La app cuenta las noches y calcula el precio por talla. El hotel no entrega en un día cerrado; si la salida cae en uno, te lo avisa.",
      pasos: [["rellenar", "Entrada", "{fechaDia}"], ["rellenar", "Salida", "{fechaDia2}"], ["resaltar", "Salida", 2400]],
    },
    {
      titulo: "Crear la reserva",
      dice: "Aprieta «Crear reserva». Si un perro tiene una vacuna vencida, o le falta la evaluación de comportamiento, la app no deja reservar y te dice qué falta.",
      pasos: [["clic", "Crear reserva", { nav: true }], ["esperar", 3000]],
    },
  ],
  resumen: ["En el hotel pones entrada y salida, y la app cuenta las noches.", "El precio sale de la talla del perro.", "Si algo falta, la app te dice qué antes de reservar."],
};
