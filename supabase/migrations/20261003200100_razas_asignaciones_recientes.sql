-- Las últimas asignaciones de razas del negocio (para deshacerlas), con el
-- nombre de quien las hizo. Recepción no puede leer profiles del personal,
-- por eso va por una función (security definer, del negocio de la petición).
create or replace function public.razas_asignaciones_recientes()
returns table (id uuid, textos text[], raza_nombre text, perros integer, hecha_por text, hecha_at timestamptz, revertida boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select public.current_rol()), '') not in ('admin', 'recepcion') then
    raise exception 'Solo admin y recepción.' using errcode = '42501';
  end if;
  return query
  select n.id, n.textos_originales, r.nombre, n.perros, coalesce(pr.nombre_completo, 'Alguien del equipo'), n.created_at, n.revertida_at is not null
  from public.razas_normalizaciones n
  join public.razas r on r.id = n.raza_id
  left join public.profiles pr on pr.id = n.hecha_por
  where n.deleted_at is null
  order by n.created_at desc
  limit 15;
end;
$$;
alter function public.razas_asignaciones_recientes() owner to peludesk_definer;
revoke execute on function public.razas_asignaciones_recientes() from public, anon;
grant execute on function public.razas_asignaciones_recientes() to authenticated, service_role;
