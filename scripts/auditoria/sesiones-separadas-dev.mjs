// N12 (QA externa, 16 de octubre de 2026) — SOLO DESARROLLO, Huellitas, con el servidor en el 3001.
//
//   node scripts/auditoria/sesiones-separadas-dev.mjs
//
// El personal y el dueño del portal viven en el mismo navegador y dominio: entrar al portal no debe cerrar la sesión
// del admin ni mandarlo al portal al volver.
//   1. Admin con su sesión de personal; abre /recepcion.
//   2. En el MISMO navegador, el dueño entra por /login con su teléfono y contraseña: llega a /portal y su sesión se
//      guarda en la cookie del portal (la del personal no cambia).
//   3. Volver a /recepcion: sigue siendo el admin (no redirige al portal). /portal sigue siendo del dueño.
//   4. Un enlace de activación o alta no pisa la cookie del personal.
//   5. El personal no entra al portal con su cookie, y el dueño no entra a /recepcion con la suya.
//   6. N42: la misma persona en dos subdominios (Huellitas y qa-pruebas): fallar al entrar, entrar y salir en uno
//      no cierra su sesión del otro, y la cookie es solo del subdominio.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { claveAleatoria } from "../lib/clave.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));

async function cookieDe(profileId, nombre) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const PERSONAL = `sb-${REF}-auth-token`;
const PORTAL = `sb-${REF}-portal-auth-token`;
const nombres = async (ctx) => (await ctx.cookies()).map((c) => c.name.replace(/\.\d+$/, ""));

// El dueño: una contraseña que solo vive en esta corrida.
const { data: cuenta } = await A.auth.admin.getUserById(datos.cuentaSoloB);
const { data: perfil } = await A.from("profiles").select("telefono").eq("id", datos.cuentaSoloB).maybeSingle();
const clave = claveAleatoria();
const act = await A.auth.admin.updateUserById(datos.cuentaSoloB, { password: clave });
if (act.error) throw act.error;
const usuario = perfil?.telefono ?? cuenta.user.email;

const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addCookies(await cookieDe(datos.adminB, PERSONAL));
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);

  console.log("── 1. El admin tiene su sesión");
  await p.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(new globalThis.URL(p.url()).pathname.startsWith("/recepcion"), `el admin ve /recepcion (${p.url()})`);

  console.log("── 2. El dueño entra por /login en el mismo navegador");
  const ctxDueno = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pd = await ctxDueno.newPage();
  pd.setDefaultTimeout(60000);
  await pd.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  await pd.getByLabel("Teléfono o correo").fill(usuario);
  await pd.locator('input[name="password"]').fill(clave);
  await pd.getByRole("button", { name: "Entrar" }).click();
  await pd.waitForURL(/\/portal/, { timeout: 60000 }).catch(() => {});
  comprobar(new globalThis.URL(pd.url()).pathname.startsWith("/portal"), `el dueño llega a /portal (${pd.url()})`);
  const cd = await nombres(ctxDueno);
  comprobar(cd.includes(PORTAL) && !cd.includes(PERSONAL), `su sesión se guarda en la cookie del portal, no en la del personal (${[...new Set(cd)].filter((n) => n.startsWith("sb-")).join(", ")})`);

  console.log("── 3. Las dos sesiones conviven en un mismo navegador");
  // Se pasan las cookies del dueño al contexto del admin: un solo navegador con las dos.
  const cookiesDueno = (await ctxDueno.cookies()).filter((c) => c.name.startsWith("sb-"));
  await ctx.addCookies(cookiesDueno.map((c) => ({ name: c.name, value: c.value, domain: "huellitas.localhost", path: "/" })));
  await p.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(new globalThis.URL(p.url()).pathname.startsWith("/recepcion"), `el admin sigue en /recepcion (no lo manda al portal) (${p.url()})`);
  await p.goto(`${BASE}/portal`, { waitUntil: "networkidle", timeout: 120000 });
  const textoPortal = await p.locator("body").innerText();
  comprobar(new globalThis.URL(p.url()).pathname.startsWith("/portal") && /Hola,/.test(textoPortal), `/portal muestra el del dueño (${p.url()})`);
  comprobar(!/\b\d{3} \d{3} \d{4}\b/.test((await p.locator("[data-saludo-portal]").first().innerText().catch(() => "")) || ""), "la cabecera no saluda con el teléfono");
  const antes = await nombres(ctx);
  comprobar(antes.includes(PERSONAL) && antes.includes(PORTAL), "las dos cookies siguen puestas");
  await p.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(new globalThis.URL(p.url()).pathname.startsWith("/recepcion"), "tras visitar el portal, el admin vuelve a su zona sin iniciar sesión");

  console.log("── 4. Cada cookie sirve solo en lo suyo");
  const ctxSolo = await nav.newContext();
  await ctxSolo.addCookies(await cookieDe(datos.adminB, PERSONAL));
  const ps = await ctxSolo.newPage();
  await ps.goto(`${BASE}/portal`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(!(await ps.locator("body").innerText()).includes("Tus perros"), `el personal solo con su cookie no obtiene el portal del dueño (${ps.url()})`);
  const ctxCli = await nav.newContext();
  await ctxCli.addCookies(cookiesDueno.map((c) => ({ name: c.name, value: c.value, domain: "huellitas.localhost", path: "/" })));
  const pc = await ctxCli.newPage();
  await pc.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(!new globalThis.URL(pc.url()).pathname.startsWith("/recepcion"), `el dueño no entra a /recepcion (${pc.url()})`);

  console.log("── 5. Un enlace de alta o activación no pisa la sesión del personal");
  await p.goto(`${BASE}/activar/token-que-no-existe`, { waitUntil: "networkidle", timeout: 120000 });
  const despues = await nombres(ctx);
  comprobar(despues.includes(PERSONAL), "la cookie del personal sigue después de abrir /activar");
  await p.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(new globalThis.URL(p.url()).pathname.startsWith("/recepcion"), "y el admin sigue adentro");
  await ctx.close(); await ctxDueno.close(); await ctxSolo.close(); await ctxCli.close();

  // ── N42 (QA externa, 18 de octubre de 2026): la sesión de un negocio no se cierra por lo que pase en otro ──
  console.log("── 6. Dos subdominios a la vez: entrar, fallar y salir en uno no cierra la sesión del otro");
  const { data: otro } = await A.from("negocios").select("id, slug").eq("slug", "qa-pruebas").single();
  const OTRO = `http://${otro.slug}.localhost:3001`;
  const sufijo = String(Date.now()).slice(-6);
  const claveN42 = claveAleatoria();
  const correoN42 = `aud-n42-${sufijo}@prueba.peludesk.mx`; // escaner-ok: correo de una cuenta temporal, sin contraseña escrita
  const creada = await A.auth.admin.createUser({ email: correoN42, password: claveN42, email_confirm: true });
  if (creada.error) throw creada.error;
  const idN42 = creada.data.user.id;
  const sinAcceso = await A.auth.admin.createUser({ email: `aud-n42-sin-${sufijo}@prueba.peludesk.mx`, password: claveN42, email_confirm: true });
  if (sinAcceso.error) throw sinAcceso.error;
  try {
    await A.from("profiles").upsert({ id: idN42, nombre_completo: `Auditoría Sesiones ${sufijo}` });
    const m1 = await A.from("membresias").insert({ profile_id: idN42, negocio_id: datos.B, rol: "admin" });
    if (m1.error) throw m1.error;
    const ctx6 = await nav.newContext({ viewport: { width: 1280, height: 800 } });
    const entrar = async (base, correo) => {
      const pg = await ctx6.newPage();
      pg.setDefaultTimeout(60000);
      await pg.goto(`${base}/login`, { waitUntil: "networkidle", timeout: 120000 });
      await pg.getByLabel("Teléfono o correo").fill(correo);
      await pg.locator('input[name="password"]').fill(claveN42);
      await pg.getByRole("button", { name: "Entrar" }).click();
      await pg.waitForFunction(() => !location.pathname.startsWith("/login") || /no tiene acceso|incorrectos|No pudimos/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
      await pg.waitForLoadState("networkidle").catch(() => {});
      return pg;
    };
    const sigueAdentro = async (pg) => {
      await pg.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
      return new globalThis.URL(pg.url()).pathname.startsWith("/recepcion");
    };
    const pH = await entrar(BASE, correoN42);
    comprobar(new globalThis.URL(pH.url()).pathname.startsWith("/recepcion") || new globalThis.URL(pH.url()).pathname.startsWith("/admin"), `entra como admin en Huellitas por /login (${pH.url()})`);
    const galletas = (await ctx6.cookies()).filter((c) => c.name.startsWith("sb-"));
    comprobar(galletas.length > 0 && galletas.every((c) => c.domain === "huellitas.localhost"), `la cookie de sesión es solo del subdominio de Huellitas (${[...new Set(galletas.map((c) => c.domain))].join(", ")})`);

    // a) En el otro negocio, la MISMA persona intenta entrar sin tener acceso: antes eso cerraba su sesión en todos.
    const pO = await entrar(OTRO, correoN42);
    comprobar(/no tiene acceso/.test(await pO.locator("body").innerText()), "en el otro negocio le dice que su cuenta no tiene acceso");
    comprobar(await sigueAdentro(pH), "y su sesión de Huellitas sigue abierta");

    // b) Le damos acceso de recepción en el otro negocio: entra ahí y Huellitas sigue con su sesión.
    const m2 = await A.from("membresias").insert({ profile_id: idN42, negocio_id: otro.id, rol: "recepcion" });
    if (m2.error) throw m2.error;
    const pO2 = await entrar(OTRO, correoN42);
    comprobar(new globalThis.URL(pO2.url()).pathname.startsWith("/recepcion"), `entra como recepción en ${otro.slug} (${pO2.url()})`);
    comprobar(await sigueAdentro(pH), "con las dos sesiones abiertas a la vez, Huellitas sigue adentro");

    // d) Salir en el otro negocio no cierra la sesión de Huellitas.
    await pO2.goto(`${OTRO}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
    await pO2.getByRole("button", { name: "Salir" }).first().click();
    await pO2.waitForURL(/\/login/, { timeout: 60000 }).catch(() => {});
    comprobar(/\/login/.test(pO2.url()), "«Salir» en el otro negocio lo manda a su /login");
    comprobar(await sigueAdentro(pH), "y la sesión de Huellitas sigue abierta");
    // c) Otra cuenta (sin acceso) entra en el otro negocio en el mismo navegador: no toca Huellitas.
    await entrar(OTRO, sinAcceso.data.user.email);
    comprobar(await sigueAdentro(pH), "otra cuenta que falla al entrar en el otro negocio no cierra la de Huellitas");

    await ctx6.close();
  } finally {
    await A.from("membresias").delete().eq("profile_id", idN42);
    await A.auth.admin.deleteUser(idN42).catch(() => {});
    await A.auth.admin.deleteUser(sinAcceso.data.user.id).catch(() => {});
  }
} finally {
  await nav.close();
  await A.auth.admin.updateUserById(datos.cuentaSoloB, { password: claveAleatoria() });
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
