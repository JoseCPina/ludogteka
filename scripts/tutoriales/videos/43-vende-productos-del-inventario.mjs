// 43 · Vende productos del inventario (admin)
export default {
  rol: "admin",
  inicio: "/inventario/nuevo",
  gancho: "Si vendes croquetas, juguetes o shampoo en tu mostrador, el producto sale del mismo inventario y se descuenta solo al cobrar.",
  escenas: [
    {
      titulo: "Marca el insumo como vendible",
      dice: "Al dar de alta un consumible, o al editarlo, marca «Se vende en mostrador» y escribe su precio de venta. El precio de un producto siempre es el del catálogo.",
      pasos: [["resaltar", "Se vende en mostrador", 3000]],
    },
    {
      titulo: "Véndelo en caja",
      dice: "En «Caja» → «Venta rápida», el producto aparece en «¿Qué se vende?». Lo agregas, cobras, y la existencia baja sola. Un descuento sobre el precio del catálogo se maneja como cualquier descuento, con tope y motivo.",
      pasos: [["ir", "/caja/venta"], ["resaltar", "¿Qué se vende?", 3000]],
    },
    {
      titulo: "Se descuenta y se reporta",
      dice: "La venta se reporta aparte de los servicios, y el costo de lo vendido entra al costo de insumos de tu utilidad. Si te equivocas, quitas el renglón antes de cobrar y el producto regresa al inventario.",
      pasos: [["esperar", 3500]],
    },
  ],
  resumen: ["Marcas el insumo como «Se vende en mostrador».", "Lo vendes desde «Venta rápida» y se descuenta solo.", "Los reportes lo separan de los servicios."],
};
