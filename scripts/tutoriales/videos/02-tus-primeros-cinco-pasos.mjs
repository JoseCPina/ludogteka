// 02 · Tus primeros pasos para operar (admin) — QA S16: cada paso se marca «Listo» solo cuando el negocio ya puede
// operar con él; arriba dice «Tu negocio ya puede operar» o la lista de lo que falta.
export default {
  inicio: "/bienvenida",
  gancho: "Acabas de abrir tu cuenta y no sabes por dónde empezar. La bienvenida te dice qué le falta a tu negocio para atender de verdad.",
  escenas: [
    {
      titulo: "La guía de bienvenida",
      dice: "Esta es la guía «Te damos la bienvenida». Arriba te dice si tu negocio ya puede operar o qué le falta, con su enlace. Un paso se marca «Listo» solo cuando ya puedes trabajar con él.",
      pasos: [["resaltar", "Te damos la bienvenida a Patitas & Co.", 2600], ["zoom", "css:ol", 1.25, 3200]],
    },
    {
      titulo: "Datos, servicios y precios",
      dice: "Primero tus «Datos del negocio»: el WhatsApp de recepción y tu dirección, la misma de tu página web. Luego «Servicios y precios»: todos los precios de lo que ofreces.",
      pasos: [["resaltar", "Datos del negocio", 2600], ["resaltar", "Servicios y precios", 2600]],
    },
    {
      titulo: "Según tu giro",
      dice: "Después el horario y lo de tu giro: quién atiende la estética, el médico con cédula, o los requisitos y el contrato para hospedar. Cada paso te lleva a donde se hace.",
      pasos: [["resaltar", "Horario y cupo", 2400], ["resaltar", "Quién atiende la estética", 2400], ["resaltar", "Tu primer cliente", 2400]],
    },
    {
      titulo: "WhatsApp y tu página web",
      dice: "Abajo te explica cómo se avisa a tus clientes por WhatsApp: tú ves el mensaje y lo mandas. Y tu página web viene incluida en tu plan.",
      pasos: [["desplazar", "Cómo se avisa a tus clientes por WhatsApp"], ["resaltar", "Cómo se avisa a tus clientes por WhatsApp", 2600], ["desplazar", "Tu página web viene incluida"], ["resaltar", "Tu página web viene incluida", 2600]],
    },
  ],
  resumen: ["La bienvenida dice si tu negocio ya puede operar o qué le falta.", "Cada paso se marca «Listo» solo cuando ya puedes trabajar con él.", "Puedes volver cuando quieras desde el aviso de arriba."],
};
