-- ═══════════════════════════════════════════════════════════════════
-- App para dueños · Fase 1 · Útil el día uno (31 de octubre de 2026)
-- docs/app-duenos/PLAN.md
--
-- Lo que el dueño tiene aunque ningún negocio suyo use PeluDesk:
--  · la cartilla digital de su mascota, llenada con la FOTO de la de papel
--    (mascotas_cartilla; la foto y lo que leyó la IA en mascotas_cartilla_fotos)
--  · recordatorios de vacuna, desparasitación y medicamento (app_recordatorios)
--  · peso, medicación y gastos por mascota
--  · el perfil público con QR para la placa (mascotas.token_publico) y el canal
--    por el que quien la encuentra le escribe sin ver su teléfono (mascotas_mensajes)
--  · «mascota perdida»: perdida_at / encontrada_at y la zona.
-- Todo es de la persona (sin negocio): RLS por mascota del dueño. Nada se
-- escribe al migrar salvo el token público de las mascotas que ya existen.
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. Bucket de fotos de la app (privado; el servidor sube y firma) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-mascotas', 'app-mascotas', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ── 1. mascotas: token público, perdida, recordatorios ─────────────
create or replace function public.app_token_publico()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 10 caracteres sin 0/O/1/I: legible en una placa y difícil de adivinar.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 10);
$$;
revoke execute on function public.app_token_publico() from public, anon;
grant execute on function public.app_token_publico() to authenticated, service_role;

alter table public.mascotas
  add column if not exists token_publico text,
  add column if not exists perdida_at timestamptz,
  add column if not exists perdida_nota text,
  add column if not exists perdida_lat double precision,
  add column if not exists perdida_lng double precision,
  add column if not exists encontrada_at timestamptz,
  add column if not exists recordatorios_apagados boolean not null default false;
update public.mascotas set token_publico = public.app_token_publico() where token_publico is null;
alter table public.mascotas alter column token_publico set not null, alter column token_publico set default public.app_token_publico();
create unique index if not exists mascotas_token_publico_uq on public.mascotas (token_publico);
create index if not exists mascotas_perdidas_idx on public.mascotas (perdida_at) where perdida_at is not null and encontrada_at is null and deleted_at is null;

alter table public.duenos add column if not exists recordatorios_whatsapp boolean not null default true;

-- ¿Es mía? (la RLS de todo lo que cuelga de una mascota)
create or replace function public.app_mascota_mia(p_mascota uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.mascotas m where m.id = p_mascota and m.dueno_id = auth.uid() and m.deleted_at is null);
$$;
revoke execute on function public.app_mascota_mia(uuid) from public, anon;
grant execute on function public.app_mascota_mia(uuid) to authenticated, service_role;

-- Macro: una tabla de la mascota, con RLS propia, updated_at y los permisos.
create or replace function public._app_tabla_de_mascota(p_tabla text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', p_tabla);
  execute format('alter table public.%I enable row level security', p_tabla);
  execute format('create policy %I on public.%I for select to authenticated using ((select public.app_mascota_mia(mascota_id)))', p_tabla || '_propio_select', p_tabla);
  execute format('create policy %I on public.%I for insert to authenticated with check ((select public.app_mascota_mia(mascota_id)))', p_tabla || '_propio_insert', p_tabla);
  execute format('create policy %I on public.%I for update to authenticated using ((select public.app_mascota_mia(mascota_id))) with check ((select public.app_mascota_mia(mascota_id)))', p_tabla || '_propio_update', p_tabla);
  execute format('create policy %I on public.%I for all to peludesk_definer using (true) with check (true)', p_tabla || '_definer', p_tabla);
  execute format('revoke all on public.%I from anon, authenticated', p_tabla);
  execute format('grant select, insert, update on public.%I to authenticated', p_tabla);
  execute format('grant select, insert, update, delete on public.%I to peludesk_definer', p_tabla);
end;
$$;

-- ── 2. La cartilla ─────────────────────────────────────────────────
create table public.mascotas_cartilla (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  tipo text not null check (tipo in ('vacuna', 'desparasitacion')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  -- desparasitación: interna, externa o ambas
  subtipo text check (subtipo is null or subtipo in ('interna', 'externa', 'ambas')),
  lote text,
  laboratorio text,
  fecha_aplicacion date,
  proxima_dosis date,
  -- de dónde salió: la foto de la cartilla (IA, confirmada por el dueño), capturada a mano, el negocio (Fase 3) o el QR (Fase 2)
  fuente text not null default 'manual' check (fuente in ('foto', 'manual', 'negocio', 'qr')),
  confianza numeric(3,2) check (confianza is null or (confianza >= 0 and confianza <= 1)),
  foto_id uuid,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index mascotas_cartilla_mascota_idx on public.mascotas_cartilla (mascota_id, fecha_aplicacion desc) where deleted_at is null;
select public._app_tabla_de_mascota('mascotas_cartilla');
-- El dueño puede corregir o quitar lo suyo (baja lógica); lo de un negocio o un QR no se borra, se oculta (Fase 2).
create policy mascotas_cartilla_propio_delete on public.mascotas_cartilla for delete to authenticated using ((select public.app_mascota_mia(mascota_id)) and fuente in ('foto', 'manual'));
grant delete on public.mascotas_cartilla to authenticated;

-- La foto de la cartilla y lo que la IA leyó (para medir tiempo y acierto, y para revisar después).
create table public.mascotas_cartilla_fotos (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  foto_path text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'leida', 'sin_datos', 'error')),
  lectura jsonb,
  modelo text,
  ms int,
  tokens_in int,
  tokens_out int,
  error text,
  confirmada_at timestamptz,
  registros int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index mascotas_cartilla_fotos_mascota_idx on public.mascotas_cartilla_fotos (mascota_id, created_at desc);
select public._app_tabla_de_mascota('mascotas_cartilla_fotos');
alter table public.mascotas_cartilla add constraint mascotas_cartilla_foto_fk foreign key (foto_id) references public.mascotas_cartilla_fotos(id) on delete set null;

-- ── 3. Peso, medicación y gastos ───────────────────────────────────
create table public.mascotas_pesos (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  peso_kg numeric(5,2) not null check (peso_kg > 0 and peso_kg < 200),
  fecha date not null default current_date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index mascotas_pesos_mascota_idx on public.mascotas_pesos (mascota_id, fecha desc) where deleted_at is null;
select public._app_tabla_de_mascota('mascotas_pesos');

create table public.mascotas_medicamentos (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  dosis text,
  -- a qué horas del día (hora local del celular), p. ej. {"08:00","20:00"}
  horas time[] not null default '{}',
  fecha_inicio date not null default current_date,
  fecha_fin date,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index mascotas_medicamentos_mascota_idx on public.mascotas_medicamentos (mascota_id) where deleted_at is null and activo;
select public._app_tabla_de_mascota('mascotas_medicamentos');

create table public.mascotas_gastos (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  concepto text not null check (char_length(btrim(concepto)) between 1 and 80),
  categoria text not null default 'otro' check (categoria in ('alimento', 'veterinaria', 'estetica', 'guarderia_hotel', 'medicinas', 'accesorios', 'otro')),
  -- El gasto del DUEÑO en su mascota (no es dinero de un negocio): lo captura y lo ve solo él.
  monto numeric(10,2) not null check (monto >= 0),
  fecha date not null default current_date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index mascotas_gastos_mascota_idx on public.mascotas_gastos (mascota_id, fecha desc) where deleted_at is null;
select public._app_tabla_de_mascota('mascotas_gastos');
create policy mascotas_gastos_propio_delete on public.mascotas_gastos for delete to authenticated using ((select public.app_mascota_mia(mascota_id)));
create policy mascotas_pesos_propio_delete on public.mascotas_pesos for delete to authenticated using ((select public.app_mascota_mia(mascota_id)));
grant delete on public.mascotas_gastos, public.mascotas_pesos to authenticated;

-- El total del mes sale de la base (nunca sumando filas en la pantalla).
create or replace function public.app_gastos_mes(p_mascota uuid, p_anio int, p_mes int)
returns table (total numeric, cuantos int)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(g.monto), 0)::numeric, count(*)::int
  from public.mascotas_gastos g
  where g.mascota_id = p_mascota and g.deleted_at is null
    and extract(year from g.fecha) = p_anio and extract(month from g.fecha) = p_mes;
$$;
revoke execute on function public.app_gastos_mes(uuid, int, int) from public, anon;
grant execute on function public.app_gastos_mes(uuid, int, int) to authenticated, service_role;

-- ── 4. Recordatorios de la app ─────────────────────────────────────
-- Una fila por aviso programado: la base los guarda, el cron (/api/cron/app-recordatorios) los manda por push,
-- al centro de avisos y, si el dueño lo acepta y hay plantilla aprobada, por WhatsApp. Un solo intento por fila.
create table public.app_recordatorios (
  id uuid primary key default gen_random_uuid(),
  dueno_id uuid not null references public.duenos(id) on delete cascade,
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  tipo text not null check (tipo in ('vacuna', 'desparasitacion', 'medicamento')),
  ref_id uuid not null,
  para_at timestamptz not null,
  titulo text not null,
  cuerpo text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'fallido', 'omitido')),
  push_enviadas int not null default 0,
  wa_estado text,
  wa_id text,
  enviado_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index app_recordatorios_uno_uq on public.app_recordatorios (tipo, ref_id, para_at) where deleted_at is null;
create index app_recordatorios_pendientes_idx on public.app_recordatorios (para_at) where estado = 'pendiente' and deleted_at is null;
create index app_recordatorios_mascota_idx on public.app_recordatorios (mascota_id, para_at desc);
select public._app_tabla_de_mascota('app_recordatorios');
-- El dueño solo los lee; los crea y cierra el servidor.
drop policy app_recordatorios_propio_insert on public.app_recordatorios;
drop policy app_recordatorios_propio_update on public.app_recordatorios;
revoke insert, update on public.app_recordatorios from authenticated;

-- ── 5. Mensajes de quien la encuentra (chat relevado) ──────────────
-- Quien encuentra a la mascota escribe desde /m/<token> o manda «ENCONTRE <token> …» al bot desde su WhatsApp; el
-- dueño lo ve en la app (y le llega push) y contesta desde ahí; la respuesta sale por el bot al WhatsApp de quien la
-- encontró. Ninguno ve el teléfono del otro.
create table public.mascotas_mensajes (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  de text not null check (de in ('hallador', 'dueno')),
  texto text not null check (char_length(texto) between 1 and 600),
  -- el WhatsApp de quien la encontró (10 dígitos), solo servidor; nunca viaja al dueño
  hallador_telefono text check (hallador_telefono is null or hallador_telefono ~ '^[0-9]{10}$'),
  hallador_nombre text,
  entregado_at timestamptz,
  error text,
  leido_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index mascotas_mensajes_mascota_idx on public.mascotas_mensajes (mascota_id, created_at);
create trigger set_updated_at before insert or update on public.mascotas_mensajes for each row execute function public.set_updated_at();
alter table public.mascotas_mensajes enable row level security;
-- El dueño los lee por una vista sin el teléfono de quien la encontró (RLS no filtra columnas).
create policy mascotas_mensajes_definer on public.mascotas_mensajes for all to peludesk_definer using (true) with check (true);
revoke all on public.mascotas_mensajes from anon, authenticated;
grant select, insert, update, delete on public.mascotas_mensajes to peludesk_definer;

create or replace view public.app_mis_mensajes with (security_invoker = false) as
  select m.id, m.mascota_id, m.de, m.texto, m.hallador_nombre, m.entregado_at, m.leido_at, m.created_at
  from public.mascotas_mensajes m
  where m.deleted_at is null;
-- Vista SIN security_invoker a propósito (el dueño no tiene SELECT en la tabla): filtra por su mascota aquí.
create or replace function public.app_mensajes_de(p_mascota uuid)
returns table (id uuid, de text, texto text, hallador_nombre text, entregado_at timestamptz, leido_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.de, m.texto, m.hallador_nombre, m.entregado_at, m.leido_at, m.created_at
  from public.mascotas_mensajes m
  where m.mascota_id = p_mascota and m.deleted_at is null and public.app_mascota_mia(p_mascota)
  order by m.created_at;
$$;
alter function public.app_mensajes_de(uuid) owner to peludesk_definer;
revoke execute on function public.app_mensajes_de(uuid) from public, anon;
grant execute on function public.app_mensajes_de(uuid) to authenticated, service_role;
drop view public.app_mis_mensajes;

-- ── 6. Dueños cerca (para «mascota perdida»): solo ids, solo servidor ──
create or replace function public.app_duenos_cerca(p_lat double precision, p_lng double precision, p_km double precision, p_excluir uuid)
returns table (dueno_id uuid, distancia_km double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id,
    2 * 6371 * asin(sqrt(power(sin(radians(d.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(d.lat)) * power(sin(radians(d.lng - p_lng) / 2), 2))) as km
  from public.duenos d
  where d.deleted_at is null and d.lat is not null and d.lng is not null and d.id <> p_excluir
    and abs(d.lat - p_lat) < p_km / 100 and abs(d.lng - p_lng) < p_km / 80
    and 2 * 6371 * asin(sqrt(power(sin(radians(d.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(d.lat)) * power(sin(radians(d.lng - p_lng) / 2), 2))) <= p_km
  order by km
  limit 2000;
$$;
alter function public.app_duenos_cerca(double precision, double precision, double precision, uuid) owner to peludesk_definer;
revoke execute on function public.app_duenos_cerca(double precision, double precision, double precision, uuid) from public, anon, authenticated;
grant execute on function public.app_duenos_cerca(double precision, double precision, double precision, uuid) to service_role;

-- Negocios PeluDesk cerca (sucursal con ubicación) con el teléfono de su recepción: solo servidor.
create or replace function public.app_negocios_cerca(p_lat double precision, p_lng double precision, p_km double precision)
returns table (negocio_id uuid, nombre text, slug text, distancia_km double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (n.id) n.id, n.nombre, n.slug,
    2 * 6371 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2))) as km
  from public.sucursales s
  join public.negocios n on n.id = s.negocio_id and n.activo and n.deleted_at is null and coalesce(n.plan, '') <> 'demo'
  where s.deleted_at is null and s.lat is not null and s.lng is not null
    and 2 * 6371 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2))) <= p_km
  order by n.id, km
  limit 200;
$$;
revoke execute on function public.app_negocios_cerca(double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.app_negocios_cerca(double precision, double precision, double precision) to service_role;

-- Cuántas mascotas se han encontrado con PeluDesk (métrica pública, un número).
create or replace function public.app_mascotas_encontradas()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.mascotas where encontrada_at is not null;
$$;
alter function public.app_mascotas_encontradas() owner to peludesk_definer;
revoke execute on function public.app_mascotas_encontradas() from public, anon;
grant execute on function public.app_mascotas_encontradas() to authenticated, service_role;

-- El perfil público de la mascota por su token (lo que ve quien la encuentra): sin teléfono ni dirección.
create or replace function public.app_mascota_publica(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'nombre', m.nombre, 'especie', m.especie, 'especie_detalle', m.especie_detalle, 'sexo', m.sexo,
    'raza_texto', m.raza_texto, 'foto_path', m.foto_path, 'perdida', (m.perdida_at is not null and m.encontrada_at is null),
    'perdida_nota', case when m.perdida_at is not null and m.encontrada_at is null then m.perdida_nota end,
    'dueno_nombre', split_part(coalesce(d.nombre, ''), ' ', 1),
    'vinculo_foto', (select jsonb_build_object('negocio_id', v.negocio_id, 'foto_path', p.foto_path) from public.mascotas_vinculos v join public.perros p on p.id = v.perro_id where v.mascota_id = m.id and v.deleted_at is null and p.foto_path is not null limit 1)
  )
  from public.mascotas m join public.duenos d on d.id = m.dueno_id
  where m.token_publico = upper(btrim(p_token)) and m.deleted_at is null;
$$;
-- La página pública la pinta el servidor (llave de servicio): el anónimo no la ejecuta directo.
alter function public.app_mascota_publica(text) owner to peludesk_definer;
revoke execute on function public.app_mascota_publica(text) from public, anon, authenticated;
grant execute on function public.app_mascota_publica(text) to service_role;

-- ── 7. Frontera: tablas de la persona; funciones de postgres ──────
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('mascotas_cartilla')$a$ in v_def) = 0 then
    if position($a$('app_avisos')$a$ in v_def) = 0 or position($a$('app_mis_negocios')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no encuentro dónde agregar las tablas de la Fase 1.';
    end if;
    v_def := replace(v_def, $a$('app_avisos')$a$, $b$('app_avisos'), ('mascotas_cartilla'), ('mascotas_cartilla_fotos'), ('mascotas_pesos'), ('mascotas_medicamentos'), ('mascotas_gastos'), ('app_recordatorios'), ('mascotas_mensajes')$b$);
    -- app_negocios_cerca lee sucursales de todos los negocios (solo nombre, slug y distancia; solo servidor): de postgres.
    v_def := replace(v_def, $a$('app_mis_negocios')$a$, $b$('app_mis_negocios'), ('app_negocios_cerca')$b$);
    execute v_def;
  end if;
end $$;

drop function public._app_tabla_de_mascota(text);

-- Reversa (no se corre sola): drop de las tablas mascotas_cartilla*, mascotas_pesos, mascotas_medicamentos, mascotas_gastos,
-- app_recordatorios, mascotas_mensajes; de las funciones app_*; y de las columnas nuevas de mascotas y duenos.
