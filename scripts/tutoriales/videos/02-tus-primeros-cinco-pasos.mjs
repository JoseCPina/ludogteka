// 02 · Tus primeros cinco pasos (admin)
export default {
  inicio: "/bienvenida",
  gancho: "Acabas de abrir tu cuenta y no sabes por dónde empezar. La guía de bienvenida te lleva de la mano en cinco pasos para dejar tu negocio listo.",
  escenas: [
    {
      titulo: "La guía de bienvenida",
      dice: "Esta es la guía «Te damos la bienvenida». Tiene pasos cortos y cada uno se marca solo cuando ya capturaste ese dato, así que siempre sabes cuánto te falta.",
      pasos: [["resaltar", "Te damos la bienvenida a Patitas & Co.", 2600], ["zoom", "css:ol", 1.25, 3200]],
    },
    {
      titulo: "Datos, servicios y precios",
      dice: "Primero tus «Datos del negocio»: el WhatsApp de recepción y tu dirección. Luego «Servicios y precios», donde pones lo que cobras por cada servicio.",
      pasos: [["resaltar", "Datos del negocio", 2600], ["resaltar", "Servicios y precios", 2600]],
    },
    {
      titulo: "Horario, empleados y clientes",
      dice: "Después el «Horario y cupo», «Tu primer empleado» y «Tu primer cliente». Cada paso tiene su botón que te lleva a la pantalla donde se hace de verdad.",
      pasos: [["resaltar", "Horario y cupo", 2400], ["resaltar", "Tu primer empleado", 2400], ["resaltar", "Tu primer cliente", 2400]],
    },
    {
      titulo: "Tu página web",
      dice: "Y si completas tu perfil, tu página web se activa gratis. Lo vemos en otro video.",
      pasos: [["desplazar", "Tu página web está incluida"], ["resaltar", "Tu página web está incluida", 3000]],
    },
  ],
  resumen: ["La guía de bienvenida tiene cinco pasos y se marca sola.", "Cada paso te lleva a la pantalla donde se hace de verdad.", "Puedes volver cuando quieras desde el aviso de arriba."],
};
