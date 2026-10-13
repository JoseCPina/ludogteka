// 85 · Registrar una receta cuantificada del SITPV, Grupo I (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/recetas/sitpv",
  gancho: "Los productos del Grupo I se recetan en el SITPV, el sistema oficial. PeluDesk no la emite: guarda su espejo con el folio de tu bloque, para llevar tu control y tus reportes.",
  escenas: [
    {
      titulo: "Primero, en el SITPV",
      dice: "Primero emites la receta en el SITPV. Después, en «Registro SITPV», aprietas «Registrar una receta del SITPV» para guardar su espejo en PeluDesk.",
      pasos: [["esperar", 2200], ["clic", "Registrar una receta del SITPV", { nav: true }]],
    },
    {
      titulo: "El paciente o el uso hospitalario",
      dice: "Elige a la mascota, o marca «Es de uso hospitalario» si el producto se ocupa en la clínica en varias aplicaciones y no es para un paciente en particular.",
      pasos: [["resaltar", "Es de uso hospitalario (sin paciente)", 3000], ["clic", "Es de uso hospitalario (sin paciente)", { nav: true }]],
    },
    {
      titulo: "El producto y la cantidad",
      dice: "Elige el producto, solo salen los de Grupo I, su registro de SENASICA, el lote, que solo ofrece los de ese producto, la dosis, el intervalo, la duración y la cantidad total que ampara la receta. Anota el comprobante de compra.",
      pasos: [["resaltar", "Producto (Grupo I)", 2600], ["resaltar", "Cantidad total que ampara", 2800], ["resaltar", "Comprobante de compra", 2600]],
    },
    {
      titulo: "El folio",
      dice: "Al registrar, el folio sale del siguiente de tu bloque y baja tu contador. Y en el registro aparecen los datos listos para copiar al SITPV, uno por uno, con su botón de copiar.",
      pasos: [["resaltar", "Registrar", 3000]],
    },
    {
      titulo: "Parcialidades y folios en ceros",
      dice: "Cada vez que se surte una parte del producto, registras la aplicación. Un folio que no se usó se cancela, y sale en ceros en el reporte mensual. Uno que ya se surtió no se puede cancelar.",
      pasos: [["ir", "/veterinaria/recetas/sitpv"], ["esperar", 2800]],
    },
  ],
  resumen: ["PeluDesk guarda el espejo; la receta se emite en el SITPV.", "El folio sale del bloque del médico y baja su contador.", "Los folios sin usar se cancelan en ceros."],
};
