-- QA R22 (N61): la dirección del negocio es UNA (negocio_perfil.direccion).
--
-- La unificación de 20261118000000 hizo que Configuración, Perfil y Ubicación escribieran negocio_perfil, pero no
-- pasó a negocio_perfil las direcciones que ya vivían solo en `sucursales` (las guardadas en Configuración antes de
-- ese cambio): en esos negocios Perfil y la página web la mostraban vacía y el paso de la bienvenida dependía de una
-- lectura de respaldo. Aquí: (1) se copian esas direcciones a negocio_perfil (la misma dirección, sin inventar nada),
-- (2) un disparador en `sucursales` mantiene negocio_perfil con el mismo texto si algo escribe la dirección de la
-- sucursal principal, y las pantallas leen solo negocio_perfil.
--
-- REVERSA: drop trigger sucursales_sincroniza_direccion_perfil on public.sucursales;
-- drop function public.sucursales_sincroniza_direccion_perfil(); (la copia no se deshace: es la misma dirección).

-- (1) Copia de las direcciones que solo estaban en la sucursal.
with fuente as (
  select distinct on (s.negocio_id) s.negocio_id, btrim(s.direccion) as direccion
  from public.sucursales s
  join public.negocios n on n.id = s.negocio_id and n.deleted_at is null
  where s.deleted_at is null and nullif(btrim(s.direccion), '') is not null
  order by s.negocio_id, s.activo desc, s.created_at
)
update public.negocio_perfil p
set direccion = f.direccion
from fuente f
where p.negocio_id = f.negocio_id and p.deleted_at is null and nullif(btrim(p.direccion), '') is null;

insert into public.negocio_perfil (negocio_id, direccion)
select f.negocio_id, f.direccion
from (
  select distinct on (s.negocio_id) s.negocio_id, btrim(s.direccion) as direccion
  from public.sucursales s
  join public.negocios n on n.id = s.negocio_id and n.deleted_at is null
  where s.deleted_at is null and nullif(btrim(s.direccion), '') is not null
  order by s.negocio_id, s.activo desc, s.created_at
) f
where not exists (select 1 from public.negocio_perfil p where p.negocio_id = f.negocio_id and p.deleted_at is null);

-- (2) Si algo escribe la dirección de la sucursal principal, negocio_perfil queda igual (el disparador de
-- negocio_perfil la regresa a la sucursal con el mismo texto: «is distinct from» corta el ciclo).
create or replace function public.sucursales_sincroniza_direccion_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto text := nullif(btrim(coalesce(new.direccion, '')), '');
  v_principal uuid;
  v_perfil uuid;
begin
  if v_texto is null or new.deleted_at is not null then
    return new;
  end if;
  select s.id into v_principal from public.sucursales s
  where s.negocio_id = new.negocio_id and s.deleted_at is null
  order by s.activo desc, s.created_at
  limit 1;
  if v_principal is distinct from new.id then
    return new;
  end if;
  select p.id into v_perfil from public.negocio_perfil p where p.negocio_id = new.negocio_id and p.deleted_at is null;
  if v_perfil is null then
    insert into public.negocio_perfil (negocio_id, direccion) values (new.negocio_id, v_texto);
  else
    update public.negocio_perfil set direccion = v_texto where id = v_perfil and direccion is distinct from v_texto;
  end if;
  return new;
end;
$$;
alter function public.sucursales_sincroniza_direccion_perfil() owner to peludesk_definer;
revoke execute on function public.sucursales_sincroniza_direccion_perfil() from public, anon, authenticated;

drop trigger if exists sucursales_sincroniza_direccion_perfil on public.sucursales;
create trigger sucursales_sincroniza_direccion_perfil
  after insert or update of direccion on public.sucursales
  for each row execute function public.sucursales_sincroniza_direccion_perfil();
