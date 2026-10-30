// QA N151 — SOLO DESARROLLO, en Huellitas, con `next start` en el 3001. Con la prueba vencida, recepción:
//   1. ve «Nuevo cliente» (en su inicio) deshabilitado y al tocarlo sale el aviso (no se abre el alta);
//   2. el buscador de /clientes sigue escribiendo y filtrando (leer y buscar no se bloquean);
//   3. el negocio contrata (en la base: el plan vuelve a como estaba) y, SIN recargar la pestaña, al tocar otra vez
//      «Nuevo cliente» todo se habilita solo (la franja desaparece y el botón ya no está deshabilitado).
// Deja el plan de Huellitas como estaba. Sale con 1 si algo falla.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const fallas = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { fallas.push(t); console.log(`  ✘ ${t}`); };

const { data: antes } = await SB.from("negocios").select("plan, prueba_termina_at").eq("id", B).single();
const devolver = () => SB.from("negocios").update({ plan: antes.plan, prueba_termina_at: antes.prueba_termina_at }).eq("id", B);
await SB.from("negocios").update({ plan: "prueba", prueba_termina_at: new Date(Date.now() - 86_400_000).toISOString() }).eq("id", B);

const { data: u } = await A.auth.admin.getUserById(datos.recepcionB);
const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
const trozos = valor.match(/.{1,3180}/g);
const galletas = (n) => (trozos.length === 1 ? [[n, valor]] : trozos.map((t, i) => [`${n}.${i}`, t]));

const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([...galletas(`sb-${REF}-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" })));
  const p = await ctx.newPage();
  let cargas = 0;
  p.on("load", () => cargas++);
  await p.goto(`${BASE}/clientes`, { waitUntil: "load" });
  await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const buscador = p.locator("main input[type=search], main input[placeholder*='Busca' i], main input[placeholder*='perro' i]").first();
  if (await buscador.count()) {
    await buscador.fill("zz");
    const v = await buscador.inputValue();
    if (v === "zz" && (await buscador.getAttribute("aria-disabled")) !== "true") bien("el buscador de clientes sigue escribiendo"); else mal(`el buscador quedó bloqueado (valor «${v}»)`);
    await buscador.fill("");
  } else mal("no encontré el buscador de /clientes");

  await p.goto(`${BASE}/recepcion`, { waitUntil: "load" });
  await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const nuevo = p.locator("main a, main button").filter({ hasText: /^\s*\+?\s*Nuevo cliente/ }).first();
  if (!(await nuevo.count())) mal("no encontré «Nuevo cliente» en /recepcion");
  else {
    const aria = await nuevo.getAttribute("aria-disabled");
    if (aria === "true") bien("«Nuevo cliente» se ve deshabilitado"); else mal(`«Nuevo cliente» activo (aria-disabled=${aria})`);
    await nuevo.click({ force: true });
    await p.waitForTimeout(800);
    const aviso = await p.locator("[data-aviso-solo-lectura]").innerText().catch(() => "");
    if (/La prueba del negocio terminó/.test(aviso) && new globalThis.URL(p.url()).pathname === "/recepcion") bien(`al tocarlo: «${aviso.replace(/\s+/g, " ").slice(0, 90)}» y se queda en /recepcion`);
    else mal(`al tocarlo: aviso «${aviso}» en ${p.url()}`);
  }
  // Contrata (en la base) y, sin recargar, vuelve a tocar.
  await devolver();
  const cargasAntes = cargas;
  await nuevo.click({ force: true }).catch(() => {});
  let habilitado = false;
  for (let i = 0; i < 20 && !habilitado; i++) {
    await p.waitForTimeout(500);
    habilitado = (await p.locator("[data-solo-lectura]").count()) === 0 && (await p.locator("[data-aviso-plan=prueba_vencida]").count()) === 0;
  }
  if (habilitado && cargas === cargasAntes) bien("al contratar, todo se habilitó sin recargar la pestaña");
  else mal(`al contratar: habilitado=${habilitado}, recargas=${cargas - cargasAntes}`);
  const aria2 = await nuevo.getAttribute("aria-disabled", { timeout: 5000 }).catch(() => "sin botón");
  if (aria2 !== "true") bien("«Nuevo cliente» ya se puede tocar"); else mal("«Nuevo cliente» sigue deshabilitado");
} finally {
  await devolver();
  await nav.close();
}
console.log(fallas.length ? `\n✘ ${fallas.length} falla(s).` : "\n✔ N151: bloqueo visible, búsqueda libre y desbloqueo sin recargar.");
process.exit(fallas.length ? 1 : 0);
