-- Bienvenida «ya puede operar» (QA S16, 19 de octubre de 2026).
--
-- Cada paso de /bienvenida se marca «Listo» solo cuando el negocio ya puede operar de verdad. Para eso hacen falta
-- tres cosas que no existían:
--   1. negocio_ajustes_operacion (una fila por negocio): si la evaluación de comportamiento es requisito para
--      hospedar (por omisión SÍ, como hasta hoy), cuándo y quién revisó los requisitos para hospedar, y si el dueño
--      confirmó que él mismo atiende la estética.
--   2. La cédula profesional se valida (7 u 8 números) al designar a un médico, y el admin puede designarse a sí mismo.
--   3. La dirección del negocio es UN solo campo (negocio_perfil.direccion): lo escriben Configuración, Perfil y la
--      Ubicación para recolección, y la sucursal (la que se ubica en el mapa) lo sigue.
-- Además: un negocio de prueba nuevo nace con Recolección apagada (se prende si la ofrece) y Caja → Cargo suelto
-- ofrece los conceptos de Veterinaria con su precio de catálogo.

-- ── 1. Ajustes de operación ────────────────────────────────────────────────────────────────────────────────────────
create table public.negocio_ajustes_operacion (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  exige_evaluacion_comportamiento boolean not null default true,
  requisitos_revisados_at timestamptz,
  requisitos_revisados_por uuid references auth.users(id) on delete set null,
  dueno_atiende_estetica boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index negocio_ajustes_operacion_negocio_uq on public.negocio_ajustes_operacion (negocio_id) where deleted_at is null;

do $$
declare
  t text := 'negocio_ajustes_operacion';
begin
  execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
  execute format('alter table public.%I enable row level security', t);
  execute format($p$create policy %I on public.%I as restrictive for all to authenticated
    using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
    with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$p$, t || '_negocio', t);
  execute format($p$create policy %I on public.%I for all to peludesk_definer
    using (negocio_id = (select public.negocio_actual()))
    with check (negocio_id = (select public.negocio_actual()))$p$, t || '_negocio_definer', t);
  execute format($p$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
    with check ((select public.exigir_negocio_escribible()))$p$, t || '_escritura_ins', t);
  execute format($p$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
    using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$p$, t || '_escritura_upd', t);
  execute format($p$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
    using ((select public.exigir_negocio_escribible()))$p$, t || '_escritura_del', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select on public.%I to authenticated', t);
  execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
end $$;

-- Leer: el personal del negocio. Escribir: solo por las funciones de abajo.
create policy negocio_ajustes_operacion_select on public.negocio_ajustes_operacion
  for select to authenticated using ((select public.is_staff()));
create policy negocio_ajustes_operacion_insert on public.negocio_ajustes_operacion
  for insert to authenticated with check (false);

-- La fila del negocio de la petición (la crea si no existe).
create or replace function public._ajustes_operacion_id()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select a.id into v_id from public.negocio_ajustes_operacion a
  where a.negocio_id = public.negocio_actual() and a.deleted_at is null;
  if v_id is null then
    insert into public.negocio_ajustes_operacion default values returning id into v_id;
  end if;
  return v_id;
end;
$$;
alter function public._ajustes_operacion_id() owner to peludesk_definer;
revoke execute on function public._ajustes_operacion_id() from public, anon, authenticated;

-- ¿La evaluación de comportamiento es requisito para hospedar en este negocio? Sin fila: sí (lo de siempre).
create or replace function public.evaluacion_exigida()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.exige_evaluacion_comportamiento from public.negocio_ajustes_operacion a
                   where a.negocio_id = public.negocio_actual() and a.deleted_at is null limit 1), true);
$$;
alter function public.evaluacion_exigida() owner to peludesk_definer;
revoke execute on function public.evaluacion_exigida() from public, anon;
grant execute on function public.evaluacion_exigida() to authenticated, service_role;

-- Los requisitos para hospedar, en una sola llamada: evaluación sí/no y qué vacunas/desparasitaciones son
-- obligatorias (con su vigencia en meses). Deja anotado que se revisaron (el paso de la bienvenida lo lee).
create or replace function public.guardar_requisitos_estancia(
  p_exige_evaluacion boolean,
  p_obligatorias uuid[],
  p_vigencias jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_tipo record;
  v_meses int;
begin
  if not coalesce(public.tiene_permiso('configuracion_negocio'), false) then
    raise exception 'Solo un admin, o quien tenga el permiso «Configuración del negocio», cambia los requisitos para hospedar.' using errcode = '42501';
  end if;
  if p_exige_evaluacion is null then
    raise exception 'Indica si la evaluación de comportamiento es requisito.';
  end if;
  for v_tipo in
    select t.id, t.etiqueta, t.vigencia_meses from public.tipos_requisito_sanitario t
    where t.negocio_id = public.negocio_actual() and t.deleted_at is null
  loop
    v_meses := v_tipo.vigencia_meses;
    if p_vigencias ? v_tipo.id::text then
      begin
        v_meses := (p_vigencias ->> v_tipo.id::text)::int;
      exception when others then
        raise exception 'La vigencia de % tiene que ser un número de meses.', v_tipo.etiqueta;
      end;
      if v_meses is null or v_meses < 1 or v_meses > 60 then
        raise exception 'La vigencia de % va de 1 a 60 meses.', v_tipo.etiqueta;
      end if;
    end if;
    update public.tipos_requisito_sanitario
    set obligatoria = (v_tipo.id = any (coalesce(p_obligatorias, '{}'::uuid[]))),
        vigencia_meses = v_meses
    where id = v_tipo.id
      and (obligatoria is distinct from (v_tipo.id = any (coalesce(p_obligatorias, '{}'::uuid[]))) or vigencia_meses is distinct from v_meses);
  end loop;
  v_id := public._ajustes_operacion_id();
  update public.negocio_ajustes_operacion
  set exige_evaluacion_comportamiento = p_exige_evaluacion,
      requisitos_revisados_at = now(),
      requisitos_revisados_por = auth.uid()
  where id = v_id;
end;
$$;
alter function public.guardar_requisitos_estancia(boolean, uuid[], jsonb) owner to peludesk_definer;
revoke execute on function public.guardar_requisitos_estancia(boolean, uuid[], jsonb) from public, anon;
grant execute on function public.guardar_requisitos_estancia(boolean, uuid[], jsonb) to authenticated, service_role;

-- «Yo atiendo la estética»: el dueño confirma que él mismo atiende las citas (cuenta como persona asignable).
create or replace function public.marcar_dueno_atiende(p_atiende boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin confirma quién atiende.' using errcode = '42501';
  end if;
  v_id := public._ajustes_operacion_id();
  update public.negocio_ajustes_operacion set dueno_atiende_estetica = coalesce(p_atiende, false) where id = v_id;
end;
$$;
alter function public.marcar_dueno_atiende(boolean) owner to peludesk_definer;
revoke execute on function public.marcar_dueno_atiende(boolean) from public, anon;
grant execute on function public.marcar_dueno_atiende(boolean) to authenticated, service_role;

-- ── 2. La evaluación solo bloquea si el negocio la exige ──────────────────────────────────────────────────────────
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.validar_estancia()'::regprocedure), chr(13), '') into v_def;
  if position('public.evaluacion_exigida()' in v_def) = 0 then
    v_def := replace(v_def,
      'elsif v_perro.evaluacion_comportamiento_fecha is null then',
      'elsif v_perro.evaluacion_comportamiento_fecha is null and public.evaluacion_exigida() then');
    if position('public.evaluacion_exigida()' in v_def) = 0 then
      raise exception 'validar_estancia cambió: no se pudo hacer opcional la evaluación.';
    end if;
    execute v_def;
  end if;

  select replace(pg_get_functiondef('public.pendientes_para_estancia(uuid[])'::regprocedure), chr(13), '') into v_def;
  if position('public.evaluacion_exigida()' in v_def) = 0 then
    v_def := replace(v_def,
      'where p.evaluacion_comportamiento_fecha is null',
      'where p.evaluacion_comportamiento_fecha is null and public.evaluacion_exigida()');
    if position('public.evaluacion_exigida()' in v_def) = 0 then
      raise exception 'pendientes_para_estancia cambió: no se pudo hacer opcional la evaluación.';
    end if;
    execute v_def;
  end if;
end $$;

-- ── 3. Cédula profesional: 7 u 8 números ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
  v_viejo text := $v$  if btrim(coalesce(p_cedula, '')) = '' then
    raise exception 'Escribe la cédula profesional del médico.';
  end if;$v$;
begin
  select replace(pg_get_functiondef('public.guardar_medico_veterinario(uuid,text,text)'::regprocedure), chr(13), '') into v_def;
  if position('[0-9]{7,8}' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'guardar_medico_veterinario cambió: no se pudo agregar la validación de la cédula.';
    end if;
    v_def := replace(v_def, v_viejo, v_viejo || $n$
  -- La cédula profesional (Registro Nacional de Profesionistas) son 7 u 8 números. Se aceptan espacios y guiones al
  -- escribirla; se guarda solo con los números.
  p_cedula := regexp_replace(p_cedula, '[\s.-]', '', 'g');
  if p_cedula !~ '^[0-9]{7,8}$' then
    raise exception 'La cédula profesional son 7 u 8 números, sin letras. Revísala en el Registro Nacional de Profesionistas.';
  end if;$n$);
    execute v_def;
  end if;
end $$;

-- ── 4. Una sola dirección del negocio ─────────────────────────────────────────────────────────────────────────────
-- La sucursal (la que se ubica en el mapa para la recolección) sigue a la dirección del perfil. Si el texto cambia,
-- sus coordenadas se borran: se vuelven a ubicar en «Ubicación para recolección» o al cotizar.
create or replace function public.negocio_perfil_sincroniza_direccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sucursal uuid;
  v_texto text := nullif(btrim(coalesce(new.direccion, '')), '');
begin
  if v_texto is null then
    return new;
  end if;
  select s.id into v_sucursal from public.sucursales s
  where s.negocio_id = new.negocio_id and s.deleted_at is null
  order by s.activo desc, s.created_at
  limit 1;
  if v_sucursal is null then
    insert into public.sucursales (negocio_id, nombre, activo, direccion)
    select new.negocio_id, n.nombre, true, v_texto from public.negocios n where n.id = new.negocio_id;
  else
    update public.sucursales set direccion = v_texto, lat = null, lng = null
    where id = v_sucursal and direccion is distinct from v_texto;
  end if;
  return new;
end;
$$;
alter function public.negocio_perfil_sincroniza_direccion() owner to peludesk_definer;
revoke execute on function public.negocio_perfil_sincroniza_direccion() from public, anon, authenticated;

create trigger negocio_perfil_sincroniza_direccion
  after insert or update of direccion on public.negocio_perfil
  for each row execute function public.negocio_perfil_sincroniza_direccion();

-- Guardar la dirección desde Configuración (o la bienvenida): el mismo campo que Perfil y la página web.
create or replace function public.guardar_direccion_negocio(p_direccion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto text := nullif(btrim(coalesce(p_direccion, '')), '');
  v_id uuid;
begin
  if not coalesce(public.tiene_permiso('configuracion_negocio'), false) then
    raise exception 'Solo un admin, o quien tenga el permiso «Configuración del negocio», cambia la dirección.' using errcode = '42501';
  end if;
  if v_texto is null then
    raise exception 'Escribe la dirección del negocio: calle, número y colonia.';
  end if;
  if char_length(v_texto) > 200 then
    raise exception 'La dirección lleva hasta 200 caracteres.';
  end if;
  select p.id into v_id from public.negocio_perfil p where p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if v_id is null then
    insert into public.negocio_perfil (direccion) values (v_texto);
  else
    update public.negocio_perfil set direccion = v_texto where id = v_id and direccion is distinct from v_texto;
  end if;
end;
$$;
alter function public.guardar_direccion_negocio(text) owner to peludesk_definer;
revoke execute on function public.guardar_direccion_negocio(text) from public, anon;
grant execute on function public.guardar_direccion_negocio(text) to authenticated, service_role;

-- Ubicación para recolección escribe también el perfil (antes guardaba la suya aparte).
do $$
declare
  v_def text;
  v_ancla text := $a$  if nullif(btrim(coalesce(p_direccion, '')), '') is not null then
    select id into v_sucursal from public.sucursales$a$;
begin
  select replace(pg_get_functiondef('public.guardar_ubicacion_negocio(text,double precision,double precision,text,double precision,double precision)'::regprocedure), chr(13), '') into v_def;
  if position('negocio_perfil' in v_def) = 0 then
    if position(v_ancla in v_def) = 0 then
      raise exception 'guardar_ubicacion_negocio cambió: no se pudo unificar la dirección.';
    end if;
    v_def := replace(v_def, v_ancla, $n$  -- La dirección del negocio es una sola (la del perfil y la página web). El disparador del perfil le borra las
  -- coordenadas a la sucursal si el texto cambió; aquí mismo se vuelven a poner.
  if nullif(btrim(coalesce(p_direccion, '')), '') is not null then
    if exists (select 1 from public.negocio_perfil p where p.negocio_id = v_neg and p.deleted_at is null) then
      update public.negocio_perfil set direccion = btrim(p_direccion)
      where negocio_id = v_neg and deleted_at is null and direccion is distinct from btrim(p_direccion);
    else
      insert into public.negocio_perfil (direccion) values (btrim(p_direccion));
    end if;
  end if;
$n$ || v_ancla);
    execute v_def;
  end if;
end $$;

-- ── 5. Recolección nace apagada en un negocio de prueba nuevo ────────────────────────────────────────────────────
do $$
declare
  v_def text;
  v_viejo text := $v$or (m.clave in ('contratos', 'recoleccion') and not v_estancias);$v$;
begin
  select replace(pg_get_functiondef(p.oid), chr(13), '') into v_def
  from pg_proc p where p.proname = 'registrar_negocio_prueba' and p.pronamespace = 'public'::regnamespace;
  if position($x$or m.clave = 'recoleccion'$x$ in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'registrar_negocio_prueba cambió: no se pudo apagar la recolección por omisión.';
    end if;
    v_def := replace(v_def, v_viejo, $n$or (m.clave = 'contratos' and not v_estancias)
     -- Recolección solo si el negocio la ofrece: se prende en Módulos y plan (QA S16, N70).
     or m.clave = 'recoleccion';$n$);
    execute v_def;
  end if;
end $$;

-- ── 6. Cargo suelto de Veterinaria: consulta, urgencia, seguimiento o aplicación de vacuna, con su precio ─────────
create or replace function public.vet_cargo_suelto(
  p_cliente_id uuid,
  p_perro_id uuid,
  p_clave text,
  p_cantidad integer,
  p_notas text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserva uuid;
  v_cargo uuid;
  v_precio numeric;
  v_nombre text;
  v_cantidad integer := coalesce(p_cantidad, 1);
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden aplicar un cargo.' using errcode = '42501';
  end if;
  if not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Veterinaria está apagada en este negocio.';
  end if;
  if p_clave not in ('vet_consulta_general', 'vet_consulta_urgencia', 'vet_revision_seguimiento', 'vet_aplicacion_vacuna') then
    raise exception 'Ese concepto no es del catálogo de Veterinaria.';
  end if;
  if v_cantidad < 1 or v_cantidad > 50 then
    raise exception 'La cantidad va de 1 a 50.';
  end if;
  if not exists (select 1 from public.clientes c where c.id = p_cliente_id and c.deleted_at is null) then
    raise exception 'Cliente no encontrado.';
  end if;
  if p_perro_id is not null and not exists (
    select 1 from public.perros p where p.id = p_perro_id and p.cliente_id = p_cliente_id and p.deleted_at is null
  ) then
    raise exception 'Esa mascota no es de este cliente.';
  end if;
  select s.nombre into v_nombre from public.servicios s where s.clave = p_clave and s.deleted_at is null;
  if v_nombre is null then
    perform public.vet_asegurar_servicios();
    select s.nombre into v_nombre from public.servicios s where s.clave = p_clave and s.deleted_at is null;
  end if;
  v_precio := public._vet_precio_servicio(p_clave);
  if v_precio is null then
    raise exception '«%» no tiene precio todavía. Captúralo en /servicios', coalesce(v_nombre, p_clave);
  end if;

  insert into public.reservas (cliente_id, notas)
  values (p_cliente_id, 'Cargo suelto: ' || v_nombre)
  returning id into v_reserva;

  insert into public.cargos_aplicados (reserva_id, perro_id, servicio_id, cantidad, precio, descripcion, notas)
  values (
    v_reserva, p_perro_id,
    public.vet_servicio_cargo_consulta(case when p_clave = 'vet_aplicacion_vacuna' then 'vacuna' else 'consulta' end),
    1, round(v_precio * v_cantidad, 2),
    case when v_cantidad = 1 then v_nombre else v_cantidad || ' × ' || v_nombre end,
    nullif(btrim(coalesce(p_notas, '')), '')
  )
  returning id into v_cargo;

  return jsonb_build_object('reserva_id', v_reserva, 'cargo_id', v_cargo, 'precio', round(v_precio * v_cantidad, 2));
end;
$$;
alter function public.vet_cargo_suelto(uuid, uuid, text, integer, text) owner to peludesk_definer;
revoke execute on function public.vet_cargo_suelto(uuid, uuid, text, integer, text) from public, anon;
grant execute on function public.vet_cargo_suelto(uuid, uuid, text, integer, text) to authenticated, service_role;
