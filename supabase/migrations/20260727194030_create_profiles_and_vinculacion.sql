-- ============================================================
-- Alta del primer admin (huevo y gallina):
-- este archivo hace que TODO signup nuevo nazca con rol='cliente', y solo un
-- admin puede promover a otro (política profiles_update_admin, Migración 3).
-- La primera vez no hay admin que lo haga, así que se promueve a mano, UNA
-- SOLA VEZ, desde el SQL Editor del dashboard de Supabase (corre como
-- postgres, no pasa por RLS):
--
--   update public.profiles set rol = 'admin'
--   where id = (select id from auth.users where email = 'jpinadev@gmail.com');
--
-- No se automatiza en una migración a propósito: dejaría un correo personal
-- hardcodeado en el esquema para siempre y correría también en cualquier
-- entorno nuevo (staging, otro proyecto clonado). Ver docs/PROYECTO.md.
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null default 'cliente' check (rol in ('admin', 'recepcion', 'estetica', 'cliente')),
  cliente_id uuid references public.clientes(id),
  sucursal_id uuid references public.sucursales(id),
  nombre_completo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at
before insert or update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Un cliente (dueño) no puede quedar reclamado por dos cuentas a la vez.
create unique index profiles_cliente_id_unico_idx
  on public.profiles (cliente_id)
  where cliente_id is not null;

-- Cola de vinculación pendiente: cuentas registradas cuyo correo no hizo
-- match con ningún cliente. admin/recepción la consultan para vincular a
-- mano (políticas en Migración 3; UI todavía no existe).
create index profiles_sin_vincular_idx
  on public.profiles (id)
  where rol = 'cliente' and cliente_id is null;

-- Lógica de vinculación compartida por los dos triggers de auth.users de
-- abajo. Solo vincula si el correo ya está confirmado y hay exactamente un
-- cliente activo con ese correo; si no hay match o hay ambigüedad, el
-- profile se queda con cliente_id null para resolver a mano.
create or replace function public.vincular_cliente_por_email(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_confirmado boolean;
  v_cliente_id uuid;
  v_matches int;
begin
  select email, (email_confirmed_at is not null)
    into v_email, v_confirmado
  from auth.users
  where id = p_user_id;

  if v_email is null or not v_confirmado then
    return;
  end if;

  select count(*), max(id)
    into v_matches, v_cliente_id
  from public.clientes
  where lower(email) = lower(v_email)
    and deleted_at is null;

  if v_matches = 1 then
    update public.profiles
    set cliente_id = v_cliente_id
    where id = p_user_id
      and cliente_id is null
      and rol = 'cliente';
  end if;
end;
$$;

-- Con enable_confirmations = true, email_confirmed_at siempre es null en
-- este momento; esta inserción nunca vincula por sí sola, solo deja el
-- profile listo. Se llama a vincular_cliente_por_email igual por si el
-- correo ya llega confirmado (p. ej. invite de staff o magic link).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, rol, created_by)
  values (new.id, 'cliente', new.id)
  on conflict (id) do nothing;

  perform public.vincular_cliente_por_email(new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- La confirmación real llega después, como UPDATE de auth.users: aquí es
-- donde la vinculación automática ocurre en la práctica.
create or replace function public.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.vincular_cliente_por_email(new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
after update on auth.users
for each row execute function public.handle_user_email_confirmed();
