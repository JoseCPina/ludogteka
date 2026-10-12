// 64 · La tarifa «Cliente de guardería» en estética (admin)
export default {
  rol: "admin",
  inicio: "/admin/tarifa-guarderia",
  async preparar({ sb, negocioId }) {
    // Siempre se empieza con la tarifa apagada y sin servicio (así el primer paso la prende de verdad).
    const { error } = await sb.from("tarifa_guarderia_config").update({ activa: false, servicio_tarifa_id: null, servicios_incluidos: [] }).eq("negocio_id", negocioId).is("deleted_at", null);
    if (error) throw new Error(error.message);
  },
  gancho: "Los perros que ya vienen a tu guardería pueden bañarse con un precio especial: el del baño exprés. Es una tarifa, no un descuento. Así la prendes y decides a quién y en qué servicios se aplica.",
  escenas: [
    {
      titulo: "Prende la tarifa",
      dice: "En Administración, «Tarifa de guardería», marca «Ofrecer la tarifa de cliente de guardería». Apagada, todos pagan el precio normal de su baño.",
      pasos: [["clic", "Ofrecer la tarifa de cliente de guardería"], ["esperar", 800]],
    },
    {
      titulo: "El precio que se cobra",
      dice: "Elige con qué servicio se cobra: normalmente el exprés. Su precio sale de su propia tabla de tarifas, por grupo y talla, así que si lo cambias ahí, esta tarifa lo sigue.",
      pasos: [["elegir", "Se cobra con el precio de…", "exprés"], ["resaltar", "Se cobra con el precio de…", 2600]],
    },
    {
      titulo: "A qué servicios aplica",
      dice: "Marca los servicios que, para un cliente de guardería, se cobran a ese precio. Por ejemplo, el baño completo.",
      pasos: [["clic", "Baño estético completo"], ["resaltar", "Se aplica cuando agendan…", 2800]],
    },
    {
      titulo: "Quién cuenta como cliente de guardería",
      dice: "En «Días de actividad» pones cuántos días hacia atrás cuenta: es cliente de guardería quien tiene un pase vigente o una estancia de guardería en ese tiempo, o una agendada en los próximos treinta días. Guarda y listo.",
      pasos: [["escribir", "Días de actividad", "60"], ["resaltar", "Días de actividad", 2600], ["clic", "Guardar"], ["esperar", 1800]],
    },
    {
      titulo: "Al agendar",
      dice: "Al agendar una cita, la app reconoce al cliente de guardería y aplica la tarifa sola, y lo dice. Un admin, o quien tenga el permiso de excepciones, puede quitarla en esa cita, con su motivo.",
      pasos: [["ir", "/estetica/nueva"], ["esperar", 3200]],
    },
  ],
  resumen: ["Es una tarifa, no un descuento: usa el precio de otro servicio.", "Tú eliges el servicio, a quiénes aplica y cuántos días cuenta la actividad.", "Al agendar se aplica sola, y se puede quitar con motivo."],
};
