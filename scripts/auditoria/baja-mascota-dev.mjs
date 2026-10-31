// Dar de baja una mascota sin tocar al dueño (31 de octubre de 2026). SOLO DESARROLLO (Huellitas), con `next start`
// en el 3001:
//
//   node scripts/auditoria/baja-mascota-dev.mjs
//
// 1. Sin historial: recepción la da de baja desde el expediente («Confirmar y eliminar») y se elimina de verdad; la
//    bitácora (perros_bajas) conserva el nombre.
// 2. Con historial (bitácora): queda inactiva (deleted_at + motivo + quién), ya no sale en la lista de clientes,
//    aparece en «dados de baja» de la ficha del dueño y «Reactivar» la regresa. Estética no ve el botón.
// 3. Con una cita viva: la pantalla dice que no se puede y la base la rechaza diciendo qué falta.
// 4. Fallecido: queda marcado con fecha, su recordatorio del carnet se omite y la tarea no lo toma; el portal lo
//    enseña en «que ya no vienen», sin «Pedir la baja».
// 5. Desde el portal: el dueño pide la baja; sale en «Necesita atención» de recepción; el expediente la confirma con
//    el motivo del dueño y la solicitud queda confirmada.
// 6. La llave anónima y el cliente no pueden llamar perro_dar_de_baja.
// Limpia lo que creó. Sale con 1 si algo falla.
const { B, SB, datos, comprobar, seccion, terminar, rpc, personas, hoy, sumaDias } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo, textoDe } = await import("./lib/huellitas-navegador.mjs");

const sufijo = String(Date.now()).slice(-6);
const C = datos.clienteSoloB; // el dueño con cuenta de portal (datos.cuentaSoloB)
const creados = { perros: [], reservas: [], citas: [], bitacora: [], carnet: [] };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const nuevoPerro = async (apodo, extra = {}) => {
  const { data, error } = await SB.from("perros").insert({ negocio_id: B, cliente_id: C, nombre: `ZZ Baja ${apodo} ${sufijo}`, ...extra }).select("id, nombre").single();
  if (error) throw new Error(`perro: ${error.message}`);
  creados.perros.push(data.id);
  return data;
};
const conHistorial = async (perroId) => {
  const { data, error } = await SB.from("bitacora_entradas").insert({ negocio_id: B, perro_id: perroId, nota: `auditoría baja ${sufijo}` }).select("id").single();
  if (error) throw new Error(`bitácora: ${error.message}`);
  creados.bitacora.push(data.id);
};
const citaViva = async (perroId, fechaHoy) => {
  const servicio =
    (await SB.from("servicios").select("id").eq("negocio_id", B).is("deleted_at", null).eq("categoria", "estetica").limit(1).maybeSingle()).data ??
    (await SB.from("servicios").select("id").eq("negocio_id", B).is("deleted_at", null).limit(1).single()).data;
  const { data: r, error: eR } = await SB.from("reservas").insert({ negocio_id: B, cliente_id: C }).select("id").single();
  if (eR) throw new Error(`reserva: ${eR.message}`);
  creados.reservas.push(r.id);
  const inicio = `${sumaDias(fechaHoy, 1)}T10:00:00-06:00`;
  const fin = `${sumaDias(fechaHoy, 1)}T11:00:00-06:00`;
  const { data, error } = await SB.from("citas_estetica").insert({ negocio_id: B, reserva_id: r.id, perro_id: perroId, servicio_id: servicio.id, empleado_id: datos.esteticaB, inicio, fin, precio: 100, estado: "reservada" }).select("id").single();
  if (error) throw new Error(`cita: ${error.message}`);
  creados.citas.push(data.id);
  return data.id;
};
const recordatorioCarnet = async (perroId, fechaHoy) => {
  const { data, error } = await SB.from("carnet_recordatorios").insert({ negocio_id: B, perro_id: perroId, origen_tipo: "vacuna", origen_id: crypto.randomUUID(), detalle: `Rabia ${sufijo}`, proxima_dosis: sumaDias(fechaHoy, 5) }).select("id").single();
  if (error) throw new Error(`carnet_recordatorios: ${error.message}`);
  creados.carnet.push(data.id);
  return data.id;
};
const perroEnBase = async (id) => (await SB.from("perros").select("id, nombre, deleted_at, baja_motivo, baja_nota, baja_por, fallecido, fecha_fallecimiento").eq("id", id).maybeSingle()).data;
const bajasDe = async (nombre) => (await SB.from("perros_bajas").select("tipo, motivo, resultado, perro_id, atendida_por").eq("perro_nombre", nombre).order("created_at")).data ?? [];
const esperarEnBase = async (f, ms = 20000) => { const fin = Date.now() + ms; let v = await f(); while (!v && Date.now() < fin) { await espera(500); v = await f(); } return v; };

const nav = await abrirNavegador();
const quien = await personas();
const fechaHoy = await hoy(quien.admin);
try {
  const p1 = await nuevoPerro("sin historial");
  const p2 = await nuevoPerro("con historial");
  await conHistorial(p2.id);
  // Con talla y pelaje: el precio de la cita de estética los pide al agendar.
  const tamano = (await SB.from("tamanos_categoria").select("id").is("deleted_at", null).order("orden").limit(1).single()).data;
  const pelaje = (await SB.from("tipos_pelaje").select("id").is("deleted_at", null).order("orden").limit(1).single()).data;
  const p3 = await nuevoPerro("cita viva", { tamano_id: tamano.id, pelaje_id: pelaje.id });
  await citaViva(p3.id, fechaHoy);
  const p4 = await nuevoPerro("fallecido");
  await conHistorial(p4.id);
  const recId = await recordatorioCarnet(p4.id, fechaHoy);
  const p5 = await nuevoPerro("portal");

  const { p: rec } = await abrirComo(nav, datos.recepcionB, B);
  const abrirFicha = async (p, id) => {
    await p.goto(`${BASE}/perros/${id}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.locator("[data-baja-mascota]").first().waitFor({ timeout: 90000 });
  };
  const darDeBaja = async (p, motivo, nota = "") => {
    await p.locator("[data-abrir-baja]").click();
    await p.locator("[data-formulario-baja] select").selectOption(motivo);
    if (nota) await p.locator("[data-formulario-baja] textarea").fill(nota);
    await p.locator("[data-confirmar-baja]").click();
  };

  seccion("1. Sin historial: se elimina de verdad");
  await abrirFicha(rec, p1.id);
  comprobar((await rec.locator('[data-que-pasara="eliminada"]').count()) === 1, "el expediente dice que no tiene historial y que se va a eliminar");
  comprobar(/Confirmar y eliminar|Dar de baja/.test(await textoDe(rec)), "está el botón «Dar de baja…»");
  await darDeBaja(rec, "error");
  await rec.waitForURL(/\/clientes\/[0-9a-f-]{36}\?.*baja=eliminada/, { timeout: 90000 });
  comprobar(new URL(rec.url()).pathname === `/clientes/${C}`, `navega a la ficha del dueño (${new URL(rec.url()).pathname})`);
  const avisoEliminada = await rec.getByText(/se eliminó/).first().waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
  comprobar(avisoEliminada, "la ficha del dueño dice que se eliminó");
  comprobar((await perroEnBase(p1.id)) === null, "la mascota ya no existe en la base");
  const b1 = await bajasDe(p1.nombre);
  comprobar(b1.some((b) => b.tipo === "baja" && b.resultado === "eliminada" && b.motivo === "error" && b.perro_id === null), `la bitácora conserva la baja con el nombre (${JSON.stringify(b1)})`);

  seccion("2. Con historial: inactiva, fuera de las listas, y reactivable");
  await abrirFicha(rec, p2.id);
  comprobar((await rec.locator('[data-que-pasara="inactiva"]').count()) === 1, "el expediente dice que tiene historial y quedará inactiva");
  await darDeBaja(rec, "ya_no_viene", "Se mudaron a Querétaro");
  await rec.waitForURL(/\/clientes\/[0-9a-f-]{36}\?.*baja=inactiva/, { timeout: 90000 });
  await rec.locator(`[data-mascota-baja="${p2.id}"]`).waitFor({ timeout: 60000 });
  const textoDuenoB = await textoDe(rec);
  comprobar(/dad[oa]s de baja/i.test(textoDuenoB) && /Ya no viene/.test(textoDuenoB) && /Querétaro/.test(textoDuenoB), "la ficha del dueño la lista en «dados de baja» con motivo y nota");
  const enBase2 = await perroEnBase(p2.id);
  comprobar(Boolean(enBase2?.deleted_at) && enBase2?.baja_motivo === "ya_no_viene" && enBase2?.baja_por === datos.recepcionB, `en la base: deleted_at, motivo y quién (${enBase2?.baja_motivo}, ${enBase2?.baja_por === datos.recepcionB ? "recepción" : enBase2?.baja_por})`);
  await rec.goto(`${BASE}/clientes`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await rec.locator("h1").first().waitFor({ timeout: 60000 });
  await espera(1500);
  const textoClientes = await textoDe(rec);
  comprobar(!textoClientes.includes(p2.nombre), "ya no sale en la lista de clientes y mascotas");
  comprobar(textoClientes.includes(p3.nombre) || !textoClientes.includes("ZZ Baja"), "la lista sigue enseñando a las activas (o no enseña mascotas)");
  // Su expediente se abre en solo lectura, con el aviso y «Reactivar».
  await abrirFicha(rec, p2.id);
  comprobar((await rec.locator('[data-baja-mascota][data-estado="inactiva"]').count()) === 1 && /está dad[oa] de baja/.test(await textoDe(rec)), "su expediente se abre con el aviso de baja");
  comprobar((await rec.locator("[data-reactivar]").count()) === 1, "tiene «Reactivar»");
  // Estética solo lee.
  const { p: est } = await abrirComo(nav, datos.esteticaB, B);
  await abrirFicha(est, p2.id);
  comprobar((await est.locator("[data-reactivar]").count()) === 0, "estética no tiene «Reactivar»");
  await est.context().close();
  // Reactivar desde la ficha del dueño.
  await rec.goto(`${BASE}/clientes/${C}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await rec.locator(`[data-reactivar="${p2.id}"]`).waitFor({ timeout: 60000 });
  await rec.locator(`[data-reactivar="${p2.id}"]`).click();
  const reactivada = await esperarEnBase(async () => { const x = await perroEnBase(p2.id); return x && !x.deleted_at ? x : null; });
  comprobar(Boolean(reactivada) && reactivada.baja_motivo === null, "«Reactivar» la regresa (deleted_at y motivo en null)");
  const b2 = await bajasDe(p2.nombre);
  comprobar(b2.some((b) => b.tipo === "baja" && b.resultado === "inactiva") && b2.some((b) => b.tipo === "reactivacion"), `la bitácora tiene la baja y la reactivación (${b2.map((b) => b.tipo).join(", ")})`);
  await abrirFicha(rec, p2.id);
  comprobar((await rec.locator('[data-baja-mascota][data-estado="activa"]').count()) === 1, "su expediente vuelve a estar activo");
  const { p: est2 } = await abrirComo(nav, datos.esteticaB, B);
  await abrirFicha(est2, p2.id);
  comprobar((await est2.locator("[data-abrir-baja]").count()) === 0 && /La baja la hacen admin o recepción/.test(await textoDe(est2)), "estética no ve «Dar de baja…» y la pantalla lo dice");
  await est2.context().close();

  seccion("3. Con una cita viva: bloquea");
  await abrirFicha(rec, p3.id);
  const t3 = await textoDe(rec);
  comprobar(/Todavía no se puede dar de baja/.test(t3) && /cita de estética/.test(t3) && (await rec.locator("[data-abrir-baja]").count()) === 0, "la pantalla dice que no se puede y no ofrece el botón");
  const r3 = await rpc(quien.admin, "perro_dar_de_baja", { p_perro_id: p3.id, p_motivo: "ya_no_viene" });
  comprobar(!r3.ok && /sin terminar/.test(r3.mensaje), `la base la rechaza diciendo qué falta (${r3.mensaje})`);
  comprobar(!(await perroEnBase(p3.id))?.deleted_at, "sigue activa");

  seccion("4. Falleció: marcada, recordatorios apagados, portal aparte");
  const r4 = await rpc(quien.admin, "perro_dar_de_baja", { p_perro_id: p4.id, p_motivo: "fallecio" });
  comprobar(r4.ok && r4.cuerpo?.resultado === "inactiva", `la baja por fallecimiento deja la ficha inactiva (${r4.ok ? r4.cuerpo?.resultado : r4.mensaje})`);
  const enBase4 = await perroEnBase(p4.id);
  comprobar(enBase4?.fallecido === true && enBase4?.fecha_fallecimiento === fechaHoy && Boolean(enBase4?.deleted_at), `fallecido con fecha de hoy (${enBase4?.fecha_fallecimiento})`);
  const { data: rec4 } = await SB.from("carnet_recordatorios").select("estado").eq("id", recId).single();
  comprobar(rec4?.estado === "omitido", `su recordatorio del carnet quedó omitido (${rec4?.estado})`);
  const { data: paraEnviar } = await SB.rpc("carnet_recordatorios_para_enviar", { p_limite: 500 });
  comprobar(!(paraEnviar ?? []).some((x) => x.id === recId || x.perro_id === p4.id), "la tarea de recordatorios del carnet ya no la toma");
  const { data: gen } = await SB.rpc("carnet_generar_recordatorios");
  const { data: rec4b } = await SB.from("carnet_recordatorios").select("id, estado").eq("perro_id", p4.id);
  comprobar((rec4b ?? []).every((x) => x.estado === "omitido"), `generar recordatorios no le crea nuevos (${(rec4b ?? []).length} filas, generados ${gen ?? 0})`);
  const { p: portal } = await abrirComo(nav, datos.cuentaSoloB, B);
  await portal.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await portal.locator("[data-mascotas-retiradas]").waitFor({ timeout: 90000 });
  const retiradas = await portal.locator("[data-mascotas-retiradas]").innerText();
  const activasPortal = (await textoDe(portal)).replace(retiradas.replace(/\s+/g, " "), "");
  comprobar(retiradas.includes(p4.nombre) && /Falleció/.test(retiradas), `el portal la enseña en «que ya no vienen» como fallecida (${retiradas.includes(p4.nombre) ? "está" : "NO está"}; ${retiradas.replace(/\s+/g, " ").slice(0, 300)})`);
  comprobar(!activasPortal.includes(p4.nombre), "y no en la lista de mascotas activas");
  await portal.goto(`${BASE}/portal/perros/${p4.id}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await portal.locator("h1").first().waitFor({ timeout: 60000 });
  comprobar((await portal.locator("[data-pedir-baja]").count()) === 0 && /Falleció/.test(await textoDe(portal)), "su ficha en el portal se abre sin «Pedir la baja» y dice que falleció");

  seccion("5. Desde el portal: la solicitud llega a «Necesita atención» y el negocio la confirma");
  await portal.goto(`${BASE}/portal/perros/${p5.id}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await portal.locator("[data-abrir-pedir-baja]").waitFor({ timeout: 90000 });
  await portal.locator("[data-abrir-pedir-baja]").click();
  await portal.locator("[data-pedir-baja] select").selectOption("cambio_dueno");
  await portal.locator("[data-pedir-baja] textarea").fill("Se quedó con mi hermana");
  await portal.locator("[data-confirmar-pedir-baja]").click();
  await portal.getByText(/va a confirmar/).first().waitFor({ timeout: 60000 });
  const sol = await esperarEnBase(async () => (await SB.from("perros_bajas").select("id, resultado, motivo").eq("perro_id", p5.id).eq("tipo", "solicitud").maybeSingle()).data);
  comprobar(sol?.resultado === "pendiente" && sol?.motivo === "cambio_dueno", "la solicitud quedó pendiente con el motivo del dueño");
  const r5b = await rpc(quien.cliente, "portal_solicitar_baja_mascota", { p_perro_id: p5.id, p_motivo: "error" });
  comprobar(!r5b.ok && /Ya pediste/.test(r5b.mensaje), "una segunda solicitud no se repite");
  await rec.goto(`${BASE}/recepcion`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await rec.getByText(new RegExp(`dar de baja a ${p5.nombre}`)).first().waitFor({ timeout: 90000 });
  comprobar(true, "«Necesita atención» dice que el dueño pide dar de baja a la mascota");
  await abrirFicha(rec, p5.id);
  comprobar(/El dueño pidió dar de baja/.test(await textoDe(rec)), "el expediente enseña la solicitud");
  comprobar(/Confirmar la baja/.test(await rec.locator("[data-abrir-baja]").innerText()), "el botón dice «Confirmar la baja…»");
  await rec.locator("[data-abrir-baja]").click();
  comprobar((await rec.locator("[data-formulario-baja] select").inputValue()) === "cambio_dueno", "el motivo viene prellenado con el del dueño");
  await rec.locator("[data-confirmar-baja]").click();
  await rec.waitForURL(/\/clientes\/[0-9a-f-]{36}\?.*baja=eliminada/, { timeout: 90000 });
  const sol2 = (await SB.from("perros_bajas").select("resultado, atendida_por").eq("id", sol.id).single()).data;
  comprobar(sol2?.resultado === "confirmada" && sol2?.atendida_por === datos.recepcionB, `la solicitud quedó confirmada por recepción (${sol2?.resultado})`);
  comprobar((await perroEnBase(p5.id)) === null, "la mascota (sin historial) se eliminó");
  await rec.goto(`${BASE}/recepcion`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await rec.locator("h1").first().waitFor({ timeout: 60000 });
  comprobar(!(await textoDe(rec)).includes(`dar de baja a ${p5.nombre}`), "el aviso se fue de «Necesita atención»");
  await portal.context().close();

  seccion("6. Permisos de la base");
  const rAnon = await rpc(null, "perro_dar_de_baja", { p_perro_id: p3.id, p_motivo: "error" });
  comprobar(!rAnon.ok, `la llave anónima no puede dar de baja (${rAnon.status})`);
  const rCli = await rpc(quien.cliente, "perro_dar_de_baja", { p_perro_id: p3.id, p_motivo: "error" });
  comprobar(!rCli.ok && rCli.codigo === "42501", `el cliente tampoco (${rCli.codigo})`);
  const rEst = await rpc(quien.estetica, "perro_dar_de_baja", { p_perro_id: p3.id, p_motivo: "error" });
  comprobar(!rEst.ok && rEst.codigo === "42501", `estética tampoco (${rEst.codigo})`);
  const rRes = await rpc(null, "perro_baja_resumen", { p_perro_id: p3.id });
  comprobar(!rRes.ok, "la llave anónima no lee el resumen de la baja");
  await rec.context().close();
} finally {
  await nav.close().catch(() => {});
  const ahora = new Date().toISOString();
  for (const id of creados.citas) await SB.from("citas_estetica").update({ estado: "cancelada", deleted_at: ahora }).eq("id", id);
  for (const id of creados.citas) await SB.from("citas_estetica").delete().eq("id", id);
  for (const id of creados.reservas) await SB.from("reservas").delete().eq("id", id);
  for (const id of creados.bitacora) await SB.from("bitacora_entradas").delete().eq("id", id);
  for (const id of creados.carnet) await SB.from("carnet_recordatorios").delete().eq("id", id);
  await SB.from("perros_bajas").delete().like("perro_nombre", `ZZ Baja %${sufijo}`);
  for (const id of creados.perros) {
    const { error } = await SB.from("perros").delete().eq("id", id);
    if (error) await SB.from("perros").update({ deleted_at: ahora }).eq("id", id);
  }
}
terminar();
