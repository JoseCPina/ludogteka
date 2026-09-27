-- PeluDesk: planes, módulos por negocio, perfil público y página web.
--
-- · modulos: el catálogo (compartido, fijo). Caja y clientes no son
--   módulos: siempre están.
-- · planes: nombre, precio mensual y anual (más IVA) y los módulos que
--   incluye cada plan; tipo 'complemento' para la página web. Los edita
--   SOLO la plataforma (plataforma_guardar_plan); nunca están en el código.
-- · negocios.plan_id (el plan contratado), complementos (p. ej.
--   {pagina_web}), modulos_cortesia (módulos sueltos que da la plataforma)
--   y web_gratis_at (se ganó la página web completando su perfil en los
--   primeros 7 días de la prueba). Solo los cambia la plataforma.
-- · Disponibles = los del plan (en prueba: los del plan Completo más la
--   página web) + complementos + cortesía + la web ganada.
--   negocio_modulos guarda lo que el admin prendió o apagó DENTRO de eso
--   (sin fila = prendido). Activo = disponible y prendido, y day pass y
--   mensualidades solo si guardería está activo.
-- · Un módulo inactivo se BLOQUEA en la base: triggers en sus tablas
--   (exigir_modulo_*). Lo que la app escribe sola —el consumo de
--   inventario al cerrar una cita, el contrato que nace al vender un
--   paquete, el gasto de comisión de Mercado Pago, los gastos esperados—
--   se salta en silencio en vez de tronar la operación que lo provocó.
--   Apagar nunca borra: lo capturado se queda y reaparece al prender.
-- · tiene_permiso() da falso para los permisos de un módulo inactivo
--   (reportes, nómina, gastos, costos de inventario, plantillas).
-- · Perfil público del negocio (negocio_perfil, negocio_fotos, bucket
--   público negocios-publico) y pagina_publica() para su página web.

-- ── Catálogos compartidos ──
create table public.modulos (
  clave text primary key,
  nombre text not null,
  descripcion text not null,
  orden int not null,
  requiere text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.modulos for each row execute function public.set_updated_at();
alter table public.modulos enable row level security;
create policy modulos_select on public.modulos for select to anon, authenticated, peludesk_definer using (true);
create policy modulos_sin_escritura on public.modulos for insert to authenticated with check (false);
grant select on public.modulos to anon, authenticated, peludesk_definer;

insert into public.modulos (clave, nombre, descripcion, orden, requiere) values
  ('guarderia', 'Guardería', 'Perros por día o por hora, check-in y check-out, cupo de día.', 1, '{}'),
  ('hotel', 'Hotel', 'Estancias por noche con cupo de noche y horario de entrega.', 2, '{}'),
  ('estetica', 'Estética', 'Agenda por estilista y precios por raza o talla.', 3, '{}'),
  ('bonos', 'Day pass y mensualidades', 'Paquetes de pases y mensualidades de guardería, por perro.', 4, '{guarderia}'),
  ('recoleccion', 'Recolección a domicilio', 'Cargo por kilómetro para recoger y entregar perros.', 5, '{}'),
  ('contratos', 'Contratos', 'Plantillas, firma en línea desde el portal y contratos en papel.', 6, '{}'),
  ('portal', 'Portal de clientes', 'El dueño ve sus citas, vacunas, fotos, pases y contratos, y firma en línea.', 7, '{}'),
  ('inventario', 'Inventario', 'Consumibles con mínimo de existencia, compras y equipo con mantenimiento.', 8, '{}'),
  ('empleados', 'Empleados y nómina', 'Asistencia, ausencias, comisiones y pagos de nómina.', 9, '{}'),
  ('gastos', 'Gastos', 'Gastos del local con su periodo, recurrentes y comprobantes.', 10, '{}'),
  ('reportes', 'Reportes', 'Ingresos, costos, margen por servicio, utilidad y operación.', 11, '{}'),
  ('pagina_web', 'Página web', 'Tu página pública con tus servicios, precios, fotos, horario y WhatsApp.', 12, '{}');

create table public.planes (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  nombre text not null,
  descripcion text,
  tipo text not null default 'plan' check (tipo in ('plan', 'complemento')),
  precio_mensual numeric(10, 2) not null check (precio_mensual >= 0),
  precio_anual numeric(10, 2) not null check (precio_anual >= 0),
  modulos text[] not null default '{}',
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index planes_clave on public.planes (clave) where deleted_at is null;
create trigger set_updated_at before insert or update on public.planes for each row execute function public.set_updated_at();
alter table public.planes enable row level security;
create policy planes_select on public.planes for select to anon, authenticated, peludesk_definer using (deleted_at is null);
create policy planes_insert_plataforma on public.planes for insert to authenticated with check (public.es_admin_plataforma());
create policy planes_update_plataforma on public.planes for update to authenticated
  using (public.es_admin_plataforma()) with check (public.es_admin_plataforma());
grant select on public.planes to anon, authenticated, peludesk_definer;

-- Precios mensuales más IVA; anual = diez meses (dos gratis).
insert into public.planes (clave, nombre, descripcion, tipo, precio_mensual, precio_anual, modulos, orden) values
  ('estetica', 'Estética', 'Para estéticas caninas.', 'plan', 449, 4490, '{estetica,portal}', 1),
  ('guarderia_hotel', 'Guardería y hotel', 'Para guarderías y hoteles caninos.', 'plan', 849, 8490,
    '{guarderia,hotel,bonos,contratos,recoleccion,portal}', 2),
  ('completo', 'Completo', 'Todo PeluDesk: servicios, inventario, empleados y nómina, gastos y reportes.', 'plan', 1199, 11990,
    '{guarderia,hotel,estetica,bonos,recoleccion,contratos,portal,inventario,empleados,gastos,reportes}', 3),
  ('pagina_web', 'Página web', 'Complemento: la página pública del negocio.', 'complemento', 149, 1490, '{pagina_web}', 10);

-- ── El plan de cada negocio ──
alter table public.negocios
  add column plan_id uuid references public.planes(id),
  add column complementos text[] not null default '{}',
  add column modulos_cortesia text[] not null default '{}',
  add column web_gratis_at timestamptz;

update public.negocios set plan_id = (select id from public.planes where clave = 'completo' and deleted_at is null);

-- Un negocio nuevo nace en Completo (la plataforma o el registro lo ajustan
-- después): sin plan, sus propios candados rechazarían su configuración inicial.
create or replace function public.plan_por_omision()
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.planes where clave = 'completo' and deleted_at is null limit 1;
$$;
alter table public.negocios alter column plan_id set default public.plan_por_omision();
-- Ludogteka y el negocio de demostración: Completo con la web, sin vencimiento.
update public.negocios set complementos = '{pagina_web}'
where id = '10000000-0000-4000-8000-000000000001' or plan = 'demo';

CREATE OR REPLACE FUNCTION public.validar_negocio()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform now() at time zone new.zona_horaria;
  new.dominio := nullif(lower(btrim(coalesce(new.dominio, ''))), '');
  new.url_publica := nullif(lower(btrim(coalesce(new.url_publica, ''))), '');
  new.slug := lower(btrim(new.slug));
  -- Subdominios de PeluDesk que no son negocios (src/lib/negocio/host.ts).
  if new.slug in ('www', 'app', 'api', 'admin', 'mail', 'static', 'plataforma', 'soporte', 'demo', 'registro', 'ayuda', 'blog', 'precios') then
    raise exception 'La dirección «%» está reservada para PeluDesk.', new.slug;
  end if;
  if tg_op = 'UPDATE'
     and (new.slug is distinct from old.slug or new.dominio is distinct from old.dominio
          or new.url_publica is distinct from old.url_publica or new.activo is distinct from old.activo
          or new.plan is distinct from old.plan or new.prueba_termina_at is distinct from old.prueba_termina_at
          or new.plan_id is distinct from old.plan_id or new.complementos is distinct from old.complementos
          or new.modulos_cortesia is distinct from old.modulos_cortesia or new.web_gratis_at is distinct from old.web_gratis_at)
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'El plan, los módulos, el dominio y el estado de un negocio solo los cambia la plataforma.';
  end if;
  return new;
exception
  when invalid_parameter_value then
    raise exception 'La zona horaria «%» no existe.', new.zona_horaria;
end;
$function$;

-- ── Lo que el admin prende y apaga dentro de su plan ──
create table public.negocio_modulos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  modulo text not null references public.modulos(clave),
  activo boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index negocio_modulos_uno on public.negocio_modulos (negocio_id, modulo) where deleted_at is null;
create index negocio_modulos_negocio_idx on public.negocio_modulos (negocio_id);
create trigger set_updated_at before insert or update on public.negocio_modulos for each row execute function public.set_updated_at();
alter table public.negocio_modulos enable row level security;
create policy negocio_modulos_negocio on public.negocio_modulos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy negocio_modulos_negocio_definer on public.negocio_modulos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy negocio_modulos_select on public.negocio_modulos for select to authenticated using (true);
-- Escribe solo por cambiar_modulo(); nadie directo por la API.
create policy negocio_modulos_sin_escritura on public.negocio_modulos for insert to authenticated with check (false);
create policy negocio_modulos_escritura_ins on public.negocio_modulos as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy negocio_modulos_escritura_upd on public.negocio_modulos as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy negocio_modulos_escritura_del on public.negocio_modulos as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
grant select, insert, update, delete on public.negocio_modulos to peludesk_definer;
grant select on public.negocio_modulos to authenticated;

-- ── Qué módulos tiene el negocio ──
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
    ) x
    where n.id = p_negocio_id and x.m is not null
  ), '{}'::text[]);
$$;
alter function public.modulos_disponibles_de(uuid) owner to peludesk_definer;
revoke execute on function public.modulos_disponibles_de(uuid) from public, anon;
grant execute on function public.modulos_disponibles_de(uuid) to authenticated, service_role, peludesk_definer;

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
      where coalesce((select nm.activo from public.negocio_modulos nm
                      where nm.negocio_id = public.negocio_actual() and nm.modulo = d and nm.deleted_at is null), true)
    ), '{}'::text[]) as a
  )
  -- Day pass y mensualidades solo existen si hay guardería.
  select coalesce(array(select x from unnest(p.a) x where x <> 'bonos' or 'guarderia' = any(p.a)), '{}'::text[])
  from prendidos p;
$$;
alter function public.modulos_activos() owner to peludesk_definer;
revoke execute on function public.modulos_activos() from public;
grant execute on function public.modulos_activos() to anon, authenticated, service_role, peludesk_definer;

create or replace function public.modulo_activo(p_modulo text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_modulo = any(public.modulos_activos());
$$;
revoke execute on function public.modulo_activo(text) from public;
grant execute on function public.modulo_activo(text) to anon, authenticated, service_role, peludesk_definer;

create or replace function public.nombre_modulo(p_modulo text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select m.nombre from public.modulos m where m.clave = p_modulo), p_modulo);
$$;

-- Para la pantalla de módulos y la navegación.
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
              where nm.negocio_id = public.negocio_actual() and nm.modulo = m.clave and nm.deleted_at is null), true),
    m.clave = any(d.act),
    m.clave = any(coalesce((select n.modulos_cortesia from n), '{}'::text[])),
    array(select p.nombre from public.planes p
          where p.deleted_at is null and p.activo and m.clave = any(p.modulos) order by p.orden)
  from public.modulos m, d
  where m.deleted_at is null and public.es_miembro()
  order by m.orden;
$$;
alter function public.mis_modulos() owner to peludesk_definer;
revoke execute on function public.mis_modulos() from public, anon;
grant execute on function public.mis_modulos() to authenticated;

-- Qué queda pendiente si se apaga un módulo (se avisa antes; no se borra nada).
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
  end if;
  return jsonb_build_object('modulo', p_modulo, 'pendientes', v_n, 'que', v_que);
end;
$$;
alter function public.impacto_apagar_modulo(text) owner to peludesk_definer;
revoke execute on function public.impacto_apagar_modulo(text) from public, anon;
grant execute on function public.impacto_apagar_modulo(text) to authenticated;

-- El admin prende o apaga un módulo DENTRO de su plan.
create or replace function public.cambiar_modulo(p_modulo text, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_planes text;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin prende o apaga módulos.';
  end if;
  if not exists (select 1 from public.modulos m where m.clave = p_modulo and m.deleted_at is null) then
    raise exception 'Ese módulo no existe.';
  end if;
  if p_activo and not (p_modulo = any(public.modulos_disponibles_de(public.negocio_actual()))) then
    select string_agg(p.nombre, ' o ' order by p.orden) into v_planes
    from public.planes p where p.deleted_at is null and p.activo and p_modulo = any(p.modulos);
    raise exception '«%» no está en tu plan. Lo incluye el plan %.', public.nombre_modulo(p_modulo), coalesce(v_planes, 'de PeluDesk');
  end if;
  update public.negocio_modulos set activo = p_activo
  where negocio_id = public.negocio_actual() and modulo = p_modulo and deleted_at is null;
  if not found then
    insert into public.negocio_modulos (negocio_id, modulo, activo) values (public.negocio_actual(), p_modulo, p_activo);
  end if;
  return public.impacto_apagar_modulo(p_modulo);
end;
$$;
alter function public.cambiar_modulo(text, boolean) owner to peludesk_definer;
revoke execute on function public.cambiar_modulo(text, boolean) from public, anon;
grant execute on function public.cambiar_modulo(text, boolean) to authenticated;

-- ── El bloqueo en la base ──
create or replace function public.exigir_modulo(p_modulo text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.modulo_activo(p_modulo) then
    raise exception 'Este negocio no tiene activo el módulo «%».', public.nombre_modulo(p_modulo)
      using errcode = 'P0001', hint = 'modulo:' || p_modulo;
  end if;
end;
$$;
revoke execute on function public.exigir_modulo(text) from public, anon;
grant execute on function public.exigir_modulo(text) to authenticated, service_role, peludesk_definer;

-- Trigger genérico: el módulo va en el argumento. La secret key (scripts de
-- mantenimiento) no pasa por aquí.
create or replace function public.exigir_modulo_tabla()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_modulo text := tg_argv[0];
begin
  if coalesce(auth.role(), '') = 'service_role' or public.modulo_activo(v_modulo) then
    return new;
  end if;
  -- Lo que la app escribe sola por otra operación se salta, no la truena.
  if tg_op = 'INSERT' then
    if tg_table_name = 'movimientos_inventario' and new.cita_estetica_id is not null then return null; end if;
    if tg_table_name = 'contratos' and new.bono_cliente_id is not null then return null; end if;
    if tg_table_name = 'gastos' and (new.mp_orden_id is not null or (new.recurrente_id is not null and new.estado = 'pendiente')) then return null; end if;
    if tg_table_name = 'movimientos_bono' and new.tipo = 'devolucion' then return new; end if;
  end if;
  perform public.exigir_modulo(v_modulo);
  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('bonos_clientes', 'bonos'), ('movimientos_bono', 'bonos'),
    ('contratos', 'contratos'), ('plantillas_contrato', 'contratos'), ('tipos_contrato', 'contratos'),
    ('insumos', 'inventario'), ('insumos_costos', 'inventario'), ('compras_insumos', 'inventario'),
    ('movimientos_inventario', 'inventario'), ('recetas_consumo', 'inventario'), ('proveedores', 'inventario'),
    ('equipos', 'inventario'), ('equipo_eventos', 'inventario'),
    ('empleados', 'empleados'), ('empleados_horario', 'empleados'), ('asistencias', 'empleados'),
    ('asistencia_correcciones', 'empleados'), ('ausencias', 'empleados'), ('vacaciones_movimientos', 'empleados'),
    ('esquemas_pago', 'empleados'), ('comisiones_servicio', 'empleados'), ('adelantos', 'empleados'), ('nomina_pagos', 'empleados'),
    ('gastos', 'gastos'), ('gastos_recurrentes', 'gastos'), ('categorias_gasto', 'gastos'),
    ('invitaciones_cliente', 'portal')
  ) as t(tabla, modulo) loop
    execute format('create trigger exigir_modulo before insert or update on public.%I for each row execute function public.exigir_modulo_tabla(%L)', r.tabla, r.modulo);
  end loop;
end;
$$;

-- Estancias: el módulo sale de la categoría del servicio. Solo al crear o
-- al cambiar servicio o fechas: una que ya existía se puede terminar,
-- cancelar o marcar que no llegó aunque el módulo se haya apagado.
create or replace function public.exigir_modulo_estancia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_categoria text;
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if tg_op = 'UPDATE' and new.servicio_id is not distinct from old.servicio_id
     and new.fecha_entrada is not distinct from old.fecha_entrada and new.fecha_salida is not distinct from old.fecha_salida then
    return new;
  end if;
  select s.categoria into v_categoria from public.servicios s where s.id = new.servicio_id;
  if v_categoria in ('guarderia', 'hotel') then
    perform public.exigir_modulo(v_categoria);
  end if;
  return new;
end;
$$;
create trigger exigir_modulo before insert or update on public.estancias
  for each row execute function public.exigir_modulo_estancia();

create or replace function public.exigir_modulo_cita()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if tg_op = 'UPDATE' and new.servicio_id is not distinct from old.servicio_id and new.inicio is not distinct from old.inicio then
    return new;
  end if;
  perform public.exigir_modulo('estetica');
  return new;
end;
$$;
create trigger exigir_modulo before insert or update on public.citas_estetica
  for each row execute function public.exigir_modulo_cita();

-- Cargos: la recolección a domicilio es su propio módulo.
create or replace function public.exigir_modulo_cargo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if tg_op = 'INSERT' and exists (select 1 from public.servicios s where s.id = new.servicio_id and s.clave = 'recoleccion') then
    perform public.exigir_modulo('recoleccion');
  end if;
  return new;
end;
$$;
create trigger exigir_modulo before insert on public.cargos_aplicados
  for each row execute function public.exigir_modulo_cargo();

-- Una cuenta de cliente (el portal) solo en un negocio con portal.
create or replace function public.exigir_modulo_membresia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if new.rol = 'cliente' and (tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id) then
    if (new.negocio_id = public.negocio_actual() and not public.modulo_activo('portal'))
       or (new.negocio_id is distinct from public.negocio_actual() and not ('portal' = any(public.modulos_disponibles_de(new.negocio_id)))) then
      raise exception 'Este negocio no tiene activo el módulo «Portal de clientes».' using hint = 'modulo:portal';
    end if;
  end if;
  return new;
end;
$$;
create trigger exigir_modulo before insert or update on public.membresias
  for each row execute function public.exigir_modulo_membresia();

-- Los permisos de un módulo inactivo no dan nada (reportes, nómina, gastos,
-- costos de inventario, plantillas de contrato).
CREATE OR REPLACE FUNCTION public.tiene_permiso(p_permiso text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  ) and (
    case p_permiso
      when 'reportes_financieros' then public.modulo_activo('reportes')
      when 'nomina' then public.modulo_activo('empleados')
      when 'gastos' then public.modulo_activo('gastos')
      when 'inventario_costos' then public.modulo_activo('inventario')
      when 'plantillas_contrato' then public.modulo_activo('contratos')
      else true
    end
  );
$function$;

-- ── Perfil público del negocio ──
create table public.negocio_perfil (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  descripcion text,
  direccion text,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index negocio_perfil_uno on public.negocio_perfil (negocio_id) where deleted_at is null;
create index negocio_perfil_negocio_idx on public.negocio_perfil (negocio_id);

create table public.negocio_fotos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  path text not null,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index negocio_fotos_negocio_idx on public.negocio_fotos (negocio_id);

do $$
declare
  t text;
begin
  foreach t in array array['negocio_perfil', 'negocio_fotos'] loop
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro())) with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))', t || '_negocio', t);
    execute format('create policy %I on public.%I for all to peludesk_definer using (negocio_id = (select public.negocio_actual())) with check (negocio_id = (select public.negocio_actual()))', t || '_negocio_definer', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_staff()))', t || '_select_staff', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.tiene_permiso(''configuracion_negocio'')))', t || '_insert_config', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.tiene_permiso(''configuracion_negocio''))) with check ((select public.tiene_permiso(''configuracion_negocio'')))', t || '_update_config', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer with check ((select public.exigir_negocio_escribible()))', t || '_escritura_ins', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))', t || '_escritura_upd', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible()))', t || '_escritura_del', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
  end loop;
end;
$$;

-- Fotos y logo públicos: bucket de lectura pública. Los sube el servidor
-- con la secret key después de comprobar el permiso (sin políticas).
insert into storage.buckets (id, name, public) values ('negocios-publico', 'negocios-publico', true)
on conflict (id) do nothing;

-- ── La página web y el perfil completo ──
-- El avance del perfil: lo que pide la web gratis. Los pasos del asistente
-- de arranque son los de /bienvenida; los que dependen de un módulo
-- apagado cuentan como listos.
create or replace function public.avance_perfil()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg record;
  v_logo text;
  v_direccion text;
  v_fotos int;
  v_precio boolean;
  v_horario boolean;
  v_telefono boolean;
  v_empleado boolean;
  v_cliente boolean;
  v_asistente boolean;
  v_limite timestamptz;
  v_pasos jsonb;
  v_completo boolean;
begin
  if not public.es_miembro() then
    raise exception 'Solo el personal del negocio.';
  end if;
  select n.created_at, n.plan, n.web_gratis_at, n.complementos, n.marca into v_neg from public.negocios n where n.id = public.negocio_actual();
  -- Variables sueltas, no un record: si todavía no hay perfil quedan NULL.
  select p.logo_path, p.direccion into v_logo, v_direccion from public.negocio_perfil p
  where p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  select count(*) into v_fotos from public.negocio_fotos f where f.negocio_id = public.negocio_actual() and f.deleted_at is null;
  v_precio := exists (select 1 from public.tarifas t where t.negocio_id = public.negocio_actual() and t.deleted_at is null and not t.no_aplica and t.precio is not null);
  v_horario := exists (select 1 from public.cupo_configuracion c where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.created_by is not null);
  v_telefono := exists (select 1 from public.cupo_configuracion c where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.telefono_recepcion is not null);
  v_empleado := not public.modulo_activo('empleados') or exists (select 1 from public.empleados e where e.negocio_id = public.negocio_actual() and e.deleted_at is null);
  v_cliente := exists (select 1 from public.clientes c where c.negocio_id = public.negocio_actual() and c.deleted_at is null);
  v_asistente := v_telefono and v_precio and v_horario and v_empleado and v_cliente;
  v_limite := v_neg.created_at + interval '7 days';
  v_pasos := jsonb_build_array(
    jsonb_build_object('clave', 'asistente', 'titulo', 'Terminar los primeros pasos', 'listo', v_asistente, 'href', '/bienvenida'),
    jsonb_build_object('clave', 'logo', 'titulo', 'Subir tu logo', 'listo', v_logo is not null or (v_neg.marca ->> 'logo') is not null, 'href', '/admin/perfil'),
    jsonb_build_object('clave', 'fotos', 'titulo', 'Subir al menos 3 fotos (llevas ' || v_fotos || ')', 'listo', v_fotos >= 3, 'href', '/admin/perfil'),
    jsonb_build_object('clave', 'precio', 'titulo', 'Ponerle precio a un servicio', 'listo', v_precio, 'href', '/servicios'),
    jsonb_build_object('clave', 'horario', 'titulo', 'Guardar tu horario', 'listo', v_horario, 'href', '/admin#horario'),
    jsonb_build_object('clave', 'direccion', 'titulo', 'Escribir tu dirección', 'listo', nullif(btrim(coalesce(v_direccion, '')), '') is not null, 'href', '/admin/perfil')
  );
  select bool_and((p ->> 'listo')::boolean) into v_completo from jsonb_array_elements(v_pasos) p;
  return jsonb_build_object(
    'pasos', v_pasos,
    'completo', v_completo,
    'ganada', v_neg.web_gratis_at is not null or 'pagina_web' = any(v_neg.complementos),
    'fecha_limite', v_limite,
    'dias_restantes', greatest(0, ceil(extract(epoch from (v_limite - now())) / 86400)::int),
    'elegible', v_neg.plan = 'prueba' and v_neg.web_gratis_at is null and now() <= v_limite
  );
end;
$$;
alter function public.avance_perfil() owner to peludesk_definer;
revoke execute on function public.avance_perfil() from public, anon;
grant execute on function public.avance_perfil() to authenticated;

-- Si el perfil quedó completo a tiempo, la web queda gratis de por vida.
-- La decide la base con sus propios datos, nunca la pantalla.
create or replace function public.evaluar_web_gratis()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avance jsonb := public.avance_perfil();
begin
  if (v_avance ->> 'elegible')::boolean and (v_avance ->> 'completo')::boolean then
    update public.negocios set web_gratis_at = now() where id = public.negocio_actual() and web_gratis_at is null;
    v_avance := public.avance_perfil();
  end if;
  return v_avance;
end;
$$;
revoke execute on function public.evaluar_web_gratis() from public, anon;
grant execute on function public.evaluar_web_gratis() to authenticated;

-- Lo que muestra la página web pública del negocio. Nada privado: nombre,
-- perfil, fotos, WhatsApp de recepción, horario y los servicios de sus
-- módulos activos con sus precios vigentes. NULL si no tiene página web.
create or replace function public.pagina_publica()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_activos text[] := public.modulos_activos();
  v_categorias text[];
  v_res jsonb;
begin
  if not ('pagina_web' = any(v_activos)) then
    return null;
  end if;
  v_categorias := array(select c from unnest(array['guarderia', 'hotel', 'estetica']) c where c = any(v_activos));
  select jsonb_build_object(
    'nombre', n.nombre,
    'ciudad', n.ciudad,
    'descripcion', p.descripcion,
    'direccion', p.direccion,
    'logo_path', p.logo_path,
    'fotos', coalesce((select jsonb_agg(f.path order by f.orden, f.created_at) from public.negocio_fotos f
                       where f.negocio_id = n.id and f.deleted_at is null), '[]'::jsonb),
    'whatsapp', (select c.telefono_recepcion from public.cupo_configuracion c
                 where c.negocio_id = n.id and c.deleted_at is null and c.vigencia_desde <= public.fecha_negocio()
                 order by c.vigencia_desde desc, c.created_at desc limit 1),
    'horario', public.horario_texto(null),
    'servicios', coalesce((
      select jsonb_agg(s.fila order by s.orden_cat, s.orden)
      from (
        select sv.orden,
          array_position(array['guarderia', 'hotel', 'estetica', 'bono', 'cargo'], sv.categoria) as orden_cat,
          jsonb_build_object(
            'categoria', sv.categoria, 'nombre', sv.nombre, 'unidad', sv.unidad,
            'incluye', sv.incluye, 'no_incluye', sv.no_incluye,
            'precios', (
              select jsonb_agg(jsonb_build_object(
                'etiqueta', coalesce(tv.grupo_raza_nombre || coalesce(' · ' || tc.etiqueta, ''), tc.etiqueta),
                'precio', tv.precio) order by tv.precio)
              from public.tarifas_vigentes tv
              left join public.tamanos_categoria tc on tc.id = tv.tamano_id
              where tv.servicio_id = sv.id and not tv.no_aplica and tv.precio is not null
            )
          ) as fila
        from public.servicios sv
        where sv.negocio_id = n.id and sv.deleted_at is null and not sv.monto_libre
          and (sv.categoria = any(v_categorias)
               or (sv.categoria = 'bono' and 'bonos' = any(v_activos))
               or (sv.categoria = 'cargo' and sv.clave = 'recoleccion' and 'recoleccion' = any(v_activos)))
          and exists (select 1 from public.tarifas_vigentes tv where tv.servicio_id = sv.id and not tv.no_aplica and tv.precio is not null)
      ) s
    ), '[]'::jsonb)
  )
  into v_res
  from public.negocios n
  left join public.negocio_perfil p on p.negocio_id = n.id and p.deleted_at is null
  where n.id = public.negocio_actual() and n.activo and n.deleted_at is null;
  return v_res;
end;
$$;
alter function public.pagina_publica() owner to peludesk_definer;
revoke execute on function public.pagina_publica() from public;
grant execute on function public.pagina_publica() to anon, authenticated, service_role;

-- negocio_publico: el logo del perfil (el de la plataforma manda si hay).
drop function public.negocio_publico();
create function public.negocio_publico()
returns table (id uuid, slug text, nombre text, dominio text, zona_horaria text, ciudad text, marca jsonb, landing jsonb,
               plan text, prueba_termina_at timestamptz, logo_perfil text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.slug, n.nombre, n.dominio, n.zona_horaria, n.ciudad, n.marca, n.landing, n.plan, n.prueba_termina_at,
    (select p.logo_path from public.negocio_perfil p where p.negocio_id = n.id and p.deleted_at is null limit 1)
  from public.negocios n
  where n.id = public.negocio_actual() and n.activo and n.deleted_at is null;
$$;
grant execute on function public.negocio_publico() to anon, authenticated, service_role;

-- ── Prueba gratis: 15 días, con los servicios que el negocio ofrece ──
drop function public.registrar_negocio_prueba(text, text, text, text, uuid, uuid, int);
create function public.registrar_negocio_prueba(
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
begin
  if coalesce(auth.role(), '') <> 'service_role' and nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'Solo el servidor registra pruebas.';
  end if;
  v_servicios := array(select s from unnest(v_servicios) s where s in ('guarderia', 'hotel', 'estetica'));
  if cardinality(v_servicios) = 0 then
    raise exception 'Escoge al menos un servicio que ofrece tu negocio.';
  end if;
  v_motivo := public.puede_registrar_prueba(p_telefono, p_ip);
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;
  v_estancias := 'guarderia' = any(v_servicios) or 'hotel' = any(v_servicios);
  v_plan := case
    when 'estetica' = any(v_servicios) and not v_estancias then 'estetica'
    when v_estancias and not ('estetica' = any(v_servicios)) then 'guarderia_hotel'
    else 'completo' end;
  v_slug := public.slug_libre(p_nombre);
  v_id := public.crear_negocio(v_slug, btrim(p_nombre), 'America/Mexico_City', nullif(btrim(coalesce(p_ciudad, '')), ''), null, p_modelo);
  update public.negocios
  set plan = 'prueba', prueba_termina_at = v_fin, plan_id = (select id from public.planes where clave = v_plan and deleted_at is null)
  where id = v_id;
  -- Prendidos solo los servicios que ofrece (y lo que depende de ellos);
  -- lo demás del plan Completo, prendido para que lo conozca.
  insert into public.negocio_modulos (negocio_id, modulo, activo)
  select v_id, m.clave, false from public.modulos m
  where (m.clave in ('guarderia', 'hotel', 'estetica') and not (m.clave = any(v_servicios)))
     or (m.clave = 'bonos' and not ('guarderia' = any(v_servicios)))
     or (m.clave in ('contratos', 'recoleccion') and not v_estancias);
  perform public.agregar_admin_negocio(v_id, p_persona_id);
  insert into public.registros_prueba (telefono, ip, negocio_id, persona_id) values (p_telefono, p_ip, v_id, p_persona_id);
  return query select v_id, v_slug, v_fin, v_plan;
end;
$$;
revoke execute on function public.registrar_negocio_prueba(text, text, text, text, uuid, uuid, int, text[]) from public, anon, authenticated;
grant execute on function public.registrar_negocio_prueba(text, text, text, text, uuid, uuid, int, text[]) to service_role;

-- ── La plataforma: planes y el plan de cada negocio ──
alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check
  check (accion in ('crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo',
                    'cambiar_plan', 'asignar_plan', 'editar_plan'));

create or replace function public.plataforma_guardar_plan(
  p_id uuid, p_clave text, p_nombre text, p_descripcion text, p_tipo text,
  p_precio_mensual numeric, p_precio_anual numeric, p_modulos text[], p_orden int, p_activo boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_invalidos text[];
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if coalesce(btrim(p_nombre), '') = '' or coalesce(btrim(p_clave), '') = '' then
    raise exception 'El plan necesita clave y nombre.';
  end if;
  v_invalidos := array(select x from unnest(coalesce(p_modulos, '{}'::text[])) x
                       where not exists (select 1 from public.modulos m where m.clave = x));
  if cardinality(v_invalidos) > 0 then
    raise exception 'Módulos que no existen: %.', array_to_string(v_invalidos, ', ');
  end if;
  if p_id is null then
    insert into public.planes (clave, nombre, descripcion, tipo, precio_mensual, precio_anual, modulos, orden, activo)
    values (lower(btrim(p_clave)), btrim(p_nombre), nullif(btrim(coalesce(p_descripcion, '')), ''), p_tipo,
            p_precio_mensual, p_precio_anual, coalesce(p_modulos, '{}'), coalesce(p_orden, 0), coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.planes set nombre = btrim(p_nombre), descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
      tipo = p_tipo, precio_mensual = p_precio_mensual, precio_anual = p_precio_anual, modulos = coalesce(p_modulos, '{}'),
      orden = coalesce(p_orden, orden), activo = coalesce(p_activo, activo)
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Ese plan no existe.';
    end if;
  end if;
  perform public.plataforma_registrar_evento('editar_plan', null, null, null,
    jsonb_build_object('plan', p_clave, 'nombre', p_nombre, 'mensual', p_precio_mensual, 'anual', p_precio_anual, 'modulos', p_modulos));
  return v_id;
end;
$$;
revoke execute on function public.plataforma_guardar_plan(uuid, text, text, text, text, numeric, numeric, text[], int, boolean) from public, anon;
grant execute on function public.plataforma_guardar_plan(uuid, text, text, text, text, numeric, numeric, text[], int, boolean) to authenticated;

create or replace function public.plataforma_asignar_plan(
  p_negocio_id uuid, p_plan_id uuid, p_complementos text[], p_modulos_cortesia text[], p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes record;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo (por ejemplo: contrató el plan Completo anual).';
  end if;
  if not exists (select 1 from public.planes p where p.id = p_plan_id and p.tipo = 'plan' and p.deleted_at is null) then
    raise exception 'Ese plan no existe.';
  end if;
  if exists (select 1 from unnest(coalesce(p_modulos_cortesia, '{}') || coalesce(p_complementos, '{}')) x
             where not exists (select 1 from public.modulos m where m.clave = x)) then
    raise exception 'Hay un módulo que no existe.';
  end if;
  select n.plan_id, n.complementos, n.modulos_cortesia into v_antes from public.negocios n where n.id = p_negocio_id and n.deleted_at is null;
  if not found then
    raise exception 'Ese negocio no existe.';
  end if;
  update public.negocios
  set plan_id = p_plan_id, complementos = coalesce(p_complementos, '{}'), modulos_cortesia = coalesce(p_modulos_cortesia, '{}')
  where id = p_negocio_id;
  perform public.plataforma_registrar_evento('asignar_plan', p_negocio_id, null, btrim(p_motivo),
    jsonb_build_object('plan_antes', v_antes.plan_id, 'plan', p_plan_id, 'complementos', p_complementos, 'cortesia', p_modulos_cortesia));
end;
$$;
revoke execute on function public.plataforma_asignar_plan(uuid, uuid, text[], text[], text) from public, anon;
grant execute on function public.plataforma_asignar_plan(uuid, uuid, text[], text[], text) to authenticated;

drop function public.plataforma_negocios();
create function public.plataforma_negocios()
returns table (id uuid, slug text, nombre text, dominio text, url_publica text, zona_horaria text, ciudad text,
               activo boolean, marca jsonb, created_at timestamptz, admins text[], clientes bigint,
               plan text, prueba_termina_at timestamptz, perros bigint, reservas bigint, cobros bigint,
               ultima_actividad timestamptz, ultimo_acceso timestamptz,
               plan_id uuid, plan_nombre text, complementos text[], modulos_cortesia text[], web_gratis_at timestamptz)
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
      n.plan_id, pl.nombre, n.complementos, n.modulos_cortesia, n.web_gratis_at
    from public.negocios n
    left join public.planes pl on pl.id = n.plan_id
    where n.deleted_at is null
    order by n.created_at;
end;
$$;
revoke execute on function public.plataforma_negocios() from public, anon;
grant execute on function public.plataforma_negocios() to authenticated;

-- ── La frontera: las nuevas de postgres y las tablas compartidas ──

create or replace function public.auditoria_frontera()
returns table (tipo text, nombre text, detalle text)
language sql
stable
security definer
set search_path = ''
as $$
  with lista_blanca(nombre) as (values
    ('current_rol'), ('es_miembro'), ('mi_cliente_id'), ('rol_en_negocio'), ('tiene_permiso'), ('mis_permisos'),
    ('persona_en_negocio'), ('zona_negocio'), ('negocio_por_host'), ('mis_negocios'), ('is_admin'), ('is_staff'),
    ('mi_empleado_id'), ('puede_ver_empleado'), ('cuentas_para_empleado'), ('email_de_login_por_telefono'),
    ('existe_usuario_por_email'), ('listar_cuentas'), ('listar_cuentas_sin_vincular'), ('listar_cuentas_vinculadas'),
    ('listar_personal'), ('listar_personal_estetica'), ('handle_new_user'), ('negocio_de_archivo_perro'),
    ('es_dueno_de_archivo_perro'), ('proteger_membresia'), ('crear_negocio'), ('agregar_admin_negocio'),
    ('auditoria_frontera'), ('proteger_columnas_sensibles_profile'), ('asignar_rol_staff'),
    ('usuario_por_email'), ('negocio_publico'), ('email_de_persona_por_telefono'),
    ('persona_en_otro_negocio'), ('es_admin_plataforma'), ('agregar_admin_plataforma'),
    ('plataforma_negocios'), ('plataforma_buscar_personas'), ('plataforma_registrar_evento'),
    ('plataforma_actualizar_negocio'), ('membresia_no_plataforma'), ('plataforma_buscar_personas_por_id'), ('negocio_escribible'), ('negocio_escribible_en'),
    ('slug_libre'), ('registrar_negocio_prueba'), ('puede_registrar_prueba'), ('demo_vaciar'), ('plataforma_cambiar_plan'), ('plataforma_guardar_plan'), ('plataforma_asignar_plan'), ('evaluar_web_gratis')
  ),
  compartidas(nombre) as (values ('razas'), ('tamanos_categoria'), ('tipos_pelaje'), ('unidades_medida'), ('profiles'), ('negocios'), ('plataforma_admins'), ('plataforma_eventos'), ('registros_prueba'), ('modulos'), ('planes'))
  select 'funcion_definer_postgres', p.proname::text, pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
    and p.proname not in (select nombre from lista_blanca)
  union all
  select 'tabla_sin_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in (select nombre from compartidas)
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
  union all
  select 'tabla_sin_politica_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
    and c.relname not in (select nombre from compartidas)
    and (
      not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                  and pp.permissive = 'RESTRICTIVE' and pp.qual like '%negocio_actual()%' and pp.qual like '%es_miembro()%')
      or not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                     and 'peludesk_definer' = any(pp.roles) and pp.qual like '%negocio_actual()%')
      or not c.relrowsecurity
    )
  union all
  select 'vista_sin_security_invoker', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any(c.reloptions), false)
  union all
  select 'politica_storage_sin_negocio', pp.policyname::text, coalesce(pp.qual, pp.with_check)
  from pg_policies pp
  where pp.schemaname = 'storage' and pp.tablename = 'objects'
    and coalesce(pp.qual, '') || coalesce(pp.with_check, '') ~ '(is_staff\(\)|current_rol\(\)|is_admin\(\))'
  union all
  -- Una función que llama a otra que ya no existe truena hasta que alguien
  -- la ejerce (así quedó handle_user_email_confirmed en el paso 2).
  select 'llamada_a_funcion_inexistente', r.proname::text, r.ref
  from (
    select distinct p.proname, (regexp_matches(pg_get_functiondef(p.oid), 'public[.]([a-z_0-9]+)[ ]*[(]', 'g'))[1] as ref
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  ) r
  where not exists (select 1 from pg_proc p2 where p2.proname = r.ref)
    and not exists (select 1 from pg_class c where c.relname = r.ref and c.relnamespace = 'public'::regnamespace);
$$;
revoke execute on function public.auditoria_frontera() from public, anon, authenticated;
grant execute on function public.auditoria_frontera() to service_role;
