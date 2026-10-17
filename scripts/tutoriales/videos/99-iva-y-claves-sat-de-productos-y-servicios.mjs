// 99 · IVA y claves del SAT de lo que vendes (admin)
// /admin/facturacion muestra la tabla de IVA y la clasificación aunque la facturación no esté activa (valores por
// omisión). El demo no tiene productos «a la venta» (insumos.se_vende): sin eso, «Productos que se venden en mostrador»
// dice «No hay productos a la venta todavía.». `preparar` pone a la venta «Premios de entrenamiento» (precio de
// ejemplo) mientras graba; `despues` lo regresa.
// No se guarda nada en pantalla: «Buscar» consulta el catálogo del PAC con la llave del negocio, que el demo no tiene,
// así que solo se escribe la búsqueda y se resalta el botón.
const PRODUCTO = { id: null, antes: null };

export default {
  rol: "admin",
  inicio: "/admin/facturacion",
  async preparar({ sb, negocioId }) {
    const { data: ya } = await sb.from("insumos").select("id").eq("negocio_id", negocioId).eq("se_vende", true).is("deleted_at", null).limit(1);
    if (ya?.length) return;
    const { data: ins } = await sb.from("insumos").select("id, se_vende, precio_venta").eq("negocio_id", negocioId).eq("nombre", "Premios de entrenamiento").is("deleted_at", null).maybeSingle();
    if (!ins) throw new Error("No encontré «Premios de entrenamiento» en el demo.");
    if (!PRODUCTO.id) Object.assign(PRODUCTO, { id: ins.id, antes: { se_vende: ins.se_vende, precio_venta: ins.precio_venta } });
    const { error } = await sb.from("insumos").update({ se_vende: true, precio_venta: 95 }).eq("id", ins.id);
    if (error) throw new Error(`No pude poner a la venta el producto de ejemplo: ${error.message}`);
  },
  async despues({ sb }) {
    if (PRODUCTO.id) await sb.from("insumos").update(PRODUCTO.antes).eq("id", PRODUCTO.id);
  },
  gancho: "Cada cosa que vendes lleva su IVA y sus claves del SAT en la factura. Se ajustan una vez, por tipo de concepto, y salen solas en cada factura.",
  escenas: [
    {
      titulo: "El IVA de cada tipo",
      dice: "En Administración, Facturación, cada tipo de concepto trae su IVA: los servicios y el alimento procesado al 16 %, las medicinas de patente al 0 %, y la consulta veterinaria exenta solo si eres persona física o sociedad civil.",
      pasos: [["desplazar", "IVA y claves del SAT por tipo de concepto"], ["resaltar", "IVA y claves del SAT por tipo de concepto", 2400], ["desplazar", "Medicina de patente veterinaria"], ["resaltar", "css:li:has-text('Medicina de patente veterinaria')", 3200]],
    },
    {
      titulo: "Las claves del SAT",
      dice: "Las claves de arranque son genéricas: cámbialas por las que te indique tu contador. Escribe la clave del producto o servicio y la de unidad, o búscala en el catálogo del SAT, y guarda.",
      pasos: [["desplazar", "IVA y claves del SAT por tipo de concepto"], ["resaltar", "Clave del producto o servicio (SAT)", 2800], ["escribir", "Buscar clave en el catálogo del SAT", "estética canina"], ["resaltar", "css:li:has-text('Estética') button:has-text('Buscar')", 2200]],
    },
    {
      titulo: "Productos y servicios",
      dice: "Más abajo, marca qué productos son medicina de patente y cuáles son alimento para mascotas; lo demás se factura con IVA 16 %. Un servicio toma su clase solo, y si uno no cae bien, escoge cómo se factura.",
      pasos: [["desplazar", "Productos que se venden en mostrador"], ["resaltar", "css:li:has(input[type=checkbox])", 3000], ["desplazar", "Se factura como"], ["resaltar", "Se factura como", 2600]],
    },
  ],
  resumen: ["Cada tipo de concepto tiene su IVA y sus claves del SAT.", "Cambia las claves genéricas por las de tu contador.", "Marca tus productos de patente y de alimento; los servicios caen solos."],
};
