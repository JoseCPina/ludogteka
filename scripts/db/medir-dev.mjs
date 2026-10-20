// Uso: node scripts/db/medir-dev.mjs [slug]   (SOLO DESARROLLO; por omisión qa-pruebas, el negocio con más datos)
//
// Tiempo de ejecución (EXPLAIN ANALYZE, 3 veces: la primera en frío) de las funciones más llamadas
// de la app, como un admin del negocio (JWT simulado + negocio de la petición). Sirve para comparar
// antes y después de un cambio o de scripts/db/limpiar-dev.mjs. No escribe nada (todo en rollback).
import { clienteApi, DEV } from "../nube/migraciones-api.mjs";
const cli = await clienteApi(DEV);
const slug = (process.argv[2] ?? "qa-pruebas").replace(/[^a-z0-9-]/g, "");
const neg = (await cli.sql(`select id from negocios where slug='${slug}'`))[0]?.id;
if (!neg) throw new Error(`No hay negocio «${slug}» en desarrollo.`);
const adm = (await cli.sql(`select profile_id from membresias where negocio_id='${neg}' and rol='admin' and deleted_at is null limit 1`))[0].profile_id;
const reserva = (await cli.sql(`select id from reservas where negocio_id='${neg}' order by created_at desc limit 1`))[0].id;
const casos = {
  cuentas_abiertas_json: "select public.cuentas_abiertas_json(30)",
  cuenta_totales_reserva: `select * from public.cuenta_totales_reserva('${reserva}')`,
  veterinaria_atencion: "select public.veterinaria_atencion()",
  inventario_clinico_alertas: "select public.inventario_clinico_alertas()",
  ajustes_servicio_por_atender: "select * from public.ajustes_servicio_por_atender()",
  modulos_activos: "select public.modulos_activos()",
  calendario_ocupacion: "select * from public.calendario_ocupacion(current_date, current_date+30)",
};
const res = {};
for (const [k, q] of Object.entries(casos)) {
  const t = [];
  for (let i = 0; i < 3; i++) {
    try {
      const r = await cli.sql(`begin; select set_config('request.jwt.claims','{"sub":"${adm}","role":"authenticated"}',true), set_config('app.negocio_id','${neg}',true); set local role authenticated; explain (analyze, format json) ${q}; rollback;`, 120000);
      const plan = r[0]["QUERY PLAN"] ?? r[0][Object.keys(r[0])[0]];
      t.push(Math.round(plan[0]["Execution Time"]));
    } catch (e) { t.push("ERR " + e.message.slice(0, 80)); }
  }
  res[k] = t;
}
console.log(`${slug} (ms, 3 corridas):`);
for (const [k, t] of Object.entries(res)) console.log(`  ${k.padEnd(30)} ${t.join(" / ")}`);
