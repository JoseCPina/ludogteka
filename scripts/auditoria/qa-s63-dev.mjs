// QA S63 en DESARROLLO (Huellitas), con la app compilada en el 3001: lo que no cubren mover-fechas-dev (N167) ni
// acciones-pantalla-dev (N168, N170).
//
//   node scripts/auditoria/qa-s63-dev.mjs [--solo n161|n164|n169|ux]
//
//   N161 · dos pestañas en la misma cita de estética: B reprograma con la versión vieja, sale el conflicto y su
//          encabezado (la hora de la cita) ya dice la hora que guardó A, no la de antes.
//   N164 · «Corregir precio» en el detalle de la cita: el precio de la cita cambia al guardar y sigue así al recargar.
//   N169 · Veterinaria, «Reprogramar» con el mismo día y hora y otro médico: el formulario se envía (la hora viene en
//          el formato del campo) y la cita cambia de médico.
//   UX   · la ficha de la mascota enseña sus cuentas; «Cerrar turno» pregunta antes y está en el inicio de Caja;
//          «Salir» no sale deshabilitado al cargar; talla y pelaje obligatorios dicen su error junto al campo; cancelar
//          una cita pide el motivo desde que se abre; el médico de una consulta en borrador se cambia desde la consulta.
// Limpia lo que crea.
const { B, SB, datos, rpc, personas, comprobar, seccion, terminar } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo, textoDe } = await import("./lib/huellitas-navegador.mjs");

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const SOLO = arg("--solo");
const corre = (k) => !SOLO || SOLO === k;
const sufijo = String(Date.now()).slice(-6);
const P = await personas();
const nav = await abrirNavegador();
const limpieza = [];
const centavos = (n) => Math.round(Number(n) * 100);
const limpioTexto = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

try {
  const { p, api } = await abrirComo(nav, datos.adminB, B, { width: 1280, height: 900 });
  const hoy = (await api.rpc("fecha_negocio")).data;

  // Una cita de estética reservada en unos días, con su cuenta (precio > 0).
  async function citaEstetica(diasAdelante = 4) {
    const { data: base } = await SB.from("citas_estetica").select("servicio_id, empleado_id, perro_id").eq("negocio_id", B).not("empleado_id", "is", null).gt("precio", 0).is("deleted_at", null).limit(1).single();
    const { data: reservaId, error: eR } = await api.rpc("crear_reserva_para_cita", { p_perro_id: base.perro_id });
    if (eR) throw new Error(`reserva de cita: ${eR.message}`);
    let d = new Date(`${hoy}T17:00:00Z`);
    d = new Date(d.getTime() + diasAdelante * 86400000);
    for (let i = 0; i < 7 && (await api.rpc("negocio_abre", { p_fecha: d.toISOString().slice(0, 10) })).data !== true; i++) d = new Date(d.getTime() + 86400000);
    const c = await api.from("citas_estetica").insert({ reserva_id: reservaId, perro_id: base.perro_id, servicio_id: base.servicio_id, empleado_id: base.empleado_id, inicio: d.toISOString() }).select("id, reserva_id, precio, updated_at").single();
    if (c.error) throw new Error(`cita: ${c.error.message}`);
    limpieza.push(async () => {
      await SB.from("cuenta_ajustes_precio").delete().eq("linea_id", c.data.id);
      await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).eq("id", c.data.id);
    });
    return c.data;
  }

  // ── N164 ──
  if (corre("n164")) {
    seccion("N164 · «Corregir precio» desde el detalle de la cita");
    const c = await citaEstetica(5);
    await p.goto(`${BASE}/estetica/${c.id}`, { waitUntil: "networkidle" });
    const boton = p.locator("[data-corregir-precio-cita]");
    comprobar((await boton.count()) === 1, "el detalle de la cita tiene «Corregir precio» junto al precio");
    if (await boton.count()) {
      await boton.click();
      const nuevo = Number(c.precio) + 20;
      await p.getByLabel(/Precio correcto/).fill(String(nuevo));
      await p.getByLabel(/[Mm]otivo/).last().fill(`QA S63 ${sufijo}: precio mal capturado`);
      await p.getByRole("button", { name: /Guardar precio/ }).click();
      await p.waitForTimeout(2500);
      const visto = await p.locator("[data-precio-cita]").first().getAttribute("data-precio-cita");
      comprobar(centavos(visto) === centavos(nuevo), `al guardar, la cita dice ${visto} (antes ${c.precio})`);
      await p.reload({ waitUntil: "networkidle" });
      const recargado = await p.locator("[data-precio-cita]").first().getAttribute("data-precio-cita");
      const t = (await api.rpc("cuenta_totales_reserva", { p_reserva_id: c.reserva_id })).data?.[0];
      comprobar(centavos(recargado) === centavos(nuevo) && centavos(t?.total_cuenta) >= centavos(nuevo), `al recargar sigue en ${recargado} y la cuenta en ${t?.total_cuenta}`);
    }
  }

  // ── N161 ──
  if (corre("n161")) {
    seccion("N161 · el encabezado de la pestaña B se repinta con el registro vigente del conflicto");
    const c = await citaEstetica(6);
    const { p: pb, c: cb } = await abrirComo(nav, datos.adminB, B, { width: 1280, height: 900 });
    limpieza.push(async () => cb.close());
    await p.goto(`${BASE}/estetica/${c.id}`, { waitUntil: "networkidle" });
    await pb.goto(`${BASE}/estetica/${c.id}`, { waitUntil: "networkidle" });
    const horaB0 = await pb.locator("[data-hora-cita]").first().getAttribute("data-hora-cita");
    // A (pestaña p) reprograma una hora más tarde por la pantalla, como la QA en su pestaña A.
    const reprogramarEn = async (pg, hora) => {
      await pg.getByRole("button", { name: "Reprogramar" }).first().click();
      const campo = pg.locator("[data-reprogramar] input[type='datetime-local']");
      const valor = await campo.inputValue();
      await campo.fill(valor.replace(/T\d{2}:\d{2}/, `T${hora}`));
      await pg.getByRole("button", { name: "Guardar la nueva hora" }).click();
    };
    const valor0 = new Date(horaB0);
    const masUna = `${String((Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "America/Tijuana" }).format(valor0)) + 1) % 24).padStart(2, "0")}:00`;
    await reprogramarEn(p, masUna);
    await p.waitForTimeout(4000);
    const nuevoInicio = (await SB.from("citas_estetica").select("inicio").eq("id", c.id).single()).data.inicio;
    comprobar(Date.parse(nuevoInicio) !== Date.parse(horaB0), `A movió la cita por la pantalla (${horaB0} → ${nuevoInicio})`);
    // B, con la versión vieja, intenta reprogramar: conflicto.
    await reprogramarEn(pb, "12:00");
    const conflicto = await pb.locator("[data-conflicto-version]").first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    await pb.waitForTimeout(500);
    const horaB1 = await pb.locator("[data-hora-cita]").first().getAttribute("data-hora-cita");
    comprobar(conflicto, "B ve el aviso de conflicto");
    comprobar(Date.parse(horaB1) === Date.parse(nuevoInicio), `el encabezado de B pasó de ${horaB0} a ${horaB1} (lo que guardó A: ${nuevoInicio}) sin recargar`);
  }

  // ── N169 ──
  if (corre("n169")) {
    seccion("N169 · Veterinaria: reprogramar solo el médico, mismo día y hora");
    const meds = [];
    for (const pid of [datos.adminB, datos.recepcionB]) {
      const r = await SB.from("medicos_veterinarios").insert({ negocio_id: B, profile_id: pid, cedula_profesional: `S63-${pid.slice(0, 4)}-${sufijo}` }).select("id").single();
      if (r.data) { meds.push(r.data); limpieza.push(async () => SB.from("medicos_veterinarios").delete().eq("id", r.data.id)); }
    }
    const cuando = new Date(Date.now() + 3 * 86400000); cuando.setUTCHours(17, 0, 0, 0);
    const c = await rpc(P.admin, "vet_agendar_cita", { p_perro: datos.perroSoloB, p_tipo: "consulta", p_medico: meds[0].id, p_inicia: cuando.toISOString(), p_duracion_min: 30, p_motivo: `QA S63 ${sufijo}` });
    const id = c.cuerpo?.id;
    limpieza.push(async () => SB.from("vet_citas").delete().eq("id", id));
    await p.goto(`${BASE}/veterinaria/agenda?fecha=${cuando.toISOString().slice(0, 10)}`, { waitUntil: "networkidle" });
    const fila = p.locator("article, li").filter({ hasText: `QA S63 ${sufijo}` }).first();
    await fila.getByRole("button", { name: "Reprogramar" }).click();
    const hora = await fila.locator('input[name="hora"]').inputValue();
    comprobar(/^\d{2}:\d{2}$/.test(hora), `el campo «Hora» viene con la hora de la cita (${hora || "vacío"})`);
    await fila.locator('select[name="medico_id"]').selectOption(meds[1].id);
    await fila.getByRole("button", { name: "Mover la cita" }).click();
    const aviso = await p.locator(`[data-aviso-cita-movida="${id}"]`).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    if (!aviso) console.log(`    · url: ${p.url()} · texto: ${limpioTexto(await p.locator("main").innerText()).slice(0, 300)}`);
    const d = (await SB.from("vet_citas").select("medico_id").eq("id", id).single()).data;
    comprobar(d.medico_id === meds[1].id, `la cita cambió de médico (${d.medico_id === meds[1].id ? "sí" : "no"})`);
    comprobar(aviso, `la agenda dice «Cita movida» con su médico (${aviso ? limpioTexto(await p.locator("[data-aviso-cita-movida]").innerText()) : "no salió"})`);
  }

  // ── UX ──
  if (corre("ux")) {
    seccion("UX");
    await p.goto(`${BASE}/perros/${datos.perroSoloB}`, { waitUntil: "networkidle" });
    const { data: cm } = await api.rpc("cuentas_de_mascota", { p_perro: datos.perroSoloB, p_limite: 30 });
    comprobar(Array.isArray(cm) && (cm.length === 0 || (await p.locator("[data-cuentas-cliente]").count()) === 1), `la ficha de la mascota enseña sus cuentas (${(cm ?? []).length})`);

    await p.goto(`${BASE}/caja`, { waitUntil: "networkidle" });
    const enInicio = await p.locator("[data-cerrar-turno-inicio]").count();
    comprobar(enInicio === 1, "«Cerrar turno» está en el inicio de Caja");
    if (enInicio) {
      await p.locator("[data-cerrar-turno-inicio]").click();
      await p.waitForURL(/\/caja\/turno/, { timeout: 20000 }).catch(() => {});
      await p.waitForLoadState("networkidle").catch(() => {});
      const pregunta = await p.locator("[data-confirmar-cierre-turno]").waitFor({ timeout: 20000 }).then(() => 1).catch(() => 0);
      const arqueo = await p.getByText("Cerrar turno — arqueo").count();
      comprobar(pregunta === 1 && arqueo === 0, "abre el turno con «¿Cerrar el turno ahora?» y sin empezar el arqueo");
      if (pregunta) await p.getByRole("button", { name: "Todavía no" }).click();
    }

    // «Salir» sin deshabilitar al cargar: el HTML del servidor ya trae el botón activo.
    const html = await (await fetch(`${BASE}/caja`, { headers: { cookie: (await p.context().cookies()).map((k) => `${k.name}=${k.value}`).join("; ") } })).text();
    const salir = html.match(/<button[^>]*aria-label="Salir"[^>]*>/)?.[0] ?? "";
    const salirActivo = Boolean(salir) && !/\sdisabled(=|\s|>)/.test(salir);
    comprobar(salirActivo, `«Salir» llega activo antes de hidratar (${salir ? (salirActivo ? "activo" : "deshabilitado") : "no lo encontré"})`);

    // Talla y pelaje obligatorios: el error sale junto al campo.
    await p.goto(`${BASE}/perros/nuevo?cliente=${datos.clienteSoloB}`, { waitUntil: "networkidle" });
    if (await p.locator('select[name="pelaje_id"]').count()) {
      await p.getByLabel(/^Nombre/).first().fill(`ZZ S63 ${sufijo}`);
      await p.getByRole("button", { name: /Guardar|Crear|Registrar/ }).last().click();
      await p.waitForTimeout(1200);
      const errPelaje = await p.locator('select[name="pelaje_id"][aria-invalid="true"]').count();
      const pide = await p.locator("[data-pide-talla-pelaje]").count();
      comprobar(!pide || errPelaje === 1, `sin pelaje, el error sale junto a «Pelaje» (${pide ? (errPelaje ? "sí" : "no") : "este alta no lo pide"})`);
    }

    // Cancelar una cita: el motivo es obligatorio y se dice desde que se abre.
    const c = await citaEstetica(7);
    await p.goto(`${BASE}/estetica/${c.id}`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Cancelar cita" }).click();
    const etiqueta = await p.getByText("Motivo de la cancelación (obligatorio)").count();
    await p.getByRole("button", { name: /Sí, cancelar la cita/ }).click();
    await p.waitForTimeout(800);
    const errMotivo = await p.locator('[data-motivo-cancelar-cita][aria-invalid="true"]').count();
    comprobar(etiqueta === 1 && errMotivo === 1, `el motivo dice «(obligatorio)» desde el primer clic y su error sale junto al campo (${etiqueta}/${errMotivo})`);
  }
} finally {
  for (const f of limpieza.reverse()) await f().catch(() => {});
  await nav.close();
}
terminar();
