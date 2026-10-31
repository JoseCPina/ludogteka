-- Directorio público de negocios (peludesk.mx/directorio/<giro>/<ciudad>[/<slug>]) y «¿Es tu negocio? Reclámalo»
-- (30 de octubre de 2026). El directorio lee los prospectos que ya tiene el CRM (solo el place_id de Google se
-- guarda; lo demás de Google se pide al mostrar la ficha). El reclamo: la persona deja su WhatsApp, recibe un código
-- en pantalla y lo manda ELLA al número del bot («RECLAMO ABC123»); el webhook lo verifica (el mensaje llega del
-- mismo teléfono que lo pidió) y la página le abre su prueba con la ficha convertida en su página web, verificada.

create table public.prospectos_reclamos (
  id uuid primary key default gen_random_uuid(),
  prospecto_id uuid not null references public.prospectos(id) on delete cascade,
  telefono_norm text not null check (telefono_norm ~ '^[0-9]{10}$'),
  codigo text not null check (codigo ~ '^[A-Z0-9]{6}$'),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'verificado', 'registrado', 'vencido')),
  -- El teléfono que dio coincide con el del negocio en Google: reclamo fuerte.
  telefono_coincide boolean not null default false,
  verificado_at timestamptz,
  registrado_at timestamptz,
  negocio_id uuid references public.negocios(id) on delete set null,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index prospectos_reclamos_codigo on public.prospectos_reclamos (codigo) where estado = 'pendiente' and deleted_at is null;
create index prospectos_reclamos_prospecto on public.prospectos_reclamos (prospecto_id, created_at desc) where deleted_at is null;
create index prospectos_reclamos_telefono on public.prospectos_reclamos (telefono_norm, created_at desc) where deleted_at is null;
create trigger set_updated_at before insert or update on public.prospectos_reclamos for each row execute function public.set_updated_at();
alter table public.prospectos_reclamos enable row level security;
create policy prospectos_reclamos_plataforma on public.prospectos_reclamos for select to authenticated using ((select public.es_admin_plataforma()));

-- El negocio quedó verificado al reclamar su ficha: su página pública enseña «Negocio verificado».
alter table public.negocio_perfil add column if not exists verificado_at timestamptz;
alter table public.negocio_perfil add column if not exists verificado_por text check (verificado_por is null or verificado_por in ('reclamo', 'plataforma'));

-- El webhook: «RECLAMO <código>» desde el teléfono que pidió el código. Devuelve el negocio verificado o null.
create or replace function public.prospecto_reclamo_verificar(p_telefono text, p_codigo text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_tel text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  r public.prospectos_reclamos;
  p public.prospectos;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if length(v_tel) <> 10 or v_codigo !~ '^[A-Z0-9]{6}$' then return null; end if;
  select * into r from public.prospectos_reclamos
  where codigo = v_codigo and estado = 'pendiente' and deleted_at is null and created_at > now() - interval '2 days'
  order by created_at desc limit 1;
  if r.id is null then return null; end if;
  if r.telefono_norm <> v_tel then
    return jsonb_build_object('ok', false, 'motivo', 'otro_telefono');
  end if;
  update public.prospectos_reclamos set estado = 'verificado', verificado_at = now() where id = r.id returning * into r;
  select * into p from public.prospectos where id = r.prospecto_id;
  update public.prospectos set etapa = case when etapa in ('nuevo', 'contactado', 'caliente') then 'respondio' else etapa end,
    canal_ultimo_contacto = 'whatsapp_bot', ultimo_contacto_at = now(), whatsapp_bot = v_tel, contacto_pausado_at = null
  where id = p.id;
  insert into public.prospectos_eventos (prospecto_id, tipo, canal, texto) values (p.id, 'contacto', 'whatsapp_bot', 'Reclamó su ficha del directorio y verificó su WhatsApp');
  return jsonb_build_object('ok', true, 'reclamo_id', r.id, 'prospecto_id', p.id, 'nombre', p.nombre, 'slug', p.slug, 'giro', p.giro, 'ciudad', p.ciudad, 'coincide', r.telefono_coincide);
end;
$$;
revoke execute on function public.prospecto_reclamo_verificar(text, text) from public, anon, authenticated;
grant execute on function public.prospecto_reclamo_verificar(text, text) to service_role;

-- Las ciudades del directorio por giro, con cuántos negocios vivos tiene cada una (sitemap e índice: 10 o más se indexan).
create or replace function public.directorio_ciudades()
returns table (giro text, ciudad text, estado text, n bigint)
language sql stable set search_path = '' as $$
  with base as (
    select p.ciudad, p.estado, unnest(
      case when p.giro = 'mixto' then coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(p.clasificacion -> 'servicios', '[]'::jsonb)) x where x in ('guarderia', 'hotel', 'estetica', 'veterinaria')),
        array['guarderia', 'hotel'])
      else array[p.giro] end) as giro
    from public.prospectos p
    where p.deleted_at is null and p.principal_id is null and p.etapa <> 'descartado' and p.google_place_id is not null
      and p.ciudad is not null and p.ciudad <> 'Por confirmar'
      and (select coalesce(public.es_admin_plataforma(), false) or auth.role() = 'service_role')
  )
  select b.giro, b.ciudad, min(b.estado) as estado, count(*) as n
  from base b
  group by b.giro, b.ciudad
  order by count(*) desc, b.ciudad;
$$;
revoke execute on function public.directorio_ciudades() from public, anon;
grant execute on function public.directorio_ciudades() to authenticated, service_role;

do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('prospectos_reclamos')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('herramientas_eventos'), $a$, $b$('herramientas_eventos'), ('prospectos_reclamos'), $b$);
    if position($a$('prospectos_reclamos')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar prospectos_reclamos.';
    end if;
    execute v_def;
  end if;
end $$;
