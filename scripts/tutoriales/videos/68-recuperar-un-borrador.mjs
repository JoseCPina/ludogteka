// 68 · Recupera lo que estabas escribiendo: borradores. SIN GRABAR.
// BORRADOR: textos del artículo «recuperar-un-borrador»; se cotejan con la pantalla final
// antes de grabar. Se graba en desarrollo con el negocio demo.
export default {
  rol: "recepcion",
  inicio: "/clientes/nuevo",
  gancho: "Se cerró la pantalla a la mitad de un registro. No pasa nada: se guardó solo.",
  escenas: [
    {
      titulo: "Se guarda solo",
      dice: "Mientras escribes en un formulario largo —un cliente, una mascota, un check-in o un contrato— lo que llevas se guarda solo. No tienes que hacer nada.",
      pasos: [["resaltar", "Nombre del dueño", 3000]],
    },
    {
      titulo: "Volver a abrirlo",
      dice: "Cuando vuelves al mismo formulario aparece el aviso «Tienes un borrador sin guardar». Aprieta «Recuperar borrador» y regresa todo lo que habías escrito.",
      pasos: [["resaltar", "Tienes un borrador sin guardar", 3000], ["resaltar", "Recuperar borrador", 2600]],
    },
    {
      titulo: "O empezar de cero",
      dice: "Si ya no lo necesitas, aprieta «Descartar». Y cuando guardas el formulario de verdad, el borrador se borra solo. Cada persona ve únicamente sus borradores.",
      pasos: [["resaltar", "Descartar", 2600]],
    },
  ],
  resumen: ["Los formularios largos se guardan solos mientras escribes.", "«Recuperar borrador» regresa lo escrito; «Descartar» empieza de cero.", "Al guardar de verdad, el borrador se borra; cada quien ve los suyos."],
};
