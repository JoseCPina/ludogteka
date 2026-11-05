// Operación A2 (4 de noviembre de 2026, pedido del dueño): las ventas del sábado 31 de octubre las capturó Fanny ese día
// y Dulce las volvió a capturar el lunes 2 de noviembre (ventas rápidas a «Público en general» o a la misma persona).
// Decisión del dueño: se ANULAN los cobros de Fanny y se conservan los de Dulce. Como los cobros de Fanny estaban en las
// cuentas reales (la cita o la estancia del perro), esas cuentas quedarían «por cobrar»: se cancelan con el motivo del
// catálogo «Error de captura» (cuentas_canceladas, con el saldo y quién), sin tocar la cita ni la estancia (siguen
// finalizadas: comisiones e historial intactos). Todo con la sesión real del admin de Ludogteka (Ronith), por las mismas
// funciones de la app (anular_cobro, cancelar_cuenta): el cobro no se borra, sale de los totales, y si su turno ya estaba
// cerrado queda como ajuste posterior al corte (el corte del 31 no cambia).
//   node scripts/operacion/a2-duplicados-31-oct.mjs --revisar
//   LUDOGTEKA_OPERACION=1 node scripts/operacion/a2-duplicados-31-oct.mjs --aplicar
import { leer, respaldar, LUDOGTEKA_ID as L, dinero, horaMx } from "./ludogteka-prod.mjs";
import { tokenDe, comoPersona } from "./sesion-prod.mjs";

const APLICAR = process.argv.includes("--aplicar");
const FANNY = "3a23d105-0e58-42d7-9ae4-bcd5f29eec54";
const DULCE = "5fcb4a04-3ca3-4533-b259-ea61eedaba43";
const RONITH = "1d24ded5-632c-43d2-9feb-8644d65b7407";
const MOTIVO = (dulce) => `Duplicado: la misma venta quedó capturada por Dulce el 2 de noviembre (cobro ${dulce.slice(0, 8)}). Anulado por la plataforma a petición del dueño, 4 de noviembre de 2026.`;

// Pareja confirmada a mano (cliente/perro, raza, concepto, monto y método): cobro de Fanny (31 oct) → cobro de Dulce (2 nov).
const PAREJAS = [
  { fanny: "ac783a29", dulce: "6325baa6", que: "Luna (Yuridia Valdez) · Baño estético rapado $320 ↔ venta «Luna rapado» $320" },
  { fanny: "34a80f97", dulce: "5fa142e4", que: "Madison, shih tzu (Sandra Monrreal) · Baño estético completo $450 ↔ venta «Shitzu estético» $450" },
  { fanny: "86943c83", dulce: "1c53d8c8", que: "Peluchin (Andrea Esparza) · Hotel 2 noches $540 ↔ venta «Hotel 2 noches» $540 (misma clienta)" },
  { fanny: "5bcc94bc", dulce: "8f24c057", que: "Nala, yorkshire (Micheye Lugo) · Baño estético completo $450 ↔ venta «Yorkie estético» $450" },
  { fanny: "0e45f8b7", dulce: "c55b4982", que: "Kira, husky (Andrés) · Baño exprés $370 ↔ venta «Husky exprés» $370" },
  { fanny: "aba6c9d1", dulce: "d21dfe02", que: "Danna, maltés (Estrella Reyes) · Baño estético rapado $320 ↔ venta «Rapado maltés» $320" },
  { fanny: "dcacdcc1", dulce: "aa1fbf14", que: "Coco, maltés (Maria Jauregui) · Baño estético completo $390 tarjeta manual ↔ venta «Maltés despunte» $390 tarjeta manual" },
  { fanny: "a111cc20", dulce: "8d303517", que: "Theo (Martha Paulina) · venta «Anticipo Theo» $270 ↔ venta «Theo una noche» $270" },
];

const sel = "id,reserva_id,origen,created_at,created_by,anulado_at,turno_id,cobro_metodos(metodo,monto,propina)";
const deFanny = await leer(`cobros?negocio_id=eq.${L}&created_by=eq.${FANNY}&created_at=gte.2026-10-31T06:00:00Z&created_at=lt.2026-11-01T06:00:00Z&deleted_at=is.null&select=${sel}&order=created_at`);
const deDulce = await leer(`cobros?negocio_id=eq.${L}&created_by=eq.${DULCE}&created_at=gte.2026-11-02T06:00:00Z&created_at=lt.2026-11-04T06:00:00Z&deleted_at=is.null&select=${sel}&order=created_at`);
const total = (c) => c.cobro_metodos.reduce((s, m) => s + Number(m.monto), 0);
const R = comoPersona(await tokenDe(RONITH));

const plan = [];
for (const p of PAREJAS) {
  const f = deFanny.find((c) => c.id.startsWith(p.fanny));
  const d = deDulce.find((c) => c.id.startsWith(p.dulce));
  if (!f || !d) throw new Error(`No encontré la pareja ${p.fanny} ↔ ${p.dulce}.`);
  if (f.anulado_at) { console.log(`  (ya anulado) ${p.que}`); continue; }
  if (Math.abs(total(f) - total(d)) > 0.005) throw new Error(`Montos distintos en ${p.que}: ${total(f)} vs ${total(d)}`);
  const [tot] = await R.rpc("cuenta_totales_reserva", { p_reserva_id: f.reserva_id }).then((x) => (Array.isArray(x) ? x : [x]));
  plan.push({ ...p, f, d, tot });
}
const sinPareja = deFanny.filter((c) => !PAREJAS.some((p) => c.id.startsWith(p.fanny)));
console.log(`Cobros de Fanny el 31 de octubre: ${deFanny.length}; con duplicado de Dulce: ${plan.length}; sin duplicado (no se tocan): ${sinPareja.length}`);
for (const p of plan) console.log(`  · ${p.que}\n      Fanny ${horaMx(p.f.created_at)} cobro ${p.f.id} ${dinero(total(p.f))} [${p.f.cobro_metodos.map((m) => m.metodo).join("+")}] · cuenta ${p.f.reserva_id}: total ${dinero(p.tot?.total_cuenta)} cobrado ${dinero(p.tot?.total_cobrado)} saldo ${dinero(p.tot?.saldo)}\n      Dulce ${horaMx(p.d.created_at)} cobro ${p.d.id} ${dinero(total(p.d))} (se conserva)`);
for (const c of sinPareja) console.log(`  · SIN PAREJA: cobro ${c.id} ${dinero(total(c))} reserva ${c.reserva_id}`);
const extraDulce = deDulce.filter((c) => c.created_at < "2026-11-02T22:00:00Z" && c.created_at > "2026-11-02T21:00:00Z" && !PAREJAS.some((p) => c.id.startsWith(p.dulce)));
for (const c of extraDulce) console.log(`  · (Dulce, misma tanda de recaptura, sin cobro de Fanny; se conserva) cobro ${c.id} ${dinero(total(c))}`);
if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }
if (process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Exige LUDOGTEKA_OPERACION=1.");

console.log("respaldo:", respaldar("a2-cobros-fanny-31-oct", { plan: plan.map((p) => ({ pareja: p.que, cobroFanny: p.f, cobroDulce: p.d, cuentaAntes: p.tot })) }));
const resultado = [];
for (const p of plan) {
  const r1 = await R.rpc("anular_cobro", { p_cobro_id: p.f.id, p_motivo: MOTIVO(p.d.id) });
  let cancelacion = null, error = null;
  try {
    cancelacion = await R.rpc("cancelar_cuenta", { p_reserva_id: p.f.reserva_id, p_motivo: "error_captura", p_motivo_texto: `Duplicado del 31 de octubre: el pago real quedó en la venta capturada por Dulce el 2 de noviembre (cobro ${p.d.id.slice(0, 8)}). Plataforma, a petición del dueño, 4 de noviembre de 2026.`, p_cancelar_cita: false });
  } catch (e) { error = e.message; }
  const [tot] = await R.rpc("cuenta_totales_reserva", { p_reserva_id: p.f.reserva_id }).then((x) => (Array.isArray(x) ? x : [x]));
  resultado.push({ pareja: p.que, anulado: r1, cuentaCancelada: cancelacion, error, cuentaDespues: tot });
  console.log(`  ✔ ${p.que}\n      anulado ${dinero(r1?.monto)} (turno del cobro cerrado: ${r1?.turno_del_cobro_cerrado}) · cuenta: ${error ? "NO cancelada: " + error.slice(0, 160) : "cancelada por error de captura"} · saldo ahora ${dinero(tot?.saldo)}`);
}
console.log("bitácora:", respaldar("a2-resultado", resultado));
