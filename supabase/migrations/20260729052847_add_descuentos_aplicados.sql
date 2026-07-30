-- Descuento aplicado sobre la cuenta completa de una reserva (no sobre
-- una línea suelta: "segundo perro" o "cliente frecuente" son ajustes a
-- la visita completa, no a un servicio en particular).
--
-- valor es lo que se capturó (porcentaje 0-100, o un monto fijo en
-- pesos); monto_aplicado es el resultado ya resuelto en pesos al momento
-- de aplicarlo — snapshot, igual que precio_unitario en estancias: si el
-- total de la cuenta cambia después (se agrega un cargo), el descuento ya
-- aplicado no se recalcula solo.
--
-- Cancelar dejа rastro y nunca se borra ni se reactiva — mismo patrón que
-- cargos_aplicados (Fase 4): "aplica uno nuevo si corresponde" en vez de
-- reabrir el viejo.
create table public.descuentos_aplicados (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.reservas(id),
  catalogo_descuento_id uuid not null references public.catalogo_descuentos(id),

  tipo text not null check (tipo in ('porcentaje', 'monto_fijo')),
  valor numeric(10, 2) not null check (valor > 0),
  monto_aplicado numeric(10, 2) not null check (monto_aplicado > 0),

  -- Obligatorio solo cuando el descuento pasó del tope de recepción (el
  -- propio RPC lo exige ahí); en un descuento dentro del tope es opcional.
  motivo_adicional text,
  -- Quién autorizó cuando se necesitó pasar del tope. Null en un
  -- descuento normal dentro del tope de recepción.
  autorizado_por uuid references auth.users(id),

  cancelado boolean not null default false,
  motivo_cancelacion text,
  cancelado_por uuid references auth.users(id) on delete set null,
  cancelado_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (not cancelado or motivo_cancelacion is not null)
);

create trigger set_updated_at before insert or update on public.descuentos_aplicados
  for each row execute function public.set_updated_at();

create index descuentos_aplicados_reserva_id_idx on public.descuentos_aplicados (reserva_id);

-- cancelado_por/cancelado_at nunca los manda el cliente, y un descuento
-- cancelado no se puede reactivar — mismo criterio que
-- marcar_cargo_cancelado (Fase 4).
create or replace function public.marcar_descuento_cancelado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cancelado and not old.cancelado then
    if new.motivo_cancelacion is null or btrim(new.motivo_cancelacion) = '' then
      raise exception 'Escribe el motivo para cancelar este descuento.';
    end if;
    new.cancelado_at := now();
    new.cancelado_por := auth.uid();
  elsif not new.cancelado and old.cancelado then
    raise exception 'Un descuento cancelado no se puede reactivar. Aplica uno nuevo si corresponde.';
  end if;
  return new;
end;
$$;

create trigger marcar_descuento_cancelado
before update on public.descuentos_aplicados
for each row execute function public.marcar_descuento_cancelado();

alter table public.descuentos_aplicados enable row level security;

create policy descuentos_aplicados_select_staff on public.descuentos_aplicados
  for select to authenticated
  using (public.is_staff());

create policy descuentos_aplicados_select_propio on public.descuentos_aplicados
  for select to authenticated
  using (
    reserva_id in (
      select id from public.reservas
      where cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

-- Aplicar (INSERT) solo vía aplicar_descuento() (SECURITY DEFINER,
-- migración siguiente) — valida el tope ahí, no aquí. Cancelar (UPDATE)
-- sí es directo desde la pantalla: mismo criterio que cargos_aplicados,
-- es una corrección de captura, no un movimiento de dinero saliendo de
-- caja (eso son las devoluciones, Bloque A, y ésas sí son admin-only).
create policy descuentos_aplicados_update_staff on public.descuentos_aplicados
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));
