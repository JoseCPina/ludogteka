-- ═══════════════════════════════════════════════════════════════════
-- App para dueños · Fase 0 · Cimientos (31 de octubre de 2026)
-- docs/app-duenos/PLAN.md
--
-- La identidad del dueño ya era UNA cuenta de Auth por teléfono (correo
-- sintético t<tel>@telefono.ludogteka.mx) con una membresía de cliente en cada
-- negocio. Lo que faltaba es lo de ARRIBA de los negocios:
--
--  · duenos              la persona como dueña de mascotas (id = auth.users.id)
--  · mascotas            la mascota global, de la persona, no de un negocio
--  · mascotas_vinculos   qué expediente (perros) tiene esa mascota en cada negocio
--  · app_entradas        entrar por teléfono con código mandado por WhatsApp
--  · app_push_suscripciones  notificaciones push del celular
--  · app_avisos          el centro de avisos de la app
--
-- El negocio sigue viendo solo lo suyo (perros, clientes, membresías como
-- siempre); el dueño ve todo lo suyo (sus mascotas y, por vínculo, en qué
-- negocios están). El puente lo hace app_vincular_perro: cada perro de un
-- cliente que tiene cuenta queda ligado a una mascota del dueño, al crearse,
-- al cambiar y al ligarse la cuenta; y aquí mismo se ligan todos los que ya
-- existen (backfill). Nadie pierde acceso ni datos: no se toca nada de lo
-- que existe, solo se agregan filas nuevas.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. duenos ──────────────────────────────────────────────────────
create table public.duenos (
  id uuid primary key references auth.users(id) on delete cascade,
  telefono text check (telefono is null or telefono ~ '^[0-9]{10}$'),
  nombre text,
  -- Dónde vive (lo da la persona en «Cerca de mí»; para «mascota perdida» en 5 km).
  lat double precision,
  lng double precision,
  ciudad text,
  ultimo_acceso_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index duenos_telefono_idx on public.duenos (telefono) where telefono is not null;
create trigger set_updated_at before insert or update on public.duenos
  for each row execute function public.set_updated_at();
alter table public.duenos enable row level security;
create policy duenos_propio_select on public.duenos for select to authenticated using (id = auth.uid());
create policy duenos_propio_insert on public.duenos for insert to authenticated with check (id = auth.uid());
create policy duenos_propio_update on public.duenos for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy duenos_definer on public.duenos for all to peludesk_definer using (true) with check (true);
revoke all on public.duenos from anon, authenticated;
grant select, insert, update on public.duenos to authenticated;
grant select, insert, update, delete on public.duenos to peludesk_definer;
comment on table public.duenos is 'App para dueños: la persona como dueña de mascotas (una por cuenta de Auth). Sin negocio: es de la persona.';

-- ── 2. mascotas ────────────────────────────────────────────────────
create table public.mascotas (
  id uuid primary key default gen_random_uuid(),
  dueno_id uuid not null references public.duenos(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  especie text not null default 'perro' check (especie in ('perro', 'gato', 'otro')),
  especie_detalle text,
  sexo text check (sexo is null or sexo in ('macho', 'hembra')),
  fecha_nacimiento date,
  esterilizado boolean,
  raza_texto text,
  microchip text,
  -- Foto propia de la app (bucket app-mascotas, Fase 1). Sin ella se usa la del expediente del negocio.
  foto_path text,
  fallecido boolean not null default false,
  fecha_fallecimiento date,
  -- De dónde nació la mascota global: la cargó un negocio, la dio de alta el dueño en la app, o un QR.
  origen text not null default 'app' check (origen in ('app', 'negocio', 'qr')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index mascotas_dueno_idx on public.mascotas (dueno_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.mascotas
  for each row execute function public.set_updated_at();
alter table public.mascotas enable row level security;
create policy mascotas_propias_select on public.mascotas for select to authenticated using (dueno_id = auth.uid());
create policy mascotas_propias_insert on public.mascotas for insert to authenticated with check (dueno_id = auth.uid());
create policy mascotas_propias_update on public.mascotas for update to authenticated using (dueno_id = auth.uid()) with check (dueno_id = auth.uid());
create policy mascotas_definer on public.mascotas for all to peludesk_definer using (true) with check (true);
revoke all on public.mascotas from anon, authenticated;
grant select, insert, update on public.mascotas to authenticated;
grant select, insert, update, delete on public.mascotas to peludesk_definer;
comment on table public.mascotas is 'App para dueños: la mascota global de una persona. Sus expedientes en cada negocio cuelgan de mascotas_vinculos.';

-- ── 3. mascotas_vinculos (tabla de negocio: dos redes) ─────────────
create table public.mascotas_vinculos (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  negocio_id uuid not null references public.negocios(id),
  perro_id uuid not null references public.perros(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
-- Un expediente de un negocio pertenece a UNA mascota global, siempre (si se da de baja, la fila queda con deleted_at).
create unique index mascotas_vinculos_perro_uq on public.mascotas_vinculos (perro_id);
create index mascotas_vinculos_negocio_idx on public.mascotas_vinculos (negocio_id);
create index mascotas_vinculos_mascota_idx on public.mascotas_vinculos (mascota_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.mascotas_vinculos
  for each row execute function public.set_updated_at();
alter table public.mascotas_vinculos enable row level security;
create policy mascotas_vinculos_negocio on public.mascotas_vinculos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy mascotas_vinculos_negocio_definer on public.mascotas_vinculos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
-- El personal del negocio ve qué expedientes suyos tienen app (solo lectura; se escribe por app_vincular_perro).
create policy mascotas_vinculos_select_staff on public.mascotas_vinculos for select to authenticated
  using ((select coalesce(public.is_staff(), false)));
revoke all on public.mascotas_vinculos from anon, authenticated;
grant select on public.mascotas_vinculos to authenticated;
grant select, insert, update, delete on public.mascotas_vinculos to peludesk_definer;
comment on table public.mascotas_vinculos is 'App para dueños: el expediente (perros) que una mascota global tiene en un negocio. El dueño los lee por app_mis_vinculos().';

-- ── 4. app_entradas: entrar por teléfono con código por WhatsApp ───
-- La persona escribe su teléfono, ve un código en pantalla y lo manda ELLA al WhatsApp de PeluDesk («ENTRAR ABC123»);
-- el webhook lo verifica (viene de ese número) y la pantalla, que pregunta cada pocos segundos, abre la sesión.
-- Solo la escribe el servidor (service_role); nadie la lee desde el navegador.
create table public.app_entradas (
  id uuid primary key default gen_random_uuid(),
  telefono text not null check (telefono ~ '^[0-9]{10}$'),
  codigo text not null check (codigo ~ '^[A-Z0-9]{6}$'),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'verificada', 'usada', 'vencida')),
  ip_hash text,
  user_agent text,
  expira_at timestamptz not null default now() + interval '15 minutes',
  verificada_at timestamptz,
  usada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index app_entradas_telefono_idx on public.app_entradas (telefono, created_at desc);
create unique index app_entradas_codigo_pendiente_uq on public.app_entradas (telefono, codigo) where estado in ('pendiente', 'verificada');
create trigger set_updated_at before insert or update on public.app_entradas
  for each row execute function public.set_updated_at();
alter table public.app_entradas enable row level security;
create policy app_entradas_definer on public.app_entradas for all to peludesk_definer using (true) with check (true);
revoke all on public.app_entradas from anon, authenticated;
grant select, insert, update, delete on public.app_entradas to peludesk_definer;
comment on table public.app_entradas is 'App para dueños: códigos de entrada por WhatsApp (los manda la persona al bot). Solo servidor.';

-- ── 5. app_push_suscripciones ──────────────────────────────────────
create table public.app_push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  dueno_id uuid not null references public.duenos(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  fallos int not null default 0,
  ultimo_envio_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index app_push_endpoint_uq on public.app_push_suscripciones (endpoint);
create index app_push_dueno_idx on public.app_push_suscripciones (dueno_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.app_push_suscripciones
  for each row execute function public.set_updated_at();
alter table public.app_push_suscripciones enable row level security;
create policy app_push_propias_select on public.app_push_suscripciones for select to authenticated using (dueno_id = auth.uid());
create policy app_push_propias_insert on public.app_push_suscripciones for insert to authenticated with check (dueno_id = auth.uid());
create policy app_push_propias_update on public.app_push_suscripciones for update to authenticated using (dueno_id = auth.uid()) with check (dueno_id = auth.uid());
create policy app_push_propias_delete on public.app_push_suscripciones for delete to authenticated using (dueno_id = auth.uid());
create policy app_push_definer on public.app_push_suscripciones for all to peludesk_definer using (true) with check (true);
revoke all on public.app_push_suscripciones from anon, authenticated;
grant select, insert, update, delete on public.app_push_suscripciones to authenticated;
grant select, insert, update, delete on public.app_push_suscripciones to peludesk_definer;

-- ── 6. app_avisos ──────────────────────────────────────────────────
create table public.app_avisos (
  id uuid primary key default gen_random_uuid(),
  dueno_id uuid not null references public.duenos(id) on delete cascade,
  mascota_id uuid references public.mascotas(id) on delete set null,
  tipo text not null check (tipo in ('bienvenida', 'vinculo', 'prueba', 'recordatorio', 'perdida', 'encontrada', 'mensaje', 'sistema')),
  titulo text not null check (char_length(titulo) between 1 and 120),
  cuerpo text not null check (char_length(cuerpo) between 1 and 600),
  url text,
  datos jsonb not null default '{}'::jsonb,
  leido_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index app_avisos_dueno_idx on public.app_avisos (dueno_id, created_at desc) where deleted_at is null;
create trigger set_updated_at before insert or update on public.app_avisos
  for each row execute function public.set_updated_at();
alter table public.app_avisos enable row level security;
create policy app_avisos_propios_select on public.app_avisos for select to authenticated using (dueno_id = auth.uid());
create policy app_avisos_propios_update on public.app_avisos for update to authenticated using (dueno_id = auth.uid()) with check (dueno_id = auth.uid());
create policy app_avisos_definer on public.app_avisos for all to peludesk_definer using (true) with check (true);
revoke all on public.app_avisos from anon, authenticated;
grant select, update on public.app_avisos to authenticated;
grant select, insert, update, delete on public.app_avisos to peludesk_definer;

-- ── 7. El puente: cada expediente de un cliente con cuenta es una mascota del dueño ──
-- De postgres (ve todos los negocios): el expediente vive en un negocio y la mascota en la persona, y la liga tiene que
-- escribirse desde cualquier contexto (el alta del negocio, la importación, un script de servicio, la vinculación de
-- la cuenta). Solo escribe filas del DUEÑO de ese expediente (la cuenta ligada por membresía) y nunca lee nada más.
-- Va en la lista blanca de auditoria_frontera (identidad).
create or replace function public.app_vincular_perro(p_perro_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.perros%rowtype;
  v_profile uuid;
  v_tel text;
  v_nombre text;
  v_vinculo public.mascotas_vinculos%rowtype;
  v_mascota uuid;
  v_hay boolean;
begin
  select * into v_p from public.perros p where p.id = p_perro_id;
  if not found or v_p.cliente_id is null then return null; end if;
  select m.profile_id into v_profile
  from public.membresias m
  where m.negocio_id = v_p.negocio_id and m.cliente_id = v_p.cliente_id and m.rol = 'cliente' and m.deleted_at is null
  order by m.created_at
  limit 1;
  if v_profile is null then return null; end if;

  select c.telefono, c.nombre into v_tel, v_nombre from public.clientes c where c.id = v_p.cliente_id;
  -- El teléfono es de la cuenta: si otra cuenta ya lo tiene como dueña, no se duplica (se queda sin teléfono aquí).
  if v_tel is not null and exists (select 1 from public.duenos d where d.telefono = v_tel and d.id <> v_profile and d.deleted_at is null) then
    v_tel := null;
  end if;
  insert into public.duenos (id, telefono, nombre, created_by)
  values (v_profile, v_tel, nullif(btrim(coalesce(v_nombre, '')), ''), null)
  on conflict (id) do update
    set telefono = coalesce(public.duenos.telefono, excluded.telefono),
        nombre = coalesce(public.duenos.nombre, excluded.nombre),
        deleted_at = null;

  select * into v_vinculo from public.mascotas_vinculos v where v.perro_id = p_perro_id;
  v_hay := found;
  if v_hay then
    update public.mascotas ma
    set nombre = coalesce(nullif(btrim(v_p.nombre), ''), ma.nombre),
        especie = coalesce(v_p.especie, ma.especie),
        especie_detalle = coalesce(v_p.especie_detalle, ma.especie_detalle),
        sexo = coalesce(v_p.sexo, ma.sexo),
        fecha_nacimiento = coalesce(v_p.fecha_nacimiento, ma.fecha_nacimiento),
        esterilizado = coalesce(v_p.esterilizado, ma.esterilizado),
        raza_texto = coalesce(ma.raza_texto, v_p.raza),
        microchip = coalesce(v_p.microchip, ma.microchip),
        fallecido = ma.fallecido or coalesce(v_p.fallecido, false),
        fecha_fallecimiento = coalesce(ma.fecha_fallecimiento, v_p.fecha_fallecimiento),
        -- Si el negocio la dio de baja y era su único expediente (y nació de un negocio), la mascota se oculta también;
        -- si el dueño la dio de alta él o la tiene en otro negocio, se queda.
        deleted_at = case
          when v_p.deleted_at is not null and ma.origen = 'negocio'
               and not exists (select 1 from public.mascotas_vinculos o where o.mascota_id = ma.id and o.id <> v_vinculo.id and o.deleted_at is null)
            then coalesce(ma.deleted_at, v_p.deleted_at)
          when v_p.deleted_at is null then null
          else ma.deleted_at end
    where ma.id = v_vinculo.mascota_id;
    update public.mascotas_vinculos set deleted_at = v_p.deleted_at where id = v_vinculo.id and deleted_at is distinct from v_p.deleted_at;
    return v_vinculo.mascota_id;
  end if;

  if v_p.deleted_at is not null then return null; end if;
  insert into public.mascotas (dueno_id, nombre, especie, especie_detalle, sexo, fecha_nacimiento, esterilizado, raza_texto, microchip, fallecido, fecha_fallecimiento, origen, created_by)
  values (v_profile, coalesce(nullif(btrim(v_p.nombre), ''), 'Mascota'), coalesce(v_p.especie, 'perro'), v_p.especie_detalle, v_p.sexo, v_p.fecha_nacimiento, v_p.esterilizado, v_p.raza, v_p.microchip,
          coalesce(v_p.fallecido, false), v_p.fecha_fallecimiento, 'negocio', null)
  returning id into v_mascota;
  insert into public.mascotas_vinculos (mascota_id, negocio_id, perro_id, created_by) values (v_mascota, v_p.negocio_id, p_perro_id, null);
  return v_mascota;
end;
$$;
revoke execute on function public.app_vincular_perro(uuid) from public, anon, authenticated;
grant execute on function public.app_vincular_perro(uuid) to service_role;

-- Disparadores: el expediente y la cuenta. Nunca tumban la escritura del negocio: si la liga falla, se avisa y sigue.
create or replace function public.perros_app_vincular()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.app_vincular_perro(new.id);
  exception when others then
    raise warning 'app_vincular_perro(%) falló: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.perros_app_vincular() from public, anon, authenticated;
create trigger perros_app_vincular
  after insert or update of nombre, especie, especie_detalle, sexo, fecha_nacimiento, esterilizado, raza, microchip, fallecido, fecha_fallecimiento, deleted_at, cliente_id
  on public.perros
  for each row execute function public.perros_app_vincular();

create or replace function public.membresias_app_vincular()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  if new.rol <> 'cliente' or new.cliente_id is null or new.deleted_at is not null then return new; end if;
  for r in select p.id from public.perros p where p.cliente_id = new.cliente_id and p.negocio_id = new.negocio_id loop
    begin
      perform public.app_vincular_perro(r.id);
    exception when others then
      raise warning 'app_vincular_perro(%) falló: %', r.id, sqlerrm;
    end;
  end loop;
  return new;
end;
$$;
revoke execute on function public.membresias_app_vincular() from public, anon, authenticated;
create trigger membresias_app_vincular
  after insert or update of cliente_id, deleted_at on public.membresias
  for each row execute function public.membresias_app_vincular();

-- ── 8. Lo que el dueño lee de arriba de los negocios ───────────────
-- Sus mascotas ya las lee directo (RLS propia). Sus vínculos y sus negocios cruzan negocios: de postgres, filtradas
-- SIEMPRE por auth.uid(). En la lista blanca de la frontera (identidad).
create or replace function public.app_mis_vinculos()
returns table (mascota_id uuid, negocio_id uuid, negocio_nombre text, negocio_slug text, negocio_dominio text, negocio_url_publica text, perro_id uuid, perro_foto_path text, perro_raza text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.mascota_id, n.id, n.nombre, n.slug, n.dominio, n.url_publica, v.perro_id, p.foto_path, p.raza
  from public.mascotas_vinculos v
  join public.mascotas ma on ma.id = v.mascota_id and ma.dueno_id = auth.uid()
  join public.negocios n on n.id = v.negocio_id and n.deleted_at is null
  join public.perros p on p.id = v.perro_id
  where v.deleted_at is null and auth.uid() is not null
  order by n.nombre;
$$;
revoke execute on function public.app_mis_vinculos() from public, anon;
grant execute on function public.app_mis_vinculos() to authenticated, service_role;

create or replace function public.app_mis_negocios()
returns table (id uuid, slug text, nombre text, dominio text, url_publica text, ciudad text, rol text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.slug, n.nombre, n.dominio, n.url_publica, n.ciudad, m.rol
  from public.membresias m
  join public.negocios n on n.id = m.negocio_id and n.activo and n.deleted_at is null
  where m.profile_id = auth.uid() and m.deleted_at is null and auth.uid() is not null
  order by n.nombre;
$$;
revoke execute on function public.app_mis_negocios() from public, anon;
grant execute on function public.app_mis_negocios() to authenticated, service_role;

-- ── 9. Frontera: tablas de la persona (sin negocio) y funciones de postgres ──
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('duenos')$a$ in v_def) = 0 then
    if position($a$('wa_aprendido')$a$ in v_def) = 0 or position($a$('mis_negocios')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no encuentro dónde agregar las tablas y funciones de la app para dueños.';
    end if;
    v_def := replace(v_def, $a$('wa_aprendido')$a$, $b$('wa_aprendido'), ('duenos'), ('mascotas'), ('app_entradas'), ('app_push_suscripciones'), ('app_avisos')$b$);
    v_def := replace(v_def, $a$('mis_negocios')$a$, $b$('mis_negocios'), ('app_vincular_perro'), ('perros_app_vincular'), ('membresias_app_vincular'), ('app_mis_vinculos'), ('app_mis_negocios')$b$);
    execute v_def;
  end if;
end $$;

-- ── 10. Backfill: los expedientes de todos los clientes que ya tienen cuenta ──
do $$
declare r record; v_n int := 0; v_m uuid;
begin
  for r in
    select p.id from public.perros p
    where p.deleted_at is null and p.cliente_id is not null
      and exists (select 1 from public.membresias m where m.negocio_id = p.negocio_id and m.cliente_id = p.cliente_id and m.rol = 'cliente' and m.deleted_at is null)
    order by p.created_at
  loop
    v_m := public.app_vincular_perro(r.id);
    if v_m is not null then v_n := v_n + 1; end if;
  end loop;
  raise notice 'app para dueños: % expedientes ligados a mascotas de sus dueños', v_n;
end $$;

-- Reversa del esquema (no se corre sola):
--   drop trigger perros_app_vincular on public.perros; drop trigger membresias_app_vincular on public.membresias;
--   drop function public.perros_app_vincular(), public.membresias_app_vincular(), public.app_vincular_perro(uuid),
--     public.app_mis_vinculos(), public.app_mis_negocios();
--   drop table public.app_avisos, public.app_push_suscripciones, public.app_entradas, public.mascotas_vinculos, public.mascotas, public.duenos;
