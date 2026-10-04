-- La plataforma agrega una raza al catálogo compartido (sin pasar por una
-- propuesta de un negocio): la usa la pantalla de catálogos y el caso
-- operativo del primer día (Calupoh). Queda en plataforma_eventos. NUNCA
-- asigna un grupo de precio: cada negocio decide el suyo.

alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check
  check (accion in ('crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo',
                    'cambiar_plan', 'asignar_plan', 'editar_plan', 'resolver_propuesta_raza', 'agregar_raza'));

create or replace function public.plataforma_agregar_raza(
  p_nombre text, p_variantes text[], p_tamano_clave text default null, p_pelaje_clave text default null, p_motivo text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_conf record;
  v_vars text[];
  v_tamano uuid;
  v_pelaje uuid;
  v_id uuid;
begin
  if not (coalesce((select public.es_admin_plataforma()), false) or auth.role() = 'service_role') then
    raise exception 'Solo la administración de la plataforma.' using errcode = '42501';
  end if;
  if public.normalizar_raza(v_nombre) = '' then raise exception 'Escribe el nombre de la raza.'; end if;
  select * into v_conf from public.razas_conflicto(v_nombre);
  if v_conf.raza_id is not null then
    raise exception 'Ya existe en el catálogo como «%».', v_conf.raza_nombre;
  end if;
  select array_agg(distinct btrim(x)) into v_vars
  from unnest(coalesce(p_variantes, '{}')) x
  where public.normalizar_raza(x) <> '' and public.normalizar_raza(x) <> public.normalizar_raza(v_nombre);
  if exists (select 1 from unnest(coalesce(v_vars, '{}')) x, lateral public.razas_conflicto(x) c where c.raza_id is not null) then
    raise exception 'Una de las variantes ya es de otra raza del catálogo.';
  end if;
  if p_tamano_clave is not null then
    select id into v_tamano from public.tamanos_categoria where clave = p_tamano_clave and deleted_at is null;
    if v_tamano is null then raise exception 'La talla «%» no existe.', p_tamano_clave; end if;
  end if;
  if p_pelaje_clave is not null then
    select id into v_pelaje from public.tipos_pelaje where clave = p_pelaje_clave and deleted_at is null;
    if v_pelaje is null then raise exception 'El tipo de pelo «%» no existe.', p_pelaje_clave; end if;
  end if;

  insert into public.razas (nombre, alias, tamano_tipico_id, pelaje_tipico_id)
  values (v_nombre, coalesce(v_vars, '{}'), v_tamano, v_pelaje)
  returning id into v_id;

  insert into public.plataforma_eventos (accion, motivo, detalle, created_by)
  values ('agregar_raza', nullif(btrim(coalesce(p_motivo, '')), ''),
          jsonb_build_object('raza_id', v_id, 'nombre', v_nombre, 'variantes', coalesce(v_vars, '{}'), 'tamano', p_tamano_clave, 'pelaje', p_pelaje_clave, 'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end),
          auth.uid());
  return v_id;
end;
$$;
revoke execute on function public.plataforma_agregar_raza(text, text[], text, text, text) from public, anon;
grant execute on function public.plataforma_agregar_raza(text, text[], text, text, text) to authenticated, service_role;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('plataforma_agregar_raza' in v_def) = 0 then
    v_def := replace(v_def, $a$('plataforma_razas_propuestas')$a$, $b$('plataforma_razas_propuestas'), ('plataforma_agregar_raza')$b$);
    if position('plataforma_agregar_raza' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar plataforma_agregar_raza.';
    end if;
    execute v_def;
  end if;
end $$;
