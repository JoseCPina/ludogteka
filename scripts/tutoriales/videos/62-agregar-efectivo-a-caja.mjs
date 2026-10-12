// 62 · Cómo agregar efectivo a la caja (admin)
// El demo rechaza la acción: se escribe el formulario y se detiene antes de confirmar; el efectivo ya agregado de la lista lo deja el sembrado.
export default {
  rol: "admin",
  inicio: "/caja/turno",
  gancho: "Se acabó el cambio y pediste prestado a la caja de al lado. Ese efectivo entra al cajón sin ser una venta. Así lo registras para que el corte siga cuadrando.",
  escenas: [
    {
      titulo: "Agregar efectivo",
      dice: "Con el turno abierto, aprieta «Agregar efectivo». Es dinero que entra al cajón sin ser una venta: cambio, un préstamo de otra caja o una aportación del dueño.",
      pasos: [["clic", "Agregar efectivo"], ["resaltar", "De dónde viene", 2600]],
    },
    {
      titulo: "Monto y origen",
      dice: "Escribe el monto, elige de dónde viene y, si quieres, una nota. Después aprieta «Confirmar efectivo agregado».",
      pasos: [["escribir", "Monto", "200"], ["elegir", "De dónde viene", "Préstamo de otra caja"], ["escribir", "Nota (opcional)", "Cambio de la caja de al lado"], ["resaltar", "Confirmar efectivo agregado", 2800]],
    },
    {
      titulo: "Cómo cuenta",
      dice: "Queda en «Efectivo agregado a este turno» y en los movimientos del turno. Cuenta en el efectivo esperado del corte, pero no es una venta: no aparece como ingreso en los reportes.",
      pasos: [["desplazar", "Efectivo agregado a este turno"], ["resaltar", "Efectivo agregado a este turno", 3400]],
    },
    {
      titulo: "Si te equivocaste",
      dice: "Si te equivocaste, usa «Cancelar este efectivo agregado», con su motivo. Nada se borra: queda tachado, con quién lo canceló y por qué.",
      pasos: [["resaltar", "Cancelar este efectivo agregado…", 3000]],
    },
  ],
  resumen: ["«Agregar efectivo» es para cambio, préstamos y aportaciones.", "Cuenta en el efectivo esperado del corte, pero no es una venta.", "Un error se cancela con motivo: nada se borra."],
};
