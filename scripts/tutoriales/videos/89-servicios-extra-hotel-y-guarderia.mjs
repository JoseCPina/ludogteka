// 89 · Servicios extra de hotel y guardería (admin)
export default {
  rol: "admin",
  inicio: "/extras/catalogo",
  async preparar({ sb, negocioId }) {
    // El paseo que crea el video se da de baja antes de grabar, para poder crearlo otra vez.
    const { data } = await sb.from("servicios_extra").select("id, servicio_id").eq("negocio_id", negocioId).eq("nombre", "Paseo de 30 minutos").is("deleted_at", null);
    const ahora = new Date().toISOString();
    for (const e of data ?? []) {
      await sb.from("servicios_extra").update({ deleted_at: ahora }).eq("id", e.id);
      await sb.from("servicios").update({ deleted_at: ahora }).eq("id", e.servicio_id);
    }
  },
  gancho: "Un paseo, una sesión de entrenamiento o el traslado a domicilio: son servicios extra que le sumas a la estancia de un perro, y se cobran en su misma cuenta. Así se arman y se llevan.",
  escenas: [
    {
      titulo: "Tu catálogo",
      dice: "En «Catálogo de servicios extra» creas lo que ofreces: un nombre, su precio, qué incluye y la clase fiscal para el IVA. Por ejemplo, un paseo de treinta minutos a ochenta pesos.",
      pasos: [["clic", "+ Paseo"], ["escribir", "Nombre", "Paseo de 30 minutos"], ["escribir", "Precio", "80"], ["resaltar", "Clase fiscal (IVA)", 2600], ["clic", "Crear servicio extra"], ["esperar", 2000]],
    },
    {
      titulo: "Tipos de servicio",
      dice: "Un servicio puede ser normal, un paquete de sesiones, o un traslado a domicilio con zonas y un precio por cada una. El paquete se vende como cualquier pase y descuenta una sesión cada vez que se hace.",
      pasos: [["resaltar", "Tipo", 3200]],
    },
    {
      titulo: "Agregar o programar",
      dice: "Ya con el catálogo, en el check-in y el check-out de una estancia aparece «Servicios extra»: lo agregas en el momento, o lo programas para varios días y sale en el tablero.",
      pasos: [["ir", "/extras"], ["esperar", 2500]],
    },
    {
      titulo: "El tablero del día",
      dice: "En «Servicios extra», «Tareas del día» lista lo que toca hoy y lo pendiente de días anteriores. Al terminar un servicio, lo marcas como hecho: en ese momento entra a la cuenta con su precio.",
      pasos: [["resaltar", "Tareas del día", 3200]],
    },
    {
      titulo: "Traslados",
      dice: "Los traslados tienen su propia hoja: ahí ves a quién hay que recoger o entregar, en qué zona y a qué dirección, y marcas cuando va en camino y cuando quedó entregado o recogido. El aviso al cliente es un mensaje de WhatsApp que tú envías.",
      pasos: [["resaltar", "Traslados", 3200]],
    },
  ],
  resumen: ["Creas tu catálogo con precio y clase fiscal.", "Se agregan o se programan en la estancia del perro.", "«Marcar hecho» manda el cargo a la cuenta; los traslados tienen su hoja."],
};
