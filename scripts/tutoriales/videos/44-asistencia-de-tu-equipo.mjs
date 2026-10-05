// 44 · Asistencia (admin)
export default {
  rol: "admin",
  inicio: "/empleados",
  gancho: "Saber quién llegó a tiempo y quién faltó no debería depender de la memoria. Con la asistencia, cada entrada y cada salida queda registrada.",
  escenas: [
    {
      titulo: "Empleados",
      dice: "En «Empleados» ves a todo tu equipo y su asistencia de hoy. Una persona del equipo no necesita tener cuenta en la app: un empleado y una cuenta son cosas distintas.",
      pasos: [["resaltar", "Empleados", 2400], ["resaltar", "Registrar entrada", 2800]],
    },
    {
      titulo: "Entrada y salida",
      dice: "Quien tiene cuenta registra su propia entrada y su salida desde «Mi asistencia». Quien no, la registra recepción, y el admin puede registrar la de cualquiera. Cada registro guarda quién lo hizo y a qué hora.",
      pasos: [["ir", "/mi-trabajo"], ["resaltar", "Registrar mi entrada", 3000]],
    },
    {
      titulo: "Retardos y faltas",
      dice: "La app calcula sola los retardos y las faltas con el horario de cada persona, y una tolerancia de diez minutos. Solo el admin corrige un registro, y siempre con un motivo.",
      pasos: [["resaltar", "Últimos 30 días", 2800], ["resaltar", "Mis ausencias", 2400]],
    },
    {
      titulo: "Un empleado nuevo",
      dice: "Para dar de alta a alguien, aprieta «Nuevo empleado»: su nombre, su puesto, su fecha de ingreso, su contacto de emergencia y, si usa la app, su cuenta.",
      pasos: [["ir", "/empleados/nuevo"], ["resaltar", "Fecha de ingreso", 2600], ["resaltar", "Cuenta en la app (opcional)", 2600]],
    },
  ],
  resumen: ["Cada entrada y salida queda registrada con quién y cuándo.", "Los retardos y las faltas se calculan solos.", "Un empleado no necesita tener cuenta en la app."],
};
