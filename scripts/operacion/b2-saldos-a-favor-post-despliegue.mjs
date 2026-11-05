// Operación B2 (pedido del dueño del 5 de noviembre de 2026; docs/OPERACIONES-PRODUCCION.md): lo que B1 no pudo hacer
// porque la base no permitía salir de «no llegó» ni cobrar en una cuenta cancelada. CORRE DESPUÉS de desplegar la rama
// fix/revertir-operaciones (migración 20261203004300: reabrir_estancia, reabrir_cuenta). Con la sesión real de Ronith.
//
//  1. Estancias marcadas «no llegó» que sí ocurrieron → finalizadas con check-in/check-out tardío (horas estimadas, dichas
//     en las notas); el día de pase que ya tenían se queda (nunca se devolvió):
//       · Blacky 22/10 (1d3cc3ea, fresh start)            → entra 22/10 10:51 (cuando se capturó), sale 22/10 19:00
//       · Raya 26/10 (7448aab2, fresh start)              → entra 26/10 10:00, sale 26/10 19:00
//       · Blacky 26/10 (e16a068b, fresh start)            → entra 26/10 10:00, sale 26/10 19:00
//       · Vincent hotel 20–23/10 (ec3ffe11, «no llegó» del 31/10 11:57) → entra 20/10 15:43 (cuando se capturó), sale 23/10 12:00
//     Con eso: la cuenta de Raya/Blacky del 22 deja de tener −$350 y la de Vincent queda en $900 = cobrado.
//  2. Daniela Reyes: reabrir la cuenta del baño exprés de Bruno (ae9a96ce, cancelada el 16/10 por error de captura) y
//     registrar los $190 por transferencia (su parte de los $255 del 12 de octubre; B1 anuló el cobro de $255 y registró $65).
//   node scripts/operacion/b2-saldos-a-favor-post-despliegue.mjs --revisar
//   LUDOGTEKA_OPERACION=1 node scripts/operacion/b2-saldos-a-favor-post-despliegue.mjs --aplicar
// Reversa: cada paso queda en operaciones_revertidas; las estancias se regresan con revertir_checkout_estancia + «no llegó»;
// el cobro de $190 se anula con anular_cobro.
import { rpc, respaldar, dinero, horaMx } from "./ludogteka-prod.mjs";
import { tokenDe, comoPersona } from "./sesion-prod.mjs";

const APLICAR = process.argv.includes("--aplicar");
const RONITH = "1d24ded5-632c-43d2-9feb-8644d65b7407";
const R = comoPersona(await tokenDe(RONITH));
const log = (...a) => console.log(...a);
const totales = async (reserva) => (await R.rpc("cuenta_totales_reserva", { p_reserva_id: reserva }).then((x) => (Array.isArray(x) ? x[0] : x))) ?? {};
const cuenta = (t) => `total ${dinero(t.total_cuenta)} · cobrado ${dinero(t.total_cobrado)} · pase ${dinero(t.total_bono)} · saldo ${dinero(t.saldo)}`;
if (APLICAR && process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Exige LUDOGTEKA_OPERACION=1.");

const ESTANCIAS = [
  { id: "1d3cc3ea-cba3-41c0-a53d-de4fb47ce457", quien: "Blacky 22/10", entrada: "2026-10-22T16:51:29+00:00", salida: "2026-10-23T01:00:00+00:00", nota: "entrada 10:51 (cuando se capturó), salida 19:00 (cierre)" },
  { id: "7448aab2-c4dc-433c-b9e5-f387aa828363", quien: "Raya 26/10", entrada: "2026-10-26T16:00:00+00:00", salida: "2026-10-27T01:00:00+00:00", nota: "entrada 10:00 y salida 19:00 estimadas (la estancia se capturó el 27 a las 16:00 con el pase descontado)" },
  { id: "e16a068b-e285-4ff2-9b8e-89bb03e207cc", quien: "Blacky 26/10", entrada: "2026-10-26T16:00:00+00:00", salida: "2026-10-27T01:00:00+00:00", nota: "entrada 10:00 y salida 19:00 estimadas (la estancia se capturó el 27 a las 16:00 con el pase descontado)" },
  { id: "ec3ffe11-9235-40b0-8cf1-60afd142b916", quien: "Vincent hotel 20–23/10", entrada: "2026-10-20T21:43:53+00:00", salida: "2026-10-23T18:00:00+00:00", nota: "entrada 15:43 (cuando se capturó y se pagaron las 3 noches), salida 12:00 del 23 estimada; el 31/10 a las 11:57 se había marcado «no llegó»" },
];
const MOTIVO = "La estancia sí ocurrió: se marcó «no llegó» por limpieza (fresh start del 4 de noviembre / cierre del 31 de octubre) y dejó la cuenta con saldo a favor fantasma. Captura tardía a petición del dueño (plataforma, noviembre de 2026).";

log("== 1. Estancias «no llegó» que sí ocurrieron");
for (const e of ESTANCIAS) {
  const [fila] = await R.leer(`estancias?id=eq.${e.id}&select=id,estado,reserva_id,hora_entrada_real,hora_salida_real,notas,entregado_por_nombre,perros(nombre,clientes(nombre,telefono))`);
  if (!fila) { log(`  ✖ ${e.quien}: no encontrada`); continue; }
  log(`  ${e.quien}: ${fila.estado} · cuenta ${cuenta(await totales(fila.reserva_id))}`);
  if (fila.estado === "finalizada") { log("    ✔ ya finalizada"); continue; }
  if (!APLICAR) { log(`    haría: reabrir_estancia → check-in ${horaMx(e.entrada)} → check-out ${horaMx(e.salida)} (${e.nota})`); continue; }
  log("    respaldo:", respaldar(`b2-${e.id.slice(0, 8)}`, fila));
  if (fila.estado === "no_llego" || fila.estado === "cancelada") {
    const r = await R.rpc("reabrir_estancia", { p_estancia: e.id, p_motivo: MOTIVO });
    log("    ✔ reabierta:", JSON.stringify(r.efectos));
  }
  const dueno = fila.perros?.clientes;
  if (!fila.hora_entrada_real) {
    const [ci] = await R.patch("estancias", `id=eq.${e.id}`, { estado: "en_curso", hora_entrada_real: e.entrada, entregado_por_nombre: fila.entregado_por_nombre ?? dueno?.nombre ?? "Dueño", entregado_por_telefono: dueno?.telefono ?? null });
    log(`    ✔ check-in tardío ${horaMx(ci.hora_entrada_real)}`);
  }
  const [co] = await R.patch("estancias", `id=eq.${e.id}`, {
    estado: "finalizada", hora_salida_real: e.salida, recogido_por_nombre: dueno?.nombre ?? "Dueño", recogido_por_telefono: dueno?.telefono ?? null, recogido_por_es_dueno: true,
    notas: `${fila.notas ? fila.notas + "\n" : ""}Captura tardía (plataforma, noviembre de 2026, a petición del dueño): ${e.nota}. Antes estaba «no llegó».`,
  });
  log(`    ✔ finalizada ${horaMx(co.hora_entrada_real)} → ${horaMx(co.hora_salida_real)} · cuenta ${cuenta(await totales(fila.reserva_id))}`);
}

log("\n== 2. Daniela Reyes: reabrir la cuenta del baño exprés y registrar los $190");
const RES_BANO = "ae9a96ce-89e8-4f68-8f69-e44ae399627c";
const [cc] = await R.leer(`cuentas_canceladas?reserva_id=eq.${RES_BANO}&select=id,deleted_at,motivo,saldo_cancelado`);
const tb = await totales(RES_BANO);
log(`  cancelación: ${cc ? (cc.deleted_at ? "reabierta" : `vigente (${cc.motivo}, ${dinero(cc.saldo_cancelado)})`) : "no hay"} · cuenta ${cuenta(tb)}`);
if (Math.abs(tb.saldo) < 0.01) log("  ✔ ya está pagada");
else if (!APLICAR) log("  haría: reabrir_cuenta + registrar_cobro $190 transferencia (turno abierto)");
else {
  if (cc && !cc.deleted_at) {
    const r = await R.rpc("reabrir_cuenta", { p_reserva: RES_BANO, p_motivo: "La cuenta no era un error de captura: el baño exprés de Bruno ($190) se pagó el 12 de octubre dentro de la transferencia de $255 que se registró completa en la cuenta de la cañada. Se reabre para registrar su parte (plataforma, a petición del dueño)." });
    log("  ✔ cuenta reabierta, saldo", dinero(r.saldo));
  }
  const id = await R.rpc("registrar_cobro", { p_reserva_id: RES_BANO, p_notas: "Parte de la transferencia de $255 del 12 de octubre de 2026 (reparto hecho por la plataforma a petición del dueño; B1 anuló los $255 y registró $65 en la cañada).", p_metodos: [{ metodo: "transferencia", monto: 190 }] });
  log("  ✔ cobro $190 registrado", id, "· cuenta", cuenta(await totales(RES_BANO)));
}

log("\n== Saldos a favor que ve /admin (cuentas_saldo_a_favor 120 días)");
const s = await rpc("cuentas_saldo_a_favor", { p_dias: 120 });
if (!s.length) log("  (ninguno)");
for (const c of s) log(`  ${c.cliente_nombre} · ${c.descripcion} · ${dinero(-c.saldo)} · reserva ${c.reserva_id.slice(0, 8)}`);
