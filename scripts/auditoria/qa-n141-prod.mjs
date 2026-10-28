// QA S41 · N141 en PRODUCCIÓN (prueba-qa-onboarding-estetica-s16): cuántas peticiones lanza una pantalla al cargar
// (y cuántas son precargas de otras pantallas) y cuánto tarda «Confirmar inicio» apretado en cuanto se puede, como
// celular con red lenta. Sirve para medir antes y después de quitar la precarga automática del menú.
//
//   node scripts/auditoria/qa-n141-prod.mjs [--rapida] [--veces 3]
//
// --rapida: sin emular la red lenta ni el celular. Crea cada vez una cita «PRUEBA QA S41» del día (por el mismo camino
// que «Agendar cita»: crear_reserva_para_cita + citas_estetica con la sesión del admin) y al terminar la cancela.
import { comoPersona, negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const RAPIDA = process.argv.includes("--rapida");
const VECES = Number(process.argv.includes("--veces") ? process.argv[process.argv.indexOf("--veces") + 1] : 2);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const E = await negocioPrueba("prueba-qa-onboarding-estetica-s16");
const s = await E.sesion("admin");
const api = comoPersona(s.token, E.negocio.id);
const { data: perro } = await E.N.from("perros").select("id").eq("negocio_id", E.negocio.id).eq("nombre", "PRUEBA QA S41 Perro Est").is("deleted_at", null).single();
const { data: ultima } = await E.N.from("citas_estetica").select("servicio_id, empleado_id").eq("perro_id", perro.id).order("created_at", { ascending: false }).limit(1).single();

async function citaNueva(k) {
  const { data: reservaId, error: e1 } = await api.rpc("crear_reserva_para_cita", { p_perro_id: perro.id });
  if (e1) throw new Error(`crear_reserva_para_cita: ${e1.message}`);
  // Hoy, de madrugada (06:00–06:50) y distinta en cada corrida: no choca con otra cita de QA.
  const hoy = (await api.rpc("fecha_negocio")).data;
  const minuto = (Math.floor(Date.now() / 60000) + k * 7) % 50;
  const inicio = new Date(`${hoy}T06:${String(minuto).padStart(2, "0")}:00-06:00`).toISOString();
  const { data, error } = await api.from("citas_estetica").insert({ reserva_id: reservaId, perro_id: perro.id, servicio_id: ultima.servicio_id, empleado_id: ultima.empleado_id, inicio }).select("id").single();
  if (error) throw new Error(`cita: ${error.message}`);
  return data.id;
}

const nav = await abrirNavegador();
const filas = [];
const creadas = [];
try {
  for (const [ruta, nombre] of [["/", "inicio"], ["/recepcion", "tablero"], ["/estetica", "agenda de estética"]]) {
    const c = await nav.newContext(RAPIDA ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await c.addCookies(s.cookies);
    const p = await c.newPage();
    if (!RAPIDA) {
      const cdp = await c.newCDPSession(p);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 });
    }
    let total = 0, precargas = 0;
    p.on("request", (r) => {
      if (/_next\/static|\.(png|svg|ico|woff2?|jpg|webp|avif)(\?|$)/.test(r.url())) return;
      total += 1;
      if (r.headers()["next-router-prefetch"]) precargas += 1;
    });
    await p.goto(`${E.base}${ruta}`, { timeout: 120000 });
    // Hasta que la página termine de cargar su código y de precargar: 10 s seguidos sin peticiones nuevas (tope 3 min).
    let ultimo = total, quieto = Date.now();
    const tCarga = Date.now();
    while (Date.now() - tCarga < 180000 && Date.now() - quieto < 10000) {
      await espera(500);
      if (total !== ultimo) { ultimo = total; quieto = Date.now(); }
    }
    filas.push(`${nombre} (${new URL(p.url()).pathname}): ${total} peticiones al cargar (sin archivos estáticos), ${precargas} precargas de otras pantallas`);
    await c.close();
  }

  for (let k = 0; k < VECES; k++) {
    const citaId = await citaNueva(k);
    creadas.push(citaId);
    const c = await nav.newContext(RAPIDA ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await c.addCookies(s.cookies);
    const p = await c.newPage();
    if (!RAPIDA) {
      const cdp = await c.newCDPSession(p);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 });
    }
    let total = 0, precargas = 0;
    p.on("request", (r) => {
      if (/_next\/static|\.(png|svg|ico|woff2?|jpg|webp|avif)(\?|$)/.test(r.url())) return;
      total += 1;
      if (r.headers()["next-router-prefetch"]) precargas += 1;
    });
    // Como QA: abre la cita y aprieta en cuanto los botones responden (sin esperar a que termine de precargar nada).
    await p.goto(`${E.base}/estetica/${citaId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const iniciar = p.getByRole("button", { name: "Iniciar cita" });
    await iniciar.waitFor({ timeout: 60000 });
    // Con la red lenta, el código de la página tarda en llegar: se aprieta hasta que el botón responde.
    const entrega = p.locator("#cita-entrega-nombre");
    const tCarga = Date.now();
    while (!(await entrega.count()) && Date.now() - tCarga < 90000) {
      await iniciar.click().catch(() => {});
      await espera(1000);
    }
    await entrega.waitFor({ timeout: 5000 });
    await entrega.fill("PRUEBA QA S41");
    const t0 = Date.now();
    await p.locator("[data-confirmar-inicio]").click();
    let ms = null;
    while (Date.now() - t0 < 60000) {
      await espera(100);
      const b = p.locator("[data-confirmar-inicio]");
      if (!(await b.count())) { ms = Date.now() - t0; break; }
      const t = (await b.innerText().catch(() => "")).trim();
      if (/recibirla/.test(t)) await b.click();
    }
    const estado = (await E.N.from("citas_estetica").select("estado").eq("id", citaId).single()).data?.estado;
    filas.push(`«Confirmar inicio» #${k + 1}: ${ms === null ? "SIGUE en «Guardando…» a los 60 s" : `${ms} ms`} (base: ${estado}); al abrir la cita: ${total} peticiones, ${precargas} precargas`);
    await c.close();
    // Se cancela antes de la siguiente vuelta (si no, la siguiente cita se encima con esta).
    if (estado === "en_curso") await api.rpc("deshacer_inicio_cita", { p_cita_id: citaId, p_destino: "cancelada", p_motivo: "Cita de la prueba automática QA S41 (N141)" });
    else await api.rpc("cancelar_cita_estetica", { p_cita_id: citaId, p_motivo: "Cita de la prueba automática QA S41 (N141)", p_no_llego: false });
  }
} finally {
  await nav.close();
  // Ninguna cita de la prueba se queda viva (si algo se cortó a medias).
  for (const id of creadas) {
    const { data } = await E.N.from("citas_estetica").select("estado").eq("id", id).single();
    if (data?.estado === "en_curso") await api.rpc("deshacer_inicio_cita", { p_cita_id: id, p_destino: "cancelada", p_motivo: "Cita de la prueba automática QA S41 (N141)" });
    else if (data?.estado === "reservada") await api.rpc("cancelar_cita_estetica", { p_cita_id: id, p_motivo: "Cita de la prueba automática QA S41 (N141)", p_no_llego: false });
  }
}
console.log(`N141 · ${RAPIDA ? "escritorio, red normal" : "celular, red lenta (400 ms, ~400 kbps)"}`);
for (const f of filas) console.log(`  · ${f}`);
