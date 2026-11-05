// Operación A4 (4 de noviembre de 2026, pedido del dueño): Ludogteka cambió la vigencia de Bordetella a 12 meses, pero
// cada aplicación guarda la vigencia con la que se capturó (vigencia_meses_aplicado) y la fecha de vencimiento es una
// columna generada de ahí: las cartillas seguían venciendo a 6 meses. Se recalculan TODAS las aplicaciones vigentes del
// requisito con la vigencia actual del tipo (fecha de aplicación + vigencia). Con la llave de servicio acotada al negocio
// (la protección del registro sanitario bloquea a authenticated/anon, no al servicio), respaldo de cada fila y conteo de
// perros bloqueados antes y después con la RLS del admin del negocio.
//   node scripts/operacion/a4-vigencia-requisitos.mjs --clave bordetella --revisar
//   LUDOGTEKA_OPERACION=1 node scripts/operacion/a4-vigencia-requisitos.mjs --clave bordetella --aplicar
// Reversa: poner vigencia_meses_aplicado del respaldo fila por fila.
// Corrección de fondo (todos los negocios): migración 20261203002600 — al cambiar la vigencia de un tipo se recalculan
// sus aplicaciones y la función devuelve cuántas cambiaron (rama fix/vigencia-requisitos).
import { leer, escribir, respaldar, LUDOGTEKA_ID as L, diaMx } from "./ludogteka-prod.mjs";
import { tokenDe, comoPersona } from "./sesion-prod.mjs";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const clave = args[args.indexOf("--clave") + 1];
if (!clave || clave.startsWith("--")) throw new Error("Falta --clave <clave del requisito>.");

const [tipo] = await leer(`tipos_requisito_sanitario?negocio_id=eq.${L}&clave=eq.${clave}&deleted_at=is.null&select=id,etiqueta,vigencia_meses`);
if (!tipo) throw new Error(`No existe el requisito «${clave}» en Ludogteka.`);
const filas = await leer(`requisitos_sanitarios_aplicados?negocio_id=eq.${L}&tipo_requisito_id=eq.${tipo.id}&deleted_at=is.null&vigencia_meses_aplicado=neq.${tipo.vigencia_meses}&select=id,perro_id,fecha_aplicacion,vigencia_meses_aplicado,fecha_vencimiento,anulado_at`, { todas: true });
const vivas = filas.filter((f) => !f.anulado_at);

const R = comoPersona(await tokenDe("1d24ded5-632c-43d2-9feb-8644d65b7407"));
async function bloqueados() {
  const perros = await R.leer(`perros?select=id&deleted_at=is.null&fallecido=eq.false&limit=1000`);
  const ids = perros.map((p) => p.id);
  const est = [];
  for (let i = 0; i < ids.length; i += 150) est.push(...(await R.leer(`perro_requisitos_sanitarios_estado?select=perro_id,perro_nombre,clave,estado&perro_id=in.(${ids.slice(i, i + 150).join(",")})&limit=1000`)));
  const por = {};
  for (const f of est) if (["vencida", "sin_registro"].includes(f.estado)) (por[f.perro_id] ??= { nombre: f.perro_nombre, por: [] }).por.push(f.clave);
  return { total: ids.length, bloqueados: por };
}
const antes = await bloqueados();
console.log(`«${tipo.etiqueta}» vigencia actual ${tipo.vigencia_meses} meses · aplicaciones con otra vigencia: ${vivas.length} (${filas.length - vivas.length} anuladas se dejan) · perros activos ${antes.total}, bloqueados hoy ${Object.keys(antes.bloqueados).length}`);
for (const f of vivas.slice(0, 40)) console.log(`  · ${f.id.slice(0, 8)} aplicada ${f.fecha_aplicacion} · ${f.vigencia_meses_aplicado} m → vence ${f.fecha_vencimiento}`);
if (vivas.length === 0) { console.log("✔ Nada que recalcular."); process.exit(0); }
if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }
if (process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Exige LUDOGTEKA_OPERACION=1.");
console.log("respaldo:", respaldar(`a4-${clave}-aplicaciones`, { tipo, filas: vivas, bloqueadosAntes: antes.bloqueados }));
let n = 0;
for (let i = 0; i < vivas.length; i += 100) {
  const ids = vivas.slice(i, i + 100).map((f) => f.id).join(",");
  n += (await escribir("requisitos_sanitarios_aplicados", `id=in.(${ids})`, { vigencia_meses_aplicado: tipo.vigencia_meses })).length;
}
const despues = await bloqueados();
const liberados = Object.entries(antes.bloqueados).filter(([id]) => !despues.bloqueados[id]).map(([, p]) => p.nombre);
const soloEste = Object.entries(antes.bloqueados).filter(([id, p]) => p.por.includes(clave) && despues.bloqueados[id] && !despues.bloqueados[id].por.includes(clave)).map(([, p]) => `${p.nombre} (${p.por.filter((x) => x !== clave).join(", ")})`);
console.log(`✔ recalculadas ${n} aplicaciones · bloqueados: ${Object.keys(antes.bloqueados).length} → ${Object.keys(despues.bloqueados).length} · pasaron a habilitados: ${liberados.length}${liberados.length ? " → " + liberados.join(", ") : ""}`);
if (soloEste.length) console.log(`  ya no les falta «${tipo.etiqueta}» pero siguen bloqueados por otro requisito: ${soloEste.join("; ")}`);
console.log("bitácora:", respaldar(`a4-${clave}-resultado`, { recalculadas: n, liberados, siguenBloqueados: soloEste, hoy: diaMx(new Date().toISOString()) }));
