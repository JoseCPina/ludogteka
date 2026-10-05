// 28 · Perro que llega sin reserva (walk-in)
export default {
  inicio: "/guarderia/walkin",
  gancho: "A veces el perro ya está en la puerta y nadie avisó. El walk-in te deja registrarlo y pasar directo al check-in.",
  escenas: [
    {
      titulo: "Walk-in",
      dice: "En «Walk-in» eliges al dueño, marcas al perro, el servicio y la fecha, y sigues directo al check-in. Es la misma reserva de siempre, pero sin pasos de más.",
      pasos: [["resaltar", "Walk-in — Guardería", 2600], ["clic", "Ricardo Olmos"], ["marcar", "Rufo"]],
    },
    {
      titulo: "Servicio y fecha",
      dice: "Escoge el «Servicio» y la «Fecha» —normalmente hoy— y aprieta «Crear reserva». La app aplica las mismas reglas: cupo, vacunas, evaluación y horario.",
      pasos: [["elegir", "Servicio", "Guardería (día completo)"], ["resaltar", "Fecha", 2400]],
    },
    {
      titulo: "En hotel también",
      dice: "El hotel tiene su propio walk-in, con entrada y salida. Y desde la lista de «Check-in», el botón «Walk-in (sin reserva)» te lleva directo.",
      pasos: [["ir", "/guarderia/checkin"], ["resaltar", "Walk-in (sin reserva)", 3000]],
    },
  ],
  resumen: ["El walk-in registra al perro que llega sin aviso.", "Aplica las mismas reglas que una reserva normal.", "Termina directo en el check-in."],
};
