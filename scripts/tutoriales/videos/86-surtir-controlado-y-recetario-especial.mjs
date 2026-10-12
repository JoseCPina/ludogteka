// 86 · Sacar del inventario un producto controlado y el recetario especial (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/inventario",
  gancho: "Un producto controlado no sale del inventario sin su receta. PeluDesk tiene un candado que lo exige, y un registro para los folios del recetario especial.",
  escenas: [
    {
      titulo: "El candado de salida",
      dice: "Si un producto pide documento, no sale del inventario de ninguna otra forma: ni en la venta del mostrador, ni como consumo de una receta de estética, ni con un ajuste. Solo sale ligado a su receta.",
      pasos: [["clic", "Ketamina 10 % (anestésico)", { nav: true }], ["esperar", 1800], ["resaltar", "Datos y clasificación", 3000]],
    },
    {
      titulo: "Cómo se surte",
      dice: "El producto te dice qué documento pide. Para surtirlo, abres el registro del SITPV o el folio del recetario y aprietas el botón de surtir contra ese folio: eliges el lote y la cantidad, y el sistema revisa que no te pases de lo que ampara.",
      pasos: [["ir", "/veterinaria/recetas/sitpv"], ["esperar", 2200]],
    },
    {
      titulo: "El recetario especial",
      dice: "Los estupefacientes y algunos psicotrópicos se recetan en recetario especial. En «Recetario especial» aprietas «Registrar un folio» y escribes el folio, el código de barras, los días de tratamiento y la cantidad diaria. El total lo calcula la app.",
      pasos: [["ir", "/veterinaria/recetas/especial"], ["esperar", 2500]],
    },
    {
      titulo: "Si no te deja",
      dice: "Si el candado no te deja sacar algo, el mensaje dice qué documento falta. Una merma o un producto caducado no necesitan receta, pero piden su motivo y quedan en el libro de control.",
      pasos: [["esperar", 2600]],
    },
  ],
  resumen: ["Un controlado solo sale ligado a su receta.", "El recetario especial registra su folio y calcula el total.", "Mermas y caducados piden motivo y quedan en el libro."],
};
