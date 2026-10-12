// 83 · Plantillas de consulta, duración de citas y portal del dueño (admin)
export default {
  rol: "admin",
  inicio: "/veterinaria/ajustes",
  gancho: "Cada clínica trabaja a su manera. En los ajustes de Veterinaria cambias los textos de cada consulta, los minutos de cada cita y decides qué ve el dueño en su portal.",
  escenas: [
    {
      titulo: "Tipos de cita y su duración",
      dice: "En «Tipos de cita y su duración» pones cuántos minutos dura cada tipo: consulta, vacuna, cirugía, seguimiento y urgencia. La agenda usa estas duraciones para que un médico no tenga dos citas encimadas.",
      pasos: [["desplazar", "Tipos de cita y su duración"], ["resaltar", "Duración (min)", 3000]],
    },
    {
      titulo: "Plantillas de consulta",
      dice: "Cada tipo de consulta nace con una plantilla: los textos que ya vienen escritos en la anamnesis, el examen físico, los hallazgos, el plan. Cámbialos a tu manera y guarda. Las consultas que ya firmaste no cambian.",
      pasos: [["desplazar", "Plantillas de consulta"], ["resaltar", "Plantillas de consulta", 3000]],
    },
    {
      titulo: "El portal del dueño",
      dice: "En «Portal del dueño» decides si el dueño ve sus consultas en su portal. Apagado por omisión. Si lo prendes, ve la fecha, el diagnóstico definitivo y el plan de las consultas firmadas, sin tus notas internas.",
      pasos: [["desplazar", "Portal del dueño"], ["resaltar", "Mostrar las consultas en el portal", 3200]],
    },
    {
      titulo: "Lo demás",
      dice: "Aquí también están los recordatorios de dosis, la vigencia de los certificados, si el carnet cuenta como comprobante de vacunas en el check-in, y el precio del día de hospitalización.",
      pasos: [["desplazar", "Recordatorios de próxima dosis"], ["resaltar", "Recordatorios de próxima dosis", 3000]],
    },
  ],
  resumen: ["Cada tipo de cita tiene su duración.", "Las plantillas de consulta se adaptan a tu clínica.", "Tú decides si el dueño ve sus consultas en el portal."],
};
