// 20 · Precios de estética (admin)
export default {
  rol: "admin",
  inicio: "/servicios",
  gancho: "El precio de un baño depende de la raza, del tamaño y del pelo del perro. Aquí aprendes a capturar tus tarifas una vez y a que la app cotice sola cada cita.",
  escenas: [
    {
      titulo: "Tus servicios",
      dice: "En «Servicios» están todo lo que cobras: los baños de estética, la guardería, el hotel, la recolección y los paquetes. Son tres baños: el completo, el rapado y el exprés. Cada uno tiene su propia tabla de precios.",
      pasos: [["resaltar", "Baño estético completo", 2600], ["resaltar", "Baño estético rapado", 2200], ["resaltar", "Baño exprés", 2200]],
    },
    {
      titulo: "El servicio",
      dice: "Entra a un servicio. Aquí decides de qué depende su precio: del grupo de raza, del tamaño o del pelaje. «Ver/editar tarifas» abre su tabla de precios, y «Receta de consumo» dice qué insumos gasta.",
      pasos: [["clic", "Baño estético completo", { nav: true }], ["resaltar", "Ver/editar tarifas", 2800]],
    },
    {
      titulo: "La tabla de tarifas",
      dice: "En la tabla pones el precio por cada grupo de raza. Si el pelo llega maltratado, hay un precio alterno en «Si llega maltratado». Y con «No aplica» marcas lo que ese grupo no ofrece. Un grupo sin precio no se cotiza: la app nunca adivina.",
      pasos: [["clic", "Ver/editar tarifas", { nav: true }], ["zoom", "Si llega maltratado", 1.35, 4000]],
    },
    {
      titulo: "Cambios de precio",
      dice: "Cuando subes un precio, escribes desde qué fecha vale con «Vigente desde» y aprietas «Revisar y guardar». Las citas ya agendadas conservan el precio que tenían; el historial de precios guarda todo.",
      pasos: [["resaltar", "Vigente desde", 2600], ["resaltar", "Revisar y guardar", 2600], ["desplazar", "Historial de precios"], ["resaltar", "Historial de precios", 2600]],
    },
    {
      titulo: "Aumentar todo de golpe",
      dice: "Y si necesitas subir todo un porcentaje, usas «Incrementar precios actuales en», y «Aplicar a precios actuales».",
      pasos: [["desplazar", 0], ["resaltar", "Incrementar precios actuales en", 3000]],
    },
  ],
  resumen: ["Cada servicio tiene su tabla de precios por grupo de raza, talla o pelaje.", "Un grupo sin precio no se cotiza; la app nunca adivina.", "Un cambio de precio no toca las citas ya agendadas."],
};
