-- La galería conserva el orden que el personal escogió (antes `distinct`
-- lo perdía: con [foto, video] salía el video primero).
create or replace function public.galeria_crear(p_perro_id uuid, p_media_ids uuid[], p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_galeria uuid;
  v_expira timestamptz;
  v_total int;
  v_buenos int;
  v_id uuid;
  v_orden int := 0;
begin
  if not public.tiene_permiso('reportes_guarderia') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes de guardería», envía fotos y videos.';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'El token no es válido.';
  end if;
  v_total := coalesce(cardinality(p_media_ids), 0);
  if v_total = 0 then
    raise exception 'Escoge al menos una foto o un video.';
  end if;
  if v_total > 40 then
    raise exception 'Una galería lleva máximo 40 archivos.';
  end if;
  select count(*) into v_buenos from public.media_perro m
  where m.id = any (p_media_ids) and m.negocio_id = public.negocio_actual() and m.perro_id = p_perro_id
    and m.estado = 'lista' and m.quitada_at is null and m.vencida_at is null and m.deleted_at is null;
  if v_buenos <> (select count(distinct x) from unnest(p_media_ids) x) then
    raise exception 'Alguno de los archivos ya no está disponible o no es de este perro.';
  end if;
  v_expira := now() + make_interval(days => public.reporte_retencion_dias());
  insert into public.galerias_perro (perro_id, enviada_por_nombre) values (p_perro_id, public.nombre_de_quien_llama())
  returning id into v_galeria;
  for v_id in
    select x.id from unnest(p_media_ids) with ordinality as x(id, n)
    where x.n = (select min(y.n) from unnest(p_media_ids) with ordinality as y(id, n) where y.id = x.id)
    order by x.n
  loop
    v_orden := v_orden + 1;
    insert into public.galeria_items (galeria_id, media_id, orden) values (v_galeria, v_id, v_orden);
  end loop;
  insert into public.enlaces_cliente (tipo, galeria_id, token_hash, expira_at) values ('galeria', v_galeria, p_hash, v_expira);
  return jsonb_build_object('galeria_id', v_galeria, 'expira_at', v_expira);
end;
$$;
alter function public.galeria_crear(uuid, uuid[], text) owner to peludesk_definer;
revoke execute on function public.galeria_crear(uuid, uuid[], text) from public, anon;
grant execute on function public.galeria_crear(uuid, uuid[], text) to authenticated;
