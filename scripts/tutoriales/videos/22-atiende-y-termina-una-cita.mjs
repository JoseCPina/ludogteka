// 22 · Atiende y termina una cita (estética)
export default {
  rol: "estetica",
  inicio: "/estetica",
  gancho: "Llega el perro y empieza el baño. Así registras cada paso de la cita, y la app descuenta sola lo que gastaste del inventario.",
  escenas: [
    {
      titulo: "Tu agenda",
      dice: "Esta es la agenda de la persona de estética: sus citas del día con la hora, el perro y su estado. Toca una cita para abrirla.",
      pasos: [["resaltar", "Estética", 2400], ["clic", "Reservada", { nav: true }]],
    },
    {
      titulo: "La cita",
      dice: "En la cita ves el servicio, el perro y el precio. Desde aquí puedes «Reagendar», marcar «Marcar no llegó» o «Cancelar» si algo cambió.",
      pasos: [["resaltar", "Reagendar", 2400], ["resaltar", "Marcar no llegó", 2400]],
    },
    {
      titulo: "Iniciar la cita",
      dice: "Cuando el perro llega y lo recibes, aprieta «Iniciar cita». Queda registrado quién lo atiende y a qué hora empezó.",
      pasos: [["clic", "Iniciar cita"], ["esperar", 2500]],
    },
    {
      titulo: "Terminarla",
      dice: "Al entregar al perro, cierras la cita. La app descuenta del inventario los insumos de ese baño, según su receta, y la cuenta queda lista para cobrarse en caja.",
      pasos: [["esperar", 4000]],
    },
  ],
  resumen: ["Abres la cita desde tu agenda.", "«Iniciar cita» al recibir al perro, y cierras al entregarlo.", "Al terminar se descuenta el inventario y la cuenta queda lista para cobrar."],
};
