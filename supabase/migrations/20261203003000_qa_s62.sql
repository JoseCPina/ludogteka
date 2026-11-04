-- QA S62 (docs/qa-historial.md). Una migración por lote; cada parte dice su bug.
--
-- Los parches a funciones grandes que ya existen se hacen sobre su definición VIGENTE (pg_get_functiondef), como en
-- las migraciones de la app para dueños: si el texto que se busca ya no está, la migración truena en lugar de dejar
-- la función a medias.

-- ── Corte ciego: UNA regla ──────────────────────────────────────────────────────────────────────────────────────
-- Quien tiene el turno abierto (quien lo abrió), sea admin o no, no ve esperados ni totales de ese turno hasta
-- cerrarlo; un admin que NO lo tiene sí los ve; recepción que no lo tiene, tampoco (también cuenta). Con el turno
-- cerrado, todos los que pueden ver el turno.
create or replace function public.ve_esperado_turno(p_turno uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select t.estado <> 'abierto' or (coalesce(public.is_admin(), false) and t.abierto_por is distinct from auth.uid())
    from public.turnos_caja t
    where t.id = p_turno and t.negocio_id = public.negocio_actual()
  ), false);
$$;
alter function public.ve_esperado_turno(uuid) owner to peludesk_definer;
revoke execute on function public.ve_esperado_turno(uuid) from public, anon;
grant execute on function public.ve_esperado_turno(uuid) to authenticated, service_role;

do $$
declare v_def text;
begin
  -- Historial: el corte ciego era «quien no es admin»; el admin que tenía el turno abierto veía sus totales.
  select replace(pg_get_functiondef('public.caja_movimientos(date, date, uuid, text, text, int, int)'::regprocedure), E'\r', '') into v_def;
  if position('(not v_admin) and exists (select 1 from movs where abierto)' in v_def) = 0 or position('m.abierto and not v_admin' in v_def) = 0 then
    raise exception 'caja_movimientos cambió: no encuentro la regla del corte ciego.';
  end if;
  v_def := replace(v_def, '(not v_admin) and exists (select 1 from movs where abierto)', 'exists (select 1 from movs where abierto and not public.ve_esperado_turno(turno_id))');
  v_def := replace(v_def, 'm.abierto and not v_admin', 'm.abierto and not public.ve_esperado_turno(m.turno_id)');
  execute v_def;

  select replace(pg_get_functiondef('public.caja_movimiento_detalle(text, uuid)'::regprocedure), E'\r', '') into v_def;
  if position('v_ciego := v_abierto and not v_admin;' in v_def) = 0 then
    raise exception 'caja_movimiento_detalle cambió: no encuentro la regla del corte ciego.';
  end if;
  v_def := replace(v_def, 'v_ciego := v_abierto and not v_admin;', 'v_ciego := v_abierto and not public.ve_esperado_turno(v_turno);');
  execute v_def;
end $$;

-- ── N164: el nombre de una cuenta no lleva sus correcciones ─────────────────────────────────────────────────────
-- La corrección de precio es una LÍNEA de la cuenta («Corrección de precio: …»), no parte de su nombre. Toda función
-- que arma el nombre juntando las descripciones de las líneas deja fuera las de ajuste. Una sola definición del
-- nombre para lo que se agregue después: nombre_de_cuenta(reserva).
create or replace function public.nombre_de_cuenta(p_reserva uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select string_agg(l.descripcion, ' · ' order by l.descripcion) from public.cuenta_lineas_reserva(p_reserva) l where l.tipo <> 'ajuste'),
    (select nullif(btrim(r.notas), '') from public.reservas r where r.id = p_reserva),
    'Cuenta');
$$;
revoke execute on function public.nombre_de_cuenta(uuid) from public, anon;
grant execute on function public.nombre_de_cuenta(uuid) to authenticated, service_role, peludesk_definer;

do $$
declare
  f record;
  v_def text;
  v_nuevo text;
  v_n int := 0;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc like '%string_agg(l.descripcion, '' · '' order by l.descripcion)%cuenta_lineas_reserva(%'
      and p.proname not in ('nombre_de_cuenta', 'cuentas_abiertas', 'cuentas_saldo_a_favor')
  loop
    select replace(pg_get_functiondef(f.firma), E'\r', '') into v_def;
    -- Solo donde el alias `l` es cuenta_lineas_reserva (tiene tipo): fuera las líneas de ajuste.
    --   (select string_agg(l.descripcion, ' · ' order by l.descripcion) from public.cuenta_lineas_reserva(X) l)
    v_nuevo := regexp_replace(v_def,
      'string_agg\(l\.descripcion, '' · '' order by l\.descripcion\)( into [a-z_]+)?(\s+)from public\.cuenta_lineas_reserva\(([^()]*)\) l(\)|\s|;)',
      'string_agg(l.descripcion, '' · '' order by l.descripcion) filter (where l.tipo is distinct from ''ajuste'')\1\2from public.cuenta_lineas_reserva(\3) l\4', 'g');
    if v_nuevo <> v_def then
      execute v_nuevo;
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'nombre de la cuenta sin ajustes en % funciones', v_n;

  -- cuentas_abiertas arma sus líneas en una CTE propia (sin tipo); la corrección es la rama «Corrección de precio: ».
  select replace(pg_get_functiondef('public.cuentas_abiertas(integer)'::regprocedure), E'\r', '') into v_def;
  if position('string_agg(l.descripcion, '' · '' order by l.descripcion) as descripcion' in v_def) = 0 then
    raise exception 'cuentas_abiertas cambió: no encuentro cómo arma la descripción.';
  end if;
  v_def := replace(v_def, 'string_agg(l.descripcion, '' · '' order by l.descripcion) as descripcion',
                          'string_agg(l.descripcion, '' · '' order by l.descripcion) filter (where l.descripcion not like ''Corrección de precio: %'') as descripcion');
  execute v_def;
end $$;

-- ── N162: saldo a favor ────────────────────────────────────────────────────────────────────────────────────────
-- Una cuenta con saldo negativo NO está «pagada»: el negocio le debe al cliente. La lista sale de la MISMA cuenta que
-- cuentas_abiertas (mismas líneas, cobros, devoluciones, pases y descuentos): se arma de su definición vigente y solo
-- cambia el filtro del saldo.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.cuentas_abiertas(integer)'::regprocedure), E'\r', '') into v_def;
  if position('+ coalesce(dv.monto, 0) > 0' in v_def) = 0 then
    raise exception 'cuentas_abiertas cambió: no encuentro el filtro del saldo.';
  end if;
  v_def := replace(v_def, 'FUNCTION public.cuentas_abiertas(', 'FUNCTION public.cuentas_saldo_a_favor(');
  v_def := replace(v_def, '+ coalesce(dv.monto, 0) > 0', '+ coalesce(dv.monto, 0) < -0.005');
  execute v_def;
end $$;
revoke execute on function public.cuentas_saldo_a_favor(integer) from public, anon;
grant execute on function public.cuentas_saldo_a_favor(integer) to authenticated, service_role, peludesk_definer;

-- «Necesita atención» y Recepción: las cuentas con saldo a favor, con lo que hay que devolver (personal de caja).
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.tablero_atencion(text)'::regprocedure), E'\r', '') into v_def;
  if position('  if cardinality(v_fallos) > 0 then' in v_def) = 0 or position('v_dinero' in v_def) = 0 then
    raise exception 'tablero_atencion cambió: no encuentro dónde agregar los saldos a favor.';
  end if;
  if position('saldos_a_favor' in v_def) = 0 then
    v_def := replace(v_def, '  if cardinality(v_fallos) > 0 then',
'  if v_dinero and v_rol in (''admin'', ''recepcion'') then
    begin
      r := r || jsonb_build_object(''saldos_a_favor'', (select coalesce(jsonb_agg(jsonb_build_object(''reserva_id'', s.reserva_id, ''cliente_nombre'', s.cliente_nombre,
        ''descripcion'', s.descripcion, ''saldo'', s.saldo, ''fecha_actividad'', s.fecha_actividad) order by s.fecha_actividad desc, s.reserva_id), ''[]''::jsonb)
        from public.cuentas_saldo_a_favor(90) s));
    exception when others then v_fallos := array_append(v_fallos, ''saldos_a_favor'');
    end;
  end if;
  if cardinality(v_fallos) > 0 then');
    execute v_def;
  end if;
end $$;

-- El dueño: lo que el negocio le tiene que devolver (sin quién cobró ni cómo; solo la cuenta y el monto).
create or replace function public.mis_saldos_a_favor()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('reserva_id', c.reserva_id, 'descripcion', c.descripcion, 'perros', c.perros,
                                        'fecha_actividad', c.fecha_actividad, 'a_favor', -c.saldo) order by c.fecha_actividad desc)
    from public.cuentas_saldo_a_favor(365) c
    where public.mi_cliente_id() is not null and c.cliente_id = public.mi_cliente_id()
  ), '[]'::jsonb);
$$;
alter function public.mis_saldos_a_favor() owner to peludesk_definer;
revoke execute on function public.mis_saldos_a_favor() from public, anon;
grant execute on function public.mis_saldos_a_favor() to authenticated, service_role;

-- ── N163: la tarjeta manual por revisar es la que tiene NETO ──────────────────────────────────────────────────
-- Una tarjeta registrada a mano que se devolvió completa ya no espera revisión: no hay nada que contrastar con el
-- voucher. La lista de pendientes (no el historial de Conciliación) deja fuera las de neto 0, y cada fila trae su neto.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.tarjetas_manuales_por_revisar(boolean)'::regprocedure), E'\r', '') into v_def;
  if position('and (t.estado = ''por_revisar'' or (p_historial and t.created_at > now() - interval ''60 days''))' in v_def) = 0 then
    raise exception 'tarjetas_manuales_por_revisar cambió: no encuentro su filtro.';
  end if;
  v_def := replace(v_def, 'and (t.estado = ''por_revisar'' or (p_historial and t.created_at > now() - interval ''60 days''))',
'and (t.estado = ''por_revisar'' or (p_historial and t.created_at > now() - interval ''60 days''))
    and (p_historial or t.monto - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.deleted_at is null and dm.metodo = ''tarjeta_manual''
        and (d.cobro_id = t.cobro_id or (t.grupo_id is not null and d.cobro_id in (select c2.id from public.cobros c2 where c2.grupo_id = t.grupo_id)))
    ), 0) > 0.005)');
  execute v_def;
end $$;

-- ── Recurrencia de N156: quiénes son médicos, para las LISTAS de equipo ──────────────────────────────────────
-- La etiqueta de una persona en una lista (bienvenida, personal, cuentas) sale de la misma regla que la de la sesión
-- (etiquetaDeSesion): rol + módulos + designación de médico. Las listas no sabían quién es médico.
create or replace function public.medicos_del_negocio()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id from public.medicos_veterinarios m
  where m.negocio_id = public.negocio_actual() and m.deleted_at is null and coalesce(public.is_staff(), false);
$$;
alter function public.medicos_del_negocio() owner to peludesk_definer;
revoke execute on function public.medicos_del_negocio() from public, anon;
grant execute on function public.medicos_del_negocio() to authenticated, service_role;

