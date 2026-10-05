// 36 · Cargo suelto (recepción)
export default {
  inicio: "/caja/cargo",
  gancho: "A veces hay que cobrar algo que no estaba en la reserva: comida especial, una recolección. Para eso está el cargo suelto.",
  escenas: [
    {
      titulo: "Cargo suelto",
      dice: "En «Cargo suelto» buscas al cliente por el nombre del perro, del dueño o por su teléfono. Escoges la cuenta a la que se va a sumar.",
      pasos: [["resaltar", "Cargo suelto", 2400], ["resaltar", "Buscar por perro, dueño o teléfono", 2600]],
    },
    {
      titulo: "Qué se agrega",
      dice: "Escoges qué cargo aplicar. La comida especial es de monto libre: capturas el importe y qué se le dio, no se puede cambiar después, y si te equivocas se cancela con un motivo, nunca se borra.",
      pasos: [["escribir", "Buscar por perro, dueño o teléfono", "Emilio"], ["esperar", 2500]],
    },
    {
      titulo: "A la cuenta",
      dice: "El cargo se suma a la cuenta del cliente y lo cobras como cualquier otro, desde «Caja».",
      pasos: [["esperar", 6000]],
    },
  ],
  resumen: ["El cargo suelto suma algo a una cuenta sin necesidad de reserva.", "Se cancela con motivo; nunca se borra.", "Se cobra como cualquier otra cuenta."],
};
