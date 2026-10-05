// 04 · El tablero del día (recepción)
export default {
  inicio: "/recepcion",
  gancho: "Cada mañana, lo primero que necesitas saber es qué va a pasar hoy en tu negocio. En este video aprendes a leer el tablero del día en menos de un minuto.",
  escenas: [
    {
      titulo: "El inicio de recepción",
      dice: "Este es el inicio de recepción: «Hoy en Patitas & Co.». Toda la casa en una sola pantalla: guardería, hotel y estética. Arriba tienes los botones que más usas: «Nuevo cliente», «Check-in», «Check-out» y «Nueva cita de estética».",
      pasos: [["resaltar", "Hoy en Patitas & Co.", 2400], ["mover", "Nuevo cliente"], ["resaltar", "css:main a[href='/guarderia/checkin']", 2200]],
    },
    {
      titulo: "Llegan hoy y se van hoy",
      dice: "Aquí ves «Llegan hoy» y «Se van hoy», con el nombre de cada perro y su servicio. Con un clic en el nombre abres su check-in o su check-out, sin buscar a nadie.",
      pasos: [["zoom", "Llegan hoy", 1.5, 3000], ["zoom", "Se van hoy", 1.5, 3000]],
    },
    {
      titulo: "Quién está adentro",
      dice: "En «Siguen aquí ahora» están los perros que están adentro en este momento. Desde aquí entras a las fotos, los videos y el reporte del día.",
      pasos: [["desplazar", "Siguen aquí ahora"], ["resaltar", "Siguen aquí ahora", 3000]],
    },
    {
      titulo: "Las citas de estética",
      dice: "«Citas de estética hoy» te muestra la agenda del día con la hora, el perro, el baño que le toca y su estado. Toca una cita para abrirla.",
      pasos: [["desplazar", 0], ["zoom", "Citas de estética hoy", 1.45, 3200]],
    },
    {
      titulo: "Necesita atención",
      dice: "Y lo más importante: «Necesita atención». Aquí salen los pendientes, como contratos por firmar o saldos por cobrar, cada uno con los días que lleva esperando. Te recomiendo empezar siempre por aquí.",
      pasos: [["resaltar", "Necesita atención", 3500], ["zoom", "Necesita atención", 1.4, 3000]],
    },
  ],
  resumen: ["El tablero junta guardería, hotel y estética en una sola pantalla.", "«Llegan hoy», «Se van hoy» y «Siguen aquí ahora» te dicen quién entra, quién sale y quién está adentro.", "Empieza siempre por «Necesita atención»."],
};
