// «Tu equipo» y el restablecimiento de alguien invitado (pendientes del médico de prueba, 30 de octubre de 2026) — SOLO
// DESARROLLO, en Huellitas, con `npm run build && npm run start -- -p 3001`.
//
//   node scripts/auditoria/equipo-invitacion-dev.mjs
//
// 1. «Tu equipo» dice lo que pasa («te damos un link para mandárselo»: la app no manda correos) y, con el formulario
//    vacío, no enseña «Falta el nombre, el correo».
// 2. Al invitar con éxito: el formulario se limpia SIN el aviso de faltantes, y junto al link están «Copiar» y
//    «Mandar por WhatsApp», que abre WhatsApp al teléfono capturado con el link en el mensaje.
// 3. La persona invitada NO abre su link: el admin, en Administración → Cuentas, le restablece la contraseña y con esa
//    temporal se puede entrar (antes: «Email not confirmed», una contraseña que no servía).
// Deja Huellitas como estaba (la cuenta de prueba se da de baja y se borra al terminar). Sale con 1 si algo falla.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { limpiarAlTerminar } from "../lib/limpieza-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
limpiarAlTerminar({ prefijos: [] });
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const fallas = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { fallas.push(t); console.log(`  ✘ ${t}`); };
const sufijo = Date.now().toString(36);
const correo = `auditoria.invitado.${sufijo}@peludesk.test`;
const nombre = `Auditoría Invitado ${sufijo}`;
const telefono = "4440001234";

async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const gal = (n) => (trozos.length === 1 ? [[n, valor]] : trozos.map((t, i) => [`${n}.${i}`, t]));
  return gal(`sb-${REF}-auth-token`).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}

let invitadoId = null;
const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies(await cookiesDe(datos.adminB));
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.dismiss().catch(() => {}));

  console.log("1. «Tu equipo» antes de llenar");
  await p.goto(`${BASE}/bienvenida/equipo`, { waitUntil: "load" });
  await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const radio = (await p.locator("[data-formulario-equipo] fieldset").innerText()).replace(/\s+/g, " ");
  if (/te damos un link para mandárselo/.test(radio) && !/le llega un link a su correo/.test(radio)) bien("dice «Invitar con cuenta: te damos un link para mandárselo»");
  else mal(`el texto de «Invitar con cuenta» no dice lo que pasa («${radio.slice(0, 140)}»)`);
  if (await p.locator("[data-falta-equipo]").isVisible().catch(() => false)) mal("con el formulario vacío ya dice lo que falta");
  else bien("con el formulario vacío no dice «Falta…»");

  console.log("2. Invitar");
  await p.getByLabel("Nombre completo *").fill(nombre);
  await p.getByLabel("Correo *").fill(correo);
  await p.getByLabel("Teléfono (opcional)").fill(telefono);
  await p.getByRole("button", { name: "Invitar", exact: true }).click();
  await p.locator("[data-link-invitacion]").waitFor({ timeout: 20000 }).catch(() => {});
  const { data: id } = await SB.rpc("usuario_por_email", { p_email: correo });
  invitadoId = id;
  if (!(await p.locator("[data-link-invitacion]").isVisible().catch(() => false))) mal("no salió el link de invitación");
  else {
    const exito = (await p.locator("[data-acciones-formulario]").last().innerText()).replace(/\s+/g, " ");
    if (await p.locator("[data-falta-equipo]").isVisible().catch(() => false)) mal(`tras invitar dice lo que falta («${exito.slice(0, 120)}»)`);
    else bien(`tras invitar, el formulario se limpió sin «Falta…» («${exito.slice(0, 90)}»)`);
    const copiar = await p.locator("[data-link-invitacion]").getByRole("button", { name: /^Copiar$/ }).count();
    if (copiar) bien("junto al link está «Copiar»"); else mal("junto al link no está «Copiar»");
    const [wa] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), p.locator("[data-mandar-invitacion]").click()]);
    await wa?.waitForURL(/wa\.me|whatsapp/, { timeout: 8000 }).catch(() => {});
    const url = wa ? decodeURIComponent(wa.url()) : "";
    if (url.includes(`52${telefono}`) && /auth\/callback\?token_hash=/.test(url)) bien("«Mandar por WhatsApp» abre WhatsApp a su teléfono con el link en el mensaje");
    else if (!wa && (await p.locator("[data-abrir-whatsapp-panel]").isVisible().catch(() => false))) bien("«Mandar por WhatsApp»: el navegador no dejó abrir solo y enseña «Abrir WhatsApp»");
    else mal(`«Mandar por WhatsApp» no abrió lo esperado (${url.slice(0, 120) || "sin pestaña"})`);
    await wa?.close().catch(() => {});
    await p.screenshot({ path: path.join(os.tmpdir(), "equipo-invitacion-390.png") }).catch(() => {});
  }

  console.log("3. Restablecer a quien no abrió su link");
  const { data: u0 } = await A.auth.admin.getUserById(invitadoId);
  if (u0?.user?.email_confirmed_at) mal("la cuenta invitada ya estaba confirmada: la prueba no sirve");
  else bien("la cuenta invitada sigue sin abrir su link (correo sin confirmar)");
  await p.goto(`${BASE}/admin`, { waitUntil: "load" });
  await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const fila = p.locator("tr", { hasText: correo }).first();
  await fila.scrollIntoViewIfNeeded().catch(() => {});
  await fila.getByRole("button", { name: "Restablecer contraseña" }).click();
  await fila.getByRole("button", { name: "Sí, restablecer" }).click();
  const campo = fila.locator("input[readonly]").first();
  await campo.waitFor({ timeout: 15000 }).catch(() => {});
  const temporal = await campo.inputValue().catch(() => "");
  if (!temporal) mal("no salió la contraseña temporal");
  else {
    const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { error } = await cli.auth.signInWithPassword({ email: correo, password: temporal });
    if (error) mal(`la temporal no sirve para entrar («${error.message}»)`);
    else bien("con la contraseña temporal sí se entra (la cuenta quedó activa al restablecer)");
  }
} finally {
  await nav.close();
  if (invitadoId) {
    await SB.from("empleados").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", B).eq("profile_id", invitadoId);
    await SB.from("membresias").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", B).eq("profile_id", invitadoId);
    // El perfil (sin cascada desde Auth) se borra primero; si no, Auth responde 500 al borrar la cuenta.
    await A.from("profiles").delete().eq("id", invitadoId);
    const { error } = await A.auth.admin.deleteUser(invitadoId);
    console.log(error ? `  · la cuenta de prueba no se pudo borrar: ${error.message}` : "  · cuenta de prueba borrada");
  }
}
console.log(fallas.length ? `\n✘ ${fallas.length} falla(s).` : "\n✔ «Tu equipo» y el restablecimiento de un invitado, en orden.");
process.exit(fallas.length ? 1 : 0);
