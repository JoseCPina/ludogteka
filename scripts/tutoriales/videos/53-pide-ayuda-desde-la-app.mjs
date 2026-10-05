// 53 · Pide ayuda (recepción)
export default {
  inicio: "/ayuda",
  gancho: "Si algo no te sale, no estás solo. En PeluDesk tienes artículos, videos, un asistente y un ticket para cuando todo lo demás falle.",
  escenas: [
    {
      titulo: "Ayuda",
      dice: "En «Ayuda» está todo junto: el asistente, los videos y los artículos de cada pantalla, solo de los módulos que tu negocio tiene prendidos.",
      pasos: [["resaltar", "Ayuda", 2400], ["resaltar", "Asistente", 2600]],
    },
    {
      titulo: "Videos y artículos",
      dice: "En «Videos» están los tutoriales de esta serie, con subtítulos y a la velocidad que quieras. Y los artículos explican cada tarea paso a paso. Además, en cada pantalla, el signo de interrogación y el botón de video te llevan directo al de esa pantalla.",
      pasos: [["desplazar", "Videos"], ["resaltar", "Videos", 2800], ["desplazar", "Artículos"], ["resaltar", "Artículos", 2800]],
    },
    {
      titulo: "El asistente",
      dice: "El asistente contesta tus dudas de uso con lo que dice la documentación, y siempre te dice de qué artículo lo sacó. Nunca ve los datos de tu negocio.",
      pasos: [["desplazar", 0], ["zoom", "Asistente", 1.3, 3500]],
    },
    {
      titulo: "Crear un ticket",
      dice: "Si no lo resuelve, aprieta «Crear ticket». Escribes el «Asunto» y «¿Qué pasó?», y si puedes, una captura. El ticket lleva solo la pantalla en la que estabas, y te contestamos en la misma app.",
      pasos: [["clic", "Crear ticket", { nav: true }], ["resaltar", "Asunto", 2600], ["resaltar", "¿Qué pasó?", 2600]],
    },
  ],
  resumen: ["En «Ayuda» tienes artículos, videos y asistente.", "El botón «?» y «¿Cómo se hace?» te llevan a lo de cada pantalla.", "Un ticket lleva solo la pantalla y tu conversación."],
};
