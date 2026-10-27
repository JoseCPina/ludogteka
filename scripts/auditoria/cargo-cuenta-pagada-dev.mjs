// «Aplicar cargo» en una estancia finalizada sigue la regla de N129 (`admiteCargosNuevos`, src/lib/caja/cuenta-por-cobrar.ts):
// se ofrece solo mientras la cuenta tenga saldo o no se haya cobrado; pagada (saldo $0) desaparece, con el aviso de por qué,
// y lo mismo el formulario de servicios extra de su check-out; al anular el cobro y volver a tener saldo, reaparece. Una
// pantalla que se quedó abierta de antes del cobro no puede colarlo: la acción del servidor revisa la misma regla. SOLO
// DESARROLLO (Huellitas), con `next start` en el 3001:
//
//   node scripts/auditoria/cargo-cuenta-pagada-dev.mjs
const { B, SB, datos, comprobar, seccion, terminar } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo, esperarTexto } = await import("./lib/huellitas-navegador.mjs");
const { CONFIRMA_FUERA_HORARIO, confirmarSiFueraDeHorario } = await import("../lib/fuera-horario.mjs");

const sufijo = String(Date.now()).slice(-6);
const sumar = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
const nav = await abrirNavegador();
const creados = { perros: [], estancias: [] };
try {
  const { p, api } = await abrirComo(nav, datos.adminB, B);
  const hoy = (await api.rpc("fecha_negocio")).data;
  const abre = async (d) => (await api.rpc("negocio_abre", { p_fecha: d })).data === true;
  const abiertoDesde = async (d, paso) => { let x = d; for (let i = 0; i < 14 && !(await abre(x)); i++) x = sumar(x, paso); return x; };
  const { data: tallaChico } = await SB.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: hotel } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "hotel").eq("unidad", "noche").is("deleted_at", null).limit(1).single();

  // Una estancia de hotel que entró ayer y sale hoy por la pantalla de check-out: finalizada, con saldo y nada cobrado.
  const nombre = `ZZ Pagada ${sufijo}`;
  const entrada = await abiertoDesde(sumar(hoy, -1), -1);
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre, tamano_id: tallaChico.id }).select("id").single()).data;
  creados.perros.push(perro.id);
  const reserva = (await api.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
  const est = await api.from("estancias").insert({
    reserva_id: reserva.id, perro_id: perro.id, servicio_id: hotel.id, fecha_entrada: entrada, fecha_salida: hoy, dia_cerrado_confirmado: "confirmado",
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba cuenta pagada", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba cuenta pagada",
  }).select("id").single();
  if (est.error) throw new Error(`estancia: ${est.error.message}`);
  const id = est.data.id;
  creados.estancias.push(id);
  const ci = await api.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Prueba", hora_entrada_real: new Date(`${entrada}T17:00:00Z`).toISOString(), ...CONFIRMA_FUERA_HORARIO }).eq("id", id);
  if (ci.error) throw new Error(`check-in: ${ci.error.message}`);
  await p.goto(`${BASE}/reservas/estancias/${id}/checkout`, { waitUntil: "networkidle", timeout: 120000 });
  await p.locator("#checkout-recoge-nombre").fill("Luis Prueba");
  await p.getByRole("button", { name: "Sí, es el dueño" }).click();
  if (await p.locator("[data-entregue-todo]").count()) await p.locator("[data-entregue-todo]").click();
  await p.getByRole("button", { name: "Confirmar salida" }).click();
  await confirmarSiFueraDeHorario(p);
  await esperarTexto(p, /Salida registrada|Este perro ya salió/);

  const totales = async () => {
    const { data } = await api.rpc("cuenta_totales_reserva", { p_reserva_id: reserva.id });
    return { saldo: Number(data?.[0]?.saldo ?? 0), cobrado: Number(data?.[0]?.total_cobrado ?? 0) };
  };
  const abrirReserva = async (pag) => {
    await pag.goto(`${BASE}/reservas/${reserva.id}`, { waitUntil: "networkidle", timeout: 120000 });
    await pag.locator("[data-total-cuenta]").first().waitFor({ timeout: 30000 });
  };
  const ofreceCargo = async (pag) => (await pag.locator("[data-aplicar-cargo]").count()) > 0 && (await pag.getByLabel("Aplicar cargo", { exact: true }).count()) > 0;

  seccion("1. Finalizada con saldo y nada cobrado: ofrece «Aplicar cargo»");
  const inicio = await totales();
  await abrirReserva(p);
  comprobar(inicio.saldo > 0 && inicio.cobrado === 0 && (await ofreceCargo(p)), `saldo $${inicio.saldo.toFixed(2)}, cobrado $0: «Aplicar cargo» ${(await ofreceCargo(p)) ? "sale" : "NO SALE"}`);
  // Esta misma pantalla se queda abierta mientras otra persona cobra (sección 3).
  const vieja = await (await nav.newContext({ storageState: await p.context().storageState() })).newPage();
  // La reserva se pone al día sola cuando cambia el saldo (useCuentaViva sondea con la pestaña al frente): aquí la pestaña
  // se declara en segundo plano para simular una pantalla que no alcanzó a enterarse. La acción del servidor sí corre.
  await vieja.addInitScript(() => Object.defineProperty(document, "visibilityState", { get: () => "hidden" }));
  await abrirReserva(vieja);

  seccion("2. Se cobra todo (saldo $0): «Aplicar cargo» desaparece, con el aviso, y tampoco hay servicios extra");
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("negocio_id", B).eq("estado", "abierto").maybeSingle();
  if (!turno) turno = (await api.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "auditoría cargo con la cuenta pagada" }).select("id").single()).data;
  const { error: eCobro } = await api.rpc("registrar_cobro", { p_reserva_id: reserva.id, p_notas: "auditoría cargo cuenta pagada", p_metodos: [{ metodo: "efectivo", monto: inicio.saldo, propina: 0 }] });
  if (eCobro) throw eCobro;
  const pagada = await totales();
  await abrirReserva(p);
  const aviso = (await p.locator("[data-cargos-cerrados]").first().innerText().catch(() => "")).trim();
  comprobar(pagada.saldo <= 0.005 && !(await ofreceCargo(p)), `saldo $${pagada.saldo.toFixed(2)}: «Aplicar cargo» ${(await ofreceCargo(p)) ? "SIGUE SALIENDO" : "no sale"}`);
  comprobar(/La cuenta ya está pagada: no se le agregan cargos/.test(aviso), `dice por qué: «${aviso || "(nada)"}»`);
  await p.goto(`${BASE}/reservas/estancias/${id}/checkout`, { waitUntil: "networkidle", timeout: 120000 });
  const formExtra = await p.locator("[data-servicios-extra]").getByRole("button", { name: /Registrar y cobrar en la cuenta|Programar/ }).count();
  comprobar(formExtra === 0, `check-out ya hecho: formulario de servicios extra ${formExtra ? "SIGUE SALIENDO" : "no sale"}`);

  seccion("3. La pantalla que se quedó abierta de antes no cuela un cargo");
  const cargosAntes = (await SB.from("cargos_aplicados").select("id", { count: "exact", head: true }).eq("estancia_id", id)).count;
  if (await vieja.getByLabel("Importe").count()) {
    await vieja.getByLabel("Importe").fill("50");
    await vieja.getByLabel("Qué se le dio").fill("Prueba de pantalla vieja");
  }
  await vieja.locator("[data-aplicar-cargo]").click();
  const rechazo = await esperarTexto(vieja, /La cuenta ya está pagada/, 20000);
  const cargosDespues = (await SB.from("cargos_aplicados").select("id", { count: "exact", head: true }).eq("estancia_id", id)).count;
  comprobar(rechazo && cargosDespues === cargosAntes, `el servidor lo rechaza (${rechazo ? "con el aviso" : "SIN aviso"}) y no se guardó ningún cargo (${cargosAntes} → ${cargosDespues})`);
  await vieja.context().close();

  seccion("4. Se anula el cobro y vuelve el saldo: «Aplicar cargo» reaparece");
  await p.goto(`${BASE}/caja/cobrar/${reserva.id}`, { waitUntil: "networkidle", timeout: 120000 });
  await p.getByRole("button", { name: "Anular cobro" }).first().click();
  await p.getByLabel("Motivo (obligatorio)").fill(`Auditoría cargo cuenta pagada ${sufijo}`);
  await p.getByRole("button", { name: "Anular cobro" }).last().click();
  await esperarTexto(p, new RegExp(`Saldo: \\$${inicio.saldo.toFixed(2).replace(".", "\\.")}`));
  const despues = await totales();
  await abrirReserva(p);
  comprobar(Math.abs(despues.saldo - inicio.saldo) < 0.005 && (await ofreceCargo(p)), `saldo $${despues.saldo.toFixed(2)}: «Aplicar cargo» ${(await ofreceCargo(p)) ? "reaparece" : "NO REAPARECE"}`);
  comprobar((await p.locator("[data-cargos-cerrados]").count()) === 0, "ya no dice que la cuenta está pagada");
  await p.context().close();
} finally {
  const ahora = new Date().toISOString();
  for (const id of creados.estancias) await SB.from("estancias").update({ deleted_at: ahora }).eq("id", id);
  for (const id of creados.perros) await SB.from("perros").update({ deleted_at: ahora }).eq("id", id);
  await nav.close();
}
terminar();
