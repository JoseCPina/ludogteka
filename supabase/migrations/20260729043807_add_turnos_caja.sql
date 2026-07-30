-- Fase 5, Bloque D (adelantado): una sola caja, un turno abierto a la
-- vez. Se crea ahora, antes que el resto del bloque D, porque todo cobro
-- (Bloque A) necesita colgar de un turno abierto para que el arqueo
-- pueda reconciliar después — construirla al final hubiera obligado a
-- retro-poblar turno_id en cobros ya capturados.
--
-- El corte/arqueo en sí (conteo ciego, diferencias) y los retiros
-- parciales son tablas propias, todavía no construidas — llegan
-- completas en su propio bloque, no como columnas sueltas aquí después.
create table public.turnos_caja (
  id uuid primary key default gen_random_uuid(),
  abierto_por uuid not null references auth.users(id),
  cerrado_por uuid references auth.users(id),
  fondo_inicial numeric(10, 2) not null check (fondo_inicial >= 0),
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  abierto_at timestamptz not null default now(),
  cerrado_at timestamptz,
  notas_apertura text,
  notas_cierre text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check ((estado = 'abierto') = (cerrado_at is null))
);

create trigger set_updated_at before insert or update on public.turnos_caja
  for each row execute function public.set_updated_at();

-- "Un turno a la vez": índice único parcial, no una regla de app — dos
-- aperturas casi simultáneas desde dos pestañas no pueden colar dos
-- turnos abiertos.
create unique index turnos_caja_un_abierto_idx on public.turnos_caja (estado) where estado = 'abierto';

alter table public.turnos_caja enable row level security;

-- Admin ve todo el historial. Recepción ve sus propios turnos (los que
-- abrió) y siempre el que esté abierto ahora mismo, sin importar quién lo
-- abrió — para poder cobrar durante un turno que otro compañero dejó
-- abierto, aunque cerrarlo (política de UPDATE, abajo) siga siendo solo
-- de quien lo abrió.
create policy turnos_caja_select on public.turnos_caja
  for select to authenticated
  using (
    public.is_admin()
    or (public.current_rol() = 'recepcion' and (abierto_por = auth.uid() or estado = 'abierto'))
  );

create policy turnos_caja_insert on public.turnos_caja
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

-- Cierre (Bloque D) es la única escritura posterior al alta. "Recepción
-- cierra su propio turno; admin ve/cierra todos" — decisión explícita del
-- negocio, no un descuido.
create policy turnos_caja_update on public.turnos_caja
  for update to authenticated
  using (public.is_admin() or (public.current_rol() = 'recepcion' and abierto_por = auth.uid()))
  with check (public.is_admin() or (public.current_rol() = 'recepcion' and abierto_por = auth.uid()));
