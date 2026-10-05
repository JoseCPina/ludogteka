// 13 · Comprobantes de vacunas que mandan los dueños (recepción)
import { cartillaFicticia } from "../lib/imagen.mjs";

export default {
  inicio: "/recepcion/comprobantes",
  async preparar({ sb, negocioId }) {
    // Un comprobante propuesto por el dueño (ficticio) para revisar.
    const { data: ya } = await sb.from("requisitos_sanitarios_propuestos").select("id").eq("negocio_id", negocioId).eq("estado", "pendiente").is("deleted_at", null).limit(1);
    if (ya?.length) return;
    const { data: perro } = await sb.from("perros").select("id, cliente_id, nombre").eq("negocio_id", negocioId).is("deleted_at", null).eq("nombre", "Nube").maybeSingle();
    const { data: tipo } = await sb.from("tipos_requisito_sanitario").select("id").eq("negocio_id", negocioId).is("deleted_at", null).limit(1).single();
    if (!perro || !tipo) throw new Error("Faltan el perro Nube o los tipos de requisito en el demo.");
    const id = crypto.randomUUID();
    const path = `${perro.cliente_id}/${perro.id}/requisitos-propuestos/${id}/comprobante.jpg`;
    const { error: e1 } = await sb.storage.from("perros-archivos").upload(path, await cartillaFicticia(perro.nombre), { contentType: "image/jpeg", upsert: true });
    if (e1) throw new Error(e1.message);
    const hoy = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
    const { error } = await sb.from("requisitos_sanitarios_propuestos").insert({ id, negocio_id: negocioId, perro_id: perro.id, tipo_requisito_id: tipo.id, fecha_aplicacion: hoy, comprobante_path: path, created_by: null });
    if (error) throw new Error(error.message);
  },
  gancho: "Los dueños pueden mandar la foto del carnet de vacunas desde su celular. Pero esa foto no cuenta hasta que tú la revisas. Así se hace.",
  escenas: [
    {
      titulo: "Comprobantes por revisar",
      dice: "En «Comprobantes por revisar» llegan las fotos que subieron los dueños, con el perro, el tipo de vacuna y la fecha que ellos capturaron. Además, en el tablero, en Necesita atención, te sale un aviso con los días que llevan esperando.",
      pasos: [["esperar", 2500], ["zoom", "css:main", 1.15, 3500]],
    },
    {
      titulo: "Revisa la foto",
      dice: "Abre la foto y compárala con lo que capturó el dueño: que sea del perro correcto, que se lea la fecha y que sea la vacuna que dice.",
      pasos: [["esperar", 4000]],
    },
    {
      titulo: "Confirma o rechaza",
      dice: "Si todo coincide, la confirmas y la vacuna queda registrada con su vigencia. Si algo no cuadra, la rechazas con un motivo, y el dueño lo ve en su portal para subir otra.",
      pasos: [["esperar", 3500]],
    },
  ],
  resumen: ["Lo que sube el dueño no cuenta hasta que lo revisas.", "Confirmar registra la vacuna con su vigencia.", "Rechazar lleva un motivo, que el dueño ve en su portal."],
};
