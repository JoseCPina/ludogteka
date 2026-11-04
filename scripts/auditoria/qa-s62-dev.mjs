// QA S62 en DESARROLLO (Huellitas), con la app compilada en el 3001:
//
//   node scripts/auditoria/qa-s62-dev.mjs [--solo n162|n163|n164|n165|medico|ciego|ux]
//
//   N162 · hotel de 3 noches, cobro de más, check-out el mismo día: ANTES de confirmar, la revisión dice total nuevo,
//          cobrado y saldo a favor; la cuenta queda «Saldo a favor: devolver $X» (nunca «Pagada») en el check-out y en
//          Caja; sale en «Necesita atención» del admin y de recepción con «Devolver»; el dueño lo ve en su portal y en
//          la app (mis_saldos_a_favor); al devolver, desaparece.
//   N163 · cobro con tarjeta manual devuelto completo: ya no espera revisión (tarjetas_manuales_por_revisar) ni suma
//          en el aviso «sin verificar».
//   N164 · «Corregir precio» de una cita finalizada: el detalle de la cita dice el precio nuevo y la cuenta en Caja se
//          llama por su servicio, sin la corrección en el nombre (cuentas_abiertas, nombre_de_cuenta).
//   N165 · dos abonos distintos seguidos no preguntan nada; uno IGUAL en menos de un minuto pregunta «Hace N s
//          registraste un cobro igual», sin «otra ventana».
//   Médico · las listas de equipo (bienvenida, cuentas del admin) dicen «Médico veterinario», nunca «Estética».
//   Corte ciego · con el turno abierto por el admin A: A no ve montos ni totales del turno en historial, turno,
//          Reportes, inicio; recepción tampoco; el admin B (que no lo tiene) sí los ve en historial, turno y Reportes.
//   UX · montos con separador de miles; Reportes abre en el mes en curso; tarjeta manual sin terminal no pregunta el
//          motivo; el detalle de un cobro dice abono y saldo, y marca la parte de cada forma de pago; la ficha del
//          cliente enseña sus cuentas; el aviso de extender la salida solo cuando aplica.
// Limpia lo que crea.
const { B, SB, datos, comprobar, seccion, terminar, rpc } = await import("./veterinaria-comun-dev.mjs");
const { tokenDe } = await import("./sesiones-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo, textoDe, esperarTexto } = await import("./lib/huellitas-navegador.mjs");
const { CONFIRMA_FUERA_HORARIO, confirmarSiFueraDeHorario } = await import("../lib/fuera-horario.mjs");

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const SOLO = arg("--solo");
const corre = (k) => !SOLO || SOLO === k;
const sufijo = String(Date.now()).slice(-6);
const sumar = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
const miles = (n) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const centavos = (n) => Math.round(Number(n) * 100);
const nav = await abrirNavegador();
const creados = { estancias: [], reservas: [], perros: [], cobros: [], ajustes: [] };

const turno = (await SB.from("turnos_caja").select("id, abierto_por").eq("estado", "abierto").is("deleted_at", null).maybeSingle()).data;
if (!turno) throw new Error("Huellitas necesita un turno de caja abierto.");
const { data: admins } = await SB.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "admin").is("deleted_at", null);
const adminConTurno = turno.abierto_por;
const adminSinTurno = (admins ?? []).map((a) => a.profile_id).find((id) => id !== adminConTurno);
const { data: recs } = await SB.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null);
const recepcion = (recs ?? []).map((r) => r.profile_id).find((id) => id !== adminConTurno);

const { p: pa, api } = await abrirComo(nav, adminConTurno, B, { width: 1280, height: 900 });
const hoy = (await api.rpc("fecha_negocio")).data;
const abre = async (d) => (await api.rpc("negocio_abre", { p_fecha: d })).data === true;
const { data: tallaChico } = await SB.from("tamanos_categoria").select("id").eq("clave", "chico").single();
const { data: hotel } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "hotel").eq("unidad", "noche").is("deleted_at", null).limit(1).single();
const totales = async (reserva) => (await api.rpc("cuenta_totales_reserva", { p_reserva_id: reserva })).data?.[0];
const cobrar = async (reserva, metodos) => {
  const r = await api.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: `QA S62 ${sufijo}`, p_metodos: metodos });
  if (r.error) throw new Error(`cobro: ${r.error.message}`);
  const id = typeof r.data === "string" ? r.data : r.data?.cobro_id ?? r.data?.id;
  creados.cobros.push(id);
  return id;
};
async function estanciaAdentro(nombre, entrada, salida) {
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ S62 ${nombre} ${sufijo}`, tamano_id: tallaChico.id }).select("id").single()).data;
  creados.perros.push(perro.id);
  const r = (await api.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
  creados.reservas.push(r.id);
  const e = await api.from("estancias").insert({
    reserva_id: r.id, perro_id: perro.id, servicio_id: hotel.id, fecha_entrada: entrada, fecha_salida: salida, dia_cerrado_confirmado: "confirmado",
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "QA S62", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "QA S62",
  }).select("id").single();
  if (e.error) throw new Error(`estancia: ${e.error.message}`);
  creados.estancias.push(e.data.id);
  const u = await api.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "QA", hora_entrada_real: new Date().toISOString(), ...CONFIRMA_FUERA_HORARIO }).eq("id", e.data.id);
  if (u.error) throw new Error(`check-in: ${u.error.message}`);
  return { id: e.data.id, reserva: r.id };
}

let marcaCiego = null; // el monto que NO debe verse con el turno abierto (cobro de N162)
try {
  // ── N162 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  if (corre("n162") || corre("ciego")) {
    seccion("N162 · salida anticipada que deja saldo a favor");
    let entrada = hoy;
    for (let i = 0; i < 10 && !(await abre(entrada)); i++) entrada = sumar(entrada, -1);
    const e = await estanciaAdentro("hotel", entrada, sumar(hoy, 3));
    const t0 = await totales(e.reserva);
    const cot = (await api.rpc("salida_anticipada_cotizar", { p_estancia_id: e.id })).data;
    marcaCiego = Math.round(Number(t0.total_cuenta) * 0.82) + 0.37;
    const cobro = await cobrar(e.reserva, [{ metodo: "efectivo", monto: marcaCiego }]);
    const totalNuevo = Number(t0.total_cuenta) - (Number(cot.total_antes) - Number(cot.total_despues));
    const saldoEsperado = Math.round((totalNuevo - marcaCiego) * 100) / 100;
    comprobar(cot?.aplica && saldoEsperado < 0, `la cotización baja la cuenta de ${miles(cot?.total_antes)} a ${miles(cot?.total_despues)} y con ${miles(marcaCiego)} cobrados queda a favor (${saldoEsperado})`);

    await pa.goto(`${BASE}/reservas/estancias/${e.id}/checkout`, { waitUntil: "networkidle" });
    comprobar((await pa.locator("[data-aviso-extender]").count()) === 0, "el aviso de extender la salida no sale si la salida todavía no llega");
    await pa.locator("#checkout-recoge-nombre").fill("QA S62");
    await pa.getByRole("button", { name: "Sí, es el dueño" }).click();
    if (await pa.locator("[data-entregue-todo]").count()) await pa.locator("[data-entregue-todo]").click();
    await pa.getByRole("button", { name: "Confirmar salida" }).click();
    const revision = pa.locator("[data-revision-salida]");
    const hay = await revision.first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
    comprobar(hay && (await revision.getAttribute("data-revision-salida")) === "a_favor", "antes de confirmar sale la revisión de la cuenta, con saldo a favor");
    if (hay) {
      comprobar(centavos(await revision.locator("[data-total-nuevo]").getAttribute("data-total-nuevo")) === centavos(totalNuevo), `total nuevo ${miles(totalNuevo)}`);
      comprobar(centavos(await revision.locator("[data-saldo-resultante]").getAttribute("data-saldo-resultante")) === centavos(saldoEsperado), `saldo resultante ${saldoEsperado}`);
      comprobar(/Saldo a favor: devolver/.test(await revision.innerText()), "la revisión dice «Saldo a favor: devolver …»");
      const finalizada0 = (await SB.from("estancias").select("estado").eq("id", e.id).single()).data.estado;
      comprobar(finalizada0 !== "finalizada", "sin confirmar la revisión, la salida no se aplicó");
    }
    await confirmarSiFueraDeHorario(pa);
    await esperarTexto(pa, /Salida registrada/);
    const tFin = await textoDe(pa);
    comprobar(/Devolver .* al cliente|Devolver el saldo a favor/.test(tFin), `al terminar ofrece «Devolver $X al cliente» (${(tFin.match(/Salida registrada.{0,260}/) ?? tFin.match(/.{0,300}(Confirmar salida|Registrar la salida de todos modos|Así queda la cuenta).{0,300}/) ?? ["?"])[0]})`);
    const t1 = await totales(e.reserva);
    comprobar(centavos(t1.saldo) === centavos(saldoEsperado), `en la base la cuenta quedó con saldo ${t1.saldo}`);
    await pa.goto(`${BASE}/reservas/estancias/${e.id}/checkout`, { waitUntil: "networkidle" });
    const estado = await pa.locator("[data-por-pagar]").first().getAttribute("data-estado-saldo").catch(() => null);
    const textoPorPagar = await pa.locator("[data-por-pagar]").first().innerText().catch(() => "");
    comprobar(estado === "a_favor" && /Saldo a favor: devolver/.test(textoPorPagar) && !/Pagada/.test(textoPorPagar), `«Por pagar» dice «${textoPorPagar}», nunca «Pagada»`);
    await pa.goto(`${BASE}/caja/cobrar/${e.reserva}`, { waitUntil: "networkidle" });
    comprobar((await pa.locator("[data-cuenta-saldo-a-favor]").count()) === 1 && (await pa.locator("[data-cuenta-pagada]").count()) === 0, "en Caja la cuenta dice «Saldo a favor», no «Cuenta pagada»");
    const { data: lista } = await api.rpc("cuentas_saldo_a_favor", { p_dias: 90 });
    comprobar((lista ?? []).some((c) => c.reserva_id === e.reserva), "cuentas_saldo_a_favor la trae");
    const devolver = `Saldo a favor: devolver ${miles(-saldoEsperado)}`;
    await pa.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    comprobar((await textoDe(pa)).includes(devolver), `«Necesita atención» del admin: «${devolver}» con «Devolver»`);
    if (recepcion) {
      const { p: pr } = await abrirComo(nav, recepcion, B);
      await pr.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
      comprobar((await textoDe(pr)).includes(devolver), "y en el inicio de recepción");
      await pr.context().close();
    }
    if (datos.cuentaSoloB) {
      const tokCli = await tokenDe(datos.cuentaSoloB);
      const r = await rpc(tokCli, "mis_saldos_a_favor");
      const fila = (Array.isArray(r.cuerpo) ? r.cuerpo : []).find((x) => x.reserva_id === e.reserva);
      comprobar(Boolean(fila) && centavos(fila.a_favor) === centavos(-saldoEsperado), `el dueño ve su saldo a favor (${fila?.a_favor ?? "no"})`);
    }
    // Se devuelve: desaparece de la lista.
    if (!(corre("ciego") && SOLO === "ciego")) {
      const dev = await api.rpc("registrar_devolucion", { p_cobro_id: cobro, p_motivo: "QA S62: saldo a favor", p_metodos: [{ metodo: "efectivo", monto: -saldoEsperado }] });
      comprobar(!dev.error, `registrar la devolución del saldo a favor (${dev.error?.message ?? "ok"})`);
      const t2 = await totales(e.reserva);
      const { data: lista2 } = await api.rpc("cuentas_saldo_a_favor", { p_dias: 90 });
      comprobar(centavos(t2.saldo) === 0 && !(lista2 ?? []).some((c) => c.reserva_id === e.reserva), "con la devolución, la cuenta queda pagada y sale de la lista");
    }
  }

  // ── Corte ciego (usa el cobro de N162, todavía en el turno abierto) ───────────────────────────────────────────────
  if (corre("ciego") && marcaCiego) {
    seccion("Corte ciego · una regla en todo el panel");
    const texto = miles(marcaCiego);
    const hc = await api.rpc("caja_movimientos", { p_desde: hoy, p_hasta: hoy, p_turno: turno.id });
    comprobar(hc.data?.ciego === true && hc.data?.totales_por_metodo == null, "historial (base) para el admin que tiene el turno: ciego, sin totales");
    for (const ruta of ["/caja/historial", "/caja/turno", "/reportes", "/admin"]) {
      await pa.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
      comprobar(!(await textoDe(pa)).includes(texto), `${ruta}: el admin con el turno no ve ${texto}`);
    }
    if (recepcion) {
      const { p: pr } = await abrirComo(nav, recepcion, B);
      for (const ruta of ["/caja/historial", "/caja/turno", "/recepcion"]) {
        await pr.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
        comprobar(!(await textoDe(pr)).includes(texto), `${ruta}: recepción no ve ${texto}`);
      }
      await pr.context().close();
    }
    if (adminSinTurno) {
      const { p: pb, api: apiB } = await abrirComo(nav, adminSinTurno, B);
      const hb = await apiB.rpc("caja_movimientos", { p_desde: hoy, p_hasta: hoy, p_turno: turno.id });
      comprobar(hb.data?.ciego === false && hb.data?.totales_por_metodo != null, "historial (base) para el admin que NO tiene el turno: con totales");
      await pb.goto(`${BASE}/caja/historial`, { waitUntil: "networkidle" });
      comprobar((await textoDe(pb)).includes(texto) && (await pb.locator("[data-historial-ciego]").count()) === 0, `historial: el otro admin ve ${texto}`);
      await pb.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
      comprobar((await pb.locator("[data-esperado-turno]").count()) === 1, "turno: el otro admin ve el esperado por forma de pago");
      await pb.goto(`${BASE}/reportes`, { waitUntil: "networkidle" });
      comprobar(!/corte ciego/i.test(await textoDe(pb)), "Reportes: el otro admin ve el dinero por método");
      await pb.context().close();
    } else comprobar(false, "Huellitas necesita un segundo admin para el caso «admin sin el turno»");
    // Limpieza del cobro de la marca si quedó (cuando solo se corre ciego).
  }

  // ── N163 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  if (corre("n163")) {
    seccion("N163 · tarjeta manual devuelta completa");
    const e = await estanciaAdentro("tarjeta", hoy, sumar(hoy, 1));
    const cobro = await cobrar(e.reserva, [{ metodo: "tarjeta_manual", monto: 200, folio: `QA${sufijo}`, motivo: "sin_terminal" }]);
    const antes = (await api.rpc("tarjetas_manuales_por_revisar", { p_historial: false })).data ?? [];
    comprobar(antes.some((t) => t.cobro_id === cobro), "sin devolver, la tarjeta espera revisión");
    const dev = await api.rpc("registrar_devolucion", { p_cobro_id: cobro, p_motivo: "QA S62 N163", p_metodos: [{ metodo: "tarjeta_manual", monto: 200 }] });
    comprobar(!dev.error, `devolución completa con la tarjeta (${dev.error?.message ?? "ok"})`);
    const despues = (await api.rpc("tarjetas_manuales_por_revisar", { p_historial: false })).data ?? [];
    comprobar(!despues.some((t) => t.cobro_id === cobro), "devuelta completa, ya no espera revisión");
    const historial = (await api.rpc("tarjetas_manuales_por_revisar", { p_historial: true })).data ?? [];
    comprobar(historial.some((t) => t.cobro_id === cobro && Number(t.devuelto) === 200), "Conciliación la sigue enseñando en su historial, con lo devuelto");
    const resto = despues.reduce((s, t) => s + Number(t.monto) - Number(t.devuelto ?? 0), 0);
    await pa.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    const txt = await textoDe(pa);
    comprobar(resto < 0.005 ? !/sin verificar/.test(txt) : txt.includes(`${miles(resto)} sin verificar`), `el aviso suma el neto (${miles(resto)})`);
  }

  // ── N164 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  if (corre("n164")) {
    seccion("N164 · corregir el precio de una cita finalizada");
    const { data: cita } = await SB.from("citas_estetica").select("id, reserva_id, precio").eq("negocio_id", B).eq("estado", "finalizada").is("deleted_at", null).gt("precio", 0).order("inicio", { ascending: false }).limit(20);
    let elegida = null;
    for (const c of cita ?? []) {
      const { count } = await SB.from("cuenta_ajustes_precio").select("id", { count: "exact", head: true }).eq("linea_id", c.id).is("deleted_at", null);
      if (!count) { elegida = c; break; }
    }
    if (!elegida) comprobar(false, "Huellitas necesita una cita finalizada sin corrección");
    else {
      const nuevo = Number(elegida.precio) + 100;
      const r = await api.rpc("corregir_precio_cuenta", { p_reserva_id: elegida.reserva_id, p_linea_tipo: "estetica", p_linea_id: elegida.id, p_precio_nuevo: nuevo, p_motivo: "QA S62 N164" });
      comprobar(!r.error, `corregir el precio de ${miles(elegida.precio)} a ${miles(nuevo)} (${r.error?.message ?? "ok"})`);
      const { data: aj } = await SB.from("cuenta_ajustes_precio").select("id").eq("linea_id", elegida.id).is("deleted_at", null);
      creados.ajustes.push(...(aj ?? []).map((a) => a.id));
      await pa.goto(`${BASE}/estetica/${elegida.id}`, { waitUntil: "networkidle" });
      const precio = await pa.locator("[data-precio-cita]").first().getAttribute("data-precio-cita").catch(() => null);
      comprobar(centavos(precio) === centavos(nuevo), `el detalle de la cita dice ${miles(nuevo)} (${precio})`);
      const { data: nombre } = await api.rpc("nombre_de_cuenta", { p_reserva: elegida.reserva_id });
      comprobar(Boolean(nombre) && !/Corrección/.test(nombre), `nombre de la cuenta: «${nombre}»`);
      const { data: abiertas } = await api.rpc("cuentas_abiertas_json", { p_dias: 400 });
      const enCaja = (abiertas ?? []).find((c) => c.reserva_id === elegida.reserva_id);
      comprobar(!enCaja || !/Corrección/.test(enCaja.descripcion), `en Caja: «${enCaja?.descripcion ?? "(pagada, no está en abiertas)"}»`);
      const { data: det } = await api.from("cobros").select("id").eq("reserva_id", elegida.reserva_id).limit(1);
      if (det?.[0]) {
        const { data: cm } = await SB.from("cobro_metodos").select("id").eq("cobro_id", det[0].id).limit(1);
        if (cm?.[0]) {
          const d = await api.rpc("caja_movimiento_detalle", { p_tipo: "cobro", p_id: cm[0].id });
          comprobar(!d.error, `el detalle del cobro en el historial responde (${d.error?.message ?? "ok"})`);
        }
      }
      for (const id of creados.ajustes) await api.rpc("anular_correccion_precio", { p_ajuste_id: id, p_motivo: "QA S62: deshacer" });
    }
  }

  // ── N165 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  if (corre("n165")) {
    seccion("N165 · aviso de cobro duplicado");
    const e = await estanciaAdentro("abonos", hoy, sumar(hoy, 3));
    await pa.goto(`${BASE}/caja/cobrar/${e.reserva}`, { waitUntil: "networkidle" });
    const abonar = async (monto) => {
      await pa.locator('[data-monto-metodo="0"]').fill(String(monto));
      await pa.locator("[data-registrar-cobro]").click();
      await pa.waitForTimeout(3500);
    };
    await abonar(10);
    await abonar(20);
    comprobar((await pa.locator("[data-confirmar-cobro]").count()) === 0, "dos abonos distintos seguidos no preguntan nada");
    // Una recarga (otra carga de la pantalla) y un cobro IGUAL al último.
    await pa.reload({ waitUntil: "networkidle" });
    await pa.locator('[data-monto-metodo="0"]').fill("20");
    await pa.locator("[data-registrar-cobro]").click();
    const sale = await pa.locator("[data-confirmar-cobro]").first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    const texto = sale ? await pa.locator("[data-confirmar-cobro]").first().innerText() : "";
    comprobar(sale && /Hace \d+ s registraste un cobro igual/.test(texto) && !/otra ventana/.test(texto), `un cobro igual pregunta «${texto.replace(/\s+/g, " ").slice(0, 120)}»`);
    const { data: cobros } = await SB.from("cobros").select("id").eq("reserva_id", e.reserva);
    creados.cobros.push(...(cobros ?? []).map((c) => c.id));
  }

  // ── Médico ────────────────────────────────────────────────────────────────────────────────────────────────────
  if (corre("medico")) {
    seccion("Médico · las listas de equipo");
    const { data: medicos } = await SB.from("medicos_veterinarios").select("profile_id").eq("negocio_id", B).is("deleted_at", null);
    const { data: mems } = await SB.from("membresias").select("profile_id, rol").eq("negocio_id", B).in("profile_id", (medicos ?? []).map((m) => m.profile_id)).is("deleted_at", null);
    let medicoEstetica = (mems ?? []).find((m) => m.rol === "estetica");
    let medicoTemporal = null;
    if (!medicoEstetica && datos.esteticaB) {
      // Huellitas no tiene un médico con rol de estética: se registra uno mientras dura la prueba.
      const r = await SB.from("medicos_veterinarios").insert({ negocio_id: B, profile_id: datos.esteticaB, cedula_profesional: `QA-S62-${sufijo}` }).select("id").single();
      if (!r.error) { medicoTemporal = r.data.id; medicoEstetica = { profile_id: datos.esteticaB, rol: "estetica" }; }
    }
    if (!medicoEstetica) comprobar(false, "Huellitas necesita un médico con el rol de estética");
    else try {
      const { data: perfil } = await SB.from("profiles").select("nombre_completo").eq("id", medicoEstetica.profile_id).single();
      for (const ruta of ["/bienvenida/equipo", "/admin"]) {
        await pa.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
        const etiquetas = await pa.locator("[data-etiqueta-rol]").allInnerTexts();
        const txt = await textoDe(pa);
        const mal = new RegExp(`${(perfil?.nombre_completo ?? "zzz").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · Estética`).test(txt);
        comprobar(etiquetas.includes("Médico veterinario") && !mal, `${ruta}: el médico dice «Médico veterinario» (${etiquetas.join(", ")})`);
      }
    } finally {
      if (medicoTemporal) await SB.from("medicos_veterinarios").delete().eq("id", medicoTemporal);
    }
  }

  // ── UX ────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (corre("ux")) {
    seccion("UX");
    await pa.goto(`${BASE}/reportes`, { waitUntil: "networkidle" });
    const url = new URL(pa.url());
    const desdeVisto = await pa.locator('input[name="desde"]').first().inputValue().catch(() => null);
    comprobar(!url.searchParams.get("desde") && (desdeVisto === null || desdeVisto === `${hoy.slice(0, 7)}-01`), `Reportes abre en el mes en curso (desde ${desdeVisto})`);
    const e = await estanciaAdentro("ux", hoy, sumar(hoy, 2));
    await pa.goto(`${BASE}/caja/cobrar/${e.reserva}`, { waitUntil: "networkidle" });
    const bloqueada = (await api.rpc("terminal_manual_bloqueada")).data === true;
    await pa.locator('[data-metodo-cobro="0"]').selectOption("tarjeta_manual").catch(() => {});
    const pregunta = await pa.getByText("¿Por qué no se cobró con la terminal vinculada?").count();
    comprobar(bloqueada ? pregunta > 0 : pregunta === 0, `tarjeta manual ${bloqueada ? "con" : "sin"} terminal vinculada: ${pregunta ? "pregunta" : "no pregunta"} el motivo`);
    // Cobro dividido en dos formas de pago (abono) y su detalle en el historial.
    const t = await totales(e.reserva);
    const cobro = await cobrar(e.reserva, [{ metodo: "efectivo", monto: 60 }, { metodo: "transferencia", monto: 40 }]);
    const { data: cms } = await SB.from("cobro_metodos").select("id").eq("cobro_id", cobro).order("created_at").limit(1);
    const { p: pb } = await abrirComo(nav, adminSinTurno ?? adminConTurno, B);
    await pb.goto(`${BASE}/caja/historial?mov=cobro:${cms[0].id}`, { waitUntil: "networkidle" });
    const tipo = await pb.locator("[data-tipo-cobro]").first().getAttribute("data-tipo-cobro").catch(() => null);
    const saldo = await pb.locator("[data-saldo-despues]").first().getAttribute("data-saldo-despues").catch(() => null);
    comprobar(tipo === "abono" && centavos(saldo) === centavos(Number(t.total_cuenta) - 100), `el detalle dice «Abono» y el saldo que quedó (${saldo})`);
    comprobar((await pb.locator("[data-parte-metodo]").count()) === 2 && /Parte en/.test(await pb.locator("[data-metodos-cobro]").first().innerText().catch(() => "")), "marca la parte de cada forma de pago");
    const filtroCobros = await api.rpc("caja_movimientos", { p_desde: hoy, p_hasta: hoy, p_tipo: "cobro" });
    comprobar(!(filtroCobros.data?.movimientos ?? []).some((m) => m.tipo === "venta_mostrador" || m.tipo === "venta_bono"), "«Cobros y abonos de servicios» no repite ventas ni pases");
    await pb.context().close();
    await pa.goto(`${BASE}/clientes/${datos.clienteSoloB}`, { waitUntil: "networkidle" });
    comprobar((await pa.locator("[data-cuentas-cliente]").count()) === 1 && (await pa.locator(`[data-cuenta-cliente="${e.reserva}"]`).count()) === 1, "la ficha del cliente enseña sus cuentas con su saldo");
    const conMiles = (await textoDe(pa)).match(/\$\d{4,}\.\d{2}/);
    comprobar(!conMiles, `los montos llevan separador de miles${conMiles ? ` (vi ${conMiles[0]})` : ""}`);
  }
} finally {
  // Limpieza: cobros y devoluciones de la corrida, estancias, reservas y perros.
  for (const id of creados.cobros.filter(Boolean)) {
    const { data: ds } = await SB.from("devoluciones").select("id").eq("cobro_id", id);
    for (const d of ds ?? []) { await SB.from("devolucion_metodos").delete().eq("devolucion_id", d.id); await SB.from("devoluciones").delete().eq("id", d.id); }
    await SB.from("tarjetas_manuales").delete().eq("cobro_id", id);
    await SB.from("cobro_metodos").delete().eq("cobro_id", id);
    await SB.from("cobros").delete().eq("id", id);
  }
  for (const id of creados.estancias) {
    await SB.from("cuenta_ajustes_precio").delete().eq("linea_id", id);
    await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  }
  for (const id of creados.reservas) await SB.from("reservas").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  for (const id of creados.perros) await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  await nav.close();
}
terminar();
