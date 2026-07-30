-- Bloque D: retiro parcial de efectivo durante el turno (pagar a un
-- proveedor, guardar excedente en la caja fuerte). Solo efectivo tiene
-- sentido aquí — terminal y transferencia no tienen billetes físicos que
-- sacar de un cajón. Reduce lo que el arqueo debe esperar encontrar en
-- efectivo al cierre (ver cerrar_turno).
--
-- Ledger append-only, igual que cobros/devoluciones: nunca se edita ni se
-- borra un retiro ya hecho. Sin política de INSERT para authenticated a
-- propósito — la única puerta es registrar_retiro() (migración
-- siguiente), que resuelve el turno abierto él mismo.
create table public.movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references public.turnos_caja(id),
  monto numeric(10, 2) not null check (monto > 0),
  motivo text not null check (btrim(motivo) <> ''),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.movimientos_caja
  for each row execute function public.set_updated_at();

create index movimientos_caja_turno_id_idx on public.movimientos_caja (turno_id);

alter table public.movimientos_caja enable row level security;

-- Mismo criterio de visibilidad que turnos_caja: admin ve todo,
-- recepción solo los retiros de turnos que ella misma abrió.
create policy movimientos_caja_select on public.movimientos_caja
  for select to authenticated
  using (
    public.is_admin()
    or turno_id in (select id from public.turnos_caja where abierto_por = auth.uid())
  );

-- Única puerta de entrada para registrar un retiro. Resuelve el turno
-- abierto AQUÍ, nunca confía en un turno_id que mande el cliente.
create or replace function public.registrar_retiro(
  p_monto numeric,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id uuid;
  v_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden registrar un retiro.';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del retiro debe ser mayor a cero.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo del retiro.';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto.';
  end if;

  insert into public.movimientos_caja (turno_id, monto, motivo, created_by)
  values (v_turno_id, p_monto, btrim(p_motivo), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.registrar_retiro(numeric, text) from public;
grant execute on function public.registrar_retiro(numeric, text) to authenticated;
