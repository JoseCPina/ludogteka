// 42 · Proveedores, áreas y sin costo (admin)
export default {
  rol: "admin",
  inicio: "/inventario/proveedores",
  gancho: "Para saber cuánto te cuesta cada baño, necesitas saber cuánto pagas por tus insumos. Ordena tus proveedores y tus áreas, y cierra lo que no tiene costo.",
  escenas: [
    {
      titulo: "Proveedores",
      dice: "En «Proveedores» tienes a quienes te surten, con su contacto. Con «Nuevo proveedor» das de alta uno nuevo. Cada compra de insumos puede llevar su proveedor.",
      pasos: [["resaltar", "Proveedores", 2400], ["resaltar", "Nuevo proveedor", 2600]],
    },
    {
      titulo: "Un proveedor nuevo",
      dice: "Escribes su «Nombre», la «Persona de contacto» y su teléfono, y aprietas «Crear proveedor».",
      pasos: [["clic", "Nuevo proveedor", { nav: true }], ["escribir", "Nombre", "Distribuidora Ejemplo {n3}"], ["escribir", "Persona de contacto (opcional)", "Laura"], ["clic", "Crear proveedor", { nav: true }]],
    },
    {
      titulo: "Áreas del inventario",
      dice: "En «Áreas del inventario» decides cómo se agrupa todo. Cada área dice cuántos consumibles y cuánto equipo tiene. Las puedes reordenar con las flechas, o quitar con «Quitar», y agregar con «Agregar área».",
      pasos: [["ir", "/inventario/areas"], ["resaltar", "Áreas del inventario", 2400], ["resaltar", "Agregar área", 2600]],
    },
    {
      titulo: "Consumibles sin costo",
      dice: "Y en «Consumibles sin costo» están los insumos que todavía no tienen costo, ni de referencia ni de compra. Mientras no lo tengan, tus reportes de margen no son exactos. Ciérralos cuando puedas.",
      pasos: [["ir", "/inventario/sin-costo"], ["resaltar", "Consumibles sin costo", 3000]],
    },
  ],
  resumen: ["Cada compra puede llevar su proveedor.", "Las áreas agrupan tus consumibles y tu equipo.", "«Consumibles sin costo» te dice qué falta para que tus márgenes sean exactos."],
};
