-- Bitácora de vinculación: acceder al expediente de un cliente es acceder
-- a datos personales de un tercero, así que cada alta/baja de vínculo
-- queda registrada — quién (o "automático"), a quién, cuándo. Nunca se
-- edita ni se borra desde la app (sin políticas de UPDATE/DELETE):
-- un rastro de auditoría que se puede corregir no sirve de mucho.
create table public.vinculacion_eventos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references auth.users(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  accion text not null check (accion in ('vincular', 'desvincular')),
  actor_id uuid references auth.users(id) on delete set null,
  automatico boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.vinculacion_eventos enable row level security;

-- Solo admin/recepción insertan (vía las acciones de vincular/desvincular);
-- la vinculación automática pasa por una función SECURITY DEFINER que
-- bypassa RLS, así que no necesita política aparte.
create policy vinculacion_eventos_insert_staff
on public.vinculacion_eventos for insert
to authenticated
with check (public.current_rol() in ('admin', 'recepcion'));

-- Lectura directa de la tabla solo para admin (auditoría). admin/recepción
-- ven el detalle ya cruzado con clientes/auth.users a través de
-- listar_cuentas_vinculadas(), que no depende de esta política.
create policy vinculacion_eventos_select_admin
on public.vinculacion_eventos for select
to authenticated
using (public.is_admin());
