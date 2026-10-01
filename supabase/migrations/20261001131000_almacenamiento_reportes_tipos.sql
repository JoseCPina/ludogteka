-- plataforma_almacenamiento_reportes: sum() da numeric y la función
-- declara bigint ("structure of query does not match function result type").
create or replace function public.plataforma_almacenamiento_reportes()
returns table (negocio_id uuid, nombre text, slug text, archivos bigint, bytes bigint, vencidos bigint, retencion_dias int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.es_admin_plataforma() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
  select n.id, n.nombre, n.slug,
    (coalesce(m.archivos, 0) + coalesce(r.archivos, 0))::bigint,
    (coalesce(m.bytes, 0) + coalesce(r.bytes, 0))::bigint,
    (coalesce(m.vencidos, 0) + coalesce(r.vencidos, 0))::bigint,
    coalesce((select c.retencion_dias from public.reporte_config c where c.negocio_id = n.id and c.deleted_at is null), 7)
  from public.negocios n
  left join (
    select x.negocio_id,
      count(*) filter (where x.vencida_at is null and x.estado = 'lista') as archivos,
      coalesce(sum(x.bytes) filter (where x.vencida_at is null and x.estado = 'lista'), 0) as bytes,
      count(*) filter (where x.vencida_at is not null) as vencidos
    from public.media_perro x where x.deleted_at is null group by x.negocio_id
  ) m on m.negocio_id = n.id
  left join (
    select y.negocio_id,
      count(*) filter (where y.tarjeta_path is not null and y.tarjeta_vencida_at is null) as archivos,
      coalesce(sum(y.tarjeta_bytes) filter (where y.tarjeta_path is not null and y.tarjeta_vencida_at is null), 0) as bytes,
      count(*) filter (where y.tarjeta_vencida_at is not null) as vencidos
    from public.reportes_guarderia y where y.deleted_at is null group by y.negocio_id
  ) r on r.negocio_id = n.id
  where n.deleted_at is null
  order by 5 desc, n.nombre;
end;
$$;
