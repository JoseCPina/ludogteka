// 23 · Pelo maltratado, recargos y excepciones (recepción)
export default {
  rol: "admin",
  inicio: "/estetica/nueva",
  gancho: "Hay perros que llegan con el pelo hecho nudos, o razas que todavía no tienen precio. Veamos cómo cobrar justo, con un motivo, y dejando todo registrado.",
  escenas: [
    {
      titulo: "Elige al perro",
      dice: "Agenda la cita como siempre: escoge al cliente y a su perro, y el servicio.",
      pasos: [["clic", "Ricardo Olmos"], ["elegir", "Servicio", 1], ["elegir", "Empleado", 1]],
    },
    {
      titulo: "Pelo maltratado",
      dice: "Si el servicio tiene un precio alterno y el perro llegó con el pelo maltratado, marca la casilla. Cobra el precio alterno del mismo baño; no es otro servicio.",
      pasos: [["desplazar", "Recargo manual (opcional)"], ["resaltar", "Recargo manual (opcional)", 2800]],
    },
    {
      titulo: "El recargo manual",
      dice: "Si necesitas cobrar de más, por ejemplo por muchos nudos, escribe el «Recargo manual (opcional)» y su «Motivo del recargo». Se suma al precio, y queda registrado con tu nombre y el motivo. Solo admin o quien tenga el permiso de excepciones puede hacerlo.",
      pasos: [["rellenar", "Recargo manual (opcional)", "60"], ["escribir", "Motivo del recargo", "Muchos nudos y cuidado previo"]],
    },
    {
      titulo: "Perros sin precio automático",
      dice: "Y si un perro de pelo medio o largo no tiene grupo de precio, la app no adivina: te pide asignar el grupo, o registrar una excepción con motivo, solo para esa cita.",
      pasos: [["esperar", 3500]],
    },
  ],
  resumen: ["El pelo maltratado cobra el precio alterno del mismo baño.", "El recargo manual lleva un motivo y queda registrado con tu nombre.", "Si un perro no tiene precio automático, se asigna su grupo o se registra una excepción."],
};
