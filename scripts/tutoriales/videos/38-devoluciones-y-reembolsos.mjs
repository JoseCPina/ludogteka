// 38 · Devoluciones y reembolsos (admin)
export default {
  rol: "admin",
  inicio: "/caja/reembolsos",
  gancho: "Devolver dinero es delicado: tiene que cuadrar con tu caja y con tu terminal. Así se hace sin descuadres.",
  escenas: [
    {
      titulo: "Devolver un cobro",
      dice: "Las devoluciones las hace solo el admin. Se hacen desde la cuenta ya cobrada: escoges el cobro, el monto y el motivo, y la devolución sale del turno abierto con el método con el que se pagó. Si el cobro fue de varias cuentas juntas, la devolución se hace en la cuenta que corresponde, hasta lo que esa cuenta recibió.",
      pasos: [["esperar", 3500]],
    },
    {
      titulo: "Cobros de Mercado Pago",
      dice: "Si el cobro se hizo con Mercado Pago, se devuelve con Devolver con Mercado Pago: la app pide el reembolso a Mercado Pago, y solo cuando lo aprueba lo registra en tu caja y cancela la comisión.",
      pasos: [["esperar", 3500]],
    },
    {
      titulo: "Reembolsos de Mercado Pago",
      dice: "Esta pantalla, «Reembolsos de Mercado Pago», lista los reembolsos que se hicieron directo en el panel de Mercado Pago. Entran solos a la caja, y salen en Necesita atención hasta que los marques como Enterado.",
      pasos: [["resaltar", "Reembolsos de Mercado Pago", 3200]],
    },
  ],
  resumen: ["Solo el admin devuelve dinero.", "La devolución sale del turno abierto con el método original.", "Los reembolsos hechos en Mercado Pago entran solos y se marcan Enterado."],
};
