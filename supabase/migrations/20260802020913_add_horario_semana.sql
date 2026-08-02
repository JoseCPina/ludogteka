-- Horario real por día de la semana (lunes a viernes 9–19, sábado
-- 10–14, domingo cerrado) — hueco encontrado al capturar la hora de
-- cierre real del negocio para Fase 10: cupo_configuracion.hora_cierre
-- era un solo valor para todos los días, y minutos_retraso_cierre
-- (Fase 4, cargo de recogida tardía) lo usaba tal cual — hoy hubiera
-- cobrado de menos entre 2pm y 7pm los sábados y no hubiera detectado
-- que domingo está cerrado.
--
-- Tabla aparte, no una columna más en cupo_configuracion: son 7 filas
-- por cada "generación" de configuración (misma vigencia_desde que su
-- cupo_configuracion dueño), no un solo valor — mismo motivo por el que
-- cargos_aplicados es tabla aparte de estancias.
--
-- hora_apertura/hora_cierre ambas null = cerrado ese día (domingo). El
-- CHECK obliga a que vengan juntas: no tiene sentido "abre a las 9 pero
-- nunca cierra" ni al revés.
create table public.horario_semana (
  id uuid primary key default gen_random_uuid(),
  cupo_configuracion_id uuid not null references public.cupo_configuracion(id),
  dia_semana int not null check (dia_semana between 0 and 6), -- 0=domingo…6=sábado, igual que extract(dow from ...)
  hora_apertura time,
  hora_cierre time,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check ((hora_apertura is null) = (hora_cierre is null))
);

create trigger set_updated_at before insert or update on public.horario_semana
  for each row execute function public.set_updated_at();

create unique index horario_semana_generacion_dia_idx
  on public.horario_semana (cupo_configuracion_id, dia_semana)
  where deleted_at is null;

alter table public.horario_semana enable row level security;

create policy horario_semana_select_staff on public.horario_semana
  for select to authenticated
  using (public.is_staff());

create policy horario_semana_insert_admin on public.horario_semana
  for insert to authenticated
  with check (public.is_admin());

create policy horario_semana_update_admin on public.horario_semana
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- resolver_cupo_configuracion ahora resuelve hora_apertura/hora_cierre
-- PARA EL DÍA DE LA SEMANA de p_fecha, no un valor genérico — bugfix,
-- no solo columna nueva: antes de esto, un sábado o domingo ya
-- devolvían (incorrectamente) el mismo hora_cierre que un martes.
drop function public.resolver_cupo_configuracion(date);

create or replace function public.resolver_cupo_configuracion(
  p_fecha date default current_date
)
returns table (
  cupo_diurno int,
  cupo_nocturno int,
  hora_apertura time,
  hora_cierre time,
  vigencia_desde date,
  estado text,
  base_direccion text,
  base_lat double precision,
  base_lng double precision
)
language sql
stable
set search_path = ''
as $$
  select
    c.cupo_diurno,
    c.cupo_nocturno,
    h.hora_apertura,
    h.hora_cierre,
    c.vigencia_desde,
    case when c.id is null then 'sin_configurar' else 'configurado' end as estado,
    c.base_direccion,
    c.base_lat,
    c.base_lng
  from (select 1) as _dummy
  left join lateral (
    select cc.id, cc.cupo_diurno, cc.cupo_nocturno, cc.vigencia_desde,
      cc.base_direccion, cc.base_lat, cc.base_lng
    from public.cupo_configuracion cc
    where cc.vigencia_desde <= p_fecha
      and cc.deleted_at is null
    order by cc.vigencia_desde desc
    limit 1
  ) c on true
  left join lateral (
    select hs.hora_apertura, hs.hora_cierre
    from public.horario_semana hs
    where hs.cupo_configuracion_id = c.id
      and hs.dia_semana = extract(dow from p_fecha)
      and hs.deleted_at is null
  ) h on true;
$$;

grant execute on function public.resolver_cupo_configuracion(date) to authenticated;

-- Sin hora_cierre ese día (domingo, o un horario aún no capturado) no
-- hay "retraso" que calcular — null, no 0, mismo principio de siempre:
-- "no aplica" es distinto de "no llegó tarde".
create or replace function public.minutos_retraso_cierre(
  p_fecha date,
  p_hora_real timestamptz default now()
)
returns int
language sql
stable
set search_path = ''
as $$
  select greatest(
    0,
    round(extract(epoch from (public.hora_negocio(p_hora_real) - cc.hora_cierre)) / 60)
  )::int
  from public.resolver_cupo_configuracion(p_fecha) cc
  where cc.estado = 'configurado'
    and cc.hora_cierre is not null;
$$;
