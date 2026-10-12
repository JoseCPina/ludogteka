// 74 · El carnet de vacunas y desparasitaciones (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/carnet",
  gancho: "El carnet de cada mascota guarda sus vacunas y desparasitaciones con su lote y el médico que las aplicó. Se imprime, y cada dosis genera su recordatorio. Veamos cómo se llena.",
  escenas: [
    {
      titulo: "Busca la mascota",
      dice: "En «Carnets» busca a la mascota por su nombre, el de su dueño o su teléfono y ábrela.",
      pasos: [["escribir", "Buscar mascota o dueño", "Michi"], ["tecla", "Enter"], ["esperar", 1500], ["clic", "Michi", { nav: true }], ["esperar", 1500]],
    },
    {
      titulo: "Registrar una vacuna",
      dice: "Aprieta «Registrar vacuna». Elige el producto del inventario clínico y su lote, y se descuenta una dosis del lote. Si no está en el inventario, escribe el nombre y el lote.",
      pasos: [["clic", "Registrar vacuna"], ["escribir", "Lote (texto, si no es del inventario)", "FEL-2026-04"], ["resaltar", "Médico veterinario que aplica", 2600]],
    },
    {
      titulo: "La próxima dosis",
      dice: "Pon la fecha de aplicación y la fecha de la próxima dosis: con ella se programan los recordatorios para el dueño. Elige al médico que aplica y guarda.",
      pasos: [["resaltar", "Próxima dosis (opcional)", 3000]],
    },
    {
      titulo: "Desparasitaciones",
      dice: "Las desparasitaciones se registran igual, con «Registrar desparasitación»: el producto, si es interna, externa o las dos, y la fecha de la próxima.",
      pasos: [["desplazar", "Registrar desparasitación"], ["resaltar", "Registrar desparasitación", 2800]],
    },
    {
      titulo: "Si te equivocaste",
      dice: "Un registro no se borra. Si te equivocaste, usa «Anular» y escribe el motivo: queda anulado con tu nombre. Y con «Ver e imprimir carnet» sacas el carnet de la mascota.",
      pasos: [["desplazar", 0], ["resaltar", "Anular", 3000], ["resaltar", "Ver e imprimir carnet", 2800]],
    },
  ],
  resumen: ["Cada vacuna lleva su lote, su médico y su próxima dosis.", "La próxima dosis programa los recordatorios.", "Un registro no se borra: se anula con motivo."],
};
