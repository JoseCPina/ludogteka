// 30 · Check-out y cobro (recepción)
// Las estancias en curso del demo traen pertenencias (las siembra sembrar-demo.mjs en el check-in).
export default {
  inicio: "/guarderia/checkout",
  gancho: "Es hora de que el perro se vaya a casa. En el check-out confirmas quién lo recoge, le entregas sus cosas y revisas los cargos. Después cobras en Caja.",
  escenas: [
    {
      titulo: "Elige la salida",
      dice: "En «Check-out» están los perros que se van hoy. Toca el que están recogiendo.",
      pasos: [["resaltar", "Check-out — Guardería", 2400], ["clic", "css:a[href^='/reservas/estancias/'][href$='/checkout']", { nav: true }]],
    },
    {
      titulo: "Las pertenencias",
      dice: "Arriba están las pertenencias que dejó. Marca cada una que se lleva, o aprieta «Entregué todo». Si alguna no se entrega, escribe el «Motivo de lo que no se entrega»: sin él no se cierra la salida.",
      pasos: [
        ["resaltar", "Pertenencias — confirma la entrega de cada una", 2600],
        ["resaltar", "Motivo de lo que no se entrega", 2800],
        ["resaltar", "Entregué todo", 1800],
        ["clic", "Entregué todo"],
        ["esperar", 1500],
      ],
    },
    {
      titulo: "Quién recoge",
      dice: "La app pregunta si quien llega es el dueño. Escoge «Sí, es el dueño» o «No, persona autorizada», y escribe «Quién recoge al perro», que es obligatorio. Así queda registrado a quién se le entregó.",
      pasos: [["resaltar", "Sí, es el dueño", 2400], ["clic", "No, persona autorizada"], ["escribir", "Quién recoge al perro", "Héctor Ibarra"]],
    },
    {
      titulo: "Cargos extra",
      dice: "Si le diste comida especial, o hubo recolección, lo agregas con «Aplicar cargo», escoges cuál, su importe y qué se le dio, y aprietas «Aplicar». Se suma a la cuenta.",
      pasos: [["resaltar", "Aplicar cargo", 3000]],
    },
    {
      titulo: "Confirmar la salida",
      dice: "Aprieta «Confirmar salida». La salida queda registrada con quién lo recogió y qué pertenencias se llevó. La cuenta queda en «Caja», en «Cuentas abiertas de hoy», y ahí cobras. Lo vemos en el video de cobros.",
      pasos: [["clic", "Confirmar salida"], ["esperar", 2500], ["resaltar", "Este perro ya salió", 2600], ["ir", "/caja"], ["resaltar", "Cuentas abiertas de hoy", 2800]],
    },
  ],
  resumen: ["Registras quién recoge al perro y qué pertenencias se lleva.", "Los cargos extra se aplican en el mismo paso.", "La cuenta queda abierta en Caja para cobrarla."],
};
