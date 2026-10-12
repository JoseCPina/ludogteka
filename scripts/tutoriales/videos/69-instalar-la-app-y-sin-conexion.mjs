// 69 · Instala la app y consulta la agenda sin conexión (recepción)
// El aviso de «Instalar la app» lo ofrece el navegador del celular o de la computadora; en la grabación se
// dispara el mismo evento para que se vea el botón, y la falta de internet se simula con el modo sin conexión.
export default {
  rol: "recepcion",
  inicio: "/recepcion",
  gancho: "Pon PeluDesk en la pantalla de inicio de tu celular, y consulta tu agenda aunque se vaya el internet.",
  escenas: [
    {
      titulo: "Instalarla",
      dice: "En Chrome, aprieta «Instalar la app», el botón que aparece abajo a la izquierda. En iPhone, el botón de compartir y la opción de agregar a la pantalla de inicio. Queda con el nombre y el logo de tu negocio y abre en pantalla completa.",
      pasos: [["js", async ({ page }) => { await page.evaluate(() => window.dispatchEvent(new Event("beforeinstallprompt"))); }], ["esperar", 800], ["resaltar", "Instalar la app", 3600]],
    },
    {
      titulo: "Sin conexión",
      dice: "Si se va el internet, aparece un aviso amarillo: «Sin conexión». Puedes seguir consultando el tablero del día, la agenda de estética y las fichas de clientes y mascotas que ya abriste.",
      pasos: [["js", async ({ ctx }) => { await ctx.setOffline(true); }], ["esperar", 1200], ["resaltar", "Sin conexión", 3600]],
    },
    {
      titulo: "Nada se guarda",
      dice: "Sin conexión no se puede registrar ni cobrar. Si lo intentas, el sistema te avisa que no se guardó nada, para que no creas que sí. Cuando vuelve la señal, recarga y sigue.",
      pasos: [["js", async ({ page }) => { await page.evaluate(() => fetch("/api/sin-conexion", { method: "POST" }).catch(() => null)); }], ["esperar", 900], ["resaltar", "no se guardó nada", 3400], ["js", async ({ ctx }) => { await ctx.setOffline(false); }], ["esperar", 1500]],
    },
  ],
  resumen: ["Se instala en la pantalla de inicio, con tu logo.", "Sin conexión solo consultas lo que ya abriste.", "Nada se guarda sin conexión: el sistema te lo dice."],
};
