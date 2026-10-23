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

// ── QA S27: los guardados de los formularios de cliente, perro y cita (lo que hace cada acción en la base), en una
// transacción que se deshace. Cada paso con clock_timestamp(); 3 corridas, la primera en frío.
const perroCita = (await cli.sql(`select p.id from perros p join perro_grupo_raza g on g.perro_id = p.id where p.negocio_id='${neg}' and p.deleted_at is null and not p.fallecido and not g.sin_grupo and p.tamano_id is not null and p.pelaje_id is not null order by p.created_at limit 1`))[0]?.id;
const servicio = (await cli.sql(`select id from servicios where negocio_id='${neg}' and categoria='estetica' and deleted_at is null and id in (select servicio_id from tarifas where negocio_id='${neg}' and deleted_at is null) order by orden limit 1`))[0]?.id;
const clienteEdit = (await cli.sql(`select id from clientes where negocio_id='${neg}' and deleted_at is null and not publico_general order by created_at limit 1`))[0].id;
const perroEdit = (await cli.sql(`select id from perros where negocio_id='${neg}' and deleted_at is null order by created_at limit 1`))[0].id;
const guardados = `
do $m$
declare t0 timestamptz; v_cli uuid; v_res uuid; v_cita uuid;
begin
  t0 := clock_timestamp();
  insert into public.clientes (nombre, telefono) values ('Medición S27', '55' || lpad((floor(random() * 1e8))::bigint::text, 8, '0')) returning id into v_cli;
  insert into pg_temp.t values ('cliente nuevo (insert)', extract(epoch from clock_timestamp() - t0) * 1000);
  t0 := clock_timestamp();
  update public.clientes set nombre = nombre where id = '${clienteEdit}';
  insert into pg_temp.t values ('cliente editar (update)', extract(epoch from clock_timestamp() - t0) * 1000);
  t0 := clock_timestamp();
  insert into public.perros (cliente_id, nombre, raza) values (v_cli, 'Medición', 'Mestizo');
  insert into pg_temp.t values ('perro nuevo (insert)', extract(epoch from clock_timestamp() - t0) * 1000);
  t0 := clock_timestamp();
  update public.perros set nombre = nombre where id = '${perroEdit}';
  insert into pg_temp.t values ('perro editar (update)', extract(epoch from clock_timestamp() - t0) * 1000);
  ${perroCita && servicio ? `
  begin
    t0 := clock_timestamp();
    v_res := public.crear_reserva_para_cita('${perroCita}'::uuid);
    insert into public.citas_estetica (reserva_id, perro_id, servicio_id, empleado_id, inicio)
    values (v_res, '${perroCita}', '${servicio}', '${adm}', date_trunc('hour', now()) + interval '30 days 3 hours') returning id into v_cita;
    insert into pg_temp.t values ('cita nueva (reserva+insert)', extract(epoch from clock_timestamp() - t0) * 1000);
  exception when others then
    insert into pg_temp.t values ('cita nueva ERR ' || left(sqlerrm, 60), -1);
  end;` : ""}
end
$m$;`;
const resG = {};
for (let i = 0; i < 3; i++) {
  try {
    const filas = await cli.sql(`begin;
create temp table t (k text, ms numeric) on commit drop;
grant all on pg_temp.t to authenticated;
select set_config('request.jwt.claims','{"sub":"${adm}","role":"authenticated"}',true), set_config('app.negocio_id','${neg}',true);
set local role authenticated;
${guardados}
reset role;
select k, round(ms)::int as ms from pg_temp.t;
rollback;`, 120000);
    for (const f of filas) (resG[f.k] ??= []).push(f.ms);
  } catch (e) {
    console.log("ERR guardados", e.message.slice(0, 300));
    break;
  }
}
console.log(`guardados de ${slug} (ms en la base, 3 corridas):`);
for (const [k, t] of Object.entries(resG)) console.log(`  ${k.padEnd(30)} ${t.join(" / ")}`);
