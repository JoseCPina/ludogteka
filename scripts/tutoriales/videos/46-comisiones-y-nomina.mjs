// 46 · Comisiones y nómina (admin)
export default {
  rol: "admin",
  inicio: "/empleados/comisiones",
  gancho: "Calcular la nómina a mano te quita horas y siempre hay una duda. Con las reglas de pago bien puestas, la app lo calcula y tú solo lo revisas.",
  escenas: [
    {
      titulo: "Reglas de comisión",
      dice: "En «Agregar o cambiar una regla» decides cuánto gana cada estilista por servicio: un porcentaje del precio o un monto fijo. La regla del servicio para esa persona gana sobre la general.",
      pasos: [["resaltar", "Agregar o cambiar una regla", 2800], ["resaltar", "Tipo", 2400], ["resaltar", "Cuánto (% o $)", 2400]],
    },
    {
      titulo: "Calcular la nómina",
      dice: "En «Nómina» escoges el periodo con «Desde» y «Hasta», y aprietas «Calcular». La app arma el desglose de cada persona: sueldo, comisiones, propinas y adelantos descontados.",
      pasos: [["ir", "/empleados/nomina"], ["resaltar", "Desde", 2400], ["resaltar", "Calcular", 2600]],
    },
    {
      titulo: "Registrar el pago",
      dice: "Al registrar un pago, la app guarda el cálculo que ella hizo, nunca lo que se ve en pantalla. No deja pagar un periodo que no ha terminado. Y si te equivocas, se corrige con un movimiento inverso, nunca borrando.",
      pasos: [["esperar", 3500]],
    },
    {
      titulo: "Propinas y adelantos",
      dice: "Las propinas de un cobro se reparten entre quienes atendieron esa cuenta, según el precio de cada servicio. Y los adelantos se descuentan en el pago.",
      pasos: [["esperar", 3500]],
    },
  ],
  resumen: ["Defines una regla de comisión por servicio.", "La nómina se calcula con el periodo que escoges.", "El pago se corrige con un movimiento inverso, nunca se borra."],
};
