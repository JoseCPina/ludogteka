// 40 · Consumibles (admin)
export default {
  rol: "admin",
  inicio: "/inventario",
  gancho: "Quedarte sin shampoo a media mañana cuesta clientes. Con tu inventario al día, la app te avisa antes de que se acabe.",
  escenas: [
    {
      titulo: "Tu inventario",
      dice: "En «Inventario» están tus consumibles, agrupados por área: «Estética», «Guardería y hotel», «Limpieza» y «Botiquín». Cada uno muestra cuánto hay y si ya está por debajo del mínimo.",
      pasos: [["resaltar", "Inventario", 2400], ["zoom", "Estética", 1.3, 3500]],
    },
    {
      titulo: "Un consumible nuevo",
      dice: "Con «Nuevo consumible» das de alta un insumo: su «Nombre», el «Área», la unidad en la que lo compras y la unidad en la que lo gastas, la «Existencia inicial» y el «Stock mínimo».",
      pasos: [["clic", "Nuevo consumible", { nav: true }], ["escribir", "Nombre", "Shampoo hipoalergénico {n3}"], ["elegir", "Área", "Estética"], ["elegir", "Unidad de compra", "Litro"], ["elegir", "Unidad de consumo", "Mililitro"]],
    },
    {
      titulo: "Existencia y mínimo",
      dice: "La «Existencia inicial» es lo que hay hoy, y el «Stock mínimo» es el nivel donde quieres que la app te avise. También marcas si el insumo caduca, o si se vende en mostrador.",
      pasos: [["rellenar", "Existencia inicial", "5"], ["rellenar", "Stock mínimo", "2"], ["resaltar", "Se vende en mostrador", 2600]],
    },
    {
      titulo: "Dar de alta",
      dice: "Aprieta «Dar de alta». Después registras las compras, el consumo, la merma y los ajustes desde la ficha de cada insumo. Quien tiene el permiso de costos ve además lo que costó cada compra.",
      pasos: [["clic", "Dar de alta", { nav: true }], ["esperar", 2500]],
    },
  ],
  resumen: ["Cada insumo tiene su unidad de compra, su unidad de consumo y su stock mínimo.", "La app te avisa antes de que se acabe.", "Las compras, el consumo y la merma se registran en la ficha de cada insumo."],
};
