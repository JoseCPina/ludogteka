-- "Una devolución es un movimiento inverso con motivo y con quién lo
-- autorizó" — nunca se toca el cobro original (cobros/cobro_metodos
-- siguen intactos, ver migración anterior). Una devolución referencia el
-- cobro que corrige y es, ella misma, otra tabla insert-only: ni se
-- edita ni se borra, exactamente igual que el cobro.
--
-- Decisión propia, no pedida explícita: solo admin puede registrar una
-- devolución (igual que el tope de descuentos del Bloque C, dinero
-- saliendo de la caja es más sensible que dinero entrando). autorizado_por
-- es siempre auth.uid() del admin que ejecuta la acción — no un campo de
-- texto libre sin forma de verificarse. Si el negocio prefiere que
-- recepción también pueda iniciar una devolución bajo un tope, avisar
-- para ajustarlo (mismo patrón que descuentos).
create table public.devoluciones (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references public.cobros(id),
  turno_id uuid not null references public.turnos_caja(id),
  motivo text not null,
  autorizado_por uuid not null references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (btrim(motivo) <> '')
);

create trigger set_updated_at before insert or update on public.devoluciones
  for each row execute function public.set_updated_at();

create index devoluciones_cobro_id_idx on public.devoluciones (cobro_id);
create index devoluciones_turno_id_idx on public.devoluciones (turno_id);

alter table public.devoluciones enable row level security;

create policy devoluciones_select_staff on public.devoluciones
  for select to authenticated
  using (public.is_staff());

create policy devoluciones_select_propio on public.devoluciones
  for select to authenticated
  using (
    cobro_id in (
      select c.id from public.cobros c
      join public.reservas r on r.id = c.reserva_id
      where r.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

create table public.devolucion_metodos (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.devoluciones(id),
  metodo text not null check (metodo in ('efectivo', 'terminal', 'transferencia')),
  monto numeric(10, 2) not null check (monto > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.devolucion_metodos
  for each row execute function public.set_updated_at();

create index devolucion_metodos_devolucion_id_idx on public.devolucion_metodos (devolucion_id);

alter table public.devolucion_metodos enable row level security;

create policy devolucion_metodos_select_staff on public.devolucion_metodos
  for select to authenticated
  using (public.is_staff());

create policy devolucion_metodos_select_propio on public.devolucion_metodos
  for select to authenticated
  using (
    devolucion_id in (
      select d.id from public.devoluciones d
      join public.cobros c on c.id = d.cobro_id
      join public.reservas r on r.id = c.reserva_id
      where r.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

-- Única puerta de entrada, solo admin (current_rol() lo exige, no solo el
-- grant). Igual que registrar_cobro: resuelve el turno abierto aquí
-- mismo, nunca confía en un turno_id mandado por el cliente. No permite
-- devolver más de lo que sigue cobrado neto de ese cobro específico —
-- una devolución no puede convertir un cobro en un número negativo.
create or replace function public.registrar_devolucion(
  p_cobro_id uuid,
  p_motivo text,
  p_metodos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id uuid;
  v_devolucion_id uuid;
  v_metodo jsonb;
  v_monto numeric;
  v_nombre_metodo text;
  v_cobrado numeric;
  v_ya_devuelto numeric;
  v_total_nuevo numeric;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede registrar una devolución.';
  end if;

  if not exists (select 1 from public.cobros where id = p_cobro_id) then
    raise exception 'Cobro no encontrado.';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la devolución.';
  end if;

  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Agrega al menos un método a devolver.';
  end if;

  select coalesce(sum(monto), 0) into v_cobrado
  from public.cobro_metodos where cobro_id = p_cobro_id;

  select coalesce(sum(dm.monto), 0) into v_ya_devuelto
  from public.devolucion_metodos dm
  join public.devoluciones d on d.id = dm.devolucion_id
  where d.cobro_id = p_cobro_id;

  v_total_nuevo := (
    select coalesce(sum((m ->> 'monto')::numeric), 0)
    from jsonb_array_elements(p_metodos) m
  );

  if v_ya_devuelto + v_total_nuevo > v_cobrado then
    raise exception 'No se puede devolver más de lo que sigue cobrado en este cobro (cobrado: %, ya devuelto: %).',
      v_cobrado, v_ya_devuelto;
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de registrar la devolución.';
  end if;

  insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by)
  values (p_cobro_id, v_turno_id, btrim(p_motivo), auth.uid(), auth.uid())
  returning id into v_devolucion_id;

  for v_metodo in select * from jsonb_array_elements(p_metodos)
  loop
    v_nombre_metodo := v_metodo ->> 'metodo';
    v_monto := (v_metodo ->> 'monto')::numeric;

    if v_nombre_metodo not in ('efectivo', 'terminal', 'transferencia') then
      raise exception 'Método de pago inválido: %', v_nombre_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada método debe tener un monto mayor a cero.';
    end if;

    insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
    values (v_devolucion_id, v_nombre_metodo, v_monto, auth.uid());
  end loop;

  return v_devolucion_id;
end;
$$;

revoke execute on function public.registrar_devolucion(uuid, text, jsonb) from public;
grant execute on function public.registrar_devolucion(uuid, text, jsonb) to authenticated;
