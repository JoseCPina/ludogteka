-- Fase 5 · Alertas: la foto de una alerta NO puede delatar a quien la subió. La carpeta era el id de la persona y la
-- URL firmada de la foto lo llevaba. Ahora la carpeta es una huella (sha256 del id con un sufijo, 24 caracteres): la
-- base sigue comprobando que la foto es de quien publica, y desde la URL no se puede saber de quién es.
-- (Las fotos que ya existían en desarrollo eran de pruebas; producción todavía no tiene alertas.)

create or replace function public._alerta_carpeta(p_persona uuid)
returns text language sql immutable set search_path = '' as $$
  select left(encode(pg_catalog.sha256(convert_to(p_persona::text || ':alertas-calle', 'UTF8')), 'hex'), 24);
$$;
revoke execute on function public._alerta_carpeta(uuid) from public, anon;
grant execute on function public._alerta_carpeta(uuid) to peludesk_definer, service_role;

create or replace function public.alerta_calle_crear(p_tipo text, p_especie text, p_descripcion text, p_color text, p_tamano text, p_foto_path text, p_lat double precision, p_lng double precision, p_precision int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := auth.uid();
  v_id uuid;
begin
  if v_yo is null or not exists (select 1 from public.duenos d where d.id = v_yo and d.deleted_at is null) then
    raise exception 'Entra a la app para subir una alerta.' using errcode = '42501';
  end if;
  if (select count(*) from public.alertas_calle a where a.autor_id = v_yo and a.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Ya subiste 5 alertas hoy. Si es urgente, actualiza una de las tuyas.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.alertas_calle a where a.autor_id = v_yo and a.created_at > now() - interval '2 minutes') then
    raise exception 'Espera un par de minutos antes de subir otra alerta.' using errcode = 'P0001';
  end if;
  if p_foto_path is not null and p_foto_path not like public._alerta_carpeta(v_yo) || '/%' then
    raise exception 'La foto no es tuya.' using errcode = '42501';
  end if;
  insert into public.alertas_calle (autor_id, tipo, especie, descripcion, color, tamano, foto_path, lat, lng, precision_m, updated_at)
  values (v_yo, p_tipo, p_especie, nullif(btrim(p_descripcion), ''), nullif(btrim(p_color), ''), nullif(p_tamano, ''), p_foto_path, p_lat, p_lng, p_precision, now())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.alerta_calle_actualizar(p_id uuid, p_texto text, p_foto_path text, p_estado text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := auth.uid();
  v_id uuid;
begin
  if v_yo is null or not exists (select 1 from public.duenos d where d.id = v_yo and d.deleted_at is null) then
    raise exception 'Entra a la app para actualizar la alerta.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.alertas_calle a where a.id = p_id and a.deleted_at is null and a.oculta_at is null and a.estado <> 'caducada') then
    raise exception 'Esa alerta ya no está activa.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.alertas_calle_actualizaciones u where u.autor_id = v_yo and u.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Ya hiciste muchas actualizaciones hoy. Intenta mañana.' using errcode = 'P0001';
  end if;
  if p_foto_path is not null and p_foto_path not like public._alerta_carpeta(v_yo) || '/%' then
    raise exception 'La foto no es tuya.' using errcode = '42501';
  end if;
  insert into public.alertas_calle_actualizaciones (alerta_id, autor_id, texto, foto_path, estado, updated_at)
  values (p_id, v_yo, nullif(btrim(p_texto), ''), p_foto_path, nullif(p_estado, ''), now())
  returning id into v_id;
  update public.alertas_calle a
     set ultima_actividad_at = now(),
         estado = coalesce(nullif(p_estado, ''), a.estado),
         resuelta_at = case when nullif(p_estado, '') in ('rescatado', 'reunido') then now() when nullif(p_estado, '') in ('sigue_ahi', 'ya_no_esta') then null else a.resuelta_at end
   where a.id = p_id;
  return v_id;
end;
$$;

alter function public.alerta_calle_crear(text, text, text, text, text, text, double precision, double precision, int) owner to peludesk_definer;
alter function public.alerta_calle_actualizar(uuid, text, text, text) owner to peludesk_definer;
