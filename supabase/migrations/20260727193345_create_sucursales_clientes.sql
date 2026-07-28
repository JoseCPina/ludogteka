-- Trigger reutilizable para updated_at: sin default en la columna, se llena
-- también en el insert inicial (before insert or update).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Sucursales: negocio de una sola ubicación por ahora, pero se deja la tabla
-- lista para multi-sucursal futuro sin migraciones de backfill dolorosas.
create table public.sucursales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at
before insert or update on public.sucursales
for each row execute function public.set_updated_at();

alter table public.sucursales enable row level security;

insert into public.sucursales (nombre) values ('Ludogteka San Luis Potosí');

-- Clientes (dueños): puede existir sin cuenta de auth; profiles.cliente_id
-- (Migración 2) lo vincula cuando el dueño se registra en el portal.
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid references public.sucursales(id),
  nombre text not null,
  telefono text not null,
  email text,
  rfc text,
  regimen_fiscal text,
  consentimiento_imagen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at
before insert or update on public.clientes
for each row execute function public.set_updated_at();

alter table public.clientes enable row level security;

-- Identificador operativo real: casi todos los dueños dan teléfono, no todos dan correo.
create index clientes_telefono_idx on public.clientes (telefono);

-- Único solo entre clientes activos: evita ambigüedad para la vinculación
-- automática por email (Migración 2) y permite reciclar un correo si el
-- cliente anterior fue dado de baja (deleted_at).
create unique index clientes_email_activo_idx
  on public.clientes (lower(email))
  where email is not null and deleted_at is null;
