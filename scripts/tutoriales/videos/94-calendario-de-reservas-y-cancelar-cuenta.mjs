// 94 · Calendario de reservas y cancelar una cuenta con su reserva (admin)
// Solo lectura en el demo: se recorre el calendario; las acciones que escriben se enseñan sin confirmar.
export default {
  rol: "admin",
  inicio: "/reservas/calendario",
  gancho: "¿Cuántos perros hay el sábado? ¿Una reserva que ya no va a venir sigue ocupando lugar? El calendario de reservas te lo dice de un vistazo.",
  escenas: [
    {
      titulo: "La ocupación de cada día",
      dice: "Cada día dice cuántos perros hay contra el cupo. Verde, hay reservas; ámbar, casi lleno; rojo, lleno. Cambias entre «Semana» y «Mes».",
      pasos: [["esperar", 1800], ["resaltar", "Calendario de reservas", 2200], ["clic", "Mes"], ["esperar", 1800], ["clic", "Semana"]],
    },
    {
      titulo: "Las reservas de un día",
      dice: "Toca un día y abajo salen sus reservas: la mascota, el dueño, el estado y cómo va la cuenta.",
      pasos: [["clic", "Hoy"], ["esperar", 1500], ["resaltar", "Próximas reservas", 2600]],
    },
    {
      titulo: "Próximas reservas",
      dice: "Más abajo está la lista de lo que viene. La filtras por módulo, estado y fecha, y de cada reserva puedes abrirla, mover sus fechas o cancelarla.",
      pasos: [["desplazar", "Próximas reservas"], ["resaltar", "Filtrar", 2400]],
    },
    {
      titulo: "Cancelar una cuenta con su reserva",
      dice: "Si una cuenta no se va a cobrar porque el dueño ya no viene, cancélala en Caja y deja marcada la casilla para cancelar también la reserva: así el lugar queda libre.",
      pasos: [["ir", "/caja"], ["esperar", 1800], ["resaltar", "Cancelar cuenta", 2600]],
    },
  ],
  resumen: ["El calendario junta guardería y hotel contra el cupo de toda la casa.", "Desde la lista abres, mueves o cancelas una reserva.", "Al cancelar una cuenta, cancela también su reserva para liberar el lugar."],
};
