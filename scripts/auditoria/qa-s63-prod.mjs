// QA S63 en PRODUCCIÓN, en los negocios PRUEBA de S62 (y solo ahí), con navegador y LOS PASOS EXACTOS DEL REPORTE DE
// LA QA. Antes de desplegar debe fallar (reproduce); después, pasar. Sale con 1 si algo sigue mal.
//
//   node scripts/auditoria/qa-s63-prod.mjs [--escribir] [--solo n167|n166|n164|ux]
//
// N167 · hotel S62: detalle de la reserva confirmada → «Mover fechas» → entrada 08/11 (domingo, cerrado) y luego 09/11:
//   nunca «No pudimos guardar esto»; el día cerrado se dice con su motivo y se puede confirmar; con un día abierto se ve
//   el total y «Guardar fechas» guarda. Con --escribir guarda de verdad y la regresa a sus fechas al terminar.
// N166 · hotel S62: abrir turno como admin, cobrar $100 en efectivo, Caja → Historial. Ni el resumen ni la fila del cobro
//   del turno abierto traen el monto, ni en la pantalla ni en las respuestas que llegan al navegador. Con --escribir arma
//   el turno y el cobro; al terminar anula el cobro y cierra el turno en $0.
// N164 · estética S62: la cita con su precio corregido dice el precio de su cuenta al recargar.
// UX · Reportes abre en el mes en curso; la ficha del cliente enseña su saldo y sus cuentas.
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import { comoPersona, negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const ESCRIBIR = process.argv.includes("--escribir");
const SOLO = process.argv.includes("--solo") ? process.argv[process.argv.indexOf("--solo") + 1] : null;
const toca = (n) => !SOLO || SOLO === n;
const hallazgos = [];
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const ver = (t) => console.log(`  · ${t}`);
const revisa = (ok, t) => (ok ? bien(t) : mal(t));
const limpio = (s) => (s ?? "").replace(/\s+/g, " ").trim();

const nav = await abrirNavegador();
async function pagina(sesion) {
  const c = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addCookies(sesion.cookies);
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(60000);
  p.setDefaultTimeout(30000);
  return p;
}

try {
  const HOT = await negocioPrueba("prueba-qa-hotel-s62");

  // ───────────────────────────── N167 ─────────────────────────────
  if (toca("n167")) {
    console.log("\nN167 · mover fechas (hotel S62)");
    const sesion = await HOT.sesion("admin");
    const api = comoPersona(sesion.token, HOT.negocio.id);
    const hoy = (await api.rpc("fecha_negocio")).data;
    const { data: ests } = await HOT.N.from("estancias").select("id, reserva_id, fecha_entrada, fecha_salida, estado, servicios(categoria)").eq("negocio_id", HOT.negocio.id).in("estado", ["reservada", "confirmada"]).is("deleted_at", null).order("fecha_entrada");
    const e = (ests ?? [])[0];
    if (!e) mal("no hay una reserva reservada o confirmada en hotel S62");
    else {
      const esGuarderia = e.servicios?.categoria === "guarderia";
      ver(`estancia ${e.id.slice(0, 8)} (${e.servicios?.categoria}, ${e.estado}) del ${e.fecha_entrada} al ${e.fecha_salida}`);
      const p = await pagina(sesion);
      await p.goto(`${HOT.base}/reservas/${e.reserva_id}`, { waitUntil: "networkidle" });
      const fijar = async (entrada, salida) => {
        const caja = p.locator("[data-mover-fechas]");
        if (!(await caja.count())) await p.getByRole("button", { name: "Mover fechas" }).first().click();
        await caja.locator('input[type="date"]').first().fill(entrada);
        if (!esGuarderia) await caja.locator('input[type="date"]').nth(1).fill(salida);
        const vista = caja.locator("[data-vista-previa-fechas]");
        await p.waitForFunction((el) => el && !/Calculando/.test(el.textContent ?? ""), await vista.elementHandle(), { timeout: 20000 }).catch(() => null);
        return limpio(await vista.innerText());
      };
      // Paso de la QA: entrada el 8 de noviembre (domingo).
      let cerrado = null;
      for (let i = 1; i < 15 && !cerrado; i++) {
        const d = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + i * 86400000).toISOString().slice(0, 10);
        if ((await api.rpc("negocio_abre", { p_fecha: d })).data === false) cerrado = d;
      }
      const sumar = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
      if (cerrado) {
        const t = await fijar(cerrado, sumar(cerrado, 2));
        revisa(!/No pudimos/.test(t) && /no abre|cerrad/i.test(t), `entrada ${cerrado} (cerrado): «${t}»`);
        revisa((await p.locator("[data-confirmar-dia-cerrado]").count()) === 1, "deja confirmar el día cerrado");
      }
      let abierto = sumar(hoy, 1);
      for (let i = 0; i < 10 && (await api.rpc("negocio_abre", { p_fecha: abierto })).data !== true; i++) abierto = sumar(abierto, 1);
      let salida = sumar(abierto, 1);
      for (let i = 0; i < 10 && !esGuarderia && (await api.rpc("negocio_abre", { p_fecha: salida })).data !== true; i++) salida = sumar(salida, 1);
      const t2 = await fijar(abierto, salida);
      revisa(/Total de la cuenta/.test(t2) && !/No pudimos/.test(t2), `entrada ${abierto} (abierto): «${t2}»`);
      const listo = await p.locator("[data-guardar-fechas]").isEnabled();
      revisa(listo, "«Guardar fechas» se activa con la vista previa");
      if (ESCRIBIR && listo) {
        await p.locator("[data-guardar-fechas]").click();
        await p.locator("[data-mover-fechas]").waitFor({ state: "detached", timeout: 30000 }).catch(() => null);
        const ahora = (await HOT.N.from("estancias").select("fecha_entrada, fecha_salida").eq("id", e.id).single()).data;
        revisa(ahora.fecha_entrada === abierto, `guardó: ${ahora.fecha_entrada} → ${ahora.fecha_salida}`);
        // De regreso a sus fechas, por la misma pantalla.
        await p.reload({ waitUntil: "networkidle" });
        const t3 = await fijar(e.fecha_entrada, e.fecha_salida);
        if (await p.locator("[data-confirmar-dia-cerrado]").count()) await p.locator("[data-confirmar-dia-cerrado]").check();
        await p.waitForTimeout(1500);
        if (await p.locator("[data-guardar-fechas]").isEnabled()) {
          await p.locator("[data-guardar-fechas]").click();
          await p.locator("[data-mover-fechas]").waitFor({ state: "detached", timeout: 30000 }).catch(() => null);
        }
        const fin = (await HOT.N.from("estancias").select("fecha_entrada, fecha_salida").eq("id", e.id).single()).data;
        ver(`regresó a ${fin.fecha_entrada} → ${fin.fecha_salida} (${t3})`);
      }
      await p.context().close();
    }
  }

  // ───────────────────────────── N166 ─────────────────────────────
  if (toca("n166")) {
    console.log("\nN166 · corte ciego del Historial (hotel S62): abrir turno como admin, cobrar $100 en efectivo, Caja → Historial");
    const sesion = await HOT.sesion("admin");
    const api = comoPersona(sesion.token, HOT.negocio.id);
    let { data: turno } = await api.from("turnos_caja").select("id, abierto_por").eq("estado", "abierto").maybeSingle();
    let abriTurno = false, cobroId = null;
    try {
      if (!turno && ESCRIBIR) {
        turno = (await api.from("turnos_caja").insert({ fondo_inicial: 0, notas_apertura: "Verificación QA S63 (N166)" }).select("id, abierto_por").single()).data;
        abriTurno = true;
      }
      if (!turno) mal("no hay turno abierto en hotel S62: corre con --escribir");
      else {
        if (ESCRIBIR) {
          const { data: rs } = await HOT.N.from("reservas").select("id").eq("negocio_id", HOT.negocio.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
          let reserva = null;
          for (const r of rs ?? []) {
            const { data: t } = await api.rpc("cuenta_totales_reserva", { p_reserva_id: r.id });
            if (Number(t?.[0]?.saldo ?? 0) >= 100) { reserva = r.id; break; }
          }
          if (!reserva) throw new Error("No encontré una cuenta con saldo de $100 en hotel S62.");
          const { error } = await api.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: "Verificación QA S63 (N166), se anula enseguida", p_metodos: [{ metodo: "efectivo", monto: 100, propina: 0 }] });
          if (error) throw new Error(`registrar_cobro: ${error.message}`);
          cobroId = (await api.from("cobros").select("id").eq("reserva_id", reserva).is("anulado_at", null).order("created_at", { ascending: false }).limit(1).single()).data?.id ?? null;
          ver(`turno ${abriTurno ? "abierto para la prueba" : "que ya estaba abierto"}; cobro de $100.00 en efectivo`);
        }
        const p = await pagina(sesion);
        const respuestas = [];
        p.on("response", async (r) => {
          if (!r.url().startsWith(HOT.base) || /\/_next\/static\//.test(r.url())) return;
          try { respuestas.push(await r.text()); } catch { /* sin cuerpo */ }
        });
        await p.goto(`${HOT.base}/caja/historial`, { waitUntil: "networkidle" });
        const ciego = await p.locator("[data-historial-ciego]").count();
        const filasAbiertas = p.locator("tr", { hasText: "turno abierto" });
        const conMonto = [];
        for (let k = 0; k < (await filasAbiertas.count()); k++) {
          const m = await filasAbiertas.nth(k).locator("[data-monto]").getAttribute("data-monto").catch(() => "");
          if (m) conMonto.push(m);
        }
        const texto = limpio(await p.locator("main").innerText());
        revisa(ciego === 1, "el Historial dice «Corte ciego» para quien tiene el turno abierto");
        revisa(conMonto.length === 0, `las filas «turno abierto» no traen monto (${conMonto.join(", ") || "ninguna con monto"})`);
        const fuga = texto.match(/.{0,70}\$100\.00.{0,70}/g) ?? [];
        ver(`apariciones de $100.00 en la pantalla (turnos cerrados las enseñan a propósito): ${fuga.length ? fuga.join(" ‖ ") : "ninguna"}`);
        revisa((await p.locator("[data-totales-historial]").count()) === 0, "el Historial no pinta el resumen por forma de pago mientras el turno sigue abierto");
        const { data: h } = await api.rpc("caja_movimientos", { p_desde: (await api.rpc("fecha_negocio")).data, p_hasta: (await api.rpc("fecha_negocio")).data, p_turno: turno.id });
        revisa(h?.ciego === true && h?.totales_por_metodo == null && (h?.movimientos ?? []).every((m) => m.monto == null), "la respuesta de la base viene ciega (sin totales ni montos)");
        await p.context().close();
      }
    } finally {
      if (cobroId) {
        const { error } = await api.rpc("anular_cobro", { p_cobro_id: cobroId, p_motivo: "Verificación QA S63 (N166): cobro de prueba" });
        ver(`cobro de prueba ${error ? `NO se anuló (${error.message})` : "anulado"}`);
      }
      if (abriTurno && turno) {
        const { error } = await api.rpc("cerrar_turno", { p_turno_id: turno.id, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: "", p_notas_cierre: "Verificación QA S63 (N166)" });
        ver(`turno de la prueba: ${error ? `NO se cerró (${error.message})` : "cerrado"}`);
      }
    }
  }

  // ───────────────────────────── N164 ─────────────────────────────
  if (toca("n164")) {
    console.log("\nN164 · el precio de la cita sale de su cuenta (estética S62, al recargar)");
    const EST = await negocioPrueba("prueba-qa-estetica-s62");
    const sesion = await EST.sesion("admin");
    const { data: aj } = await EST.N.from("cuenta_ajustes_precio").select("linea_id, monto").eq("negocio_id", EST.negocio.id).eq("linea_tipo", "estetica").is("deleted_at", null);
    const p = await pagina(sesion);
    for (const a of (aj ?? []).slice(0, 4)) {
      const { data: c } = await EST.N.from("citas_estetica").select("precio").eq("id", a.linea_id).single();
      const suma = (aj ?? []).filter((x) => x.linea_id === a.linea_id).reduce((s, x) => s + Number(x.monto), 0);
      await p.goto(`${EST.base}/estetica/${a.linea_id}`, { waitUntil: "networkidle" });
      await p.reload({ waitUntil: "networkidle" });
      const visto = await p.locator("[data-precio-cita]").first().getAttribute("data-precio-cita").catch(() => null);
      revisa(Math.round(Number(visto) * 100) === Math.round((Number(c.precio) + suma) * 100), `cita ${a.linea_id.slice(0, 8)}: dice ${visto} (cuenta ${(Number(c.precio) + suma).toFixed(2)})`);
    }
    await p.context().close();
  }

  // ───────────────────────────── UX ─────────────────────────────
  if (toca("ux")) {
    console.log("\nUX · Reportes en el mes en curso y cuentas en la ficha del cliente (hotel S62)");
    const sesion = await HOT.sesion("admin");
    const api = comoPersona(sesion.token, HOT.negocio.id);
    const hoy = (await api.rpc("fecha_negocio")).data;
    const p = await pagina(sesion);
    await p.goto(`${HOT.base}/reportes`, { waitUntil: "networkidle" });
    const desde = await p.locator('input[name="desde"]').first().inputValue().catch(() => null);
    revisa(desde === `${hoy.slice(0, 7)}-01`, `Reportes abre desde ${desde} (mes en curso: ${hoy.slice(0, 7)}-01)`);
    // Un cliente con alguna cuenta con monto (la sección no sale para quien no tiene cuentas).
    const { data: rs } = await HOT.N.from("reservas").select("id, cliente_id").eq("negocio_id", HOT.negocio.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(60);
    let cli = null;
    for (const r of rs ?? []) { const { data: t } = await api.rpc("cuenta_totales_reserva", { p_reserva_id: r.id }); if (Number(t?.[0]?.total_cuenta) > 0) { cli = r; break; } }
    await p.goto(`${HOT.base}/clientes/${cli.cliente_id}`, { waitUntil: "networkidle" });
    revisa((await p.locator("[data-cuentas-cliente]").count()) === 1 && (await p.locator("[data-saldo-cliente]").count()) === 1, "la ficha del cliente enseña su saldo y sus cuentas");
    // La ficha de la mascota también (QA S63), de la misma reserva.
    const { data: est } = await HOT.N.from("estancias").select("perro_id").eq("reserva_id", cli.id).limit(1).maybeSingle();
    if (est?.perro_id) {
      await p.goto(`${HOT.base}/perros/${est.perro_id}`, { waitUntil: "networkidle" });
      revisa((await p.locator("[data-cuentas-cliente]").count()) === 1, "la ficha de la mascota enseña su saldo y sus cuentas");
    }
    // «Cerrar turno» en el inicio de Caja (si hay turno abierto) y «Salir» activo en el HTML del servidor.
    await p.goto(`${HOT.base}/caja`, { waitUntil: "networkidle" });
    const hayTurno = (await p.locator("[data-turno-abierto]").count()) > 0;
    if (hayTurno) revisa((await p.locator("[data-cerrar-turno-inicio]").count()) === 1, "«Cerrar turno» está en el inicio de Caja");
    else ver("sin turno abierto en hotel S62: «Cerrar turno» del inicio no se revisa");
    const html = await (await fetch(`${HOT.base}/caja`, { headers: { cookie: sesion.cookies.map((k) => `${k.name}=${k.value}`).join("; ") } })).text();
    const salir = html.match(/<button[^>]*aria-label="Salir"[^>]*>/)?.[0] ?? "";
    revisa(Boolean(salir) && !/\sdisabled(=|\s|>)/.test(salir), "«Salir» llega activo antes de hidratar");
    await p.context().close();
  }

  // ───────────────────────────── N170 ─────────────────────────────
  if (toca("n170") && ESCRIBIR) {
    console.log("\nN170 · hotel S62: cancelar una reserva, el encabezado cambia al momento");
    const sesion = await HOT.sesion("admin");
    const api = comoPersona(sesion.token, HOT.negocio.id);
    const hoy = (await api.rpc("fecha_negocio")).data;
    const { data: base } = await HOT.N.from("estancias").select("perro_id, servicio_id, reservas(cliente_id)").eq("negocio_id", HOT.negocio.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).single();
    const sumar = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
    let entrada = sumar(hoy, 12);
    for (let i = 0; i < 10 && (await api.rpc("negocio_abre", { p_fecha: entrada })).data !== true; i++) entrada = sumar(entrada, 1);
    const cliente = (Array.isArray(base.reservas) ? base.reservas[0] : base.reservas).cliente_id;
    const r = (await api.from("reservas").insert({ cliente_id: cliente, notas: "Verificación QA S63 (N170)" }).select("id").single()).data;
    const e = await api.from("estancias").insert({ reserva_id: r.id, perro_id: base.perro_id, servicio_id: base.servicio_id, fecha_entrada: entrada, fecha_salida: sumar(entrada, 1), dia_cerrado_confirmado: "confirmado", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "QA S63", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "QA S63" }).select("id").single();
    if (e.error) mal(`no se pudo armar la reserva de prueba: ${e.error.message}`);
    else {
      const p = await pagina(sesion);
      await p.goto(`${HOT.base}/reservas/${r.id}`, { waitUntil: "networkidle" });
      const antes = await p.locator("[data-saldo-reserva]").getAttribute("data-saldo-reserva");
      await p.getByRole("button", { name: "Cancelar toda la reserva" }).click();
      await p.getByRole("button", { name: /Sí, cancelar todo/ }).click();
      await p.waitForTimeout(2500);
      const saldo = await p.locator("[data-saldo-reserva]").getAttribute("data-saldo-reserva");
      const cobrar = limpio(await p.locator("[data-cobrar-reserva]").innerText().catch(() => ""));
      revisa(Number(antes) > 0 && saldo === "0.00" && !/^Cobrar/.test(cobrar), `el encabezado pasó de saldo ${antes} a ${saldo} y «${cobrar || "sin enlace"}», sin recargar`);
      await p.context().close();
    }
  }

  // ───────────────────────────── N168 ─────────────────────────────
  if (toca("n168") && ESCRIBIR) {
    console.log("\nN168 · vet S62: después de una devolución, «Devuelto» y el saldo sin recargar");
    const V = await negocioPrueba("prueba-qa-vet-s62");
    const sesion = await V.sesion("admin");
    const api = comoPersona(sesion.token, V.negocio.id);
    let { data: turno } = await api.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
    let abriTurno = false;
    if (!turno) { turno = (await api.from("turnos_caja").insert({ fondo_inicial: 0, notas_apertura: "Verificación QA S63 (N168)" }).select("id").single()).data; abriTurno = true; }
    try {
      const { data: rs } = await V.N.from("reservas").select("id").eq("negocio_id", V.negocio.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(80);
      let reserva = null;
      for (const r of rs ?? []) { const { data: t } = await api.rpc("cuenta_totales_reserva", { p_reserva_id: r.id }); if (Number(t?.[0]?.saldo ?? 0) >= 50) { reserva = r.id; break; } }
      if (!reserva) mal("no hay una cuenta con saldo de $50 en vet S62");
      else {
        const { error } = await api.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: "Verificación QA S63 (N168), se devuelve enseguida", p_metodos: [{ metodo: "efectivo", monto: 50, propina: 0 }] });
        if (error) throw new Error(`registrar_cobro: ${error.message}`);
        const antes = Number((await api.rpc("cuenta_totales_reserva", { p_reserva_id: reserva })).data?.[0]?.total_devuelto ?? 0);
        const p = await pagina(sesion);
        await p.goto(`${V.base}/caja/cobrar/${reserva}`, { waitUntil: "networkidle" });
        await p.getByRole("button", { name: "Registrar devolución" }).last().click();
        await p.getByLabel("Monto").last().fill("50");
        await p.getByLabel("Motivo").last().fill("Verificación QA S63 (N168): devolución de prueba");
        await p.getByRole("button", { name: "Confirmar devolución" }).first().click();
        await p.waitForTimeout(1500);
        const texto = limpio(await p.locator("main").innerText());
        const visto = texto.match(/Devuelto:\s*\$([\d,.]+)/)?.[1]?.replace(/,/g, "");
        revisa(Math.round(Number(visto) * 100) === Math.round((antes + 50) * 100), `sin recargar dice «Devuelto: $${visto}» (antes $${antes.toFixed(2)})`);
        await p.context().close();
      }
    } finally {
      if (abriTurno && turno) {
        const { data: r } = await api.rpc("resumen_turno", { p_turno_id: turno.id });
        const n = (m) => (r ?? []).filter((x) => x.metodo === m).reduce((s, x) => s + Number(x.cobrado) + Number(x.propinas) - Number(x.devuelto), 0);
        const { error } = await api.rpc("cerrar_turno", { p_turno_id: turno.id, p_conteo_efectivo: n("efectivo"), p_conteo_terminal: n("terminal"), p_conteo_transferencia: n("transferencia"), p_explicacion_diferencias: "", p_notas_cierre: "Verificación QA S63 (N168)" });
        ver(`turno de la prueba: ${error ? `NO se cerró (${error.message})` : "cerrado"}`);
      }
    }
  }

  // ───────────────────────────── N161 ─────────────────────────────
  if (toca("n161") && ESCRIBIR) {
    console.log("\nN161 · estética S62: dos pestañas, A reprograma, B choca: el encabezado de B dice la hora nueva");
    const EST = await negocioPrueba("prueba-qa-estetica-s62");
    const sesion = await EST.sesion("admin");
    const api = comoPersona(sesion.token, EST.negocio.id);
    const { data: base } = await EST.N.from("citas_estetica").select("servicio_id, empleado_id, perro_id").eq("negocio_id", EST.negocio.id).not("empleado_id", "is", null).is("deleted_at", null).limit(1).single();
    const { data: reservaId } = await api.rpc("crear_reserva_para_cita", { p_perro_id: base.perro_id });
    let d = new Date(Date.now() + 9 * 86400000); d.setUTCHours(17, 0, 0, 0);
    for (let i = 0; i < 7 && (await api.rpc("negocio_abre", { p_fecha: d.toISOString().slice(0, 10) })).data !== true; i++) d = new Date(d.getTime() + 86400000);
    const c = await api.from("citas_estetica").insert({ reserva_id: reservaId, perro_id: base.perro_id, servicio_id: base.servicio_id, empleado_id: base.empleado_id, inicio: d.toISOString() }).select("id").single();
    if (c.error) mal(`cita de prueba: ${c.error.message}`);
    else {
      const pa = await pagina(sesion);
      const pb = await pagina(sesion);
      await pa.goto(`${EST.base}/estetica/${c.data.id}`, { waitUntil: "networkidle" });
      await pb.goto(`${EST.base}/estetica/${c.data.id}`, { waitUntil: "networkidle" });
      const reprogramar = async (pg, hh) => {
        await pg.getByRole("button", { name: "Reprogramar" }).first().click();
        const campo = pg.locator("[data-reprogramar] input[type='datetime-local']");
        await campo.fill((await campo.inputValue()).replace(/T\d{2}:\d{2}/, `T${hh}`));
        await pg.getByRole("button", { name: "Guardar la nueva hora" }).click();
      };
      const horaB0 = await pb.locator("[data-hora-cita]").first().getAttribute("data-hora-cita");
      await reprogramar(pa, "13:00");
      await pa.waitForTimeout(4000);
      const vigente = (await EST.N.from("citas_estetica").select("inicio").eq("id", c.data.id).single()).data.inicio;
      await reprogramar(pb, "15:00");
      const choque = await pb.locator("[data-conflicto-version]").first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
      await pb.waitForTimeout(800);
      const horaB1 = await pb.locator("[data-hora-cita]").first().getAttribute("data-hora-cita");
      revisa(choque && Date.parse(horaB1) === Date.parse(vigente) && Date.parse(horaB0) !== Date.parse(vigente), `B ve el conflicto y su encabezado pasó de ${horaB0} a ${horaB1} (lo vigente: ${vigente})`);
      await pa.context().close();
      await pb.context().close();
      await api.rpc("cancelar_cita_estetica", { p_cita_id: c.data.id, p_motivo: "Verificación QA S63: cita de prueba", p_no_llego: false });
      await EST.N.from("citas_estetica").update({ estado: "cancelada" }).eq("id", c.data.id).eq("estado", "reservada");
    }
  }

  // ───────────────────────────── N169 ─────────────────────────────
  if (toca("n169") && ESCRIBIR) {
    console.log("\nN169 · vet S62: «Reprogramar» con la misma fecha y hora y otro médico");
    const V = await negocioPrueba("prueba-qa-vet-s62");
    const sesion = await V.sesion("admin");
    const api = comoPersona(sesion.token, V.negocio.id);
    const { data: meds } = await V.N.from("medicos_veterinarios").select("id").eq("negocio_id", V.negocio.id).is("deleted_at", null);
    const { data: perro } = await V.N.from("perros").select("id").eq("negocio_id", V.negocio.id).is("deleted_at", null).not("cliente_id", "is", null).limit(1).single();
    if ((meds ?? []).length < 2) ver("vet S62 tiene un solo médico: no se puede cambiar de médico");
    else {
      const cuando = new Date(Date.now() + 5 * 86400000); cuando.setUTCHours(18, 0, 0, 0);
      const c = await api.rpc("vet_agendar_cita", { p_perro: perro.id, p_tipo: "consulta", p_medico: meds[0].id, p_inicia: cuando.toISOString(), p_duracion_min: 30, p_motivo: "Verificación QA S63 (N169)" });
      const id = c.data?.id;
      try {
        const p = await pagina(sesion);
        await p.goto(`${V.base}/veterinaria/agenda?fecha=${cuando.toISOString().slice(0, 10)}`, { waitUntil: "networkidle" });
        const fila = p.locator("article, li").filter({ hasText: "Verificación QA S63 (N169)" }).first();
        await fila.getByRole("button", { name: "Reprogramar" }).click();
        const hora = await fila.locator('input[name="hora"]').inputValue();
        revisa(/^\d{2}:\d{2}$/.test(hora), `«Hora» viene con la hora de la cita (${hora || "vacío"})`);
        await fila.locator('select[name="medico_id"]').selectOption(meds[1].id);
        await fila.getByRole("button", { name: "Mover la cita" }).click();
        const aviso = await p.locator(`[data-aviso-cita-movida="${id}"]`).waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
        const d = (await V.N.from("vet_citas").select("medico_id").eq("id", id).single()).data;
        revisa(d?.medico_id === meds[1].id && aviso, `la cita cambió de médico y la agenda dice «Cita movida» (${d?.medico_id === meds[1].id ? "cambió" : "no cambió"}, aviso ${aviso ? "sí" : "no"})`);
        await p.context().close();
      } finally {
        if (id) await api.rpc("vet_cita_estado", { p_id: id, p_estado: "cancelada", p_motivo: "Verificación QA S63: cita de prueba" });
      }
    }
  }
} finally {
  await nav.close();
}
console.log(hallazgos.length ? `\n${hallazgos.length} hallazgo(s).` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
