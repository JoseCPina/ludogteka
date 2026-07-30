-- Bloque B: ledger append-only de cantidades, mismo criterio que
-- cobros/movimientos_caja — nunca se edita ni se borra un movimiento ya
-- hecho; una corrección es un ajuste inverso nuevo, con su propio
-- motivo. cantidad_base siempre es la magnitud (positiva); el signo con
-- el que afecta la existencia lo da `tipo`, no el número.
--
-- Deliberadamente SIN columnas de dinero (proveedor, costo) — esas
-- viven en compras_insumos (tabla aparte, admin-only). Así los tres
-- roles de staff pueden leer este ledger completo (necesario para ver
-- existencia, historial y fechas de caducidad) sin que "no ve costos"
-- (recepción/estética) dependa de esconder columnas dentro de la misma
-- fila — RLS no puede filtrar por columna, solo por fila.
create table public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id),
  tipo text not null check (
    tipo in ('entrada_compra', 'salida_consumo', 'salida_merma', 'ajuste_positivo', 'ajuste_negativo')
  ),
  cantidad_base numeric(12, 2) not null check (cantidad_base > 0),
  -- Solo se llena en entrada_compra, y solo si el insumo requiere
  -- caducidad (validado en la función, no aquí) — cada compra es su
  -- propio lote con su propia fecha.
  fecha_caducidad date,
  motivo text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  -- Merma y ajustes son movimientos "raros" que alguien debe poder
  -- explicar después; consumo y entrada no lo obligan (la entrada ya
  -- queda documentada en compras_insumos, y el consumo rutinario no
  -- necesita justificarse cada vez).
  check (
    tipo not in ('salida_merma', 'ajuste_positivo', 'ajuste_negativo')
    or (motivo is not null and btrim(motivo) <> '')
  )
);

create trigger set_updated_at before insert or update on public.movimientos_inventario
  for each row execute function public.set_updated_at();

create index movimientos_inventario_insumo_id_idx on public.movimientos_inventario (insumo_id);

alter table public.movimientos_inventario enable row level security;

-- Los tres roles de staff leen el ledger completo (cantidades, motivos,
-- caducidad) — ninguna columna aquí es dinero. Sin política de
-- INSERT/UPDATE para authenticated: las únicas puertas de entrada son
-- las funciones de la migración siguiente.
create policy movimientos_inventario_select_staff on public.movimientos_inventario
  for select to authenticated
  using (public.is_staff());
