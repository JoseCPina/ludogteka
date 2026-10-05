// 24 · Receta de consumo por servicio (admin)
export default {
  rol: "admin",
  inicio: "/servicios",
  gancho: "¿Cuánto shampoo gastas en cada baño? Si lo dejas escrito una vez, PeluDesk descuenta el inventario solo cada vez que terminas una cita.",
  escenas: [
    {
      titulo: "Receta de consumo",
      dice: "Entra al servicio y aprieta «Receta de consumo». Aquí dices qué insumos gasta ese servicio y cuánto.",
      pasos: [["clic", "Baño estético completo", { nav: true }], ["clic", "Receta de consumo", { nav: true }], ["resaltar", "Receta de consumo — Baño estético completo", 2600]],
    },
    {
      titulo: "Por tamaño",
      dice: "La receta puede cambiar por «Tamaño» del perro: un perro grande gasta más shampoo que uno chico. Escoges el tamaño, el «Insumo» y la «Cantidad».",
      pasos: [["resaltar", "Tamaño", 2400], ["resaltar", "Insumo", 2400], ["resaltar", "Cantidad", 2400]],
    },
    {
      titulo: "Agregar y quitar",
      dice: "Con «Agregar línea» sumas otro insumo, y con «Quitar» lo retiras. Al terminar una cita, la app descuenta todo del inventario sin que hagas nada.",
      pasos: [["resaltar", "Agregar línea", 2800], ["resaltar", "Quitar", 2400]],
    },
  ],
  resumen: ["La receta dice qué insumos gasta cada servicio.", "Puede cambiar por tamaño del perro.", "Al terminar la cita, el inventario se descuenta solo."],
};
