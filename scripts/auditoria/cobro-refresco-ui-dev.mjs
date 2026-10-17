// La pantalla de cobro con la base lenta — SOLO DESARROLLO, en Huellitas, con `next start` en el 3001.
//
//   node scripts/auditoria/cobro-refresco-ui-dev.mjs
//
// Retrasa 3 s el refresco de la página (las peticiones _rsc) para reproducir la base lenta y comprueba que,
// al registrar un cobro: el botón sigue ocupado y no admite un segundo clic, el resumen enseña de inmediato
// «Cobrado» y «Saldo $0.00» con «Cuenta pagada», nunca queda el formulario con el monto de antes, y se
// registra UN solo cobro. Lo mismo en el cobro junto (el botón sigue ocupado hasta que abre el recibo).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const comprobar = (c, t) => (c ? console.log(`  ✔ ${t}`) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);

async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });

const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recId = recepciones[0].profile_id;
const rec = await comoPersona(recId);
let n = 0;
const nuevoCliente = async (nombre) => {
  const tel = `55${String(Date.now()).slice(-7)}${n++ % 10}`.slice(0, 10);
  const r = await SB.from("clientes").insert({ nombre: `${nombre} ${sufijo}`, telefono: tel }).select("id").single();
  if (r.error) throw new Error(r.error.message);
  return r.data.id;
};
const cuenta = async (clienteId, precio, concepto) => {
  const r = await rec.rpc("crear_venta_mostrador", { p_cliente_id: clienteId, p_lineas: [{ concepto, precio, cantidad: 1 }], p_notas: "prueba refresco cobro" });
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const cobros = async (id) => (await SB.from("cobros").select("id").eq("reserva_id", id)).data?.length ?? 0;

const nav = await abrirNavegador();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies(await cookiesDe(recId));
// Base lenta: el refresco de la página tarda 3 s.
await ctx.route((u) => u.searchParams.has("_rsc"), async (ruta) => {
  await new Promise((r) => setTimeout(r, 3000));
  await ruta.continue();
});
const p = await ctx.newPage();

try {
  await (await comoPersona(datos.adminB)).rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) turno = (await rec.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba refresco cobro" }).select("id").single()).data;

  console.log("1. Cobro de una cuenta con el refresco lento");
  const cli = await nuevoCliente("Refresco");
  const c1 = await cuenta(cli, 220, `Baño ${sufijo}`);
  await p.goto(`${BASE}/caja/cobrar/${c1}`, { waitUntil: "networkidle" });
  const boton = p.getByRole("button", { name: /Registrar cobro|Cobrando|Actualizando/ });
  await boton.first().click();
  await p.getByText("Cobro registrado.").first().waitFor({ timeout: 20000 });
  const t0 = await p.locator("body").innerText();
  comprobar(/Cobrado:\s*\$220\.00/.test(t0), "al terminar de guardar ya dice «Cobrado: $220.00» (sin esperar el refresco)");
  comprobar(/Saldo:\s*\$0\.00/.test(t0), "y «Saldo: $0.00»");
  // N1 (QA externa, 16 de octubre de 2026): la lista «Cobros de esta reserva» enseña el cobro nuevo de inmediato.
  comprobar(!/Todavía no hay ningún cobro/.test(t0) && (await p.locator("[data-cobro-provisional], [data-cobro-id]").count()) > 0, "la lista «Cobros de esta reserva» ya enseña el cobro nuevo (sin esperar el refresco)");
  comprobar(/Cuenta pagada|No hay saldo por cobrar/i.test(t0) || (await p.getByText("Registrar cobro", { exact: true }).count()) === 0, "sin el formulario de cobrar ni el monto de antes");
  comprobar(await p.getByRole("button", { name: /Registrar cobro/ }).count() === 0 || await p.getByRole("button", { name: /Registrar cobro/ }).first().isDisabled(), "no hay un botón «Registrar cobro» activo para un segundo clic");
  await p.waitForTimeout(5000);
  const t1 = await p.locator("body").innerText();
  comprobar(/Cobrado:\s*\$220\.00/.test(t1) && /Saldo:\s*\$0\.00/.test(t1), "ya refrescada la página, el servidor dice lo mismo");
  comprobar((await cobros(c1)) === 1, "un solo cobro en la base");

  console.log("2. Cobro junto: el botón no se reactiva al pasar al recibo");
  const dos = await nuevoCliente("Junto");
  const j1 = await cuenta(dos, 100, `Cargo A ${sufijo}`);
  const j2 = await cuenta(dos, 50, `Cargo B ${sufijo}`);
  await p.goto(`${BASE}/caja/cobrar-junto?cuentas=${j1},${j2}`, { waitUntil: "networkidle" });
  const bj = p.locator("[data-registrar-junto]");
  await bj.click();
  await p.waitForTimeout(400);
  comprobar(await bj.count() === 0 || (await bj.isDisabled()), "tras guardar, el botón sigue deshabilitado mientras abre el recibo");
  await p.waitForURL(/recibo-junto/, { timeout: 30000 });
  comprobar(((await SB.from("cobros_grupo").select("id").eq("cliente_id", dos)).data ?? []).length === 1, "un solo cobro agrupado en la base");

  // N-sugerencia (QA 17 de octubre): con el servidor rápido (1 a 2.5 s de confirmación), el botón enseña que
  // está procesando y un doble clic en el mismo instante no manda dos cobros.
  console.log("3. Doble clic rápido: un solo cobro, y el botón dice que procesa");
  const pRapida = await ctx.newPage();
  await pRapida.unroute?.("**/*").catch(() => {});
  const tres = await nuevoCliente("Doble clic");
  const c3 = await cuenta(tres, 130, `Baño doble ${sufijo}`);
  await pRapida.goto(`${BASE}/caja/cobrar/${c3}`, { waitUntil: "networkidle" });
  const b3 = pRapida.getByRole("button", { name: /Registrar cobro|Cobrando|Actualizando/ }).first();
  await b3.dblclick({ delay: 0 });
  const textoBoton = await pRapida.getByRole("button", { name: /Cobrando|Actualizando/ }).first().innerText().catch(() => "");
  comprobar(/Cobrando|Actualizando/.test(textoBoton) || (await pRapida.getByText("Cobro registrado.").count()) > 0, `el botón muestra que está procesando («${textoBoton.trim()}») o ya terminó`);
  await pRapida.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 });
  await pRapida.waitForTimeout(4000);
  comprobar((await cobros(c3)) === 1, "un doble clic deja UN solo cobro en la base");
} finally {
  await nav.close();
}
if (hallazgos.length) { console.log(`\n${hallazgos.length} hallazgo(s)`); process.exit(1); }
console.log("\nSin hallazgos.");
