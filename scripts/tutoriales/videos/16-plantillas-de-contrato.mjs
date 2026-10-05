// 16 · Plantillas de contrato (admin)
export default {
  rol: "admin",
  inicio: "/contratos",
  gancho: "Tu contrato es tuyo: tú escribes qué dice, cuándo se genera y a qué servicios aplica. PeluDesk solo llena los datos de cada cliente y de cada perro.",
  escenas: [
    {
      titulo: "Tus contratos",
      dice: "En «Contratos» ves cada tipo de contrato de tu negocio, por ejemplo el general y el de hotel. Cada uno tiene versiones: cuando cambias el texto, se crea una versión nueva y las firmadas anteriores se conservan.",
      pasos: [["resaltar", "Contratos", 2400], ["zoom", "css:main", 1.15, 3800]],
    },
    {
      titulo: "Editar el texto",
      dice: "Con «Editar texto (nueva versión)» escribes el contrato. En lugar de los datos del cliente pones variables, como el nombre del dueño o del perro, y la app las llena sola. Antes de publicar, la vista previa te muestra cómo queda y te avisa si usaste una variable que no existe.",
      pasos: [["clic", "Editar texto (nueva versión)"], ["esperar", 4500]],
    },
    {
      titulo: "Refirma, nombre y servicios",
      dice: "Si marcas «Requiere refirma», todos los clientes tendrán que firmar la versión nueva. Con «Editar nombre y servicios» decides a qué servicios aplica el contrato, y con «Archivar» lo retiras sin borrar lo ya firmado.",
      pasos: [["ir", "/contratos"], ["resaltar", "Requiere refirma", 2800], ["resaltar", "Editar nombre y servicios", 2600], ["resaltar", "Archivar", 2400]],
    },
    {
      titulo: "Un contrato nuevo",
      dice: "Y con «Nuevo contrato» creas otro tipo. Tú decides si se genera en el alta del cliente o hasta que compra un paquete. Los contratos son de guardería y hotel: en estética no hay contrato.",
      pasos: [["resaltar", "Nuevo contrato", 3000]],
    },
  ],
  resumen: ["Tú escribes el contrato y la app llena los datos de cada cliente.", "Cada cambio crea una versión nueva y lo firmado se conserva.", "Decides a qué servicios aplica y cuándo se genera."],
};
