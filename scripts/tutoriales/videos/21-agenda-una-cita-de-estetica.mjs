// 21 · Agenda una cita de estética (recepción)
export default {
  inicio: "/estetica",
  gancho: "Una cita de estética se agenda en menos de dos minutos. Escoges al perro, el baño, quién lo atiende y la hora, y la app calcula el precio sola.",
  escenas: [
    {
      titulo: "La agenda",
      dice: "En «Estética» ves la agenda de cada estilista, por «Día» o por «Semana». Con «← Anterior», «Hoy» y «Siguiente →» te mueves de fecha. Para agendar, aprieta «Agendar».",
      pasos: [["resaltar", "Semana", 2400], ["clic", "Semana"], ["esperar", 2000], ["clic", "Día"], ["clic", "Agendar", { nav: true }]],
    },
    {
      titulo: "Busca al cliente",
      dice: "Busca al cliente por el nombre del perro, del dueño o por su teléfono, y escógelo de la lista. Si es nuevo, tienes el botón «Nuevo cliente» para darlo de alta ahí mismo, con solo su nombre y su WhatsApp.",
      pasos: [["resaltar", "Nuevo cliente", 2600], ["clic", "Ricardo Olmos"]],
    },
    {
      titulo: "Perro, baño y estilista",
      dice: "Escoge el «Perro» y el «Servicio»: el baño completo, el rapado o el exprés. Elige quién lo atiende en «Empleado». Si el perro llega con el pelo maltratado, la app cobra el precio alterno del mismo baño.",
      pasos: [["elegir", "Servicio", 1], ["elegir", "Empleado", 1], ["resaltar", "Servicio", 2400]],
    },
    {
      titulo: "El precio",
      dice: "Fíjate en el precio que calcula la app según la raza, el tamaño y el pelo del perro. Y recuerda: el costo puede aumentar según el tipo de pelo y el cuidado previo.",
      pasos: [["esperar", 3500]],
    },
    {
      titulo: "Fecha y hora",
      dice: "Pon la «Fecha y hora» y aprieta «Agendar cita». Una cita fuera del horario sale resaltada en naranja en la agenda.",
      pasos: [["rellenar", "Fecha y hora", "{fechaCita}"], ["clic", "Agendar cita", { nav: true }], ["esperar", 2500]],
    },
  ],
  resumen: ["Agendas desde «Estética» → «Agendar».", "La app calcula el precio por raza, talla y pelo.", "Una cita fuera del horario sale en naranja en la agenda."],
};
