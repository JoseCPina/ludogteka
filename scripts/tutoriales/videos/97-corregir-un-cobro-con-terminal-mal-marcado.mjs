// 97 · Cobro con terminal mal marcado y la conciliación con Mercado Pago (admin)
// El demo no tiene Mercado Pago conectado, así que la conciliación nunca encuentra nada: `preparar` deja UNA diferencia
// «cobro_sin_pago» abierta sobre un cobro real del demo (método Terminal, a mano, sin propina), igual que la
// escribiría conciliacion_sincronizar (clave = id del cobro). NO se marca nada: «Marcar como no recibido» le pregunta
// a Mercado Pago y en el demo respondería «la cuenta no está conectada», así que el video se detiene con el motivo escrito.
// `despues` da por resuelta la diferencia sembrada.
const COBRO = { id: null, reserva: null, diferencia: null };

export default {
  rol: "admin",
  inicio: "/recepcion",
  async preparar({ sb, negocioId }) {
    const { data: metodos } = await sb.from("cobro_metodos").select("cobro_id, monto, propina").eq("negocio_id", negocioId).eq("metodo", "terminal").gt("monto", 0).order("created_at", { ascending: false }).limit(40);
    for (const m of metodos ?? []) {
      if (Number(m.propina ?? 0) !== 0) continue;
      const { data: c } = await sb.from("cobros").select("id, reserva_id, origen, anulado_at, grupo_id, created_at").eq("id", m.cobro_id).is("deleted_at", null).maybeSingle();
      if (!c || c.origen !== "manual" || c.anulado_at || c.grupo_id) continue;
      const { count } = await sb.from("devoluciones").select("id", { count: "exact", head: true }).eq("cobro_id", c.id);
      if (count) continue;
      Object.assign(COBRO, { id: c.id, reserva: c.reserva_id, monto: Number(m.monto), cuando: c.created_at });
      break;
    }
    if (!COBRO.id) throw new Error("El demo no tiene un cobro con terminal (a mano, sin propina) para enseñar la corrección.");
    const { data: abierta } = await sb.from("conciliacion_terminal").select("id").eq("negocio_id", negocioId).eq("tipo", "cobro_sin_pago").eq("clave", COBRO.id).is("resuelta_at", null).maybeSingle();
    if (abierta) { COBRO.diferencia = abierta.id; return; }
    const { data: nueva, error } = await sb.from("conciliacion_terminal").insert({ negocio_id: negocioId, proveedor: "mercadopago", tipo: "cobro_sin_pago", clave: COBRO.id, cobro_id: COBRO.id, monto: COBRO.monto, ocurrio_at: COBRO.cuando, detalle: { motivo: "Mercado Pago no tiene un pago aprobado de este monto en la terminal." } }).select("id").single();
    if (error) throw new Error(`No pude sembrar la diferencia de conciliación: ${error.message}`);
    COBRO.diferencia = nueva.id;
  },
  async despues({ sb }) {
    if (COBRO.diferencia) await sb.from("conciliacion_terminal").update({ resuelta_at: new Date().toISOString(), resuelta_motivo: "Diferencia de ejemplo del video 97." }).eq("id", COBRO.diferencia).is("resuelta_at", null);
  },
  gancho: "La caja dice que se cobró con terminal, pero nadie pasó la tarjeta. La app lo detecta al compararse con Mercado Pago, y el admin lo corrige sin borrar nada.",
  escenas: [
    {
      titulo: "El aviso",
      dice: "Cada hora la app compara los cobros con terminal contra los pagos de Mercado Pago cobrados desde PeluDesk. Lo que no cuadra sale en «Necesita atención» y en Conciliación, del más viejo al más nuevo. Solo lo marca: no corrige nada.",
      pasos: [["resaltar", "Un cobro con terminal no aparece como pagado en Mercado Pago", 3000], ["clic", "Un cobro con terminal no aparece como pagado en Mercado Pago", { nav: true }], ["desplazar", "Diferencias"], ["resaltar", "css:[data-conciliacion]", 3200]],
    },
    {
      titulo: "Primero, pregunta",
      dice: "Pregúntale al cliente si pagó. Si pagó, el admin aprieta «Dar por revisada» y escribe qué revisó. Si no pagó, abre la cuenta desde aquí.",
      pasos: [["resaltar", "css:[data-conciliacion] button", 2600], ["clic", "css:[data-conciliacion] a", { nav: true }]],
    },
    {
      titulo: "Marcar como no recibido",
      dice: "En el cobro, aprieta «Marcar como no recibido» y escribe el motivo. Antes de cambiar nada, la app le pregunta a Mercado Pago: si tiene un pago que pueda ser de este cobro, no te deja. Si no, la cuenta vuelve a tener saldo y queda quién lo hizo y por qué.",
      pasos: [["desplazar", "Marcar como no recibido"], ["clic", "Marcar como no recibido"], ["escribir", "Motivo (obligatorio)", "El cliente se fue sin pasar la tarjeta"], ["resaltar", "css:[data-no-recibido]", 3400]],
    },
  ],
  resumen: ["Cada hora la app compara y solo marca lo que no cuadra.", "Si el cliente pagó, se da por revisada con una nota.", "Si no pagó, «Marcar como no recibido» le devuelve el saldo a la cuenta."],
};
