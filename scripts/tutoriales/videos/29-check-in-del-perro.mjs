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
      dice: "En «Quién entrega al perro», que es obligatorio, escoge al dueño o a su contacto de emergencia. Si lo trae alguien más, escoge Otra persona y escribe su nombre y su teléfono: queda registrado quién lo dejó.",
      pasos: [["mover", "css:#checkin-entrega-quien"], ["js", ({ page }) => page.locator("#checkin-entrega-quien").selectOption("otra")], ["escribir", "Nombre de la otra persona * (obligatorio)", "Emilio Navarro"], ["escribir", "Teléfono de esa persona (recomendado)", "4420000216"]],
    },
    {
      titulo: "Cómo llega y qué trae",
      dice: "Anota cómo llega el perro en «Estado del perro a la llegada», toma la foto de llegada con «Tomar/subir foto», y agrega sus pertenencias, como correa o cobija, en «Agregar pertenencia».",
      pasos: [["escribir", "Estado del perro a la llegada (opcional)", "Llega tranquilo, sin heridas"], ["escribir", "Agregar pertenencia", "Cobija azul"], ["clic", "Agregar"], ["resaltar", "Tomar/subir foto", 2600]],
    },
    {
      titulo: "Confirmar",
      dice: "Cuando todo está listo, aprieta «Confirmar check-in». La pantalla se cierra con «Check-in registrado» y la hora a la que quedó, con las «Pertenencias recibidas» y quién entregó al perro: ya no se puede registrar dos veces. El perro pasa a Siguen aquí ahora. Si le falta algo, como una vacuna, el aviso te dice cuál.",
      pasos: [["clic", "Confirmar check-in"], ["esperar", 3500], ["resaltar", "Check-in registrado", 2400], ["resaltar", "Pertenencias recibidas", 2800]],
    },
  ],
  resumen: ["El check-in registra quién entrega al perro, cómo llega y qué trae.", "La foto de llegada queda en su bitácora.", "Al confirmar, el perro pasa a Siguen aquí ahora."],
};
