// QA S41 (N139–N142, N144): cada acción de estado de Estética, Hotel/Guardería, Veterinaria y Caja se ejecuta EN
// PANTALLA y, sin recargar, se comprueba que el estado nuevo ya se ve, que el botón se liberó y que no queda ningún aviso
// ni error de antes. SOLO DESARROLLO, en Huellitas, con `next start` en el 3001 (npm run build antes):
//
//   node scripts/auditoria/acciones-pantalla-dev.mjs
//
// El refresco de la página (las peticiones `_rsc`) se retrasa 3 s: lo que la pantalla enseña en el primer medio
// segundo después de que el botón se libera es lo que pintó con la RESPUESTA de la acción (los `registros`), no lo que
// trae una recarga posterior. Así falla con el código de antes de QA S41 (firmar decía «Borrador»; el total de la
// estancia esperaba la recarga; el aviso de horario seguía junto al «Cita agendada»; el mosaico de Veterinaria contaba
// solo los borradores de más de un día) y pasa con el de ahora.
//
// Deja lo que crea marcado «AUDITORIA S41» y lo quita al terminar (citas canceladas, cargo cancelado, el médico de
// prueba dado de baja); la consulta firmada se queda (una consulta firmada no se borra).
import { abrirNavegador } from "../lib/navegador.mjs";
import { confirmarSiFueraDeHorario } from "../lib/fuera-horario.mjs";

const { B, SB, datos, rpc, post, personas, comprobar, seccion, terminar, sumaDias, hoy } = await import("./veterinaria-comun-dev.mjs");
const { BASE, abrirComo } = await import("./lib/huellitas-navegador.mjs");

const MARCA = "AUDITORIA S41";
const INMEDIATO_MS = 500;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const limpio = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
const P = await personas();
const nav = await abrirNavegador();
const limpieza = [];

async function pantalla(profileId) {
  const { c, p } = await abrirComo(nav, profileId, B);
  // El refresco de la página tarda 3 s: lo que se ve antes es lo que trajo la respuesta de la acción.
  // Solo el refresco de la página que se ve, no las precargas de los enlaces del menú (`next-router-prefetch`): con
  // esas también retrasadas, las ~35 del menú llenan las conexiones del navegador y la acción espera detrás.
  await c.route((u) => u.searchParams.has("_rsc"), async (ruta) => {
    if (!ruta.request().headers()["next-router-prefetch"]) await espera(3000);
    await ruta.continue().catch(() => {});
  });
  // AUDITORIA_DEBUG=1: cada petición de la pantalla (sin los archivos estáticos), con su hora.
  if (process.env.AUDITORIA_DEBUG) {
    const t0 = Date.now();
    p.on("request", (r) => !/_next\/static|\.(png|svg|ico|woff2?)/.test(r.url()) && console.log(`      [${Date.now() - t0}ms] → ${r.method()} ${r.url().replace(BASE, "").slice(0, 80)}${r.headers()["next-action"] ? " (acción)" : ""}`));
    p.on("requestfinished", (r) => !/_next\/static|\.(png|svg|ico|woff2?)/.test(r.url()) && console.log(`      [${Date.now() - t0}ms] ✓ ${r.method()} ${r.url().replace(BASE, "").slice(0, 80)}`));
    p.on("requestfailed", (r) => console.log(`      [${Date.now() - t0}ms] ✗ ${r.method()} ${r.url().replace(BASE, "").slice(0, 80)} ${r.failure()?.errorText}`));
  }
  return { c, p };
}
async function abrir(p, ruta) {
  await p.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" }).catch(() => {});
}
/** Aprieta y espera a que el botón salga de «…ndo…» (o desaparezca). Devuelve cuánto tardó. */
async function apretar(p, boton, ocupado = /…/) {
  const t0 = Date.now();
  await boton.click();
  while (Date.now() - t0 < 30000) {
    await espera(100);
    if (!(await boton.count())) break;
    const t = limpio(await boton.first().innerText().catch(() => ""));
    if (!ocupado.test(t)) break;
  }
  return Date.now() - t0;
}
const errores = async (p) => limpio(await p.locator("[role=alert]").allInnerTexts().then((x) => x.join(" · ")).catch(() => ""));

try {
  // Un día y una hora fuera de horario distintos en cada corrida (las citas de corridas anteriores no chocan).
  const semilla = Date.now();
  const dia = sumaDias(await hoy(P.admin), 30 + (Math.floor(semilla / 1000) % 300));
  const horaFuera = `${20 + (Math.floor(semilla / 60000) % 4)}:${String((Math.floor(semilla / 1000) % 6) * 10).padStart(2, "0")}`;

  // ═══ Estética ═══
  seccion("Estética · agendar: el «Cita agendada» borra el aviso de horario de antes (N142)");
  // La mascota fija de Huellitas y el servicio de su última cita (ya tiene precio).
  const { data: base } = await SB.from("citas_estetica").select("perro_id, servicio_id, perros(nombre, cliente_id)").eq("negocio_id", B).eq("perro_id", datos.perroSoloB).order("created_at", { ascending: false }).limit(1).single();
  const { p: pe } = await pantalla(datos.adminB);
  await abrir(pe, `/estetica/nueva?fecha=${dia}`);
  await pe.getByRole("searchbox").first().fill(base.perros.nombre);
  await pe.locator(`[data-cliente-id="${base.perros.cliente_id}"] button`).first().click();
  await pe.getByLabel(/^(Perro|Mascota|Gato)$/).selectOption(base.perro_id);
  await pe.getByLabel("Servicio", { exact: true }).selectOption(base.servicio_id).catch(() => {});
  // Si a la mascota le falta un dato para el precio (talla, pelaje), se resuelve ahí mismo, como lo hace recepción.
  await pe.locator("[data-aviso-precio]").first().waitFor({ timeout: 30000 });
  for (let i = 0; i < 3 && !(await pe.locator("[data-aviso-precio=ok]").count()); i += 1) {
    const guardarDato = pe.getByRole("button", { name: /Guardar en su expediente y calcular/ });
    if (!(await guardarDato.count())) { await espera(1000); continue; }
    for (const etiqueta of ["Pelaje", "Tamaño"]) {
      const s = pe.getByLabel(etiqueta, { exact: true });
      if (await s.count()) await s.first().selectOption({ index: 1 }).catch(() => {});
    }
    await guardarDato.first().click();
    await espera(2500);
  }
  await pe.locator("[data-aviso-precio=ok]").waitFor({ timeout: 30000 });
  // Una hora fuera del horario para que haya aviso antes de agendar.
  await pe.getByLabel("Fecha y hora").fill(`${dia}T${horaFuera}`);
  const avisoAntes = await pe.locator("[data-aviso-horario]").count();
  const agendar = pe.getByRole("button", { name: /^(Agendar cita|Agendando…)$/ });
  let ms = await apretar(pe, agendar);
  if (await pe.locator("[data-agendar-de-todos-modos]").count()) ms = await apretar(pe, pe.locator("[data-agendar-de-todos-modos]"));
  await pe.getByText(/Cita agendada/).first().waitFor({ timeout: 30000 });
  await espera(INMEDIATO_MS);
  const avisoDespues = limpio(await pe.locator("[data-aviso-horario]").allInnerTexts().then((x) => x.join(" ")).catch(() => ""));
  const errAgendar = await errores(pe);
  comprobar(avisoAntes > 0, `antes de agendar a las ${horaFuera} sale el aviso de horario`);
  comprobar(!avisoDespues, `con «Cita agendada» no queda el aviso de horario de antes${avisoDespues ? ` (sigue: «${avisoDespues.slice(0, 90)}»)` : ""}`);
  comprobar(!errAgendar, `y ningún error viejo${errAgendar ? ` («${errAgendar.slice(0, 90)}»)` : ""}`);
  comprobar(/Agendar cita/.test(limpio(await agendar.first().innerText().catch(() => "Agendar cita"))), `el botón se liberó (${ms} ms)`);
  const { data: cita } = await SB.from("citas_estetica").select("id").eq("negocio_id", B).eq("perro_id", base.perro_id).gte("created_at", new Date(Date.now() - 120000).toISOString()).order("created_at", { ascending: false }).limit(1).single();
  limpieza.push(async () => SB.from("citas_estetica").update({ estado: "cancelada", motivo_cancelacion: MARCA }).eq("id", cita.id));

  seccion("Estética · iniciar: la cita queda en curso con la respuesta y el botón se libera (N141)");
  await abrir(pe, `/estetica/${cita.id}`);
  await pe.getByRole("button", { name: "Iniciar cita" }).click();
  const entrega = pe.locator("#cita-entrega-nombre");
  if (await entrega.count()) await entrega.fill(MARCA);
  ms = await apretar(pe, pe.locator("[data-confirmar-inicio]"), /Guardando…/);
  if (await pe.locator("[data-checkin-otro-dia]").count()) ms += await apretar(pe, pe.locator("[data-confirmar-inicio]"), /Guardando…/);
  await espera(INMEDIATO_MS);
  const enCurso = (await pe.getByRole("button", { name: "Finalizar cita" }).count()) > 0;
  const sigueGuardando = (await pe.getByRole("button", { name: /Guardando…/ }).count()) > 0;
  comprobar(enCurso && !sigueGuardando, `«Confirmar inicio» → en ${ms} ms la pantalla ya ofrece «Finalizar cita» y ningún botón dice «Guardando…»`);
  comprobar(!(await errores(pe)), "sin errores en pantalla");

  seccion("Estética · finalizar: la cita queda finalizada con la respuesta");
  await pe.getByRole("button", { name: "Finalizar cita" }).click();
  const recoge = pe.locator("#cita-recoge-nombre");
  if (await recoge.count()) {
    await recoge.fill(MARCA);
    await pe.locator("[data-quien-recoge] button").first().click();
  }
  ms = await apretar(pe, pe.locator("[data-confirmar-cierre]"), /Guardando…/);
  await espera(INMEDIATO_MS);
  const finalizada = (await pe.getByRole("button", { name: "Finalizar cita" }).count()) === 0 && (await pe.locator("[data-confirmar-cierre]").count()) === 0;
  comprobar(finalizada && !(await errores(pe)), `«Confirmar cierre» → en ${ms} ms ya no ofrece finalizar y no hay error`);
  limpieza.unshift(async () => rpc(P.admin, "deshacer_inicio_cita", { p_cita_id: cita.id, p_destino: "cancelada", p_motivo: MARCA }));
  await pe.context().close();

  // ═══ Hotel / Guardería ═══
  // Una estancia de hotel en curso de un perro de prueba (como la arma cuenta-estancia-dev.mjs).
  let estancia = null;
  {
    const { c: ctxApi, api } = await abrirComo(nav, datos.adminB, B);
    await ctxApi.close();
    const hoyB = await hoy(P.admin);
    const { data: talla } = await SB.from("tamanos_categoria").select("id").eq("clave", "chico").single();
    const { data: hotel } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "hotel").eq("unidad", "noche").is("deleted_at", null).limit(1).single();
    const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${MARCA} ${String(semilla).slice(-5)}`, tamano_id: talla.id }).select("id").single()).data;
    limpieza.push(async () => SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", perro.id));
    const reserva = (await api.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    const est = await api.from("estancias").insert({
      reserva_id: reserva.id, perro_id: perro.id, servicio_id: hotel.id, fecha_entrada: hoyB, fecha_salida: sumaDias(hoyB, 2), dia_cerrado_confirmado: "confirmado",
      bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: MARCA, bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: MARCA,
    }).select("id, reserva_id").single();
    if (est.error) throw new Error(`estancia: ${est.error.message}`);
    estancia = est.data;
    limpieza.push(async () => api.from("estancias").update({ estado: "cancelada", motivo_cancelacion: MARCA }).eq("id", est.data.id));
  }
  if (!estancia) {
    comprobar(false, "Huellitas tiene una estancia en curso para el check-out (corre negocio-prueba-dev.mjs)");
  } else {
    const { p: ph } = await pantalla(P.recConId);
    seccion("Hotel/Guardería · check-in: «Check-in registrado» con la respuesta");
    await abrir(ph, `/reservas/estancias/${estancia.id}/checkin`);
    await ph.locator("#checkin-entrega-quien").selectOption({ index: 1 });
    const motivoCi = limpio(await ph.locator("[data-motivo-confirmar]").innerText().catch(() => ""));
    if (motivoCi) console.log(`    · falta para confirmar: ${motivoCi}`);
    ms = await apretar(ph, ph.locator("[data-confirmar-checkin]"));
    if (await confirmarSiFueraDeHorario(ph, 1500)) ms += await apretar(ph, ph.locator("[data-confirmar-checkin]").first()).catch(() => 0);
    if (await ph.locator("[data-confirmar-sobrecupo]").count()) await ph.locator("[data-confirmar-sobrecupo]").click();
    await ph.getByText("Check-in registrado").first().waitFor({ timeout: 20000 }).catch(() => {});
    await espera(INMEDIATO_MS);
    const enCursoBase = (await SB.from("estancias").select("estado").eq("id", estancia.id).single()).data?.estado;
    comprobar(enCursoBase === "en_curso" && (await ph.getByText("Check-in registrado").count()) > 0 && !(await errores(ph)), `en ${ms} ms dice «Check-in registrado» (base: ${enCursoBase}) y no hay error`);
    comprobar((await ph.getByRole("button", { name: /Guardando…|Registrando…/ }).count()) === 0, "el botón se liberó");

    seccion("Hotel/Guardería · check-out: cargos de la cuenta, base rotulada y salida con la respuesta (N144)");
    await abrir(ph, `/reservas/estancias/${estancia.id}/checkout`);
    const total = async () => Number((await ph.locator("[data-total-estancia]").first().getAttribute("data-total-estancia").catch(() => "NaN")) ?? NaN);
    const antes = await total();
    const seccionCargos = limpio(await ph.getByText("Cargos aplicados", { exact: true }).locator("xpath=..").innerText().catch(() => ""));
    comprobar(/Base de la estancia/.test(seccionCargos), `la línea de la estancia dice «Base de la estancia» («${seccionCargos.slice(0, 120)}»)`);
    const filasAntes = Number((await ph.locator("[data-cargos-aplicados]").getAttribute("data-cargos-aplicados").catch(() => "0")) ?? 0);
    // Un cargo de monto libre si lo hay (no depende de la matriz), si no el primero.
    const opciones = await ph.getByLabel("Aplicar cargo").locator("option").allInnerTexts();
    const libre = opciones.findIndex((o) => /comida|especial|libre/i.test(o));
    await ph.getByLabel("Aplicar cargo").selectOption({ index: Math.max(0, libre) });
    if (await ph.getByLabel("Importe").count()) {
      await ph.getByLabel("Importe").fill("37");
      await ph.getByLabel("Qué se le dio").fill(MARCA);
    } else {
      await ph.getByLabel("Notas (opcional)").first().fill(MARCA);
    }
    ms = await apretar(ph, ph.locator("[data-aplicar-cargo]"), /Aplicando…/);
    await espera(INMEDIATO_MS);
    const despues = await total();
    const filasDespues = Number((await ph.locator("[data-cargos-aplicados]").getAttribute("data-cargos-aplicados").catch(() => "0")) ?? 0);
    const { data: cargo } = await SB.from("cargos_aplicados").select("id, precio, cantidad").eq("estancia_id", estancia.id).order("created_at", { ascending: false }).limit(1).single();
    const esperado = Math.round((antes + Number(cargo.precio) * Number(cargo.cantidad)) * 100) / 100;
    comprobar(filasDespues === filasAntes + 1 && !(await ph.locator("[data-sin-cargos]").count()), `en ${ms} ms el cargo ya está en la lista (${filasAntes} → ${filasDespues}) y no dice «Ninguno todavía»`);
    comprobar(despues === esperado, `y el total de la estancia ya es $${esperado} con la respuesta (dice $${despues}; antes $${antes})`);
    comprobar(!(await errores(ph)), "sin errores en pantalla");
    limpieza.unshift(async () => SB.from("cargos_aplicados").update({ cancelado: true, motivo_cancelacion: MARCA }).eq("id", cargo.id));

    // La salida: «Salida registrada» con la respuesta.
    await ph.locator("#checkout-recoge-nombre").fill(MARCA);
    await ph.getByRole("button", { name: "Sí, es el dueño" }).click();
    if (await ph.locator("[data-entregue-todo]").count()) await ph.locator("[data-entregue-todo]").click();
    ms = await apretar(ph, ph.getByRole("button", { name: /^(Confirmar salida|Guardando…|Registrando…)$/ }));
    if (await confirmarSiFueraDeHorario(ph, 1500)) ms += 0;
    await ph.getByText(/Salida registrada/).first().waitFor({ timeout: 20000 }).catch(() => {});
    await espera(INMEDIATO_MS);
    const salioBase = (await SB.from("estancias").select("estado").eq("id", estancia.id).single()).data?.estado;
    comprobar(salioBase === "finalizada" && (await ph.getByText(/Salida registrada/).count()) > 0 && !(await errores(ph)), `«Confirmar salida» → «Salida registrada» con la respuesta (base: ${salioBase}) y sin error`);

    // QA R54 (N144): el detalle de la estancia ya finalizada lista sus cargos de la cuenta, con la base primero y cada
    // cargo una sola vez (antes: «Cargos aplicados: Ninguno todavía» encima de la base, o el cargo dos veces).
    seccion("Hotel/Guardería · detalle de la estancia finalizada: base, cargos de la cuenta y total (N144)");
    await abrir(ph, `/reservas/${estancia.reserva_id}`);
    const bloqueDetalle = limpio(await ph.locator("div").filter({ has: ph.locator("[data-base-estancia]") }).filter({ hasText: /cargos aplicados/i }).last().innerText().catch(() => ""));
    const tD = bloqueDetalle.toLowerCase();
    const montoCargo = `$${(Number(cargo.precio) * Number(cargo.cantidad)).toFixed(2)}`;
    const vecesCargo = bloqueDetalle.split(montoCargo).length - 1;
    comprobar(tD.indexOf("base de la estancia") >= 0 && tD.indexOf("cargos aplicados") > tD.indexOf("base de la estancia"), `«Base de la estancia» va antes que «Cargos aplicados» («${bloqueDetalle.slice(0, 140)}»)`);
    comprobar(!/ninguno todavía/i.test(bloqueDetalle) && vecesCargo === 1, `el cargo de ${montoCargo} sale una vez (${vecesCargo}) y no dice «Ninguno todavía»`);
    await ph.context().close();
  }

  // ═══ Veterinaria ═══
  seccion("Veterinaria · el mosaico «Expediente clínico» cuenta los borradores que hay (N139)");
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: datos.adminB, p_cedula: String(Date.now()).slice(-8), p_cpa: null });
  comprobar(med.ok, `el admin queda como médico de prueba${med.ok ? "" : ` (${med.mensaje})`}`);
  limpieza.push(async () => rpc(P.admin, "quitar_medico_veterinario", { p_medico_id: med.cuerpo }));
  const nueva = await rpc(P.admin, "vet_consulta_iniciar", { p_perro: datos.perroSoloB, p_cita: null, p_tipo: "consulta", p_medico: null });
  comprobar(nueva.ok, `consulta en borrador creada${nueva.ok ? "" : ` (${nueva.mensaje})`}`);
  const consultaId = nueva.cuerpo;
  await rpc(P.admin, "vet_consulta_guardar", { p_id: consultaId, p_datos: { motivo: MARCA, diagnosticos: [{ ref_id: null, origen: "libre", nombre: MARCA, tipo: "presuntivo", nota: "" }] } });
  // Sus cargos con precio (sin tocar el catálogo), para que se pueda firmar.
  const cargosConsulta = await rpc(P.admin, "vet_consulta_cargos", { p_consulta: consultaId });
  for (const l of cargosConsulta.cuerpo?.lineas ?? cargosConsulta.cuerpo?.cargos ?? []) {
    if (l.precio == null || l.sin_precio) await rpc(P.admin, "vet_consulta_cargo_precio", { p_id: l.id, p_precio: 1, p_guardar_catalogo: false });
  }
  const { count: borradores } = await SB.from("vet_consultas").select("id", { count: "exact", head: true }).eq("negocio_id", B).eq("estado", "borrador").is("deleted_at", null);
  const { p: pv } = await pantalla(datos.adminB);
  await abrir(pv, "/veterinaria");
  const mosaico = limpio(await pv.locator("a", { hasText: "Expediente clínico" }).first().innerText().catch(() => ""));
  const enMosaico = Number((mosaico.match(/(\d+) sin firmar/) ?? [])[1] ?? NaN);
  comprobar(enMosaico === borradores, `el mosaico dice «${enMosaico} sin firmar» con ${borradores} borrador(es) en la base (uno de hoy)`);

  seccion("Veterinaria · firmar: la consulta dice «Firmada» con la respuesta (N140)");
  await abrir(pv, `/veterinaria/consulta/${consultaId}`);
  // Como QA en producción: se escribe en la consulta y se firma enseguida (el autoguardado del borrador también responde).
  await pv.getByLabel("Motivo de la consulta").fill(`${MARCA} escrito justo antes de firmar`);
  await pv.getByRole("button", { name: "Firmar la consulta" }).click();
  // Primero se guarda lo escrito y después se firma: se espera al aviso «Consulta firmada», que llega con la respuesta,
  // y en ese mismo instante se lee la insignia (la recarga de la página tarda 3 s más).
  const t0Firma = Date.now();
  await pv.getByRole("button", { name: /^(Sí, firmar|Firmando…)$/ }).click();
  await pv.locator("[data-consulta-firmada]").waitFor({ timeout: 30000 }).catch(() => {});
  ms = Date.now() - t0Firma;
  const insignia = limpio(await pv.locator("main span.rounded-full", { hasText: /^(Borrador|Firmada|Anulada)$/ }).first().innerText().catch(() => ""));
  const enBase = (await SB.from("vet_consultas").select("estado").eq("id", consultaId).single()).data?.estado;
  comprobar(enBase === "firmada" && insignia === "Firmada", `en ${ms} ms la base dice ${enBase} y la pantalla «${insignia}» (sin recargar)`);
  const errFirma = await errores(pv);
  comprobar((await pv.getByRole("button", { name: /Firmando…|Guardando…/ }).count()) === 0 && !errFirma, `ningún botón sigue ocupado y no hay error${errFirma ? ` («${errFirma.slice(0, 200)}»)` : ""}`);
  if (errFirma) await pv.screenshot({ path: `${process.env.TEMP ?? "/tmp"}/acciones-pantalla-firma.png`, fullPage: true });
  await pv.context().close();

  // ═══ Caja ═══
  seccion("Caja · cobrar: «Cobrado» y el saldo con la respuesta");
  await rpc(P.admin, "elegir_proveedor_cobro", { p_proveedor: "manual" });
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("negocio_id", B).eq("estado", "abierto").maybeSingle();
  if (!turno) {
    const r = await post(P.recCon, "turnos_caja", { fondo_inicial: 100, notas_apertura: MARCA });
    comprobar(r.ok, `turno de caja abierto${r.ok ? "" : ` (${r.mensaje})`}`);
  }
  const venta = await rpc(P.admin, "crear_venta_mostrador", { p_cliente_id: datos.clienteSoloB, p_lineas: [{ concepto: MARCA, precio: 41, cantidad: 1 }], p_notas: MARCA });
  comprobar(venta.ok, `cuenta de mostrador de $41 creada${venta.ok ? "" : ` (${venta.mensaje})`}`);
  const { p: pc } = await pantalla(P.recConId);
  await abrir(pc, `/caja/cobrar/${venta.cuerpo}`);
  ms = await apretar(pc, pc.getByRole("button", { name: /Registrar cobro|Cobrando|Actualizando/ }).first(), /Cobrando|Actualizando/);
  await pc.getByText("Cobro registrado.").first().waitFor({ timeout: 20000 }).catch(() => {});
  const tc = limpio(await pc.locator("body").innerText());
  comprobar(/Cobrado:\s*\$41\.00/.test(tc) && /Saldo:\s*\$0\.00/.test(tc), `en ${ms} ms dice «Cobrado: $41.00» y «Saldo: $0.00» sin esperar la recarga`);
  comprobar(!(await errores(pc)), "sin errores en pantalla");
  await pc.context().close();
} catch (e) {
  comprobar(false, `la auditoría se cortó: ${e.message.split("\n").slice(0, 3).join(" | ")}`);
  for (const c of nav.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: `${process.env.TEMP ?? "/tmp"}/acciones-pantalla-corte.png`, fullPage: true }).catch(() => {});
} finally {
  for (const f of limpieza) await f().catch(() => {});
  await nav.close();
}
terminar();
