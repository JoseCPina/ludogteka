// Recolección en PRODUCCIÓN (migración 20261203004100). Demo: cotiza por la misma función de la pantalla y guardar dice lo
// del demo. Negocio PRUEBA: guardar entra a la cuenta y cancelar la saca; deja todo como estaba. Nunca Ludogteka.
//   node scripts/auditoria/qa-recoleccion-prod.mjs [slug-prueba]
import { abrirNavegador } from "../lib/navegador.mjs";
import { comoPersona, negocioPrueba, servicioSinNegocio, servicioEn, sesionDe } from "../lib/prod.mjs";

let mal = 0;
const revisa = (ok, t) => { console.log(`  ${ok ? "✔" : "✘"} ${t}`); if (!ok) mal++; };
const DIR = "Calle de Prueba 123, Centro";
const S = servicioSinNegocio();

console.log("Demo (patitasyco)");
const { data: demo } = await S.from("negocios").select("id, slug, plan").eq("slug", "patitasyco").single();
const D = servicioEn(demo.id);
const { data: adm } = await D.from("membresias").select("profile_id").eq("negocio_id", demo.id).eq("rol", "admin").is("deleted_at", null).limit(1).single();
const sd = await sesionDe(adm.profile_id, "patitasyco.peludesk.mx");
const CD = comoPersona(sd.token, demo.id);
const { data: ests, error: eEst } = await D.from("estancias").select("id, reserva_id, fecha_entrada, reservas!inner(cliente_id, deleted_at)").eq("negocio_id", demo.id).in("estado", ["reservada", "confirmada"]).is("deleted_at", null).is("reservas.deleted_at", null).order("fecha_entrada", { ascending: false }).limit(1);
if (eEst) throw eEst;
const est = ests?.[0] ?? null;
const clienteDemo = est?.reservas.cliente_id ?? (await D.from("clientes").select("id").eq("negocio_id", demo.id).is("deleted_at", null).limit(1).single()).data.id;
if (!est) console.log("  · la demo no tiene una reserva viva: solo se prueba cotizar");
const cot = await CD.rpc("recoleccion_cotizar", { p_cliente: clienteDemo, p_direccion: DIR, p_lat: 22.17, p_lng: -101, p_punto: "negocio" });
console.log(`  · ${JSON.stringify(cot.data ?? cot.error?.message).slice(0, 220)}`);
revisa(!cot.error && cot.data, "la demo cotiza");
if (est) {
const antesD = (await CD.rpc("cuenta_totales_reserva", { p_reserva_id: est.reserva_id })).data?.[0];
const gd = await CD.rpc("recoleccion_guardar", { p_reserva: est.reserva_id, p_estancia: est.id, p_cita: null, p_fecha: est.fecha_entrada, p_hora: "09:00", p_direccion: DIR, p_lat: 22.17, p_lng: -101, p_punto: "negocio", p_km: 4 });
console.log(`  · guardar en la demo: ${gd.error ? gd.error.message.slice(0, 140) : "se guardó"}`);
if (!gd.error) {
  const d2 = (await CD.rpc("cuenta_totales_reserva", { p_reserva_id: est.reserva_id })).data?.[0];
  revisa(Number(d2.total_cuenta) > Number(antesD.total_cuenta), `entra a la cuenta de la demo (${antesD.total_cuenta} → ${d2.total_cuenta})`);
  await CD.rpc("recoleccion_cancelar", { p_id: gd.data.id, p_motivo: "Verificación de la plataforma" });
}
}

const nav = await abrirNavegador();
try {
  const c = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(90000);
  p.setDefaultTimeout(30000);
  await p.goto("https://patitasyco.peludesk.mx/demo/entrar/recepcion", { waitUntil: "load" });
  await p.goto(`https://patitasyco.peludesk.mx/hotel/nueva?cliente=${clienteDemo}`, { waitUntil: "networkidle" });
  const caja = p.locator("[data-incluir-recoleccion]");
  await caja.waitFor();
  revisa(true, "la pantalla de Nueva reserva de la demo trae «Incluir recolección»");
  await caja.locator("button").first().click();
  await p.locator("[data-recoleccion-campos]").waitFor();
  await p.waitForTimeout(3000); // los datos del cliente llegan después de prender
  const dir = caja.getByLabel("Calle, número y colonia");
  if (await dir.count()) await dir.fill(DIR);
  await caja.locator("[data-cotizar-recoleccion]").click();
  await p.waitForTimeout(6000);
  const km = caja.getByLabel("Kilómetros de ida (a mano)");
  if (await km.count()) {
    await km.fill("4");
    await caja.locator("[data-cotizar-recoleccion]").click();
  }
  const resumen = caja.locator("[data-recoleccion-resumen]");
  await resumen.waitFor({ timeout: 45000 }).catch(() => {});
  const texto = (await resumen.count()) ? (await resumen.innerText()).trim() : "";
  console.log(`  · resumen: ${texto || (await caja.innerText()).replace(/s+/g, " ").slice(-200)}`);
  revisa(texto.includes("$"), "cotiza con precio en la pantalla");
  await p.screenshot({ path: "C:/android/capturas/demo-recoleccion.png" });
} finally {
  await nav.close();
}

const slug = process.argv[2] ?? "prueba-qa-hotel-s62";
console.log(`\nNegocio PRUEBA (${slug})`);
const N = await negocioPrueba(slug);
const s = await N.sesion("admin");
const C = comoPersona(s.token, N.negocio.id);
const { data: e2 } = await N.N.from("estancias").select("id, reserva_id, fecha_entrada, reservas!inner(cliente_id, deleted_at)").eq("negocio_id", N.negocio.id).in("estado", ["reservada", "confirmada"]).is("deleted_at", null).is("reservas.deleted_at", null).order("fecha_entrada", { ascending: false }).limit(1).maybeSingle();
if (!e2) revisa(false, "no hay una reserva viva");
else {
  const { data: mod } = await N.N.from("negocio_modulos").select("activo").eq("negocio_id", N.negocio.id).eq("modulo", "recoleccion").single();
  await N.N.from("negocio_modulos").update({ activo: true }).eq("negocio_id", N.negocio.id).eq("modulo", "recoleccion");
  const { data: servRec } = await N.N.from("servicios").select("id").eq("negocio_id", N.negocio.id).eq("clave", "recoleccion").is("deleted_at", null).single();
  const { data: tarifas } = await N.N.from("tarifas").select("id").eq("servicio_id", servRec.id).is("deleted_at", null);
  const tarifa = (tarifas ?? []).length ? null : (await N.N.from("tarifas").insert({ negocio_id: N.negocio.id, servicio_id: servRec.id, precio: 12, vigencia_desde: "2026-01-01", cantidad_desde: 1 }).select("id").single()).data?.id;
  try {
  const t = async () => Number((await C.rpc("cuenta_totales_reserva", { p_reserva_id: e2.reserva_id })).data?.[0]?.total_cuenta);
  const t0 = await t();
  const q = await C.rpc("recoleccion_cotizar", { p_cliente: e2.reservas.cliente_id, p_direccion: DIR, p_lat: 20.68, p_lng: -103.35, p_punto: "negocio" });
  console.log(`  · ${JSON.stringify(q.data ?? q.error?.message).slice(0, 220)}`);
  const g = await C.rpc("recoleccion_guardar", { p_reserva: e2.reserva_id, p_estancia: e2.id, p_cita: null, p_fecha: e2.fecha_entrada, p_hora: "09:00", p_direccion: DIR, p_lat: 20.68, p_lng: -103.35, p_punto: "negocio", p_km: 4 });
  if (g.error) revisa(false, `guardar: ${g.error.message.slice(0, 180)}`);
  else {
    const t1 = await t();
    revisa(t1 > t0, `el cargo entra a la cuenta (${t0} → ${t1})`);
    const c = await C.rpc("recoleccion_cancelar", { p_id: g.data.id, p_motivo: "Verificación de la plataforma" });
    revisa(!c.error && (await t()) === t0, "cancelar la saca de la cuenta y todo queda como estaba");
  }
  } finally {
    if (tarifa) await N.N.from("tarifas").delete().eq("id", tarifa);
    await N.N.from("negocio_modulos").update({ activo: mod?.activo ?? false }).eq("negocio_id", N.negocio.id).eq("modulo", "recoleccion");
    console.log("  · módulo y tarifa de ese negocio como estaban");
  }
}
console.log(mal ? `\n✘ ${mal} hallazgo(s)` : "\n✔ Bien en producción.");
process.exit(mal ? 1 : 0);
