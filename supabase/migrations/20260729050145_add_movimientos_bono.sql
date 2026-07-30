-- "Los movimientos deben quedar registrados de modo que Fase 8 pueda
-- distinguir venta de bono, consumo de bono e ingreso reconocido, sin
-- inferirlo." Una sola tabla, ledger append-only (igual que
-- cobros/devoluciones: nunca se edita ni se borra), con tipo explícito:
--
--   - 'venta': se vendió el bono. monto = lo que pagó el cliente por el
--     bono completo (precio_pagado de bonos_clientes) — dinero real que
--     YA entró a la caja, pero es ingreso DIFERIDO, no reconocido todavía.
--   - 'consumo': se usó una unidad del bono para pagar una estancia,
--     cargo o cita real. No entra dinero nuevo — monto aquí ES el
--     ingreso reconocido de ese consumo (precio_pagado / cantidad_total
--     del bono, prorrateado), exactamente lo que Fase 8 necesita sumar
--     para "ingreso reconocido de bonos" sin tener que adivinar nada.
--
-- item_tipo/item_id: qué línea cubrió ese consumo (estancia/cargo/cita),
-- mismo criterio de tipo+id que ya usa cuenta_lineas_reserva. Null en una
-- fila 'venta' (ahí no hay línea que cubrir todavía).
create table public.movimientos_bono (
  id uuid primary key default gen_random_uuid(),
  bono_cliente_id uuid not null references public.bonos_clientes(id),
  tipo text not null check (tipo in ('venta', 'consumo')),
  cantidad int not null check (cantidad >= 1),
  monto numeric(10, 2) not null check (monto >= 0),
  item_tipo text check (item_tipo in ('estancia', 'cargo', 'estetica')),
  item_id uuid,
  turno_id uuid references public.turnos_caja(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check ((tipo = 'consumo') = (item_tipo is not null and item_id is not null))
);

create trigger set_updated_at before insert or update on public.movimientos_bono
  for each row execute function public.set_updated_at();

create index movimientos_bono_bono_cliente_id_idx on public.movimientos_bono (bono_cliente_id);
create index movimientos_bono_item_idx on public.movimientos_bono (item_tipo, item_id);

alter table public.movimientos_bono enable row level security;

create policy movimientos_bono_select_staff on public.movimientos_bono
  for select to authenticated
  using (public.is_staff());

create policy movimientos_bono_select_propio on public.movimientos_bono
  for select to authenticated
  using (
    bono_cliente_id in (
      select id from public.bonos_clientes
      where cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

-- Sin política de INSERT/UPDATE, igual que cobros/devoluciones: solo
-- comprar_bono() y consumir_bono() (SECURITY DEFINER, migración
-- siguiente) escriben aquí.
