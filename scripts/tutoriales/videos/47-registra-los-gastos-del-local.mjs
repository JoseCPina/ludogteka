// 47 · Gastos del local (admin)
export default {
  rol: "admin",
  inicio: "/gastos",
  gancho: "Renta, luz, gas, mantenimiento. Si no registras tus gastos, no sabes cuánto ganas de verdad. Aquí los capturas en unos segundos.",
  escenas: [
    {
      titulo: "Gastos del local",
      dice: "En «Gastos del local» ves lo que está «Por pagar», con los vencimientos más cercanos, y abajo los gastos de este mes por categoría.",
      pasos: [["resaltar", "Por pagar", 2800], ["zoom", "Por pagar", 1.3, 3200]],
    },
    {
      titulo: "Registrar un gasto",
      dice: "En «Registrar un gasto» escribes el «Concepto», escoges la «Categoría», el «Monto» y la «Fecha de pago». Dices también qué periodo cubre: un gasto grande se reparte por días en la utilidad.",
      pasos: [["desplazar", "Registrar un gasto"], ["escribir", "Concepto", "Mantenimiento de la camioneta {n3}"], ["elegir", "Categoría", "Camioneta"], ["rellenar", "Monto", "850"]],
    },
    {
      titulo: "Pagado de la caja",
      dice: "Si lo pagas con efectivo de la caja, se genera su retiro en el turno abierto. Con «Registrar gasto» queda guardado. Si lo cancelas, se cancela con un motivo, nunca se borra.",
      pasos: [["resaltar", "Registrar gasto", 2800]],
    },
    {
      titulo: "Comprobantes y categorías",
      dice: "A cada gasto le adjuntas su comprobante con «Adjuntar comprobante». Y con «Categorías» personalizas las tuyas.",
      pasos: [["resaltar", "Adjuntar comprobante", 2600], ["resaltar", "Categorías", 2600]],
    },
  ],
  resumen: ["Capturas el gasto con su categoría y el periodo que cubre.", "Pagado con efectivo de la caja, genera su retiro.", "Nunca se borra: se cancela con motivo o se corrige."],
};
