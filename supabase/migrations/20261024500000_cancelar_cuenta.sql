-- Cancelar una CUENTA por cobrar que no se debe cobrar (24 de octubre de 2026, carril B).
--
-- Antes solo se podía anular un cobro (ya hecho). Una cuenta con saldo que no hay
-- que cobrar (el dueño no se presentó, la cita se canceló, cortesía, error de
-- captura) se quedaba para siempre en «Otras cuentas con saldo» de Caja.
--
--  * cuentas_canceladas: una fila por cuenta cancelada (motivo, quién, cuándo, cuánto
--    saldo se canceló). Inmutable: no se edita ni se borra (nada de DELETE).
--  * cancelar_cuenta(reserva, motivo, texto, cancelar_cita): la regla vive aquí.
--      - permiso: admin o «cancelar_cuentas»;
--      - «cortesía» sobre un servicio ya realizado: solo admin;
--      - no se cancela con cobros (anula primero el cobro), con un cobro en curso en la
--        terminal / link, ni si la cuenta ya no tiene saldo;
--      - si viene de una cita que no empezó, puede cancelarla en el mismo paso
--        («No se presentó» la marca «no llegó»).
--  * La cuenta cancelada sale de cuentas_abiertas() y de ajustes_servicio_por_atender();
--    un trigger impide cobrarle o agregarle cargos.
--
-- REVERSA: quitar los triggers cobros_cuenta_cancelada y cargos_cuenta_cancelada, la
-- función cancelar_cuenta, la fila 'cancelar_cuentas' de permisos_catalogo y volver a
-- poner cuentas_abiertas / ajustes_servicio_por_atender sin el «not exists». La tabla
-- cuentas_canceladas puede quedarse (es historial). No cambia ninguna fila existente.

-- ── 0. Permiso ───────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.permisos_catalogo') is null then
    raise exception 'Falta permisos_catalogo (migración 20261014000000).';
  end if;
  insert into public.permisos_catalogo (clave, etiqueta, modulos, orden, updated_at)
  values ('cancelar_cuentas', 'Cancelar cuentas', '{}',
          coalesce((select max(orden) from public.permisos_catalogo), 0) + 1, now())
  on conflict (clave) do nothing;
end $$;

-- ── 1. La tabla ──────────────────────────────────────────────────────
create table public.cuentas_canceladas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  reserva_id uuid not null references public.reservas(id),
  cliente_id uuid not null references public.clientes(id),
  motivo text not null check (motivo in ('no_se_presento', 'cita_cancelada', 'cortesia', 'error_captura', 'otro')),
  motivo_texto text,
  saldo_cancelado numeric(12,2) not null,
  total_cuenta numeric(12,2) not null,
  descripcion text,
  servicio_realizado boolean not null default false,
  citas_canceladas uuid[] not null default '{}',
  citas_no_canceladas uuid[] not null default '{}',
  cancelada_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint cuentas_canceladas_otro_texto check (motivo <> 'otro' or char_length(btrim(coalesce(motivo_texto, ''))) >= 5)
);
-- Una cuenta se cancela una sola vez.
create unique index cuentas_canceladas_reserva_uq on public.cuentas_canceladas (reserva_id);
create index cuentas_canceladas_negocio_idx on public.cuentas_canceladas (negocio_id);
create index cuentas_canceladas_cliente_idx on public.cuentas_canceladas (cliente_id);

create trigger set_updated_at before insert or update on public.cuentas_canceladas
  for each row execute function public.set_updated_at();

alter table public.cuentas_canceladas enable row level security;
create policy cuentas_canceladas_negocio on public.cuentas_canceladas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy cuentas_canceladas_negocio_definer on public.cuentas_canceladas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy cuentas_canceladas_escritura_ins on public.cuentas_canceladas as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy cuentas_canceladas_escritura_upd on public.cuentas_canceladas as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy cuentas_canceladas_escritura_del on public.cuentas_canceladas as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
-- Leer: admin y recepción (tiene dinero). Escribir: solo por cancelar_cuenta.
create policy cuentas_canceladas_select on public.cuentas_canceladas for select to authenticated
  using ((select coalesce(public.current_rol() in ('admin', 'recepcion'), false)));
revoke all on public.cuentas_canceladas from anon, authenticated;
grant select on public.cuentas_canceladas to authenticated;
grant select, insert, update, delete on public.cuentas_canceladas to peludesk_definer;

-- Inmutable: ni se edita ni se borra (ni con la llave de servidor).
create or replace function public.cuentas_canceladas_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Una cuenta cancelada no se edita ni se borra: queda en el historial.';
end;
$$;
create trigger cuentas_canceladas_inmutable before update or delete on public.cuentas_canceladas
  for each row execute function public.cuentas_canceladas_inmutable();

-- ── 2. Una cuenta cancelada no admite cobros ni cargos nuevos ────────
create or replace function public.exigir_cuenta_no_cancelada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reserva_id is not null and exists (
    select 1 from public.cuentas_canceladas cc where cc.reserva_id = new.reserva_id
  ) then
    raise exception 'Esta cuenta está cancelada: ya no admite cobros ni cargos nuevos.';
  end if;
  return new;
end;
$$;
alter function public.exigir_cuenta_no_cancelada() owner to peludesk_definer;
revoke execute on function public.exigir_cuenta_no_cancelada() from public, anon;
grant execute on function public.exigir_cuenta_no_cancelada() to authenticated, service_role;

create trigger cobros_cuenta_cancelada before insert on public.cobros
  for each row execute function public.exigir_cuenta_no_cancelada();
create trigger cargos_cuenta_cancelada before insert on public.cargos_aplicados
  for each row execute function public.exigir_cuenta_no_cancelada();

-- ── 3. cancelar_cuenta ───────────────────────────────────────────────
create or replace function public.cancelar_cuenta(
  p_reserva_id uuid,
  p_motivo text,
  p_motivo_texto text default null,
  p_cancelar_cita boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reservas%rowtype;
  v_texto text := nullif(btrim(coalesce(p_motivo_texto, '')), '');
  v_tot record;
  v_realizado boolean;
  v_desc text;
  v_cita record;
  v_canceladas uuid[] := '{}';
  v_no_canceladas uuid[] := '{}';
  v_id uuid;
begin
  if not coalesce(public.tiene_permiso('cancelar_cuentas'), false) then
    raise exception 'No tienes el permiso «Cancelar cuentas». Pídeselo a un admin (Administración → Permisos).' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('no_se_presento', 'cita_cancelada', 'cortesia', 'error_captura', 'otro') then
    raise exception 'Escoge el motivo: No se presentó, Cita cancelada, Cortesía, Error de captura u Otro.';
  end if;
  if p_motivo = 'otro' and char_length(coalesce(v_texto, '')) < 5 then
    raise exception 'Con «Otro», escribe el motivo (al menos 5 letras).';
  end if;

  select * into r from public.reservas
  where id = p_reserva_id and negocio_id = public.negocio_actual() and deleted_at is null
  for update;
  if not found then
    raise exception 'Cuenta no encontrada.';
  end if;
  if exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = r.id) then
    raise exception 'Esta cuenta ya está cancelada.';
  end if;

  select t.total_cuenta, t.total_cobrado, t.total_devuelto, t.saldo into v_tot from public.cuenta_totales_reserva(r.id) t;
  if coalesce(v_tot.total_cobrado, 0) - coalesce(v_tot.total_devuelto, 0) > 0.005 then
    raise exception 'Esta cuenta ya tiene cobros ($%). No se cancela con cobros: anúlalos primero (Caja → la cuenta → Anular cobro) y luego cancela la cuenta: /caja/cobrar/%', v_tot.total_cobrado, r.id;
  end if;
  if exists (select 1 from public.ordenes_abiertas_de_reservas(array[r.id])) then
    raise exception 'Esta cuenta tiene un cobro en curso (terminal o link de pago). Cancélalo o espera a que se resuelva y vuelve a intentar.';
  end if;
  if coalesce(v_tot.saldo, 0) <= 0.005 then
    raise exception 'Esta cuenta no tiene saldo por cobrar: no hay nada que cancelar.';
  end if;

  -- ¿El servicio ya se hizo? Cita o estancia empezada / terminada, o un cargo o venta ya aplicados.
  v_realizado :=
    exists (select 1 from public.citas_estetica ce where ce.reserva_id = r.id and ce.deleted_at is null and ce.estado in ('en_curso', 'finalizada'))
    or exists (select 1 from public.estancias e where e.reserva_id = r.id and e.deleted_at is null and e.estado in ('en_curso', 'finalizada'))
    or exists (select 1 from public.cargos_aplicados c where c.reserva_id = r.id and c.deleted_at is null and c.cancelado = false)
    or exists (select 1 from public.ventas_mostrador v where v.reserva_id = r.id and v.deleted_at is null and not v.cancelado);
  if p_motivo = 'cortesia' and v_realizado and not coalesce(public.is_admin(), false) then
    raise exception 'Una cortesía sobre un servicio que ya se realizó solo la hace un admin.' using errcode = '42501';
  end if;

  select string_agg(l.descripcion, ' · ' order by l.descripcion) into v_desc
  from public.cuenta_lineas_reserva(r.id) l;

  -- La cita que no empezó se cancela en el mismo paso, si se pidió.
  if coalesce(p_cancelar_cita, false) then
    for v_cita in
      select ce.id, ce.estado from public.citas_estetica ce
      where ce.reserva_id = r.id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
      order by ce.inicio
    loop
      if v_cita.estado in ('reservada', 'confirmada') then
        perform public.cancelar_cita_estetica(
          v_cita.id,
          case p_motivo
            when 'no_se_presento' then 'No se presentó'
            when 'cita_cancelada' then 'Cita cancelada'
            when 'cortesia' then 'Cortesía'
            when 'error_captura' then 'Error de captura'
            else coalesce(v_texto, 'Cuenta cancelada')
          end,
          p_motivo = 'no_se_presento'
        );
        v_canceladas := array_append(v_canceladas, v_cita.id);
      else
        v_no_canceladas := array_append(v_no_canceladas, v_cita.id);
      end if;
    end loop;
  end if;

  insert into public.cuentas_canceladas (reserva_id, cliente_id, motivo, motivo_texto, saldo_cancelado, total_cuenta, descripcion,
    servicio_realizado, citas_canceladas, citas_no_canceladas)
  values (r.id, r.cliente_id, p_motivo, v_texto, v_tot.saldo, coalesce(v_tot.total_cuenta, 0), v_desc, v_realizado, v_canceladas, v_no_canceladas)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'reserva_id', r.id, 'saldo_cancelado', v_tot.saldo,
    'citas_canceladas', to_jsonb(v_canceladas), 'citas_no_canceladas', to_jsonb(v_no_canceladas),
    'servicio_realizado', v_realizado);
end;
$$;
alter function public.cancelar_cuenta(uuid, text, text, boolean) owner to peludesk_definer;
revoke execute on function public.cancelar_cuenta(uuid, text, text, boolean) from public, anon;
grant execute on function public.cancelar_cuenta(uuid, text, text, boolean) to authenticated, service_role;

-- ── 4. Cuánto sabe la pantalla: qué se cancelaría ────────────────────
-- Para la hoja de «Cancelar cuenta»: las citas que no han empezado (se pueden cancelar
-- en el mismo paso), si el servicio ya se realizó (cortesía solo admin) y si hay cobros.
create or replace function public.cuenta_para_cancelar(p_reserva_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tot record;
  v_citas jsonb;
  v_realizado boolean;
  v_cc record;
begin
  if not coalesce(public.is_staff(), false) then
    return null;
  end if;
  if not exists (select 1 from public.reservas r where r.id = p_reserva_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null) then
    return null;
  end if;
  select t.total_cuenta, t.total_cobrado, t.saldo into v_tot from public.cuenta_totales_reserva(p_reserva_id) t;
  select jsonb_agg(jsonb_build_object('id', ce.id, 'estado', ce.estado, 'inicio', ce.inicio) order by ce.inicio) into v_citas
  from public.citas_estetica ce
  where ce.reserva_id = p_reserva_id and ce.deleted_at is null and ce.estado in ('reservada', 'confirmada');
  v_realizado :=
    exists (select 1 from public.citas_estetica ce where ce.reserva_id = p_reserva_id and ce.deleted_at is null and ce.estado in ('en_curso', 'finalizada'))
    or exists (select 1 from public.estancias e where e.reserva_id = p_reserva_id and e.deleted_at is null and e.estado in ('en_curso', 'finalizada'))
    or exists (select 1 from public.cargos_aplicados c where c.reserva_id = p_reserva_id and c.deleted_at is null and c.cancelado = false)
    or exists (select 1 from public.ventas_mostrador v where v.reserva_id = p_reserva_id and v.deleted_at is null and not v.cancelado);
  select cc.motivo, cc.motivo_texto, cc.created_at, cc.saldo_cancelado,
    coalesce(nullif(btrim(h.nombre_completo), ''), 'Alguien del equipo') as por_nombre
  into v_cc
  from public.cuentas_canceladas cc
  left join public.profiles h on h.id = cc.cancelada_por
  where cc.reserva_id = p_reserva_id;
  return jsonb_build_object(
    'saldo', coalesce(v_tot.saldo, 0),
    'total_cobrado', coalesce(v_tot.total_cobrado, 0),
    'servicio_realizado', v_realizado,
    'citas_pendientes', coalesce(v_citas, '[]'::jsonb),
    'cancelada', case when v_cc.motivo is null then null else jsonb_build_object(
      'motivo', v_cc.motivo, 'motivo_texto', v_cc.motivo_texto, 'cuando', v_cc.created_at,
      'saldo_cancelado', v_cc.saldo_cancelado, 'por_nombre', v_cc.por_nombre) end
  );
end;
$$;
alter function public.cuenta_para_cancelar(uuid) owner to peludesk_definer;
revoke execute on function public.cuenta_para_cancelar(uuid) from public, anon;
grant execute on function public.cuenta_para_cancelar(uuid) to authenticated, service_role;

-- ── 5. Historial de un cliente (nombres incluidos; recepción no lee profiles) ──
create or replace function public.cuentas_canceladas_de_cliente(p_cliente_id uuid)
returns table (id uuid, reserva_id uuid, cuando timestamptz, motivo text, motivo_texto text, saldo_cancelado numeric,
  descripcion text, por_nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select cc.id, cc.reserva_id, cc.created_at, cc.motivo, cc.motivo_texto, cc.saldo_cancelado, cc.descripcion,
    coalesce(nullif(btrim(h.nombre_completo), ''), 'Alguien del equipo')
  from public.cuentas_canceladas cc
  left join public.profiles h on h.id = cc.cancelada_por
  where cc.cliente_id = p_cliente_id
    and cc.negocio_id = public.negocio_actual()
    and coalesce(public.current_rol() in ('admin', 'recepcion'), false)
  order by cc.created_at desc;
$$;
alter function public.cuentas_canceladas_de_cliente(uuid) owner to peludesk_definer;
revoke execute on function public.cuentas_canceladas_de_cliente(uuid) from public, anon;
grant execute on function public.cuentas_canceladas_de_cliente(uuid) to authenticated, service_role;

-- ── 6. La cuenta cancelada sale de las listas de saldo ───────────────
-- Se parchan las definiciones vivas (otras migraciones también las tocan).
do $$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := replace(pg_get_functiondef('public.cuentas_abiertas(integer)'::regprocedure), chr(13), '');
  v_nuevo := replace(v_def,
    E'    where r.deleted_at is null\n      and coalesce(mc.fecha,',
    E'    where r.deleted_at is null\n      and not exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = r.id)\n      and coalesce(mc.fecha,');
  if v_nuevo = v_def then raise exception 'cuentas_abiertas cambió: no se pudo excluir las cuentas canceladas.'; end if;
  execute v_nuevo;

  v_def := replace(pg_get_functiondef('public.ajustes_servicio_por_atender()'::regprocedure), chr(13), '');
  v_nuevo := replace(v_def,
    E'  where coalesce(public.is_staff(), false)\n    and k.tipo_ajuste in',
    E'  where coalesce(public.is_staff(), false)\n    and not exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = k.reserva_id)\n    and k.tipo_ajuste in');
  if v_nuevo = v_def then raise exception 'ajustes_servicio_por_atender cambió: no se pudo excluir las cuentas canceladas.'; end if;
  execute v_nuevo;
end $$;

-- ── 7. demo_vaciar conoce la tabla nueva ─────────────────────────────
do $$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := replace(pg_get_functiondef('public.demo_vaciar(uuid)'::regprocedure), chr(13), '');
  if position('cuentas_canceladas' in v_def) > 0 then
    return;
  end if;
  v_nuevo := replace(v_def, E'''cargos_aplicados'',', E'''cuentas_canceladas'', ''cargos_aplicados'',');
  v_nuevo := replace(v_nuevo, E'  alter table public.citas_estetica_cambios disable trigger user;\n',
    E'  alter table public.citas_estetica_cambios disable trigger user;\n  alter table public.cuentas_canceladas disable trigger user;\n');
  v_nuevo := replace(v_nuevo, E'  alter table public.citas_estetica_cambios enable trigger user;\n',
    E'  alter table public.citas_estetica_cambios enable trigger user;\n  alter table public.cuentas_canceladas enable trigger user;\n');
  if v_nuevo = v_def or position('cuentas_canceladas enable trigger user' in v_nuevo) = 0 or position('cuentas_canceladas disable trigger user' in v_nuevo) = 0 then
    raise exception 'demo_vaciar cambió: no se pudo agregar cuentas_canceladas.';
  end if;
  execute v_nuevo;
end $$;
