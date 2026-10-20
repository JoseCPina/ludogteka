// Uso: node scripts/auditoria/prueba-gratis-dev.mjs   (SOLO DESARROLLO, con `next dev` o `next start` en el 3001)
//
// La prueba gratis de punta a punta, en el navegador, como una persona:
//   1. se registra en peludesk.mx/registro (plataforma.localhost) con un teléfono nuevo;
//   2. aterriza en SU negocio (<slug>.localhost) en /bienvenida, con «Para operar te falta»;
//   3. hace los pasos por las pantallas de verdad (datos con dirección, precios, horario, quién atiende —solo en
//      nómina no cuenta, invitada con cuenta sí—, cliente) hasta «Tu negocio ya puede operar» (QA S16);
//   3b. lo mismo para un dueño nuevo de Veterinaria (médico con cédula de 7 u 8 números, «Yo soy el médico», /agenda,
//      cargo suelto) y de Hotel y guardería (requisitos para hospedar, contrato de PeluDesk publicado con un clic,
//      recolección apagada), con el tiempo hasta operar de cada giro;
//   4. cierra sesión y vuelve a entrar con su teléfono y su contraseña;
//   5. el mismo teléfono ya no puede registrar otro negocio; un teléfono que
//      ya tiene cuenta (cliente de algún negocio) abre su negocio con ESA
//      cuenta solo con su contraseña;
//   6. la prueba gratis es solo para la primera sucursal: no se abre otra hasta pagar (pantalla y base);
//   7. alguien que no es de la plataforma no puede cambiarle el plan; la
//      plataforma se lo vence (plataforma_cambiar_plan) y el negocio queda
//      en solo lectura: el aviso lo dice y guardar lo rechaza la base.
// Sale con 1 al primer paso que falle. Deja el negocio de prueba (vencido) en desarrollo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { abrirNavegador } from "../lib/navegador.mjs";
import { createClient } from "@supabase/supabase-js";
import { claveAleatoria } from "../lib/clave.mjs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const A = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PLATAFORMA = "http://plataforma.localhost:3001";
const sufijo = String(Date.now()).slice(-4);
const TEL = `442099${sufijo}`;
const PASSWORD = claveAleatoria();
const NEGOCIO = `Prueba Gratis ${sufijo}`;
const SALIDA = process.argv[2] ?? os.tmpdir();

let fallas = 0;
const ok = (cond, que) => {
  console.log(`  ${cond ? "✔" : "✘"} ${que}`);
  if (!cond) { fallas++; throw new Error(que); }
};

const navegador = await abrirNavegador();
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-MX" });
const page = await ctx.newPage();
page.setDefaultTimeout(90_000);
const texto = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");

// Solo en desarrollo: las corridas anteriores de ESTA prueba (teléfonos
// 44209…) no cuentan para el límite de 3 registros por conexión al día.
await A.from("registros_prueba").update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).like("telefono", "44209%");

// ¿El paso de la bienvenida está «Listo»? (lo decide la base: cargarPasosBienvenida)
async function pasoListo(p, base, clave) {
  await p.goto(`${base}/bienvenida`);
  await p.locator(`[data-paso="${clave}"]`).waitFor();
  return (await p.locator(`[data-paso="${clave}"]`).getAttribute("data-listo")) === "1";
}

// Captura TODAS las celdas vacías de los servicios de estas categorías (la misma cuenta que la bienvenida).
async function llenarPrecios(p, base, negocioId, categorias) {
  const { data } = await A.from("servicios").select("id").eq("negocio_id", negocioId).in("categoria", categorias).eq("monto_libre", false).is("deleted_at", null);
  for (const sv of data ?? []) {
    await p.goto(`${base}/servicios/${sv.id}/tarifas`);
    await p.waitForLoadState("networkidle");
    const vacias = p.getByPlaceholder("Sin capturar");
    if ((await vacias.count()) === 0) continue;
    for (let i = 0; i < 120 && (await vacias.count()) > 0; i++) await vacias.first().fill("300");
    await p.getByRole("button", { name: "Revisar y guardar" }).click();
    await p.getByRole("button", { name: "Confirmar y guardar" }).click();
    await p.getByText("Tarifas guardadas").first().waitFor();
  }
}

async function registrar(p, { nombre = "Persona de Prueba", negocio, tel, password, servicios = ["Estética"] }) {
  await p.goto(`${PLATAFORMA}/registro`);
  await p.getByLabel("Tu nombre").fill(nombre);
  await p.getByLabel("Nombre de tu negocio").fill(negocio);
  await p.getByLabel("Teléfono").fill(tel);
  await p.getByLabel("Contraseña", { exact: true }).fill(password);
  for (const sv of servicios) await p.getByLabel(sv, { exact: true }).check();
  await p.getByLabel(/Leí y acepto/).check();
  await p.getByRole("button", { name: "Abrir mi negocio" }).click();
}

try {
  console.log(`── Registro (${NEGOCIO}, tel. ${TEL})`);
  await page.goto(`${PLATAFORMA}/registro`);
  await page.getByLabel("Tu nombre").fill("Persona de Prueba");
  // N79: la dirección se arma en vivo con lo que se escribe (sin acentos ni signos, como slug_libre).
  const sub = () => page.locator("[data-subdominio]").innerText();
  const vacio = await sub();
  await page.getByLabel("Nombre de tu negocio").pressSequentially("Estética Ñandú & Co.", { delay: 15 });
  const enVivo = await sub();
  ok(vacio === "tunegocio.peludesk.mx" && enVivo === "estetica-nandu-co.peludesk.mx", "la dirección del negocio se arma en vivo mientras se escribe el nombre", `${vacio} → ${enVivo}`);
  await page.getByLabel("Nombre de tu negocio").fill(NEGOCIO);
  ok((await sub()) === `prueba-gratis-${sufijo}.peludesk.mx`, "y cambia con cada letra", await sub());
  await page.getByLabel("Ciudad").fill("Querétaro");
  await page.getByLabel("Teléfono").fill(TEL);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/Leí y acepto/).check();
  await page.getByRole("button", { name: "Abrir mi negocio" }).click();
  await page.getByText("Escoge al menos un servicio").first().waitFor();
  ok(true, "sin escoger servicios no se registra");
  ok((await page.getByLabel("Nombre de tu negocio").inputValue()) === NEGOCIO && (await sub()) === `prueba-gratis-${sufijo}.peludesk.mx`, "lo escrito (y su dirección) se conserva tras el error");
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Estética").check();
  await page.getByLabel(/Leí y acepto/).check();
  await page.getByRole("button", { name: "Abrir mi negocio" }).click();
  await page.waitForURL(/\/bienvenida/, { timeout: 120_000 });
  const host = new URL(page.url()).host;
  const base = `http://${host}`;
  ok(host.endsWith(".localhost:3001") && host !== "plataforma.localhost:3001", `aterriza en su propio dominio: ${host}`);
  // QA S16: la bienvenida ya no cuenta «N de 5»: dice qué falta para operar (o que ya puede operar).
  ok(await page.locator("[data-bienvenida-falta]").isVisible(), "/bienvenida empieza con «Para operar te falta»");
  ok((await page.locator("[data-bienvenida-opera]").count()) === 0, "y no dice que ya puede operar");
  ok(!(await texto()).includes("0 de 5"), "sin el contador «0 de 5»");
  const t0 = Date.now();
  ok((await texto()).includes("Prueba gratis de PeluDesk"), "el aviso de días restantes aparece");
  ok((await texto()).includes("Persona de Prueba"), "el encabezado dice su nombre");
  const { data: neg } = await A.from("negocios").select("id, slug, plan, prueba_termina_at, planes(clave)").eq("slug", host.split(".")[0]).single();
  const dias = Math.round((Date.parse(neg.prueba_termina_at) - Date.now()) / 86_400_000);
  ok(neg.plan === "prueba" && dias >= 14 && dias <= 15, `prueba por 15 días (quedan ${dias})`);
  ok(neg.planes?.clave === "completo", `plan único (el registro ya no sugiere un plan por servicios): ${neg.planes?.clave}`);
  // N35 (QA externa, 18 de octubre de 2026): un negocio nuevo de Estética nace con los servicios sueltos comunes
  // además de los baños, de precio único y sin precio capturado; los negocios que ya existían no los reciben.
  const { data: sueltos } = await A.from("servicios").select("clave, nombre, categoria, depende_grupo_raza, depende_tamano, depende_pelaje, duracion_minutos").eq("negocio_id", neg.id).like("clave", "estetica_%").is("deleted_at", null);
  const claves = (sueltos ?? []).map((x) => x.clave).sort();
  for (const c of ["estetica_corte_unas", "estetica_limpieza_oidos", "estetica_corte_pelo", "estetica_deslanado"]) ok(claves.includes(c), `el catálogo nuevo trae «${c}»`);
  ok(["estetica_estetico", "estetica_rapado", "estetica_expres"].every((c) => claves.includes(c)), "y conserva los tres baños");
  ok((sueltos ?? []).filter((x) => x.clave !== "estetica_estetico" && x.clave !== "estetica_rapado" && x.clave !== "estetica_expres").every((x) => x.categoria === "estetica" && !x.depende_grupo_raza && !x.depende_tamano && !x.depende_pelaje && x.duracion_minutos > 0), "los sueltos son de precio único y con duración");
  const idsSueltos = (await A.from("servicios").select("id").eq("negocio_id", neg.id).in("clave", ["estetica_corte_unas", "estetica_limpieza_oidos", "estetica_corte_pelo", "estetica_deslanado"])).data?.map((x) => x.id) ?? [];
  ok(((await A.from("tarifas").select("id").in("servicio_id", idsSueltos)).data ?? []).length === 0, "sin ningún precio inventado: el negocio los captura");
  const { data: lud } = await A.from("negocios").select("id").eq("slug", "ludogteka").maybeSingle();
  if (lud) ok(((await A.from("servicios").select("id").eq("negocio_id", lud.id).like("clave", "estetica_corte_unas")).data ?? []).length === 0, "Ludogteka (negocio existente) NO recibió los servicios nuevos");
  const { data: apagados } = await A.from("negocio_modulos").select("modulo").eq("negocio_id", neg.id).eq("activo", false);
  const off = (apagados ?? []).map((x) => x.modulo).sort().join(",");
  ok(off === "bonos,contratos,guarderia,hotel,recoleccion", `solo estética prendida (apagados: ${off})`);
  ok((await texto()).includes("Completa tu perfil y tu página web queda lista"), "la bienvenida muestra el avance del perfil (la web viene incluida)");
  const menu = await page.locator("nav").first().innerText();
  ok(!/Hotel|Guardería/.test(menu) && /Estética/.test(menu), "el menú no tiene hotel ni guardería");
  await page.goto(`${base}/hotel`);
  ok(new URL(page.url()).pathname === "/admin/modulos", "hotel apagado: /hotel manda a Módulos y plan");
  await page.goto(`${base}/bienvenida`);

  console.log("── Los pasos para operar (Estética)");
  await page.goto(`${base}/admin#configuracion`);
  await page.getByLabel("WhatsApp de recepción").fill(TEL);
  await page.getByRole("button", { name: "Guardar configuración" }).click();
  await page.getByText("Configuración guardada").first().waitFor();
  ok((await page.getByText("Falta el WhatsApp de recepción").count()) === 0, "N80: el aviso «Falta el WhatsApp de recepción» se va al guardar, sin recargar");
  ok(!(await pasoListo(page, base, "datos")), "con el teléfono pero sin dirección, «Datos del negocio» sigue pendiente");
  // QA R23 (N61/N88): la dirección se escribe SOLO en Perfil; Configuración la muestra con «Cambiar en Perfil».
  await page.goto(`${base}/admin#configuracion`);
  ok((await page.locator("#configuracion").getByLabel("Dirección del negocio", { exact: true }).count()) === 0, "N88: Configuración ya no tiene su propio campo de dirección");
  await page.goto(`${base}/admin/perfil`);
  await page.getByLabel("Dirección").fill("Av. de Prueba 100, Centro");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await page.getByText("Perfil guardado").first().waitFor();
  ok(await pasoListo(page, base, "datos"), "con teléfono y dirección, «Datos del negocio» queda listo");
  await page.goto(`${base}/admin#configuracion`);
  ok((await page.locator("[data-direccion-en-perfil]").innerText()).includes("Av. de Prueba 100, Centro"), "N61: Configuración muestra la MISMA dirección de Perfil (solo lectura)");

  const { data: serv } = await A.from("servicios").select("id").eq("negocio_id", neg.id).eq("clave", "estetica_expres").single();
  await page.goto(`${base}/servicios/${serv.id}/tarifas`);
  await page.getByPlaceholder("Sin capturar").first().fill("280");
  await page.getByRole("button", { name: "Revisar y guardar" }).click();
  await page.getByRole("button", { name: "Confirmar y guardar" }).click();
  await page.getByText("Tarifas guardadas").first().waitFor();
  ok(true, "precio de estética capturado");

  // Con UN solo precio el paso «Servicios y precios» sigue pendiente: faltan los de los demás servicios de los
  // módulos prendidos. Se completa capturando todas las celdas de la estética (único módulo prendido).
  await page.goto(`${base}/bienvenida`);
  await page.waitForLoadState("networkidle");
  ok(!(await texto()).includes("Servicios y precios Listo") && !/Servicios y precios\s*Listo/.test(await texto()), "con un solo precio, «Servicios y precios» sigue pendiente");
  const { data: estServ } = await A.from("servicios").select("id").eq("negocio_id", neg.id).eq("categoria", "estetica").eq("monto_libre", false).is("deleted_at", null);
  for (const sv of estServ ?? []) {
    await page.goto(`${base}/servicios/${sv.id}/tarifas`);
    await page.waitForLoadState("networkidle");
    const vacias = page.getByPlaceholder("Sin capturar");
    // El campo deja de ser «Sin capturar» en cuanto se llena: siempre se toma el primero que queda.
    if ((await vacias.count()) === 0) continue;
    for (let i = 0; i < 80 && (await vacias.count()) > 0; i++) await vacias.first().fill("300");
    await page.getByRole("button", { name: "Revisar y guardar" }).click();
    await page.getByRole("button", { name: "Confirmar y guardar" }).click();
    await page.getByText("Tarifas guardadas").first().waitFor();
  }
  ok(true, "precios del resto de la estética capturados");

  await page.goto(`${base}/admin#horario`);
  await page.getByRole("button", { name: "Guardar horario" }).click();
  await page.waitForTimeout(3000);
  ok(!(await texto()).includes("No se pudo"), "horario guardado");

  ok(await pasoListo(page, base, "precios"), "con todos los precios, «Servicios y precios» queda listo");
  ok(await pasoListo(page, base, "horario"), "horario guardado: «Horario» listo");
  ok(!(await pasoListo(page, base, "equipo")), "«Quién atiende la estética» sigue pendiente (nadie con cuenta atiende)");
  ok(!(await page.locator("[data-bienvenida-opera]").count()), "todavía no puede operar");

  // Equipo: un empleado solo en nómina NO cuenta; uno invitado con cuenta, sí.
  await page.goto(`${base}/bienvenida/equipo`);
  await page.getByLabel(/Solo en nómina/).check();
  ok(await page.getByText("Sin cuenta no puede atender citas").isVisible(), "solo en nómina avisa que no podrá atender citas");
  await page.getByLabel("Nombre completo *").fill("Limpieza de Prueba");
  await page.getByRole("button", { name: "Dar de alta en nómina" }).click();
  await page.getByText(/quedó en tu equipo/).first().waitFor();
  ok(!(await pasoListo(page, base, "equipo")), "con alguien solo en nómina, el paso sigue pendiente");
  await page.goto(`${base}/bienvenida/equipo`);
  await page.getByLabel("Nombre completo *").fill("Estilista de Prueba");
  ok(await page.locator("[data-falta-equipo]").innerText().then((x) => /correo/.test(x)), "sin correo, el formulario dice que falta antes de enviar");
  await page.getByLabel("Correo *").fill(`estilista${sufijo}@prueba.peludesk.mx`);
  await page.locator("[data-equipo-opcional] summary").click();
  await page.getByLabel("Lunes: entrada").fill("09:00");
  await page.getByLabel("Lunes: salida").fill("17:00");
  await page.getByRole("button", { name: "Invitar", exact: true }).click();
  await page.getByLabel("Link de invitación (mándaselo)").waitFor();
  ok(true, "invitada con cuenta: sale su link de invitación");
  const { data: empInv } = await A.from("empleados").select("id, profile_id").eq("negocio_id", neg.id).eq("nombre", "Estilista de Prueba").single();
  const { count: horarioInv } = await A.from("empleados_horario").select("id", { count: "exact", head: true }).eq("empleado_id", empInv.id).is("deleted_at", null);
  ok(Boolean(empInv.profile_id) && horarioInv === 1, "quedó en nómina ligada a su cuenta y con su horario (opcional, en el mismo formulario)");
  ok(await pasoListo(page, base, "equipo"), "con una estilista con cuenta, «Quién atiende» queda listo");
  await page.goto(`${base}/bienvenida`);
  ok(await page.locator("[data-bienvenida-opera]").isVisible(), "«Tu negocio ya puede operar»");
  console.log(`  ⏱ Estética: de la bienvenida a «ya puede operar» en ${Math.round((Date.now() - t0) / 1000)} s (automatizado)`);

  await page.goto(`${base}/clientes/nuevo`);
  await page.getByLabel("Nombre del dueño").fill("Cliente de Prueba");
  await page.getByLabel("Teléfono").fill(`442098${sufijo}`);
  await page.getByRole("button", { name: "Crear cliente", exact: true }).click();
  await page.waitForURL(/\/clientes\/[0-9a-f-]{36}/);
  ok(true, "primer cliente dado de alta");

  ok(await pasoListo(page, base, "cliente"), "«Tu primer cliente» queda listo");
  await page.screenshot({ path: path.join(SALIDA, "prueba-bienvenida.png"), fullPage: true });

  console.log("── Ganar la página web completando el perfil");
  const fotoDePrueba = path.resolve("scripts/demo/fotos/x5oPmHmY3kQ.jpg");
  await page.goto(`${base}/admin/perfil`);
  await page.getByLabel("Dirección").fill("Calle de Prueba 12, Col. Centro");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await page.getByText("Perfil guardado").first().waitFor();
  await page.getByLabel("Archivo del logo").setInputFiles(fotoDePrueba);
  await page.getByText("Así se va a ver:").waitFor(); // vista previa antes de guardar
  await page.getByRole("button", { name: "Guardar logo", exact: true }).click();
  await page.getByText("Logo guardado").first().waitFor();
  for (let i = 0; i < 3; i++) {
    await page.getByLabel("Foto para: agregar foto").setInputFiles(fotoDePrueba);
    await page.getByRole("button", { name: "Agregar foto", exact: true }).click();
    await page.getByText("Foto agregada").first().waitFor();
    await page.waitForTimeout(1500);
  }
  // La base lo anota al pintar el avance del perfil (evaluar_web_gratis): se espera a que llegue.
  let web = null;
  for (let i = 0; i < 15 && !web?.web_gratis_at; i++) {
    if (i === 5) await page.goto(`${base}/admin/perfil`);
    web = (await A.from("negocios").select("web_gratis_at").eq("id", neg.id).single()).data;
    if (!web?.web_gratis_at) await page.waitForTimeout(1000);
  }
  ok(Boolean(web?.web_gratis_at), "perfil completo: la base lo registra (la web ya viene incluida en el plan)");
  await page.goto(`${base}/bienvenida`);
  ok((await texto()).includes("Tu página web está lista"), "con el perfil completo la bienvenida dice que la web está lista");
  const publica = await ctx.newPage();
  await publica.goto(`${base}/`);
  const tPagina = (await publica.locator("body").innerText()).replace(/\s+/g, " ");
  ok(/Baño exprés (desde )?\$\d/.test(tPagina) && !/Hotel \(por noche\)|Hotel canino/.test(tPagina), "su página pública muestra estética con precio y no hotel");
  await publica.screenshot({ path: path.join(SALIDA, "prueba-pagina-web.png"), fullPage: true });
  await publica.close();

  console.log("── Cerrar sesión y volver a entrar con teléfono");
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL(/\/login|\/$/);
  await page.goto(`${base}/login`);
  await page.getByLabel("Teléfono o correo").fill(TEL);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin/);
  ok(true, "entra con su teléfono y su contraseña");

  console.log("── El mismo teléfono no abre otro negocio");
  const otra = await ctx.newPage();
  await otra.goto(`${PLATAFORMA}/registro`);
  await otra.getByLabel("Tu nombre").fill("Persona de Prueba");
  await otra.getByLabel("Nombre de tu negocio").fill(`${NEGOCIO} dos`);
  await otra.getByLabel("Teléfono").fill(TEL);
  await otra.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await otra.getByLabel("Estética").check();
  await otra.getByLabel(/Leí y acepto/).check();
  await otra.getByRole("button", { name: "Abrir mi negocio" }).click();
  await otra.getByText("No se pudo abrir tu negocio").first().waitFor();
  const msg = (await otra.locator("body").innerText()).replace(/\s+/g, " ");
  ok(/ya tiene (un negocio|una cuenta)/.test(msg), "rechazado: ese teléfono ya tiene cuenta");
  await otra.close();

  console.log("── Un teléfono que ya tiene cuenta en PeluDesk");
  const TEL2 = `442097${sufijo}`;
  const PASS2 = claveAleatoria();
  const { data: yaCliente } = await A.auth.admin.createUser({ email: `t${TEL2}@telefono.ludogteka.mx`, password: PASS2, email_confirm: true });
  const p2 = await (await navegador.newContext({ locale: "es-MX" })).newPage();
  p2.setDefaultTimeout(90_000);
  await registrar(p2, { negocio: `Cuenta Previa ${sufijo}`, tel: TEL2, password: claveAleatoria() });
  await p2.getByText("Escribe la contraseña con la que ya entras").first().waitFor();
  ok(true, "con otra contraseña no toma la cuenta");
  await registrar(p2, { negocio: `Cuenta Previa ${sufijo}`, tel: TEL2, password: PASS2 });
  await p2.waitForURL(/\/bienvenida/, { timeout: 120_000 });
  const { data: neg2 } = await A.from("negocios").select("id").eq("slug", new URL(p2.url()).host.split(".")[0]).single();
  const { data: m2 } = await A.from("membresias").select("profile_id, rol").eq("negocio_id", neg2.id).is("deleted_at", null);
  ok(m2.length === 1 && m2[0].profile_id === yaCliente.user.id && m2[0].rol === "admin", "con su contraseña abre el negocio con su MISMA cuenta");
  await p2.context().close();


  // ── QA S16: el recorrido completo de un dueño nuevo en los otros dos giros, con el tiempo hasta operar.
  async function datosNegocio(p, base, tel) {
    await p.goto(`${base}/admin#configuracion`);
    await p.getByLabel("WhatsApp de recepción").fill(tel);
    await p.getByRole("button", { name: "Guardar configuración" }).click();
    await p.getByText("Configuración guardada").first().waitFor();
    await p.goto(`${base}/admin/perfil`);
    await p.getByLabel("Dirección").fill("Calle Giro 1, Centro");
    await p.getByRole("button", { name: "Guardar datos" }).click();
    await p.getByText("Perfil guardado").first().waitFor();
    await p.goto(`${base}/admin#horario`);
    await p.getByRole("button", { name: "Guardar horario" }).click();
    await p.waitForTimeout(3000);
  }

  console.log("── Dueño nuevo de Veterinaria");
  const pv = await (await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-MX" })).newPage();
  pv.setDefaultTimeout(90_000);
  const TELV = `442095${sufijo}`;
  await A.from("registros_prueba").update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).like("telefono", "44209%");
  await registrar(pv, { negocio: `Clínica Prueba ${sufijo}`, tel: TELV, password: claveAleatoria(), servicios: ["Veterinaria"] });
  await pv.waitForURL(/\/bienvenida/, { timeout: 120_000 });
  const baseV = `http://${new URL(pv.url()).host}`;
  const tv0 = Date.now();
  const { data: negV } = await A.from("negocios").select("id").eq("slug", new URL(pv.url()).host.split(".")[0]).single();
  ok(await pv.locator('[data-paso="medico"]').isVisible(), "la bienvenida de una clínica pide «Médico veterinario»");
  ok((await pv.locator('[data-paso="requisitos"]').count()) === 0 && (await pv.locator('[data-paso="contrato"]').count()) === 0, "y no pide requisitos para hospedar ni contrato");
  await datosNegocio(pv, baseV, TELV);
  await pv.goto(`${baseV}/servicios`);
  ok((await pv.locator("[data-servicios-ocultos]").count()) === 1 && !(await pv.locator("table").innerText()).match(/Baño|Hotel|Guardería/), "N64: Servicios no muestra lo de estética, hotel ni guardería (apagados)");
  await llenarPrecios(pv, baseV, negV.id, ["veterinaria"]);
  ok(await pasoListo(pv, baseV, "precios"), "precios de consulta, urgencia, seguimiento y vacuna: listo");
  ok(!(await pasoListo(pv, baseV, "medico")), "sin médico, el paso sigue pendiente");
  await pv.goto(`${baseV}/bienvenida/medico`);
  await pv.getByLabel("Cédula profesional *").first().fill("12345");
  ok(await pv.getByRole("button", { name: "Designarme médico" }).isDisabled(), "con una cédula de 5 números, «Designarme médico» no se activa");
  ok(await pv.getByText("Son 7 u 8 números.").first().isVisible(), "y dice que son 7 u 8 números");
  const tokV = await (async () => {
    const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: `t${TELV}@telefono.ludogteka.mx` });
    const { data: ses } = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${ses.session.access_token}`, "x-negocio-id": negV.id } } });
  })();
  const malaCed = await tokV.rpc("guardar_medico_veterinario", { p_profile_id: (await A.rpc("usuario_por_email", { p_email: `t${TELV}@telefono.ludogteka.mx` })).data, p_cedula: "ABC-12", p_cpa: null });
  ok(/7 u 8 números/.test(malaCed.error?.message ?? ""), `la base también rechaza una cédula inválida (${malaCed.error?.message ?? "sin error"})`);
  await pv.getByLabel("Cédula profesional *").first().fill(`7${String(Date.now()).slice(-6)}`);
  await pv.getByRole("button", { name: "Designarme médico" }).click();
  await pv.getByText(/Quedaste designado como médico/).first().waitFor();
  ok(await pasoListo(pv, baseV, "medico"), "«Yo soy el médico» con su cédula: listo");
  await pv.goto(`${baseV}/bienvenida`);
  ok(await pv.locator("[data-bienvenida-opera]").isVisible(), "la clínica ya puede operar");
  console.log(`  ⏱ Veterinaria: de la bienvenida a «ya puede operar» en ${Math.round((Date.now() - tv0) / 1000)} s (automatizado)`);
  await pv.goto(`${baseV}/agenda`);
  await pv.waitForLoadState("networkidle");
  ok(new URL(pv.url()).pathname === "/veterinaria/agenda", `N80: /agenda en una clínica lleva a la agenda clínica (${new URL(pv.url()).pathname})`);
  const { data: cliV } = await A.from("clientes").insert({ negocio_id: negV.id, nombre: "Dueña Vet", telefono: `442093${sufijo}` }).select("id").single();
  await pv.goto(`${baseV}/caja/cargo?cliente=${cliV.id}`);
  const opciones = await pv.locator("select optgroup[label='Veterinaria'] option").allInnerTexts();
  ok(opciones.some((o) => /Consulta general · \$/.test(o)) && opciones.some((o) => /Aplicación de vacuna/.test(o)), `N66: el cargo suelto ofrece los conceptos de Veterinaria con su precio (${opciones.join(" | ")})`);
  await pv.getByRole("button", { name: "Aplicar y cobrar" }).click();
  await pv.waitForURL(/\/caja\/cobrar\//);
  ok((await pv.locator("body").innerText()).includes("Consulta general"), "y crea la cuenta con la consulta para cobrarla");
  await pv.context().close();

  console.log("── Dueño nuevo de Hotel y guardería");
  const ph = await (await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-MX" })).newPage();
  ph.setDefaultTimeout(90_000);
  const TELH = `442094${sufijo}`;
  await A.from("registros_prueba").update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).like("telefono", "44209%");
  await registrar(ph, { negocio: `Hotel Prueba ${sufijo}`, tel: TELH, password: claveAleatoria(), servicios: ["Guardería", "Hotel"] });
  await ph.waitForURL(/\/bienvenida/, { timeout: 120_000 });
  const baseH = `http://${new URL(ph.url()).host}`;
  const th0 = Date.now();
  const { data: negH } = await A.from("negocios").select("id").eq("slug", new URL(ph.url()).host.split(".")[0]).single();
  const { data: modsH } = await A.from("negocio_modulos").select("modulo, activo").eq("negocio_id", negH.id);
  ok((modsH ?? []).some((m) => m.modulo === "recoleccion" && m.activo === false), "N70: la recolección nace apagada (se prende si se ofrece)");
  ok(await pasoListo(ph, baseH, "equipo"), "en hotel y guardería, «Tu equipo» ya está listo con la cuenta del dueño");
  ok(!(await pasoListo(ph, baseH, "requisitos")) && !(await pasoListo(ph, baseH, "contrato")), "requisitos y contrato empiezan pendientes");
  await datosNegocio(ph, baseH, TELH);
  // QA R22 (N87): «Configuración» existe en el menú y como ruta; Perfil manda ahí con un enlace.
  await ph.goto(`${baseH}/admin`);
  const enlaceMenu = ph.locator('a[href="/admin/configuracion"]').first();
  ok((await enlaceMenu.count()) > 0, "N87: el menú tiene «Configuración»");
  const respConfig = await ph.goto(`${baseH}/admin/configuracion`);
  await ph.locator("#configuracion").waitFor({ timeout: 30000 }).catch(() => {});
  const estadoConfig = { status: respConfig?.status(), ruta: new URL(ph.url()).pathname, seccion: await ph.locator("#configuracion").count() };
  ok(estadoConfig.status !== 404 && estadoConfig.ruta === "/admin" && estadoConfig.seccion === 1, `N87: /admin/configuracion lleva a la sección Configuración del negocio, no 404 (${JSON.stringify(estadoConfig)})`);
  await ph.goto(`${baseH}/admin/perfil`);
  ok((await ph.locator("[data-enlace-configuracion]").getAttribute("href")) === "/admin/configuracion", "N87: el texto de Perfil enlaza a Configuración");
  // QA R22 (N61): la dirección de Configuración es la de Perfil, la página web y el checklist.
  ok((await ph.getByLabel("Dirección").first().inputValue()) === "Calle Giro 1, Centro", "N61: Perfil muestra la dirección que se escribió en Configuración");
  ok((await ph.locator('[data-paso-web="direccion"]').getAttribute("data-listo")) === "si", "N61: «Escribir tu dirección» se marca con la dirección de Configuración");
  // Un negocio que solo la tenía en la sucursal (antes de la unificación): un solo campo, sincronizado solo.
  // Con el encabezado del negocio, como escribe la app (la función del disparador solo ve el negocio de la petición).
  const SH = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negH.id } } });
  await SH.from("sucursales").update({ direccion: "Calle Sucursal 9, Centro" }).eq("negocio_id", negH.id).is("deleted_at", null);
  const { data: perfH } = await A.from("negocio_perfil").select("direccion").eq("negocio_id", negH.id).is("deleted_at", null).single();
  ok(perfH.direccion === "Calle Sucursal 9, Centro", "N61: si algo escribe la dirección de la sucursal, la del perfil queda igual (un solo campo)");
  await ph.goto(`${baseH}/admin#configuracion`);
  ok((await ph.locator("[data-direccion-en-perfil]").innerText()).includes("Calle Sucursal 9, Centro"), "N61: Configuración lee la misma dirección");
  // QA R23 (N88): Ubicación para recolección la muestra en solo lectura con «Cambiar en Perfil» y solo ubica.
  // La sección vive con el módulo de Recolección prendido (nace apagado, N70).
  await SH.from("negocio_modulos").update({ activo: true }).eq("negocio_id", negH.id).eq("modulo", "recoleccion");
  await ph.goto(`${baseH}/admin#ubicacion`);
  const ubic = ph.locator("#ubicacion");
  if (await ubic.count()) {
    ok((await ubic.locator("[data-direccion-negocio-lectura]").innerText()).includes("Calle Sucursal 9") && (await ubic.locator("[data-cambiar-en-perfil]").getAttribute("href")) === "/admin/perfil", "N88: Ubicación para recolección muestra la dirección de Perfil en solo lectura con «Cambiar en Perfil»");
    ok((await ubic.getByLabel("Dirección del negocio", { exact: true }).count()) === 0 && (await ubic.locator('input[name="base"]').inputValue()) === "", "N88: sin campo propio de dirección; el punto de salida es opcional y viene vacío");
    await ubic.getByRole("button", { name: "Ubicar en el mapa" }).click();
    await ubic.getByText(/Ubicado en el mapa/).first().waitFor({ timeout: 30000 });
    const { data: suc } = await SH.from("sucursales").select("lat, direccion").eq("negocio_id", negH.id).is("deleted_at", null).order("activo", { ascending: false }).limit(1).single();
    ok(suc.lat != null && suc.direccion === "Calle Sucursal 9, Centro", "N88: «Ubicar en el mapa» ubica la dirección de Perfil");
  } else {
    ok(false, "N88: no apareció la sección Ubicación para recolección con el módulo prendido");
  }
  await SH.from("negocio_modulos").update({ activo: false }).eq("negocio_id", negH.id).eq("modulo", "recoleccion");
  await ph.goto(`${baseH}/`);
  ok((await ph.locator("body").innerText()).includes("Calle Sucursal 9"), "N61: la página web muestra la misma dirección");
  await llenarPrecios(ph, baseH, negH.id, ["guarderia", "hotel", "bono"]);
  ok(await pasoListo(ph, baseH, "precios"), "precios de hotel, guardería y paquetes: listo");
  await ph.goto(`${baseH}/bienvenida/requisitos`);
  await ph.locator('[data-requisito="evaluacion"]').uncheck();
  await ph.getByRole("button", { name: "Confirmar requisitos" }).click();
  await ph.getByText("Requisitos guardados").first().waitFor();
  const { data: ajH } = await A.from("negocio_ajustes_operacion").select("exige_evaluacion_comportamiento, requisitos_revisados_at").eq("negocio_id", negH.id).single();
  ok(ajH.exige_evaluacion_comportamiento === false && Boolean(ajH.requisitos_revisados_at), "requisitos guardados (evaluación apagada) y anotados como revisados");
  ok(await pasoListo(ph, baseH, "requisitos"), "«Requisitos para hospedar»: listo");
  await ph.goto(`${baseH}/bienvenida/contrato`);
  const cuerpo = await ph.getByLabel("Texto del contrato *").inputValue();
  ok(cuerpo.includes("Hotel Prueba") && !/LUDOGTEKA|Ludogteka|Calzada de Guadalupe|San Luis Potos/i.test(cuerpo), "la plantilla de PeluDesk viene precargada con su nombre y sin datos de Ludogteka");
  await ph.getByRole("button", { name: "Publicar contrato" }).click();
  await ph.getByText(/Contrato publicado/).first().waitFor();
  ok(await pasoListo(ph, baseH, "contrato"), "contrato publicado con un clic: listo");
  await ph.goto(`${baseH}/bienvenida`);
  ok(await ph.locator("[data-bienvenida-opera]").isVisible(), "el hotel y guardería ya puede operar");
  console.log(`  ⏱ Hotel y guardería: de la bienvenida a «ya puede operar» en ${Math.round((Date.now() - th0) / 1000)} s (automatizado)`);
  await ph.context().close();

  console.log("── Al vencer, solo lectura");
  const jwts = new Map();
  const token = async (email, negocioId = null) => {
    if (!jwts.has(email)) {
      const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email });
      const { data: s } = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
      jwts.set(email, s.session.access_token);
    }
    const headers = { Authorization: `Bearer ${jwts.get(email)}` };
    if (negocioId) headers["x-negocio-id"] = negocioId;
    return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers } });
  };
  console.log("── La prueba gratis es solo para la primera sucursal");
  await page.goto(`${base}/admin/modulos`);
  const suc = page.locator("[data-sucursales]");
  await suc.waitFor();
  ok(await suc.locator("[data-sucursal-sin-pago]").getByText(/La prueba gratis es solo para tu primera sucursal/).isVisible(), "en la prueba, «Sucursales» dice que la prueba es solo para la primera");
  ok((await suc.getByRole("button", { name: "Abrir sucursal" }).count()) === 0, "y no ofrece abrir otra mientras no pague");
  ok(await page.locator("[data-datos-facturacion]").isVisible(), "«Datos de facturación» ya se puede capturar en la prueba");
  ok((await page.locator("[data-selector-negocio]").count()) === 0, "con un solo negocio no sale «Tus negocios»");
  const { data: personas } = await A.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const duenaId = personas.users.find((x) => x.email === `t${TEL}@telefono.ludogteka.mx`).id;
  const argsSuc = { p_persona_id: duenaId, p_desde_negocio: neg.id, p_nombre: `Sucursal ${sufijo}`, p_slug: `pg-suc-${sufijo}`, p_solo_revisar: false };
  const sinPago = await A.rpc("crear_sucursal", argsSuc);
  ok(/La prueba gratis es solo para tu primera sucursal/.test(sinPago.error?.message ?? ""), `la base no abre una sucursal en prueba (${sinPago.error?.message ?? "sin error"})`);
  const conSesion = await (await token(`t${TEL}@telefono.ludogteka.mx`, neg.id)).rpc("crear_sucursal", argsSuc);
  ok(Boolean(conSesion.error), "con la sesión del admin tampoco: crear_sucursal es solo del servidor");
  const anonSuc = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).rpc("mis_sucursales");
  ok(Boolean(anonSuc.error), "la llave anónima no lee sucursales");
  const { count: sucursales } = await A.from("negocios").select("id", { count: "exact", head: true }).eq("principal_id", neg.id);
  ok(sucursales === 0, "no se creó ninguna sucursal");

  const ayer = new Date(Date.now() - 86_400_000).toISOString();
  const duena = await token(`t${TEL}@telefono.ludogteka.mx`);
  const intento = await duena.rpc("plataforma_cambiar_plan", { p_negocio_id: neg.id, p_plan: "activo", p_prueba_termina_at: null, p_motivo: "me lo activo yo" });
  ok(Boolean(intento.error), "la dueña no puede cambiarse el plan");
  const { data: adminPlat } = await A.from("plataforma_admins").select("profile_id").is("deleted_at", null).limit(1).single();
  const { data: u } = await A.auth.admin.getUserById(adminPlat.profile_id);
  const plataforma = await token(u.user.email);
  const r = await plataforma.rpc("plataforma_cambiar_plan", { p_negocio_id: neg.id, p_plan: "prueba", p_prueba_termina_at: ayer, p_motivo: "Prueba automática: vencer la prueba" });
  ok(!r.error, `la plataforma vence la prueba${r.error ? `: ${r.error.message}` : ""}`);

  await page.goto(`${base}/admin`);
  const t = await texto();
  ok(t.includes("Tu prueba de PeluDesk terminó"), "aviso de prueba vencida");
  // Desde el cobro con Stripe (28 de septiembre de 2026) el admin contrata ahí mismo.
  ok(t.includes("Contrata un plan y todo vuelve a funcionar"), "el aviso dice qué sigue: contratar");
  await page.screenshot({ path: path.join(SALIDA, "prueba-vencida.png") });
  await page.goto(`${base}/admin#configuracion`);
  await page.getByLabel("WhatsApp de recepción").fill("4420990000");
  await page.getByRole("button", { name: "Guardar configuración" }).click();
  await page.waitForTimeout(4000);
  const tras = await texto();
  ok(!tras.includes("Configuración guardada"), "guardar ya no pasa");
  ok(tras.includes("solo lectura"), "la pantalla dice que está en solo lectura");
  const { data: cli } = await A.from("clientes").select("id").eq("negocio_id", neg.id).limit(1).single();
  const duenaNeg = await token(`t${TEL}@telefono.ludogteka.mx`, neg.id);
  const upd = await duenaNeg.from("clientes").update({ nombre: "Cambio que no debe entrar" }).eq("id", cli.id).select("id");
  ok(upd.error?.code === "42501" && /solo lectura/.test(upd.error.message), `un UPDATE directo truena con el aviso (${upd.error?.message ?? "sin error"})`);
  const { data: cfg } = await A.from("cupo_configuracion").select("telefono_recepcion").eq("negocio_id", neg.id).order("created_at", { ascending: false }).limit(1).single();
  ok(cfg.telefono_recepcion === TEL, "la base no guardó el cambio");

  console.log(`\nTODO BIEN: ${NEGOCIO} (${host})`);
} catch (e) {
  if (fallas === 0) fallas = 1; // una excepción de Playwright también es falla
  console.log(`\nFALLÓ: ${e.message}`);
  await page.screenshot({ path: path.join(SALIDA, "prueba-falla.png"), fullPage: true }).catch(() => {});
  console.log(`URL: ${page.url()}`);
  console.log((await texto().catch(() => "")).slice(0, 1500));
} finally {
  await navegador.close();
}
process.exit(fallas ? 1 : 0);
