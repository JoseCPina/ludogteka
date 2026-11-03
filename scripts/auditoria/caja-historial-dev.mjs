// Caja · historial de movimientos de punta a punta (SOLO DESARROLLO, Huellitas; ux/caja-historial).
//
// Con la app compilada y prendida (npm run build && npm run start -- -p 3001) y un turno de caja abierto en Huellitas:
//
//   node scripts/auditoria/caja-historial-dev.mjs [--capturas <carpeta>]
//
//   1. Movimientos de prueba en el turno abierto: una venta de $300 con un abono de $100 en efectivo, una devolución de
//      $40 de ese abono y un retiro de $25.
//   2. Admin (1440 y 390 px): /caja/historial los enseña con su tipo, forma de pago, monto y quién; filtrar por tipo
//      «Devoluciones» deja solo la devolución; tocar el abono abre su detalle con la línea de la cuenta, el cobro, la
//      devolución y los enlaces a la cuenta y al cliente; sin desborde a 390 px.
//   3. Recepción, con el turno abierto (corte ciego): los montos de ese turno dicen «Al cerrar», no hay totales, y la
//      base no los manda (caja_movimientos y caja_movimiento_detalle).
//   4. Estética no abre /caja/historial ni puede llamar las funciones.
// Lo que crea se borra al terminar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const BASE = `http://huellitas.localhost:${Number(process.env.PUERTO_APP ?? 3001)}`;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const ic = process.argv.indexOf("--capturas");
const CAPTURAS = ic > 0 ? process.argv[ic + 1] : null;
if (CAPTURAS) fs.mkdirSync(CAPTURAS, { recursive: true });
const hallazgos = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const comprobar = (c, t) => (c ? bien(t) : mal(t));
const seccion = (t) => console.log(`\n── ${t}`);

const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const H = datos.B;
const S = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const como = async (perfil) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(perfil)}`, "x-negocio-id": H } } });
const adm = await como(datos.adminB);
const { data: recs } = await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "recepcion").is("deleted_at", null).order("created_at").limit(1);
const rec = await como(recs[0].profile_id);
const est = await como(datos.esteticaB);
const turno = (await S.from("turnos_caja").select("id").eq("estado", "abierto").is("deleted_at", null).maybeSingle()).data;
if (!turno) throw new Error("Huellitas necesita un turno de caja abierto.");
const hoy = (await adm.rpc("fecha_negocio")).data;

async function cookies(perfil) {
  const { data: u } = await A.auth.admin.getUserById(perfil);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const n = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[n, valor]] : trozos.map((t, k) => [`${n}.${k}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}

const creados = { reserva: null, retiro: null };
const nav = await abrirNavegador();
try {
  seccion("1. Movimientos de prueba en el turno abierto");
  const venta = await adm.rpc("crear_venta_mostrador", { p_cliente_id: datos.clienteSoloB, p_lineas: [{ concepto: "Prueba historial", precio: 300, cantidad: 1 }], p_notas: "prueba historial" });
  if (venta.error) throw new Error(`venta: ${venta.error.message}`);
  creados.reserva = venta.data;
  const cobro = await adm.rpc("registrar_cobro", { p_reserva_id: venta.data, p_notas: "abono historial", p_metodos: [{ metodo: "efectivo", monto: 100, propina: 0 }] });
  if (cobro.error) throw new Error(`cobro: ${cobro.error.message}`);
  const dev = await adm.rpc("registrar_devolucion", { p_cobro_id: cobro.data, p_motivo: "prueba de historial", p_metodos: [{ metodo: "efectivo", monto: 40 }] });
  if (dev.error) throw new Error(`devolución: ${dev.error.message}`);
  const ret = await adm.rpc("registrar_retiro", { p_monto: 25, p_motivo: "Retiro de prueba del historial" });
  if (ret.error) throw new Error(`retiro: ${ret.error.message}`);
  creados.retiro = typeof ret.data === "string" ? ret.data : ret.data?.id ?? null;
  const { data: cm } = await S.from("cobro_metodos").select("id").eq("cobro_id", cobro.data).single();
  const abono = `venta_mostrador:${cm.id}`;
  bien(`venta $300, abono $100 en efectivo, devolución $40 y retiro $25 (${abono.slice(0, 24)}…)`);

  seccion("2. Admin: lista, filtro y detalle");
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(await cookies(datos.adminB));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => mal(`error de JavaScript en ${p.url()}: ${e.message.slice(0, 140)}`));
  await p.goto(`${BASE}/caja`, { waitUntil: "networkidle" });
  comprobar((await p.locator("[data-ir-historial]").count()) > 0, "Caja enlaza al «Historial»");
  await p.goto(`${BASE}/caja/historial?desde=${hoy}&hasta=${hoy}`, { waitUntil: "networkidle" });
  const fila = p.locator(`[data-movimiento="${abono}"]`);
  comprobar((await fila.count()) === 1 && (await fila.locator("[data-monto]").getAttribute("data-monto")) === "100", "el abono sale con su monto ($100) para el admin");
  comprobar((await p.locator("[data-totales-historial]").count()) === 1, "el admin ve los totales por forma de pago");
  await p.goto(`${BASE}/caja/historial?desde=${hoy}&hasta=${hoy}&tipo=devolucion`, { waitUntil: "networkidle" });
  const tipos = await p.locator("[data-movimiento]").evaluateAll((f) => f.map((x) => x.getAttribute("data-movimiento").split(":")[0]));
  comprobar(tipos.length > 0 && tipos.every((t) => t === "devolucion"), `filtrar «Devoluciones» deja solo devoluciones (${tipos.length})`);
  await p.goto(`${BASE}/caja/historial?desde=${hoy}&hasta=${hoy}`, { waitUntil: "networkidle" });
  await fila.locator("[data-abrir-movimiento]").click();
  await p.waitForSelector(`[data-detalle="${abono}"]`, { timeout: 20_000 }).catch(() => null);
  const det = p.locator(`[data-detalle="${abono}"]`);
  const textoDet = await det.innerText().catch(() => "");
  comprobar(/Prueba historial/.test(textoDet) && /Devoluciones de este cobro/.test(textoDet) && (await det.locator("[data-ir-cuenta]").count()) === 1, "el detalle trae la línea de la cuenta, el cobro, su devolución y «Ver la cuenta»");
  comprobar((await det.getAttribute("data-detalle")) === abono && (await det.locator("[data-detalle-monto]").getAttribute("data-detalle-monto")) === "100", "con el monto del abono");
  if (CAPTURAS) await p.screenshot({ path: path.join(CAPTURAS, "historial-detalle-1440.jpg"), type: "jpeg", quality: 85, fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.reload({ waitUntil: "networkidle" });
  const a = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  comprobar(a[0] <= a[1] + 1, `sin desborde a 390 px (${a[0]}/${a[1]})`);
  if (CAPTURAS) await p.screenshot({ path: path.join(CAPTURAS, "historial-detalle-390.jpg"), type: "jpeg", quality: 85, fullPage: true });

  seccion("3. Recepción con el turno abierto (corte ciego)");
  const r = await rec.rpc("caja_movimientos", { p_desde: hoy, p_hasta: hoy, p_limite: 200 });
  const mia = (r.data?.movimientos ?? []).find((m) => `${m.tipo}:${m.id}` === abono);
  comprobar(Boolean(mia) && mia.monto === null && r.data.totales_por_metodo === null && r.data.ciego === true, "la base no le manda a recepción montos ni totales del turno abierto");
  const dr = await rec.rpc("caja_movimiento_detalle", { p_tipo: "venta_mostrador", p_id: cm.id });
  comprobar(!dr.error && dr.data?.movimiento?.monto === null && (dr.data?.cobro?.metodos ?? []).every((x) => x.monto === null), "ni en el detalle");
  const ctxR = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxR.addCookies(await cookies(recs[0].profile_id));
  const pr = await ctxR.newPage();
  await pr.goto(`${BASE}/caja/historial?desde=${hoy}&hasta=${hoy}`, { waitUntil: "networkidle" });
  comprobar((await pr.locator("[data-historial-ciego]").count()) === 1 && (await pr.locator("[data-totales-historial]").count()) === 0 && (await pr.locator(`[data-movimiento="${abono}"] [data-monto]`).getAttribute("data-monto")) === "", "en pantalla: aviso de corte ciego, sin totales y el monto dice «Al cerrar»");

  seccion("4. Estética");
  const e = await est.rpc("caja_movimientos", { p_desde: hoy, p_hasta: hoy });
  comprobar(Boolean(e.error), `estética no llama caja_movimientos («${e.error?.message}»)`);
  const ctxE = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxE.addCookies(await cookies(datos.esteticaB));
  const pe = await ctxE.newPage();
  await pe.goto(`${BASE}/caja/historial`, { waitUntil: "networkidle" });
  comprobar(!/\/caja\/historial/.test(pe.url()) || (await pe.locator("[data-tabla-historial]").count()) === 0, `estética no abre el historial (terminó en ${new globalThis.URL(pe.url()).pathname})`);
} finally {
  await nav.close().catch(() => {});
  if (creados.retiro) await S.from("movimientos_caja").delete().eq("id", creados.retiro);
  if (creados.reserva) {
    const { data: cs } = await S.from("cobros").select("id").eq("reserva_id", creados.reserva);
    const ids = (cs ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: ds } = await S.from("devoluciones").select("id").in("cobro_id", ids);
      for (const d of ds ?? []) { await S.from("devolucion_metodos").delete().eq("devolucion_id", d.id); await S.from("devoluciones").delete().eq("id", d.id); }
      await S.from("cobro_metodos").delete().in("cobro_id", ids);
      await S.from("cobros").delete().in("id", ids);
    }
    await S.from("ventas_mostrador").delete().eq("reserva_id", creados.reserva);
    await S.from("reservas").delete().eq("id", creados.reserva);
  }
}
console.log(hallazgos.length ? `\n✘ Historial de caja: ${hallazgos.length} hallazgo(s).` : "\n✔ Historial de caja: todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
