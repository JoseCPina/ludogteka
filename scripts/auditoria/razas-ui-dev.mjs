// Las pantallas de razas, con el navegador (SOLO DESARROLLO, en Huellitas).
// Con el servidor prendido en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/razas-ui-dev.mjs
//
// 1. /perros/razas: los textos fuera del catálogo salen juntos, con su
//    conteo; «Es una raza nueva» manda la propuesta y el renglón avisa que
//    está pendiente.
// 2. /plataforma/catalogos (sesión de plataforma): la bandeja muestra la
//    propuesta y «Aprobar como raza nueva» la aprueba.
// 3. /perros/razas avisa «1 raza nueva sin grupo de precio»;
//    /perros/razas/grupos asigna el grupo y la raza deja de aparecer.
// 4. /estetica/nueva: el perro de esa raza muestra el recuadro «todavía no
//    tiene grupo de precio» (con una raza más sin grupo).
// 5. EL FORMULARIO DEL PERRO, en celular (390 px): escribir una raza que no
//    está → sugerencias (también por parecido) → «No la encuentro: agregar
//    esta raza» → la hoja → el perro queda ligado a la propuesta → la
//    propuesta (con sus notas) llega a la bandeja de la plataforma → se
//    aprueba y entra al catálogo. Con y sin «Precios y tarifas» (el grupo
//    solo lo ve y lo da quien lo tiene), perro ya existente (se liga en el
//    momento), raza escrita igual a una del catálogo (se liga con un toque)
//    y el dueño desde su link de alta (sin precios ni grupos).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const BASE = "http://huellitas.localhost:3001";
const BASE_PLAT = "http://plataforma.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

async function cookiesDe(profileId, dominio) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));
}

const sufijo = String(Date.now()).slice(-5);
const NOMBRE = `Calupoh UI ${sufijo}`;
const { data: tallas } = await A.from("tamanos_categoria").select("id").eq("clave", "grande").single();
const creados = [];
for (const texto of [NOMBRE, NOMBRE.toLowerCase(), `perro ${NOMBRE}`]) {
  const { data } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ ui ${creados.length + 1}`, raza: texto, raza_id: null, tamano_id: tallas.id }).select("id").single();
  creados.push(data.id);
}
const { data: plataformaId } = await A.rpc("usuario_por_email", { p_email: "plataforma@peludesk.prueba" });

// Quita el permiso «Precios y tarifas» que la sección 5 le da a recepción.
const ADMLimpieza = async () => {
  const c = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(datos.adminB)}`, "x-negocio-id": B } } });
  await c.rpc("revocar_permiso", { p_profile_id: datos.recepcionB, p_permiso: "tarifas" });
};

const nav = await abrirNavegador();
const ctx = await nav.newContext();
await ctx.addCookies(await cookiesDe(datos.adminB, "huellitas.localhost"));
const pag = await ctx.newPage();
const ctxP = await nav.newContext();
await ctxP.addCookies(await cookiesDe(plataformaId, "plataforma.localhost"));
const plat = await ctxP.newPage();
let razaId = null;

try {
  console.log("1. /perros/razas: agrupar y proponer");
  await pag.goto(`${BASE}/perros/razas`, { waitUntil: "networkidle" });
  const cuerpo = await pag.locator("body").innerText();
  if (!cuerpo.includes("Textos de raza fuera del catálogo")) hallazgo("no sale la sección «Textos de raza fuera del catálogo»");
  const tarjeta = pag.locator("li", { hasText: "3 perros" }).filter({ hasText: NOMBRE.toLowerCase().replace(/^./, (c) => c.toUpperCase()) }).first();
  if ((await tarjeta.count()) === 0) hallazgo("las tres escrituras de la misma raza no salen en un solo renglón de 3 perros");
  else bien("tres escrituras («Calupoh…», «calupoh…», «perro Calupoh…») salen en un solo renglón de 3 perros");
  await tarjeta.getByRole("button", { name: "Es una raza nueva" }).click();
  await tarjeta.getByLabel("Otras formas de escribirla (separadas por coma)").fill(`Calupo UI ${sufijo}`);
  await tarjeta.getByLabel("Talla típica").selectOption({ label: "Grande" });
  await tarjeta.getByRole("button", { name: "Enviar propuesta" }).click();
  await pag.waitForTimeout(2500);
  await pag.reload({ waitUntil: "networkidle" });
  if (!(await pag.locator("body").innerText()).includes("Propuesta enviada a la plataforma")) hallazgo("después de proponer, el renglón no dice que la propuesta está pendiente");
  else bien("«Es una raza nueva» manda la propuesta y el renglón avisa que está pendiente");

  console.log("\n2. /plataforma/catalogos: la bandeja");
  await plat.goto(`${BASE_PLAT}/plataforma/catalogos`, { waitUntil: "networkidle" });
  const caja = plat.locator("li").filter({ hasText: new RegExp(NOMBRE, "i") }).first();
  if ((await caja.count()) === 0) hallazgo("la bandeja de la plataforma no muestra la propuesta");
  else {
    const t = await caja.innerText();
    if (!t.includes("Huellitas") || !t.includes("3 perro") || !t.includes("Grande")) hallazgo(`la propuesta no muestra negocio, perros y talla: ${t.slice(0, 160)}`);
    else bien("la bandeja muestra la propuesta con su negocio, sus 3 perros y la talla");
    await caja.getByRole("button", { name: "Aprobar como raza nueva" }).click();
    await plat.waitForTimeout(3500);
    console.log("    tras aprobar:", (await plat.locator("body").innerText()).replace(/\s+/g, " ").match(/Listo:[^.]*\.|No se pudo[^.]*\.|Ya existe[^.]*\./)?.[0] ?? "(sin mensaje visible)");
  }
  const { data: razaNueva } = await A.from("razas").select("id, nombre").ilike("nombre", NOMBRE).maybeSingle();
  razaId = razaNueva?.id ?? null;
  if (!razaId) hallazgo("aprobar desde la pantalla no creó la raza");
  else bien("«Aprobar como raza nueva» la agrega al catálogo y liga a los perros");

  console.log("\n3. Grupo de precio");
  await pag.goto(`${BASE}/perros/razas`, { waitUntil: "networkidle" });
  const aviso = (await pag.locator("body").innerText()).toLowerCase();
  if (!/raza nueva sin grupo de precio|razas nuevas sin grupo de precio/.test(aviso) || !aviso.includes(NOMBRE.toLowerCase())) hallazgo("/perros/razas no avisa de la raza sin grupo");
  await pag.goto(`${BASE}/perros/razas/grupos`, { waitUntil: "networkidle" });
  const fila = pag.locator("li").filter({ hasText: new RegExp(NOMBRE, "i") }).first();
  if ((await fila.count()) === 0) hallazgo("/perros/razas/grupos no lista la raza");
  else {
    if (!(await fila.innerText()).match(/grande/i)) hallazgo("la fila no trae la talla típica del catálogo como guía");
    await fila.getByLabel("Grupo de precio").selectOption({ index: 1 });
    await fila.getByRole("button", { name: "Guardar grupo" }).click();
    await pag.waitForTimeout(2500);
    await pag.reload({ waitUntil: "networkidle" });
    if ((await pag.locator("li").filter({ hasText: new RegExp(NOMBRE, "i") }).count()) !== 0) hallazgo("después de guardar, la raza sigue sin grupo");
    else bien("asignar el grupo la saca de «sin grupo de precio»");
  }

  console.log("\n4. Cita de estética con una raza sin grupo");
  // Una raza más, sin grupo, con un perro.
  const { data: otra } = await A.from("razas").insert({ nombre: `SinGrupo UI ${sufijo}` }).select("id").single();
  const { data: perroSG } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ sin grupo ${sufijo}`, raza: `SinGrupo UI ${sufijo}`, raza_id: otra.id, tamano_id: tallas.id }).select("id").single();
  creados.push(perroSG.id);
  await pag.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
  const buscador = pag.locator("input:visible").first();
  await buscador.fill("ZZ sin grupo");
  await pag.waitForTimeout(800);
  await pag.getByText(`ZZ sin grupo ${sufijo}`).first().click();
  await pag.waitForTimeout(500);
  await pag.getByLabel("Perro").selectOption({ label: `ZZ sin grupo ${sufijo}` });
  const panel = await pag.locator("body").innerText();
  if (!panel.includes("todavía no tiene grupo de precio") || !panel.includes("Asignarlo a la raza") || !panel.includes("Solo para esta cita")) hallazgo("el perro de una raza sin grupo no muestra el recuadro de asignar grupo o excepción");
  else bien("al elegir el perro sale «todavía no tiene grupo de precio» con asignar el grupo y la excepción");
  await pag.getByRole("button", { name: "Agendar cita" }).click();
  await pag.waitForTimeout(1200);
  if (!(await pag.locator("body").innerText()).includes("Asígnaselo arriba")) hallazgo("agendar sin grupo ni excepción no explica qué hacer");
  else bien("agendar sin asignar el grupo ni hacer excepción se detiene y dice qué hacer");
  await A.from("razas").delete().eq("id", otra.id).then(() => {}, () => {});

  console.log("\n5. Formulario del perro: una raza que no está en el catálogo (celular, 390 px)");
  const RAZA1 = `Zorrito UI ${sufijo}`;
  const RAZA2 = `Lobito UI ${sufijo}`;
  const RAZA3 = `Coyotito UI ${sufijo}`;
  const RAZA4 = `Chacalito UI ${sufijo}`;
  const jwt = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
  const ADM = await jwt(datos.adminB);
  const REC = await jwt(datos.recepcionB);
  await ADM.rpc("revocar_permiso", { p_profile_id: datos.recepcionB, p_permiso: "tarifas" });
  const MOV = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const movil = async (perfil) => {
    const c = await nav.newContext(MOV);
    await c.addCookies(await cookiesDe(perfil, "huellitas.localhost"));
    return c.newPage();
  };
  const { data: grupos } = await SB.from("grupos_raza").select("id, nombre").is("deleted_at", null).order("orden");
  const { data: catalogo } = await A.from("razas").select("id, nombre, alias, es_desconocida").is("deleted_at", null);
  // Una raza cuyo nombre NO es también otro nombre de otra raza (si lo fuera, ligar el texto sería ambiguo y no se ofrece).
  const clave = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const usos = new Map();
  for (const r of catalogo) for (const c of new Set([r.nombre, ...(r.alias ?? [])].map(clave))) usos.set(c, (usos.get(c) ?? 0) + 1);
  const delCatalogo = catalogo.find((r) => !r.es_desconocida && r.nombre.length >= 8 && /^[A-Za-zÁÉÍÓÚáéíóúñ ]+$/.test(r.nombre) && usos.get(clave(r.nombre)) === 1);
  const propuestaDe = async (nombre) => (await SB.from("razas_propuestas").select("*").eq("negocio_id", B).eq("nombre", nombre).is("deleted_at", null)).data ?? [];
  const enlacesDe = async (propuestaId) => (await SB.from("razas_propuestas_perros").select("perro_id").eq("propuesta_id", propuestaId).is("deleted_at", null)).data ?? [];
  const abrirNuevo = async (p, nombrePerro) => {
    await p.goto(`${BASE}/clientes/${datos.clienteSoloB}/perros/nuevo`, { waitUntil: "networkidle" });
    await p.getByLabel("Nombre del perro").fill(nombrePerro);
  };
  const sinDesborde = async (p, etiqueta) => {
    const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
    if (ancho > 392) hallazgo(`${etiqueta}: la página se desborda a ${ancho}px en 390`);
  };

  // 5a. Admin: sugerencias, parecido y la hoja
  const pAdm = await movil(datos.adminB);
  await abrirNuevo(pAdm, `ZZ raza ${sufijo} 1`);
  const campoRaza = pAdm.locator('input[role="combobox"]');
  const mal = delCatalogo.nombre.slice(0, 2) + delCatalogo.nombre.slice(3);
  await campoRaza.fill(mal);
  await pAdm.waitForTimeout(300);
  const lista = await pAdm.locator("[role=listbox]").innerText();
  if (!lista.includes(delCatalogo.nombre) || !lista.includes("¿Quisiste decir esta?")) hallazgo(`escribir «${mal}» no sugiere «${delCatalogo.nombre}» por parecido: ${lista.slice(0, 120)}`);
  else bien(`escribir «${mal}» sugiere «${delCatalogo.nombre}» por parecido (trigramas), marcada como «¿Quisiste decir esta?»`);
  await campoRaza.fill(RAZA1);
  await pAdm.waitForTimeout(300);
  if ((await pAdm.locator("[data-agregar-raza]").count()) === 0) hallazgo("con una raza que no existe no sale «No la encuentro: agregar esta raza»");
  if ((await pAdm.getByText("tal cual").count()) !== 0) hallazgo("sigue saliendo «usar tal cual»: el texto suelto no debería ser una salida");
  await pAdm.locator("[data-agregar-raza]").first().click();
  const hoja = pAdm.locator("[data-hoja-raza]");
  await hoja.waitFor();
  const cajaHoja = await hoja.boundingBox();
  if (!cajaHoja || cajaHoja.width > 390.5 || Math.abs(cajaHoja.y + cajaHoja.height - 844) > 2) hallazgo(`la hoja no es una hoja de abajo a lo ancho del celular: ${JSON.stringify(cajaHoja)}`);
  else bien("la hoja sube desde abajo a lo ancho de los 390 px");
  if ((await hoja.getByLabel("Nombre de la raza").inputValue()) !== RAZA1) hallazgo("el nombre de la hoja no viene precargado con lo escrito");
  if ((await hoja.getByLabel("Grupo de precio de estética en este negocio (opcional)").count()) !== 1) hallazgo("admin no ve el selector de grupo de precio en la hoja");
  await hoja.getByLabel("Otros nombres con los que se le conoce (opcional)").fill(`Zorro UI ${sufijo}`);
  await hoja.getByLabel("Tamaño típico").selectOption({ label: "Grande" });
  await hoja.getByLabel("Tipo de pelaje").selectOption({ index: 1 });
  await hoja.getByLabel("Notas (opcional)").fill("Se parece al husky pero más chico. Muerde las correas.");
  await hoja.getByLabel("Nombre de la raza").press("Enter");
  if ((await hoja.count()) === 0) hallazgo("Enter dentro de la hoja la cerró o envió el formulario");
  await hoja.getByRole("button", { name: "Guardar raza" }).click();
  await hoja.waitFor({ state: "detached" });
  const falta = pAdm.locator('[data-aviso-grupo="falta"]');
  const textoFalta = await falta.innerText().catch(() => "");
  if (!textoFalta.includes("necesita un grupo de precio antes de agendar")) hallazgo(`sin grupo, el aviso no dice que la estética necesita grupo antes de agendar: «${textoFalta}»`);
  else bien("sin grupo asignado, el aviso dice que la estética de este perro necesita grupo antes de agendar");
  if ((await falta.locator('a[href="/perros/razas/grupos"]').count()) !== 1) hallazgo("admin no ve el enlace a /perros/razas/grupos en el aviso");
  if ((await pAdm.getByText("Raza nueva propuesta").count()) === 0) hallazgo("el selector no marca la raza como «Raza nueva propuesta»");
  await sinDesborde(pAdm, "formulario con la hoja cerrada");
  await pAdm.getByRole("button", { name: "Guardar perro" }).click();
  await pAdm.waitForURL(/\/perros\/[0-9a-f-]{36}/, { timeout: 20000 });
  const perro1 = pAdm.url().match(/\/perros\/([0-9a-f-]{36})/)[1];
  creados.push(perro1);
  const filaP1 = (await SB.from("perros").select("raza, raza_id").eq("id", perro1).single()).data;
  const props1 = await propuestaDe(RAZA1);
  if (filaP1.raza !== RAZA1 || filaP1.raza_id !== null) hallazgo(`el perro quedó con ${JSON.stringify(filaP1)}`);
  if (props1.length !== 1 || props1[0].estado !== "pendiente" || props1[0].origen !== "formulario" || !props1[0].notas?.includes("husky") || !props1[0].variantes.includes(`Zorro UI ${sufijo}`) || !props1[0].tamano_id || props1[0].grupo_raza_id) hallazgo(`la propuesta guardada no trae lo capturado: ${JSON.stringify(props1)}`);
  else bien("al guardar al perro nuevo, la propuesta queda con nombre, otros nombres, talla, pelo y notas, sin grupo");
  if (props1[0] && (await enlacesDe(props1[0].id)).length !== 1) hallazgo("el perro nuevo no quedó ligado a la propuesta");
  const vista1 = (await SB.from("perro_grupo_raza").select("sin_grupo, por_defecto, propuesta_id, raza_nombre").eq("perro_id", perro1).single()).data;
  if (!vista1?.sin_grupo || vista1.por_defecto || vista1.propuesta_id !== props1[0]?.id) hallazgo(`el perro con raza en revisión no está «sin grupo»: ${JSON.stringify(vista1)}`);
  else bien("un perro con raza en revisión queda «sin grupo» (no cae al grupo por defecto, no se adivina precio)");
  await pAdm.waitForLoadState("networkidle");
  if ((await pAdm.locator('[data-aviso-grupo="falta"]').count()) === 0 || (await pAdm.getByText("Raza nueva propuesta").count()) === 0) hallazgo("la ficha del perro no recuerda que su raza está en revisión y sin grupo");
  else bien("la ficha del perro lo sigue diciendo: raza en revisión, necesita grupo");

  // 5b. Recepción SIN «Precios y tarifas»: ni grupo ni enlace; reusa la misma propuesta
  const pRec = await movil(datos.recepcionB);
  await abrirNuevo(pRec, `ZZ raza ${sufijo} 2`);
  await pRec.locator('input[role="combobox"]').fill(RAZA1.toUpperCase());
  await pRec.waitForTimeout(300);
  await pRec.locator("[data-agregar-raza]").first().click();
  const hojaR = pRec.locator("[data-hoja-raza]");
  await hojaR.waitFor();
  if ((await hojaR.getByText("Grupo de precio").count()) !== 0) hallazgo("recepción SIN «Precios y tarifas» ve el selector de grupo de precio");
  else bien("sin «Precios y tarifas», la hoja no tiene selector de grupo de precio");
  await hojaR.getByLabel("Notas (opcional)").fill("Lo trajo la dueña en la mañana.");
  await hojaR.getByRole("button", { name: "Guardar raza" }).click();
  await hojaR.waitFor({ state: "detached" });
  const faltaR = pRec.locator('[data-aviso-grupo="falta"]');
  if ((await faltaR.locator("a").count()) !== 0 || !(await faltaR.innerText()).includes("Pídeselo a admin")) hallazgo("recepción sin permiso ve un enlace a los grupos o no se le dice a quién pedírselo");
  else bien("sin permiso, el aviso no enlaza a los grupos y dice que se lo pida a admin");
  await pRec.getByRole("button", { name: "Guardar perro" }).click();
  await pRec.waitForURL(/\/perros\/[0-9a-f-]{36}/, { timeout: 20000 });
  creados.push(pRec.url().match(/\/perros\/([0-9a-f-]{36})/)[1]);
  const props1b = await propuestaDe(RAZA1);
  if (props1b.length !== 1 || (await enlacesDe(props1b[0].id)).length !== 2 || !props1b[0].notas.includes("Lo trajo") || !props1b[0].notas.includes("husky")) hallazgo(`la misma raza propuesta dos veces no se juntó en una: ${JSON.stringify(props1b.map((x) => x.notas))}`);
  else bien("la misma raza propuesta otra vez (escrita en mayúsculas) se junta en UNA propuesta con 2 perros y las dos notas");
  const intentoGrupo = await REC.rpc("razas_proponer_formulario", { p_nombre: `Nope UI ${sufijo}`, p_variantes: [], p_tamano_id: null, p_pelaje_id: null, p_notas: null, p_perro_id: null, p_grupo_raza_id: grupos[0].id });
  const intentoAsignar = await REC.rpc("asignar_grupo_propuesta", { p_propuesta_id: props1[0].id, p_grupo_raza_id: grupos[0].id });
  if (intentoGrupo.error?.code !== "42501" || intentoAsignar.error?.code !== "42501") hallazgo(`la base dejó a recepción sin permiso dar grupo de precio: ${JSON.stringify([intentoGrupo.error?.code, intentoAsignar.error?.code])}`);
  else bien("la base rechaza (42501) que recepción sin «Precios y tarifas» dé un grupo de precio, por la hoja o por la función");
  if ((await propuestaDe(`Nope UI ${sufijo}`)).length !== 0) hallazgo("se creó una propuesta aunque se rechazó el grupo");

  // 5c. Recepción CON «Precios y tarifas»: ve el selector y asigna el grupo en el momento
  await ADM.rpc("otorgar_permiso", { p_profile_id: datos.recepcionB, p_permiso: "tarifas" });
  const pRec2 = await movil(datos.recepcionB);
  await abrirNuevo(pRec2, `ZZ raza ${sufijo} 3`);
  await pRec2.locator('input[role="combobox"]').fill(RAZA2);
  await pRec2.waitForTimeout(300);
  await pRec2.locator("[data-agregar-raza]").first().click();
  const hojaG = pRec2.locator("[data-hoja-raza]");
  await hojaG.waitFor();
  const selGrupo = hojaG.getByLabel("Grupo de precio de estética en este negocio (opcional)");
  if ((await selGrupo.count()) !== 1) hallazgo("con «Precios y tarifas», recepción no ve el selector de grupo");
  await selGrupo.selectOption(grupos[0].id);
  await hojaG.getByRole("button", { name: "Guardar raza" }).click();
  await hojaG.waitFor({ state: "detached" });
  const avisoG = await pRec2.locator('[data-aviso-grupo="propuesta"]').innerText().catch(() => "");
  if (!avisoG.includes(grupos[0].nombre)) hallazgo(`con grupo asignado, el aviso no dice cuál es: «${avisoG}»`);
  else bien("con «Precios y tarifas» se asigna el grupo en la hoja y el aviso dice cuál quedó");
  await pRec2.getByRole("button", { name: "Guardar perro" }).click();
  await pRec2.waitForURL(/\/perros\/[0-9a-f-]{36}/, { timeout: 20000 });
  const perro3 = pRec2.url().match(/\/perros\/([0-9a-f-]{36})/)[1];
  creados.push(perro3);
  const props2 = await propuestaDe(RAZA2);
  const vista3 = (await SB.from("perro_grupo_raza").select("sin_grupo, grupo_nombre").eq("perro_id", perro3).single()).data;
  if (props2[0]?.grupo_raza_id !== grupos[0].id || vista3?.sin_grupo || vista3?.grupo_nombre !== grupos[0].nombre) hallazgo(`el perro con la propuesta y su grupo no cotiza con ese grupo: ${JSON.stringify([props2[0]?.grupo_raza_id, vista3])}`);
  else bien("el perro con propuesta y grupo asignado ya se puede agendar: su grupo es el que se escogió");

  // 5d. Perro ya existente: «agregar esta raza» lo liga en el momento
  const { data: p4 } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ raza ${sufijo} 4`, raza: RAZA3, raza_id: null, tamano_id: tallas.id }).select("id").single();
  creados.push(p4.id);
  const pEd = await movil(datos.adminB);
  await pEd.goto(`${BASE}/perros/${p4.id}`, { waitUntil: "networkidle" });
  if ((await pEd.getByText("Fuera del catálogo").count()) === 0) hallazgo("un perro con la raza escrita no marca «Fuera del catálogo»");
  await pEd.locator("[data-agregar-raza]").first().click();
  const hojaE = pEd.locator("[data-hoja-raza]");
  await hojaE.waitFor();
  await hojaE.getByRole("button", { name: "Guardar raza" }).click();
  await hojaE.waitFor({ state: "detached" });
  await pEd.waitForTimeout(1500);
  const props3 = await propuestaDe(RAZA3);
  if (props3.length !== 1 || (await enlacesDe(props3[0].id)).length !== 1) hallazgo("en un perro que ya existe, la hoja no lo ligó a la propuesta en el momento (sin guardar el formulario)");
  else bien("en un perro que ya existe, «Guardar raza» crea la propuesta y lo liga en el momento");

  // 5e. Texto exacto de una raza del catálogo: se liga con un toque, nunca solo
  const { data: p5 } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ raza ${sufijo} 5`, raza: delCatalogo.nombre.toLowerCase(), raza_id: null, tamano_id: tallas.id }).select("id").single();
  creados.push(p5.id);
  await pEd.goto(`${BASE}/perros/${p5.id}`, { waitUntil: "networkidle" });
  const ligar = pEd.locator("[data-ligar-raza]");
  if ((await ligar.count()) !== 1 || !(await ligar.innerText()).includes(delCatalogo.nombre)) hallazgo(`un perro cuya raza escrita coincide con «${delCatalogo.nombre}» no ofrece ligarla`);
  else {
    if ((await SB.from("perros").select("raza_id").eq("id", p5.id).single()).data.raza_id !== null) hallazgo("la raza se ligó SOLA, sin tocar nada");
    await ligar.getByRole("button", { name: `Usar ${delCatalogo.nombre}` }).click();
    await pEd.getByRole("button", { name: "Guardar cambios" }).click();
    await pEd.waitForTimeout(2000);
    const despues = (await SB.from("perros").select("raza_id, raza").eq("id", p5.id).single()).data;
    if (despues.raza_id !== delCatalogo.id || despues.raza !== delCatalogo.nombre) hallazgo(`después del toque y guardar: ${JSON.stringify(despues)}`);
    else bien(`un perro con «${delCatalogo.nombre.toLowerCase()}» escrito ofrece ligarlo con un toque; ligó y guardó solo al apretar`);
  }

  // 5f. La plataforma ve la propuesta con sus notas y la aprueba
  await plat.goto(`${BASE_PLAT}/plataforma/catalogos`, { waitUntil: "networkidle" });
  const cajaPl = plat.locator("li").filter({ hasText: RAZA1 }).first();
  const textoPl = await cajaPl.innerText().catch(() => "");
  if (!textoPl.includes("husky") || !textoPl.includes("Lo trajo") || !textoPl.includes("personal al capturar") || !textoPl.includes("2 perro")) hallazgo(`la bandeja no muestra notas, origen y perros: ${textoPl.slice(0, 220)}`);
  else bien("la bandeja de la plataforma muestra la propuesta con las notas de quien la describió, su origen y sus 2 perros");
  const textoPl2 = await plat.locator("li").filter({ hasText: RAZA2 }).first().innerText().catch(() => "");
  if (!textoPl2.includes(grupos[0].nombre)) hallazgo("la bandeja no dice qué grupo le dio el negocio");
  await plat.locator("li").filter({ hasText: RAZA1 }).first().getByRole("button", { name: "Aprobar como raza nueva" }).click();
  await plat.waitForTimeout(3500);
  await plat.locator("li").filter({ hasText: RAZA2 }).first().getByRole("button", { name: "Aprobar como raza nueva" }).click();
  await plat.waitForTimeout(3500);
  const r1 = (await A.from("razas").select("id").eq("nombre", RAZA1).maybeSingle()).data;
  const r2 = (await A.from("razas").select("id").eq("nombre", RAZA2).maybeSingle()).data;
  if (!r1 || !r2) hallazgo("aprobar desde la bandeja no creó las razas");
  else {
    const liga = (await SB.from("perros").select("id, raza_id").in("id", [perro1, perro3])).data;
    if (liga.some((x) => x.raza_id !== (x.id === perro1 ? r1.id : r2.id))) hallazgo("al aprobar, los perros de la propuesta no se ligaron a la raza nueva");
    else bien("al aprobar, la raza entra al catálogo y los perros ligados quedan con ella");
    const g1 = (await SB.from("razas_grupo").select("id").eq("raza_id", r1.id).eq("negocio_id", B).is("deleted_at", null)).data;
    const g2 = (await SB.from("razas_grupo").select("grupo_raza_id").eq("raza_id", r2.id).eq("negocio_id", B).is("deleted_at", null)).data;
    if (g1.length !== 0) hallazgo("aprobar una propuesta SIN grupo le asignó un grupo de precio al negocio");
    else bien("aprobar una propuesta sin grupo NO asigna grupo: el perro sigue «sin grupo» hasta que el negocio decida");
    if (g2.length !== 1 || g2[0].grupo_raza_id !== grupos[0].id) hallazgo(`aprobar una propuesta con el grupo del negocio no lo dejó como el de la raza: ${JSON.stringify(g2)}`);
    else bien("aprobar una propuesta con el grupo que el negocio escogió lo deja como el grupo de esa raza EN ESE negocio");
    const otroNegocio = (await A.from("razas_grupo").select("id").eq("raza_id", r2.id)).data ?? [];
    if (otroNegocio.some((x) => x.negocio_id && x.negocio_id !== B)) hallazgo("el grupo se aplicó en otro negocio");
  }

  // 5g. El dueño, desde su link de alta: sin precios ni grupos
  const TELR = "8110005555";
  const limpiarDueno = async () => {
    const { data: cs } = await SB.from("clientes").select("id").eq("negocio_id", B).eq("telefono", TELR);
    for (const c of cs ?? []) {
      const { data: ps } = await SB.from("perros").select("id").eq("cliente_id", c.id);
      for (const x of ps ?? []) { await SB.from("razas_propuestas_perros").delete().eq("perro_id", x.id); await SB.from("contratos").delete().eq("perro_id", x.id); }
      await SB.from("perros").delete().eq("cliente_id", c.id);
      await SB.from("membresias").delete().eq("cliente_id", c.id);
      await SB.from("invitaciones_cliente").delete().eq("cliente_id", c.id);
      await SB.from("clientes").delete().eq("id", c.id);
    }
    await SB.from("invitaciones_cliente").delete().eq("negocio_id", B).eq("telefono", TELR);
  };
  await limpiarDueno();
  const { data: inv, error: eInv } = await REC.rpc("crear_invitacion_cliente", { p_nombre_referencia: `Prueba UI ${sufijo}`, p_telefono: TELR, p_dias_vigencia: 3, p_tipo: "estetica", p_cliente_id: null });
  if (eInv) throw new Error(`crear_invitacion_cliente: ${eInv.message}`);
  const token = (Array.isArray(inv) ? inv[0] : inv).token;
  const ctxD = await nav.newContext(MOV);
  const dueno = await ctxD.newPage();
  await dueno.goto(`${BASE}/alta/${token}`, { waitUntil: "networkidle" });
  await dueno.getByLabel("Tu nombre completo").fill(`Dueño UI ${sufijo}`);
  await dueno.getByLabel("Tu teléfono").fill(TELR);
  await dueno.getByRole("button", { name: "Siguiente" }).click();
  await dueno.getByLabel("¿Cómo se llama?").fill(`ZZ dueno ${sufijo}`);
  await dueno.locator('input[role="combobox"]').fill(RAZA4);
  await dueno.waitForTimeout(300);
  await dueno.locator("[data-agregar-raza]").first().click();
  const hojaD = dueno.locator("[data-hoja-raza]");
  await hojaD.waitFor();
  const textoHojaD = await hojaD.innerText();
  if (/\$|precio|grupo|Tamaño típico|pelaje/i.test(textoHojaD)) hallazgo(`la hoja del dueño muestra campos de precio, grupo o talla: «${textoHojaD.replace(/\s+/g, " ").slice(0, 200)}»`);
  else bien("la hoja del dueño solo pide nombre, otros nombres y cómo es: sin precios, grupos ni talla típica");
  await hojaD.getByLabel("¿Cómo es o a qué raza se parece? (opcional)").fill("Parecido a un coyote chiquito, muy peludo.");
  await hojaD.getByRole("button", { name: "Guardar raza" }).click();
  await hojaD.waitFor({ state: "detached" });
  const paginaD = await dueno.locator("body").innerText();
  if (/Grupo de precio|grupo de precio/.test(paginaD)) hallazgo("el alta del dueño menciona un grupo de precio");
  if (/\$\s?\d/.test(paginaD)) hallazgo("con una raza propuesta, el alta del dueño muestra un precio estimado (se estaría adivinando)");
  else bien("con una raza propuesta, el alta del dueño no le enseña ningún precio ni grupo");
  await sinDesborde(dueno, "alta del dueño");
  await dueno.getByRole("button", { name: "Siguiente" }).click();
  if (await dueno.getByLabel("Tu contraseña", { exact: true }).isVisible().catch(() => false)) {
    await dueno.getByLabel("Tu contraseña", { exact: true }).fill("Prueba-123456");
    await dueno.getByLabel("Repite tu contraseña").fill("Prueba-123456");
  }
  await dueno.getByRole("button", { name: "Terminar mi registro" }).click();
  let props4 = [];
  for (let i = 0; i < 30 && props4.length === 0; i += 1) { await dueno.waitForTimeout(1000); props4 = await propuestaDe(RAZA4); }
  if (props4.length !== 1 || props4[0].origen !== "cliente" || !props4[0].notas?.includes("coyote") || props4[0].tamano_id || props4[0].grupo_raza_id) hallazgo(`la propuesta del dueño no quedó como esperaba: ${JSON.stringify(props4)}`);
  else bien("la propuesta del dueño llega con su descripción, marcada «cliente», sin talla, sin pelo y sin grupo");
  if (props4[0] && (await enlacesDe(props4[0].id)).length !== 1) hallazgo("el perro del dueño no quedó ligado a su propuesta");
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
  const rA = await anon.rpc("razas_proponer_cliente", { p_perro_id: perro1, p_nombre: "Hack", p_variantes: [], p_notas: null });
  const rB = await anon.rpc("razas_proponer_formulario", { p_nombre: "Hack", p_variantes: [], p_tamano_id: null, p_pelaje_id: null, p_notas: null });
  const rC = await REC.rpc("razas_proponer_cliente", { p_perro_id: perro1, p_nombre: "Hack", p_variantes: [], p_notas: null });
  if (!rA.error || !rB.error || !rC.error) hallazgo(`las funciones de proponer quedaron abiertas: anon cliente=${rA.error?.code}, anon formulario=${rB.error?.code}, recepción cliente=${rC.error?.code}`);
  else bien("anónimo no puede proponer; y proponer «a nombre del dueño» solo lo hace el servidor (ni recepción puede)");
  if ((await propuestaDe("Hack")).length !== 0) hallazgo("se creó una propuesta «Hack»");
  await limpiarDueno();
} finally {
  await ADMLimpieza();
  await nav.close();
  await SB.from("razas_propuestas_perros").delete().in("perro_id", creados);
  await SB.from("perros").update({ deleted_at: new Date().toISOString(), raza_id: null }).in("id", creados);
  await SB.from("razas_propuestas").update({ raza_id: null }).eq("negocio_id", B).not("raza_id", "is", null);
  const { data: restos } = await A.from("razas").select("id").or(`nombre.ilike.%UI ${sufijo},nombre.ilike.SinGrupo UI ${sufijo}`);
  for (const r of restos ?? []) {
    await SB.from("razas_grupo").delete().eq("raza_id", r.id);
    await A.from("razas").delete().eq("id", r.id);
  }
  await SB.from("razas_propuestas").delete().ilike("nombre", `%UI ${sufijo}`);
  void tokenDe;
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
