// 31 · Reporte del día, fotos y videos (recepción)
export default {
  inicio: "/adentro",
  gancho: "Tus clientes quieren saber cómo le fue a su perro. Con las fotos, los videos y el reporte del día, se lo cuentas sin escribir un mensaje largo.",
  escenas: [
    {
      titulo: "Adentro ahora",
      dice: "En «Adentro ahora» están todos los perros que están en la casa, separados por «Guardería» y «Hotel». Desde aquí subes fotos y videos de cada uno.",
      pasos: [["resaltar", "Adentro ahora", 2400], ["zoom", "css:main", 1.15, 3500]],
    },
    {
      titulo: "Fotos y videos",
      dice: "Toca a un perro y sube sus fotos y videos directo desde el celular. Los videos duran hasta 45 segundos. Después mandas el enlace por WhatsApp: el dueño lo ve sin descargar nada, y el enlace vence solo.",
      pasos: [["clic", "Bruno", { nav: true }], ["esperar", 3500]],
    },
    {
      titulo: "El reporte de comportamiento",
      dice: "En «Fotos, videos y reporte» llenas el reporte del día de cada perro: cómo comió, cómo se portó y cómo durmió. Se genera una tarjeta con el estilo de tu negocio, lista para mandar por WhatsApp.",
      pasos: [["ir", "/guarderia"], ["resaltar", "Fotos, videos y reporte", 3000]],
    },
    {
      titulo: "Tu propio reporte",
      dice: "Y quien administra decide qué preguntas lleva el reporte, sus colores y cuántos días se conservan las fotos, en la sección «Reporte y fotos».",
      pasos: [["ir", "/admin/reporte-guarderia"], ["esperar", 3500]],
    },
  ],
  resumen: ["«Adentro ahora» junta a todos los perros de la casa.", "Subes fotos y videos y mandas un enlace por WhatsApp.", "El reporte del día se arma con las preguntas de tu negocio."],
};
