// QA S36, los detalles de la misma tanda, EN PANTALLA. SOLO DESARROLLO (Huellitas), con `next start` en el 3001:
//
//   node scripts/auditoria/qa-s36-detalles-dev.mjs
//
// 1. Módulos y plan distingue «incluidos en tu plan» de «prendidos en tu negocio» y cada módulo apagado trae «Prender».
// 2. Una cita de estética iniciada por error («En curso») regresa a reservada o se cancela con motivo (sin cobros ni
//    consumo); con un cobro, la base no la deja.
// 3. El encabezado del personal enseña el nombre del negocio junto a su logo (o su inicial sin logo), para todos los roles.
// 4. El login separa «Soy cliente» y «Soy del equipo»; el «¿Olvidaste tu contraseña?» del equipo dice que la restablece
//    un admin desde Empleados, y Empleados lo ofrece (solo admin; nunca la propia ni la de alguien de otro negocio).
// (El botón de Stripe sigue en «Comenzar prueba» con la prueba corriendo: Stripe ignora submit_type con trial_end.)
const { B, SB, A, datos, comprobar, seccion, terminar, fijarModulo } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo, textoDe, esperarTexto } = await import("./lib/huellitas-navegador.mjs");

const sufijo = String(Date.now()).slice(-6);
const nav = await abrirNavegador();
const creados = { citas: [], perros: [] };
const { data: negocio } = await SB.from("negocios").select("nombre, marca").eq("id", B).single();
try {
  const { p, api } = await abrirComo(nav, datos.adminB, B);

  seccion("1. Módulos y plan");
  await p.goto(`${BASE}/admin/modulos`, { waitUntil: "networkidle" });
  const t1 = await textoDe(p);
  const lineas = await p.locator("[data-modulo-incluido]").allInnerTexts();
  comprobar(lineas.length > 0 && lineas.every((l) => /Incluido en tu plan · (prendido|apagado) en tu negocio/.test(l)), `cada módulo de tu plan dice si está prendido o apagado en tu negocio (${lineas.length})`);
  comprobar(!/tienes todos los módulos para que los conozcas/.test(t1), "ya no dice «tienes todos los módulos» a secas");
  const apagados = await p.locator("li").filter({ hasText: "apagado en tu negocio" }).all();
  let conPrender = 0;
  for (const li of apagados) if (await li.getByRole("button", { name: /^(Prender|Apagar)$/ }).count()) conPrender++;
  comprobar(conPrender === apagados.length, `cada módulo apagado trae su botón (${conPrender} de ${apagados.length})`);

  seccion("2. Cita de estética iniciada por error");
  const { data: servicio } = await api.from("servicios_cotizables").select("id").eq("categoria", "estetica").limit(1).single();
  const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
  const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ s36 ${sufijo}`, tamano_id: tallas.find((x) => x.clave === "chico").id, pelaje_id: pelajes.find((x) => x.clave === "corto").id }).select("id").single()).data;
  creados.perros.push(perro.id);
  const hoyB = (await api.rpc("fecha_negocio")).data;
  const mkCita = async () => {
    const rr = await api.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
    for (let i = 0; i < 10; i++) {
      const hora = `${String(16 + Math.floor(Math.random() * 6)).padStart(2, "0")}:${String(Math.floor(Math.random() * 6) * 10).padStart(2, "0")}:00Z`;
      const r = await api.from("citas_estetica").insert({ reserva_id: rr.data.id, perro_id: perro.id, servicio_id: servicio.id, empleado_id: datos.esteticaB, inicio: `${hoyB}T${hora}` }).select("id, reserva_id").single();
      if (!r.error) { creados.citas.push(r.data.id); return r.data; }
      if (!/traslape|encima|ocupad/i.test(r.error.message)) throw new Error(`cita: ${r.error.message}`);
    }
    throw new Error("cita: sin hora libre");
  };
  const iniciar = async (id) => {
    const r = await api.from("citas_estetica").update({ estado: "en_curso", entregado_por_nombre: "Prueba" }).eq("id", id);
    if (r.error) throw new Error(`iniciar: ${r.error.message}`);
  };
  const estadoDe = async (id) => (await SB.from("citas_estetica").select("estado").eq("id", id).single()).data?.estado;

  const c1 = await mkCita();
  await iniciar(c1.id);
  await p.goto(`${BASE}/estetica/${c1.id}`, { waitUntil: "networkidle" });
  comprobar((await p.locator("[data-regresar-a-reservada]").count()) === 1 && (await p.locator("[data-cancelar-en-curso]").count()) === 1, "una cita en curso trae «Regresar a reservada» y «Cancelar»");
  await p.locator("[data-regresar-a-reservada]").click();
  await p.locator("[data-deshacer-inicio] button").first().click();
  await esperarTexto(p, /regresó a reservada/);
  comprobar((await estadoDe(c1.id)) === "reservada", "«Regresar a reservada» la deja reservada");
  const { data: hist } = await SB.from("citas_estetica_cambios").select("tipo").eq("cita_id", c1.id);
  comprobar((hist ?? []).some((h) => h.tipo === "regreso_a_reservada"), "queda en el historial de la cita");

  await iniciar(c1.id);
  await p.goto(`${BASE}/estetica/${c1.id}`, { waitUntil: "networkidle" });
  await p.locator("[data-cancelar-en-curso]").click();
  await p.locator("[data-deshacer-inicio] button").first().click();
  comprobar(await esperarTexto(p, /Escribe el motivo de la cancelación/, 5000), "«Cancelar» pide el motivo");
  await p.locator("[data-deshacer-inicio] input").fill(`Se inició por error ${sufijo}`);
  await p.locator("[data-deshacer-inicio] button").first().click();
  await esperarTexto(p, /Cita cancelada/);
  comprobar((await estadoDe(c1.id)) === "cancelada", "«Cancelar» con motivo la cancela");

  const c2 = await mkCita();
  await iniciar(c2.id);
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) turno = (await api.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "auditoría S36" }).select("id").single()).data;
  await api.rpc("registrar_cobro", { p_reserva_id: c2.reserva_id, p_notas: "auditoría S36", p_metodos: [{ metodo: "efectivo", monto: 10, propina: 0 }] });
  const conCobro = await api.rpc("deshacer_inicio_cita", { p_cita_id: c2.id, p_destino: "reservada", p_motivo: null });
  comprobar(Boolean(conCobro.error) && /cobro/.test(conCobro.error.message), `con un cobro no se regresa (${conCobro.error?.message?.slice(0, 60)})`);
  const { token: tokEst, api: apiEst } = await abrirComo(nav, datos.recepcionB, B).then((x) => ({ token: null, api: x.api }));
  void tokEst;
  const c3 = await mkCita();
  await iniciar(c3.id);
  const deRecepcion = await apiEst.rpc("deshacer_inicio_cita", { p_cita_id: c3.id, p_destino: "reservada", p_motivo: null });
  comprobar(!deRecepcion.error, `recepción también la regresa (${deRecepcion.error?.message ?? "ok"})`);

  seccion("3. El encabezado del personal: nombre del negocio junto al logo, en todos los roles");
  // Con un logo de imagen (como prueba-est-tica): se pone uno por un momento y se regresa al terminar.
  await SB.from("negocios").update({ marca: { ...(negocio.marca ?? {}), logo: "/globe.svg" } }).eq("id", B);
  try {
    for (const [rol, id, ruta] of [["admin", datos.adminB, "/admin"], ["recepción", datos.recepcionB, "/recepcion"], ["estética", datos.esteticaB, "/estetica"]]) {
      const { p: pr, c } = await abrirComo(nav, id, B);
      await pr.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
      const nombre = (await pr.locator("header [data-nombre-negocio]").first().innerText().catch(() => "")).trim();
      comprobar(nombre === negocio.nombre, `${rol}: el encabezado dice «${nombre || "(nada)"}»`);
      await c.close();
    }
  } finally {
    await SB.from("negocios").update({ marca: negocio.marca }).eq("id", B);
  }

  seccion("4. Login: «Soy cliente» y «Soy del equipo»");
  const { p: pl, c: cl } = await abrirComo(nav, datos.adminB, B).then(async (x) => { await x.c.clearCookies(); return x; });
  await pl.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  comprobar((await pl.locator('[data-entrar-como="cliente"][aria-selected="true"]').count()) === 1, "abre en «Soy cliente», con el teléfono");
  comprobar((await pl.getByLabel("Teléfono", { exact: true }).count()) === 1, "el cliente ve «Teléfono»");
  await pl.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
  comprobar(/recepción/.test(await pl.locator("[data-recuperar=cliente]").innerText().catch(() => "")), "al cliente: se la restablece recepción");
  await pl.locator('[data-entrar-como="equipo"]').click();
  comprobar((await pl.getByLabel("Teléfono o correo").count()) === 1, "el equipo ve «Teléfono o correo»");
  await pl.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
  const ayudaEquipo = await pl.locator("[data-recuperar=equipo]").innerText().catch(() => "");
  comprobar(/un admin de tu negocio desde Empleados/.test(ayudaEquipo.replace(/\s+/g, " ")), "al equipo: la restablece un admin de su negocio desde Empleados");
  await cl.close();

  // Empleados → la ficha (con el módulo prendido mientras se prueba) y Administración → Cuentas (está aunque no).
  const { data: modEmp } = await SB.from("negocio_modulos").select("activo").eq("negocio_id", B).eq("modulo", "empleados").is("deleted_at", null).maybeSingle();
  await fijarModulo("empleados", true);
  try {
    const { data: emps } = await SB.from("empleados").select("id, profile_id").eq("negocio_id", B).not("profile_id", "is", null).neq("profile_id", datos.adminB).is("deleted_at", null);
    let emp = null;
    for (const e of emps ?? []) if (!(await api.rpc("cuenta_de_personal_para_restablecer", { p_empleado_id: e.id })).error) { emp = e; break; }
    if (!emp) comprobar(false, "Huellitas tiene a alguien del equipo con cuenta (y solo en Huellitas) en Empleados");
    else {
      await p.goto(`${BASE}/empleados/${emp.id}`, { waitUntil: "networkidle" });
      comprobar((await p.locator("[data-restablecer-password-personal]").count()) === 1, "Empleados → su ficha trae «Restablecer contraseña» (admin)");
      const ok = await api.rpc("cuenta_de_personal_para_restablecer", { p_empleado_id: emp.id });
      comprobar(ok.data === emp.profile_id, "la base devuelve su cuenta al admin");
      const noRec = await apiEst.rpc("cuenta_de_personal_para_restablecer", { p_empleado_id: emp.id });
      comprobar(Boolean(noRec.error), "recepción no puede restablecer contraseñas del equipo");
    }
    const yo = await api.rpc("cuenta_del_equipo_para_restablecer", { p_profile_id: datos.adminB });
    comprobar(Boolean(yo.error), "ni la propia (esa se cambia saliendo y entrando)");
    const cliente = await api.rpc("cuenta_del_equipo_para_restablecer", { p_profile_id: datos.cuentaSoloB });
    comprobar(Boolean(cliente.error), "ni la de un cliente (esa, desde su ficha)");
  } finally {
    await fijarModulo("empleados", modEmp?.activo ?? false);
  }
  await p.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  comprobar((await p.locator("[data-restablecer-password-personal]").count()) >= 1, "Administración → Cuentas también ofrece «Restablecer contraseña» (sin depender de Empleados)");
  await p.context().close();
} finally {
  for (const id of creados.citas) await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  for (const id of creados.perros) await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  await nav.close();
}
terminar();
