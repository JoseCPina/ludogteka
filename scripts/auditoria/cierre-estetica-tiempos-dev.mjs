// «Confirmar cierre» de Estética, cronometrado varias veces seguidas en DESARROLLO (Huellitas, `next start` en el 3001):
// cuánto tarda desde que se aprieta hasta que la pantalla ya no ofrece finalizar, y cuánto de eso fue la acción del
// servidor. La versión de producción (con celular y red lenta, y check-in, salida y firmar) es qa-cierres-prod.mjs.
//
//   node scripts/auditoria/cierre-estetica-tiempos-dev.mjs [--veces 4]
//
// Cada vuelta arma una cita «AUDITORIA cierre» en curso y al terminar cancela su cuenta.
import { abrirNavegador } from "../lib/navegador.mjs";

const { B, SB, datos, rpc, patch, personas, hoy, sumaDias } = await import("./veterinaria-comun-dev.mjs");
const { BASE, abrirComo } = await import("./lib/huellitas-navegador.mjs");

const VECES = Number(process.argv.includes("--veces") ? process.argv[process.argv.indexOf("--veces") + 1] : 4);
const MARCA = "AUDITORIA cierre";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const P = await personas();
const { data: base } = await SB.from("citas_estetica").select("perro_id, servicio_id").eq("negocio_id", B).eq("perro_id", datos.perroSoloB).order("created_at", { ascending: false }).limit(1).single();
const nav = await abrirNavegador();
const reservas = [];
const filas = [];
try {
  const dia0 = sumaDias(await hoy(P.admin), 400 + (Math.floor(Date.now() / 1000) % 200));
  for (let k = 0; k < VECES; k++) {
    const { data: rr } = await SB.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
    reservas.push(rr.id);
    const { data: cita, error } = await SB.from("citas_estetica").insert({ reserva_id: rr.id, perro_id: base.perro_id, servicio_id: base.servicio_id, empleado_id: datos.esteticaB, inicio: `${sumaDias(dia0, k)}T11:00:00-06:00` }).select("id").single();
    if (error) throw new Error(`cita: ${error.message}`);
    await patch(P.admin, `citas_estetica?id=eq.${cita.id}`, { estado: "en_curso", entregado_por_nombre: MARCA });
    const { c, p } = await abrirComo(nav, datos.adminB, B);
    const acciones = [];
    p.on("requestfinished", (r) => r.headers()["next-action"] && acciones.push(Math.round(r.timing().responseEnd)));
    await p.goto(`${BASE}/estetica/${cita.id}`, { waitUntil: "networkidle" }).catch(() => {});
    await p.getByRole("button", { name: "Finalizar cita" }).click();
    const recoge = p.locator("#cita-recoge-nombre");
    if (await recoge.count()) {
      await recoge.fill(MARCA);
      await p.locator("[data-quien-recoge] button").first().click();
    }
    acciones.length = 0;
    const boton = p.locator("[data-confirmar-cierre]");
    const t0 = Date.now();
    await boton.click();
    while ((await boton.count()) && Date.now() - t0 < 60000) await espera(50);
    const ms = Date.now() - t0;
    const estado = (await SB.from("citas_estetica").select("estado").eq("id", cita.id).single()).data?.estado;
    filas.push(`#${k + 1}: ${ms} ms (acción del servidor: ${acciones.join(" + ") || "—"} ms); base: ${estado}`);
    await c.close();
  }
} finally {
  await nav.close();
  for (const r of reservas) await rpc(P.admin, "cancelar_cuenta", { p_reserva_id: r, p_motivo: "error_captura", p_motivo_texto: `${MARCA}: medición automática`, p_cancelar_cita: true });
}
console.log("«Confirmar cierre» en desarrollo (Huellitas)");
for (const f of filas) console.log(`  · ${f}`);
