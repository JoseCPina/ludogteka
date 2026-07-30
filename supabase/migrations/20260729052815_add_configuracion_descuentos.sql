-- Tope en el tiempo de cuánto puede descontar recepción sin admin, mismo
-- patrón temporal que cupo_configuracion/tarifas: tabla de solo-inserción,
-- "el tope vigente" en cualquier fecha es la fila con vigencia_desde más
-- reciente <= esa fecha.
--
-- El tope es un MONTO EN PESOS, no un porcentaje: así es comparable sin
-- importar si el descuento en sí se capturó como porcentaje o como monto
-- fijo — "recepción puede descontar hasta $X de esta cuenta" es la misma
-- pregunta sin importar cómo se llegó a esa cifra.
create table public.configuracion_descuentos (
  id uuid primary key default gen_random_uuid(),
  vigencia_desde date not null,
  tope_recepcion numeric(10, 2) not null check (tope_recepcion >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.configuracion_descuentos
  for each row execute function public.set_updated_at();

create index configuracion_descuentos_vigencia_idx
  on public.configuracion_descuentos (vigencia_desde desc);

alter table public.configuracion_descuentos enable row level security;

create policy configuracion_descuentos_select_staff on public.configuracion_descuentos
  for select to authenticated
  using (public.is_staff());

create policy configuracion_descuentos_insert_admin on public.configuracion_descuentos
  for insert to authenticated
  with check (public.is_admin());

create policy configuracion_descuentos_update_admin on public.configuracion_descuentos
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Mismo principio que resolver_cupo_configuracion: siempre una fila,
-- estado explícito. "sin_configurar" se trata como tope $0 en
-- aplicar_descuento() — un tope sin definir NUNCA se lee como "sin
-- límite", justo el hueco que el negocio pidió cerrar ("un descuento sin
-- límite es una fuga de dinero con permiso").
create or replace function public.resolver_tope_descuento_recepcion(
  p_fecha date default public.fecha_negocio()
)
returns table (tope_recepcion numeric, vigencia_desde date, estado text)
language sql
stable
set search_path = ''
as $$
  select
    c.tope_recepcion,
    c.vigencia_desde,
    case when c.id is null then 'sin_configurar' else 'configurado' end as estado
  from (select 1) as _dummy
  left join lateral (
    select cd.id, cd.tope_recepcion, cd.vigencia_desde
    from public.configuracion_descuentos cd
    where cd.vigencia_desde <= p_fecha
      and cd.deleted_at is null
    order by cd.vigencia_desde desc
    limit 1
  ) c on true;
$$;

grant execute on function public.resolver_tope_descuento_recepcion(date) to authenticated;
