// 94 · Calendario de reservas y cancelar una cuenta con su reserva (admin)
// «Cancelar la cuenta» tiene guarda de plan demo: el video abre el formulario y se detiene antes de confirmar.
// Se graba de punta a punta en el demo con la cuenta gemela del corredor: recorre semana y mes, abre un día con finalizadas,
// mueve una reserva, cancela otra y cancela una cuenta junto con su reserva. Las fechas salen de «hoy» al grabar.
const dia = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default {
  rol: "admin",
  inicio: "/reservas/calendario",
  gancho: "¿Cuántos perros hay el sábado? ¿Una reserva que ya no va a venir sigue ocupando lugar? El calendario de reservas te lo dice de un vistazo, y desde ahí la mueves o la cancelas.",
  escenas: [
    {
      titulo: "La ocupación de cada día",
      dice: "Cada día dice cuántos perros hay contra el cupo. Verde, hay reservas; ámbar, casi lleno; rojo, lleno. Cambias entre «Semana» y «Mes».",
      pasos: [["esperar", 1800], ["resaltar", "Calendario de reservas", 2200], ["clic", "Mes"], ["esperar", 2200], ["clic", "Semana"], ["esperar", 1500]],
    },
    {
      titulo: "Un día que ya pasó",
      dice: "Toca un día y abajo salen sus reservas: la mascota, el dueño, el estado y cómo va la cuenta. En un día que ya pasó ves las finalizadas.",
      pasos: [["clic", "Mes"], ["esperar", 2000], ["clic", `css:[data-dia='${dia(-1)}']`], ["esperar", 2200], ["resaltar", "css:#reservas-del-dia", 3200]],
    },
    {
      titulo: "Mover una reserva",
      dice: "Abre un día que viene. De cada reserva puedes abrirla, mover sus fechas o cancelarla. Aprieta «Mover fechas», escoge la nueva fecha y guarda.",
      pasos: [
        ["clic", `css:[data-dia='${dia(6)}']`],
        ["esperar", 2200],
        ["clic", "css:[data-lista='dia'] li:has-text('Guardería') button:has-text('Mover fechas') >> nth=0"],
        ["esperar", 1200],
        ["js", async ({ page }) => { await page.locator("[data-lista='dia'] input[type='date']").first().fill(dia(11)); }, 1500],
        ["resaltar", "Guardar fechas", 2200],
        ["clic", "Guardar fechas"],
        ["esperar", 2600],
      ],
    },
    {
      titulo: "Cancelar una reserva",
      dice: "Para cancelar, aprieta «Cancelar» en la reserva y confirma. El lugar queda libre y, si usó un pase, se le devuelve. La reserva se queda en el día como cancelada, nunca se borra.",
      pasos: [
        ["esperar", 2500],
        ["clic", "css:[data-lista='dia'] li:has-text('Guardería') button:text-is('Cancelar') >> nth=0"],
        ["esperar", 1200],
        ["resaltar", "Sí, cancelarla", 2400],
        ["clic", "Sí, cancelarla"],
        ["esperar", 3000],
        ["resaltar", "css:#reservas-del-dia", 2800],
      ],
    },
    {
      titulo: "Próximas reservas",
      dice: "Más abajo está la lista de lo que viene. La filtras por módulo, estado y fecha.",
      pasos: [["desplazar", "Próximas reservas"], ["resaltar", "Filtrar", 2600]],
    },
    {
      titulo: "Cancelar una cuenta con su reserva",
      dice: "Si una cuenta no se va a cobrar porque el dueño ya no viene, cancélala en Caja. Escoge el motivo y deja marcada la casilla para cancelar también la reserva, y aprieta «Cancelar la cuenta»: así el lugar queda libre.",
      pasos: [
        ["ir", "/caja"],
        ["esperar", 2000],
        ["clic", "css:a[href^='/caja/cobrar/']:has-text('Duque') >> nth=0", { nav: true }],
        ["esperar", 1800],
        ["clic", "Cancelar cuenta"],
        ["esperar", 1500],
        ["elegir", "Motivo (obligatorio)", "No se presentó"],
        ["esperar", 1500],
        ["resaltar", "css:[data-cancelar-cuenta-cita]", 3200],
        ["resaltar", "Cancelar la cuenta", 2800],
      ],
    },
  ],
  resumen: ["El calendario junta guardería y hotel contra el cupo de toda la casa.", "Desde un día mueves o cancelas una reserva, y queda cancelada, no borrada.", "Al cancelar una cuenta, cancela también su reserva para liberar el lugar."],
};
