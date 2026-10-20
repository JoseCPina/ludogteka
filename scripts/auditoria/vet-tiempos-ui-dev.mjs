// QA S19: cuánto tarda, en pantalla, lo que hace Veterinaria en Caja y en la consulta — SOLO DESARROLLO, Huellitas,
// con `next start` en el 3001 (npm run build && npm run start -- -p 3001).
//
//   node scripts/auditoria/vet-tiempos-ui-dev.mjs
//
// Mide desde el clic hasta que la pantalla enseña el resultado: abrir turno, registrar cobro, anular cobro, firmar la
// consulta y quitar un cargo de la consulta. Repite 3 veces y da la mediana. Deja el turno de Huellitas como estaba.
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
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);
const VECES = Number(process.env.VECES ?? 3);

async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
const adm = await comoPersona(datos.adminB);
const cerrarTurnos = () => SB.from("turnos_caja").update({ estado: "cerrado", cerrado_at: new Date().toISOString() }).eq("negocio_id", B).eq("estado", "abierto");

let n = 0;
const nuevoCliente = async () => {
  const tel = `56${String(Date.now()).slice(-7)}${n++ % 10}`.slice(0, 10);
  const r = await SB.from("clientes").insert({ nombre: `Tiempos ${sufijo}`, telefono: tel }).select("id").single();
  if (r.error) throw new Error(r.error.message);
  return r.data.id;
};
const cuenta = async (clienteId) => {
  const r = await adm.rpc("crear_venta_mostrador", { p_cliente_id: clienteId, p_lineas: [{ concepto: `Consulta ${sufijo}`, precio: 350, cantidad: 1 }], p_notas: "tiempos vet" });
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
// Un borrador con diagnóstico y precio, listo para firmar o quitarle un cargo.
const med = await adm.rpc("guardar_medico_veterinario", { p_profile_id: datos.adminB, p_cedula: "1234567", p_cpa: null });
const medico = med.data;
const borrador = async (clienteId) => {
  const pr = await SB.from("perros").insert({ negocio_id: B, cliente_id: clienteId, nombre: `Tiempos ${sufijo}`, especie: "perro" }).select("id").single();
  const c = (await adm.rpc("vet_consulta_iniciar", { p_perro: pr.data.id, p_cita: null, p_tipo: "consulta", p_medico: medico })).data;
  await adm.rpc("vet_consulta_guardar", { p_id: c, p_datos: { motivo: "Tiempos", diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Otitis", tipo: "presuntivo", nota: "" }] } });
  const lineas = (await adm.rpc("vet_consulta_cargos", { p_consulta: c })).data?.lineas ?? [];
  for (const l of lineas.filter((x) => x.precio_unitario == null)) await adm.rpc("vet_consulta_cargo_precio", { p_id: l.id, p_precio: 350, p_guardar_catalogo: false });
  await adm.rpc("vet_consulta_cargo_agregar", { p_consulta: c, p_tipo: "procedimiento", p_concepto: `Limpieza ${sufijo}`, p_cantidad: 1, p_precio: 120, p_servicio: null, p_insumo: null });
  return c;
};

const nav = await abrirNavegador();
const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies(await cookiesDe(datos.adminB));
const p = await ctx.newPage();
p.on("dialog", (d) => d.accept());
const medir = async (fn) => { const t0 = Date.now(); await fn(); return Date.now() - t0; };
const tiempos = { "abrir turno": [], "registrar cobro": [], "anular cobro": [], "firmar consulta": [], "quitar cargo": [] };

const habiaTurno = Boolean((await SB.from("turnos_caja").select("id").eq("negocio_id", B).eq("estado", "abierto").maybeSingle()).data);
try {
  await adm.rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
  // Calienta las pantallas (la primera carga de next start compila).
  await cerrarTurnos();
  for (const r of ["/caja/turno", "/caja", "/veterinaria"]) await p.goto(`${BASE}${r}`, { waitUntil: "networkidle" });
  for (let i = 0; i < VECES; i++) {
    await cerrarTurnos();
    await p.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
    await p.getByLabel("Fondo inicial").fill("100");
    tiempos["abrir turno"].push(await medir(async () => {
      await p.locator("[data-abrir-turno]").click();
      await p.locator("[data-abrir-turno]").waitFor({ state: "detached", timeout: 60000 });
    }));

    const cli = await nuevoCliente();
    const c1 = await cuenta(cli);
    await p.goto(`${BASE}/caja/cobrar/${c1}`, { waitUntil: "networkidle" });
    tiempos["registrar cobro"].push(await medir(async () => {
      await p.getByRole("button", { name: "Registrar cobro" }).first().click();
      await p.getByText("Cobro registrado.").first().waitFor({ timeout: 60000 });
    }));
    await p.waitForTimeout(1500);
    await p.getByRole("button", { name: "Anular cobro" }).first().click();
    await p.locator("[data-correccion-cobro] textarea").fill("Medición de tiempos");
    tiempos["anular cobro"].push(await medir(async () => {
      await p.locator("[data-correccion-cobro]").getByRole("button", { name: "Anular cobro" }).click();
      await p.waitForFunction(() => /Saldo:\s*\$350\.00/.test(document.body.innerText), null, { timeout: 60000 });
    }));

    const cf = await borrador(cli);
    await p.goto(`${BASE}/veterinaria/consulta/${cf}`, { waitUntil: "networkidle" });
    tiempos["quitar cargo"].push(await medir(async () => {
      const fila = p.locator("li", { hasText: `Limpieza ${sufijo}` }).last();
      await fila.getByRole("button", { name: "Quitar" }).click();
      await p.locator('input[name="motivo_cargo"]').fill("Medición");
      await p.getByRole("button", { name: "Quitar el cargo" }).click();
      await p.getByText("quitado: Medición").first().waitFor({ timeout: 60000 });
    }));
    tiempos["firmar consulta"].push(await medir(async () => {
      await p.getByRole("button", { name: "Firmar la consulta" }).click();
      const si = p.locator("[data-confirmar-firma]").getByRole("button", { name: /Sí, firmar/ });
      if (await si.isVisible({ timeout: 1500 }).catch(() => false)) await si.click();
      await p.getByText("Firmada", { exact: true }).first().waitFor({ timeout: 60000 });
    }));
  }
} finally {
  await cerrarTurnos();
  // Deja Huellitas como estaba: si había un turno abierto, queda uno abierto (las otras auditorías cobran en él).
  if (habiaTurno) await adm.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "tiempos vet" });
  try { await adm.rpc("quitar_medico_veterinario", { p_medico_id: medico }); } catch { /* nada */ }
  await nav.close();
}
const mediana = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
console.log("Tiempos en pantalla (ms, clic → resultado):");
for (const [k, v] of Object.entries(tiempos)) console.log(`  ${k.padEnd(18)} ${v.join(" / ")}   mediana ${v.length ? mediana(v) : "—"}`);
