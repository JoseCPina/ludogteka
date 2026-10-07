// 57 · Cobrar varios servicios juntos (recepción)
export default {
  rol: "recepcion",
  inicio: "/caja",
  // Dos cuentas abiertas de la misma persona, inventadas, para cobrarlas juntas.
  async preparar({ sb, negocioId, tel }) {
    const ahora = new Date().toISOString();
    let { data: cli } = await sb.from("clientes").select("id").eq("negocio_id", negocioId).eq("nombre", "Victoria Salas").is("deleted_at", null).maybeSingle();
    if (!cli) {
      const r = await sb.from("clientes").insert({ negocio_id: negocioId, nombre: "Victoria Salas", telefono: tel, updated_at: ahora }).select("id").single();
      if (r.error) throw new Error(`cliente de la demo: ${r.error.message}`);
      cli = r.data;
    }
    // Lo que quedó de grabaciones anteriores no se acumula.
    await sb.from("reservas").update({ deleted_at: ahora }).eq("negocio_id", negocioId).eq("cliente_id", cli.id).is("deleted_at", null);
    for (const [concepto, precio] of [["Osito — Baño rapado", 320], ["Osito — Guardería 1 hr", 35]]) {
      const { data: res, error } = await sb.from("reservas").insert({ negocio_id: negocioId, cliente_id: cli.id, notas: concepto, updated_at: ahora }).select("id").single();
      if (error) throw new Error(`reserva de la demo: ${error.message}`);
      const v = await sb.from("ventas_mostrador").insert({ negocio_id: negocioId, reserva_id: res.id, concepto, cantidad: 1, precio_unitario: precio, updated_at: ahora });
      if (v.error) throw new Error(`venta de la demo: ${v.error.message}`);
    }
  },
  gancho: "Una clienta trae a su perro al baño y también lo deja una hora en la guardería. Son dos cuentas, pero paga una sola vez, con una sola tarjeta. Así las cobras juntas.",
  escenas: [
    {
      titulo: "Las cuentas de una persona",
      dice: "En «Caja», las cuentas de la misma persona salen juntas, con su «Total junto». Para cobrarlas de una vez, aprieta «Cobrar todo junto».",
      pasos: [["resaltar", "Total junto", 3000], ["resaltar", "Cobrar todo junto", 2400]],
    },
    {
      titulo: "O marca cuáles",
      dice: "Si solo quieres juntar algunas, marca su casilla. Abajo ves cuántas marcaste y cuánto suman. Solo se juntan cuentas de la misma persona: nunca se mezclan clientas.",
      pasos: [["clic", "css:[data-grupo-cliente]:has-text('Victoria Salas') [data-cuenta-casilla]"], ["resaltar", "cuenta marcada", 2600], ["clic", "Quitar marcas"]],
    },
    {
      titulo: "El cobro junto",
      dice: "Aprieta el botón de cobrar todo junto. Ves cada cuenta con lo que debe y cuánto «Se le aplica». Si la clienta paga menos, escribe lo que recibiste en «Total que paga hoy»: se aplica de la cuenta más antigua a la más nueva, y lo que falte queda como saldo.",
      pasos: [
        ["clic", "css:[data-grupo-cliente]:has-text('Victoria Salas') [data-cobrar-todo-junto]", { nav: true }],
        ["resaltar", "Cuentas incluidas (2)", 2400],
        ["escribir", "Total que paga hoy", "340"],
        ["resaltar", "Quedará debiendo", 2400],
        ["escribir", "Total que paga hoy", "355"],
      ],
    },
    {
      titulo: "Un pago, un folio",
      dice: "Escoge el «Método». Con «Tarjeta (registro manual)» escribes un solo folio para todo el grupo, y una sola propina. Con la terminal o con un link se manda una sola orden por el total, y al confirmarse se reparte entre las cuentas.",
      pasos: [
        ["elegir", "Método", "Tarjeta (registro manual)"],
        ["escribir", "Folio o autorización del voucher", "TUT-{tel}"],
        ["elegir", "¿Por qué no se cobró con la terminal vinculada?", "Sin señal o sin internet"],
      ],
    },
    {
      titulo: "El recibo único",
      dice: "Aprieta el botón de registrar cobro. Sale un solo recibo, con el desglose por cuenta, los métodos y el folio. Lo imprimes o lo guardas como PDF. En el turno y en el corte, el pago cuenta una sola vez.",
      pasos: [["clic", "css:[data-registrar-junto]", { nav: true }], ["esperar", 2500], ["resaltar", "Cobro registrado", 2800], ["resaltar", "Imprimir o guardar PDF", 2200]],
    },
  ],
  resumen: ["Las cuentas de la misma persona se cobran juntas, con un solo pago.", "Si paga menos, se aplica de la más antigua a la más nueva.", "Un solo folio y un solo recibo con el desglose por cuenta."],
};
