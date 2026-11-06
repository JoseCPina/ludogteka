-- Entrar a la app por WhatsApp como se hace normalmente: la persona escribe su número y PeluDesk le manda un código de 6
-- dígitos (plantilla de autenticación de Meta; si no está aprobada, mensaje de sesión con la ventana abierta o SMS).
-- De un solo uso, 10 minutos, 5 intentos y bloqueo temporal por número. El código se guarda con hash; solo lo toca el
-- servidor (service_role). Al verificarse, abre sesión por app_entradas (canjearEntrada), igual que antes.
create table public.app_codigos_entrada (
  id uuid primary key default gen_random_uuid(),
  telefono text not null check (telefono ~ '^[0-9]{10}$'),
  codigo_hash text not null,
  canal text not null check (canal in ('plantilla', 'sesion', 'sms')),
  intentos int not null default 0,
  expira_at timestamptz not null default now() + interval '10 minutes',
  usado_at timestamptz,
  bloqueado_hasta timestamptz,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index app_codigos_entrada_telefono_idx on public.app_codigos_entrada (telefono, created_at desc);
create index app_codigos_entrada_ip_idx on public.app_codigos_entrada (ip_hash, created_at desc) where ip_hash is not null;
create trigger set_updated_at before insert or update on public.app_codigos_entrada
  for each row execute function public.set_updated_at();
alter table public.app_codigos_entrada enable row level security;
create policy app_codigos_entrada_definer on public.app_codigos_entrada for all to peludesk_definer using (true) with check (true);
revoke all on public.app_codigos_entrada from anon, authenticated;
grant select, insert, update, delete on public.app_codigos_entrada to peludesk_definer;
comment on table public.app_codigos_entrada is 'App para dueños: códigos de 6 dígitos para entrar (con hash, un solo uso, 10 minutos, 5 intentos, bloqueo por número). Solo servidor.';
