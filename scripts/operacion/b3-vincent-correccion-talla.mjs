// Operación B3 (6 de noviembre de 2026, sigue a B2; docs/OPERACIONES-PRODUCCION.md): la corrección «talla grande» +$90 de
// Vincent (hotel 20–23/10, Rocio Aguilar) la anuló la pasada de huérfanas de la migración 20261203004200 mientras la
// estancia estaba en «no llegó»; B2 la regresó a finalizada, pero reabrir_estancia solo restaura lo anulado «en automático»
// y la cuenta quedó en $810 contra $900 cobrados (−$90 en /admin). Se registra la misma corrección con corregir_precio_cuenta.
//   node scripts/operacion/b3-vincent-correccion-talla.mjs            (revisa)
//   LUDOGTEKA_OPERACION=1 node scripts/operacion/b3-vincent-correccion-talla.mjs --aplicar
// Reversa: anular_correccion_precio con motivo.
import { rpc, dinero, respaldar } from "./ludogteka-prod.mjs";
import { tokenDe, comoPersona } from "./sesion-prod.mjs";

const RESERVA = "a8d50c9c-eb93-46c0-a9f6-620c71faf5f3";
const ESTANCIA = "ec3ffe11-9235-40b0-8cf1-60afd142b916";
const R = comoPersona(await tokenDe("1d24ded5-632c-43d2-9feb-8644d65b7407"));
const totales = async () => { const x = await R.rpc("cuenta_totales_reserva", { p_reserva_id: RESERVA }); return Array.isArray(x) ? x[0] : x; };
const antes = await totales();
console.log(`antes: total ${dinero(antes.total_cuenta)} · cobrado ${dinero(antes.total_cobrado)} · saldo ${dinero(antes.saldo)}`);
if (Math.abs(antes.saldo) < 0.01) { console.log("✔ ya cuadra"); process.exit(0); }
if (Number(antes.total_cuenta) !== 810 || Number(antes.total_cobrado) !== 900) throw new Error("La cuenta no está como se esperaba: no se toca.");
if (!process.argv.includes("--aplicar")) { console.log("haría: corregir_precio_cuenta a $900"); process.exit(0); }
if (process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Exige LUDOGTEKA_OPERACION=1.");
console.log("respaldo:", respaldar("b3-vincent", { antes }));
const r = await R.rpc("corregir_precio_cuenta", { p_reserva_id: RESERVA, p_linea_tipo: "estancia", p_linea_id: ESTANCIA, p_precio_nuevo: 900, p_motivo: "Perrito talla grande / se estaba cobrando como mediano ($270): se repone la corrección del 20 de octubre, anulada cuando la estancia estaba en «no llegó»." });
console.log("✔", JSON.stringify(r).slice(0, 200));
const d = await totales();
console.log(`después: total ${dinero(d.total_cuenta)} · cobrado ${dinero(d.total_cobrado)} · saldo ${dinero(d.saldo)}`);
const s = await rpc("cuentas_saldo_a_favor", { p_dias: 120 });
console.log("saldos a favor en /admin:", s.length ? s.map((c) => `${c.cliente_nombre} ${dinero(-c.saldo)}`).join("; ") : "ninguno");
process.exit(0);
