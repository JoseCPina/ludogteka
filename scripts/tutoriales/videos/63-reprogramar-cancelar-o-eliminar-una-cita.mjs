// 63 · Reprogramar, cancelar o eliminar una cita de estética (admin)
export default {
  rol: "admin",
  inicio: "/estetica",
  gancho: "Una cliente cambia de día, otra ya no puede venir y a veces una cita se captura dos veces. Veamos cómo mover, cancelar o eliminar una cita sin perder el historial.",
  escenas: [
    {
      titulo: "Reprogramar",
      dice: "En la agenda, cada cita por venir trae el botón «Reprogramar». Escoge la nueva fecha y hora, escribe el motivo si quieres y guarda. La cita se mueve con su precio, y la app revisa que la estilista no tenga otra a esa hora.",
      pasos: [["clic", "Reprogramar", { nav: true }], ["rellenar", "Nueva fecha y hora", "{fechaCita}"], ["escribir", "Motivo (opcional)", "La clienta pidió otro día"], ["clic", "Guardar la nueva hora"], ["esperar", 2200]],
    },
    {
      titulo: "Avisar a la clienta",
      dice: "Después de mover la cita puedes avisarle a la clienta por WhatsApp con un mensaje ya escrito. El sistema no manda nada solo: tú decides si lo envías.",
      pasos: [["esperar", 3000]],
    },
    {
      titulo: "Cancelar",
      dice: "Si la clienta avisa que ya no viene, aprieta «Cancelar cita» y escribe el motivo. El horario queda libre. «No se presentó» es para cuando nunca llegó ni avisó.",
      pasos: [["resaltar", "No se presentó", 2400], ["clic", "Cancelar cita"], ["escribir", "Motivo de la cancelación", "La clienta se enfermó"], ["clic", "Sí, cancelar la cita"], ["esperar", 2200]],
    },
    {
      titulo: "Eliminar",
      dice: "Y si la cita se capturó por error o está duplicada, un admin puede eliminarla. Sale de la agenda y libera el horario, pero no se borra: queda en el historial con su motivo.",
      pasos: [["clic", "Eliminar cita"], ["escribir", "Motivo (obligatorio)", "Se capturó dos veces"], ["clic", "Sí, eliminar la cita"], ["esperar", 2200]],
    },
    {
      titulo: "Otro perrito del mismo cliente",
      dice: "Y cuando el mismo cliente trae a otro perrito, no tienes que empezar de cero: al agendar, aprieta «Agregar otro perrito de este cliente» y se agenda en la misma visita.",
      pasos: [["ir", "/estetica/nueva"], ["clic", "Ricardo Olmos"], ["resaltar", "Agregar otro perrito de este cliente", 3200]],
    },
  ],
  resumen: ["Reprogramar mueve la cita con su precio y revisa que no se empalme.", "Cancelar libera el horario; «No se presentó» es para quien nunca llegó.", "Eliminar es para citas capturadas por error, y siempre queda en el historial."],
};
