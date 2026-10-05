// 07 · Horario, cupo y datos del negocio (admin)
export default {
  inicio: "/admin",
  gancho: "Con el horario y el cupo bien puestos, PeluDesk valida solo cada reserva. Veamos cómo configurarlos.",
  escenas: [
    {
      titulo: "Configuración del negocio",
      dice: "En la sección «Configuración del negocio» van el WhatsApp de recepción, el «Cupo de día» y el «Cupo de noche». Con esos números, la app te avisa cuando ya no cabe otro perro.",
      pasos: [["desplazar", "Configuración del negocio"], ["resaltar", "WhatsApp de recepción", 2600], ["resaltar", "Cupo de día", 2400]],
    },
    {
      titulo: "Direcciones",
      dice: "Abajo capturas la «Dirección del negocio» y la dirección de la base, desde donde sale la camioneta. Sirven para cotizar la recolección.",
      pasos: [["resaltar", "Dirección del negocio", 2600]],
    },
    {
      titulo: "Horario de atención",
      dice: "En «Horario de atención» marcas los días que abres y la hora de entrada y de salida de cada uno. Si un día no trabajas, lo dejas sin marcar. La app no deja reservar guardería en un día cerrado.",
      pasos: [["desplazar", "Horario de atención"], ["zoom", "Horario de atención", 1.35, 4200]],
    },
    {
      titulo: "Guardar",
      dice: "Cuando termines, aprieta «Guardar horario» o «Guardar configuración». Los cambios valen desde ese momento.",
      pasos: [["resaltar", "Guardar horario", 2600]],
    },
  ],
  resumen: ["Capturas el cupo de día y de noche, y el WhatsApp de recepción.", "Marcas los días y las horas en que abres.", "La app valida cada reserva contra tu horario y tu cupo."],
};
