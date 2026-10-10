// 66 · Importar tus clientes y mascotas desde Excel (admin). SIN GRABAR.
// BORRADOR: los textos de botones vienen del artículo «importar-clientes-y-mascotas»;
// antes del primer `npm run tutoriales -- --video 66` se cotejan con la pantalla final
// (`node scripts/tutoriales/explorar.mjs`). Se graba en desarrollo, con el negocio demo
// y un Excel inventado (nombres y teléfonos 442 000 …), nunca con datos reales.
export default {
  rol: "admin",
  inicio: "/admin/importar",
  gancho: "¿Tienes tus clientes en un Excel? Pásalos al sistema en minutos, sin capturar uno por uno.",
  escenas: [
    {
      titulo: "Tu archivo",
      dice: "Entra a «Importar» en Administración. Si quieres ver cómo acomodar tu lista, descarga la plantilla. Luego elige tu archivo de Excel o CSV.",
      pasos: [["resaltar", "Descargar plantilla", 2800], ["resaltar", "Elegir archivo", 2600]],
    },
    {
      titulo: "Las columnas",
      dice: "El sistema reconoce solo las columnas por su encabezado. Revisa que cada una sea el campo correcto; el nombre y el teléfono del dueño son obligatorios.",
      pasos: [["resaltar", "Revisar antes de importar", 3200]],
    },
    {
      titulo: "La vista previa",
      dice: "Antes de importar ves qué va a pasar con cada fila: dueños nuevos, los que ya existen, mascotas repetidas y los errores, como un teléfono incompleto.",
      pasos: [["resaltar", "Con error", 2800], ["resaltar", "Se importan", 2600]],
    },
    {
      titulo: "Importar",
      dice: "Aprieta «Importar». Avanza por lotes con su progreso, y las razas que no están en el catálogo quedan en un resumen para corregirlas después.",
      pasos: [["resaltar", "Importación terminada", 3000]],
    },
  ],
  resumen: ["Plantilla descargable y columnas reconocidas solas.", "Vista previa con errores por fila antes de importar.", "Si el teléfono o el microchip ya existen, omites o actualizas.", "Las razas fuera del catálogo se corrigen después."],
};
