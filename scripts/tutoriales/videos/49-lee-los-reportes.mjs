// 49 · Reportes (admin)
export default {
  rol: "admin",
  inicio: "/reportes",
  gancho: "Vender mucho no es lo mismo que ganar mucho. Los reportes te dicen cuánto entra, cuánto cuesta y cuánto te queda de verdad.",
  escenas: [
    {
      titulo: "Elige el periodo",
      dice: "En «Reportes» escoges el periodo con «Desde» y «Hasta», y aprietas «Actualizar». Todos los números se recalculan para esas fechas.",
      pasos: [["resaltar", "Desde", 2400], ["resaltar", "Actualizar", 2400]],
    },
    {
      titulo: "Costos y margen",
      dice: "En «Costos y margen — estética» ves cuánto ingresa cada servicio, cuánto cuestan sus insumos y la comisión de quien lo hace, y el margen que te queda. Así sabes qué baño te deja más.",
      pasos: [["desplazar", "Costos y margen — estética"], ["zoom", "Costos y margen — estética", 1.25, 4200]],
    },
    {
      titulo: "Operación y estado actual",
      dice: "«Operación del periodo» cuenta las estancias, las citas y las ocupaciones. Y «Estado actual» muestra cómo están tus contratos, tus vacunas y tus paquetes hoy.",
      pasos: [["desplazar", "Operación del periodo"], ["resaltar", "Operación del periodo", 2800], ["desplazar", "Estado actual"], ["resaltar", "Estado actual", 2800]],
    },
    {
      titulo: "La utilidad",
      dice: "La utilidad se calcula con el ingreso, menos los insumos, la nómina y los gastos del local. Cada gasto se reparte por los días que cubre, no solo cuando se paga. Quien tiene el permiso de reportes financieros ve los mismos números que el admin.",
      pasos: [["desplazar", 0], ["esperar", 3000]],
    },
  ],
  resumen: ["Escoges el periodo y actualizas.", "El margen por servicio incluye insumos y comisión.", "La utilidad resta insumos, nómina y gastos del local."],
};
