-- ═══════════════════════════════════════════════════════════════════
-- Conciliación: solo cuentan los pagos que PeluDesk originó (12 de octubre de 2026)
--
-- Una cuenta de Mercado Pago recibe pagos de otros orígenes (otras tiendas,
-- transferencias, cobros personales, otras terminales). La conciliación los
-- trataba como propios y marcaba «Pago aprobado en Mercado Pago, sin cobro
-- en la caja» (Ludogteka: pagos 182066052075 por $27,355.58 y 182084767547
-- por $1,089.00). Desde ahora:
--
--  · El servidor clasifica cada pago (orden/link de PeluDesk, terminal
--    vinculada, o ajeno) y solo manda como hallazgo lo propio.
--  · Opción por negocio (conciliacion_ajustes.mostrar_pagos_ajenos, apagada)
--    para ver los ajenos como INFORMATIVOS: tipo nuevo 'pago_ajeno', que no
--    cuenta en «Necesita atención», contadores ni la plataforma.
--  · Limpieza de lo que ya estaba abierto, solo por la plataforma, con
--    evento de auditoría y reversa (plataforma_conciliacion_*).
--
-- Reversa de este esquema: ver el final del archivo (comentada).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Tipo nuevo de hallazgo: informativo ─────────────────────────
alter table public.conciliacion_terminal drop constraint conciliacion_terminal_tipo_check;
alter table public.conciliacion_terminal
  add constraint conciliacion_terminal_tipo_check check (tipo in ('cobro_sin_pago', 'pago_sin_cobro', 'pago_ajeno'));
comment on column public.conciliacion_terminal.tipo is
  'cobro_sin_pago / pago_sin_cobro: alertas. pago_ajeno: pago de la cuenta que PeluDesk no originó, solo informativo (nunca alerta ni cuenta).';

-- ── 2. Ajuste por negocio ──────────────────────────────────────────
create table public.conciliacion_ajustes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  mostrar_pagos_ajenos boolean not null default false,
  cambiado_por uuid references auth.users(id) on delete set null,
  cambiado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index conciliacion_ajustes_negocio_uq on public.conciliacion_ajustes (negocio_id) where deleted_at is null;
create index conciliacion_ajustes_negocio_idx on public.conciliacion_ajustes (negocio_id);
create trigger set_updated_at before insert or update on public.conciliacion_ajustes
  for each row execute function public.set_updated_at();
alter table public.conciliacion_ajustes enable row level security;
create policy conciliacion_ajustes_negocio on public.conciliacion_ajustes as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy conciliacion_ajustes_negocio_definer on public.conciliacion_ajustes for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy conciliacion_ajustes_escritura_ins on public.conciliacion_ajustes as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy conciliacion_ajustes_escritura_upd on public.conciliacion_ajustes as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy conciliacion_ajustes_escritura_del on public.conciliacion_ajustes as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
create policy conciliacion_ajustes_select on public.conciliacion_ajustes for select to authenticated
  using ((select coalesce(public.current_rol() in ('admin', 'recepcion'), false)));
revoke all on public.conciliacion_ajustes from anon, authenticated;
grant select on public.conciliacion_ajustes to authenticated;
grant select, insert, update, delete on public.conciliacion_ajustes to peludesk_definer;

create or replace function public.conciliacion_mostrar_ajenos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.mostrar_pagos_ajenos from public.conciliacion_ajustes a
    where a.negocio_id = public.negocio_actual() and a.deleted_at is null
  ), false)
  and coalesce(public.current_rol() in ('admin', 'recepcion'), false);
$$;
alter function public.conciliacion_mostrar_ajenos() owner to peludesk_definer;
revoke execute on function public.conciliacion_mostrar_ajenos() from public, anon;
grant execute on function public.conciliacion_mostrar_ajenos() to authenticated, service_role;

-- Solo el admin. Al apagarla, lo informativo que estaba abierto se cierra.
create or replace function public.guardar_conciliacion_mostrar_ajenos(p_mostrar boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin cambia esta opción.' using errcode = '42501';
  end if;
  if p_mostrar is null then
    raise exception 'Indica si se muestran o no.';
  end if;
  update public.conciliacion_ajustes
  set mostrar_pagos_ajenos = p_mostrar, cambiado_por = auth.uid(), cambiado_at = now()
  where negocio_id = public.negocio_actual() and deleted_at is null;
  if not found then
    insert into public.conciliacion_ajustes (negocio_id, mostrar_pagos_ajenos, cambiado_por, cambiado_at)
    values (public.negocio_actual(), p_mostrar, auth.uid(), now());
  end if;
  if not p_mostrar then
    update public.conciliacion_terminal
    set resuelta_at = now(), resuelta_motivo = 'Se apagó «Mostrar también otros pagos de mi cuenta».', resuelta_por = auth.uid()
    where negocio_id = public.negocio_actual() and tipo = 'pago_ajeno' and resuelta_at is null;
  end if;
  return p_mostrar;
end;
$$;
alter function public.guardar_conciliacion_mostrar_ajenos(boolean) owner to peludesk_definer;
revoke execute on function public.guardar_conciliacion_mostrar_ajenos(boolean) from public, anon;
grant execute on function public.guardar_conciliacion_mostrar_ajenos(boolean) to authenticated, service_role;

-- ── 3. Limpieza por la plataforma ──────────────────────────────────
alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (array[
  'crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo', 'cambiar_plan',
  'asignar_plan', 'editar_plan', 'resolver_propuesta_raza', 'agregar_raza', 'eliminar_negocio', 'seguimiento_pausa',
  'cargar_tarifas_estetica', 'sincronizar_tutoriales', 'tutorial_youtube', 'marcar_tutoriales', 'migracion_matriz_mestizo',
  'revertir_tarifas_estetica', 'corregir_saldos_centavos', 'revertir_saldos_centavos',
  'conciliacion_cerrar_ajenos', 'conciliacion_revertir_ajenos']));

-- Alertas abiertas «pago sin cobro» que NO son de PeluDesk. Con lo que la base
-- sabe: el pago está ligado a una orden de PeluDesk, su referencia es una orden
-- de PeluDesk, o la fila ya trae el origen que anotó el servidor. Todo lo demás
-- (incluido lo que no se puede clasificar) es ajeno. Solo lee.
create or replace function public.plataforma_conciliacion_ajenos(p_negocio_id uuid default null)
returns table(id uuid, negocio_id uuid, negocio_nombre text, mp_pago_id text, monto numeric, ocurrio_at timestamptz, detectada_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  return query
  select ct.id, ct.negocio_id, n.nombre, ct.mp_pago_id, ct.monto, ct.ocurrio_at, ct.detectada_at
  from public.conciliacion_terminal ct
  join public.negocios n on n.id = ct.negocio_id
  where ct.tipo = 'pago_sin_cobro' and ct.resuelta_at is null and ct.deleted_at is null
    and (p_negocio_id is null or ct.negocio_id = p_negocio_id)
    and coalesce(ct.detalle ->> 'origen', '') not in ('orden', 'terminal')
    and not exists (
      select 1 from public.mp_ordenes o
      where o.negocio_id = ct.negocio_id
        and (o.mp_payment_id = ct.mp_pago_id or o.mp_payment_ref = ct.mp_pago_id
             or (ct.detalle ->> 'referencia' is not null and o.id::text = ct.detalle ->> 'referencia'))
    )
  order by n.nombre, ct.detectada_at;
end;
$$;
revoke execute on function public.plataforma_conciliacion_ajenos(uuid) from public, anon;
grant execute on function public.plataforma_conciliacion_ajenos(uuid) to authenticated, service_role;

-- Cierra esas alertas como «Ajeno a PeluDesk». Un evento por negocio con lo
-- que cerró (para revertir). Idempotente: sin nada abierto, no hace ni registra nada.
create or replace function public.plataforma_conciliacion_cerrar_ajenos(p_negocio_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg record;
  v_filas jsonb;
  v_evento uuid;
  v_resultado jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  for v_neg in select distinct a.negocio_id, a.negocio_nombre from public.plataforma_conciliacion_ajenos(p_negocio_id) a loop
    select jsonb_agg(jsonb_build_object('id', a.id, 'mp_pago_id', a.mp_pago_id, 'monto', a.monto, 'ocurrio_at', a.ocurrio_at) order by a.detectada_at)
    into v_filas
    from public.plataforma_conciliacion_ajenos(v_neg.negocio_id) a;
    update public.conciliacion_terminal ct
    set resuelta_at = now(), resuelta_motivo = 'Ajeno a PeluDesk', resuelta_por = auth.uid()
    where ct.id in (select (x ->> 'id')::uuid from jsonb_array_elements(v_filas) x) and ct.resuelta_at is null;
    insert into public.plataforma_eventos (accion, negocio_id, motivo, detalle, created_by)
    values ('conciliacion_cerrar_ajenos', v_neg.negocio_id, 'Pagos de la cuenta que PeluDesk no originó',
      jsonb_build_object('filas', v_filas, 'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end), auth.uid())
    returning plataforma_eventos.id into v_evento;
    v_resultado := v_resultado || jsonb_build_object('evento_id', v_evento, 'negocio_id', v_neg.negocio_id, 'negocio', v_neg.negocio_nombre,
      'cerradas', jsonb_array_length(v_filas), 'filas', v_filas);
  end loop;
  return v_resultado;
end;
$$;
revoke execute on function public.plataforma_conciliacion_cerrar_ajenos(uuid) from public, anon;
grant execute on function public.plataforma_conciliacion_cerrar_ajenos(uuid) to authenticated, service_role;

-- Reversa: reabre lo que ese evento cerró (salvo lo que la conciliación ya
-- volvió a abrir con la misma clave).
create or replace function public.plataforma_conciliacion_revertir_ajenos(p_evento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev record;
  v_f jsonb;
  v_n int := 0;
  v_evento uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  select * into v_ev from public.plataforma_eventos e where e.id = p_evento_id and e.accion = 'conciliacion_cerrar_ajenos';
  if not found then
    raise exception 'No hay una limpieza de conciliación con ese evento.';
  end if;
  if exists (select 1 from public.plataforma_eventos e where e.accion = 'conciliacion_revertir_ajenos' and (e.detalle ->> 'evento_revertido')::uuid = p_evento_id) then
    raise exception 'Esa limpieza ya se revirtió.';
  end if;
  for v_f in select * from jsonb_array_elements(v_ev.detalle -> 'filas') loop
    update public.conciliacion_terminal ct
    set resuelta_at = null, resuelta_motivo = null, resuelta_por = null
    where ct.id = (v_f ->> 'id')::uuid and ct.resuelta_motivo = 'Ajeno a PeluDesk' and ct.resuelta_at is not null
      and not exists (
        select 1 from public.conciliacion_terminal o
        where o.negocio_id = ct.negocio_id and o.tipo = ct.tipo and o.clave = ct.clave and o.resuelta_at is null
      );
    if found then v_n := v_n + 1; end if;
  end loop;
  insert into public.plataforma_eventos (accion, negocio_id, motivo, detalle, created_by)
  values ('conciliacion_revertir_ajenos', v_ev.negocio_id, 'Reversa de la limpieza ' || p_evento_id,
    jsonb_build_object('evento_revertido', p_evento_id, 'reabiertas', v_n), auth.uid())
  returning plataforma_eventos.id into v_evento;
  return jsonb_build_object('evento_id', v_evento, 'reabiertas', v_n);
end;
$$;
revoke execute on function public.plataforma_conciliacion_revertir_ajenos(uuid) from public, anon;
grant execute on function public.plataforma_conciliacion_revertir_ajenos(uuid) to authenticated, service_role;

-- Lista blanca de la frontera: las tres son de postgres (ven todos los negocios).
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('plataforma_conciliacion_ajenos' in v_def) = 0 then
    if position($a$('plataforma_revertir_saldos_centavos')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no encuentro dónde agregar las funciones de conciliación.';
    end if;
    v_def := replace(v_def, $a$('plataforma_revertir_saldos_centavos')$a$,
      $b$('plataforma_revertir_saldos_centavos'), ('plataforma_conciliacion_ajenos'), ('plataforma_conciliacion_cerrar_ajenos'), ('plataforma_conciliacion_revertir_ajenos')$b$);
    execute v_def;
  end if;
end $$;

-- Reversa del esquema (no se corre sola):
--   drop function public.plataforma_conciliacion_revertir_ajenos(uuid), public.plataforma_conciliacion_cerrar_ajenos(uuid),
--     public.plataforma_conciliacion_ajenos(uuid), public.guardar_conciliacion_mostrar_ajenos(boolean), public.conciliacion_mostrar_ajenos();
--   drop table public.conciliacion_ajustes;
--   update public.conciliacion_terminal set resuelta_at = now(), resuelta_motivo = 'reversa' where tipo = 'pago_ajeno' and resuelta_at is null;
--   (y volver el check de tipo a los dos valores originales)
