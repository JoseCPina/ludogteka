-- Cobro contra una reserva (adición Bloque A): un cobro es un solo
-- movimiento de dinero que puede repartirse entre varios métodos
-- (cobro_metodos) — "un mismo cobro repartible entre varios". Nunca se
-- edita ni se borra una vez creado: es un hecho ("el cliente pagó $X el
-- día Y"), no un estado. Una corrección es una devolución (migración
-- siguiente), un movimiento aparte, nunca un UPDATE aquí.
--
-- Por eso estas dos tablas NO llevan política de UPDATE ni se tocan
-- desde la pantalla con INSERT directo: la única puerta de entrada es
-- registrar_cobro() (abajo, SECURITY DEFINER), que mete el encabezado y
-- todas las líneas de método en una sola transacción — un cobro con cero
-- líneas de método (por una falla a medio camino) no tiene sentido y no
-- debe poder quedar así ni un instante.
create table public.cobros (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.reservas(id),
  turno_id uuid not null references public.turnos_caja(id),
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.cobros
  for each row execute function public.set_updated_at();

create index cobros_reserva_id_idx on public.cobros (reserva_id);
create index cobros_turno_id_idx on public.cobros (turno_id);

alter table public.cobros enable row level security;

create policy cobros_select_staff on public.cobros
  for select to authenticated
  using (public.is_staff());

create policy cobros_select_propio on public.cobros
  for select to authenticated
  using (
    reserva_id in (
      select id from public.reservas
      where cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

-- Propina por método (adición Bloque A): "la de efectivo está en el
-- cajón, la de terminal no" — el arqueo (Bloque D) necesita saber cuánta
-- propina en efectivo hay físicamente en la caja, por eso vive aquí y no
-- como un solo monto global del cobro. monto reduce el saldo pendiente
-- de la cuenta; propina no — es dinero aparte, nunca parte de lo que se
-- le cobra al servicio.
create table public.cobro_metodos (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references public.cobros(id),
  metodo text not null check (metodo in ('efectivo', 'terminal', 'transferencia')),
  monto numeric(10, 2) not null check (monto > 0),
  propina numeric(10, 2) not null default 0 check (propina >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.cobro_metodos
  for each row execute function public.set_updated_at();

create index cobro_metodos_cobro_id_idx on public.cobro_metodos (cobro_id);

alter table public.cobro_metodos enable row level security;

create policy cobro_metodos_select_staff on public.cobro_metodos
  for select to authenticated
  using (public.is_staff());

create policy cobro_metodos_select_propio on public.cobro_metodos
  for select to authenticated
  using (
    cobro_id in (
      select c.id from public.cobros c
      join public.reservas r on r.id = c.reserva_id
      where r.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

-- Única puerta de entrada para registrar un cobro. Resuelve el turno
-- abierto AQUÍ (nunca confía en un turno_id que mande el cliente — un
-- valor viejo o ajeno colaría un cobro fuera del turno real) y valida que
-- exista antes de insertar nada. p_metodos: jsonb array de
-- {"metodo": "efectivo"|"terminal"|"transferencia", "monto": n, "propina": n}.
create or replace function public.registrar_cobro(
  p_reserva_id uuid,
  p_notas text,
  p_metodos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id uuid;
  v_cobro_id uuid;
  v_metodo jsonb;
  v_monto numeric;
  v_propina numeric;
  v_nombre_metodo text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden registrar cobros.';
  end if;

  if not exists (select 1 from public.reservas where id = p_reserva_id) then
    raise exception 'Reserva no encontrada.';
  end if;

  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Agrega al menos un método de pago.';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de cobrar.';
  end if;

  insert into public.cobros (reserva_id, turno_id, notas, created_by)
  values (p_reserva_id, v_turno_id, nullif(btrim(p_notas), ''), auth.uid())
  returning id into v_cobro_id;

  for v_metodo in select * from jsonb_array_elements(p_metodos)
  loop
    v_nombre_metodo := v_metodo ->> 'metodo';
    v_monto := (v_metodo ->> 'monto')::numeric;
    v_propina := coalesce((v_metodo ->> 'propina')::numeric, 0);

    if v_nombre_metodo not in ('efectivo', 'terminal', 'transferencia') then
      raise exception 'Método de pago inválido: %', v_nombre_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada método debe tener un monto mayor a cero.';
    end if;
    if v_propina < 0 then
      raise exception 'La propina no puede ser negativa.';
    end if;

    insert into public.cobro_metodos (cobro_id, metodo, monto, propina, created_by)
    values (v_cobro_id, v_nombre_metodo, v_monto, v_propina, auth.uid());
  end loop;

  return v_cobro_id;
end;
$$;

revoke execute on function public.registrar_cobro(uuid, text, jsonb) from public;
grant execute on function public.registrar_cobro(uuid, text, jsonb) to authenticated;
