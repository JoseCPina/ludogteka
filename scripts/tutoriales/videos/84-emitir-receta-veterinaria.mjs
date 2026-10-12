// 84 · Cómo emitir una receta (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/recetas/nueva",
  gancho: "Una receta veterinaria lleva la dosis, la vía, la frecuencia y los días, a nombre de un médico con cédula. PeluDesk calcula la cantidad a surtir y arma el original y las copias.",
  escenas: [
    {
      titulo: "Una receta nueva",
      dice: "En «Recetas», «Nueva receta», elige a la mascota. Si ya firmaste una consulta de esa mascota, puedes recetar desde esa consulta, y el diagnóstico se copia solo.",
      pasos: [["escribir", "Buscar mascota o dueño", "Michi"], ["tecla", "Enter"], ["esperar", 1500], ["clic", "Michi", { nav: true }], ["esperar", 1200]],
    },
    {
      titulo: "Los medicamentos",
      dice: "Agrega cada medicamento, del inventario clínico o escrito a mano. Cada uno pide la dosis, la vía, la frecuencia y la duración en días. El tiempo de retiro es opcional.",
      pasos: [["elegir", "Del inventario clínico", "Meloxicam"], ["escribir", "Dosis (como se escribe)", "0.1 mL por toma"], ["escribir", "Vía de administración", "Oral"], ["escribir", "Frecuencia (como se escribe)", "Cada 24 horas"], ["resaltar", "Duración (días)", 2400]],
    },
    {
      titulo: "La cantidad a surtir",
      dice: "La cantidad a surtir se calcula sola con la dosis por toma, cada cuántas horas y los días de tratamiento. Si necesitas otra cantidad, la escribes tú.",
      pasos: [["escribir", "Dosis por toma (número, para calcular)", "0.1"], ["escribir", "Cada cuántas horas (número)", "24"], ["escribir", "Duración (días)", "5"], ["resaltar", "Cantidad a surtir", 3000]],
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
  resumen: ["La cantidad a surtir se calcula sola.", "Sale el original y las copias, a nombre del médico.", "Una receta no se edita: se anula con motivo."],
};
