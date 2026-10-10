-- Veterinaria, Fase 0 · parte 1: el módulo, su apagado y los permisos (carril A).
--
-- · `veterinaria` entra al catálogo de módulos. Dos banderas nuevas en
--   `modulos`: `para_todos` (disponible para cualquier negocio sin importar
--   su plan: el precio de Veterinaria se define después, no en esta fase) y
--   `apagado_por_omision` (sin fila en negocio_modulos NO está prendido: los
--   demás módulos siguen "sin fila = prendido"). Hotel y Estética no cambian:
--   todos los negocios actuales los conservan prendidos. Veterinaria solo
--   queda prendida en Huellitas (desarrollo) para probarla.
-- · Las dependencias entre módulos (`modulos.requiere`) dejan de ser un caso
--   especial de «bonos» y se aplican para todos: Veterinaria requiere
--   Inventario (sus productos clínicos son insumos con lotes).
-- · `cambiar_modulo` pasa de «solo admin» a `tiene_permiso('administrar_modulos')`
--   y pide CONFIRMACIÓN del servidor al apagar algo con pendientes (estancias
--   activas, citas futuras, pacientes hospitalizados); cada cambio queda en
--   `negocio_modulos_eventos` (inmutable).
-- · PERMISOS BASADOS EN DATOS. `tiene_permiso()`, `mis_permisos()` y el check
--   de `permisos_staff` traían la lista escrita adentro y cada migración que
--   agregaba un permiso tenía que reescribir las tres cosas (y la que
--   llegara después, pisar a la anterior). Ahora la lista y el módulo del que
--   depende cada permiso viven en `permisos_catalogo`: un permiso nuevo es
--   UN insert, sin tocar funciones. Nuevos: «Administrar módulos»,
--   «Editar ficha clínica», «Administrar lotes e inventario clínico»
--   (apagados salvo admin).
-- · `registrar_negocio_prueba` acepta 'veterinaria' entre los servicios que
--   escoge quien se registra.

-- ── 1. Catálogo de módulos ───────────────────────────────────────────

alter table public.modulos
  add column para_todos boolean not null default false,
  add column apagado_por_omision boolean not null default false;

update public.modulos set orden = orden + 1 where orden >= 4;
insert into public.modulos (clave, nombre, descripcion, orden, requiere, para_todos, apagado_por_omision) values
  ('veterinaria', 'Veterinaria',
   'Ficha clínica de la mascota, inventario clínico con lotes y caducidades, médico veterinario y permisos del establecimiento.',
   4, '{inventario}', true, true);

-- Huellitas (negocio de pruebas en desarrollo) la tiene prendida. En
-- producción no existe ese negocio y esto no inserta nada.
insert into public.negocio_modulos (negocio_id, modulo, activo)
select n.id, 'veterinaria', true from public.negocios n where n.slug = 'huellitas' and n.deleted_at is null
on conflict do nothing;

-- ── 2. Qué módulos tiene y cuáles están activos ──────────────────────

create or replace function public.modulos_disponibles_de(p_negocio_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array(
    select distinct x.m
    from public.negocios n
    cross join lateral (
      select unnest(case when n.plan = 'prueba'
        then array_append(coalesce((select p.modulos from public.planes p where p.clave = 'completo' and p.deleted_at is null), '{}'::text[]), 'pagina_web')
        else coalesce((select p.modulos from public.planes p where p.id = n.plan_id), '{}'::text[]) end) as m
      union all select unnest(n.complementos)
      union all select unnest(n.modulos_cortesia)
      union all select 'pagina_web' where n.web_gratis_at is not null
      union all select mo.clave from public.modulos mo where mo.para_todos and mo.deleted_at is null
    ) x
    where n.id = p_negocio_id and x.m is not null
  ), '{}'::text[]);
$$;

create or replace function public.modulos_activos()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with prendidos as (
    select coalesce(array(
      select d from unnest(public.modulos_disponibles_de(public.negocio_actual())) d
      join public.modulos m on m.clave = d and m.deleted_at is null
      where coalesce((select nm.activo from public.negocio_modulos nm
                      where nm.negocio_id = public.negocio_actual() and nm.modulo = d and nm.deleted_at is null),
                     not m.apagado_por_omision)
    ), '{}'::text[]) as a
  )
  -- Un módulo cuyas dependencias no están activas tampoco lo está (day pass
  -- sin guardería, Veterinaria sin Inventario).
  select coalesce(array(
    select x from unnest(p.a) x
    where not exists (
      select 1 from public.modulos mm, unnest(mm.requiere) r
      where mm.clave = x and not (r = any(p.a))
    )
  ), '{}'::text[])
  from prendidos p;
$$;

create or replace function public.mis_modulos()
returns table (clave text, nombre text, descripcion text, orden int, requiere text[], disponible boolean,
               encendido boolean, activo boolean, cortesia boolean, planes text[])
language sql
stable
security definer
set search_path = ''
as $$
  with d as (select public.modulos_disponibles_de(public.negocio_actual()) as disp, public.modulos_activos() as act),
  n as (select n.modulos_cortesia from public.negocios n where n.id = public.negocio_actual())
  select m.clave, m.nombre, m.descripcion, m.orden, m.requiere,
    m.clave = any(d.disp),
    coalesce((select nm.activo from public.negocio_modulos nm
              where nm.negocio_id = public.negocio_actual() and nm.modulo = m.clave and nm.deleted_at is null),
             not m.apagado_por_omision),
    m.clave = any(d.act),
    m.clave = any(coalesce((select n.modulos_cortesia from n), '{}'::text[])),
    array(select p.nombre from public.planes p
          where p.deleted_at is null and p.activo and m.clave = any(p.modulos) order by p.orden)
  from public.modulos m, d
  where m.deleted_at is null and public.es_miembro()
  order by m.orden;
$$;

-- ── 3. Permisos basados en datos ─────────────────────────────────────

create table public.permisos_catalogo (
  clave text primary key,
  etiqueta text not null,
  -- Módulos de los que depende: con TODOS apagados el permiso no da nada.
  -- Vacío = no depende de ninguno (permisos de la base).
  modulos text[] not null default '{}',
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.permisos_catalogo
  for each row execute function public.set_updated_at();
alter table public.permisos_catalogo enable row level security;
create policy permisos_catalogo_select on public.permisos_catalogo
  for select to anon, authenticated, peludesk_definer using (true);
create policy permisos_catalogo_sin_escritura on public.permisos_catalogo
  for insert to authenticated with check (false);
grant select on public.permisos_catalogo to anon, authenticated, peludesk_definer, service_role;

insert into public.permisos_catalogo (clave, etiqueta, modulos, orden) values
  ('inventario_costos', 'Costos y compras de inventario', '{inventario}', 1),
  ('tarifas', 'Precios y tarifas', '{}', 2),
  ('reportes_financieros', 'Reportes financieros', '{reportes}', 3),
  ('personal', 'Personal', '{}', 4),
  ('configuracion_negocio', 'Configuración del negocio', '{}', 5),
  ('excepciones_reserva', 'Excepciones al reservar', '{}', 6),
  ('descuentos_sin_tope', 'Descuentos sin tope', '{}', 7),
  ('plantillas_contrato', 'Plantillas de contrato', '{contratos}', 8),
  ('nomina', 'Nómina', '{empleados}', 9),
  ('gastos', 'Gastos del local', '{gastos}', 10),
  ('reportes_guarderia', 'Reportes de guardería', '{guarderia,hotel}', 11),
  ('corregir_estilista', 'Corregir estilista de servicios cerrados', '{estetica}', 12),
  ('corregir_servicio', 'Corregir servicio de citas', '{estetica}', 13),
  ('tarjeta_manual', 'Registrar tarjeta manual', '{}', 14),
  ('ajustar_pases', 'Ajustar días de pases', '{bonos}', 15),
  ('anular_cobros', 'Anular cobros', '{}', 16),
  ('editar_monto_cobros', 'Editar monto de cobros', '{}', 17),
  ('corregir_turnos_cerrados', 'Corregir cobros de turnos cerrados', '{}', 18),
  ('agregar_efectivo', 'Agregar efectivo a caja', '{}', 19),
  ('eliminar_citas', 'Eliminar citas', '{estetica}', 20),
  ('administrar_modulos', 'Administrar módulos', '{}', 21),
  ('editar_ficha_clinica', 'Editar ficha clínica', '{veterinaria}', 22),
  ('lotes_clinicos', 'Administrar lotes e inventario clínico', '{veterinaria}', 23);

-- ¿Existe el permiso? Lo usa el check de permisos_staff (antes una lista
-- escrita a mano en cada migración).
create or replace function public.permiso_existe(p_permiso text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.permisos_catalogo c where c.clave = p_permiso and c.deleted_at is null);
$$;
revoke execute on function public.permiso_existe(text) from public, anon;
grant execute on function public.permiso_existe(text) to authenticated, service_role, peludesk_definer;

alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
alter table public.permisos_staff add constraint permisos_staff_permiso_check check (public.permiso_existe(permiso));

create or replace function public.tiene_permiso(p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Nunca NULL: un anónimo o alguien sin membresía da false, no NULL.
  select (
    coalesce(public.is_admin(), false)
    or (
      public.current_rol() = 'recepcion'
      and exists (
        select 1 from public.permisos_staff ps
        where ps.profile_id = auth.uid()
          and ps.negocio_id = public.negocio_actual()
          and ps.permiso = p_permiso
          and ps.revocado_at is null
          and ps.deleted_at is null
      )
    )
  ) and coalesce((
    -- Un permiso de un módulo inactivo no da nada. Uno que no está en el
    -- catálogo no depende de ningún módulo (como antes).
    select cardinality(c.modulos) = 0
           or exists (select 1 from unnest(c.modulos) m where public.modulo_activo(m))
    from public.permisos_catalogo c where c.clave = p_permiso and c.deleted_at is null
  ), true);
$$;

create or replace function public.mis_permisos()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select c.clave from public.permisos_catalogo c
  where c.deleted_at is null and coalesce(public.is_admin(), false)
  union
  select ps.permiso
  from public.permisos_staff ps
  where ps.profile_id = auth.uid()
    and ps.negocio_id = public.negocio_actual()
    and ps.revocado_at is null
    and ps.deleted_at is null
    and public.current_rol() = 'recepcion';
$$;

-- Tabla compartida (sin negocio_id): a la lista de compartidas de la auditoría.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('permisos_catalogo' in v_def) = 0 then
    v_def := replace(v_def, $a$compartidas(nombre) as (values $a$, $b$compartidas(nombre) as (values ('permisos_catalogo'), $b$);
    if position('permisos_catalogo' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar permisos_catalogo.';
    end if;
    execute v_def;
  end if;
end $$;

-- ── 4. Eventos de plataforma: la lista de acciones también sin reescribir ──
-- (se lee la que hay y se le suman las nuevas, para no pisar las de otras ramas)

do $$
declare
  v_def text;
  v_acciones text[];
  v_nuevas text[] := array['editar_principio_activo'];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  select coalesce(array_agg(distinct m[1]), '{}') into v_acciones
  from regexp_matches(v_def, '''([a-z_0-9]+)''', 'g') as m;
  v_acciones := (select array_agg(distinct a) from unnest(v_acciones || v_nuevas) a);
  alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
  execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
end $$;

-- ── 5. Historial de lo que se prende y se apaga ──────────────────────

create table public.negocio_modulos_eventos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  modulo text not null references public.modulos(clave),
  activo boolean not null,
  -- Lo que había pendiente al apagar y si la persona confirmó seguir.
  pendientes int not null default 0,
  pendientes_texto text,
  confirmado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index negocio_modulos_eventos_negocio_idx on public.negocio_modulos_eventos (negocio_id, created_at desc);
create trigger set_updated_at before insert or update on public.negocio_modulos_eventos
  for each row execute function public.set_updated_at();

create or replace function public.negocio_modulos_eventos_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El historial de módulos no se edita ni se borra.' using errcode = '42501';
end;
$$;
revoke execute on function public.negocio_modulos_eventos_inmutable() from public, anon;
create trigger negocio_modulos_eventos_inmutable before update or delete on public.negocio_modulos_eventos
  for each row execute function public.negocio_modulos_eventos_inmutable();

alter table public.negocio_modulos_eventos enable row level security;
create policy negocio_modulos_eventos_negocio on public.negocio_modulos_eventos
  as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy negocio_modulos_eventos_negocio_definer on public.negocio_modulos_eventos
  for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy negocio_modulos_eventos_escritura_ins on public.negocio_modulos_eventos
  as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy negocio_modulos_eventos_escritura_upd on public.negocio_modulos_eventos
  as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy negocio_modulos_eventos_escritura_del on public.negocio_modulos_eventos
  as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
create policy negocio_modulos_eventos_select on public.negocio_modulos_eventos
  for select to authenticated using ((select public.is_staff()));
revoke all on public.negocio_modulos_eventos from anon, authenticated;
grant select on public.negocio_modulos_eventos to authenticated;
grant select, insert, update, delete on public.negocio_modulos_eventos to peludesk_definer;

-- ── 6. Qué queda pendiente si se apaga; apagar con confirmación ──────

create or replace function public.impacto_apagar_modulo(p_modulo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_n int := 0;
  v_que text;
begin
  if not public.is_staff() then
    raise exception 'Solo el personal del negocio.';
  end if;
  if p_modulo in ('guarderia', 'hotel') then
    select count(*) into v_n from public.estancias e join public.servicios s on s.id = e.servicio_id
    where s.categoria = p_modulo and e.deleted_at is null
      and e.estado in ('reservada', 'confirmada', 'en_curso') and e.fecha_salida >= v_hoy;
    v_que := case when p_modulo = 'hotel' then 'estancias de hotel' else 'días de guardería' end || ' reservados o en curso';
  elsif p_modulo = 'estetica' then
    select count(*) into v_n from public.citas_estetica c
    where c.deleted_at is null and c.estado in ('reservada', 'confirmada', 'en_curso') and c.inicio >= now() - interval '12 hours';
    v_que := 'citas de estética agendadas';
  elsif p_modulo = 'bonos' then
    select count(*) into v_n from public.bonos_clientes b
    where b.deleted_at is null and (b.fecha_vencimiento is null or b.fecha_vencimiento >= v_hoy)
      and (b.ilimitado or b.cantidad_disponible > 0);
    v_que := 'paquetes vigentes con pases o días por usar';
  elsif p_modulo = 'contratos' then
    select count(*) into v_n from public.contratos c where c.deleted_at is null and c.estado = 'pendiente_firma';
    v_que := 'contratos esperando firma';
  elsif p_modulo = 'veterinaria' then
    -- Pacientes hospitalizados y citas futuras de consulta entran aquí en
    -- cuanto existan sus tablas (Fases siguientes); hoy lo que hay son los
    -- lotes con existencia en el inventario clínico.
    if to_regclass('public.insumo_lotes_saldo') is not null then
      execute 'select count(*) from public.insumo_lotes_saldo where saldo > 0' into v_n;
    end if;
    v_que := 'lotes de productos clínicos con existencia';
  end if;
  return jsonb_build_object('modulo', p_modulo, 'pendientes', v_n, 'que', v_que);
end;
$$;

drop function public.cambiar_modulo(text, boolean);
create function public.cambiar_modulo(p_modulo text, p_activo boolean, p_confirmado boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_planes text;
  v_impacto jsonb;
  v_pendientes int;
begin
  if not coalesce(public.tiene_permiso('administrar_modulos'), false) then
    raise exception 'Solo un admin, o quien tenga el permiso «Administrar módulos», prende o apaga módulos.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.modulos m where m.clave = p_modulo and m.deleted_at is null) then
    raise exception 'Ese módulo no existe.';
  end if;
  if p_activo and not (p_modulo = any(public.modulos_disponibles_de(public.negocio_actual()))) then
    select string_agg(p.nombre, ' o ' order by p.orden) into v_planes
    from public.planes p where p.deleted_at is null and p.activo and p_modulo = any(p.modulos);
    raise exception '«%» no está en tu plan. Lo incluye el plan %.', public.nombre_modulo(p_modulo), coalesce(v_planes, 'de PeluDesk');
  end if;
  v_impacto := public.impacto_apagar_modulo(p_modulo);
  v_pendientes := coalesce((v_impacto ->> 'pendientes')::int, 0);
  -- Apagar algo con pendientes pide confirmación del lado del servidor: la
  -- pantalla la pide, pero la base no confía en que lo haya hecho.
  if not p_activo and v_pendientes > 0 and not coalesce(p_confirmado, false)
     and coalesce((select nm.activo from public.negocio_modulos nm
                   where nm.negocio_id = public.negocio_actual() and nm.modulo = p_modulo and nm.deleted_at is null),
                  not (select m.apagado_por_omision from public.modulos m where m.clave = p_modulo)) then
    raise exception 'Hay % % . Confirma para apagar «%»: no se borra nada, solo se esconde.',
      v_pendientes, v_impacto ->> 'que', public.nombre_modulo(p_modulo)
      using errcode = 'P0001', hint = 'confirmar_apagado';
  end if;
  update public.negocio_modulos set activo = p_activo
  where negocio_id = public.negocio_actual() and modulo = p_modulo and deleted_at is null;
  if not found then
    insert into public.negocio_modulos (negocio_id, modulo, activo) values (public.negocio_actual(), p_modulo, p_activo);
  end if;
  insert into public.negocio_modulos_eventos (modulo, activo, pendientes, pendientes_texto, confirmado)
  values (p_modulo, p_activo, case when p_activo then 0 else v_pendientes end,
          case when p_activo then null else v_impacto ->> 'que' end, coalesce(p_confirmado, false));
  return v_impacto;
end;
$$;
alter function public.cambiar_modulo(text, boolean, boolean) owner to peludesk_definer;
revoke execute on function public.cambiar_modulo(text, boolean, boolean) from public, anon;
grant execute on function public.cambiar_modulo(text, boolean, boolean) to authenticated;

-- ── 7. Registro: Veterinaria entre los servicios que se escogen ──────

create or replace function public.registrar_negocio_prueba(
  p_nombre text, p_ciudad text, p_telefono text, p_ip text, p_persona_id uuid, p_modelo uuid,
  p_dias int default 15, p_servicios text[] default null
)
returns table (negocio_id uuid, slug text, prueba_termina_at timestamptz, plan_sugerido text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text;
  v_slug text;
  v_id uuid;
  v_fin timestamptz := now() + make_interval(days => p_dias);
  v_servicios text[] := coalesce(p_servicios, array['guarderia', 'hotel', 'estetica']);
  v_plan text;
  v_estancias boolean;
  v_vet boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' and nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'Solo el servidor registra pruebas.';
  end if;
  v_servicios := array(select s from unnest(v_servicios) s where s in ('guarderia', 'hotel', 'estetica', 'veterinaria'));
  if cardinality(v_servicios) = 0 then
    raise exception 'Escoge al menos un servicio que ofrece tu negocio.';
  end if;
  v_motivo := public.puede_registrar_prueba(p_telefono, p_ip);
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;
  v_estancias := 'guarderia' = any(v_servicios) or 'hotel' = any(v_servicios);
  v_vet := 'veterinaria' = any(v_servicios);
  -- Veterinaria necesita Inventario: solo el plan Completo lo incluye.
  v_plan := case
    when v_vet then 'completo'
    when 'estetica' = any(v_servicios) and not v_estancias then 'estetica'
    when v_estancias and not ('estetica' = any(v_servicios)) then 'guarderia_hotel'
    else 'completo' end;
  v_slug := public.slug_libre(p_nombre);
  v_id := public.crear_negocio(v_slug, btrim(p_nombre), 'America/Mexico_City', nullif(btrim(coalesce(p_ciudad, '')), ''), null, p_modelo);
  update public.negocios
  set plan = 'prueba', prueba_termina_at = v_fin, plan_id = (select id from public.planes where clave = v_plan and deleted_at is null)
  where id = v_id;
  -- Prendidos solo los servicios que ofrece (y lo que depende de ellos);
  -- lo demás del plan Completo, prendido para que lo conozca. Veterinaria
  -- nace apagada y solo se prende si la escogió.
  insert into public.negocio_modulos (negocio_id, modulo, activo)
  select v_id, m.clave, false from public.modulos m
  where (m.clave in ('guarderia', 'hotel', 'estetica') and not (m.clave = any(v_servicios)))
     or (m.clave = 'bonos' and not ('guarderia' = any(v_servicios)))
     or (m.clave in ('contratos', 'recoleccion') and not v_estancias);
  if v_vet then
    insert into public.negocio_modulos (negocio_id, modulo, activo) values (v_id, 'veterinaria', true);
  end if;
  perform public.agregar_admin_negocio(v_id, p_persona_id);
  insert into public.registros_prueba (telefono, ip, negocio_id, persona_id) values (p_telefono, p_ip, v_id, p_persona_id);
  return query select v_id, v_slug, v_fin, v_plan;
end;
$$;
