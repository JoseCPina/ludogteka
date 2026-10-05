// 25 · Reserva guardería (recepción)
export default {
  inicio: "/guarderia",
  gancho: "Reservar un día de guardería es tan rápido como escoger al perro y la fecha. La app revisa por ti el cupo, las vacunas y el horario.",
  escenas: [
    {
      titulo: "El tablero de guardería",
      dice: "En «Guardería» ves quién llega hoy, quién se va y quién sigue adentro, y abajo la ocupación de la casa. Los botones de arriba son los que más usas: «Check-in», «Check-out» y «Nueva reserva».",
      pasos: [["resaltar", "Nueva reserva", 2400], ["zoom", "Ocupación de la casa", 1.4, 3500]],
    },
    {
      titulo: "Nueva reserva",
      dice: "Aprieta «Nueva reserva», busca al cliente y escoge a su perro. Puedes reservar a varios perros de la misma familia en una sola reserva.",
      pasos: [["clic", "Nueva reserva", { nav: true }], ["clic", "Jorge Peña"], ["marcar", "Luna"]],
    },
    {
      titulo: "Servicio y fecha",
      dice: "Escoge el «Servicio»: guardería de día completo, o guardería ocasional por hora. Luego la «Fecha». Si es por hora, escribes cuántas horas calculas; al salir se ajustan a las reales.",
      pasos: [["elegir", "Servicio", "Guardería (día completo)"], ["rellenar", "Fecha", "{fechaDia}"], ["resaltar", "Servicio", 2400]],
    },
    {
      titulo: "Crear la reserva",
      dice: "Aprieta «Crear reserva». Si el perro no cumple algo, por ejemplo una vacuna vencida, o ya no hay cupo, la app te lo dice con claridad y no deja reservar. La guardería tampoco se reserva en un día cerrado.",
      pasos: [["clic", "Crear reserva", { nav: true }], ["esperar", 3000]],
    },
  ],
  resumen: ["«Nueva reserva» con el cliente, sus perros, el servicio y la fecha.", "La app revisa cupo, vacunas, evaluación y horario por ti.", "Si algo falta, te dice qué y no deja reservar."],
};
