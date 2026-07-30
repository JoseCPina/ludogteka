-- Bloque C: cuánto insumo gasta un servicio de estética, por tamaño de
-- perro — mismo criterio que las tarifas (depende_tamano en Fase 3).
-- cantidad_consumo se captura en la unidad de CONSUMO del insumo (la
-- misma unidad que usan registrar_salida/registrar_ajuste), para que
-- convertir a base sea una sola disciplina en todo el sistema.
--
-- No versionada como tarifas: cambiar la receta hacia adelante no
-- reescribe nada — lo que queda fijo para siempre es la cantidad REAL
-- consumida en cada cita, grabada como su propio movimiento_inventario
-- (ver finalizar_cita_con_consumo). La receta es solo la sugerencia por
-- default al finalizar, no una fuente de verdad histórica.
create table public.recetas_consumo (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id),
  tamano_id uuid not null references public.tamanos_categoria(id),
  insumo_id uuid not null references public.insumos(id),
  cantidad_consumo numeric(10, 2) not null check (cantidad_consumo > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.recetas_consumo
  for each row execute function public.set_updated_at();

-- Único activo por combinación — índice parcial (no UNIQUE de tabla)
-- para que dar de baja una línea y volver a crearla no choque con la
-- baja lógica, mismo patrón que clientes_email_activo_idx.
create unique index recetas_consumo_unica_activa_idx
  on public.recetas_consumo (servicio_id, tamano_id, insumo_id)
  where deleted_at is null;

-- Un CHECK no puede mirar otra tabla — el trigger es lo que hace
-- cumplir que la receta solo aplique a servicios de estética (no tiene
-- sentido una "receta de consumo" para guardería/hotel/cargos).
create or replace function public.validar_receta_servicio_estetica()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_categoria text;
begin
  select categoria into v_categoria from public.servicios where id = new.servicio_id;
  if v_categoria is distinct from 'estetica' then
    raise exception 'Las recetas de consumo solo aplican a servicios de estética.';
  end if;
  return new;
end;
$$;

create trigger validar_receta_servicio_estetica before insert or update on public.recetas_consumo
  for each row execute function public.validar_receta_servicio_estetica();

alter table public.recetas_consumo enable row level security;

-- Los tres roles de staff la leen (necesitan verla al finalizar una
-- cita para poder ajustar la cantidad real); solo admin la edita, mismo
-- criterio que el resto del catálogo de inventario.
create policy recetas_consumo_select_staff on public.recetas_consumo
  for select to authenticated
  using (public.is_staff());

create policy recetas_consumo_insert_admin on public.recetas_consumo
  for insert to authenticated
  with check (public.is_admin());

create policy recetas_consumo_update_admin on public.recetas_consumo
  for update to authenticated
  using (public.is_admin());
