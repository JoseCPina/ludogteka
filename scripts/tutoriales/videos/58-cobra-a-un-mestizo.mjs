// 58 · Cómo se cobra a un mestizo y qué hacer cuando no hay precio (admin)
export default {
  rol: "admin",
  inicio: "/servicios",
  gancho: "Un mestizo no tiene raza que cotizar. Por eso su precio se arma con el tamaño y el largo del pelo. Veamos la tabla, cómo agendar y qué hacer cuando una combinación no tiene precio.",
  escenas: [
    {
      titulo: "La tabla del mestizo",
      dice: "Abre un baño y aprieta «Ver/editar tarifas». Al final de la tabla está el grupo «Mestizo / sin raza»: nueve precios, de chico, mediano y grande, cada uno con pelo corto, medio y largo.",
      pasos: [["clic", "Baño estético completo", { nav: true }], ["clic", "Ver/editar tarifas", { nav: true }], ["desplazar", "Mestizo / sin raza"], ["resaltar", "Mestizo / sin raza", 3200]],
    },
    {
      titulo: "Celdas calculadas",
      dice: "Si tu negocio empezó con precios calculados por proporción, salen marcados como calculados. Revísalos, ajústalos y guarda con «Revisar y guardar»: al guardar una celda, deja de ser calculada.",
      pasos: [["zoom", "Mestizo / sin raza", 1.3, 3800]],
    },
    {
      titulo: "Al agendar",
      dice: "Al agendar una cita de un mestizo, la app pide solo lo que falta: la talla y el pelaje del perro. Con eso calcula el precio sola, y el botón «Agendar cita» se activa cuando hay precio.",
      pasos: [["ir", "/estetica/nueva"], ["clic", "Ricardo Olmos"], ["elegir", "Servicio", 1], ["esperar", 3000]],
    },
    {
      titulo: "Cuando no hay precio",
      dice: "Si una combinación no tiene precio, la app no lo adivina. Te dice qué falta y te da dos salidas: llenar el precio en «Servicios» o registrar una excepción con motivo, solo para esa cita. Para la excepción necesitas ser admin o tener ese permiso.",
      pasos: [["desplazar", "Recargo manual (opcional)"], ["resaltar", "Recargo manual (opcional)", 3000]],
    },
  ],
  resumen: ["El mestizo cobra por tamaño y largo de pelo: nueve precios.", "Al agendar, la app pide la talla y el pelaje si faltan.", "Sin precio, se llena la tabla o se registra una excepción con motivo."],
};
