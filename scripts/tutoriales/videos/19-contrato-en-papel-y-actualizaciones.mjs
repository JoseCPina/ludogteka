// 19 · Contrato en papel, regenerar y actualizar versiones (recepción)
export default {
  inicio: "/clientes",
  gancho: "No todos firman en el celular. Y a veces un contrato firmado trae un error. Veamos cómo subir el papel firmado y cómo corregir un contrato sin perder nada.",
  escenas: [
    {
      titulo: "El contrato del perro",
      dice: "Entra al expediente del perro y baja a la sección «Contrato». Si el perro aún no tiene, aprietas «Generar contrato» y se arma con los datos de su dueño.",
      pasos: [["escribir", "Buscar por perro, dueño o teléfono", "Nube"], ["esperar", 1500], ["clic", "Ana Sofía Treviño", { nav: true }], ["clic", "Nube", { nav: true }], ["desplazar", "Contrato"], ["resaltar", "Generar contrato", 3000]],
    },
    {
      titulo: "Ver el borrador e imprimirlo",
      dice: "Con «Ver borrador» ves el contrato tal como quedará, y lo imprimes para que el dueño lo firme en el mostrador.",
      pasos: [["resaltar", "Ver borrador", 3000]],
    },
    {
      titulo: "Subir el firmado en papel",
      dice: "Ya firmado, aprieta «Subir firmado en papel», escoge la foto o el PDF y listo: queda guardado en el expediente y deja de salir como pendiente.",
      pasos: [["resaltar", "Subir firmado en papel", 3200]],
    },
    {
      titulo: "Cuando cambia el texto",
      dice: "Si publicas una versión nueva que requiere refirma, a quien ya firmó se le pide firmar otra vez. Y si un contrato firmado trae un defecto, se marca y se regenera: el anterior nunca se borra, se reemplaza.",
      pasos: [["ir", "/recepcion/contratos"], ["esperar", 3000]],
    },
  ],
  resumen: ["Generas, imprimes y subes el contrato firmado en papel.", "Si cambia el texto, quien ya firmó vuelve a firmar.", "Un contrato con defecto se regenera; el anterior nunca se borra."],
};
