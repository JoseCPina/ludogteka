// 102 · Deshacer o corregir una operación (admin: siempre tiene el permiso «Deshacer operaciones»).
// Hace un check-in de verdad en el demo y lo deshace con motivo; lo que queda es la estancia otra vez reservada y la
// bitácora. Cada grabación usa la primera reserva que llega hoy a guardería.
export default {
  rol: "admin",
  inicio: "/guarderia",
  gancho: "Marcaste un check-in al perro equivocado, o una salida antes de tiempo. No hace falta llamar a nadie: casi todo se deshace con un motivo y queda en la bitácora.",
  escenas: [
    {
      titulo: "Un check-in de verdad",
      dice: "Vamos a recibir a un perro como siempre: desde «Check-in», escoges quién lo entrega y aprietas «Confirmar check-in».",
      pasos: [["clic", "css:a[href^='/reservas/estancias/'][href$='/checkin']", { nav: true }], ["mover", "css:#checkin-entrega-quien"], ["js", ({ page }) => page.locator("#checkin-entrega-quien").selectOption({ index: 1 })], ["clic", "Confirmar check-in"], ["esperar", 3200], ["resaltar", "Check-in registrado", 2200]],
    },
    {
      titulo: "Deshacer",
      dice: "Si fue un error, ahí mismo está «Deshacer el check-in». Lo hecho hace menos de veinticuatro horas sale como botón; lo más viejo está en el menú Corregir del mismo lugar, con la operación inversa.",
      pasos: [["resaltar", "Deshacer el check-in", 3000], ["clic", "Deshacer el check-in"], ["esperar", 800]],
    },
    {
      titulo: "Con motivo",
      dice: "Escribes el motivo, qué pasó, y confirmas. La estancia vuelve a reservada, el día regresa al pase si se había descontado, y queda en la bitácora con tu nombre, la hora y el motivo. Lo cobrado no cambia.",
      pasos: [["escribir", "Motivo (obligatorio)", "Era el perro de otra reserva"], ["clic", "css:[data-confirmar-deshacer]"], ["esperar", 3500]],
    },
    {
      titulo: "Qué más se deshace",
      dice: "Lo mismo existe para la salida, el no llegó, una cancelación, una cita terminada, un cargo, una venta o una devolución, siempre con motivo y con el permiso Deshacer operaciones. Lo que no va por aquí: un cobro se anula o se devuelve, un turno cerrado no se reabre y una factura va por nota de crédito.",
      pasos: [["ir", "/guarderia"], ["esperar", 2600]],
    },
  ],
  resumen: ["Lo hecho hace menos de 24 horas tiene su botón «Deshacer»; lo más viejo está en Corregir.", "Siempre con motivo, y queda en la bitácora con tu nombre y la hora.", "Un cobro no se deshace: se anula o se devuelve."],
};
