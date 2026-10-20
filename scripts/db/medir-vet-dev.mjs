// Uso: node scripts/db/medir-vet-dev.mjs [slug]   (SOLO DESARROLLO; por omisión huellitas)
//
// QA S19: tiempo en la base de lo que hace Veterinaria en Caja y en la consulta, como admin del negocio
// (JWT simulado + negocio de la petición), TODO dentro de una transacción que se deshace: no escribe nada.
// Mide cada paso con clock_timestamp() y repite la corrida 3 veces (la primera en frío).
import { clienteApi, DEV } from "../nube/migraciones-api.mjs";
const cli = await clienteApi(DEV);
const slug = (process.argv[2] ?? "huellitas").replace(/[^a-z0-9-]/g, "");
const neg = (await cli.sql(`select id from negocios where slug='${slug}'`))[0]?.id;
if (!neg) throw new Error(`No hay negocio «${slug}» en desarrollo.`);
const adm = (await cli.sql(`select profile_id from membresias where negocio_id='${neg}' and rol='admin' and deleted_at is null order by created_at limit 1`))[0].profile_id;
const perro = (await cli.sql(`select id from perros where negocio_id='${neg}' and deleted_at is null and coalesce(especie,'perro')='perro' order by created_at limit 1`))[0].id;

const cuerpo = `
do $m$
declare
  t0 timestamptz; v_med uuid; v_c uuid; v_res uuid; v_cobro uuid; v_turno uuid; v_lin uuid; v jsonb;
  procedure_ms text;
begin
  -- Preparación (no se mide): médico, borrador con diagnóstico, sin turno abierto.
  select id into v_med from public.medicos_veterinarios where profile_id = '${adm}' and deleted_at is null;
  if v_med is null then v_med := public.guardar_medico_veterinario('${adm}'::uuid, '1234567', null); end if;
  update public.turnos_caja set estado = estado where false;

  t0 := clock_timestamp();
  insert into public.turnos_caja (fondo_inicial) values (0) returning id into v_turno;
  insert into pg_temp.t values ('abrir turno (insert)', extract(epoch from clock_timestamp() - t0) * 1000);

  t0 := clock_timestamp();
  v_c := public.vet_consulta_iniciar('${perro}'::uuid, null, 'consulta', v_med);
  insert into pg_temp.t values ('vet_consulta_iniciar', extract(epoch from clock_timestamp() - t0) * 1000);
  perform public.vet_consulta_guardar(v_c, '{"motivo":"Medición","diagnosticos":[{"ref_id":null,"origen":"libre","nombre":"Otitis","tipo":"presuntivo","nota":""}]}'::jsonb);

  t0 := clock_timestamp();
  v := public.vet_consulta_cargos(v_c);
  insert into pg_temp.t values ('vet_consulta_cargos', extract(epoch from clock_timestamp() - t0) * 1000);

  t0 := clock_timestamp();
  perform public.vet_consulta_detalle(v_c);
  insert into pg_temp.t values ('vet_consulta_detalle', extract(epoch from clock_timestamp() - t0) * 1000);

  t0 := clock_timestamp();
  perform public.carnet_de_mascota('${perro}'::uuid);
  insert into pg_temp.t values ('carnet_de_mascota', extract(epoch from clock_timestamp() - t0) * 1000);

  select (l->>'id')::uuid into v_lin from jsonb_array_elements(v->'lineas') l where l->>'tipo' = 'consulta' limit 1;
  t0 := clock_timestamp();
  perform public.vet_consulta_cargo_ajustar(v_lin, 1, 350, 'Medición');
  insert into pg_temp.t values ('vet_consulta_cargo_ajustar', extract(epoch from clock_timestamp() - t0) * 1000);

  t0 := clock_timestamp();
  v := public.vet_consulta_firmar(v_c);
  insert into pg_temp.t values ('vet_consulta_firmar', extract(epoch from clock_timestamp() - t0) * 1000);

  select reserva_id into v_res from public.cargos_aplicados where reserva_id is not null and deleted_at is null order by created_at desc limit 1;
  t0 := clock_timestamp();
  perform * from public.cuenta_totales_reserva(v_res);
  insert into pg_temp.t values ('cuenta_totales_reserva', extract(epoch from clock_timestamp() - t0) * 1000);
  t0 := clock_timestamp();
  perform * from public.cuenta_lineas_reserva(v_res);
  insert into pg_temp.t values ('cuenta_lineas_reserva', extract(epoch from clock_timestamp() - t0) * 1000);

  t0 := clock_timestamp();
  v := to_jsonb(public.registrar_cobro(v_res, null, '[{"metodo":"efectivo","monto":350}]'::jsonb));
  insert into pg_temp.t values ('registrar_cobro', extract(epoch from clock_timestamp() - t0) * 1000);
  select id into v_cobro from public.cobros where reserva_id = v_res order by created_at desc limit 1;

  t0 := clock_timestamp();
  perform public.anular_cobro(v_cobro, 'Medición');
  insert into pg_temp.t values ('anular_cobro', extract(epoch from clock_timestamp() - t0) * 1000);

  t0 := clock_timestamp();
  perform public.veterinaria_atencion();
  insert into pg_temp.t values ('veterinaria_atencion', extract(epoch from clock_timestamp() - t0) * 1000);
  t0 := clock_timestamp();
  perform public.cuentas_abiertas_json(30);
  insert into pg_temp.t values ('cuentas_abiertas_json', extract(epoch from clock_timestamp() - t0) * 1000);
  t0 := clock_timestamp();
  perform * from public.resumen_turno(v_turno);
  insert into pg_temp.t values ('resumen_turno', extract(epoch from clock_timestamp() - t0) * 1000);
end
$m$;`;

const res = {};
for (let i = 0; i < 3; i++) {
  const sql = `begin;
create temp table t (k text, ms numeric) on commit drop;
grant all on pg_temp.t to authenticated;
update public.turnos_caja set estado = 'cerrado', cerrado_at = now() where negocio_id = '${neg}' and estado = 'abierto';
select set_config('request.jwt.claims','{"sub":"${adm}","role":"authenticated"}',true), set_config('app.negocio_id','${neg}',true);
set local role authenticated;
${cuerpo}
reset role;
select k, round(ms)::int as ms from pg_temp.t;
rollback;`;
  try {
    const filas = await cli.sql(sql, 180000);
    for (const f of filas) (res[f.k] ??= []).push(f.ms);
  } catch (e) {
    console.log("ERR", e.message.slice(0, 400));
    break;
  }
}
console.log(`${slug} (ms en la base, 3 corridas):`);
for (const [k, t] of Object.entries(res)) console.log(`  ${k.padEnd(28)} ${t.join(" / ")}`);
