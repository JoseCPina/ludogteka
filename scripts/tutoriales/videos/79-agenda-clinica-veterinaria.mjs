// 79 · La agenda clínica con varios médicos (recepción)
export default {
  rol: "recepcion",
  inicio: "/veterinaria/agenda",
  gancho: "La clínica tiene varios médicos y cada cita dura distinto. La agenda clínica agenda por tipo y por médico, y no deja que un médico tenga dos citas a la misma hora.",
  escenas: [
    {
      titulo: "La agenda",
      dice: "En «Agenda clínica» ves el día o la semana, una columna por médico. Puedes filtrar por médico y moverte con los botones de siguiente y anterior.",
      pasos: [["esperar", 2000], ["zoom", "css:main", 1.1, 3000]],
    },
    {
      titulo: "Agendar una cita",
      dice: "Aprieta «Agendar», busca a la mascota por su nombre, el de su dueño o su teléfono y elígela. Escoge el tipo de cita, el médico, la fecha y la hora. La duración sale del tipo.",
      pasos: [["clic", "Agendar", { nav: true }], ["escribir", "Buscar mascota o dueño", "Tigre"], ["esperar", 1200], ["clic", "Tigre"], ["elegir", "Tipo de cita", "Vacuna"], ["elegir", "Médico", 1]],
    },
    {
      titulo: "Sin empalmes",
      dice: "Si el médico ya tiene otra cita a esa hora, la app no deja agendar y lo avisa. Una urgencia sí entra aunque se empalme, y te lo hace notar.",
      pasos: [["rellenar", "Fecha", "{fechaDia}"], ["rellenar", "Hora", "10:00"], ["clic", "Agendar cita", { nav: true }], ["esperar", 2000]],
    },
    {
      titulo: "Confirmar, mover o cancelar",
      dice: "Cada cita se puede confirmar, mover a otra hora, cancelar con su motivo o marcar que no llegó. Y desde la cita abres la consulta.",
      pasos: [["resaltar", "Confirmar", 2600]],
    },
  ],
  resumen: ["Se agenda por tipo de cita y por médico.", "Un médico no puede tener dos citas encimadas; una urgencia sí entra.", "Desde la cita se abre la consulta."],
};
