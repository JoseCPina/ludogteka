// Uso: node scripts/auditoria/prueba-gratis-dev.mjs   (SOLO DESARROLLO, con `next dev` o `next start` en el 3001)
//
// La prueba gratis de punta a punta, en el navegador, como una persona:
//   1. se registra en peludesk.mx/registro (plataforma.localhost) con un teléfono nuevo;
//   2. aterriza en SU negocio (<slug>.localhost) en /bienvenida, 0 de 5;
//   3. hace los cinco pasos por las pantallas de verdad (datos, precios,
//      horario, empleado, cliente) y /bienvenida queda en 5 de 5;
//   4. cierra sesión y vuelve a entrar con su teléfono y su contraseña;
//   5. el mismo teléfono ya no puede registrar otro negocio; un teléfono que
//      ya tiene cuenta (cliente de algún negocio) abre su negocio con ESA
//      cuenta solo con su contraseña;
//   6. alguien que no es de la plataforma no puede cambiarle el plan; la
//      plataforma se lo vence (plataforma_cambiar_plan) y el negocio queda
//      en solo lectura: el aviso lo dice y guardar lo rechaza la base.
// Sale con 1 al primer paso que falle. Deja el negocio de prueba (vencido) en desarrollo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { abrirNavegador } from "../lib/navegador.mjs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const A = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PLATAFORMA = "http://plataforma.localhost:3001";
const sufijo = String(Date.now()).slice(-4);
const TEL = `442099${sufijo}`;
const PASSWORD = `Prueba-${sufijo}-segura`;
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

async function registrar(p, { nombre = "Persona de Prueba", negocio, tel, password }) {
  await p.goto(`${PLATAFORMA}/registro`);
  await p.getByLabel("Tu nombre").fill(nombre);
  await p.getByLabel("Nombre de tu negocio").fill(negocio);
  await p.getByLabel("Teléfono").fill(tel);
  await p.getByLabel("Contraseña", { exact: true }).fill(password);
  await p.getByLabel("Estética").check();
  await p.getByLabel(/Leí y acepto/).check();
  await p.getByRole("button", { name: "Abrir mi negocio" }).click();
}

try {
  console.log(`── Registro (${NEGOCIO}, tel. ${TEL})`);
  await page.goto(`${PLATAFORMA}/registro`);
  await page.getByLabel("Tu nombre").fill("Persona de Prueba");
  await page.getByLabel("Nombre de tu negocio").fill(NEGOCIO);
  await page.getByLabel("Ciudad").fill("Querétaro");
  await page.getByLabel("Teléfono").fill(TEL);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/Leí y acepto/).check();
  await page.getByRole("button", { name: "Abrir mi negocio" }).click();
  await page.getByText("Escoge al menos un servicio").first().waitFor();
  ok(true, "sin escoger servicios no se registra");
  ok((await page.getByLabel("Nombre de tu negocio").inputValue()) === NEGOCIO, "lo escrito se conserva tras el error");
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Estética").check();
  await page.getByLabel(/Leí y acepto/).check();
  await page.getByRole("button", { name: "Abrir mi negocio" }).click();
  await page.waitForURL(/\/bienvenida/, { timeout: 120_000 });
  const host = new URL(page.url()).host;
  const base = `http://${host}`;
  ok(host.endsWith(".localhost:3001") && host !== "plataforma.localhost:3001", `aterriza en su propio dominio: ${host}`);
  ok((await texto()).includes("0 de 5"), "/bienvenida empieza en 0 de 5");
  ok((await texto()).includes("Prueba gratis de PeluDesk"), "el aviso de días restantes aparece");
  ok((await texto()).includes("Persona de Prueba"), "el encabezado dice su nombre");
  const { data: neg } = await A.from("negocios").select("id, slug, plan, prueba_termina_at, planes(clave)").eq("slug", host.split(".")[0]).single();
  const dias = Math.round((Date.parse(neg.prueba_termina_at) - Date.now()) / 86_400_000);
  ok(neg.plan === "prueba" && dias >= 14 && dias <= 15, `prueba por 15 días (quedan ${dias})`);
  ok(neg.planes?.clave === "estetica", `plan sugerido: ${neg.planes?.clave}`);
  const { data: apagados } = await A.from("negocio_modulos").select("modulo").eq("negocio_id", neg.id).eq("activo", false);
  const off = (apagados ?? []).map((x) => x.modulo).sort().join(",");
  ok(off === "bonos,contratos,guarderia,hotel,recoleccion", `solo estética prendida (apagados: ${off})`);
  ok((await texto()).includes("Gana tu página web gratis"), "la bienvenida muestra el avance para ganar la web");
  const menu = await page.locator("nav").first().innerText();
  ok(!/Hotel|Guardería/.test(menu) && /Estética/.test(menu), "el menú no tiene hotel ni guardería");
  await page.goto(`${base}/hotel`);
  ok(new URL(page.url()).pathname === "/admin/modulos", "hotel apagado: /hotel manda a Módulos y plan");
  await page.goto(`${base}/bienvenida`);

  console.log("── Los cinco pasos");
  await page.goto(`${base}/admin#configuracion`);
  await page.getByLabel("WhatsApp de recepción").fill(TEL);
  await page.getByRole("button", { name: "Guardar configuración" }).click();
  await page.getByText("Configuración guardada").first().waitFor();
  ok(true, "datos del negocio guardados");

  const { data: serv } = await A.from("servicios").select("id").eq("negocio_id", neg.id).eq("clave", "estetica_expres").single();
  await page.goto(`${base}/servicios/${serv.id}/tarifas`);
  await page.getByPlaceholder("Sin capturar").first().fill("280");
  await page.getByRole("button", { name: "Revisar y guardar" }).click();
  await page.getByRole("button", { name: "Confirmar y guardar" }).click();
  await page.getByText("Tarifas guardadas").first().waitFor();
  ok(true, "precio de estética capturado");

  await page.goto(`${base}/admin#horario`);
  await page.getByRole("button", { name: "Guardar horario" }).click();
  await page.waitForTimeout(3000);
  ok(!(await texto()).includes("No se pudo"), "horario guardado");

  await page.goto(`${base}/empleados/nuevo`);
  await page.getByLabel("Nombre", { exact: true }).first().fill("Empleada de Prueba");
  await page.getByLabel("Puesto").fill("Recepción");
  await page.getByLabel("Fecha de ingreso").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Dar de alta" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/nuevo"));
  ok(true, "primer empleado dado de alta");

  await page.goto(`${base}/clientes/nuevo`);
  await page.getByLabel("Nombre del dueño").fill("Cliente de Prueba");
  await page.getByLabel("Teléfono").fill(`442098${sufijo}`);
  await page.getByRole("button", { name: "Crear cliente", exact: true }).click();
  await page.waitForURL(/\/clientes\/[0-9a-f-]{36}/);
  ok(true, "primer cliente dado de alta");

  await page.goto(`${base}/bienvenida`);
  ok((await texto()).includes("5 de 5"), "/bienvenida queda en 5 de 5");
  await page.screenshot({ path: path.join(SALIDA, "prueba-bienvenida.png"), fullPage: true });

  console.log("── Ganar la página web completando el perfil");
  const fotoDePrueba = path.resolve("scripts/demo/fotos/x5oPmHmY3kQ.jpg");
  await page.goto(`${base}/admin/perfil`);
  await page.getByLabel("Dirección").fill("Calle de Prueba 12, Col. Centro");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await page.getByText("Perfil guardado").first().waitFor();
  await page.getByLabel("Foto para: subir logo").setInputFiles(fotoDePrueba);
  await page.getByRole("button", { name: "Subir logo", exact: true }).click();
  await page.getByText("Logo guardado").first().waitFor();
  for (let i = 0; i < 3; i++) {
    await page.getByLabel("Foto para: agregar foto").setInputFiles(fotoDePrueba);
    await page.getByRole("button", { name: "Agregar foto", exact: true }).click();
    await page.getByText("Foto agregada").first().waitFor();
    await page.waitForTimeout(1500);
  }
  const { data: web } = await A.from("negocios").select("web_gratis_at").eq("id", neg.id).single();
  ok(Boolean(web.web_gratis_at), "perfil completo en los primeros 7 días: la web quedó gratis de por vida");
  await page.goto(`${base}/bienvenida`);
  ok((await texto()).includes("Tu página web está incluida"), "la bienvenida dice que la web está incluida");
  const publica = await ctx.newPage();
  await publica.goto(`${base}/`);
  const tPagina = (await publica.locator("body").innerText()).replace(/\s+/g, " ");
  ok(tPagina.includes("Servicios y precios") && tPagina.includes("Baño exprés") && !tPagina.includes("Hotel (por noche)"), "su página pública muestra estética con precio y no hotel");
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
  const PASS2 = `Cliente-${sufijo}-segura`;
  const { data: yaCliente } = await A.auth.admin.createUser({ email: `t${TEL2}@telefono.ludogteka.mx`, password: PASS2, email_confirm: true });
  const p2 = await (await navegador.newContext({ locale: "es-MX" })).newPage();
  p2.setDefaultTimeout(90_000);
  await registrar(p2, { negocio: `Cuenta Previa ${sufijo}`, tel: TEL2, password: "otra-contrasena-mala" });
  await p2.getByText("Escribe la contraseña con la que ya entras").first().waitFor();
  ok(true, "con otra contraseña no toma la cuenta");
  await registrar(p2, { negocio: `Cuenta Previa ${sufijo}`, tel: TEL2, password: PASS2 });
  await p2.waitForURL(/\/bienvenida/, { timeout: 120_000 });
  const { data: neg2 } = await A.from("negocios").select("id").eq("slug", new URL(p2.url()).host.split(".")[0]).single();
  const { data: m2 } = await A.from("membresias").select("profile_id, rol").eq("negocio_id", neg2.id).is("deleted_at", null);
  ok(m2.length === 1 && m2[0].profile_id === yaCliente.user.id && m2[0].rol === "admin", "con su contraseña abre el negocio con su MISMA cuenta");
  await p2.context().close();

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
