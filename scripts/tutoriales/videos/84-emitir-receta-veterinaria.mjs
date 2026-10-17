// 84 · Cómo emitir una receta (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/recetas/nueva",
  gancho: "Una receta veterinaria lleva la dosis, la vía, la frecuencia y los días, a nombre de un médico con cédula. PeluDesk calcula la cantidad a surtir y arma el original y las copias.",
  escenas: [
    {
      titulo: "Una receta nueva",
      dice: "En «Recetas», «Nueva receta», elige a la mascota. Si ya firmaste una consulta, recétale desde esa consulta: los medicamentos salen prellenados con su «Tratamiento».",
      pasos: [["escribir", "Buscar mascota o dueño", "Canela"], ["tecla", "Enter"], ["esperar", 1500], ["clic", "css:a[href*='recetas/nueva?perro=']:has-text('Canela'):has-text('Mariana')", { nav: true }], ["esperar", 1200], ["clic", "css:a[href*='consulta='] >> nth=0", { nav: true }], ["esperar", 1200], ["resaltar", "css:[data-receta-prellenada]", 3000]],
    },
    {
      titulo: "Los medicamentos",
      dice: "Revisa cada medicamento y corrige lo que haga falta: elígelo del inventario clínico o déjalo escrito a mano, con su dosis, vía, frecuencia y días. El tiempo de retiro es opcional.",
      pasos: [["elegir", "Del inventario clínico", "Enrofloxacina"], ["escribir", "Vía de administración", "Ótica"], ["resaltar", "Frecuencia (como se escribe)", 2400]],
    },
    {
      titulo: "La cantidad a surtir",
      dice: "La cantidad a surtir se calcula sola con la dosis, la frecuencia y los días, aunque estén escritos como «1 mL» o «cada 12 horas». Si necesitas otra cantidad, la escribes tú.",
      pasos: [["resaltar", "Cantidad a surtir", 3200]],
    },
    {
      titulo: "Emitir, imprimir y mandar",
      dice: "Aprieta «Emitir receta». Imprime el original y las copias, o mándale al dueño una liga para que la vea en su celular. Una receta no se edita: si te equivocas, se anula con motivo y se emite otra.",
      pasos: [["clic", "Emitir receta", { nav: true }], ["esperar", 2600]],
    },
    {
      titulo: "Qué se receta aquí",
      dice: "Aquí se recetan los medicamentos de receta simple y con cédula. Los de Grupo I y los estupefacientes llevan su propio proceso, y la pantalla te dice a dónde ir.",
      pasos: [["esperar", 2600]],
    },
  ],
  resumen: ["Desde una consulta firmada, la receta sale prellenada con su Tratamiento.", "La cantidad a surtir se calcula sola.", "Una receta no se edita: se anula con motivo."],
};
