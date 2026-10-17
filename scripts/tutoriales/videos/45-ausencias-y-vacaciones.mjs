// 45 · Ausencias y vacaciones (admin)
// El demo trae ausencias aprobadas de Luis Ángel (día completo y medio día) sobre días con citas suyas: salen por reasignar.
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
      dice: "Cada persona la pide desde Mi asistencia. Y si alguien te avisó por WhatsApp, la pides por esa persona en «Pedir una ausencia por alguien»: escoges al «Empleado», el «Tipo», «Desde» y «Hasta». Si solo falta unas horas, llena también las horas: es medio día.",
      pasos: [["resaltar", "Pedir una ausencia por alguien", 2800], ["elegir", "Empleado", 1], ["elegir", "Tipo", "Día personal"], ["resaltar", "Desde la hora (medio día)", 2400]],
    },
    {
      titulo: "El saldo de vacaciones",
      dice: "Al aprobar unas vacaciones, la app las descuenta del saldo de esa persona. Solo el admin aprueba, y todo queda registrado en «Aprobadas y resueltas».",
      pasos: [["desplazar", "Aprobadas y resueltas"], ["resaltar", "Aprobadas y resueltas", 3000]],
    },
    {
      titulo: "Las citas de quien falta",
      dice: "Una ausencia aprobada bloquea la agenda de estética de esa persona, el día completo o solo esas horas: al agendar sale «ausente». Si ya tenía citas, aquí aparecen para pasarlas a otra estilista con «Reasignar». Mientras sigan pendientes, el Inicio te avisa.",
      pasos: [["desplazar", "css:[data-citas-por-reasignar] >> nth=0"], ["resaltar", "css:[data-citas-por-reasignar] >> nth=0", 3200], ["resaltar", "Reasignar", 1800], ["ir", "/admin"], ["resaltar", "con una estilista ausente", 3000]],
    },
  ],
  resumen: ["Las ausencias se piden y las aprueba el admin, de día completo o medio día.", "Al aprobar vacaciones, se descuentan del saldo.", "Las citas de quien falta se reasignan desde aquí."],
};
