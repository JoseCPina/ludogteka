-- Negocio INTERNO: un negocio real en producción (con módulos, cobros en efectivo, WhatsApp) que es de
-- PeluDesk para pruebas y demos de venta. Se ve en /plataforma con su etiqueta «Interno» y NUNCA suma en un
-- conteo, total o ingreso. Marcarlo también lo exenta del cobro de la suscripción (cobro_exento), con lo que
-- ya queda fuera del resumen diario y del seguimiento de pruebas. Solo lo cambia la plataforma.
-- Reversa: plataforma_marcar_interno(negocio, false, motivo); quitar la columna al final si hiciera falta.
alter table public.negocios add column interno boolean not null default false;

-- 1. Solo la plataforma lo cambia (se suma a la guarda de validar_negocio).
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.validar_negocio()'::regprocedure);
  v_def := replace(v_def, E'\r', '');
  if v_def not like '%interno%' then
    v_def := replace(v_def, 'or new.dictado_minutos_mes is distinct from old.dictado_minutos_mes)', 'or new.dictado_minutos_mes is distinct from old.dictado_minutos_mes' || E'\n          or new.interno is distinct from old.interno)');
    if v_def not like '%old.interno%' then
      raise exception 'No se pudo parchar validar_negocio: cambió su texto.';
    end if;
    execute v_def;
  end if;
end $$;

-- 2. La lista de la plataforma trae la marca.
drop function public.plataforma_negocios();
create function public.plataforma_negocios()
returns table (id uuid, slug text, nombre text, dominio text, url_publica text, zona_horaria text, ciudad text,
               activo boolean, marca jsonb, created_at timestamptz, admins text[], clientes bigint,
               plan text, prueba_termina_at timestamptz, perros bigint, reservas bigint, cobros bigint,
               ultima_actividad timestamptz, ultimo_acceso timestamptz,
               plan_id uuid, plan_nombre text, complementos text[], modulos_cortesia text[], web_gratis_at timestamptz,
               interno boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
    select n.id, n.slug, n.nombre, n.dominio, n.url_publica, n.zona_horaria, n.ciudad, n.activo, n.marca, n.created_at,
      array(select u.email::text from public.membresias m join auth.users u on u.id = m.profile_id
            where m.negocio_id = n.id and m.rol = 'admin' and m.deleted_at is null order by m.created_at),
      (select count(*) from public.clientes c where c.negocio_id = n.id and c.deleted_at is null),
      n.plan, n.prueba_termina_at,
      (select count(*) from public.perros p where p.negocio_id = n.id and p.deleted_at is null),
      (select count(*) from public.reservas r where r.negocio_id = n.id and r.deleted_at is null),
      (select count(*) from public.cobros c where c.negocio_id = n.id),
      greatest(
        (select max(c.created_at) from public.clientes c where c.negocio_id = n.id),
        (select max(r.created_at) from public.reservas r where r.negocio_id = n.id),
        (select max(c.created_at) from public.cobros c where c.negocio_id = n.id),
        (select max(t.created_at) from public.tarifas t where t.negocio_id = n.id)
      ),
      (select max(u.last_sign_in_at) from public.membresias m join auth.users u on u.id = m.profile_id
        where m.negocio_id = n.id and m.rol <> 'cliente' and m.deleted_at is null),
      n.plan_id, pl.nombre, n.complementos, n.modulos_cortesia, n.web_gratis_at, n.interno
    from public.negocios n
    left join public.planes pl on pl.id = n.plan_id
    where n.deleted_at is null
    order by n.created_at;
end;
$$;
revoke execute on function public.plataforma_negocios() from public, anon;
grant execute on function public.plataforma_negocios() to authenticated;

-- 3. Marcar / desmarcar (con motivo; queda en plataforma_eventos).
create or replace function public.plataforma_marcar_interno(p_negocio_id uuid, p_interno boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo.';
  end if;
  if p_interno and exists (select 1 from public.negocios n where n.id = p_negocio_id and (n.plan = 'demo' or n.cobro_exento and not n.interno)) then
    raise exception 'Ese negocio es el demo o un negocio exento real: no se marca como interno.';
  end if;
  update public.negocios set interno = coalesce(p_interno, false), cobro_exento = case when p_interno then true else cobro_exento end
   where id = p_negocio_id and deleted_at is null;
  if not found then
    raise exception 'Ese negocio no existe.';
  end if;
  perform public.plataforma_registrar_evento('marcar_interno', p_negocio_id, null, btrim(p_motivo), jsonb_build_object('interno', coalesce(p_interno, false)));
end;
$$;
revoke execute on function public.plataforma_marcar_interno(uuid, boolean, text) from public, anon;
grant execute on function public.plataforma_marcar_interno(uuid, boolean, text) to authenticated, service_role;

-- 4. Acción nueva en la bitácora de la plataforma.
do $$
declare
  v_def text;
  v_acciones text[];
  v_nuevas text[] := array['marcar_interno'];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  if v_def ~ '''\{[a-z_0-9,]+\}''' then
    v_acciones := string_to_array((regexp_match(v_def, '''\{([a-z_0-9,]+)\}'''))[1], ',');
  else
    select coalesce(array_agg(distinct m[1]), '{}') into v_acciones from regexp_matches(v_def, '''([a-z_0-9]+)''', 'g') as m;
  end if;
  if cardinality(v_acciones) < 10 then
    raise exception 'plataforma_eventos: no se pudo leer la lista de acciones (%).', v_def;
  end if;
  v_acciones := (select array_agg(distinct a) from unnest(v_acciones || v_nuevas) a);
  alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
  execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
end $$;

-- 5. Frontera: la función nueva es de la plataforma (postgres) y va a la lista blanca.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  v_def := replace(v_def, E'\r', '');
  if position('plataforma_marcar_interno' in v_def) = 0 then
    v_def := replace(v_def, $a$('bot_cuenta_por_telefono')$a$, $b$('bot_cuenta_por_telefono'), ('plataforma_marcar_interno')$b$);
    if position('plataforma_marcar_interno' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar plataforma_marcar_interno.';
    end if;
    execute v_def;
  end if;
end $$;
