// 69 · Instala la app y consulta la agenda sin conexión. SIN GRABAR.
// BORRADOR: textos del artículo «instalar-la-app-y-sin-conexion». La instalación y el
// modo sin conexión se enseñan en el celular real (o con el emulador del navegador); el
// guion se afina contra la pantalla final antes de grabar.
export default {
  rol: "recepcion",
  inicio: "/recepcion",
  gancho: "Pon el sistema en la pantalla de inicio de tu celular, y consulta la agenda aunque se vaya el internet.",
  escenas: [
    {
      titulo: "Instalarla",
      dice: "En Chrome aprieta «Instalar la app». En iPhone, el botón de compartir y «Agregar a pantalla de inicio». Queda con el nombre y el logo de tu negocio y abre en pantalla completa.",
      pasos: [["resaltar", "Instalar la app", 3200]],
    },
    {
      titulo: "Sin conexión",
      dice: "Si se va el internet, aparece un aviso amarillo: «Sin conexión». Puedes seguir consultando el tablero del día, la agenda de estética y las fichas de clientes y mascotas que ya abriste.",
      pasos: [["resaltar", "Sin conexión", 3400]],
    },
    {
      titulo: "Nada se guarda",
      dice: "Sin conexión no se puede registrar ni cobrar: el sistema te avisa para que no creas que se guardó. Cuando vuelve la señal, recarga y sigue.",
      pasos: [["resaltar", "no se guardó nada", 3200]],
    },
  ],
  resumen: ["Se instala en la pantalla de inicio con tu logo.", "Sin conexión solo consultas lo que ya abriste.", "Nada se guarda sin conexión; al volver la señal, recargas."],
};
