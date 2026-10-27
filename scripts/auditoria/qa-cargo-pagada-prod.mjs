// «Aplicar cargo» en una estancia finalizada, en PRODUCCIÓN, en el negocio PRUEBA de QA de hotel
// (prueba-qa-onboarding-hotel-s16, y solo ahí), con navegador. Antes del arreglo sirve para anotar qué se ve; después del
// despliegue, para verificarlo en el mismo negocio. Sale con 1 si algo sigue mal.
//
//   node scripts/auditoria/qa-cargo-pagada-prod.mjs [--fotos] [--escribir]
//
// Regla (N129, `admiteCargosNuevos`): una estancia finalizada solo ofrece agregarle algo a la cuenta («Aplicar cargo» en
// /reservas/<id>, «Registrar y cobrar en la cuenta» de los servicios extra en su check-out) mientras su cuenta tenga saldo
// o no se haya cobrado. Pagada (saldo $0), no.
//   · Pagada: «PRUEBA QA S24 Perro Hotel» (finalizada, $450 cobrados, saldo $0): sin «Aplicar cargo».
//   · Con saldo: «PRUEBA QA S38 Perro Hotel» (finalizada, saldo $450, nada cobrado): con «Aplicar cargo».
//   · Con --escribir (solo después de desplegar): a «QA R24 Perro Hotel» (finalizada, saldo $650, nada cobrado) se le
//     registra un cobro por su saldo (desaparece), se anula por la pantalla (reaparece) y el turno que se abrió para
//     cobrar se cierra en $0. La cuenta queda como la dejó QA: saldo $650, con el cobro anulado en su historial.
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import os from "node:os";
import path from "node:path";
import { comoPersona, negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const FOTOS = process.argv.includes("--fotos");
const ESCRIBIR = process.argv.includes("--escribir");
const hallazgos = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const ver = (t) => console.log(`    · ${t}`);
const foto = async (p, nombre) => {
  if (!FOTOS) return;
  const ruta = path.join(os.tmpdir(), `qa-cargo-pagada-${nombre}.png`);
  await p.screenshot({ path: ruta, fullPage: true });
  ver(`foto: ${ruta}`);
};

const HOT = await negocioPrueba("prueba-qa-onboarding-hotel-s16");
const nav = await abrirNavegador();
const sesion = await HOT.sesion("admin");
const api = comoPersona(sesion.token, HOT.negocio.id);
async function pagina() {
  const c = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addCookies(sesion.cookies);
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(60000);
  return p;
}
async function estanciaDe(nombre) {
  const { data: perro } = await HOT.N.from("perros").select("id").eq("negocio_id", HOT.negocio.id).eq("nombre", nombre).is("deleted_at", null).single();
  const { data: est } = await HOT.N.from("estancias").select("id, reserva_id, estado").eq("perro_id", perro.id).eq("estado", "finalizada").is("deleted_at", null).order("created_at").limit(1).single();
  return est;
}
async function totales(reservaId) {
  const { data } = await api.rpc("cuenta_totales_reserva", { p_reserva_id: reservaId });
  const t = data?.[0] ?? {};
  return { saldo: Number(t.saldo ?? 0), cobrado: Number(t.total_cobrado ?? 0) };
}
// Lo que /reservas/<id> ofrece en el bloque de la estancia.
async function ofreceCargo(p, reservaId) {
  await p.goto(`${HOT.base}/reservas/${reservaId}`);
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.locator("[data-total-cuenta]").first().waitFor({ timeout: 30000 }).catch(() => {});
  return (await p.getByLabel("Aplicar cargo", { exact: true }).count()) + (await p.locator("[data-aplicar-cargo]").count()) > 0;
}

const p = await pagina();

console.log("\nCuenta pagada · estancia finalizada sin «Aplicar cargo»");
{
  const est = await estanciaDe("PRUEBA QA S24 Perro Hotel");
  const t = await totales(est.reserva_id);
  const ofrece = await ofreceCargo(p, est.reserva_id);
  ver(`${HOT.base}/reservas/${est.reserva_id} → cobrado $${t.cobrado.toFixed(2)}, saldo $${t.saldo.toFixed(2)}; «Aplicar cargo» ${ofrece ? "SALE" : "no sale"}`);
  await foto(p, "pagada-reserva");
  if (t.saldo <= 0.005 && t.cobrado > 0 && !ofrece) bien("pagada: no ofrece «Aplicar cargo»");
  else mal(`pagada (saldo $${t.saldo.toFixed(2)}): «Aplicar cargo» ${ofrece ? "SIGUE SALIENDO" : "no sale"}`);
  // El otro camino para agregarle algo a la cuenta: los servicios extra del check-out ya hecho.
  await p.goto(`${HOT.base}/reservas/estancias/${est.id}/checkout`);
  await p.waitForLoadState("networkidle").catch(() => {});
  const extra = await p.locator("[data-servicios-extra]").getByRole("button", { name: /Registrar y cobrar en la cuenta|Programar/ }).count();
  ver(`${HOT.base}/reservas/estancias/${est.id}/checkout → formulario de servicios extra ${extra ? "SALE" : "no sale"}`);
  if (!extra) bien("pagada: el check-out ya hecho no ofrece agregar servicios extra");
  else mal("pagada: el check-out ya hecho sigue ofreciendo agregar servicios extra a la cuenta");
}

console.log("\nCuenta con saldo · estancia finalizada con «Aplicar cargo»");
{
  const est = await estanciaDe("PRUEBA QA S38 Perro Hotel");
  const t = await totales(est.reserva_id);
  const ofrece = await ofreceCargo(p, est.reserva_id);
  ver(`${HOT.base}/reservas/${est.reserva_id} → cobrado $${t.cobrado.toFixed(2)}, saldo $${t.saldo.toFixed(2)}; «Aplicar cargo» ${ofrece ? "sale" : "NO SALE"}`);
  if (t.saldo > 0.005 && ofrece) bien("con saldo: ofrece «Aplicar cargo»");
  else mal(`con saldo $${t.saldo.toFixed(2)}: «Aplicar cargo» ${ofrece ? "sale" : "NO SALE"}`);
}

if (ESCRIBIR) {
  console.log("\nCobrar y anular · «Aplicar cargo» se va y regresa");
  const est = await estanciaDe("QA R24 Perro Hotel");
  const antes = await totales(est.reserva_id);
  ver(`QA R24 Perro Hotel: cobrado $${antes.cobrado.toFixed(2)}, saldo $${antes.saldo.toFixed(2)}`);
  if (!(antes.saldo > 0.005 && antes.cobrado === 0)) {
    mal(`QA R24 ya no está como se esperaba (saldo $${antes.saldo}, cobrado $${antes.cobrado}): no se escribe nada`);
  } else {
    let { data: turno } = await api.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
    const abriTurno = !turno;
    if (abriTurno) turno = (await api.from("turnos_caja").insert({ fondo_inicial: 0, notas_apertura: "Verificación QA: Aplicar cargo con la cuenta pagada" }).select("id").single()).data;
    try {
      const { error } = await api.rpc("registrar_cobro", { p_reserva_id: est.reserva_id, p_notas: "Verificación QA (se anula enseguida)", p_metodos: [{ metodo: "efectivo", monto: antes.saldo, propina: 0 }] });
      if (error) throw new Error(`registrar_cobro: ${error.message}`);
      const pagada = await totales(est.reserva_id);
      const sinCargo = !(await ofreceCargo(p, est.reserva_id));
      ver(`cobrada: saldo $${pagada.saldo.toFixed(2)}; «Aplicar cargo» ${sinCargo ? "no sale" : "SALE"}`);
      await foto(p, "r24-pagada");
      if (pagada.saldo <= 0.005 && sinCargo) bien("al cobrar todo, «Aplicar cargo» desaparece");
      else mal(`al cobrar todo (saldo $${pagada.saldo.toFixed(2)}), «Aplicar cargo» ${sinCargo ? "no sale" : "SIGUE"}`);

      await p.goto(`${HOT.base}/reservas/${est.reserva_id}/cobrar`);
      await p.waitForLoadState("networkidle").catch(() => {});
      await p.getByRole("button", { name: "Anular cobro" }).first().click();
      await p.getByLabel("Motivo (obligatorio)").fill("Verificación QA: se cobró solo para probar «Aplicar cargo»");
      await p.getByRole("button", { name: "Anular cobro" }).last().click();
      await p.getByText(/Saldo: \$650\.00/).first().waitFor({ timeout: 30000 }).catch(() => {});
      const despues = await totales(est.reserva_id);
      const conCargo = await ofreceCargo(p, est.reserva_id);
      ver(`cobro anulado por la pantalla: saldo $${despues.saldo.toFixed(2)}; «Aplicar cargo» ${conCargo ? "sale" : "NO SALE"}`);
      await foto(p, "r24-anulada");
      if (Math.abs(despues.saldo - antes.saldo) < 0.005 && conCargo) bien("al anular el cobro, el saldo regresa y «Aplicar cargo» reaparece");
      else mal(`al anular el cobro: saldo $${despues.saldo.toFixed(2)}, «Aplicar cargo» ${conCargo ? "sale" : "NO REAPARECE"}`);
    } finally {
      if (abriTurno && turno) {
        const { error } = await api.rpc("cerrar_turno", { p_turno_id: turno.id, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: "", p_notas_cierre: "Verificación QA: el único cobro se anuló" });
        ver(`turno abierto para la prueba: ${error ? `NO se cerró (${error.message})` : "cerrado en $0"}`);
      }
    }
  }
}

await p.context().close();
await nav.close();
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exitCode = hallazgos.length ? 1 : 0;
