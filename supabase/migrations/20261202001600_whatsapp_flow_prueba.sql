-- WhatsApp Flow «PeluDesk · Prueba gratis» (25 de octubre de 2026): el bot ofrece un formulario dentro del chat
-- (giro, datos del negocio, confirmación) y al completarlo abre el negocio en prueba gratis con el teléfono de
-- WhatsApp como cuenta del admin, igual que /registro, y le manda por el chat una liga de entrada de un solo uso.
--
--   wa_flow_sesiones  una por cada Flow que el bot manda: el flow_token (lo único que Meta nos devuelve para saber de
--                     quién es cada pantalla), el teléfono que Meta verificó al recibir el mensaje, dónde se ofreció,
--                     de qué fuente viene (prospecto, anuncio) y en qué quedó. El teléfono NUNCA sale de lo que la
--                     persona escribe en el Flow: sale de esta fila.
--   wa_accesos        la liga de entrada: el SHA-256 de un token al azar (el token solo viaja en el mensaje), la
--                     persona y el negocio, 24 horas de validez y un solo uso (usado_at).
--
-- Las dos son de la PLATAFORMA (como wa_hilos): solo el servidor escribe (secret key); la administración de
-- PeluDesk lee; ningún negocio, ni anon, ve nada.

create table public.wa_flow_sesiones (
  id uuid primary key default gen_random_uuid(),
  flow_token text not null check (flow_token ~ '^[A-Za-z0-9_-]{20,80}$'),
  telefono text not null check (telefono ~ '^[0-9]{8,15}$'),
  -- Dónde lo ofreció el bot.
  punto text not null check (punto in ('saludo', 'menu', 'precio', 'prueba', 'prospeccion', 'anuncio', 'manual')),
  -- De dónde viene la persona: un prospecto de Google Places o capturado a mano, un anuncio de Meta, o nadie.
  fuente text not null default 'directo' check (fuente in ('directo', 'google_places', 'manual', 'anuncio_meta')),
  prospecto_id uuid references public.prospectos(id) on delete set null,
  anuncio_id text check (anuncio_id is null or anuncio_id ~ '^[0-9]{1,40}$'),
  ref text check (ref is null or ref ~ '^[a-z0-9]{5}$'),
  estado text not null default 'enviado'
    check (estado in ('enviado', 'abierto', 'completado', 'creando', 'cuenta_creada', 'ya_tenia', 'error')),
  wa_message_id text check (wa_message_id is null or length(wa_message_id) <= 200),
  enviado_at timestamptz not null default now(),
  abierto_at timestamptz,
  completado_at timestamptz,
  terminado_at timestamptz,
  -- Cuando el bot cayó al flujo por texto (el Flow no salió o no lo abrió en 10 minutos).
  respaldo_at timestamptz,
  datos jsonb not null default '{}'::jsonb check (length(datos::text) <= 4000),
  negocio_creado_id uuid references public.negocios(id) on delete set null,
  error text check (error is null or length(error) <= 500),
  intentos int not null default 0 check (intentos between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index wa_flow_sesiones_token on public.wa_flow_sesiones (flow_token);
create index wa_flow_sesiones_telefono on public.wa_flow_sesiones (telefono, enviado_at desc);
create index wa_flow_sesiones_pendientes on public.wa_flow_sesiones (estado, enviado_at) where deleted_at is null and estado in ('enviado', 'completado', 'creando');
create trigger set_updated_at before insert or update on public.wa_flow_sesiones for each row execute function public.set_updated_at();

create table public.wa_accesos (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  persona_id uuid not null references auth.users(id) on delete cascade,
  negocio_destino_id uuid not null references public.negocios(id) on delete cascade,
  telefono text not null check (telefono ~ '^[0-9]{8,15}$'),
  sesion_id uuid references public.wa_flow_sesiones(id) on delete set null,
  -- A dónde entra: un negocio recién abierto, a la bienvenida; uno que ya tenía, a su inicio.
  destino text not null default '/bienvenida' check (destino in ('/bienvenida', '/admin')),
  expira_at timestamptz not null,
  usado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index wa_accesos_token on public.wa_accesos (token_hash);
create index wa_accesos_persona on public.wa_accesos (persona_id);
create trigger set_updated_at before insert or update on public.wa_accesos for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['wa_flow_sesiones', 'wa_accesos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.es_admin_plataforma()))', t || '_select_plataforma', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_sin_escritura', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- La aceptación de términos y aviso también puede venir del Flow (casilla de la pantalla de confirmación).
alter table public.aceptaciones_legales drop constraint aceptaciones_legales_origen_check;
alter table public.aceptaciones_legales add constraint aceptaciones_legales_origen_check check (origen in ('registro', 'whatsapp_flow'));

-- El panel de /plataforma/prospectos: por fuente y por dónde se ofreció, cuántos lo recibieron, lo abrieron, lo
-- completaron y cuántas cuentas creó. Lo cuenta la base (sin traer filas).
create or replace function public.wa_flow_resumen(p_desde timestamptz default null)
returns table (
  fuente text, punto text, ofrecidos bigint, abiertos bigint, completados bigint, cuentas bigint,
  ya_tenian bigint, respaldos bigint, errores bigint
)
language sql
stable
set search_path = ''
as $$
  select s.fuente, s.punto,
    count(*),
    count(*) filter (where s.abierto_at is not null),
    count(*) filter (where s.completado_at is not null),
    count(*) filter (where s.estado = 'cuenta_creada'),
    count(*) filter (where s.estado = 'ya_tenia'),
    count(*) filter (where s.respaldo_at is not null),
    count(*) filter (where s.estado = 'error')
  from public.wa_flow_sesiones s
  where s.deleted_at is null
    and (p_desde is null or s.enviado_at >= p_desde)
    and coalesce(public.es_admin_plataforma(), false)
  group by s.fuente, s.punto
  order by s.fuente, s.punto;
$$;
revoke execute on function public.wa_flow_resumen(timestamptz) from public, anon;
grant execute on function public.wa_flow_resumen(timestamptz) to authenticated, service_role;

-- Las dos tablas son de la plataforma: a la lista de compartidas de la auditoría.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('wa_flow_sesiones')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('wa_entregas'), $a$, $b$('wa_entregas'), ('wa_flow_sesiones'), ('wa_accesos'), $b$);
    if position($a$('wa_flow_sesiones')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar wa_flow_sesiones y wa_accesos.';
    end if;
    execute v_def;
  end if;
end $$;
