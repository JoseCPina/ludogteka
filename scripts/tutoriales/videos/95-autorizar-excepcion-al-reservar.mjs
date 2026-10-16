// 95 · Autorizar una excepción al reservar guardería u hotel (admin)
// Pimienta no tiene evaluación de comportamiento en el demo: al elegirla sale el aviso, el admin autoriza la excepción con su
// motivo y crea la reserva. Si el demo rechazara guardar, el video se detiene con el formulario lleno (como el 94).
export default {
  rol: "admin",
  inicio: "/guarderia",
  gancho: "A veces el dueño ya está en el mostrador y a la mascota todavía le falta la evaluación o una vacuna. Si tienes el permiso, puedes autorizar una excepción, y queda con su motivo.",
  escenas: [
    {
      titulo: "El aviso al elegir la mascota",
      dice: "Aprieta «Nueva reserva», busca al cliente y marca a su mascota. Si le falta algo, el aviso sale ahí mismo, junto a su nombre: aquí no tiene evaluación de comportamiento. Sin ella, la reserva no se puede crear.",
      pasos: [["clic", "Nueva reserva", { nav: true }], ["clic", "Fernanda Luna Arriaga"], ["marcar", "Pimienta"], ["esperar", 1500], ["resaltar", "css:[role='alert']", 3200]],
    },
    {
      titulo: "La excepción y su motivo",
      dice: "Si eres admin, o tienes el permiso de excepciones al reservar, marca la casilla «Reservar sin evaluación» y escribe el motivo. Es obligatorio, y queda registrado con tu nombre. Con las vacunas pasa igual: sale su propio aviso y su propia casilla.",
      pasos: [["marcar", "Reservar sin evaluación"], ["esperar", 1000], ["escribir", "Motivo de la excepción", "Se evalúa hoy al llegar, autoriza admin"], ["resaltar", "Motivo de la excepción", 2600]],
    },
    {
      titulo: "Crear la reserva",
      dice: "Escoge el servicio y la fecha, y aprieta «Crear reserva». Con la excepción puesta, la reserva se crea; sin ella, el botón sigue apagado.",
      pasos: [["elegir", "Servicio", "Guardería (día completo)"], ["rellenar", "Fecha", "{fechaDia}"], ["resaltar", "Crear reserva", 2400], ["clic", "Crear reserva", { nav: true }], ["esperar", 1800], ["resaltar", "Ver reserva", 2600]],
    },
  ],
  resumen: ["Al marcar la mascota sale lo que le falta.", "La excepción se autoriza con su casilla y un motivo obligatorio.", "Sin la excepción, la reserva no se crea."],
};
