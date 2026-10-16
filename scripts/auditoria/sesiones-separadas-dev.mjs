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
} finally {
  await nav.close();
  await A.auth.admin.updateUserById(datos.cuentaSoloB, { password: claveAleatoria() });
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
