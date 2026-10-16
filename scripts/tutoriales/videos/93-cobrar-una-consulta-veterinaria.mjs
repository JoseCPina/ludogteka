// 93 · Cómo se cobra una consulta veterinaria (médico veterinario)
// Todo es de lectura hasta donde el guion llega: abre una consulta nueva (borrador, como el video 80), muestra el recuadro
// de cargos y abre los formularios de ajustar y de agregar sin confirmarlos; no firma.
export default {
  rol: "mvz",
  inicio: "/veterinaria/expediente",
  gancho: "Lo que haces en la consulta se cobra solo. Antes de firmar ves exactamente qué va a la cuenta y, desde ahí, lo quitas o lo ajustas.",
  escenas: [
    {
      titulo: "Abre la consulta",
      dice: "Abre la consulta de la mascota, como siempre. Debajo del examen y del diagnóstico está el recuadro «Cargos de esta consulta»: todo lo que se va a cobrar, con su total.",
      pasos: [
        ["escribir", "Buscar mascota o dueño", "Tigre"],
        ["esperar", 1200],
        ["clic", "Tigre", { nav: true }],
        ["clic", "Nueva consulta"],
        ["clic", "Abrir la consulta", { nav: true }],
        ["esperar", 1800],
        ["desplazar", "Cargos de esta consulta"],
        ["resaltar", "Cargos de esta consulta", 2800],
      ],
    },
    {
      titulo: "Qué trae el cobro",
      dice: "Trae el tipo de consulta con su precio, las vacunas que aplicaste ese día y los medicamentos que surtiste. Si algo no tiene precio, lo ves marcado y lo capturas en Servicios y precios. Firmar nunca se bloquea por eso.",
      pasos: [["zoom", "Cargos de esta consulta", 1.25, 4200]],
    },
    {
      titulo: "Quitar o ajustar",
      dice: "Si hace falta, aprieta «Ajustar» para cambiar la cantidad o el precio, y cero si es una cortesía. «Quitar» saca el cargo. Los dos piden un motivo y todo queda registrado.",
      pasos: [["resaltar", "Ajustar", 2800], ["clic", "Ajustar"], ["esperar", 1400], ["resaltar", "Guardar el ajuste", 2800]],
    },
    {
      titulo: "Sumar un procedimiento",
      dice: "Para agregar una sutura, una curación o un medicamento del inventario, abre «Agregar un procedimiento o medicamento», elígelo o escribe el concepto y el precio, y apriétalo en «Agregar al cobro».",
      pasos: [["clic", "Agregar un procedimiento o medicamento"], ["esperar", 1400], ["resaltar", "Agregar al cobro", 3000]],
    },
    {
      titulo: "Firmar y cobrar",
      dice: "Al firmar, todo pasa a la cuenta de la mascota en Caja, donde se cobra como cualquier otra cuenta. Si está hospitalizada, o tiene un estimado aceptado, va a esa cuenta y no se cobra dos veces.",
      pasos: [["resaltar", "Firmar", 3400]],
    },
  ],
  resumen: ["Antes de firmar ves qué se va a cobrar.", "Puedes quitar o ajustar un cargo, siempre con motivo.", "Al firmar, la cuenta aparece en Caja lista para cobrar."],
};
