// 01 · Recorre PeluDesk por primera vez (admin)
export default {
  inicio: "/admin",
  gancho: "Abres PeluDesk por primera vez y quieres saber dónde está cada cosa. En este recorrido de dos minutos conoces el menú, el inicio de cada rol y dónde pedir ayuda.",
  escenas: [
    {
      titulo: "El panel de admin",
      dice: "Esta es la pantalla de inicio de quien administra el negocio: el «Panel de admin». Arriba ves cómo va el día, y más abajo la configuración del negocio: horario, cupo, personal y precios.",
      pasos: [["resaltar", "Panel de admin", 2600], ["zoom", "Hoy", 1.4, 3000]],
    },
    {
      titulo: "El menú de la izquierda",
      dice: "A la izquierda está el menú. Ahí viven los servicios de tu negocio, como «Guardería», «Hotel» y «Estética», y también «Clientes», «Caja», «Inventario», «Empleados» y «Reportes». Cada persona solo ve lo que le toca y lo que tu plan incluye.",
      pasos: [["resaltar", "css:nav[aria-label='Secciones']", 4200]],
    },
    {
      titulo: "El inicio de recepción",
      dice: "Recepción trabaja desde el tablero del día. Lo vemos con calma en otro video.",
      pasos: [["ir", "/recepcion"], ["resaltar", "Hoy en Patitas & Co.", 2600]],
    },
    {
      titulo: "La agenda de estética",
      dice: "Y la persona de estética entra directo a su agenda, con las citas del día y su estilista.",
      pasos: [["ir", "/estetica"], ["esperar", 2200]],
    },
    {
      titulo: "Ayuda en cada pantalla",
      dice: "En cualquier pantalla tienes el botón de signo de interrogación. Te lleva al artículo de ayuda de esa pantalla, y si hay un video, también lo encuentras en «Ayuda».",
      pasos: [["resaltar", "css:a[aria-label='Ayuda de esta pantalla']", 2800], ["clic", "Ayuda", { nav: true }], ["esperar", 1800]],
    },
  ],
  resumen: ["El «Panel de admin» es tu inicio; recepción y estética tienen el suyo.", "El menú de la izquierda muestra solo lo que tu rol y tu plan incluyen.", "El signo de interrogación y la sección «Ayuda» te acompañan en cada pantalla."],
};
