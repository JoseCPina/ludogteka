// 29 · Check-in (recepción)
export default {
  inicio: "/guarderia/checkin",
  gancho: "El check-in es el momento de recibir al perro: quién lo trae, cómo llega y qué pertenencias deja. Todo queda registrado.",
  escenas: [
    {
      titulo: "Elige la reserva",
      dice: "En «Check-in» salen las reservas que llegan hoy. Toca la del perro que acaba de llegar; aquí lo vemos con uno de hotel, y en guardería es igual. Si llega alguien sin reserva, usa «Walk-in (sin reserva)».",
      pasos: [["resaltar", "Check-in — Guardería", 2600], ["ir", "/hotel"], ["clic", "css:a[href^='/reservas/estancias/'][href$='/checkin']", { nav: true }]],
    },
    {
      titulo: "Quién lo entrega",
      dice: "Escribe «Quién entrega al perro» y, si quieres, su teléfono. Es útil para saber a quién llamar en el día.",
      pasos: [["escribir", "Quién entrega al perro", "Emilio Navarro"], ["escribir", "Teléfono (opcional)", "4420000216"]],
    },
    {
      titulo: "Cómo llega y qué trae",
      dice: "Anota cómo llega el perro en «Estado del perro a la llegada», toma la foto de llegada con «Tomar/subir foto», y agrega sus pertenencias, como correa o cobija, en «Agregar pertenencia».",
      pasos: [["escribir", "Estado del perro a la llegada (opcional)", "Llega tranquilo, sin heridas"], ["escribir", "Agregar pertenencia", "Cobija azul"], ["clic", "Agregar"], ["resaltar", "Tomar/subir foto", 2600]],
    },
    {
      titulo: "Confirmar",
      dice: "Cuando todo está listo, aprieta «Confirmar check-in». El perro pasa a Siguen aquí ahora. Si algo le falta al perro, como una vacuna, aquí también te avisa.",
      pasos: [["clic", "Confirmar check-in", { nav: true }], ["esperar", 2500]],
    },
  ],
  resumen: ["El check-in registra quién entrega al perro, cómo llega y qué trae.", "La foto de llegada queda en su bitácora.", "Al confirmar, el perro pasa a Siguen aquí ahora."],
};
