// 32 · Turno y corte de caja (recepción)
export default {
  inicio: "/caja",
  gancho: "Al final del día, el dinero que debe haber en la caja tiene que coincidir con lo que hay. El turno de caja y el corte te lo dicen en un minuto.",
  escenas: [
    {
      titulo: "El turno de caja",
      dice: "Todo cobro ocurre dentro de un turno. Arriba en «Caja» ves si hay un turno abierto, con su fondo, y cuánto está pendiente de cobrar hoy. Sin turno abierto, no se puede cobrar ni vender paquetes.",
      pasos: [["resaltar", "Turno abierto", 3000], ["clic", "Turno y arqueo", { nav: true }]],
    },
    {
      titulo: "Movimientos del turno",
      dice: "En «Turno de caja» están los «Movimientos de este turno»: cada cobro, venta, devolución y retiro, por método de pago. Aquí está todo lo que entró y salió.",
      pasos: [["resaltar", "Movimientos de este turno", 2800], ["zoom", "Movimientos de este turno", 1.3, 3500]],
    },
    {
      titulo: "Retiros",
      dice: "Si sacas efectivo de la caja, por ejemplo para pagar algo, aprieta «Registrar retiro» y anota el motivo. Si te equivocas, un retiro se cancela con su motivo, y queda tachado, nunca borrado.",
      pasos: [["resaltar", "Registrar retiro", 3000]],
    },
    {
      titulo: "Cerrar el turno",
      dice: "Al terminar, aprieta «Cerrar turno»: cuentas el efectivo que hay y la app lo compara con lo que debía haber. Si hay diferencia, queda registrada. Cada quien cierra el turno que abrió, y el admin puede cerrar cualquiera.",
      pasos: [["resaltar", "Cerrar turno", 3200], ["desplazar", "Tus turnos cerrados"], ["resaltar", "Tus turnos cerrados", 2600]],
    },
  ],
  resumen: ["Todo cobro ocurre dentro de un turno de caja.", "«Movimientos de este turno» muestra cada entrada y salida.", "Al cerrar, la app compara el efectivo contado contra el esperado."],
};
