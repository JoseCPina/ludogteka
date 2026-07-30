-- Catálogo de insumos. unidad_compra (cómo entra, ej. galón) y
-- unidad_consumo (cómo sale, ej. mililitro) pueden ser distintas — el
-- trigger de abajo solo exige que compartan magnitud (no tiene sentido
-- comprar en litros y consumir en gramos). stock_minimo y
-- existencia_inicial se guardan en la unidad BASE de esa magnitud
-- (nunca en unidad_compra ni unidad_consumo directamente), para que la
-- existencia nunca dependa de en qué unidad se capturó cada movimiento
-- — ver la vista insumos_existencia_actual.
--
-- existencia_inicial es el punto de partida ("cuánto hay hoy al dar de
-- alta este insumo en el sistema"): Bloque B agrega movimientos_inventario
-- como ledger y la vista de existencia se extiende para sumarlos sobre
-- esta base, mismo patrón que cuenta_totales_reserva extendiéndose en
-- cada bloque de Fase 5.
--
-- requiere_caducidad + dias_aviso_caducidad son a nivel catálogo (¿este
-- TIPO de insumo caduca, y con cuánto aviso?), mismo criterio que
-- tipos_requisito_sanitario.es_critica/dias_aviso_vencimiento en Fase 2.
-- La fecha de caducidad real de cada lote comprado vive en el
-- movimiento de entrada (Bloque B), no aquí — un insumo se reabastece
-- muchas veces, cada compra con su propia fecha.
create table public.insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria_id uuid not null references public.categorias_insumo(id),
  unidad_compra_id uuid not null references public.unidades_medida(id),
  unidad_consumo_id uuid not null references public.unidades_medida(id),

  stock_minimo numeric(12, 2) not null default 0 check (stock_minimo >= 0),
  existencia_inicial numeric(12, 2) not null default 0 check (existencia_inicial >= 0),

  requiere_caducidad boolean not null default false,
  dias_aviso_caducidad int check (dias_aviso_caducidad is null or dias_aviso_caducidad > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.insumos
  for each row execute function public.set_updated_at();

create or replace function public.validar_insumo_unidades()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_magnitud_compra text;
  v_magnitud_consumo text;
begin
  select magnitud into v_magnitud_compra from public.unidades_medida where id = new.unidad_compra_id;
  select magnitud into v_magnitud_consumo from public.unidades_medida where id = new.unidad_consumo_id;

  if v_magnitud_compra is distinct from v_magnitud_consumo then
    raise exception 'La unidad de compra y la de consumo deben ser de la misma magnitud (volumen, peso o pieza).';
  end if;

  return new;
end;
$$;

create trigger validar_insumo_unidades before insert or update on public.insumos
  for each row execute function public.validar_insumo_unidades();

alter table public.insumos enable row level security;

-- Los tres roles de staff necesitan ver existencias y alertas de stock
-- mínimo (Bloque B: los tres registran consumo/merma); solo admin da de
-- alta o edita el catálogo (unidades, stock mínimo, caducidad), mismo
-- criterio que el catálogo de servicios en Fase 3.
create policy insumos_select_staff on public.insumos
  for select to authenticated
  using (public.is_staff());

create policy insumos_insert_admin on public.insumos
  for insert to authenticated
  with check (public.is_admin());

create policy insumos_update_admin on public.insumos
  for update to authenticated
  using (public.is_admin());
