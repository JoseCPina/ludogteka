// 67 · Ver el historial de importaciones y deshacer una (admin). SIN GRABAR.
// BORRADOR: textos del artículo «deshacer-una-importacion»; se cotejan con la pantalla
// final antes de grabar. Se graba en desarrollo con el negocio demo.
export default {
  rol: "admin",
  inicio: "/admin/importar",
  gancho: "Importaste el archivo equivocado. Aquí lo regresas todo a como estaba, si nadie ha tocado esos registros.",
  escenas: [
    {
      titulo: "El historial",
      dice: "Cada importación queda en el historial, con su fecha y su archivo. Ábrela para ver qué pasó con cada fila: creadas, actualizadas, omitidas y con error.",
      pasos: [["resaltar", "Historial de importaciones", 3000], ["resaltar", "Con error", 2600]],
    },
    {
      titulo: "Retomar una a medias",
      dice: "Si se cerró la pantalla a la mitad, no se pierde nada: aprieta «Continuar la importación» y termina lo que faltaba, sin duplicar.",
      pasos: [["resaltar", "Continuar la importación", 3000]],
    },
    {
      titulo: "Deshacer",
      dice: "Para regresar todo, aprieta «Revisar si se puede deshacer». Solo se puede si nadie modificó esos registros y no tienen citas ni cobros. Entonces confirma con «Sí, deshacer la importación».",
      pasos: [["resaltar", "Revisar si se puede deshacer", 3200], ["resaltar", "Sí, deshacer la importación", 3000]],
    },
  ],
  resumen: ["Cada importación queda en el historial con el motivo de cada fila.", "Una importación a medias se retoma sin duplicar.", "Deshacer da de baja lo creado y regresa lo actualizado, si nadie lo tocó."],
};
