// Hallazgos de la QA externa del 15 de octubre de 2026, EN PANTALLA (SOLO DESARROLLO, Huellitas).
// Con el servidor compilado en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/qa-hallazgos-ui-dev.mjs
//
// B4. La consulta sin precio no se firma: «Precio de esta consulta», «Guardar como precio de catálogo» (solo con permiso)
//     y «Sin cobro» con motivo.
// B13. «Aplicar vacuna» aparte de «Otro procedimiento»; una vacuna escrita como procedimiento avisa.
// B15. Labrador: la forma del perro sugiere tamaño y pelaje y no lo llama «mestizo».
// B14/6. El check-out de guardería no enseña la salida del día siguiente; los datos de quien entrega/recoge se ven obligatorios;
//     el monto del cobro abre con el saldo.
import { createClient } from "@supabase/supabase-js";
import { B, SB, A, URL, env, datos, rpc, personas, dar, quitar, fijarModulo, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { campoNombreDelPerro } from "../lib/alta-mascota.mjs";

const REF = new globalThis.URL(URL).hostname.split(".")[0];
const sufijo = String(Date.now()).slice(-6);
const P = await personas();

async function cookiesDe(profileId, host) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: host, path: "/" }));
}
const comoAdmin = async () => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${P.admin}`, "x-negocio-id": B } } });
const nav = await abrirNavegador();
const abrir = async (profileId, ancho = 1100) => {
  const c = await nav.newContext({ viewport: { width: ancho, height: 900 } });
  if (profileId) await c.addCookies(await cookiesDe(profileId, "huellitas.localhost"));
  const p = await c.newPage();
  p.setDefaultTimeout(45000);
  p.on("dialog", (d) => d.accept());
  return { c, p };
};
const texto = async (p) => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const esperarTexto = async (p, re, ms = 25000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (re.test(await texto(p))) return true;
    await p.waitForTimeout(400);
  }
  return false;
};
const BASE = "http://huellitas.localhost:3001";
const medicosCreados = [];
const limpieza = [];
const servicioId = async (clave) => (await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", clave).is("deleted_at", null).single()).data.id;
const quitarPrecio = async (clave) => {
  const id = await servicioId(clave);
  await SB.from("tarifas").update({ deleted_at: new Date().toISOString() }).eq("servicio_id", id).is("deleted_at", null);
};
const nuevoPerro = async (nombre) => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${nombre} ${sufijo}`, especie: "perro" }).select("id").single();
  if (r.error) throw new Error(r.error.message);
  limpieza.push(async () => { await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", r.data.id); });
  return r.data.id;
};

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  await rpc(P.admin, "vet_asegurar_servicios");
  await quitarPrecio("vet_consulta_general");
  await quitar(P.admin, P.recConId, "tarifas");
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: String(Date.now()).slice(-7), p_cpa: null });
  medicosCreados.push(med.cuerpo);
  const nueva = async (nombre) => {
    const perro = await nuevoPerro(nombre);
    const ini = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: med.cuerpo });
    await rpc(P.recCon, "vet_consulta_guardar", { p_id: ini.cuerpo, p_datos: { motivo: "Revisión", diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Otitis", tipo: "presuntivo", nota: "" }] } });
    return { perro, id: ini.cuerpo };
  };

  // ── B4: sin precio no se firma ──────────────────────────────────
  seccion("B4. Sin precio no se firma: se pone el precio aquí mismo");
  const c1 = await nueva("SinPrecio");
  let { c, p } = await abrir(P.recConId);
  await p.goto(`${BASE}/veterinaria/consulta/${c1.id}`, { waitUntil: "domcontentloaded" });
  comprobar(await esperarTexto(p, /Precio de esta consulta: falta el de/), "el cargo sin precio muestra «Precio de esta consulta»");
  comprobar((await p.locator("[data-precio-faltante]").count()) === 1, "con su recuadro de precio");
  await p.getByRole("button", { name: "Firmar la consulta" }).click();
  await p.locator("[data-confirmar-firma]").getByRole("button", { name: "Sí, firmar" }).click({ timeout: 3000 }).catch(() => {});
  comprobar(await esperarTexto(p, /Falta el precio de un cargo/), "firmar sin precio avisa y NO firma");
  comprobar((await SB.from("vet_consultas").select("estado").eq("id", c1.id).single()).data.estado === "borrador", "la consulta sigue en borrador");
  await p.getByRole("button", { name: "Poner el precio" }).click();
  comprobar((await p.getByText("Guardar como precio de catálogo").count()) === 0, "sin «Precios y tarifas» no se ofrece guardarlo como precio de catálogo");
  await p.getByLabel("Precio de esta consulta ($)").fill("600");
  await p.getByRole("button", { name: "Guardar el precio" }).click();
  comprobar(await esperarTexto(p, /\$600/), "con el precio puesto la línea muestra $600");
  comprobar((await p.locator("[data-precio-faltante]").count()) === 0, "y el recuadro desaparece");
  await p.getByRole("button", { name: "Firmar la consulta" }).click();
  await p.locator("[data-confirmar-firma]").getByRole("button", { name: "Sí, firmar" }).click({ timeout: 3000 }).catch(() => {});
  comprobar(await esperarTexto(p, /Cobro de esta consulta/), "ahora sí se firma y aparece «Cobro de esta consulta»");
  comprobar((await p.getByRole("link", { name: /Abrir la cuenta en Caja/ }).count()) > 0, "con el enlace a la cuenta en Caja");
  const reserva1 = (await SB.from("vet_consulta_cargos").select("cargo_id").eq("consulta_id", c1.id).eq("negocio_id", B).single()).data.cargo_id;
  const res1 = (await SB.from("cargos_aplicados").select("reserva_id, precio").eq("id", reserva1).single()).data;
  comprobar(Number(res1.precio) === 600, "en la cuenta quedó por $600");
  await c.close();

  // «Sin cobro» con motivo.
  const c2 = await nueva("SinCobro");
  ({ c, p } = await abrir(P.recConId));
  await p.goto(`${BASE}/veterinaria/consulta/${c2.id}`, { waitUntil: "domcontentloaded" });
  await esperarTexto(p, /Precio de esta consulta: falta el de/);
  await p.getByRole("button", { name: "Sin cobro" }).click();
  await p.getByRole("button", { name: "Marcar sin cobro" }).click();
  comprobar(await esperarTexto(p, /Escribe por qué no se cobra/), "«Sin cobro» pide su motivo");
  await p.getByLabel("Motivo de «Sin cobro» (obligatorio)").fill("Seguimiento incluido");
  await p.getByRole("button", { name: "Marcar sin cobro" }).click();
  comprobar(await esperarTexto(p, /quitado: Sin cobro: Seguimiento incluido/), "queda a la vista con su motivo");
  await p.getByRole("button", { name: "Firmar la consulta" }).click();
  await p.locator("[data-confirmar-firma]").getByRole("button", { name: "Sí, firmar" }).click({ timeout: 3000 }).catch(() => {});
  await esperarTexto(p, /Cobro de esta consulta/);
  comprobar((await SB.from("vet_consultas").select("estado").eq("id", c2.id).single()).data.estado === "firmada", "con «Sin cobro» la consulta se firma");
  comprobar((await p.getByRole("link", { name: /Abrir la cuenta en Caja/ }).count()) === 0, "y no se crea cuenta con importes vacíos");
  await c.close();

  // Con permiso, guardarlo como precio de catálogo.
  const c3 = await nueva("Catalogo");
  ({ c, p } = await abrir(datos.adminB));
  await p.goto(`${BASE}/veterinaria/consulta/${c3.id}`, { waitUntil: "domcontentloaded" });
  await esperarTexto(p, /Precio de esta consulta: falta el de/);
  await p.getByRole("button", { name: "Poner el precio" }).click();
  comprobar((await p.getByText("Guardar como precio de catálogo").count()) > 0, "admin sí ve «Guardar como precio de catálogo»");
  // Mejora de B4: con permiso y sin precio en el catálogo, «Guardar como precio de catálogo» ya viene marcado.
  comprobar(await p.getByLabel(/Guardar como precio de catálogo/).isChecked(), "y viene MARCADO (el catálogo no tiene precio para ese servicio)");
  await p.getByLabel("Precio de esta consulta ($)").fill("650");
  await p.getByRole("button", { name: "Guardar el precio" }).click();
  comprobar(await esperarTexto(p, /\$650/), "el precio queda en la línea");
  const sid = await servicioId("vet_consulta_general");
  const vig = (await SB.from("tarifas_vigentes").select("precio").eq("servicio_id", sid)).data ?? [];
  comprobar(vig.length === 1 && Number(vig[0].precio) === 650, "y en el catálogo de Servicios y precios ($650)");
  comprobar((await p.getByText("Aplicar vacuna").count()) > 0, "B13: la consulta tiene su botón «Aplicar vacuna»");
  // ── B13 ─────────────────────────────────────────────────────────
  seccion("B13. «Aplicar vacuna» aparte de «Otro procedimiento»");
  const resumen = p.getByRole("button", { name: "Aplicar vacuna", exact: true });
  comprobar((await resumen.count()) === 1, "«Aplicar vacuna» es un botón real (rol button) y su propio apartado");
  await resumen.click();
  comprobar((await p.locator("[data-aplicar-vacuna]").getByRole("button", { name: "Registrar vacuna" }).count()) === 1, "con el formulario del carnet (lote, fecha y médico)");
  comprobar((await p.getByLabel("Cantidad aplicada (opcional)").count()) === 1 && (await p.getByLabel("Próxima dosis (opcional)").count()) === 1, "«Cantidad aplicada» y «Próxima dosis» tienen nombres accesibles distintos");
  await p.getByText("Agregar un procedimiento o medicamento").click();
  await p.getByLabel("Qué agregas").selectOption("libre");
  await p.getByLabel("Concepto").fill("Vacuna antirrábica");
  comprobar(await esperarTexto(p, /Eso es una vacuna: no va como procedimiento/), "escribir una vacuna como procedimiento avisa y manda a «Aplicar vacuna»");
  await p.getByRole("button", { name: "Agregar al cobro" }).click();
  comprobar(await esperarTexto(p, /es una vacuna: no va como procedimiento/), "y la base lo rechaza si se insiste");
  await c.close();

  // ── B15: Labrador ───────────────────────────────────────────────
  seccion("B15. Labrador: tamaño y pelaje sugeridos, sin llamarlo mestizo");
  ({ c, p } = await abrir(datos.adminB));
  await p.goto(`${BASE}/clientes/${datos.clienteSoloB}/perros/nuevo`, { waitUntil: "networkidle" });
  await p.locator('input[role="combobox"]').fill("labrador");
  await p.waitForTimeout(400);
  await p.locator("[role=listbox] [role=option]").first().click();
  await p.waitForTimeout(400);
  const tam = await p.locator('select[name="tamano_id"]').evaluate((s) => s.selectedOptions[0]?.textContent ?? "");
  const pel = await p.locator('select[name="pelaje_id"]').evaluate((s) => s.selectedOptions[0]?.textContent ?? "");
  comprobar(/Grande/.test(tam) && /Corto/.test(pel), `el formulario sugiere Grande y Corto (${tam} · ${pel})`);
  const tB = await texto(p);
  comprobar(/Labrador retriever no tiene un precio propio/.test(tB) && !/Es mestizo o sin raza de catálogo/.test(tB), "dice que se cobra por tamaño y pelaje, no que es mestizo");
  comprobar(/se cobra por tamaño y pelaje/.test(tB), "y el aviso del grupo habla de tamaño y pelaje");
  await c.close();

  // ── 7: B18, lo que falta se marca en el campo ──────────────────────
  seccion("B18. Estética: «Quién recoge/entrega» marca el campo y dice qué falta");
  {
    const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
    const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
    const { data: razasC } = await A.from("razas").select("id, nombre");
    const { data: srvs } = await SB.from("servicios").select("id, clave").eq("negocio_id", B).eq("categoria", "estetica").is("deleted_at", null);
    const perroE = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `QH est ${sufijo}`, raza: "Poodle", raza_id: razasC.find((r) => r.nombre === "Poodle").id, tamano_id: tallas.find((t) => t.clave === "chico").id, pelaje_id: pelajes.find((t) => t.clave === "medio").id }).select("id").single()).data;
    limpieza.push(async () => { await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", perroE.id); });
    const rr = (await SB.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    const dia = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    const cita = await SB.from("citas_estetica").insert({ reserva_id: rr.id, perro_id: perroE.id, servicio_id: srvs.find((x) => x.clave === "estetica_estetico").id, empleado_id: datos.esteticaB, inicio: `${dia}T11:00:00-06:00` }).select("id").single();
    if (cita.error) throw new Error(`cita: ${cita.error.message}`);
    limpieza.push(async () => { await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).eq("id", cita.data.id); });
    ({ c, p } = await abrir(datos.adminB, 390));
    await p.goto(`${BASE}/estetica/${cita.data.id}`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Iniciar cita" }).click();
    // QA S16 (N69): lo obligatorio se marca ANTES del clic (asterisco y texto) y el botón dice qué falta.
    const campoEntrega = p.locator("#cita-entrega-nombre");
    comprobar(/\*\s*\(obligatorio\)/.test(await p.locator('label[for="cita-entrega-nombre"]').innerText()), "«Quién entrega» lleva asterisco y «(obligatorio)» antes de apretar nada");
    comprobar(await p.getByRole("button", { name: "Confirmar inicio" }).isDisabled(), "«Confirmar inicio» está deshabilitado mientras falta quién entrega");
    comprobar(/Falta: quién entrega al perro/.test(await p.locator("[data-motivo-confirmar]").innerText()), "y dice por qué junto al botón");
    await campoEntrega.fill("Ana Prueba");
    comprobar(await p.getByRole("button", { name: "Confirmar inicio" }).isEnabled() && (await p.locator("[data-motivo-confirmar]").count()) === 0, "al escribirlo, el botón se activa y el motivo se va");
    await p.getByRole("button", { name: "Confirmar inicio" }).click();
    // La cita es de otro día: desde S14 pide confirmar antes de recibirla.
    await esperarTexto(p, /Finalizar cita|recibirla de todos modos/);
    const otroDia = p.getByRole("button", { name: /recibirla de todos modos/ });
    if (await otroDia.count()) await otroDia.first().click();
    await esperarTexto(p, /Finalizar cita/);
    await p.getByRole("button", { name: "Finalizar cita" }).click();
    const campoRecoge = p.locator("#cita-recoge-nombre");
    comprobar(await p.getByRole("button", { name: "Confirmar cierre" }).isDisabled(), "«Confirmar cierre» está deshabilitado mientras falta quién recoge");
    comprobar(/quién recoge al perro y si es el dueño registrado/.test(await p.locator("[data-motivo-confirmar]").innerText()), "y dice las dos cosas que faltan");
    comprobar(!(await texto(p)).includes("No se pudo completar la acción"), "sin el aviso genérico «No se pudo completar la acción»");
    await campoRecoge.fill("Luis Prueba");
    comprobar(/si es el dueño registrado/.test(await p.locator("[data-motivo-confirmar]").innerText()) && (await p.getByRole("button", { name: "Confirmar cierre" }).isDisabled()), "con el nombre, sigue pidiendo si es el dueño");
    await p.getByRole("button", { name: "Sí, es el dueño" }).click();
    await p.getByRole("button", { name: "Confirmar cierre" }).click();
    await esperarTexto(p, /Recogió|Finalizada/);
    comprobar((await SB.from("citas_estetica").select("estado").eq("id", cita.data.id).single()).data.estado === "finalizada", "con todo lleno, la cita se cierra");
    await c.close();
    // Check-in y check-out de guardería: mismo trato.
    const { data: gD } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
    const diaG = (() => { let d = new Date(Date.now() + 60 * 86400000); while (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); })();
    const cliente = await comoAdmin();
    const rG = (await cliente.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    const eG = await cliente.from("estancias").insert({ reserva_id: rG.id, perro_id: perroE.id, servicio_id: gD.id, fecha_entrada: diaG, fecha_salida: new Date(new Date(`${diaG}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10), bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" }).select("id").single();
    if (eG.error) throw new Error(`estancia: ${eG.error.message}`);
    limpieza.push(async () => { await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", eG.data.id); });
    ({ c, p } = await abrir(datos.adminB, 390));
    await p.goto(`${BASE}/reservas/estancias/${eG.data.id}/checkin`, { waitUntil: "networkidle" });
    comprobar(/\*\s*\(obligatorio\)/.test(await p.locator('label[for="checkin-entrega-quien"]').innerText()), "check-in: «Quién entrega» lleva asterisco y «(obligatorio)»");
    comprobar(await p.locator("[data-confirmar-checkin]").isDisabled() && /Falta: escoge quién entrega/.test(await p.locator("[data-motivo-confirmar]").innerText()), "check-in de guardería/hotel: «Confirmar check-in» deshabilitado y dice qué falta");
    await c.close();
  }

  // ── B19: la hora que propone «Agendar» ──────────────────────────
  seccion("B19. «Agendar» propone una hora que todavía no pasa");
  {
    const zona = (await SB.from("negocios").select("zona_horaria").eq("id", B).single()).data.zona_horaria;
    ({ c, p } = await abrir(datos.adminB, 390));
    await p.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
    const nombreCliente = (await SB.from("clientes").select("nombre").eq("id", datos.clienteSoloB).single()).data.nombre;
    await p.locator("input[type=text], input[type=search], input:not([type])").first().fill(nombreCliente);
    await p.waitForTimeout(500);
    await p.locator("button", { hasText: nombreCliente }).first().click();
    const valor = await p.locator('input[type="datetime-local"]').first().inputValue();
    const ahoraLocal = new Intl.DateTimeFormat("en-CA", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date());
    const g = (t) => ahoraLocal.find((x) => x.type === t).value;
    const ahora = `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
    comprobar(valor > ahora, `la hora propuesta (${valor}) es posterior a ahora (${ahora}, ${zona})`);
    comprobar(/T\d{2}:(00|30)$/.test(valor), "y cae en media hora (N116)");
    await c.close();
    // La agenda clínica (Veterinaria) usa la MISMA función: ya no abre con las 09:00 fijas.
    const perroV = await nuevoPerro("HoraVet");
    ({ c, p } = await abrir(datos.adminB, 390));
    await p.goto(`${BASE}/veterinaria/agenda/nueva?perro=${perroV}`, { waitUntil: "networkidle" });
    const fV = await p.locator('input[name="fecha"]').inputValue();
    const hV = await p.locator('input[name="hora"]').inputValue();
    comprobar(`${fV}T${hV}` === valor, `la agenda clínica propone la misma hora (${fV} ${hV})`);
    await c.close();
    // N116: ?fecha= manda, también cuando se llega por el expediente abierto desde un día de la agenda.
    const futura = new Date(Date.now() + 5 * 86_400_000).toLocaleDateString("en-CA", { timeZone: zona });
    ({ c, p } = await abrir(datos.adminB, 390));
    await p.goto(`${BASE}/veterinaria/agenda/nueva?perro=${perroV}&fecha=${futura}`, { waitUntil: "networkidle" });
    comprobar((await p.locator('input[name="fecha"]').inputValue()) === futura, `con ?fecha=${futura} abre en ese día`);
    await p.goto(`${BASE}/veterinaria/expediente/${perroV}?fecha=${futura}`, { waitUntil: "networkidle" });
    await p.locator("a", { hasText: "Agendar cita" }).first().click();
    await p.waitForURL(/agenda\/nueva/);
    await p.waitForLoadState("networkidle");
    comprobar((await p.locator('input[name="fecha"]').inputValue()) === futura, "desde el expediente (abierto desde ese día) también");
    await c.close();
  }

  // ── Aviso de «fuera de horario» al agendar (QA B20) ─────────────
  seccion("B20. Aviso de cita fuera de horario, en Estética y en la agenda clínica");
  {
    const adm = await comoAdmin();
    // Un martes lejano; el horario de ese día sale de la base.
    let dia = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    while (new Date(`${dia}T12:00:00Z`).getUTCDay() !== 2) dia = new Date(new Date(`${dia}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
    const hz = (await adm.rpc("resolver_cupo_configuracion", { p_fecha: dia })).data;
    const fh = Array.isArray(hz) ? hz[0] : hz;
    const [ah, am] = String(fh.hora_apertura).split(":").map(Number);
    const [ch, cm] = String(fh.hora_cierre).split(":").map(Number);
    const abre = ah * 60 + am, cierra = ch * 60 + cm;
    const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const { data: srvs } = await SB.from("servicios").select("nombre, duracion_minutos").eq("negocio_id", B).eq("categoria", "estetica").is("deleted_at", null);
    const durMax = Math.max(...(srvs ?? []).map((x) => x.duracion_minutos ?? 60));
    const nombreCliente = (await SB.from("clientes").select("nombre").eq("id", datos.clienteSoloB).single()).data.nombre;
    for (const ancho of [390, 1280]) {
      ({ c, p } = await abrir(datos.adminB, ancho));
      await p.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
      await p.locator("input[type=text], input[type=search], input:not([type])").first().fill(nombreCliente);
      await p.waitForTimeout(500);
      await p.locator("button", { hasText: nombreCliente }).first().click();
      const campo = p.locator('input[type="datetime-local"]').first();
      await campo.waitFor();
      const aviso = p.locator("[data-aviso-horario]");
      const textoAviso = async () => ((await aviso.count()) ? (await aviso.first().innerText()).replace(/\s+/g, " ") : "");
      // Dentro del horario: sin aviso.
      await campo.fill(`${dia}T${hhmm(abre + 60)}`);
      comprobar((await aviso.count()) === 0, `${ancho}px: dentro del horario no hay aviso`);
      // Termina después del cierre: la hora de inicio deja menos de la duración del servicio elegido.
      await campo.fill(`${dia}T${hhmm(cierra - 15)}`);
      const t1 = await textoAviso();
      comprobar(/Fuera de horario/.test(t1) && /después del cierre/.test(t1), `${ancho}px: empieza 15 min antes del cierre → avisa (${t1.slice(0, 90)})`);
      // Antes de abrir.
      await campo.fill(`${dia}T${hhmm(abre - 60)}`);
      const t2 = await textoAviso();
      comprobar(/antes de la apertura/.test(t2), `${ancho}px: antes de abrir → avisa (${t2.slice(0, 90)})`);
      // Se actualiza al volver al horario, y sin bloquear el botón de agendar por el aviso.
      await campo.fill(`${dia}T${hhmm(abre + 60)}`);
      comprobar((await aviso.count()) === 0, `${ancho}px: al volver al horario el aviso se va`);
      // Cambiar la fecha a un domingo (cerrado): lo dice.
      let dom = dia;
      while (new Date(`${dom}T12:00:00Z`).getUTCDay() !== 0) dom = new Date(new Date(`${dom}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
      const hd = (await adm.rpc("resolver_cupo_configuracion", { p_fecha: dom })).data;
      const fd = Array.isArray(hd) ? hd[0] : hd;
      await campo.fill(`${dom}T10:00`);
      if (!fd?.hora_apertura) comprobar(/no abre/.test(await textoAviso()), `${ancho}px: domingo cerrado → «Ese día el negocio no abre»`);
      // Sin desborde.
      await campo.fill(`${dia}T${hhmm(cierra - 15)}`);
      comprobar((await p.evaluate(() => document.documentElement.scrollWidth)) <= ancho + 2, `${ancho}px: sin desborde con el aviso`);
      // Cambiar de servicio recalcula con su duración (si hay servicios de distinta duración).
      const selServicio = p.getByLabel("Servicio").first();
      if (await selServicio.count()) {
        const opciones = await selServicio.locator("option").allTextContents();
        if (opciones.length > 1 && new Set((srvs ?? []).map((x) => x.duracion_minutos ?? 60)).size > 1) {
          const antes = await textoAviso();
          await selServicio.selectOption({ index: opciones.length - 1 });
          const despues = await textoAviso();
          comprobar(antes !== despues || durMax <= 60, `${ancho}px: al cambiar el servicio el aviso se recalcula`);
        }
      }
      await c.close();
    }
    // Agenda clínica: tipo, fecha, hora y duración.
    const perroH = await nuevoPerro("HorarioVet");
    for (const ancho of [390, 1280]) {
      ({ c, p } = await abrir(datos.adminB, ancho));
      await p.goto(`${BASE}/veterinaria/agenda/nueva?perro=${perroH}`, { waitUntil: "networkidle" });
      const aviso = p.locator("[data-aviso-horario]");
      await p.locator('input[name="fecha"]').fill(dia);
      await p.locator('input[name="hora"]').fill(hhmm(abre + 60));
      comprobar((await aviso.count()) === 0, `agenda clínica ${ancho}px: dentro del horario no hay aviso`);
      await p.locator('input[name="hora"]').fill(hhmm(cierra - 10));
      const tv = (await aviso.count()) ? (await aviso.first().innerText()).replace(/\s+/g, " ") : "";
      comprobar(/después del cierre/.test(tv), `agenda clínica ${ancho}px: termina después del cierre → avisa (${tv.slice(0, 80)})`);
      // La duración manual cambia el aviso: 5 minutos cabe, 300 no.
      await p.locator('input[name="hora"]').fill(hhmm(cierra - 30));
      await p.locator('input[name="duracion"]').fill("5");
      comprobar((await aviso.count()) === 0, `agenda clínica ${ancho}px: con duración de 5 min cabe y no avisa`);
      await p.locator('input[name="duracion"]').fill("300");
      comprobar((await aviso.count()) === 1, `agenda clínica ${ancho}px: con 300 min avisa`);
      await p.locator('input[name="hora"]').fill(hhmm(abre - 60));
      comprobar(/antes de la apertura/.test((await aviso.first().innerText())), `agenda clínica ${ancho}px: antes de abrir → avisa`);
      comprobar((await p.evaluate(() => document.documentElement.scrollWidth)) <= ancho + 2, `agenda clínica ${ancho}px: sin desborde`);
      await c.close();
    }
  }

  // ── 6: obligatorios y monto del cobro ───────────────────────────
  seccion("6. Quién entrega/recoge obligatorios y el monto abre con el saldo");
  // La cuenta de la consulta de B4 (600) en Caja, con turno abierto.
  const reservaId = res1.reserva_id;
  const abiertoAntes = (await SB.from("turnos_caja").select("id").eq("negocio_id", B).eq("estado", "abierto").maybeSingle()).data;
  ({ c, p } = await abrir(datos.adminB));
  await p.goto(`${BASE}/caja/cobrar/${reservaId}`, { waitUntil: "domcontentloaded" });
  if (!abiertoAntes) {
    await esperarTexto(p, /Abrir turno/);
    const fondo = p.getByLabel(/fondo/i).first();
    if (await fondo.count()) await fondo.fill("0");
    await p.getByRole("button", { name: /Abrir turno/ }).first().click();
    await esperarTexto(p, /Cobrar|Método/);
  }
  const monto = p.getByLabel("Monto", { exact: true }).first();
  await monto.waitFor();
  comprobar((await monto.inputValue()) === "600.00", `el Monto abre con el saldo pendiente (${await monto.inputValue()})`);
  await p.getByRole("button", { name: "+ Repartir en otro método" }).click();
  comprobar((await p.getByLabel("Monto", { exact: true }).first().inputValue()) === "600.00" && (await p.getByLabel("Monto", { exact: true }).nth(1).inputValue()) === "", "al repartir en otro método, el primero conserva el saldo y el nuevo abre vacío");
  await c.close();
  if (!abiertoAntes) {
    const t = (await SB.from("turnos_caja").select("id").eq("negocio_id", B).eq("estado", "abierto").maybeSingle()).data;
    if (t) {
      const r1 = (await rpc(P.admin, "cerrar_turno", { p_turno_id: t.id, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: "qa-hallazgos" })).cuerpo;
      const x = Array.isArray(r1) ? r1[0] : r1;
      if (x && !x.cerrado) await rpc(P.admin, "cerrar_turno", { p_turno_id: t.id, p_conteo_efectivo: x.esperado_efectivo, p_conteo_terminal: x.esperado_terminal, p_conteo_transferencia: x.esperado_transferencia, p_explicacion_diferencias: null, p_notas_cierre: "qa-hallazgos" });
    }
  }

  // ── N20, N31, N32: avisos de Nueva reserva de Hotel ─────────────
  seccion("N20/N31/N32. Los avisos de «Nueva reserva» de Hotel");
  {
    const perroN = await nuevoPerro("Aviso hotel");
    const sumar = (f, d) => { const x = new Date(`${f}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
    const hoyISO = new Date().toISOString().slice(0, 10);
    const dow = new Date(`${hoyISO}T12:00:00Z`).getUTCDay();
    const domingo = sumar(hoyISO, ((7 - dow) % 7) + 7); // un domingo futuro (Huellitas cierra los domingos)
    const lunes = sumar(domingo, 1);
    await quitar(P.admin, P.recSinId, "excepciones_reserva");
    for (const [quien, id] of [["admin", datos.adminB], ["recepción sin permiso", P.recSinId]]) {
      const { c, p } = await abrir(id);
      await p.goto(`${BASE}/hotel/nueva?cliente=${datos.clienteSoloB}`, { waitUntil: "domcontentloaded" });
      // El buscador muestra pocas filas sin escribir (Huellitas tiene muchos clientes): se busca por el perro.
      await p.locator("input:visible").first().fill(`Aviso hotel ${sufijo}`);
      await p.getByText(`Aviso hotel ${sufijo}`).first().click({ timeout: 30000 });
      const entrada = p.getByLabel("Entrada").first();
      await entrada.fill(lunes);
      await p.waitForTimeout(500);
      let t = await texto(p);
      comprobar(!/El negocio no atiende los/.test(t), `${quien}: con una fecha entre semana NO sale «El negocio no atiende los…» (N32)`);
      await entrada.fill(domingo);
      comprobar(await esperarTexto(p, /El hotel no recibe perros los domingos\. Elige otro día/, 10000), `${quien}: en domingo dice «los domingos» (N31)`);
      t = await texto(p);
      comprobar(/Elige otro día/.test(t), `${quien}: y el aviso del domingo (con la fecha elegida en domingo) pide escoger otro día (N32)`);
      comprobar(!/los domingo[^s]/.test(t), `${quien}: nunca «los domingo.» en singular`);
      await entrada.fill(lunes);
      await p.waitForTimeout(400);
      comprobar(!/El negocio no atiende los/.test(await texto(p)), `${quien}: al volver a un lunes la regla desaparece`);
      // N20: el aviso general de abajo, según el permiso (la mascota nueva no tiene evaluación de comportamiento).
      await esperarTexto(p, /sin evaluación de comportamiento/, 15000);
      const general = (await texto(p)).match(/Hay mascotas sin evaluación de comportamiento[^]*?(?=Hay mascotas|$)/)?.[0] ?? "";
      if (quien === "admin") comprobar(/autoriza la excepción con su motivo/.test(general) && !/si tienes permiso/i.test(general), "admin: el aviso general ofrece autorizar la excepción (N20)");
      else comprobar(/Sin eso no se puede reservar/.test(general) && /«Excepciones al reservar»/.test(general) && !/si tienes permiso|autoriza la excepci/i.test(general), "recepción sin permiso: el aviso general no ofrece autorizar y dice a quién pedirla (N20)");
      await c.close();
    }
    void perroN;
  }

  // ── QA S16 ───────────────────────────────────────────────────────
  seccion("S16. N58: sin JavaScript ningún formulario manda datos por GET");
  {
    const c = await nav.newContext({ viewport: { width: 1100, height: 900 }, javaScriptEnabled: false });
    await c.addCookies(await cookiesDe(datos.adminB, "huellitas.localhost"));
    const p = await c.newPage();
    p.setDefaultTimeout(45000);
    for (const ruta of ["/clientes/nuevo", `/clientes/${datos.clienteSoloB}/perros/nuevo`, "/servicios/nuevo", "/bienvenida/equipo"]) {
      await p.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded" });
      const envios = p.locator('form button[type="submit"], form button:not([type])');
      const n = await envios.count();
      let todosDeshabilitados = n > 0;
      for (let i = 0; i < n; i++) if (!(await envios.nth(i).isDisabled())) todosDeshabilitados = false;
      const metodos = await p.locator("form").evaluateAll((fs) => fs.map((f) => (f.getAttribute("method") ?? "get").toLowerCase()));
      comprobar(todosDeshabilitados, `${ruta}: antes de hidratar, los botones de envío están deshabilitados (${n})`);
      comprobar(metodos.every((m) => m === "post"), `${ruta}: ningún formulario de alta es GET (${metodos.join(",")})`);
    }
    await c.close();
  }

  seccion("S16. N80: la raza vacía da un error claro junto al campo");
  {
    ({ c, p } = await abrir(datos.adminB, 390));
    await p.goto(`${BASE}/clientes/${datos.clienteSoloB}/perros/nuevo`, { waitUntil: "networkidle" });
    await (await campoNombreDelPerro(p)).fill(`Sin raza ${sufijo}`);
    const antes = p.url();
    await p.getByRole("button", { name: /Crear perro|Guardar/ }).first().click();
    comprobar(await esperarTexto(p, /Escribe la raza del perro\. Si no sabes cuál es, escoge «Mestizo»/, 8000), "dice que falta la raza y qué hacer si no la sabe");
    comprobar(p.url() === antes && !p.url().includes("?"), "no navega ni pone datos en la URL");
    await c.close();
  }

  seccion("S16. N65: los botones de WhatsApp enseñan el mensaje antes de abrir wa.me");
  {
    const tel = (await SB.from("clientes").select("telefono").eq("id", datos.clienteSoloB).single()).data.telefono;
    const { data: srvE } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "estetica_estetico").is("deleted_at", null).single();
    const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
    const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
    const { data: razasC } = await A.from("razas").select("id, nombre");
    const perroW = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `QH wa ${sufijo}`, raza: "Poodle", raza_id: razasC.find((r) => r.nombre === "Poodle").id, tamano_id: tallas.find((t) => t.clave === "chico").id, pelaje_id: pelajes.find((t) => t.clave === "medio").id }).select("id").single()).data;
    limpieza.push(async () => { await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", perroW.id); });
    const rr = (await SB.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    const dia = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    const cita = await SB.from("citas_estetica").insert({ reserva_id: rr.id, perro_id: perroW.id, servicio_id: srvE.id, empleado_id: datos.esteticaB, inicio: `${dia}T12:00:00-06:00` }).select("id").single();
    if (cita.error) throw new Error(`cita: ${cita.error.message}`);
    limpieza.push(async () => { await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).eq("id", cita.data.id); });
    ({ c, p } = await abrir(datos.adminB, 390));
    await p.goto(`${BASE}/estetica/${cita.data.id}`, { waitUntil: "networkidle" });
    if (String(tel ?? "").replace(/\D/g, "").length >= 10) {
      comprobar((await p.locator("[data-avisos-whatsapp] a").count()) === 0, "los avisos ya no son ligas directas a wa.me");
      await p.locator("[data-avisos-whatsapp] button", { hasText: "Confirmación" }).click();
      const vista = p.locator("[data-vista-mensaje]");
      await vista.waitFor({ timeout: 10000 });
      comprobar((await vista.innerText()).includes(`QH wa ${sufijo}`), "«Confirmación» enseña el mensaje real (con el nombre del perrito)");
      comprobar(/PeluDesk no lo manda solo/.test(await vista.innerText()) && (await p.locator("[data-abrir-whatsapp]").getAttribute("href")).startsWith("https://wa.me/52"), "y explica que abre WhatsApp con ese mensaje y tú lo mandas");
    } else comprobar(false, "el cliente de prueba no tiene teléfono de 10 dígitos");
    await c.close();
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const f of limpieza) await f().catch(() => {});
  for (const m of medicosCreados) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
  await quitarPrecio("vet_consulta_general").catch(() => {});
  await quitar(P.admin, P.recConId, "tarifas").catch(() => {});
  await nav.close();
  void dar;
  terminar();
}
