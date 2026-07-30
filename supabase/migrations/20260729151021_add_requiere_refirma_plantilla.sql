-- Válvula pedida por el negocio: un contrato firmado hace tiempo sigue
-- contando como vigente aunque las condiciones de fondo cambien (tope de
-- gasto médico, cláusula de responsabilidad, etc.). requiere_refirma
-- marca una versión de plantilla como "punto de quiebre": cualquier
-- contrato firmado con una versión ANTERIOR a la marcada más alta deja
-- de contar como al día, sin tocar una sola fila de contratos a mano.
alter table public.plantillas_contrato
  add column requiere_refirma boolean not null default false;

-- Extiende publicar_plantilla con el parámetro nuevo al final (con
-- default) — las llamadas existentes con 2 argumentos siguen funcionando
-- igual, sin necesidad de tocar ningún otro código que la use.
create or replace function public.publicar_plantilla(
  p_titulo text,
  p_cuerpo text,
  p_requiere_refirma boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version int;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede editar la plantilla del contrato.';
  end if;

  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'El título no puede estar vacío.';
  end if;
  if p_cuerpo is null or btrim(p_cuerpo) = '' then
    raise exception 'El cuerpo del contrato no puede estar vacío.';
  end if;

  update public.plantillas_contrato set activa = false where activa = true;

  select coalesce(max(version), 0) + 1 into v_version from public.plantillas_contrato;

  insert into public.plantillas_contrato (version, titulo, cuerpo, activa, requiere_refirma, created_by)
  values (v_version, btrim(p_titulo), p_cuerpo, true, coalesce(p_requiere_refirma, false), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.publicar_plantilla(text, text, boolean) from public;
grant execute on function public.publicar_plantilla(text, text, boolean) to authenticated;

-- Marcar (o desmarcar) el punto de quiebre en una versión YA publicada,
-- sin necesidad de publicar una versión nueva — cubre el caso de
-- "se me olvidó marcarla" o de decidirlo después de ver el impacto.
create function public.marcar_requiere_refirma(p_plantilla_id uuid, p_valor boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede marcar una plantilla para refirma.';
  end if;

  update public.plantillas_contrato
  set requiere_refirma = coalesce(p_valor, false)
  where id = p_plantilla_id;

  if not found then
    raise exception 'Plantilla no encontrada.';
  end if;
end;
$$;

revoke execute on function public.marcar_requiere_refirma(uuid, boolean) from public;
grant execute on function public.marcar_requiere_refirma(uuid, boolean) to authenticated;

-- La vista de vigencia pasa de booleano a un estado explícito de 3
-- valores (mismo criterio que perro_requisitos_sanitarios_estado /
-- resolver_precio: estado explícito, nunca ausencia silenciosa).
-- "vigente" exige además que el contrato firmado esté en una versión
-- igual o posterior al punto de quiebre más alto marcado — si no hay
-- ninguna plantilla marcada, ese punto es 0 y todo contrato firmado
-- cuenta como vigente, igual que antes de esta migración.
drop view public.perros_contrato_vigente;

create view public.perros_contrato_estado
with (security_invoker = true)
as
select
  p.id as perro_id,
  case
    when not exists (
      select 1 from public.contratos c
      where c.perro_id = p.id and c.estado in ('firmado_digital', 'firmado_papel')
    ) then 'sin_contrato'
    when exists (
      select 1
      from public.contratos c
      join public.plantillas_contrato pl on pl.id = c.plantilla_id
      where c.perro_id = p.id
        and c.estado in ('firmado_digital', 'firmado_papel')
        and pl.version >= coalesce(
          (select max(version) from public.plantillas_contrato where requiere_refirma),
          0
        )
    ) then 'vigente'
    else 'requiere_actualizacion'
  end as estado
from public.perros p
where p.deleted_at is null;
