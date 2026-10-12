// 67 · Ver el historial de importaciones y deshacer una (admin)
export default {
  rol: "admin",
  inicio: "/admin/importar",
  gancho: "Importaste el archivo equivocado. Aquí lo regresas todo a como estaba, si nadie ha tocado esos registros.",
  escenas: [
    {
      titulo: "El historial",
      dice: "Cada importación queda en el historial, con su fecha y su archivo. Ábrela para ver qué pasó con cada fila: creadas, actualizadas, omitidas y con error.",
      pasos: [["resaltar", "Historial de importaciones", 3000], ["clic", "css:main a[href^='/admin/importar/']", { nav: true }], ["esperar", 2200], ["zoom", "css:main", 1.1, 3200]],
    },
    {
      titulo: "Retomar una a medias",
      dice: "Si se cerró la pantalla a la mitad, no se pierde nada: aprieta el botón para continuar la importación y termina lo que faltaba, sin duplicar.",
      pasos: [["esperar", 3000]],
    },
    {
      titulo: "Deshacer",
      dice: "Para regresar todo, aprieta «Revisar si se puede deshacer». Solo se puede si nadie modificó esos registros y no tienen citas ni cobros. Entonces confirma con «Sí, deshacer la importación».",
      pasos: [["desplazar", "Deshacer esta importación"], ["clic", "Revisar si se puede deshacer"], ["esperar", 2200], ["resaltar", "Sí, deshacer la importación", 3000], ["clic", "Sí, deshacer la importación"], ["esperar", 2500]],
    },
  ],
  resumen: ["Cada importación queda en el historial con el motivo de cada fila.", "Una importación a medias se retoma sin duplicar.", "Deshacer da de baja lo creado y regresa lo actualizado, si nadie lo tocó."],
};
