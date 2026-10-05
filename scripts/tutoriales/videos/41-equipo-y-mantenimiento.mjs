// 41 · Equipo y mantenimiento (recepción)
export default {
  inicio: "/inventario",
  gancho: "Tus tijeras, secadoras y máquinas también necesitan cuidado. Con la lista de equipo sabes cuál sirve, cuál está descompuesto y cuándo toca su mantenimiento.",
  escenas: [
    {
      titulo: "Equipo, aparte de los consumibles",
      dice: "El equipo no se gasta, se mantiene. Por eso vive aparte de los consumibles: cuántos hay, en qué estado está y cuándo se le dio mantenimiento por última vez.",
      pasos: [["esperar", 2500], ["desplazar", "Estética"], ["zoom", "css:main", 1.15, 3000]],
    },
    {
      titulo: "Un equipo nuevo",
      dice: "En «Nuevo equipo» escribes el «Nombre», el «Área», «Cuántos hay» y su «Estado»: bueno, necesita mantenimiento o descompuesto.",
      pasos: [["ir", "/inventario/equipo/nuevo"], ["escribir", "Nombre", "Secadora de piso {n3}"], ["elegir", "Área", "Estética"], ["rellenar", "Cuántos hay", "1"], ["elegir", "Estado", "Bueno"]],
    },
    {
      titulo: "Mantenimiento",
      dice: "Dices cada cuántos días necesita mantenimiento y qué se le hace, y la fecha del último. La app te avisa cuando toca. Cada cambio de estado queda en su historial.",
      pasos: [["rellenar", "Cada cuántos días", "90"], ["escribir", "Qué se le hace", "Limpieza de filtros"], ["resaltar", "Último mantenimiento", 2600]],
    },
    {
      titulo: "Guardar",
      dice: "Aprieta «Dar de alta». Si de tres tijeras una se descompone, sepárala en su propia fila: cada fila tiene un solo estado.",
      pasos: [["clic", "Dar de alta", { nav: true }], ["esperar", 2500]],
    },
  ],
  resumen: ["El equipo se mantiene, no se gasta.", "Cada fila tiene un solo estado y su historial.", "La app te avisa cuando toca el mantenimiento."],
};
