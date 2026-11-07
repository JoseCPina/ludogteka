// 54 · Recolección a domicilio (recepción): la distancia del cliente, «Incluir recolección» al reservar y la ruta del día.
// Se graba con el doble de Google en el 4457 (la app arrancada con GOOGLE_API_URL=http://127.0.0.1:4457): «Guardar y
// calcular» y «Cotizar recolección» piden la ruta al mapa.
export default {
  inicio: "/clientes",
  async preparar({ sb, negocioId }) {
    // El local ubicado en el mapa (de ahí sale la camioneta): el demo no trae sucursal.
    const { data: suc } = await sb.from("sucursales").select("id").eq("negocio_id", negocioId).is("deleted_at", null).limit(1);
    if (!suc?.length) {
      const r = await sb.from("sucursales").insert({ negocio_id: negocioId, nombre: "Patitas & Co.", activo: true, direccion: "Av. Venustiano Carranza 1250, Centro", lat: 22.1565, lng: -100.9855, updated_at: new Date().toISOString() });
      if (r.error) throw new Error(`sucursal del demo: ${r.error.message}`);
    }
    // Ana Sofía Treviño empieza sin dirección: en el video se captura y se calcula.
    await sb.from("clientes").update({ direccion: null, direccion_lat: null, direccion_lng: null, distancia_base_km: null }).eq("negocio_id", negocioId).ilike("nombre", "Ana Sofía Treviño%");
  },
  async despues({ sb, negocioId }) {
    // La recolección que dejó la reserva del video no se queda en el demo (su reserva sí, como cualquier otra).
    await sb.from("recolecciones").delete().eq("negocio_id", negocioId);
    await sb.from("recoleccion_cotizaciones").delete().eq("negocio_id", negocioId);
  },
  gancho: "Si pasas por los perros a su casa, el cobro depende de los kilómetros. La app mide la ruta, cotiza al reservar y te arma la ruta del día.",
  escenas: [
    {
      titulo: "La dirección del cliente",
      dice: "En la ficha del cliente, en «Dirección y distancia de recolección», escribes su domicilio y aprietas «Guardar y calcular». La app mide la ruta en coche desde tu negocio y guarda los kilómetros. Si no cuadran, los corriges con «Ajustar distancia a mano».",
      pasos: [["clic", "Ana Sofía Treviño", { nav: true }], ["desplazar", "Dirección y distancia de recolección"], ["escribir", "Dirección", "Av. Himno Nacional 1230, Tangamanga"], ["clic", "Guardar y calcular"], ["esperar", 3200], ["resaltar", "Ajustar distancia a mano", 2200]],
    },
    {
      titulo: "Incluirla al reservar",
      dice: "Al reservar guardería u hotel, o al agendar estética, prendes «Incluir recolección». Escoges la dirección guardada u otra, de dónde sale la camioneta en «Sale desde» y la «Hora estimada», y aprietas «Cotizar recolección»: ves los kilómetros y el precio con tu tarifa por kilómetro.",
      pasos: [["ir", "/guarderia/nueva"], ["clic", "Ana Sofía Treviño"], ["marcar", "Mochi"], ["elegir", "Servicio", "Guardería (día completo)"], ["rellenar", "Fecha", "{fechaDia}"], ["desplazar", "Incluir recolección"], ["clic", "css:[aria-labelledby='incluir-recoleccion-titulo']"], ["rellenar", "Hora estimada", "09:30"], ["clic", "Cotizar recolección"], ["esperar", 3200]],
    },
    {
      titulo: "El cargo entra con la reserva",
      dice: "Al crear la reserva, la recolección queda ligada a ella y su cargo entra a la cuenta en ese momento. Si la reserva se mueve de fecha, la recolección se mueve; si se cancela o el perro no llega, se cancela sola con su cargo.",
      pasos: [["clic", "Crear reserva"], ["esperar", 3500], ["desplazar", "Recolección a domicilio"], ["resaltar", "Recolección a domicilio", 3000]],
    },
    {
      titulo: "La ruta del día",
      dice: "En «Recolecciones», en el menú, está la ruta de cada día en orden de cercanía: marcas «Salir a recoger» y «Recogido», avisas por WhatsApp cuando vas en camino y, si hace falta, «Cancelar recolección» con motivo. El tablero de recepción te enseña las de hoy con Cómo llegar.",
      pasos: [["ir", "/recolecciones?fecha={fechaDia}"], ["resaltar", "Salir a recoger", 2600], ["resaltar", "Cancelar recolección", 2200]],
    },
  ],
  resumen: ["La app mide la distancia desde tu negocio y la guarda en la ficha del cliente.", "«Incluir recolección» al reservar o agendar: cotizas y el cargo entra a la cuenta.", "«Recolecciones» te arma la ruta del día con Cómo llegar."],
};
