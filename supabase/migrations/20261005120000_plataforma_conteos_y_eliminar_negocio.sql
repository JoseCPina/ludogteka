-- Conteos de la plataforma y borrado de un negocio de prueba (5 de octubre de 2026).
--
-- 1. El demo (`negocios.plan = 'demo'`: lo marca SOLO plataforma_cambiar_plan y
--    ya es la marca que usan demo_vaciar, el cobro y el resumen) no suma en
--    ningún total de /plataforma. La lista de almacenamiento ahora trae el plan
--    para poder ponerle su etiqueta «Demo» y dejarlo fuera de la suma.
--
-- 2. Eliminar un negocio de prueba o suspendido, completo, por la función de la
--    plataforma (nunca SQL a mano):
--      plataforma_negocio_a_borrar(id)  → comprueba que se puede y devuelve lo
--        que hay que limpiar FUERA de Postgres (Storage, Stripe, Vault).
--      plataforma_eliminar_negocio(id, confirmación) → borra por negocio_id todas
--        sus filas y el negocio, deja el evento en plataforma_eventos y avisa qué
--        cuentas de Auth quedaron huérfanas.
--    Las dos son de postgres (leen y borran de todos los negocios) y están en la
--    lista blanca de auditoria_frontera(); aceptan es_admin_plataforma() o el
--    servidor (service_role: el script de la plataforma y la acción de la pantalla
--    ya comprobaron la sesión).

-- ── 1. Almacenamiento: trae el plan ──
drop function public.plataforma_almacenamiento_reportes();
create function public.plataforma_almacenamiento_reportes()
returns table (negocio_id uuid, nombre text, slug text, plan text, archivos bigint, bytes bigint, vencidos bigint, retencion_dias int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.es_admin_plataforma() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
  select n.id, n.nombre, n.slug, n.plan,
    (coalesce(m.archivos, 0) + coalesce(r.archivos, 0))::bigint,
    (coalesce(m.bytes, 0) + coalesce(r.bytes, 0))::bigint,
    (coalesce(m.vencidos, 0) + coalesce(r.vencidos, 0))::bigint,
    coalesce((select c.retencion_dias from public.reporte_config c where c.negocio_id = n.id and c.deleted_at is null), 7)
  from public.negocios n
  left join (
    select x.negocio_id,
      count(*) filter (where x.vencida_at is null and x.estado = 'lista') as archivos,
      coalesce(sum(x.bytes) filter (where x.vencida_at is null and x.estado = 'lista'), 0) as bytes,
      count(*) filter (where x.vencida_at is not null) as vencidos
    from public.media_perro x where x.deleted_at is null group by x.negocio_id
  ) m on m.negocio_id = n.id
  left join (
    select y.negocio_id,
      count(*) filter (where y.tarjeta_path is not null and y.tarjeta_vencida_at is null) as archivos,
      coalesce(sum(y.tarjeta_bytes) filter (where y.tarjeta_path is not null and y.tarjeta_vencida_at is null), 0) as bytes,
      count(*) filter (where y.tarjeta_vencida_at is not null) as vencidos
    from public.reportes_guarderia y where y.deleted_at is null group by y.negocio_id
  ) r on r.negocio_id = n.id
  where n.deleted_at is null
  order by (coalesce(m.bytes, 0) + coalesce(r.bytes, 0)) desc, n.nombre;
end;
$$;
revoke execute on function public.plataforma_almacenamiento_reportes() from public, anon;
grant execute on function public.plataforma_almacenamiento_reportes() to authenticated, service_role;

-- ── 2a. Qué hay que limpiar y si se puede borrar ──
create or replace function public.plataforma_negocio_a_borrar(p_negocio_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg record;
  v_hay boolean;
  v_pagos bigint;
  v_cobros_integrados bigint;
  v_stripe_vivo bigint;
  v_telefonos text[];
  v_clientes text[];
  v_clientes_total int;
  v_objetos jsonb;
begin
  if not (public.es_admin_plataforma() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  select n.id, n.slug, n.nombre, n.plan, n.activo, n.cobro_exento, n.deleted_at into v_neg from public.negocios n where n.id = p_negocio_id;
  v_hay := found;
  if not v_hay then
    raise exception 'Ese negocio no existe.';
  end if;
  if v_neg.plan = 'demo' then
    raise exception 'El negocio de demostración no se borra.';
  end if;
  if v_neg.cobro_exento or v_neg.slug = 'ludogteka' then
    raise exception 'Ese negocio está exento de cobro (negocio de la casa): no se borra desde aquí.';
  end if;
  if not (v_neg.plan = 'prueba' or not v_neg.activo) then
    raise exception 'Solo se borra un negocio en prueba o suspendido; este está activo con plan %.', v_neg.plan;
  end if;
  select count(*) into v_pagos from public.pagos_suscripcion p where p.negocio_id = p_negocio_id and p.estado = 'pagado' and p.monto_centavos > 0;
  select count(*) into v_cobros_integrados from public.cobros c where c.negocio_id = p_negocio_id and c.origen <> 'manual';
  select count(*) into v_stripe_vivo from public.suscripciones s
    where s.negocio_id = p_negocio_id and s.deleted_at is null and s.estado_stripe in ('active', 'past_due', 'unpaid');
  if v_pagos > 0 or v_cobros_integrados > 0 or v_stripe_vivo > 0 then
    raise exception 'Este negocio tiene cobros reales (pagos de suscripción: %, cobros con terminal o link: %, suscripción viva: %). No se borra.',
      v_pagos, v_cobros_integrados, v_stripe_vivo;
  end if;

  select coalesce(array_agg(distinct r.telefono), '{}') into v_telefonos from public.registros_prueba r where r.negocio_id = p_negocio_id;
  select coalesce(array_agg(c.id::text), '{}'), count(*) into v_clientes, v_clientes_total from public.clientes c where c.negocio_id = p_negocio_id;

  -- Archivos en Storage: lo de {negocio}/… en los buckets por negocio y lo de
  -- {cliente}/… en perros-archivos. Tope de 5000 por si acaso (una prueba trae pocos).
  select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name)), '[]'::jsonb) into v_objetos
  from (
    select bucket_id, name from storage.objects
    where (bucket_id in ('reportes-archivos', 'gastos-comprobantes', 'soporte-capturas', 'negocios-publico') and split_part(name, '/', 1) = p_negocio_id::text)
       or (bucket_id = 'perros-archivos' and split_part(name, '/', 1) = any(v_clientes))
    limit 5000
  ) o;

  return jsonb_build_object(
    'negocio', jsonb_build_object('id', v_neg.id, 'slug', v_neg.slug, 'nombre', v_neg.nombre, 'plan', v_neg.plan, 'activo', v_neg.activo),
    'telefonos', to_jsonb(v_telefonos),
    'clientes', v_clientes_total,
    'stripe', jsonb_build_object(
      'customers', coalesce((select jsonb_agg(distinct s.stripe_customer_id) from public.suscripciones s where s.negocio_id = p_negocio_id and s.stripe_customer_id is not null), '[]'::jsonb),
      'suscripciones', coalesce((select jsonb_agg(distinct s.stripe_subscription_id) from public.suscripciones s where s.negocio_id = p_negocio_id and s.stripe_subscription_id is not null), '[]'::jsonb)),
    'integraciones', (select count(*) from public.integraciones_cobro i where i.negocio_id = p_negocio_id and i.secreto_id is not null),
    'objetos', v_objetos
  );
end;
$$;
revoke execute on function public.plataforma_negocio_a_borrar(uuid) from public, anon;
grant execute on function public.plataforma_negocio_a_borrar(uuid) to authenticated, service_role;

-- ── 2b. Borrar el negocio ──
create or replace function public.plataforma_eliminar_negocio(p_negocio_id uuid, p_confirmacion text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manifiesto jsonb;
  v_neg jsonb;
  v_t record;
  v_f record;
  v_n bigint;
  v_filas jsonb := '{}'::jsonb;
  v_vault int := 0;
  v_huerfanas jsonb;
  v_personas uuid[];
begin
  if not (public.es_admin_plataforma() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  -- Las mismas guardas de «se puede borrar» (lanza si no).
  v_manifiesto := public.plataforma_negocio_a_borrar(p_negocio_id);
  v_neg := v_manifiesto -> 'negocio';
  if btrim(coalesce(p_confirmacion, '')) <> (v_neg ->> 'nombre') then
    raise exception 'Para borrar escribe el nombre del negocio tal cual: «%».', v_neg ->> 'nombre';
  end if;
  perform 1 from public.negocios n where n.id = p_negocio_id for update;

  v_personas := array(select distinct m.profile_id from public.membresias m where m.negocio_id = p_negocio_id);

  -- Credenciales de cobro (Mercado Pago / Clip) en Vault: se desvinculan.
  delete from vault.secrets where id in (select i.secreto_id from public.integraciones_cobro i where i.negocio_id = p_negocio_id and i.secreto_id is not null);
  get diagnostics v_vault = row_count;

  -- Sin disparadores ni llaves foráneas durante el borrado (nada del negocio
  -- se referencia desde otro: todo lleva negocio_id); al final se comprueba
  -- que no quedó ninguna referencia colgando.
  perform set_config('session_replication_role', 'replica', true);

  -- La bitácora de la plataforma se conserva, ya sin ligar al negocio.
  update public.plataforma_eventos set negocio_id = null where negocio_id = p_negocio_id;
  update public.wa_hilos set negocio_afectado = null where negocio_afectado = p_negocio_id;
  update public.eventos_stripe set negocio_afectado = null where negocio_afectado = p_negocio_id;

  for v_t in
    select c.relname::text as tabla
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'negocios'
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
    order by 1
  loop
    execute format('delete from public.%I where negocio_id = $1', v_t.tabla) using p_negocio_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_filas := v_filas || jsonb_build_object(v_t.tabla, v_n);
    end if;
  end loop;
  delete from public.negocios where id = p_negocio_id;

  perform set_config('session_replication_role', 'origin', true);

  -- Nada puede quedar apuntando al negocio borrado: si queda algo, se deshace todo.
  for v_f in
    select k.conrelid::regclass::text as tabla, a.attname::text as columna
    from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.confrelid = 'public.negocios'::regclass and k.contype = 'f'
  loop
    execute format('select count(*) from %s where %I = $1', v_f.tabla, v_f.columna) into v_n using p_negocio_id;
    if v_n > 0 then
      raise exception 'Quedaron % filas en % (%) apuntando al negocio. No se borró nada.', v_n, v_f.tabla, v_f.columna;
    end if;
  end loop;

  -- Cuentas que se quedaron sin ningún negocio (ni son de la plataforma): el
  -- servidor las quita de Auth.
  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_huerfanas
  from unnest(v_personas) p
  where not exists (select 1 from public.membresias m where m.profile_id = p and m.deleted_at is null)
    and not exists (select 1 from public.plataforma_admins a where a.profile_id = p);

  insert into public.plataforma_eventos (accion, negocio_id, persona_id, motivo, detalle, created_by)
  values ('eliminar_negocio', null, null, 'Negocio de prueba o suspendido borrado desde la plataforma',
          jsonb_build_object('negocio_id', p_negocio_id, 'slug', v_neg ->> 'slug', 'nombre', v_neg ->> 'nombre', 'plan', v_neg ->> 'plan',
                             'telefonos', v_manifiesto -> 'telefonos', 'filas', v_filas, 'secretos_vault', v_vault,
                             'archivos_storage', jsonb_array_length(v_manifiesto -> 'objetos'),
                             'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end),
          auth.uid());

  return jsonb_build_object('negocio', v_neg, 'filas', v_filas, 'secretos_vault', v_vault, 'cuentas_huerfanas', v_huerfanas, 'manifiesto', v_manifiesto);
end;
$$;
revoke execute on function public.plataforma_eliminar_negocio(uuid, text) from public, anon;
grant execute on function public.plataforma_eliminar_negocio(uuid, text) to authenticated, service_role;

-- Las dos son de postgres: a la lista blanca de auditoria_frontera().
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('plataforma_eliminar_negocio' in v_def) = 0 then
    v_def := replace(v_def, $a$('plataforma_anotar_telegram')$a$, $b$('plataforma_anotar_telegram'),
    -- Borrar un negocio de prueba o suspendido (lee y borra de todos los negocios).
    ('plataforma_negocio_a_borrar'), ('plataforma_eliminar_negocio')$b$);
    if position('plataforma_eliminar_negocio' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar plataforma_eliminar_negocio.';
    end if;
    execute v_def;
  end if;
end $$;
