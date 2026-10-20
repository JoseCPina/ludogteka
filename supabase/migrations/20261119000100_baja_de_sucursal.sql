-- Dar de baja una sucursal (QA S17, 19 de octubre de 2026).
--
-- Desde Módulos y plan → Sucursales, el admin de la PRIMERA sucursal da de baja una sucursal adicional: queda en
-- SOLO LECTURA 90 días (se puede consultar todo; no se escribe nada), sale de «Tus negocios» y deja de contarse en
-- `sucursales_activas`, así que el concepto «Sucursal adicional» de la suscripción baja en uno (Stripe deja la
-- parte proporcional a favor; lo hace el servidor). Lo mismo cuando la plataforma la suspende o la borra (ya no
-- está activa o ya no existe: el servidor vuelve a ajustar la cantidad). La primera no se puede dar de baja, y la
-- plataforma no la suspende ni la borra mientras tenga sucursales activas.
--
-- REVERSA: alter table public.negocios drop column sucursal_baja_at, drop column sucursal_baja_hasta,
-- drop column sucursal_baja_motivo, drop column sucursal_baja_por; y volver a poner sucursales_activas,
-- mis_negocios, mis_sucursales y negocio_escribible_en de 20261117000000 / 20260927235421.

alter table public.negocios
  add column sucursal_baja_at timestamptz,
  add column sucursal_baja_hasta timestamptz,
  add column sucursal_baja_motivo text,
  add column sucursal_baja_por uuid references auth.users(id) on delete set null;

-- Lo de la baja solo lo cambia el servidor (la función de abajo) o la plataforma: nadie con sesión de un negocio.
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.validar_negocio()'::regprocedure), chr(13), '') into v_def;
  if position('sucursal_baja_at' in v_def) = 0 then
    v_def := regexp_replace(v_def, '(\mbegin\M)', E'begin\n  if tg_op = ''UPDATE'' and (new.sucursal_baja_at is distinct from old.sucursal_baja_at\n      or new.sucursal_baja_hasta is distinct from old.sucursal_baja_hasta) and coalesce(auth.role(), '''') <> ''service_role''\n      and not coalesce(public.es_admin_plataforma(), false) and current_user not in (''postgres'', ''supabase_admin'') then\n    raise exception ''La baja de una sucursal solo se hace desde Módulos y plan.'' using errcode = ''42501'';\n  end if;', '');
    if position('sucursal_baja_at' in v_def) = 0 then raise exception 'validar_negocio cambió: no se pudo proteger la baja de sucursal.'; end if;
    execute v_def;
  end if;
end $$;

-- Una sucursal dada de baja no escribe (solo lectura) …
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.negocio_escribible_en(uuid)'::regprocedure), chr(13), '') into v_def;
  if position('sucursal_baja_at' in v_def) = 0 then
    v_def := replace(v_def, 'select n.activo and n.deleted_at is null', 'select n.activo and n.deleted_at is null and n.sucursal_baja_at is null');
    if position('sucursal_baja_at' in v_def) = 0 then raise exception 'negocio_escribible_en cambió: no se pudo agregar la baja de sucursal.'; end if;
    execute v_def;
  end if;
end $$;

-- … no se cobra …
create or replace function public.sucursales_activas(p_principal uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(auth.role(), '') = 'service_role' then
    (select count(*)::int from public.negocios n
     where n.principal_id = p_principal and n.activo and n.deleted_at is null and n.sucursal_baja_at is null)
  end;
$$;
alter function public.sucursales_activas(uuid) owner to postgres;
revoke execute on function public.sucursales_activas(uuid) from public, anon, authenticated;
grant execute on function public.sucursales_activas(uuid) to service_role;

-- … y sale de «Tus negocios».
create or replace function public.mis_negocios()
returns table(id uuid, slug text, nombre text, dominio text, url_publica text, rol text, grupo_id uuid, grupo_nombre text, es_principal boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.slug, n.nombre, n.dominio, n.url_publica, m.rol,
         coalesce(n.principal_id, n.id) as grupo_id,
         coalesce(p.nombre, n.nombre) as grupo_nombre,
         n.principal_id is null as es_principal
  from public.membresias m
  join public.negocios n on n.id = m.negocio_id and n.activo and n.deleted_at is null and n.sucursal_baja_at is null
  left join public.negocios p on p.id = n.principal_id
  where m.profile_id = auth.uid() and m.deleted_at is null
  order by coalesce(p.nombre, n.nombre), coalesce(n.principal_id, n.id), n.principal_id is not null, n.nombre;
$$;
alter function public.mis_negocios() owner to postgres;
revoke execute on function public.mis_negocios() from public, anon;
grant execute on function public.mis_negocios() to authenticated, service_role;

-- Módulos y plan enseña cuáles están dadas de baja y hasta cuándo se consultan.
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.mis_sucursales()'::regprocedure), chr(13), '') into v_def;
  if position('sucursal_baja_at' in v_def) = 0 then
    v_def := replace(v_def, $a$'es_principal', n.id = v_principal, 'activo', n.activo,$a$,
      $b$'es_principal', n.id = v_principal, 'activo', n.activo, 'baja_at', n.sucursal_baja_at, 'baja_hasta', n.sucursal_baja_hasta,$b$);
    if position('sucursal_baja_at' in v_def) = 0 then raise exception 'mis_sucursales cambió: no se pudo agregar la baja.'; end if;
    execute v_def;
  end if;
end $$;

-- Dar de baja (solo el servidor, con quien lo pide): quien lo pide es admin de la PRIMERA sucursal del grupo y la
-- sucursal es de ese grupo, activa y sin baja. Devuelve la principal para ajustar Stripe.
create or replace function public.dar_baja_sucursal(p_sucursal uuid, p_actor uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.negocios%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la baja (al menos 5 letras).';
  end if;
  select * into v_s from public.negocios n where n.id = p_sucursal and n.deleted_at is null for update;
  if not found then
    raise exception 'Sucursal no encontrada.';
  end if;
  if v_s.principal_id is null then
    raise exception 'La primera sucursal no se da de baja aquí: es la que paga el plan. Para dejar PeluDesk, cancela tu suscripción.';
  end if;
  if v_s.sucursal_baja_at is not null then
    raise exception 'Esta sucursal ya está dada de baja.';
  end if;
  if not exists (select 1 from public.membresias m where m.negocio_id = v_s.principal_id and m.profile_id = p_actor and m.rol = 'admin' and m.deleted_at is null) then
    raise exception 'Solo el admin de la primera sucursal da de baja una sucursal.' using errcode = '42501';
  end if;
  update public.negocios
  set sucursal_baja_at = now(), sucursal_baja_hasta = now() + interval '90 days', sucursal_baja_motivo = v_motivo, sucursal_baja_por = p_actor
  where id = p_sucursal;
  return jsonb_build_object('principal_id', v_s.principal_id, 'sucursal_id', p_sucursal, 'nombre', v_s.nombre, 'hasta', now() + interval '90 days');
end;
$$;
alter function public.dar_baja_sucursal(uuid, uuid, text) owner to postgres;
revoke execute on function public.dar_baja_sucursal(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.dar_baja_sucursal(uuid, uuid, text) to service_role;

-- Si Stripe no pudo bajar la cantidad, la baja se deshace (solo el servidor).
create or replace function public.revertir_baja_sucursal(p_sucursal uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.negocios
  set sucursal_baja_at = null, sucursal_baja_hasta = null, sucursal_baja_motivo = null, sucursal_baja_por = null
  where id = p_sucursal and coalesce(auth.role(), '') = 'service_role';
$$;
alter function public.revertir_baja_sucursal(uuid) owner to postgres;
revoke execute on function public.revertir_baja_sucursal(uuid) from public, anon, authenticated;
grant execute on function public.revertir_baja_sucursal(uuid) to service_role;

-- La plataforma no suspende ni borra una PRIMERA sucursal con sucursales activas.
create or replace function public.negocios_principal_con_sucursales()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.principal_id is null and ((old.activo and not new.activo) or (old.deleted_at is null and new.deleted_at is not null))
     and exists (select 1 from public.negocios s where s.principal_id = new.id and s.activo and s.deleted_at is null and s.sucursal_baja_at is null) then
    raise exception 'Este negocio es la primera sucursal y tiene sucursales activas: da de baja sus sucursales antes de suspenderlo o borrarlo.';
  end if;
  return new;
end;
$$;
drop trigger if exists negocios_principal_con_sucursales on public.negocios;
create trigger negocios_principal_con_sucursales before update on public.negocios
  for each row execute function public.negocios_principal_con_sucursales();
revoke execute on function public.negocios_principal_con_sucursales() from public, anon;
grant execute on function public.negocios_principal_con_sucursales() to authenticated, service_role;

-- Las funciones nuevas de postgres van a la lista blanca de auditoria_frontera (leyendo la lista vigente).
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('dar_baja_sucursal' in v_def) = 0 then
    v_nuevo := replace(v_def, $a$('mis_sucursales')$a$, $b$('mis_sucursales'), ('dar_baja_sucursal'), ('revertir_baja_sucursal')$b$);
    if v_nuevo = v_def then raise exception 'auditoria_frontera cambió: no se pudo agregar dar_baja_sucursal a la lista blanca.'; end if;
    execute v_nuevo;
  end if;
end $$;
