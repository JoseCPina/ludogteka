// 80 · Hacer una consulta y firmarla (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/expediente",
  gancho: "La consulta es el centro del expediente: motivo, lo que cuenta el dueño, el examen, el diagnóstico y el plan. Se guarda sola mientras escribes y se firma con tu cédula.",
  escenas: [
    {
      titulo: "Abrir la consulta",
      dice: "Busca a la mascota en el expediente y aprieta «Nueva consulta». Elige el tipo de consulta y el médico a cargo. Nace como borrador, con la plantilla de su tipo.",
      pasos: [["escribir", "Buscar mascota o dueño", "Tigre"], ["esperar", 1200], ["clic", "Tigre", { nav: true }], ["clic", "Nueva consulta"], ["clic", "Abrir la consulta", { nav: true }], ["esperar", 2200]],
    },
    {
      titulo: "Escribirla",
      dice: "Escribe el motivo, la anamnesis, el examen físico y el plan. Mientras escribes, el borrador se guarda solo. Los signos vitales, como el peso y la temperatura, tienen su propio lugar.",
      pasos: [["escribir", "Peso (kg)", "5.2"], ["escribir", "Temperatura (°C)", "38.6"], ["resaltar", "Signos vitales", 2600]],
    },
    {
      titulo: "El diagnóstico",
      dice: "Busca el diagnóstico en el catálogo, por nombre o por cómo se le conoce, y márcalo como presuntivo o definitivo. Si no está, lo escribes tú.",
      pasos: [["escribir", "Buscar diagnóstico", "gastritis"], ["esperar", 1500], ["resaltar", "Diagnósticos", 2800]],
    },
    {
      titulo: "Firmar",
      dice: "Cuando termines, aprieta «Firmar». Firmas con tu nombre, tu cédula y el contenido queda sellado: una consulta firmada ya no se edita. Si hace falta agregar algo, se hace una adenda firmada.",
      pasos: [["resaltar", "Firmar", 3200]],
    },
  ],
  resumen: ["La consulta se guarda sola mientras escribes.", "El diagnóstico se busca en el catálogo.", "Firmada, ya no se edita: se agrega una adenda."],
};
