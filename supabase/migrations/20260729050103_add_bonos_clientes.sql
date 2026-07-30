-- Bloque B: bono prepagado que un cliente compró. Vive por CLIENTE, no
-- por perro — un bono de guardería lo puede consumir cualquier perro de
-- la familia, igual que ya se decidió para servicios/tarifas (Fase 3) que
-- un bono no depende de tamaño/pelaje del perro, solo del servicio que
-- incluye.
--
-- cantidad_total, precio_pagado y fecha_vencimiento son SNAPSHOTS al
-- momento de la compra (mismo criterio que precio_unitario en estancias):
-- si el catálogo cambia después (más sesiones incluidas, otro precio,
-- otra vigencia), los bonos ya vendidos no se mueven solos.
--
-- reserva_id nunca es null: comprar un bono pasa por el MISMO flujo de
-- cobro que cualquier otra cosa (comprar_bono, migración siguiente, crea
-- una reserva de un solo renglón igual que ya hace crearCita para citas
-- sueltas) — así Bloque D no necesita una segunda fuente de dinero que
-- reconciliar en el arqueo, todo cobro pasa por cobros/cobro_metodos.
create table public.bonos_clientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  servicio_id uuid not null references public.servicios(id),
  reserva_id uuid not null references public.reservas(id),

  cantidad_total int not null check (cantidad_total >= 1),
  cantidad_disponible int not null check (cantidad_disponible >= 0),
  precio_pagado numeric(10, 2) not null check (precio_pagado >= 0),
  fecha_compra date not null default (public.fecha_negocio()),
  fecha_vencimiento date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (cantidad_disponible <= cantidad_total)
);

create trigger set_updated_at before insert or update on public.bonos_clientes
  for each row execute function public.set_updated_at();

create index bonos_clientes_cliente_id_idx on public.bonos_clientes (cliente_id);

-- Defensa en la propia tabla, no solo en comprar_bono(): un bono siempre
-- referencia un servicio categoria='bono', sin importar la puerta de
-- entrada.
create or replace function public.validar_bono_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_categoria text;
begin
  select categoria into v_categoria from public.servicios where id = new.servicio_id;
  if v_categoria <> 'bono' then
    raise exception 'Este servicio no es un bono; no se puede vender como bono.';
  end if;
  return new;
end;
$$;

create trigger validar_bono_cliente
before insert or update on public.bonos_clientes
for each row execute function public.validar_bono_cliente();

alter table public.bonos_clientes enable row level security;

create policy bonos_clientes_select_staff on public.bonos_clientes
  for select to authenticated
  using (public.is_staff());

create policy bonos_clientes_select_propio on public.bonos_clientes
  for select to authenticated
  using (
    cliente_id = (select cliente_id from public.profiles where id = auth.uid())
  );

-- Sin política de INSERT/UPDATE para authenticated a propósito: la única
-- puerta de entrada es comprar_bono() (venta) y el descuento de
-- cantidad_disponible dentro de consumir_bono() (migración siguiente),
-- ambas SECURITY DEFINER. Un bono nunca se compra ni se ajusta con un
-- INSERT/UPDATE directo desde la pantalla.
