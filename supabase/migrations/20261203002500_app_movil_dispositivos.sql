-- App nativa para dueños (apps/duenos-movil, docs/app-duenos/PLAN.md): los celulares que reciben notificaciones push
-- nativas (expo-notifications: FCM en Android, APNs en iOS, entregadas por el servicio de push de Expo).
-- Es una tabla de la PERSONA (como app_push_suscripciones): sin negocio_id, cada dueño ve y escribe solo las suyas.

create table public.app_push_dispositivos (
  id uuid primary key default gen_random_uuid(),
  dueno_id uuid not null references public.duenos(id) on delete cascade,
  token text not null check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'),
  plataforma text not null check (plataforma in ('android', 'ios')),
  modelo text check (char_length(modelo) <= 120),
  version_app text check (char_length(version_app) <= 40),
  fallos int not null default 0,
  ultimo_envio_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index app_push_dispositivos_token_uq on public.app_push_dispositivos (token);
create index app_push_dispositivos_dueno_idx on public.app_push_dispositivos (dueno_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.app_push_dispositivos
  for each row execute function public.set_updated_at();
alter table public.app_push_dispositivos enable row level security;
create policy app_push_dispositivos_select on public.app_push_dispositivos for select to authenticated using (dueno_id = (select auth.uid()));
create policy app_push_dispositivos_insert on public.app_push_dispositivos for insert to authenticated with check (dueno_id = (select auth.uid()));
create policy app_push_dispositivos_update on public.app_push_dispositivos for update to authenticated using (dueno_id = (select auth.uid())) with check (dueno_id = (select auth.uid()));
create policy app_push_dispositivos_definer on public.app_push_dispositivos for all to peludesk_definer using (true) with check (true);
revoke all on public.app_push_dispositivos from anon, authenticated;
grant select, insert, update on public.app_push_dispositivos to authenticated;
grant select, insert, update, delete on public.app_push_dispositivos to peludesk_definer;

-- Un token que cambia de dueño (otra persona entra en el mismo celular) se reasigna: lo hace el servidor con la llave
-- de servicio después de comprobar la sesión (src/lib/movil/push.ts), nunca el celular.

-- Frontera: es tabla de la persona, como app_push_suscripciones.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('app_push_dispositivos')$a$ in v_def) = 0 then
    if position($a$('app_push_suscripciones')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no encuentro la lista de tablas de la persona.';
    end if;
    v_def := replace(v_def, $a$('app_push_suscripciones')$a$, $b$('app_push_suscripciones'), ('app_push_dispositivos')$b$);
    execute v_def;
  end if;
end $$;

-- Reversa (no se corre sola): drop table public.app_push_dispositivos;
