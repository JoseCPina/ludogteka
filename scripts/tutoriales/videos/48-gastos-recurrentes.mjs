// 48 · Gastos recurrentes (admin)
export default {
  rol: "admin",
  inicio: "/gastos/recurrentes",
  gancho: "La renta no se te va a olvidar si la app te la recuerda. Configura una vez tus gastos que se repiten y los ves venir antes de que venzan.",
  escenas: [
    {
      titulo: "Gastos recurrentes",
      dice: "En «Gastos recurrentes» creas una plantilla: el «Concepto», la «Categoría», «Cada cuándo» se repite, el «Siguiente vencimiento» y el monto estimado.",
      pasos: [["resaltar", "Nuevo gasto recurrente", 2600], ["resaltar", "Cada cuándo", 2600]],
    },
    {
      titulo: "Qué periodo cubre",
      dice: "Dices qué periodo cubre cada pago: desde el mes en que vence, como la renta, o los meses anteriores, como la luz, que se paga lo ya usado. Así la utilidad lo reparte bien.",
      pasos: [["resaltar", "Qué periodo cubre cada pago", 3200]],
    },
    {
      titulo: "Te avisa antes",
      dice: "Quince días antes de cada vencimiento, aparece en «Por pagar». Si vence o se acerca, sale en «Necesita atención» del tablero. Solo lo ve quien tiene el permiso de gastos, porque trae montos.",
      pasos: [["ir", "/gastos"], ["resaltar", "Por pagar", 3000]],
    },
  ],
  resumen: ["Una plantilla genera el gasto esperado antes de cada vencimiento.", "Dices qué periodo cubre cada pago.", "Los vencidos y próximos salen en «Necesita atención»."],
};
