// Operación A3 (4 de noviembre de 2026, pedido del dueño): la guardería por hora de Vincent (Rocio Aguilar Sánchez) del
// 26 de octubre quedó con el check-out hecho el 31 de octubre a las 17:35 (122 horas → $4,270) cuando lo real fueron las
// 6 horas que se cobraron ese mismo día ($210, transferencia). Se corrige la salida real a 6 horas después de la entrada
// (26 de octubre, 22:22 hora de México: el único dato real es el pago de 6 horas) y las horas cobradas a 6: la cuenta queda
// en $210 = lo cobrado, saldo $0 (ni pendiente ni a favor). Con la sesión del admin de Ludogteka (Ronith), por la API con
// las mismas reglas que la app (el disparador de estancias recotiza la línea con las horas nuevas).
//   node scripts/operacion/a3-vincent.mjs --revisar
//   LUDOGTEKA_OPERACION=1 node scripts/operacion/a3-vincent.mjs --aplicar
// Reversa: volver a poner hora_salida_real y horas del respaldo.
import { leer, respaldar, dinero, horaMx } from "./ludogteka-prod.mjs";
import { tokenDe, comoPersona } from "./sesion-prod.mjs";

const APLICAR = process.argv.includes("--aplicar");
const ESTANCIA = "eb53dd5d-61e2-4d42-b583-795a3d7e86e6";
const RESERVA = "f77bb945-a8fc-4a56-b648-c32629469aaf";
const HORAS = 6;

const R = comoPersona(await tokenDe("1d24ded5-632c-43d2-9feb-8644d65b7407"));
const [e] = await R.leer(`estancias?id=eq.${ESTANCIA}&select=id,estado,fecha_entrada,fecha_salida,hora_entrada_real,hora_salida_real,horas,precio_unitario,notas,updated_at,perros(nombre)`);
if (!e) throw new Error("No encontré la estancia.");
const [antes] = await R.rpc("cuenta_totales_reserva", { p_reserva_id: RESERVA }).then((x) => (Array.isArray(x) ? x : [x]));
const salidaNueva = new Date(new Date(e.hora_entrada_real).getTime() + HORAS * 3600 * 1000).toISOString();
console.log(`${e.perros?.nombre}: ${e.estado} · entrada real ${horaMx(e.hora_entrada_real)} · salida real ${horaMx(e.hora_salida_real)} · horas ${e.horas} × ${dinero(e.precio_unitario)}`);
console.log(`cuenta hoy: total ${dinero(antes?.total_cuenta)} cobrado ${dinero(antes?.total_cobrado)} saldo ${dinero(antes?.saldo)}`);
console.log(`cambio: salida real → ${horaMx(salidaNueva)} (${HORAS} h después de la entrada), horas → ${HORAS}; cuenta esperada ${dinero(HORAS * e.precio_unitario)}`);
if (e.horas === HORAS && Number(antes?.saldo) === 0) { console.log("✔ Ya está corregida."); process.exit(0); }
if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }
if (process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Exige LUDOGTEKA_OPERACION=1.");
console.log("respaldo:", respaldar("a3-estancia-vincent", { estancia: e, cuentaAntes: antes }));
const nota = `${e.notas ? e.notas + "\n" : ""}Corrección del 4 de noviembre de 2026 (plataforma, a petición del dueño): el check-out se había dado el 31 de octubre (122 h); la salida real fue el 26 de octubre, ${HORAS} h después de la entrada, que es lo que se cobró ($${HORAS * e.precio_unitario}).`;
const [d] = await R.patch("estancias", `id=eq.${ESTANCIA}`, { hora_salida_real: salidaNueva, horas: HORAS, notas: nota });
const [despues] = await R.rpc("cuenta_totales_reserva", { p_reserva_id: RESERVA }).then((x) => (Array.isArray(x) ? x : [x]));
console.log(`✔ estancia: salida real ${horaMx(d.hora_salida_real)} · horas ${d.horas} · cuenta: total ${dinero(despues?.total_cuenta)} cobrado ${dinero(despues?.total_cobrado)} saldo ${dinero(despues?.saldo)}`);
if (Math.abs(Number(despues?.saldo)) > 0.005) console.log("✖ La cuenta no quedó en cero: revisar.");
