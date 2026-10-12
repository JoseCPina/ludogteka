// 68 · Recupera lo que estabas escribiendo: borradores (recepción)
export default {
  rol: "recepcion",
  inicio: "/clientes/nuevo",
  gancho: "Se cerró la pantalla a la mitad de un registro, o se fue la conexión. No pasa nada: lo que escribías se guardó solo. Veamos cómo se recupera.",
  escenas: [
    {
      titulo: "Se guarda solo",
      dice: "Mientras escribes en un formulario largo, como un cliente, una mascota, un check-in o un contrato, lo que llevas se guarda solo, unos segundos después de que dejas de teclear. No tienes que hacer nada.",
      pasos: [["escribir", "Nombre del dueño", "Carolina Beltrán"], ["escribir", "Dirección (opcional)", "Av. Juárez 120, Centro"], ["esperar", 3200]],
    },
    {
      titulo: "Volver a abrirlo",
      dice: "Cuando vuelves al mismo formulario, aparece el aviso «Tienes un borrador sin guardar». Aprieta «Recuperar borrador» y regresa todo lo que habías escrito.",
      pasos: [["ir", "/clientes"], ["ir", "/clientes/nuevo"], ["resaltar", "Tienes un borrador sin guardar", 3000], ["clic", "Recuperar borrador"], ["resaltar", "Nombre del dueño", 2600]],
    },
    {
      titulo: "O empezar de cero",
      dice: "Si ya no lo necesitas, aprieta «Descartar» y el borrador se borra. Y cuando guardas el formulario de verdad, el borrador también se borra solo. Cada persona ve únicamente sus propios borradores.",
      pasos: [["ir", "/clientes"], ["ir", "/clientes/nuevo"], ["clic", "Descartar"], ["esperar", 1800]],
    },
  ],
  resumen: ["Los formularios largos se guardan solos mientras escribes.", "«Recuperar borrador» regresa lo escrito; «Descartar» empieza de cero.", "Al guardar de verdad, el borrador se borra; cada persona ve solo los suyos."],
};
