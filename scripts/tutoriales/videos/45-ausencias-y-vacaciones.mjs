// 45 · Ausencias y vacaciones (admin)
export default {
  rol: "admin",
  inicio: "/empleados/ausencias",
  gancho: "Vacaciones, incapacidades, un día personal: cada ausencia se pide, se aprueba y se lleva en cuenta. Veamos cómo.",
  escenas: [
    {
      titulo: "Ausencias",
      dice: "Aquí se llaman «ausencias», no permisos: vacaciones, incapacidad, día personal o falta justificada. En «Por aprobar» están las que esperan tu decisión, con «Aprobar» y «Rechazar».",
      pasos: [["resaltar", "Por aprobar", 2800]],
    },
    {
      titulo: "Pedir una ausencia",
      dice: "Cada persona la pide desde «Mi asistencia». Y si alguien te avisó por WhatsApp, la pides por esa persona en «Pedir una ausencia por alguien»: escoges al «Empleado», el «Tipo», «Desde» y «Hasta».",
      pasos: [["resaltar", "Pedir una ausencia por alguien", 2800], ["elegir", "Empleado", 1], ["elegir", "Tipo", "Día personal"]],
    },
    {
      titulo: "El saldo de vacaciones",
      dice: "Al aprobar unas vacaciones, la app las descuenta del saldo de esa persona. Solo el admin aprueba, y todo queda registrado en «Aprobadas y resueltas».",
      pasos: [["desplazar", "Aprobadas y resueltas"], ["resaltar", "Aprobadas y resueltas", 3000]],
    },
  ],
  resumen: ["Las ausencias se piden y las aprueba el admin.", "Al aprobar vacaciones, se descuentan del saldo.", "Todo queda registrado en «Aprobadas y resueltas»."],
};
