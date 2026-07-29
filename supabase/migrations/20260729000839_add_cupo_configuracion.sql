-- Cupo y hora de cierre en el tiempo, mismo patrón temporal que tarifas:
-- tabla de solo-inserción, "el valor vigente" en cualquier fecha se
-- resuelve como la fila con vigencia_desde más reciente <= esa fecha.
--
-- Cupo diurno y nocturno por separado (adición 1, Fase 4): de día caben
-- los perros que andan sueltos en el área común; de noche solo los que
-- tienen dónde dormir, casi siempre menos lugares. Guardería consume solo
-- diurno; hotel consume ambos en cada fecha de su rango (ver el trigger
-- de estancias, migración posterior). Si en la práctica el negocio maneja
-- el mismo número para los dos, se capturan iguales y no estorba.
--
-- hora_cierre vive aquí, no en tabla aparte: el negocio la pidió junto al
-- cupo, y cambia por temporada igual que el cupo. El cargo de recogida
-- tardía (Fase 4, más adelante) la va a consumir para decidir si una
-- salida fue tarde.
create table public.cupo_configuracion (
  id uuid primary key default gen_random_uuid(),
  vigencia_desde date not null,
  cupo_diurno int not null,
  cupo_nocturno int not null,
  hora_cierre time not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,

  check (cupo_diurno >= 0),
  check (cupo_nocturno >= 0)
);

create trigger set_updated_at before insert or update on public.cupo_configuracion
  for each row execute function public.set_updated_at();

create index cupo_configuracion_vigencia_idx
  on public.cupo_configuracion (vigencia_desde desc);

alter table public.cupo_configuracion enable row level security;

-- No es información financiera ni de interés del cliente (no es un
-- precio) — solo staff la necesita, para poder reservar.
create policy cupo_configuracion_select_staff on public.cupo_configuracion
  for select to authenticated
  using (public.is_staff());

create policy cupo_configuracion_insert_admin on public.cupo_configuracion
  for insert to authenticated
  with check (public.is_admin());

create policy cupo_configuracion_update_admin on public.cupo_configuracion
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Resolución de cupo/hora de cierre vigentes: mismo principio que
-- resolver_precio, SIEMPRE devuelve una fila (nunca vacío) con un
-- `estado` explícito — un hueco silencioso (cero cupo configurado)
-- llevaría a "todo cabe" en vez de bloquear como debería.
create or replace function public.resolver_cupo_configuracion(
  p_fecha date default current_date
)
returns table (cupo_diurno int, cupo_nocturno int, hora_cierre time, vigencia_desde date, estado text)
language sql
stable
set search_path = ''
as $$
  select
    c.cupo_diurno,
    c.cupo_nocturno,
    c.hora_cierre,
    c.vigencia_desde,
    case when c.id is null then 'sin_configurar' else 'configurado' end as estado
  from (select 1) as _dummy
  left join lateral (
    select cc.id, cc.cupo_diurno, cc.cupo_nocturno, cc.hora_cierre, cc.vigencia_desde
    from public.cupo_configuracion cc
    where cc.vigencia_desde <= p_fecha
      and cc.deleted_at is null
    order by cc.vigencia_desde desc
    limit 1
  ) c on true;
$$;

grant execute on function public.resolver_cupo_configuracion(date) to authenticated;
