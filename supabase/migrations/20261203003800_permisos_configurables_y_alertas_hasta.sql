-- Permisos configurables para lo que seguía siendo «solo admin» por rol fijo, y «Dar por revisadas todas las anteriores
-- a…» para cualquier negocio (5 de noviembre de 2026; rama fix/permisos-y-alertas; inventario en docs/permisos-inventario-empleados-gastos.md).
-- Regla: un admin tiene todos los permisos (tiene_permiso → is_admin); una persona de recepción solo los que se le dan
-- en /admin/permisos. Lo que NUNCA se delega sigue igual: dar permisos, crear admins, cambiar roles, el tope de descuentos,
-- con qué cobra el negocio, el plan, las sucursales, restablecer contraseñas y el efectivo esperado del turno de otro.
-- Solo agrega: claves nuevas en el catálogo, guardias que ADEMÁS de admin aceptan el permiso, y una función nueva.

-- ── 1. Claves nuevas en el catálogo ───────────────────────────────────────────────────────────────────────────────
insert into public.permisos_catalogo (clave, etiqueta, modulos, orden, updated_at)
values
  ('extender_pases',             'Extender la vigencia de pases',          '{guarderia}',           101, now()),
  ('plantilla_reporte_guarderia','Plantilla del reporte de guardería',     '{guarderia,hotel}',     102, now()),
  ('designar_medicos',           'Designar médicos veterinarios',          '{veterinaria}',         103, now()),
  ('ver_lecturas_expediente',    'Ver quién abrió un expediente',          '{veterinaria}',         104, now()),
  ('quitar_evaluacion',          'Quitar una evaluación de comportamiento','{guarderia,hotel}',     105, now()),
  ('devoluciones',               'Registrar devoluciones',                 '{}',                    106, now()),
  ('revisar_tarjetas_manuales',  'Revisar tarjetas manuales',              '{}',                    107, now()),
  ('conciliacion',               'Conciliación con el proveedor de cobro', '{}',                    108, now()),
  ('cortesias',                  'Cortesías sobre servicios realizados',   '{}',                    109, now()),
  ('categorias_gasto',           'Categorías de gastos',                   '{}',                    110, now()),
  ('areas_inventario',           'Áreas de inventario',                    '{inventario}',          111, now()),
  ('asistencia_ausencias',       'Asistencia, ausencias y vacaciones',     '{}',                    112, now()),
  ('servicios',                  'Crear y editar servicios',               '{}',                    113, now()),
  ('revisar_alertas',            'Dar por revisadas alertas en lote',      '{}',                    114, now())
on conflict (clave) do nothing;

-- ── 2. Permisos que vienen prendidos para recepción (categorías de gastos y áreas de inventario) ─────────────────
create or replace function public.permisos_por_omision_recepcion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_p text;
begin
  if new.rol = 'recepcion' and new.deleted_at is null then
    foreach v_p in array array['categorias_gasto', 'areas_inventario'] loop
      if not exists (
        select 1 from public.permisos_staff ps
        where ps.profile_id = new.profile_id and ps.negocio_id = new.negocio_id and ps.permiso = v_p
      ) then
        insert into public.permisos_staff (negocio_id, profile_id, permiso, created_by)
        values (new.negocio_id, new.profile_id, v_p, null);
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke execute on function public.permisos_por_omision_recepcion() from public, anon, authenticated;
drop trigger if exists membresias_permisos_por_omision on public.membresias;
create trigger membresias_permisos_por_omision
  after insert or update of rol on public.membresias
  for each row execute function public.permisos_por_omision_recepcion();
-- Las personas de recepción que ya existen (todos los negocios) los traen desde ahora, como cualquier alta nueva.
insert into public.permisos_staff (negocio_id, profile_id, permiso, created_by)
select m.negocio_id, m.profile_id, p.clave, null
from public.membresias m
cross join (values ('categorias_gasto'), ('areas_inventario')) as p(clave)
where m.rol = 'recepcion' and m.deleted_at is null
  and not exists (select 1 from public.permisos_staff ps where ps.profile_id = m.profile_id and ps.negocio_id = m.negocio_id and ps.permiso = p.clave);

-- ── 3. Parches a las guardias (función por función, con el texto exacto; truena si no lo encuentra) ─────────────
-- Reemplaza, dentro de la ÚLTIMA definición de la función, la ocurrencia de `p_viejo` inmediatamente anterior a
-- `p_ancla` (el mensaje del raise) y, si se pide, el ancla misma. Así no depende de la sangría ni del resto del cuerpo.
create or replace function pg_temp.parchar(p_funcion text, p_ancla text, p_viejo text, p_nuevo text, p_ancla_nueva text default null)
returns void
language plpgsql
as $$
declare
  v_oid oid;
  v_def text;
  v_pos int;
  v_prefijo text;
  v_ini int;
begin
  select p.oid into v_oid from pg_proc p where p.proname = p_funcion and p.pronamespace = 'public'::regnamespace;
  if not found then raise exception 'No existe public.%', p_funcion; end if;
  if (select count(*) from pg_proc p where p.proname = p_funcion and p.pronamespace = 'public'::regnamespace) > 1 then
    raise exception 'public.% está sobrecargada: parchar a mano.', p_funcion;
  end if;
  select replace(pg_get_functiondef(v_oid), E'\r', '') into v_def;
  v_pos := position(p_ancla in v_def);
  if v_pos = 0 then raise exception 'En public.% no encontré el ancla: %', p_funcion, left(p_ancla, 90); end if;
  v_prefijo := left(v_def, v_pos - 1);
  if position(reverse(p_viejo) in reverse(v_prefijo)) = 0 then
    raise exception 'En public.% no encontré «%» antes de «%»', p_funcion, p_viejo, left(p_ancla, 60);
  end if;
  v_ini := length(v_prefijo) - position(reverse(p_viejo) in reverse(v_prefijo)) - length(p_viejo) + 2;
  v_def := left(v_def, v_ini - 1) || p_nuevo || substr(v_def, v_ini + length(p_viejo));
  if p_ancla_nueva is not null then
    v_def := replace(v_def, p_ancla, p_ancla_nueva);
  end if;
  execute v_def;
end;
$$;

-- Hotel y guardería
select pg_temp.parchar('ajustar_dias_pase', $m$'Solo un admin puede cambiar la vigencia de un pase.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('extender_pases'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Extender la vigencia de pases», cambia la vigencia de un pase.'$m$);
-- Veterinaria
select pg_temp.parchar('guardar_medico_veterinario', $m$'Solo un admin designa a los médicos veterinarios.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('designar_medicos'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Designar médicos veterinarios», designa a los médicos.'$m$);
select pg_temp.parchar('quitar_medico_veterinario', $m$'Solo un admin quita la designación de médico veterinario.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('designar_medicos'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Designar médicos veterinarios», quita la designación.'$m$);
select pg_temp.parchar('asignar_folios_medico', $m$'Solo un admin asigna folios a un médico.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('designar_medicos'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Designar médicos veterinarios», asigna folios a un médico.'$m$);
select pg_temp.parchar('vet_lecturas_lista', $m$'El registro de lecturas es de admin.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('ver_lecturas_expediente'), false)$n$,
  $m$'El registro de lecturas es de admin o de quien tenga el permiso «Ver quién abrió un expediente».'$m$);
-- Clientes y mascotas
select pg_temp.parchar('quitar_evaluacion_comportamiento', $m$'Solo un admin puede quitar una evaluación ya marcada.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('quitar_evaluacion'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Quitar una evaluación de comportamiento», puede quitar una evaluación ya marcada.'$m$);
-- Caja y cobros: devoluciones
select pg_temp.parchar('registrar_devolucion', $m$'Solo un admin puede registrar una devolución.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('devoluciones'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Registrar devoluciones», puede registrar una devolución.'$m$);
select pg_temp.parchar('preparar_reembolso', $m$'Solo un admin puede registrar una devolución.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('devoluciones'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Registrar devoluciones», puede registrar una devolución.'$m$);
select pg_temp.parchar('cobro_marcar_no_recibido', $m$'Solo un admin del negocio marca un cobro como no recibido.'$m$, $v$m.rol = 'admin'$v$,
  $n$(m.rol = 'admin' or exists (select 1 from public.permisos_staff ps where ps.profile_id = m.profile_id and ps.negocio_id = m.negocio_id and ps.permiso = 'devoluciones' and ps.revocado_at is null and ps.deleted_at is null))$n$,
  $m$'Solo un admin del negocio, o quien tenga el permiso «Registrar devoluciones», marca un cobro como no recibido.'$m$);
-- Caja y cobros: tarjetas manuales
select pg_temp.parchar('tarjeta_manual_revisar', $m$'Solo un admin revisa las tarjetas manuales.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('revisar_tarjetas_manuales'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Revisar tarjetas manuales», revisa las tarjetas manuales.'$m$);
select pg_temp.parchar('tarjeta_manual_no_recibida', $m$'Solo un admin marca una tarjeta manual como no recibida.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('revisar_tarjetas_manuales'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Revisar tarjetas manuales», marca una tarjeta manual como no recibida.'$m$);
select pg_temp.parchar('tarjetas_manuales_por_revisar', $m$and (t.estado = 'por_revisar' or (p_historial$m$, 'coalesce(public.is_admin(), false)',
  $n$(coalesce(public.is_admin(), false) or coalesce(public.tiene_permiso('revisar_tarjetas_manuales'), false))$n$);
select pg_temp.parchar('tarjetas_manuales_atencion', $m$return jsonb_build_object('visible', false)$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('revisar_tarjetas_manuales'), false)$n$);
select pg_temp.parchar('tablero_atencion', $m$'tarjetas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.tarjetas_manuales_por_revisar(false) x)$m$,
  $v$if v_dinero and v_rol = 'admin' then$v$, $n$if v_dinero and (v_rol = 'admin' or coalesce(public.tiene_permiso('revisar_tarjetas_manuales'), false)) then$n$);
select pg_temp.parchar('tablero_atencion', $m$exception when others then v_fallos := array_append(v_fallos, 'cobro');$m$,
  $v$r := r || jsonb_build_object('cobro', public.estado_cobro());$v$, $n$if v_rol = 'admin' then r := r || jsonb_build_object('cobro', public.estado_cobro()); end if;$n$);
-- Caja y cobros: conciliación
select pg_temp.parchar('conciliacion_dar_por_revisada', $m$'Solo un admin da por revisada una discrepancia.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('conciliacion'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Conciliación con el proveedor de cobro», da por revisada una discrepancia.'$m$);
select pg_temp.parchar('conciliacion_dar_por_revisadas_hasta', $m$'Solo un admin da por revisadas las diferencias.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('conciliacion'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Conciliación con el proveedor de cobro», da por revisadas las diferencias.'$m$);
select pg_temp.parchar('guardar_conciliacion_mostrar_ajenos', $m$'Solo un admin cambia esta opción.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('conciliacion'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Conciliación con el proveedor de cobro», cambia esta opción.'$m$);
-- Caja y cobros: cortesías
select pg_temp.parchar('cancelar_cuenta', $m$'Una cortesía sobre un servicio que ya se realizó solo la hace un admin.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('cortesias'), false)$n$,
  $m$'Una cortesía sobre un servicio que ya se realizó solo la hace un admin o quien tenga el permiso «Cortesías sobre servicios realizados».'$m$);
-- Equipo: asistencia, ausencias y vacaciones
select pg_temp.parchar('corregir_asistencia', $m$'Solo un admin puede corregir la asistencia.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('asistencia_ausencias'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Asistencia, ausencias y vacaciones», puede corregir la asistencia.'$m$);
select pg_temp.parchar('resolver_ausencia', $m$'Solo un admin aprueba o rechaza ausencias.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('asistencia_ausencias'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Asistencia, ausencias y vacaciones», aprueba o rechaza ausencias.'$m$);
select pg_temp.parchar('cancelar_ausencia', $m$'Una ausencia aprobada solo la cancela un admin.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('asistencia_ausencias'), false)$n$,
  $m$'Una ausencia aprobada solo la cancela un admin o quien tenga el permiso «Asistencia, ausencias y vacaciones».'$m$);
select pg_temp.parchar('cancelar_ausencia', $m$or coalesce(v_aus.solicitada_por = auth.uid(), false)$m$, 'coalesce(public.is_admin(), false)',
  $n$(coalesce(public.is_admin(), false) or coalesce(public.tiene_permiso('asistencia_ausencias'), false))$n$);
select pg_temp.parchar('ajustar_vacaciones', $m$'Solo un admin asigna o ajusta días de vacaciones.'$m$, 'public.is_admin()', $n$coalesce(public.tiene_permiso('asistencia_ausencias'), false)$n$,
  $m$'Solo un admin, o quien tenga el permiso «Asistencia, ausencias y vacaciones», asigna o ajusta días de vacaciones.'$m$);
select pg_temp.parchar('origen_registro_asistencia', $m$return 'admin';$m$, 'coalesce(public.is_admin(), false)',
  $n$(coalesce(public.is_admin(), false) or coalesce(public.tiene_permiso('asistencia_ausencias'), false))$n$);
select pg_temp.parchar('solicitar_ausencia', $m$or (coalesce(public.current_rol() = 'recepcion', false) and v_profile is null)$m$, 'coalesce(public.is_admin(), false)',
  $n$(coalesce(public.is_admin(), false) or coalesce(public.tiene_permiso('asistencia_ausencias'), false))$n$);

drop function pg_temp.parchar(text, text, text, text, text);

-- ── 4. Políticas de escritura directa que eran solo admin ────────────────────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('categorias_gasto', 'categorias_gasto'),
      ('areas_inventario', 'areas_inventario'),
      ('servicios',        'servicios'),
      ('recetas_consumo',  'servicios'),
      ('reporte_config',   'plantilla_reporte_guarderia'),
      ('reporte_secciones','plantilla_reporte_guarderia'),
      ('reporte_opciones', 'plantilla_reporte_guarderia')
    ) as t(tabla, permiso)
  loop
    execute format('drop policy if exists %I on public.%I', r.tabla || '_insert_admin', r.tabla);
    execute format('drop policy if exists %I on public.%I', r.tabla || '_update_admin', r.tabla);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.tiene_permiso(%L)))', r.tabla || '_insert_admin', r.tabla, r.permiso);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.tiene_permiso(%L))) with check ((select public.tiene_permiso(%L)))', r.tabla || '_update_admin', r.tabla, r.permiso, r.permiso);
  end loop;
end $$;

-- ── 5. «Dar por revisadas todas las anteriores a…», para cualquier negocio ───────────────────────────────────────
-- Cierra, con la sesión de quien llama (admin o permiso «Dar por revisadas alertas en lote»), lo que «Necesita atención»
-- arrastra de antes de una fecha (hora del negocio): tarjetas manuales por revisar, contratos pendientes de firma,
-- llegadas atrasadas (estancias reservadas con la entrada pasada), links de pago sin resolver y la conciliación. Lo que es
-- dinero (cuentas con saldo, saldos a favor) y lo que hay que ver (comprobantes sanitarios) NO se cierra: se devuelve en
-- `pendientes` para que la pantalla lo diga. Cada cierre lleva la nota y queda como lo dejaría la app.
create or replace function public.alertas_dar_por_revisadas_hasta(p_hasta date, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := btrim(coalesce(p_nota, ''));
  v_motivo text;
  v_tarjetas int := 0;
  v_contratos int := 0;
  v_llegadas int := 0;
  v_links int := 0;
  v_conciliacion int := 0;
  v_saldos int := 0;
  v_comprobantes int := 0;
  v_zona text := public.zona_negocio();
begin
  if not coalesce(public.tiene_permiso('revisar_alertas'), false) then
    raise exception 'Solo un admin, o quien tenga el permiso «Dar por revisadas alertas en lote», cierra alertas en lote.' using errcode = '42501';
  end if;
  if p_hasta is null then
    raise exception 'Indica hasta qué fecha.';
  end if;
  if p_hasta > public.fecha_negocio() + 1 then
    raise exception 'La fecha no puede ser posterior a mañana.';
  end if;
  if char_length(v_nota) < 5 then
    raise exception 'Escribe qué revisaste.';
  end if;
  v_motivo := 'Dadas por revisadas en lote hasta el ' || to_char(p_hasta, 'DD/MM/YYYY') || ': ' || v_nota;

  -- Tarjetas manuales por revisar
  with c as (
    update public.tarjetas_manuales t
    set estado = 'revisada', revisada_por = auth.uid(), revisada_at = now(), nota_revision = v_motivo
    where t.negocio_id = public.negocio_actual() and t.estado = 'por_revisar' and t.deleted_at is null
      and (t.created_at at time zone v_zona)::date < p_hasta
    returning 1
  ) select count(*) into v_tarjetas from c;

  -- Contratos pendientes de firma
  with c as (
    update public.contratos k
    set estado = 'cancelado'
    where k.negocio_id = public.negocio_actual() and k.estado = 'pendiente_firma' and k.deleted_at is null
      and (k.created_at at time zone v_zona)::date < p_hasta
    returning k.id
  ), m as (
    insert into public.contratos_internos (contrato_id, motivo_cancelacion)
    select c.id, v_motivo from c
    on conflict (contrato_id) do update set motivo_cancelacion = excluded.motivo_cancelacion
    returning 1
  ) select count(*) into v_contratos from m;

  -- Llegadas atrasadas: reservadas o confirmadas con la entrada ya pasada → «No llegó»
  with c as (
    update public.estancias e
    set estado = 'no_llego', notas = case when coalesce(e.notas, '') = '' then v_motivo else e.notas || E'\n' || v_motivo end
    where e.negocio_id = public.negocio_actual() and e.estado in ('reservada', 'confirmada') and e.deleted_at is null
      and e.fecha_entrada < p_hasta
    returning 1
  ) select count(*) into v_llegadas from c;

  -- Links de pago creados y nunca resueltos
  with c as (
    update public.mp_ordenes o
    set estado = 'cancelada', detalle_error = v_motivo, notificado_at = now()
    where o.negocio_id = public.negocio_actual() and o.estado = 'creada' and o.deleted_at is null
      and (o.created_at at time zone v_zona)::date < p_hasta
    returning 1
  ) select count(*) into v_links from c;

  -- Conciliación con el proveedor
  with c as (
    update public.conciliacion_terminal ct
    set resuelta_at = now(), resuelta_motivo = v_motivo, resuelta_por = auth.uid()
    where ct.negocio_id = public.negocio_actual() and ct.resuelta_at is null and ct.deleted_at is null
      and (ct.ocurrio_at at time zone v_zona)::date < p_hasta
    returning 1
  ) select count(*) into v_conciliacion from c;

  -- Lo que no se cierra solo, para decirlo
  select count(*) into v_comprobantes from public.requisitos_sanitarios_propuestos p
  where p.negocio_id = public.negocio_actual() and p.estado = 'pendiente' and p.deleted_at is null
    and (p.created_at at time zone v_zona)::date < p_hasta;
  select count(*) into v_saldos from public.cuentas_abiertas(400) ca where ca.saldo > 0 and ca.fecha_actividad < p_hasta;

  return jsonb_build_object(
    'hasta', p_hasta,
    'cerradas', jsonb_build_object('tarjetas', v_tarjetas, 'contratos', v_contratos, 'llegadas', v_llegadas, 'links', v_links, 'conciliacion', v_conciliacion),
    'total', v_tarjetas + v_contratos + v_llegadas + v_links + v_conciliacion,
    'pendientes', jsonb_build_object('cuentas_con_saldo', v_saldos, 'comprobantes', v_comprobantes)
  );
end;
$$;
alter function public.alertas_dar_por_revisadas_hasta(date, text) owner to peludesk_definer;
revoke execute on function public.alertas_dar_por_revisadas_hasta(date, text) from public, anon;
grant execute on function public.alertas_dar_por_revisadas_hasta(date, text) to authenticated, service_role;
comment on function public.alertas_dar_por_revisadas_hasta(date, text) is
  'Admin o permiso «revisar_alertas»: cierra en lote, con nota, lo anterior a una fecha (hora del negocio): tarjetas manuales por revisar, contratos pendientes de firma, llegadas atrasadas (no llegó), links de pago sin resolver y conciliación. Devuelve {cerradas, total, pendientes}.';

-- Cuántas cerraría (para decirlo antes de apretar), con las mismas reglas y sin escribir.
create or replace function public.alertas_por_revisar_hasta(p_hasta date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tarjetas', (select count(*) from public.tarjetas_manuales t where t.negocio_id = public.negocio_actual() and t.estado = 'por_revisar' and t.deleted_at is null and (t.created_at at time zone public.zona_negocio())::date < p_hasta),
    'contratos', (select count(*) from public.contratos k where k.negocio_id = public.negocio_actual() and k.estado = 'pendiente_firma' and k.deleted_at is null and (k.created_at at time zone public.zona_negocio())::date < p_hasta),
    'llegadas', (select count(*) from public.estancias e where e.negocio_id = public.negocio_actual() and e.estado in ('reservada', 'confirmada') and e.deleted_at is null and e.fecha_entrada < p_hasta),
    'links', (select count(*) from public.mp_ordenes o where o.negocio_id = public.negocio_actual() and o.estado = 'creada' and o.deleted_at is null and (o.created_at at time zone public.zona_negocio())::date < p_hasta),
    'conciliacion', (select count(*) from public.conciliacion_terminal ct where ct.negocio_id = public.negocio_actual() and ct.resuelta_at is null and ct.deleted_at is null and (ct.ocurrio_at at time zone public.zona_negocio())::date < p_hasta)
  )
  where coalesce(public.tiene_permiso('revisar_alertas'), false);
$$;
alter function public.alertas_por_revisar_hasta(date) owner to peludesk_definer;
revoke execute on function public.alertas_por_revisar_hasta(date) from public, anon;
grant execute on function public.alertas_por_revisar_hasta(date) to authenticated, service_role;

-- Reversa del esquema (no se corre sola): drop function alertas_dar_por_revisadas_hasta, alertas_por_revisar_hasta,
-- permisos_por_omision_recepcion (y su trigger); las claves del catálogo pueden quedarse; las guardias vuelven a is_admin().
