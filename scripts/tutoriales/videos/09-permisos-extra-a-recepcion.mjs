// 09 · Permisos extra a recepción (admin)
export default {
  inicio: "/admin/permisos",
  gancho: "Hay cosas que solo ve quien administra, como los costos o las tarifas. Pero a veces quieres darle a una persona de confianza un permiso en particular. Eso se hace aquí.",
  escenas: [
    {
      titulo: "Permisos de recepción",
      dice: "Esta es la pantalla de «Permisos de recepción». Cada persona de recepción aparece con una lista de permisos que puedes prender o apagar uno por uno.",
      pasos: [["resaltar", "Permisos de recepción", 2400], ["zoom", "Daniela Ríos", 1.3, 2800]],
    },
    {
      titulo: "Qué se puede delegar",
      dice: "Puedes delegar los costos de inventario, las tarifas, los reportes financieros, el personal, la configuración del negocio, las excepciones al reservar, los descuentos sin tope, las plantillas de contrato, la nómina, los gastos y los reportes de guardería.",
      pasos: [["zoom", "Costos y compras de inventario", 1.3, 3500]],
    },
    {
      titulo: "Dar un permiso",
      dice: "Para darlo, marca la casilla, por ejemplo «Precios y tarifas». Desde ese momento esa persona ve la sección de servicios y puede editar los precios. Para quitarlo, la desmarcas.",
      pasos: [["marcar", "Precios y tarifas"], ["esperar", 2500], ["marcar", "Precios y tarifas"], ["esperar", 1500]],
    },
    {
      titulo: "Lo que nunca se delega",
      dice: "Hay cosas que siempre son de admin: dar o quitar permisos, crear administradores, el tope de descuentos, las devoluciones y quitar una evaluación de comportamiento. Y todo queda en la bitácora.",
      pasos: [["desplazar", "Bitácora"], ["resaltar", "Bitácora", 2800]],
    },
  ],
  resumen: ["Delegas permisos uno por uno a cada persona de recepción.", "Los quitas cuando quieras.", "Lo más delicado nunca se delega, y todo queda en la bitácora."],
};
