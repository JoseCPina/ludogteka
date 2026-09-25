-- PeluDesk, paso 6.
--
-- 1. La dirección pública de un negocio no siempre es su dominio pelón:
--    ludogteka.mx redirige (308) a www.ludogteka.mx, y los links que se le
--    mandan a los clientes (alta, complemento, portal) siempre fueron a
--    www. `negocios.url_publica` guarda esa dirección; sin ella, la app
--    arma https://<dominio> o https://<slug>.peludesk.com. La cambia solo
--    la plataforma, igual que el dominio.
-- 2. La foto del comprobante de un gasto tiene que estar en la carpeta de
--    SU negocio (`{negocio}/gastos/…`). registrar_gasto y
--    pagar_gasto_esperado reciben la ruta del servidor, pero son RPC: sin
--    esta regla, alguien de un negocio podría apuntar un gasto suyo a la
--    foto de otro y el servidor se la firmaría. Las rutas `gastos/…` de
--    antes de PeluDesk (todas de Ludogteka) se quedan como están.
-- 3. El texto alternativo de la imagen para compartir de Ludogteka (antes
--    src/app/opengraph-image.alt.txt).

alter table public.negocios
  add column url_publica text check (url_publica is null or url_publica ~ '^https://[a-z0-9.-]+$');

create or replace function public.validar_negocio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform now() at time zone new.zona_horaria;
  new.dominio := nullif(lower(btrim(coalesce(new.dominio, ''))), '');
  new.url_publica := nullif(lower(btrim(coalesce(new.url_publica, ''))), '');
  new.slug := lower(btrim(new.slug));
  if tg_op = 'UPDATE'
     and (new.slug is distinct from old.slug or new.dominio is distinct from old.dominio
          or new.url_publica is distinct from old.url_publica or new.activo is distinct from old.activo)
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'El slug, el dominio, la dirección pública y el estado de un negocio solo los cambia la plataforma.';
  end if;
  return new;
exception
  when invalid_parameter_value then
    raise exception 'La zona horaria «%» no existe.', new.zona_horaria;
end;
$$;

update public.negocios
set url_publica = 'https://www.ludogteka.mx'
where id = '10000000-0000-4000-8000-000000000001';

drop function public.negocio_por_host(text, text);
create function public.negocio_por_host(p_slug text, p_dominio text)
returns table (id uuid, slug text, nombre text, dominio text, url_publica text, zona_horaria text, marca jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.slug, n.nombre, n.dominio, n.url_publica, n.zona_horaria, n.marca
  from public.negocios n
  where n.activo and n.deleted_at is null
    and (
      (p_slug is not null and n.slug = lower(btrim(p_slug)))
      or (p_dominio is not null and n.dominio = lower(btrim(p_dominio)))
    )
  limit 1;
$$;
revoke execute on function public.negocio_por_host(text, text) from public;
grant execute on function public.negocio_por_host(text, text) to anon, authenticated, service_role;

create or replace function public.validar_comprobante_gasto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.comprobante_path is not null
     and (tg_op = 'INSERT' or new.comprobante_path is distinct from old.comprobante_path)
     and new.comprobante_path not like new.negocio_id::text || '/gastos/%' then
    raise exception 'La foto del comprobante no es de este negocio.';
  end if;
  return new;
end;
$$;
create trigger validar_comprobante_gasto
  before insert or update of comprobante_path on public.gastos
  for each row execute function public.validar_comprobante_gasto();

update public.negocios
set landing = jsonb_set(
  landing, '{seo,imagen_alt}',
  to_jsonb('Ludogteka: guardería, hotel y estética canina en San Luis Potosí. Galleta, Rusher y Zuki, clientes de la guardería, sobre fondo turquesa.'::text)
)
where id = '10000000-0000-4000-8000-000000000001' and landing is not null;
