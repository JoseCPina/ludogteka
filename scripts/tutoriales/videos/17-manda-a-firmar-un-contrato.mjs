// 17 · Mandar a firmar un contrato (recepción)
export default {
  inicio: "/recepcion/contratos",
  gancho: "Un contrato sin firmar es un riesgo para tu negocio. Con esta pantalla sabes exactamente quién falta por firmar y se lo recuerdas en un toque.",
  escenas: [
    {
      titulo: "Contratos por firmar",
      dice: "En «Contratos por firmar» están todos los contratos que esperan al dueño. Van del más viejo al más nuevo, con los días que llevan esperando, y también avisan en el tablero del día.",
      pasos: [["resaltar", "Pendientes de firma", 2800], ["zoom", "css:main", 1.15, 3500]],
    },
    {
      titulo: "Recordar por WhatsApp",
      dice: "Con «Recordar por WhatsApp» se abre un mensaje ya escrito, con el nombre del dueño, el perro y el enlace a su portal. Solo lo mandas. El dueño firma desde su celular, con el dedo.",
      pasos: [["resaltar", "Recordar por WhatsApp", 3500]],
    },
    {
      titulo: "El expediente del perro",
      dice: "Con «Ver expediente» entras al perro. En su sección «Contrato» puedes generar el contrato, ver el borrador, o subir el firmado en papel si el dueño lo firmó en el mostrador.",
      pasos: [["clic", "Ver expediente", { nav: true }], ["desplazar", "Contrato"], ["zoom", "Contrato", 1.3, 3500]],
    },
  ],
  resumen: ["«Contratos por firmar» lista quién falta, del más viejo al más nuevo.", "«Recordar por WhatsApp» manda un mensaje ya escrito.", "Desde el expediente generas el contrato o subes el firmado en papel."],
};
