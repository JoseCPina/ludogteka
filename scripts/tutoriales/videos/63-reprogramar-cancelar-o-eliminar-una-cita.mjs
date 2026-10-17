// 63 · Reprogramar, cancelar o eliminar una cita de estética (admin)
// `preparar` escoge una cita por venir de una estilista con otra cita (no Luis Ángel, que tiene ausencias en el demo),
// la hora de esa otra cita (para enseñar el aviso de choque) y un día libre para moverla de verdad.
const guion = {
  rol: "admin",
  inicio: "/estetica",
  async preparar({ sb, negocioId }) {
    const zona = (await sb.from("negocios").select("zona_horaria").eq("id", negocioId).single()).data?.zona_horaria ?? "America/Mexico_City";
    const local = (iso) => new Date(iso).toLocaleString("sv-SE", { timeZone: zona }).slice(0, 16).replace(" ", "T");
    const { data: citas, error } = await sb.from("citas_estetica").select("id, empleado_id, inicio, estado").eq("negocio_id", negocioId).is("deleted_at", null)
      .in("estado", ["reservada", "confirmada"]).gte("inicio", new Date().toISOString()).order("inicio").order("id").limit(1000);
    if (error) throw new Error(`citas del demo: ${error.message}`);
    const { data: ausentes } = await sb.from("profiles").select("id").ilike("nombre_completo", "Luis Ángel%");
    const fuera = new Set((ausentes ?? []).map((p) => p.id));
    for (const x of citas ?? []) {
      if (!x.empleado_id || fuera.has(x.empleado_id)) continue;
      const suyas = citas.filter((c) => c.empleado_id === x.empleado_id);
      const y = suyas.find((c) => c.id !== x.id);
      if (!y) continue;
      const ocupados = new Set(suyas.map((c) => local(c.inicio).slice(0, 10)));
      let libre = null;
      for (let n = 3; n < 40 && !libre; n++) {
        const f = local(new Date(Date.now() + n * 86400000).toISOString()).slice(0, 10);
        if (new Date(`${f}T12:00:00Z`).getUTCDay() !== 0 && !ocupados.has(f)) libre = `${f}T10:00`;
      }
      if (!libre) continue;
      const e = guion.escenas;
      e[0].pasos = [["ir", `/estetica?vista=dia&fecha=${local(x.inicio).slice(0, 10)}`], ["clic", `css:a[href='/estetica/${x.id}?reprogramar=1']`, { nav: true }], ["resaltar", "Nueva fecha y hora", 2200]];
      e[1].pasos = [["rellenar", "Nueva fecha y hora", local(y.inicio)], ["clic", "Guardar la nueva hora"], ["esperar", 1500], ["resaltar", "Escoge a otra persona u otro horario", 3600]];
      e[2].pasos = [["rellenar", "Nueva fecha y hora", libre], ["escribir", "Motivo (opcional)", "La clienta pidió otro día"], ["clic", "Guardar la nueva hora"], ["esperar", 2200]];
      return;
    }
    throw new Error("No hay en el demo una estilista con dos citas por venir para enseñar el choque.");
  },
  gancho: "Una cliente cambia de día, otra ya no puede venir y a veces una cita se captura dos veces. Veamos cómo mover, cancelar o eliminar una cita sin perder el historial.",
  escenas: [
    {
      titulo: "Reprogramar",
      dice: "En la agenda, cada cita por venir trae el botón «Reprogramar». La cita se mueve con su precio.",
      pasos: [["clic", "Reprogramar", { nav: true }], ["resaltar", "Nueva fecha y hora", 2200]],
    },
    {
      titulo: "Si choca con otra cita",
      dice: "Escoge la nueva fecha y hora y guarda. Si la estilista ya tiene otra cita a esa hora, o está ausente, la app no la mueve y te dice con quién choca y a qué hora.",
      pasos: [["rellenar", "Nueva fecha y hora", "{fechaCita}"], ["clic", "Guardar la nueva hora"], ["esperar", 1500], ["resaltar", "Escoge a otra persona u otro horario", 3600]],
    },
    {
      titulo: "Guarda la nueva hora",
      dice: "Escoge otro horario, escribe el motivo si quieres y guarda.",
      pasos: [["rellenar", "Nueva fecha y hora", "{fechaCita}"], ["escribir", "Motivo (opcional)", "La clienta pidió otro día"], ["clic", "Guardar la nueva hora"], ["esperar", 2200]],
    },
    {
      titulo: "Avisar a la clienta",
      dice: "Después de mover la cita puedes avisarle a la clienta por WhatsApp con un mensaje ya escrito. El sistema no manda nada solo: tú decides si lo envías.",
      pasos: [["esperar", 3000]],
    },
    {
      titulo: "Cancelar",
      dice: "Si la clienta avisa que ya no viene, aprieta «Cancelar cita» y escribe el motivo. El horario queda libre. «No se presentó» es para cuando nunca llegó ni avisó.",
      pasos: [["resaltar", "No se presentó", 2400], ["clic", "Cancelar cita"], ["escribir", "Motivo de la cancelación", "La clienta se enfermó"], ["clic", "Sí, cancelar la cita"], ["esperar", 2200]],
    },
    {
      titulo: "Eliminar",
      dice: "Y si la cita se capturó por error o está duplicada, un admin puede eliminarla. Sale de la agenda y libera el horario, pero no se borra: queda en el historial con su motivo.",
      pasos: [["clic", "Eliminar cita"], ["escribir", "Motivo (obligatorio)", "Se capturó dos veces"], ["clic", "Sí, eliminar la cita"], ["esperar", 2200]],
    },
    {
      titulo: "Otro perrito del mismo cliente",
      dice: "Y cuando el mismo cliente trae a otro perrito, no tienes que empezar de cero: al agendar, aprieta «Agregar otro perrito de este cliente» y se agenda en la misma visita.",
      pasos: [["ir", "/estetica/nueva"], ["clic", "Ricardo Olmos"], ["resaltar", "Agregar otro perrito de este cliente", 3200]],
    },
  ],
  resumen: ["Reprogramar mueve la cita con su precio; si choca, la app te dice con qué cita.", "Cancelar libera el horario; «No se presentó» es para quien nunca llegó.", "Eliminar es para citas capturadas por error, y siempre queda en el historial."],
};
export default guion;
