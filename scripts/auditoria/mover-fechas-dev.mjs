// QA S63 · N167 (ALTO): «Mover fechas» de una estancia. En DESARROLLO (Huellitas), con la app compilada en el 3001:
//
//   node scripts/auditoria/mover-fechas-dev.mjs
//
// Por la base y por la pantalla (detalle de la reserva → «Mover fechas»), hotel y guardería, con y sin abono, más y
// menos noches, y a un día que el negocio no abre:
//   · la vista previa nunca da el error genérico: con una regla (día cerrado) dice cuál y deja confirmarlo;
//   · lo guardado deja el total que dijo la vista previa (cuenta_totales_reserva), el saldo = total − abonado;
//   · el cupo (calendario_ocupacion) deja de contar el día que se dejó y cuenta el nuevo;
//   · el dueño con la app recibe «… cambió las fechas de …» (app_avisos), uno por cambio.
// Limpia lo que crea.
const { B, SB, datos, comprobar, seccion, terminar } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo, textoDe } = await import("./lib/huellitas-navegador.mjs");

const sufijo = String(Date.now()).slice(-6);
const sumar = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
const centavos = (n) => Math.round(Number(n) * 100);
const nav = await abrirNavegador();
const creados = { estancias: [], reservas: [], perros: [], cobros: [], avisos: [] };
const turno = (await SB.from("turnos_caja").select("id, abierto_por").eq("estado", "abierto").is("deleted_at", null).maybeSingle()).data;
if (!turno) throw new Error("Huellitas necesita un turno de caja abierto.");

try {
  const { p, api } = await abrirComo(nav, turno.abierto_por, B, { width: 1280, height: 900 });
  const hoy = (await api.rpc("fecha_negocio")).data;
  const abre = async (d) => (await api.rpc("negocio_abre", { p_fecha: d })).data === true;
  const abierto = async (d) => { let x = d; for (let i = 0; i < 14 && !(await abre(x)); i++) x = sumar(x, 1); return x; };
  let cerrado = null;
  for (let i = 3; i < 17 && !cerrado; i++) if (!(await abre(sumar(hoy, i)))) cerrado = sumar(hoy, i);
  const { data: tallaChico } = await SB.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const servicio = async (cat, unidad) => (await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", cat).eq("unidad", unidad).is("deleted_at", null).limit(1).single()).data.id;
  const hotel = await servicio("hotel", "noche");
  const guarderia = await servicio("guarderia", "dia");
  const totales = async (r) => (await api.rpc("cuenta_totales_reserva", { p_reserva_id: r })).data?.[0];
  const ocupado = async (d, campo) => Number(((await api.rpc("calendario_ocupacion", { p_desde: d, p_hasta: d })).data ?? [])[0]?.[campo] ?? 0);

  async function reservar(nombre, servicioId, entrada, salida) {
    const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ mover ${nombre} ${sufijo}`, tamano_id: tallaChico.id }).select("id").single()).data;
    creados.perros.push(perro.id);
    const r = (await api.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    creados.reservas.push(r.id);
    const e = await api.from("estancias").insert({
      reserva_id: r.id, perro_id: perro.id, servicio_id: servicioId, fecha_entrada: entrada, fecha_salida: salida, dia_cerrado_confirmado: "confirmado",
      bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "QA S63", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "QA S63",
    }).select("id, updated_at").single();
    if (e.error) throw new Error(`estancia ${nombre}: ${e.error.message}`);
    creados.estancias.push(e.data.id);
    return { id: e.data.id, reserva: r.id, perro: perro.id };
  }
  async function abonar(reserva, monto) {
    const c = await api.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: `QA S63 mover ${sufijo}`, p_metodos: [{ metodo: "efectivo", monto }] });
    if (c.error) throw new Error(`abono: ${c.error.message}`);
    creados.cobros.push(typeof c.data === "string" ? c.data : c.data?.cobro_id ?? c.data?.id);
  }
  // El disparador liga el perro nuevo a una mascota de la app del dueño (si el cliente tiene cuenta); el aviso se busca por su origen.
  const avisos = async (perro, estancia) => {
    const { data: v } = await SB.from("mascotas_vinculos").select("mascota_id").eq("perro_id", perro).is("deleted_at", null).maybeSingle();
    if (!v) return null;
    const { data } = await SB.from("app_avisos").select("id, titulo").eq("tipo", "negocio").contains("datos", { origen_id: estancia }).ilike("titulo", "%cambió las fechas%");
    creados.avisos.push(...(data ?? []).map((a) => a.id));
    return (data ?? []).length;
  };

  // Por la pantalla, como la QA: detalle de la reserva → «Mover fechas» → fechas → vista previa → «Guardar fechas».
  async function moverEnPantalla(e, entrada, salida, { confirmarCerrado = false, esGuarderia = false } = {}) {
    await p.goto(`${BASE}/reservas/${e.reserva}`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Mover fechas" }).first().click();
    const caja = p.locator("[data-mover-fechas]");
    await caja.locator('input[type="date"]').first().fill(entrada);
    if (!esGuarderia) await caja.locator('input[type="date"]').nth(1).fill(salida);
    const vista = caja.locator("[data-vista-previa-fechas]");
    await p.waitForFunction((el) => el && !/Calculando/.test(el.textContent ?? ""), await vista.elementHandle(), { timeout: 15000 }).catch(() => null);
    let textoVista = (await vista.innerText()).replace(/\s+/g, " ");
    if (confirmarCerrado && (await caja.locator("[data-confirmar-dia-cerrado]").count())) {
      await caja.locator("[data-confirmar-dia-cerrado]").check();
      await p.waitForFunction((el) => el && /Total de la cuenta/.test(el.textContent ?? ""), await vista.elementHandle(), { timeout: 15000 }).catch(() => null);
    }
    const totalVisto = await vista.locator("[data-total-despues]").getAttribute("data-total-despues").catch(() => null);
    const habilitado = await caja.locator("[data-guardar-fechas]").isEnabled();
    if (habilitado) {
      await caja.locator("[data-guardar-fechas]").click();
      await caja.waitFor({ state: "detached", timeout: 20000 }).catch(() => null);
    }
    const error = (await caja.count()) ? (await caja.innerText().catch(() => "")).replace(/\s+/g, " ") : "";
    return { textoVista, totalVisto, habilitado, error };
  }

  // ── 1. Hotel sin abono: más noches ──────────────────────────────────────────────────────────────────────────────
  seccion("1. Hotel sin abono: más noches");
  const ent1 = await abierto(sumar(hoy, 2));
  const sal1 = await abierto(sumar(ent1, 2));
  const e1 = await reservar("hotel", hotel, ent1, sal1);
  const t1a = await totales(e1.reserva);
  const sal1b = await abierto(sumar(sal1, 1));
  const antesCupo = await ocupado(sal1, "ocupado_nocturno");
  const r1 = await moverEnPantalla(e1, ent1, sal1b);
  comprobar(!/No pudimos/.test(r1.textoVista + r1.error), `la vista previa no da el error genérico («${r1.textoVista}»)`);
  const t1b = await totales(e1.reserva);
  comprobar(r1.habilitado && centavos(r1.totalVisto) === centavos(t1b.total_cuenta) && Number(t1b.total_cuenta) > Number(t1a.total_cuenta), `guardó: total ${t1a.total_cuenta} → ${t1b.total_cuenta} (vista previa ${r1.totalVisto})`);
  const est1 = (await SB.from("estancias").select("fecha_entrada, fecha_salida").eq("id", e1.id).single()).data;
  comprobar(est1.fecha_salida === sal1b, `la salida quedó en ${est1.fecha_salida}`);
  comprobar((await ocupado(sal1, "ocupado_nocturno")) === antesCupo + 1, `el cupo nocturno del ${sal1} cuenta la noche nueva`);
  const a1 = await avisos(e1.perro, e1.id);
  if (a1 !== null) comprobar(a1 >= 1, `el dueño recibió «cambió las fechas» (${a1})`);
  else console.log("  · el cliente de Huellitas no tiene dueño en la app: el aviso no se revisa");

  // ── 2. Hotel con abono: menos noches ────────────────────────────────────────────────────────────────────────────
  seccion("2. Hotel con abono: menos noches");
  await abonar(e1.reserva, 100);
  const sal1c = sumar(ent1, 1);
  const r2 = await moverEnPantalla(e1, ent1, (await abre(sal1c)) ? sal1c : sal1, {});
  const t2 = await totales(e1.reserva);
  comprobar(!/No pudimos/.test(r2.textoVista + r2.error) && r2.habilitado, `menos noches con abono: «${r2.textoVista}»`);
  comprobar(centavos(t2.saldo) === centavos(Number(t2.total_cuenta) - Number(t2.total_cobrado) + Number(t2.total_devuelto) - Number(t2.total_bono ?? 0) - Number(t2.total_descuento ?? 0)) && centavos(r2.totalVisto) === centavos(t2.total_cuenta), `total ${t2.total_cuenta}, abonado ${t2.total_cobrado}, saldo ${t2.saldo}`);

  // ── 3. Guardería con abono: otro día ────────────────────────────────────────────────────────────────────────────
  seccion("3. Guardería con abono: otro día");
  const g0 = await abierto(sumar(hoy, 3));
  const e3 = await reservar("guarderia", guarderia, g0, sumar(g0, 1));
  await abonar(e3.reserva, 50);
  const g1 = await abierto(sumar(g0, 1));
  const antesG0 = await ocupado(g0, "ocupado_diurno");
  const antesG1 = await ocupado(g1, "ocupado_diurno");
  const r3 = await moverEnPantalla(e3, g1, sumar(g1, 1), { esGuarderia: true });
  const t3 = await totales(e3.reserva);
  comprobar(r3.habilitado && !/No pudimos/.test(r3.textoVista + r3.error) && centavos(r3.totalVisto) === centavos(t3.total_cuenta), `guardería movida del ${g0} al ${g1}: total ${t3.total_cuenta}, saldo ${t3.saldo}`);
  comprobar((await ocupado(g0, "ocupado_diurno")) === antesG0 - 1 && (await ocupado(g1, "ocupado_diurno")) === antesG1 + 1, `el cupo diurno deja el ${g0} y cuenta el ${g1}`);

  // ── 4. A un día cerrado: dice cuál regla y deja confirmarlo ─────────────────────────────────────────────────────
  seccion("4. A un día que el negocio no abre");
  if (!cerrado) console.log("  · Huellitas abre todos los días de las próximas dos semanas: se salta");
  else {
    const c = await api.rpc("estancia_cotizar_fechas", { p_estancia_id: e3.id, p_entrada: cerrado, p_salida: sumar(cerrado, 1) });
    comprobar(!c.error && c.data?.codigo === "dia_cerrado" && /no abre/.test(c.data?.error ?? ""), `la base devuelve el motivo real (${c.error?.message ?? `${c.data?.codigo}: ${c.data?.error}`})`);
    const r4 = await moverEnPantalla(e3, cerrado, sumar(cerrado, 1), { esGuarderia: true, confirmarCerrado: true });
    comprobar(/no abre/.test(r4.textoVista) || r4.habilitado, `la pantalla dice el motivo y deja confirmarlo («${r4.textoVista.slice(0, 140)}»)`);
    const est4 = (await SB.from("estancias").select("fecha_entrada, dia_cerrado_confirmado").eq("id", e3.id).single()).data;
    comprobar(r4.habilitado && est4.fecha_entrada === cerrado && Boolean(est4.dia_cerrado_confirmado), `confirmado, queda el ${est4.fecha_entrada} con «${est4.dia_cerrado_confirmado}»`);
  }
  // ── 5. Ningún error de la base sale como el genérico ───────────────────────────────────────────────────────────
  seccion("5. Fechas imposibles");
  const imp = await api.rpc("estancia_cotizar_fechas", { p_estancia_id: e1.id, p_entrada: sal1, p_salida: ent1 });
  comprobar(!imp.error && Boolean(imp.data?.error), `salida antes de la entrada: la base contesta con su motivo (${imp.error?.code ?? imp.data?.codigo}: ${imp.error?.message ?? imp.data?.error})`);
  await p.context().close();
} finally {
  for (const id of creados.cobros.filter(Boolean)) {
    await SB.from("cobro_metodos").delete().eq("cobro_id", id);
    await SB.from("cobros").delete().eq("id", id);
  }
  for (const id of creados.avisos) await SB.from("app_avisos").delete().eq("id", id);
  for (const id of creados.estancias) await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  for (const id of creados.reservas) await SB.from("reservas").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  for (const id of creados.perros) {
    await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  }
  await nav.close();
}
terminar();
