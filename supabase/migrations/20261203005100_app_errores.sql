-- Cierres de la app nativa para dueños (docs/app-duenos/APP-NATIVA.md): cada celular los guarda y los manda al siguiente
-- arranque a /api/movil/errores. Es de la plataforma, no de un negocio, y solo la toca el servidor. Sin persona: el mensaje
-- llega limpio de teléfonos, correos, tokens e ids.
create table public.app_errores (
  id uuid primary key default gen_random_uuid(),
  mensaje text not null check (char_length(mensaje) <= 500),
  stack text check (stack is null or char_length(stack) <= 4000),
  pantalla text check (pantalla is null or char_length(pantalla) <= 200),
  version text not null check (char_length(version) <= 60),
  modelo text check (modelo is null or char_length(modelo) <= 100),
  sistema text check (sistema is null or char_length(sistema) <= 60),
  fatal boolean not null default false,
  ocurrido_at timestamptz not null,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index app_errores_fecha_idx on public.app_errores (created_at desc);
create index app_errores_ip_idx on public.app_errores (ip_hash, created_at desc) where ip_hash is not null;
create trigger set_updated_at before insert or update on public.app_errores for each row execute function public.set_updated_at();
alter table public.app_errores enable row level security;
create policy app_errores_definer on public.app_errores for all to peludesk_definer using (true) with check (true);
revoke all on public.app_errores from anon, authenticated;
grant select, insert, update on public.app_errores to peludesk_definer;
comment on table public.app_errores is 'Cierres de la app para dueños, sin persona. Solo servidor; se leen en /plataforma/app-duenos.';

-- Es de la plataforma, como app_entradas: entra a la lista de tablas sin negocio de auditoria_frontera.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position('app_errores' in v_def) = 0 then
    if position($a$('app_entradas')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no encuentro app_entradas en su lista.';
    end if;
    v_def := replace(v_def, $a$('app_entradas')$a$, $b$('app_entradas'), ('app_errores')$b$);
    execute v_def;
  end if;
end $$;
