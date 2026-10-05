// 30 · Check-out y cobro (recepción)
export default {
  inicio: "/guarderia/checkout",
  gancho: "Es hora de que el perro se vaya a casa. En el check-out confirmas quién lo recoge, revisas los cargos y cobras, todo en el mismo paso.",
  escenas: [
    {
      titulo: "Elige la salida",
      dice: "En «Check-out» están los perros que se van hoy. Toca el que están recogiendo.",
      pasos: [["resaltar", "Check-out — Guardería", 2400], ["ir", "/recepcion"], ["clic", "Bruno", { nav: true }]],
    },
    {
      titulo: "Quién recoge",
      dice: "La app pregunta si quien llega es el dueño. Escoge «Sí, es el dueño» o «No, persona autorizada», y escribe «Quién recoge al perro». Así queda registrado a quién se le entregó.",
      pasos: [["resaltar", "Sí, es el dueño", 2400], ["clic", "No, persona autorizada"], ["escribir", "Quién recoge al perro", "Héctor Ibarra"]],
    },
    {
      titulo: "Cargos extra",
      dice: "Si le diste comida especial, o hubo recolección, lo agregas con «Aplicar cargo», escoges cuál, su importe y qué se le dio, y aprietas «Aplicar». Se suma a la cuenta.",
      pasos: [["resaltar", "Aplicar cargo", 3000]],
    },
    {
      titulo: "Confirmar la salida",
      dice: "Aprieta «Confirmar salida». La app te lleva a la pantalla de cobro con la cuenta completa, y ahí cobras. Lo vemos en el video de cobros.",
      pasos: [["clic", "Confirmar salida", { nav: true }], ["esperar", 3500]],
    },
  ],
  resumen: ["Registras quién recoge al perro.", "Los cargos extra se aplican en el mismo paso.", "«Confirmar salida» te lleva directo al cobro."],
};
