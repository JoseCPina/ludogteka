// 61 · Cómo anular o corregir un cobro sin usar un descuento (admin)
// En el negocio demo las correcciones no se ejecutan (la app las rechaza en un demo): el video abre los formularios,
// escribe lo que se escribiría y se detiene antes de confirmar.
const CUENTA = { id: null };

export default {
  rol: "admin",
  inicio: "/caja",
  async preparar({ sb, negocioId }) {
    // Una cuenta con un cobro (en efectivo o transferencia) del demo.
    const { data } = await sb.from("cobro_metodos").select("cobro_id, metodo").eq("negocio_id", negocioId).in("metodo", ["efectivo", "transferencia"]).gt("monto", 0).order("created_at", { ascending: false }).limit(1);
    if (!data?.length) throw new Error("El demo no tiene un cobro en efectivo para enseñar la corrección.");
    const { data: cobro } = await sb.from("cobros").select("reserva_id").eq("id", data[0].cobro_id).single();
    CUENTA.id = cobro.reserva_id;
  },
  gancho: "Cobraste mal: te equivocaste de monto o el cobro nunca debió registrarse. Un descuento no es la salida. Se corrige el cobro, con motivo, y no se borra nada.",
  escenas: [
    {
      titulo: "Abre la cuenta",
      dice: "Abre la cuenta del cobro, desde Caja. Debajo de cada cobro tienes «Corregir monto» y «Anular cobro». Solo se ofrecen en efectivo, transferencia y tarjeta manual: la terminal y el link se devuelven con Mercado Pago.",
      pasos: [["js", async ({ page, base }) => { await page.goto(`${base}/caja/cobrar/${CUENTA.id}`, { waitUntil: "networkidle" }); }], ["desplazar", "Corregir monto"], ["resaltar", "Corregir monto", 3200]],
    },
    {
      titulo: "Corregir el monto",
      dice: "Si solo se tecleó mal la cantidad, aprieta «Corregir monto», escribe el monto correcto y guarda. El valor anterior queda en el historial y la caja ya cuenta el correcto.",
      pasos: [["clic", "Corregir monto"], ["escribir", "Monto correcto", "250"], ["resaltar", "Guardar corrección", 2800]],
    },
    {
      titulo: "Anular el cobro",
      dice: "Si el cobro nunca debió existir, aprieta «Anular cobro» y escribe qué pasó. La cuenta vuelve a quedar por cobrar y el cobro no se borra: queda en el historial con quién lo anuló y por qué.",
      pasos: [["clic", "Dejarlo"], ["clic", "Anular cobro"], ["escribir", "Motivo (obligatorio)", "Se cobró en la cuenta equivocada"], ["resaltar", "Motivo (obligatorio)", 2800]],
    },
    {
      titulo: "Corregir un precio",
      dice: "Y si lo que estaba mal era el precio de lo que se vendió, no el cobro, usa «Corregir precio» en la línea de la cuenta. Tampoco es un descuento: queda el precio anterior en el historial.",
      pasos: [["desplazar", 0], ["resaltar", "Corregir precio", 3200]],
    },
  ],
  resumen: ["Se corrige el monto o se anula, siempre con motivo.", "Nada se borra: todo queda en el historial.", "El precio de una línea se corrige aparte, sin descuentos."],
};
