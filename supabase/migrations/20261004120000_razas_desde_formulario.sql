-- Razas que no están en el catálogo, resueltas EN el formulario del perro.
--
--  1. La propuesta lleva la descripción (notas libres), de dónde salió
--     (formulario del personal, link del dueño o la pantalla de razas) y el
--     grupo de precio que ESE negocio le asignó, si lo hizo.
--  2. razas_proponer_formulario: la usa recepción o admin al capturar un
--     perro (sin pedir «Precios y tarifas»: proponer una raza no toca
--     ningún precio). Liga al perro a la propuesta; si ya hay una pendiente
--     con ese nombre, se reusa. El grupo de precio solo lo puede dar quien
--     tenga «Precios y tarifas».
--  3. razas_proponer_cliente: lo mismo para el dueño desde el link de alta,
--     solo service_role (el servidor comprueba el token). Sin tamaño, sin
--     grupo, sin precio.
--  4. perro_grupo_raza: un perro ligado a una propuesta PENDIENTE no cae al
--     grupo por defecto: usa el grupo que el negocio le dio a la propuesta o,
--     si no hay, queda «sin grupo» (la cita pide asignarlo o una excepción).
--  5. asignar_grupo_propuesta: el negocio decide el grupo de una propuesta
--     que sigue pendiente; al aprobarla la plataforma, ese grupo queda como
--     el de la raza EN ESE negocio (nunca en otro).
--  6. La bandeja de la plataforma enseña las notas, el origen y el grupo.

alter table public.razas_propuestas
  add column notas text,
  add column origen text not null default 'bandeja' check (origen in ('bandeja', 'formulario', 'cliente')),
  add column grupo_raza_id uuid references public.grupos_raza(id);

-- ── 2 y 3. Alta de la propuesta (una sola implementación) ────────────

create or replace function public.razas_proponer_interna(
  p_nombre text, p_variantes text[], p_tamano_id uuid, p_pelaje_id uuid, p_notas text,
  p_perro_id uuid, p_grupo_raza_id uuid, p_origen text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_norm text := public.normalizar_raza(p_nombre);
  v_conf record;
  v_id uuid;
  v_vars text[];
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
  v_hay boolean;
begin
  if v_norm = '' then
    raise exception 'Escribe el nombre de la raza.';
  end if;
  if char_length(v_nombre) > 80 or char_length(coalesce(v_notas, '')) > 600 then
    raise exception 'El nombre o la descripción son demasiado largos.';
  end if;
  select * into v_conf from public.razas_conflicto(v_nombre);
  if v_conf.raza_id is not null then
    raise exception 'Esa raza ya está en el catálogo como «%». Escógela de la lista.', v_conf.raza_nombre;
  end if;
  select array_agg(distinct btrim(x)) into v_vars
  from unnest(coalesce(p_variantes, '{}')) x
  where btrim(x) <> '' and public.normalizar_raza(x) <> v_norm;
  if exists (select 1 from unnest(coalesce(v_vars, '{}')) x, lateral public.razas_conflicto(x) c where c.raza_id is not null) then
    raise exception 'Uno de los otros nombres ya es de una raza del catálogo. Quítalo o escoge esa raza de la lista.';
  end if;
  if p_grupo_raza_id is not null
     and not exists (select 1 from public.grupos_raza where id = p_grupo_raza_id and deleted_at is null and negocio_id = (select public.negocio_actual())) then
    raise exception 'Ese grupo de precio no existe en este negocio.';
  end if;
  if p_perro_id is not null
     and not exists (select 1 from public.perros where id = p_perro_id and deleted_at is null and negocio_id = (select public.negocio_actual())) then
    raise exception 'No encontré a ese perro.';
  end if;

  select id into v_id from public.razas_propuestas
  where nombre_norm = v_norm and estado = 'pendiente' and deleted_at is null and negocio_id = (select public.negocio_actual());
  v_hay := found;
  if not v_hay then
    insert into public.razas_propuestas (nombre, nombre_norm, variantes, tamano_id, pelaje_id, texto_origen, notas, origen, grupo_raza_id)
    values (v_nombre, v_norm, coalesce(v_vars, '{}'), p_tamano_id, p_pelaje_id, v_norm, v_notas, p_origen, p_grupo_raza_id)
    returning id into v_id;
  else
    -- Ya la había propuesto alguien de este negocio: se completa, no se duplica.
    update public.razas_propuestas set
      variantes = (select coalesce(array_agg(distinct x), '{}') from unnest(variantes || coalesce(v_vars, '{}')) x),
      tamano_id = coalesce(tamano_id, p_tamano_id),
      pelaje_id = coalesce(pelaje_id, p_pelaje_id),
      notas = case when v_notas is null or notas = v_notas then notas when notas is null then v_notas else notas || E'\n' || v_notas end,
      grupo_raza_id = coalesce(grupo_raza_id, p_grupo_raza_id)
    where id = v_id;
  end if;

  if p_perro_id is not null then
    -- Un perro, una propuesta pendiente a la vez.
    update public.razas_propuestas_perros pp set deleted_at = now()
    where pp.perro_id = p_perro_id and pp.deleted_at is null and pp.propuesta_id <> v_id
      and exists (select 1 from public.razas_propuestas x where x.id = pp.propuesta_id and x.estado = 'pendiente');
    insert into public.razas_propuestas_perros (propuesta_id, perro_id)
    select v_id, p_perro_id
    where not exists (select 1 from public.razas_propuestas_perros where propuesta_id = v_id and perro_id = p_perro_id and deleted_at is null);
    update public.perros set raza = v_nombre where id = p_perro_id and raza_id is null;
  end if;

  -- Los demás perros del negocio que ya tenían escrita esa raza se suman.
  insert into public.razas_propuestas_perros (propuesta_id, perro_id)
  select v_id, p.id
  from public.perros p
  where p.raza_id is null and p.deleted_at is null and p.fallecido = false
    and public.normalizar_raza(p.raza) in (select x from unnest(array[v_norm] || coalesce((select array_agg(public.normalizar_raza(z)) from unnest(coalesce(v_vars, '{}')) z), '{}')) x)
    and not exists (select 1 from public.razas_propuestas_perros q where q.propuesta_id = v_id and q.perro_id = p.id and q.deleted_at is null);
  return v_id;
end;
$$;
alter function public.razas_proponer_interna(text, text[], uuid, uuid, text, uuid, uuid, text) owner to peludesk_definer;
grant select, insert, update on public.razas_propuestas, public.razas_propuestas_perros to peludesk_definer;
grant select, update on public.perros to peludesk_definer;
grant select on public.grupos_raza to peludesk_definer;
revoke execute on function public.razas_proponer_interna(text, text[], uuid, uuid, text, uuid, uuid, text) from public, anon, authenticated, service_role;

create or replace function public.razas_proponer_formulario(
  p_nombre text, p_variantes text[], p_tamano_id uuid, p_pelaje_id uuid, p_notas text,
  p_perro_id uuid default null, p_grupo_raza_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (coalesce((select public.is_admin()), false) or coalesce((select public.current_rol()), 'anonimo') = 'recepcion') then
    raise exception 'Proponer una raza nueva es de admin o recepción.' using errcode = '42501';
  end if;
  if p_grupo_raza_id is not null and not coalesce((select public.tiene_permiso('tarifas')), false) then
    raise exception 'Asignar el grupo de precio es de admin o de quien tenga el permiso de precios y tarifas.' using errcode = '42501';
  end if;
  return public.razas_proponer_interna(p_nombre, p_variantes, p_tamano_id, p_pelaje_id, p_notas, p_perro_id, p_grupo_raza_id, 'formulario');
end;
$$;
alter function public.razas_proponer_formulario(text, text[], uuid, uuid, text, uuid, uuid) owner to peludesk_definer;
revoke execute on function public.razas_proponer_formulario(text, text[], uuid, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.razas_proponer_formulario(text, text[], uuid, uuid, text, uuid, uuid) to authenticated, service_role;

create or replace function public.razas_proponer_cliente(
  p_perro_id uuid, p_nombre text, p_variantes text[], p_notas text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Solo el servidor puede proponer una raza a nombre de un dueño.' using errcode = '42501';
  end if;
  if p_perro_id is null then raise exception 'Falta el perro.'; end if;
  return public.razas_proponer_interna(p_nombre, p_variantes, null, null, p_notas, p_perro_id, null, 'cliente');
end;
$$;
alter function public.razas_proponer_cliente(uuid, text, text[], text) owner to peludesk_definer;
revoke execute on function public.razas_proponer_cliente(uuid, text, text[], text) from public, anon, authenticated;
grant execute on function public.razas_proponer_cliente(uuid, text, text[], text) to service_role;

-- ── 5. El grupo de una propuesta pendiente ────────────────────────────

create or replace function public.asignar_grupo_propuesta(p_propuesta_id uuid, p_grupo_raza_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.tiene_permiso('tarifas')), false) then
    raise exception 'Asignar el grupo de precio es de admin o de quien tenga el permiso de precios y tarifas.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.razas_propuestas where id = p_propuesta_id and estado = 'pendiente' and deleted_at is null and negocio_id = (select public.negocio_actual())) then
    raise exception 'Esa propuesta ya no está pendiente.';
  end if;
  if not exists (select 1 from public.grupos_raza where id = p_grupo_raza_id and deleted_at is null and negocio_id = (select public.negocio_actual())) then
    raise exception 'Ese grupo de precio no existe en este negocio.';
  end if;
  update public.razas_propuestas set grupo_raza_id = p_grupo_raza_id where id = p_propuesta_id;
end;
$$;
alter function public.asignar_grupo_propuesta(uuid, uuid) owner to peludesk_definer;
revoke execute on function public.asignar_grupo_propuesta(uuid, uuid) from public, anon;
grant execute on function public.asignar_grupo_propuesta(uuid, uuid) to authenticated, service_role;

-- Las propuestas pendientes de ESTE negocio con perros y sin grupo de precio.
create or replace function public.razas_propuestas_sin_grupo()
returns table (propuesta_id uuid, nombre text, perros integer, desde timestamptz, tamano text, pelaje text, notas text)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not coalesce((select public.is_staff()), false) then
    raise exception 'Solo el personal del negocio puede ver esto.' using errcode = '42501';
  end if;
  return query
  select pr.id, pr.nombre,
    (select count(*)::int from public.razas_propuestas_perros pp join public.perros p on p.id = pp.perro_id and p.deleted_at is null and p.fallecido = false and p.raza_id is null where pp.propuesta_id = pr.id and pp.deleted_at is null),
    pr.created_at, t.etiqueta, pe.etiqueta, pr.notas
  from public.razas_propuestas pr
  left join public.tamanos_categoria t on t.id = pr.tamano_id
  left join public.tipos_pelaje pe on pe.id = pr.pelaje_id
  where pr.estado = 'pendiente' and pr.deleted_at is null and pr.grupo_raza_id is null
  order by pr.created_at, pr.nombre;
end;
$$;
revoke execute on function public.razas_propuestas_sin_grupo() from public, anon;
grant execute on function public.razas_propuestas_sin_grupo() to authenticated, service_role;

-- ── 4. perro_grupo_raza con la propuesta pendiente ────────────────────

create or replace view public.perro_grupo_raza with (security_invoker = true) as
select p.id as perro_id,
  case when r.id is not null then g.id when pr.id is not null then gpr.id else gp.id end as grupo_raza_id,
  case when r.id is not null then g.clave when pr.id is not null then gpr.clave else gp.clave end as grupo_clave,
  case when r.id is not null then g.nombre when pr.id is not null then gpr.nombre else gp.nombre end as grupo_nombre,
  case when r.id is not null then g.depende_tamano when pr.id is not null then gpr.depende_tamano else gp.depende_tamano end as depende_tamano,
  (p.raza_id is null and pr.id is null) as por_defecto,
  ((r.id is not null and g.id is null) or (pr.id is not null and gpr.id is null)) as sin_grupo,
  r.id as raza_id,
  coalesce(r.nombre, pr.nombre) as raza_nombre
from public.perros p
left join public.razas r on r.id = p.raza_id and r.deleted_at is null
left join public.razas_grupo rg on rg.raza_id = r.id and rg.negocio_id = p.negocio_id and rg.deleted_at is null
left join public.grupos_raza g on g.id = rg.grupo_raza_id and g.deleted_at is null
left join lateral (
  select x.id, x.nombre, x.grupo_raza_id
  from public.razas_propuestas_perros pp
  join public.razas_propuestas x on x.id = pp.propuesta_id and x.deleted_at is null and x.estado = 'pendiente'
  where pp.perro_id = p.id and pp.deleted_at is null and p.raza_id is null
  order by pp.created_at desc limit 1
) pr on true
left join public.grupos_raza gpr on gpr.id = pr.grupo_raza_id and gpr.deleted_at is null
left join public.grupos_raza gp on gp.es_predeterminado and gp.deleted_at is null and gp.negocio_id = p.negocio_id
where p.deleted_at is null;

-- ── 6. La bandeja de la plataforma ────────────────────────────────────

drop function public.plataforma_razas_propuestas();
create function public.plataforma_razas_propuestas()
returns table (
  id uuid, negocio_id uuid, negocio_nombre text, nombre text, variantes text[], tamano text, pelaje text, texto_origen text,
  estado text, motivo text, perros integer, creada_at timestamptz, resuelta_at timestamptz, raza_nombre text, parecidas jsonb,
  notas text, origen text, grupo_nombre text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (coalesce((select public.es_admin_plataforma()), false) or auth.role() = 'service_role') then
    raise exception 'Solo la administración de la plataforma.' using errcode = '42501';
  end if;
  return query
  select pr.id, pr.negocio_id, n.nombre, pr.nombre, pr.variantes, t.etiqueta, pe.etiqueta, pr.texto_origen,
    pr.estado, pr.motivo,
    (select count(*)::int from public.razas_propuestas_perros pp where pp.propuesta_id = pr.id and pp.deleted_at is null),
    pr.created_at, pr.resuelta_at, r.nombre,
    coalesce((
      select jsonb_agg(jsonb_build_object('raza_id', s.raza_id, 'nombre', s.raza_nombre, 'puntaje', round(s.puntaje::numeric, 2)) order by s.puntaje desc)
      from (
        select v.raza_id, v.raza_nombre, max(extensions.similarity(v.variante_norm, pr.nombre_norm)) as puntaje
        from public.razas_variantes v group by v.raza_id, v.raza_nombre
        having max(extensions.similarity(v.variante_norm, pr.nombre_norm)) >= 0.4
        order by 3 desc limit 3
      ) s
    ), '[]'::jsonb),
    pr.notas, pr.origen, gr.nombre
  from public.razas_propuestas pr
  join public.negocios n on n.id = pr.negocio_id
  left join public.tamanos_categoria t on t.id = pr.tamano_id
  left join public.tipos_pelaje pe on pe.id = pr.pelaje_id
  left join public.razas r on r.id = pr.raza_id
  left join public.grupos_raza gr on gr.id = pr.grupo_raza_id
  where pr.deleted_at is null
  order by (pr.estado = 'pendiente') desc, pr.created_at;
end;
$$;
revoke execute on function public.plataforma_razas_propuestas() from public, anon;
grant execute on function public.plataforma_razas_propuestas() to authenticated, service_role;

-- Al aprobar, el grupo que el negocio le dio a la propuesta queda como el de
-- la raza EN ESE negocio (si ya tenía uno, no se le pisa). Sin grupo en la
-- propuesta, la plataforma no asigna ninguno.
create or replace function public.plataforma_resolver_propuesta(
  p_id uuid, p_accion text, p_motivo text default null, p_raza_destino uuid default null, p_nombre text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pr record;
  v_raza_id uuid;
  v_nombre text;
  v_conf record;
  v_vars text[];
begin
  if not (coalesce((select public.es_admin_plataforma()), false) or auth.role() = 'service_role') then
    raise exception 'Solo la administración de la plataforma.' using errcode = '42501';
  end if;
  select * into v_pr from public.razas_propuestas where id = p_id and deleted_at is null;
  if v_pr.id is null then raise exception 'No encontré esa propuesta.'; end if;
  if v_pr.estado <> 'pendiente' then raise exception 'Esa propuesta ya se resolvió.'; end if;
  if p_accion not in ('aprobar', 'rechazar', 'variante') then raise exception 'Acción desconocida.'; end if;

  -- Los triggers y la RLS trabajan en el negocio de la propuesta.
  perform set_config('app.negocio_id', v_pr.negocio_id::text, true);

  if p_accion = 'rechazar' then
    if btrim(coalesce(p_motivo, '')) = '' then raise exception 'El motivo del rechazo es obligatorio.'; end if;
    update public.razas_propuestas set estado = 'rechazada', motivo = btrim(p_motivo), resuelta_por = auth.uid(), resuelta_at = now() where id = p_id;
    return null;
  end if;

  if p_accion = 'variante' then
    select id, nombre into v_raza_id, v_nombre from public.razas where id = p_raza_destino and deleted_at is null;
    if v_raza_id is null then raise exception 'Elige la raza de la que es variante.'; end if;
    select array_agg(distinct x) into v_vars
    from unnest(array[v_pr.nombre] || v_pr.variantes) x
    where public.normalizar_raza(x) <> '' and not exists (select 1 from public.razas_conflicto(x) c where c.raza_id is not null);
    update public.razas set alias = alias || coalesce(v_vars, '{}') where id = v_raza_id;
  else
    v_nombre := btrim(coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), v_pr.nombre));
    select * into v_conf from public.razas_conflicto(v_nombre);
    if v_conf.raza_id is not null then
      raise exception 'Ya existe «%» en el catálogo: apruébala como variante de esa raza.', v_conf.raza_nombre;
    end if;
    select array_agg(distinct x) into v_vars
    from unnest(v_pr.variantes) x
    where public.normalizar_raza(x) <> public.normalizar_raza(v_nombre) and not exists (select 1 from public.razas_conflicto(x) c where c.raza_id is not null);
    insert into public.razas (nombre, alias, tamano_tipico_id, pelaje_tipico_id)
    values (v_nombre, coalesce(v_vars, '{}'), v_pr.tamano_id, v_pr.pelaje_id)
    returning id into v_raza_id;
  end if;

  -- Los perros que la propusieron se ligan solos.
  update public.perros p set raza_id = v_raza_id, raza = v_nombre
  where p.negocio_id = v_pr.negocio_id and p.raza_id is null and p.deleted_at is null
    and p.id in (select pp.perro_id from public.razas_propuestas_perros pp where pp.propuesta_id = p_id and pp.deleted_at is null);

  -- El grupo que ese negocio escogió, si lo hizo y la raza aún no tiene uno allí.
  if v_pr.grupo_raza_id is not null
     and exists (select 1 from public.grupos_raza g where g.id = v_pr.grupo_raza_id and g.negocio_id = v_pr.negocio_id and g.deleted_at is null)
     and not exists (select 1 from public.razas_grupo rg where rg.raza_id = v_raza_id and rg.negocio_id = v_pr.negocio_id and rg.deleted_at is null) then
    insert into public.razas_grupo (negocio_id, raza_id, grupo_raza_id) values (v_pr.negocio_id, v_raza_id, v_pr.grupo_raza_id);
  end if;

  update public.razas_propuestas
  set estado = case when p_accion = 'variante' then 'variante' else 'aprobada' end,
      raza_id = v_raza_id, motivo = nullif(btrim(coalesce(p_motivo, '')), ''), resuelta_por = auth.uid(), resuelta_at = now()
  where id = p_id;
  return v_raza_id;
end;
$$;
revoke execute on function public.plataforma_resolver_propuesta(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.plataforma_resolver_propuesta(uuid, text, text, uuid, text) to authenticated, service_role;
