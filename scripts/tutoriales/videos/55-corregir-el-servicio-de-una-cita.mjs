// 55 · Cómo corregir el servicio de una cita (admin)
export default {
  rol: "admin",
  inicio: "/estetica",
  gancho: "A veces se captura un servicio que no era: baño completo cuando fue exprés. Así lo corriges, ves cuánto cambia el precio y qué pasa con el cobro, sin dejar nada a medias.",
  escenas: [
    {
      titulo: "Abre la cita",
      dice: "Entra a Estética y abre la cita que se capturó mal. Funciona antes de empezar, con el servicio en curso y también cuando ya terminó y se cobró, como esta.",
      pasos: [["resaltar", "Estética", 2200], ["clic", "Finalizada", { nav: true }]],
    },
    {
      titulo: "Corregir servicio",
      dice: "Abajo, en «Servicio de la cita», aprieta «Corregir servicio». Hace falta ser admin o tener el permiso para corregir el servicio de citas, que el admin le da a cada persona de recepción.",
      pasos: [["desplazar", "Corregir servicio"], ["clic", "Corregir servicio"]],
    },
    {
      titulo: "Escoge el servicio correcto",
      dice: "Escoge el servicio correcto y la app calcula el precio con las reglas de siempre: el grupo de raza, la talla y el pelaje. Ves el precio de antes, el de ahora y la diferencia.",
      pasos: [["elegir", "Servicio correcto", "exprés"], ["esperar", 2500], ["resaltar", "Precio:", 3000]],
    },
    {
      titulo: "Qué pasa con el cobro",
      dice: "Si la cita ya se cobró, el cobro original no se toca. Si ahora cuesta más, la cuenta queda con un cobro adicional; si cuesta menos, queda un saldo a favor del cliente. Un cobro que estuviera esperando en la terminal se cancela antes.",
      pasos: [["esperar", 4500]],
    },
    {
      titulo: "Motivo y confirmar",
      dice: "Escribe el motivo, que es obligatorio, y aprieta «Confirmar corrección». La app te dice cómo quedó la cuenta.",
      pasos: [["escribir", "Motivo de la corrección (obligatorio)", "Se capturó baño completo y era exprés"], ["clic", "Confirmar corrección"], ["esperar", 2500]],
    },
    {
      titulo: "Queda el historial",
      dice: "Todo queda en el «Historial de servicio» de la cita: el servicio y el precio de antes y de ahora, quién lo corrigió, cuándo y por qué. Nada se borra ni se edita.",
      pasos: [["ir", "/estetica"], ["clic", "Finalizada", { nav: true }], ["desplazar", "Historial de servicio"], ["resaltar", "Historial de servicio", 3500]],
    },
    {
      titulo: "Ajustes pendientes",
      dice: "Mientras un cobro adicional o un saldo a favor siga sin resolverse, aparece en el aviso de atención del tablero y en Caja, en una lista de ajustes por corrección de servicio. Se quita solo cuando la cuenta queda en cero.",
      pasos: [["ir", "/caja/ajustes-servicio"], ["esperar", 3500]],
    },
  ],
  resumen: ["«Corregir servicio» sirve antes, durante y después de cobrar.", "El precio se recalcula solo y el cobro original no se toca.", "Un cobro adicional o un saldo a favor queda a la vista hasta resolverse, y todo queda en el historial."],
};
