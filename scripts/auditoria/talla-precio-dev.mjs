// QA R50 · N133: un perro sin talla (o sin pelaje) cuyo precio depende de ella es un BLOQUEO que se dice al marcarlo,
// no al apretar «Crear reserva». Quién lo pide lo decide cotizar_linea_servicio (la misma regla con la que la base cobra:
// validar_estancia en guardería y hotel, cotizar_cita_estetica en Estética), no una lista de pantallas: un servicio que no
// depende de la talla no lo pide. Al marcar el perro sale «Falta la talla de X: sin ella no se puede calcular el precio»
// con el selector ahí mismo; «Guardar en su expediente y calcular» la guarda en el perro y la pantalla recalcula.
// SOLO DESARROLLO (Huellitas), con `next start` en el 3001:
//
//   node scripts/auditoria/talla-precio-dev.mjs
//
// 1. La base: hotel (por talla), guardería por día (sin talla), un servicio de guardería que sí depende de la talla y
//    Estética (grupo Mestizo: talla y pelaje). Con la talla, el precio sale y es el que cobra validar_estancia.
// 2. Las pantallas: «Nueva reserva» de Hotel y de Guardería, la serie de Hotel y «Agendar cita» de Estética dicen qué
//    falta, con el selector, y no dejan guardar; en Hotel se escoge la talla y la pantalla enseña el precio.
const { B, SB, datos, comprobar, seccion, terminar } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo } = await import("./lib/huellitas-navegador.mjs");

const sufijo = String(Date.now()).slice(-6);
const sumar = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
const limpio = (t) => (t ?? "").replace(/\s+/g, " ").trim();
const nav = await abrirNavegador();
const creados = { perros: [], servicios: [], tarifas: [] };
try {
  const { p, api } = await abrirComo(nav, datos.adminB, B);
  const hoy = (await api.rpc("fecha_negocio")).data;
  const { data: cliente } = await SB.from("clientes").select("id, nombre").eq("id", datos.clienteSoloB).single();
  const { data: tallas } = await SB.from("tamanos_categoria").select("id, clave, etiqueta").is("deleted_at", null).order("orden");
  const { data: labrador } = await SB.from("razas").select("id, nombre").ilike("nombre", "Labrador%").limit(1).single();
  const servicio = async (filtro) => (await SB.from("servicios").select("id, nombre").eq("negocio_id", B).match(filtro).is("deleted_at", null).limit(1).single()).data;
  const hotel = await servicio({ categoria: "hotel", unidad: "noche" });
  const guarderiaDia = await servicio({ categoria: "guarderia", unidad: "dia" });
  const { data: estetica } = await SB.from("servicios").select("id, nombre").eq("negocio_id", B).eq("categoria", "estetica").eq("depende_grupo_raza", true).is("deleted_at", null).limit(1).single();

  // Un perro mestizo (Labrador) sin talla ni pelaje, como «PRUEBA QA R49 SinTalla».
  const nombre = `ZZ SinTalla ${sufijo}`;
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: cliente.id, nombre, raza: labrador.nombre, raza_id: labrador.id }).select("id").single()).data;
  creados.perros.push(perro.id);
  // Un servicio de guardería por día que SÍ depende de la talla (con precio para cada una).
  const porTalla = (await SB.from("servicios").insert({ negocio_id: B, clave: `zz_guarderia_talla_${sufijo}`, nombre: `ZZ Guardería por talla ${sufijo}`, categoria: "guarderia", unidad: "dia", depende_tamano: true }).select("id, nombre").single()).data;
  creados.servicios.push(porTalla.id);
  for (const t of tallas) {
    const { data } = await SB.from("tarifas").insert({ negocio_id: B, servicio_id: porTalla.id, tamano_id: t.id, cantidad_desde: 1, vigencia_desde: sumar(hoy, -30), precio: 300 }).select("id").single();
    if (data) creados.tarifas.push(data.id);
  }

  const cotizar = async (servicioId, entrada, salida, horas = null) => {
    const { data, error } = await api.rpc("cotizar_linea_servicio", { p_perro_id: perro.id, p_servicio_id: servicioId, p_entrada: entrada, p_salida: salida, p_horas: horas });
    return error ? { error: error.message } : data;
  };

  seccion("1. La base dice el precio de la línea o lo que falta, por la regla del servicio");
  const e1 = sumar(hoy, 20), s1 = sumar(hoy, 22);
  const cHotel = await cotizar(hotel.id, e1, s1);
  comprobar(cHotel?.estado === "faltan_datos" && JSON.stringify(cHotel.faltan) === '["tamano"]', `hotel sin talla: falta la talla (${JSON.stringify(cHotel)})`);
  const cDia = await cotizar(guarderiaDia.id, e1, sumar(e1, 1));
  comprobar(cDia?.estado === "ok" && Number(cDia.precio) > 0, `guardería por día no depende de la talla: tiene precio (${JSON.stringify(cDia)})`);
  const cTalla = await cotizar(porTalla.id, e1, sumar(e1, 1));
  comprobar(cTalla?.estado === "faltan_datos" && cTalla.faltan?.includes("tamano"), `guardería que depende de la talla: falta la talla (${JSON.stringify(cTalla)})`);
  const cEst = await cotizar(estetica.id, null, null);
  comprobar(cEst?.estado === "faltan_datos" && cEst.faltan?.includes("tamano"), `Estética (Mestizo): falta ${JSON.stringify(cEst?.faltan)} (${cEst?.estado})`);
  const r = (await api.from("reservas").insert({ cliente_id: cliente.id }).select("id").single()).data;
  const sinTalla = await api.from("estancias").insert({ reserva_id: r.id, perro_id: perro.id, servicio_id: hotel.id, fecha_entrada: e1, fecha_salida: s1, dia_cerrado_confirmado: "confirmado", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba N133", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba N133" });
  comprobar(Boolean(sinTalla.error) && /talla/.test(sinTalla.error.message), `la base tampoco guarda la estancia sin talla: «${sinTalla.error?.message}»`);
  await SB.from("reservas").update({ deleted_at: new Date().toISOString() }).eq("id", r.id);

  seccion("2. Las pantallas lo dicen al marcar el perro, con el selector, y no dejan guardar");
  const esperado = `Falta la talla de ${nombre}: sin ella no se puede calcular el precio.`;
  const avisoDe = async () => {
    await p.locator("[data-falta-dato-precio]").first().waitFor({ timeout: 30000 }).catch(() => {});
    return limpio(await p.locator("[data-falta-dato-precio] p").first().innerText().catch(() => ""));
  };
  const elegirCliente = async (ruta) => {
    await p.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 120000 });
    await p.locator("input[type=text], input[type=search], input:not([type])").first().fill(cliente.nombre);
    await p.getByText(cliente.nombre, { exact: true }).first().click();
  };
  for (const [ruta, srv] of [["/hotel/nueva", hotel], ["/guarderia/nueva", porTalla]]) {
    await elegirCliente(ruta);
    await p.getByLabel(nombre, { exact: true }).check();
    const tarjeta = p.locator("div.rounded-lg").filter({ has: p.getByLabel(nombre, { exact: true }) }).first();
    if (ruta === "/guarderia/nueva") await tarjeta.getByLabel("Servicio").selectOption(srv.id);
    const aviso = await avisoDe();
    const selector = await p.locator("[data-falta-dato-precio] [data-elegir-talla]").count();
    const deshabilitado = await p.getByRole("button", { name: "Crear reserva" }).isDisabled();
    const motivo = limpio(await p.locator("[data-motivo-sin-precio]").first().innerText().catch(() => ""));
    comprobar(aviso === esperado && selector === 1 && deshabilitado && motivo === esperado, `${ruta} (${srv.nombre}): «${aviso}», selector de talla ${selector ? "sí" : "NO"}, «Crear reserva» ${deshabilitado ? "deshabilitado" : "HABILITADO"}; junto al botón: «${motivo}»`);
    if (ruta === "/guarderia/nueva") {
      // El mismo perro con guardería por día (no depende de la talla): sin aviso de talla y con su precio.
      await tarjeta.getByLabel("Servicio").selectOption(guarderiaDia.id);
      await p.locator("[data-precio-linea]:not([data-precio-linea=calculando])").first().waitFor({ timeout: 30000 }).catch(() => {});
      const precio = limpio(await p.locator("[data-precio-linea]").first().innerText().catch(() => ""));
      comprobar((await p.locator("[data-falta-dato-precio]").count()) === 0 && /^Precio: \$/.test(precio), `con «${guarderiaDia.nombre}» (no depende de la talla) no pide talla y dice «${precio}»`);
    }
  }

  await p.goto(`${BASE}/hotel/series/nueva`, { waitUntil: "networkidle", timeout: 120000 });
  await p.locator("input[type=text], input[type=search], input:not([type])").first().fill(cliente.nombre);
  await p.getByText(cliente.nombre, { exact: true }).first().click();
  await p.getByLabel("Perro", { exact: true }).selectOption(perro.id);
  await p.getByLabel("Servicio").selectOption(hotel.id);
  const avisoSerie = await avisoDe();
  const serieDeshabilitada = await p.getByRole("button", { name: /Crear serie/ }).isDisabled();
  comprobar(avisoSerie === esperado && serieDeshabilitada, `/hotel/series/nueva: «${avisoSerie}», «Crear serie» ${serieDeshabilitada ? "deshabilitado" : "HABILITADO"}`);

  await p.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle", timeout: 120000 });
  await p.getByPlaceholder(/ej\. Motita/).fill(cliente.nombre);
  await p.getByText(cliente.nombre, { exact: true }).first().click();
  await p.getByLabel("Perro", { exact: true }).selectOption(perro.id);
  await p.getByLabel("Servicio").selectOption(estetica.id).catch(() => {});
  const avisoEst = await avisoDe();
  const agendarDeshabilitado = await p.getByRole("button", { name: "Agendar cita", exact: true }).isDisabled();
  comprobar(avisoEst === `Falta la talla y el pelaje de ${nombre}: sin ellos no se puede calcular el precio.` && agendarDeshabilitado && (await p.locator("[data-falta-dato-precio] [data-elegir-talla]").count()) === 1,
    `/estetica/nueva: «${avisoEst}», con selector de talla y pelaje; «Agendar cita» ${agendarDeshabilitado ? "deshabilitado" : "HABILITADO"}`);

  seccion("3. Escoger la talla ahí mismo la guarda en el expediente y la pantalla recalcula");
  await elegirCliente("/hotel/nueva");
  await p.getByLabel(nombre, { exact: true }).check();
  await avisoDe();
  const chico = tallas.find((t) => t.clave === "chico") ?? tallas[0];
  await p.locator("[data-falta-dato-precio] [data-elegir-talla]").selectOption(chico.id);
  await p.getByRole("button", { name: "Guardar en su expediente y calcular" }).click();
  await p.locator("[data-falta-dato-precio]").waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
  await p.locator("[data-precio-linea]:not([data-precio-linea=calculando])").first().waitFor({ timeout: 30000 }).catch(() => {});
  const precio = limpio(await p.locator("[data-precio-linea]").first().innerText().catch(() => ""));
  const { data: guardado } = await SB.from("perros").select("tamano_id").eq("id", perro.id).single();
  const cOk = await cotizar(hotel.id, hoy, sumar(hoy, 1));
  comprobar(guardado?.tamano_id === chico.id, `la talla «${chico.etiqueta}» quedó en el expediente`);
  comprobar((await p.locator("[data-falta-dato-precio]").count()) === 0 && precio === `Precio: 1 noche × $${Number(cOk.precio).toFixed(2)} = $${Number(cOk.total).toFixed(2)}`, `sin salir de la pantalla: aviso fuera y «${precio}» (base: ${cOk.precio})`);
  const motivoDespues = await p.locator("[data-motivo-sin-precio]").count();
  comprobar(motivoDespues === 0, "junto a «Crear reserva» ya no dice que falta la talla (lo que quede es la evaluación o las vacunas)");
  await p.context().close();
} finally {
  const ahora = new Date().toISOString();
  for (const id of creados.tarifas) await SB.from("tarifas").update({ deleted_at: ahora }).eq("id", id);
  for (const id of creados.servicios) await SB.from("servicios").update({ deleted_at: ahora }).eq("id", id);
  for (const id of creados.perros) await SB.from("perros").update({ deleted_at: ahora }).eq("id", id);
  await nav.close();
}
terminar();
