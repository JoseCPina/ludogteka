// 37 · Aplica un descuento (recepción)
export default {
  inicio: "/caja",
  gancho: "Un descuento mal registrado es dinero que se pierde sin saber por qué. Aquí aprendes a aplicarlo con tope y con motivo.",
  escenas: [
    {
      titulo: "Aplicar descuento",
      dice: "Dentro de la cuenta, en «Descuentos», aprieta «Aplicar descuento». Escoges el tipo de descuento y, si hace falta, el monto.",
      pasos: [["clic", "css:a[href^='/caja/cobrar/']", { nav: true }], ["desplazar", "Aplicar descuento"], ["resaltar", "Aplicar descuento", 3000]],
    },
    {
      titulo: "El tope de recepción",
      dice: "Recepción puede dar descuentos hasta un tope que fija el admin. Si necesitas dar más, hace falta que el admin lo haga, o que le delegue el permiso de descuentos sin tope. Siempre se escribe un motivo, y queda registrado con quién lo aplicó.",
      pasos: [["esperar", 4000]],
    },
    {
      titulo: "En la cuenta",
      dice: "El descuento aparece en la cuenta, y el saldo se recalcula solo. Si lo aplicaste por error, el admin puede quitarlo.",
      pasos: [["zoom", "Total cuenta", 1.4, 3200]],
    },
  ],
  resumen: ["Los descuentos llevan siempre un motivo.", "Recepción tiene un tope; arriba del tope, lo aplica el admin.", "El saldo se recalcula solo."],
};
