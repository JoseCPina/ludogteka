// 35 · Venta rápida (recepción)
export default {
  inicio: "/caja",
  gancho: "Alguien entra solo por una bolsa de croquetas. No necesitas una reserva ni crear un cliente: vendes en segundos con la venta rápida.",
  escenas: [
    {
      titulo: "Venta rápida",
      dice: "En «Caja» aprieta «Venta rápida». Primero decides a quién: si no quieres capturarlo, la cuenta queda a nombre de «Público en general».",
      pasos: [["clic", "Venta rápida", { nav: true }], ["resaltar", "¿A quién?", 2800]],
    },
    {
      titulo: "Qué se vende",
      dice: "En «¿Qué se vende?» agregas productos de tu inventario que marcaste como vendibles, con su precio, o un concepto libre con «Agregar concepto libre». Al vender un producto, se descuenta del inventario.",
      pasos: [["resaltar", "¿Qué se vende?", 3000], ["resaltar", "Agregar concepto libre", 2800]],
    },
    {
      titulo: "Cobrar",
      dice: "Arriba del botón de cobro ves el total. Aprieta «Cobrar» y sigues a la misma pantalla de cobro de siempre. El turno la marca como venta de mostrador, aparte de los servicios.",
      pasos: [["resaltar", "css:button:has-text('Cobrar $')", 3000]],
    },
  ],
  resumen: ["La venta rápida no necesita reserva ni cliente.", "Los productos se descuentan del inventario.", "El turno la separa de los servicios."],
};
