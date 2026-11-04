// QA S62 en PRODUCCIÓN, solo lectura: reproduce lo que vio QA en los negocios PRUEBA S62 (antes de desplegar debe
// fallar; después, pasar) y reporta las cuentas REALES con saldo a favor (negativo) que se enseñaban como pagadas.
// Ningún POST, PATCH ni DELETE: las RPC que se llaman son de lectura y el navegador aborta todo lo que no es GET.
//
//   node scripts/auditoria/qa-s62-prod.mjs [--solo n162|n163|n164|medico|ciego|reporte]
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import { createClient } from "@supabase/supabase-js";
import { URL_PROD, llavesProd, servicioSinNegocio, servicioEn, sesionDe, comoPersona } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const SOLO = arg("--solo");
const corre = (k) => !SOLO || SOLO === k;
const hallazgos = [];
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const revisa = (ok, t) => (ok ? bien(t) : mal(t));

const S = servicioSinNegocio();
const negocio = async (slug) => (await S.from("negocios").select("id, slug, dominio").eq("slug", slug).single()).data;
const H = await negocio("prueba-qa-hotel-s62");
const E = await negocio("prueba-qa-estetica-s62");
const V = await negocio("prueba-qa-vet-s62");
const host = (n) => n.dominio || `${n.slug}.peludesk.mx`;
async function adminDe(n) {
  const { data } = await servicioEn(n.id).from("membresias").select("profile_id").eq("negocio_id", n.id).eq("rol", "admin").is("deleted_at", null).order("created_at").limit(1);
  const id = data?.[0]?.profile_id;
  const s = await sesionDe(id, host(n));
  return { id, ...s, api: comoPersona(s.token, n.id) };
}

const nav = await abrirNavegador();
async function abrir(n, cookies, ruta) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(cookies);
  await ctx.route("**/*", (r) => {
    const m = r.request().method();
    const h = r.request().headers();
    if (h["next-router-prefetch"] || h["purpose"] === "prefetch") return r.abort();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS" || /\/auth\/v1\/token/.test(r.request().url())) return r.continue();
    return r.abort();
  });
  const p = await ctx.newPage();
  await p.goto(`https://${host(n)}${ruta}`, { waitUntil: "load" });
  await p.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  return p;
}
const texto = async (p) => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");

try {
  if (corre("n162")) {
    console.log("N162 · negocios PRUEBA S62: una cuenta con saldo a favor se enseña así en Caja, nunca «Pagada»");
    for (const n of [H, E, V]) {
      const a = await adminDe(n);
      const { data: rs } = await servicioEn(n.id).from("reservas").select("id").eq("negocio_id", n.id).is("deleted_at", null).order("created_at", { ascending: false }).order("id").limit(200);
      const neg = [];
      for (const r of rs ?? []) {
        const { data } = await a.api.rpc("cuenta_totales_reserva", { p_reserva_id: r.id });
        if (Number(data?.[0]?.saldo) < -0.005) neg.push(r.id);
      }
      if (!neg.length) { console.log(`  · ${n.slug}: sin cuentas a favor`); continue; }
      for (const id of neg.slice(0, 3)) {
        const p = await abrir(n, a.cookies, `/caja/cobrar/${id}`);
        const aFavor = await p.locator("[data-cuenta-saldo-a-favor]").count();
        const t = await texto(p);
        revisa(aFavor === 1 && !/Cuenta pagada/.test(t), `${n.slug} · ${id.slice(0, 8)}: ${aFavor ? "«Saldo a favor»" : /Cuenta pagada/.test(t) ? "dice «Cuenta pagada»" : "no dice saldo a favor"}`);
        await p.context().close();
      }
    }
  }
  if (corre("n163")) {
    console.log("N163 · hotel S62: la tarjeta de $200 devuelta completa");
    const a = await adminDe(H);
    const { data } = await a.api.rpc("tarjetas_manuales_por_revisar", { p_historial: false });
    const sigue = (data ?? []).find((t) => t.id === "2fae209e-edca-4229-b872-44fba2a21c35");
    revisa(!sigue, `ya no espera revisión (${sigue ? `sigue: monto ${sigue.monto}, devuelto ${sigue.devuelto}` : "fuera"})`);
    const p = await abrir(H, a.cookies, "/admin");
    revisa(!/\$200(\.00)? sin verificar/.test(await texto(p)), "el inicio no dice «$200.00 sin verificar»");
    await p.context().close();
  }
  if (corre("n164")) {
    console.log("N164 · estética S62: cita ca67d3e5 de $450 corregida a $550");
    const a = await adminDe(E);
    const p = await abrir(E, a.cookies, "/estetica/ca67d3e5-b1c8-4ed4-b7fe-0070c3ff4b82");
    const precio = await p.locator("[data-precio-cita]").first().getAttribute("data-precio-cita").catch(() => null);
    const t = await texto(p);
    revisa(precio === "550.00" || /Precio: \$550\.00/.test(t), `el detalle dice $550.00 (${precio ?? t.match(/Precio: \$[\d,.]+/)?.[0]})`);
    await p.context().close();
    const { data: abiertas } = await a.api.rpc("cuentas_abiertas_json", { p_dias: 60 });
    const c = (abiertas ?? []).find((x) => x.reserva_id === "6842289c-2acf-4384-866c-cd1bc7a6663f");
    revisa(!c || !/Corrección/.test(c.descripcion), `en Caja: «${c?.descripcion ?? "(no está abierta)"}»`);
  }
  if (corre("medico")) {
    console.log("Médico · vet S62: «Tu equipo» de la bienvenida");
    const a = await adminDe(V);
    const p = await abrir(V, a.cookies, "/bienvenida/equipo");
    const t = await texto(p);
    revisa(!/PRUEBA Médico S62 · Estética/.test(t) && /Médico veterinario/.test(t), `«${t.match(/PRUEBA Médico S62 · [^·]+?(?= [A-Z]|$)/)?.[0] ?? "no encontré al médico"}»`);
    await p.context().close();
  }
  if (corre("ciego")) {
    console.log("Corte ciego · el admin que tiene el turno abierto");
    for (const n of [H, E, V]) {
      const { data: t } = await servicioEn(n.id).from("turnos_caja").select("id, abierto_por, abierto_at").eq("negocio_id", n.id).eq("estado", "abierto").is("deleted_at", null).maybeSingle();
      if (!t) { console.log(`  · ${n.slug}: sin turno abierto`); continue; }
      const { data: m } = await servicioEn(n.id).from("membresias").select("rol").eq("negocio_id", n.id).eq("profile_id", t.abierto_por).is("deleted_at", null).maybeSingle();
      if (m?.rol !== "admin") { console.log(`  · ${n.slug}: el turno lo abrió ${m?.rol ?? "alguien"}, no un admin`); continue; }
      const s = await sesionDe(t.abierto_por, host(n));
      const api = comoPersona(s.token, n.id);
      const dia = t.abierto_at.slice(0, 10);
      const { data } = await api.rpc("caja_movimientos", { p_desde: dia, p_hasta: new Date().toISOString().slice(0, 10), p_turno: t.id });
      revisa(data?.ciego === true && data?.totales_por_metodo == null, `${n.slug}: el historial no le da totales del turno a quien lo tiene (ciego: ${data?.ciego})`);
    }
  }
  if (corre("reporte")) {
    console.log("Reporte · cuentas con saldo a favor (negativo) en todos los negocios");
    const { data: negs } = await S.from("negocios").select("id, slug, nombre, plan").is("deleted_at", null);
    const filas = [];
    for (const n of negs ?? []) {
      const db = createClient(URL_PROD, llavesProd().servicio, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": n.id } } });
      let desde = 0;
      const ids = [];
      for (;;) {
        const { data } = await db.from("reservas").select("id, created_at, cliente_id").eq("negocio_id", n.id).is("deleted_at", null).order("created_at").order("id").range(desde, desde + 999);
        ids.push(...(data ?? []));
        if (!data || data.length < 1000) break;
        desde += 1000;
      }
      for (let i = 0; i < ids.length; i += 15) {
        const lote = ids.slice(i, i + 15);
        const res = await Promise.all(lote.map((r) => db.rpc("cuenta_totales_reserva", { p_reserva_id: r.id }).then((x) => ({ r, t: x.data?.[0] }))));
        for (const { r, t } of res) {
          if (t && Number(t.saldo) < -0.005) filas.push({ negocio: n.slug, prueba: /prueba|demo|clinicademo|huellitas/i.test(`${n.slug} ${n.plan}`), reserva: r.id, creada: r.created_at.slice(0, 10), total: Number(t.total_cuenta), cobrado: Number(t.total_cobrado), devuelto: Number(t.total_devuelto), saldo: Number(t.saldo), cliente_id: r.cliente_id });
        }
      }
    }
    const reales = filas.filter((f) => !f.prueba);
    const nombres = new Map();
    for (const f of reales) {
      if (!nombres.has(f.cliente_id)) {
        const n = (negs ?? []).find((x) => x.slug === f.negocio);
        const { data } = await createClient(URL_PROD, llavesProd().servicio, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": n.id } } }).from("clientes").select("nombre").eq("id", f.cliente_id).maybeSingle();
        nombres.set(f.cliente_id, data?.nombre ?? "—");
      }
    }
    console.log(`  Negocios reales: ${reales.length} cuenta(s) con saldo a favor (se enseñaban como «Pagada»):`);
    for (const f of reales) console.log(`    · ${f.negocio} · ${f.creada} · ${nombres.get(f.cliente_id)} · total $${f.total} · cobrado $${f.cobrado} · devuelto $${f.devuelto} · a favor $${(-f.saldo).toFixed(2)} · reserva ${f.reserva}`);
    console.log(`  Negocios de prueba: ${filas.length - reales.length} cuenta(s).`);
  }
} finally {
  await nav.close();
}
console.log(hallazgos.length ? `\n${hallazgos.length} hallazgo(s).` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
