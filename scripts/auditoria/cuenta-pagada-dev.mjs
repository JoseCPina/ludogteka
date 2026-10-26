// QA S36 · N129: una cuenta pagada (saldo $0) no ofrece NINGUNA acción de cobro ni de ajuste de precio: sin
// «Registrar cobro», «Cobrar con terminal», «Mandar link de pago», «Pagar con bono», «Aplicar descuento», «Corregir
// precio» ni «Corregir monto»; queda «Cuenta pagada» con sus cobros y, para admin, «Anular cobro» y «Registrar
// devolución». Al anular el cobro el saldo vuelve a ser mayor que 0 y las acciones reaparecen. La regla vive en
// `cuentaPorCobrar` (src/lib/caja/cuenta-por-cobrar.ts) y la usan la cuenta (Caja, estancia, cita, consulta y check-out
// abren la misma), el cobro integrado y el botón de la reserva. SOLO DESARROLLO (Huellitas), con `next start` en el 3001:
//
//   node scripts/auditoria/cuenta-pagada-dev.mjs
const { B, SB, datos, comprobar, seccion, terminar } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo, textoDe, esperarTexto } = await import("./lib/huellitas-navegador.mjs");

const sufijo = String(Date.now()).slice(-6);
const PROHIBIDAS = ["Registrar cobro", "Cobrar con terminal", "Mandar link de pago", "Pagar con bono", "Aplicar descuento", "Corregir precio", "Corregir monto", "Abrir turno"];
const visibles = async (p, nombres) => {
  const hay = [];
  for (const n of nombres) if (await p.getByRole("button", { name: n, exact: true }).filter({ visible: true }).count()) hay.push(n);
  return hay;
};

const nav = await abrirNavegador();
try {
  const { p, api } = await abrirComo(nav, datos.adminB, B, { width: 390, height: 844 });
  // La cuenta: una venta de mostrador de $300, cobrada completa (con turno abierto: sin turno no se cobra).
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) turno = (await api.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "auditoría cuenta pagada" }).select("id").single()).data;
  const { data: reservaId, error: eVenta } = await api.rpc("crear_venta_mostrador", { p_cliente_id: datos.clienteSoloB, p_lineas: [{ concepto: `Cuenta pagada ${sufijo}`, precio: 300, cantidad: 1 }], p_notas: "auditoría N129" });
  if (eVenta) throw eVenta;
  const { error: eCobro } = await api.rpc("registrar_cobro", { p_reserva_id: reservaId, p_notas: "auditoría N129", p_metodos: [{ metodo: "efectivo", monto: 300, propina: 0 }] });
  if (eCobro) throw eCobro;

  seccion("1. La cuenta pagada: solo ver sus cobros y, para admin, anular o devolver");
  await p.goto(`${BASE}/caja/cobrar/${reservaId}`, { waitUntil: "networkidle" });
  const t = await textoDe(p);
  comprobar(/Saldo: \$0\.00/.test(t), "saldo $0.00");
  comprobar((await p.locator("[data-cuenta-pagada]").count()) === 1, "dice «Cuenta pagada»");
  const hay = await visibles(p, PROHIBIDAS);
  comprobar(hay.length === 0, `ninguna acción de cobro ni de ajuste de precio (${hay.join(", ") || "ninguna"})`);
  comprobar((await p.getByRole("button", { name: "Anular cobro" }).count()) >= 1, "admin ve «Anular cobro»");
  comprobar(/Cobros de esta reserva/i.test(t) && t.includes("$300.00"), "se ven sus cobros");

  seccion("2. El botón de la reserva dice «Ver cobros», no «Cobrar»");
  await p.goto(`${BASE}/reservas/${reservaId}`, { waitUntil: "networkidle" });
  const boton = await p.locator("[data-cobrar-reserva]").first().innerText().catch(() => "(sin botón)");
  comprobar(boton.trim() === "Ver cobros", `el botón dice «${boton.trim()}»`);

  seccion("3. Al anular el cobro, el saldo vuelve y las acciones reaparecen");
  await p.goto(`${BASE}/caja/cobrar/${reservaId}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Anular cobro" }).first().click();
  await p.getByLabel("Motivo (obligatorio)").fill(`Auditoría N129 ${sufijo}`);
  await p.getByRole("button", { name: "Anular cobro" }).last().click();
  comprobar(await esperarTexto(p, /Saldo: \$300\.00/), "el saldo vuelve a $300.00");
  // El botón de cobro sale en cuanto la pantalla termina de ponerse al día («Actualizando saldo…»).
  await p.getByRole("button", { name: "Registrar cobro", exact: true }).waitFor({ timeout: 20000 }).catch(() => {});
  const reaparecen = await visibles(p, ["Registrar cobro", "Aplicar descuento", "Corregir precio"]);
  comprobar(reaparecen.length === 3, `reaparecen «Registrar cobro», «Aplicar descuento» y «Corregir precio» (${reaparecen.join(", ")})`);
  comprobar((await p.locator("[data-cuenta-pagada]").count()) === 0, "ya no dice «Cuenta pagada»");
  await p.context().close();
} finally {
  await nav.close();
}
terminar();
