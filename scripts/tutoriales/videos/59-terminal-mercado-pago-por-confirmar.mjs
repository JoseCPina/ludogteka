// 59 · Terminal de Mercado Pago: escoger terminal, «Por confirmar» y desconectar (admin)
export default {
  rol: "admin",
  inicio: "/admin/pagos",
  gancho: "Cobrar con la terminal es lo más seguro, porque el pago se confirma solo con Mercado Pago. Veamos cómo dejarla lista, qué significa «Por confirmar» y qué pasa si desconectas la cuenta.",
  escenas: [
    {
      titulo: "Tu terminal",
      dice: "En «Cobro con terminal» eliges con qué cobra tu negocio: Mercado Pago, Clip o solo a mano. Con Mercado Pago conectado, escoges tu terminal Point Smart de la lista, y queda lista para cobrar.",
      pasos: [["esperar", 2500], ["zoom", "css:main", 1.1, 3500]],
    },
    {
      titulo: "Modo de vinculación",
      dice: "Si la terminal no recibe el cobro, revisa en la terminal física: Más opciones, Ajustes, Modo de vinculación, y regrésala a modo independiente. Y la app te dice si la terminal no está en modo integrado.",
      pasos: [["esperar", 3500]],
    },
    {
      titulo: "Cobrar con terminal",
      dice: "En una cuenta, «Cobrar con terminal» manda el monto a la terminal. Cuando Mercado Pago confirma un pago aprobado, el cobro se registra solo, con la verificación directa del pago.",
      pasos: [["ir", "/caja"], ["clic", "css:a[href^='/caja/cobrar/']", { nav: true }], ["resaltar", "Cobrar con terminal", 3000]],
    },
    {
      titulo: "Por confirmar",
      dice: "Si algo no cuadra, por ejemplo otro monto o un pago que todavía no existe, la orden queda por confirmar con Mercado Pago. No cuenta como dinero y sale en Necesita atención del tablero. Ábrela y usa el botón de revisar con Mercado Pago para que se vuelva a comprobar.",
      pasos: [["esperar", 4000]],
    },
    {
      titulo: "Desconectar y reconectar",
      dice: "Si desconectas Mercado Pago, las órdenes en cola se cancelan y la app recuerda tu terminal. Al reconectar la misma cuenta, la recupera. Mientras no haya terminal escogida, el botón de cobrar con terminal sale apagado y dice qué falta.",
      pasos: [["ir", "/admin/pagos"], ["esperar", 3500]],
    },
  ],
  resumen: ["Escoge tu terminal en «Cobro con terminal».", "«Por confirmar» no es dinero: se revisa con Mercado Pago.", "Al reconectar la misma cuenta, la app recupera tu terminal."],
};
