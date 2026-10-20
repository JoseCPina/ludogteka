-- QA R23 (N61/N88): una sola dirección del negocio (la de Perfil) y la base de la camioneta pasa a ser el
-- «Punto de salida de recolección», OPCIONAL: vacío = las rutas salen de la dirección del negocio.
--
-- 1) guardar_ubicacion_negocio deja vaciar el punto de salida (antes, un texto vacío no lo tocaba y no había
--    forma de quitarlo) y no lo guarda si es el mismo texto que la dirección del negocio.
-- 2) Los puntos de salida que eran exactamente la dirección del negocio se vacían: la ruta sale del mismo lugar
--    (las coordenadas del negocio), así que la cotización no cambia.
--
-- REVERSA: volver a poner guardar_ubicacion_negocio de 20261118000000 (los puntos vaciados eran la misma
-- dirección del negocio: se recuperan copiando negocio_perfil.direccion y las coordenadas de la sucursal).

create or replace function public.guardar_ubicacion_negocio(p_direccion text, p_lat double precision, p_lng double precision, p_base_direccion text, p_base_lat double precision, p_base_lng double precision)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_neg uuid := public.negocio_actual();
  v_sucursal uuid;
  v_cupo uuid;
  v_dir text := nullif(btrim(coalesce(p_direccion, '')), '');
  v_base text := nullif(btrim(coalesce(p_base_direccion, '')), '');
begin
  if not public.tiene_permiso('configuracion_negocio') then
    raise exception 'Solo un admin, o quien tenga el permiso «Configuración del negocio», cambia la ubicación del negocio.';
  end if;
  if (p_lat is null) <> (p_lng is null) or (p_base_lat is null) <> (p_base_lng is null) then
    raise exception 'Una coordenada necesita latitud y longitud.';
  end if;
  if p_lat is not null and (abs(p_lat) > 90 or abs(p_lng) > 180) then
    raise exception 'Coordenada fuera de rango.';
  end if;
  if p_base_lat is not null and (abs(p_base_lat) > 90 or abs(p_base_lng) > 180) then
    raise exception 'Coordenada fuera de rango.';
  end if;

  -- La dirección del negocio es una sola (la del perfil y la página web). El disparador del perfil le borra las
  -- coordenadas a la sucursal si el texto cambió; aquí mismo se vuelven a poner.
  if v_dir is not null then
    if exists (select 1 from public.negocio_perfil p where p.negocio_id = v_neg and p.deleted_at is null) then
      update public.negocio_perfil set direccion = v_dir
      where negocio_id = v_neg and deleted_at is null and direccion is distinct from v_dir;
    else
      insert into public.negocio_perfil (direccion) values (v_dir);
    end if;
    select id into v_sucursal from public.sucursales
    where negocio_id = v_neg and deleted_at is null
    order by activo desc, created_at
    limit 1;
    if v_sucursal is null then
      insert into public.sucursales (negocio_id, nombre, activo, direccion, lat, lng)
      select v_neg, n.nombre, true, v_dir, p_lat, p_lng from public.negocios n where n.id = v_neg;
    else
      update public.sucursales set direccion = v_dir, lat = p_lat, lng = p_lng where id = v_sucursal;
    end if;
  end if;

  -- Punto de salida de recolección: opcional. Vacío (o igual a la dirección del negocio) = sin punto propio.
  if v_base is not null and v_dir is not null and lower(v_base) = lower(v_dir) then
    v_base := null;
  end if;
  select id into v_cupo from public.cupo_configuracion
  where negocio_id = v_neg and deleted_at is null and vigencia_desde <= public.fecha_negocio()
  order by vigencia_desde desc, created_at desc
  limit 1;
  if v_cupo is null then
    if v_base is not null then
      raise exception 'Primero guarda la configuración del negocio (cupo y teléfono de recepción) en Administración.';
    end if;
    return;
  end if;
  if v_base is null then
    update public.cupo_configuracion set base_direccion = null, base_lat = null, base_lng = null
    where id = v_cupo and (base_direccion is not null or base_lat is not null);
  else
    update public.cupo_configuracion
    set base_direccion = v_base, base_lat = p_base_lat, base_lng = p_base_lng
    where id = v_cupo;
  end if;
end;
$function$;
alter function public.guardar_ubicacion_negocio(text, double precision, double precision, text, double precision, double precision) owner to peludesk_definer;
revoke execute on function public.guardar_ubicacion_negocio(text, double precision, double precision, text, double precision, double precision) from public, anon;
grant execute on function public.guardar_ubicacion_negocio(text, double precision, double precision, text, double precision, double precision) to authenticated, service_role;

-- Los que eran la misma dirección del negocio quedan sin punto propio (la ruta sale del negocio igual que antes).
update public.cupo_configuracion c
set base_direccion = null, base_lat = null, base_lng = null
from public.negocio_perfil p
where p.negocio_id = c.negocio_id and p.deleted_at is null
  and c.base_direccion is not null
  and lower(btrim(c.base_direccion)) = lower(btrim(p.direccion));

-- QA R23 (N85): una consulta iniciada desde una cita lleva la fecha y hora DE LA CITA (aunque se abra antes o
-- después); solo una consulta sin cita usa el momento en que se crea.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select replace(pg_get_functiondef('public.vet_consulta_iniciar(uuid, uuid, text, uuid)'::regprocedure), chr(13), '') into v_def;
  if position('v_atendida' in v_def) = 0 then
    v_nuevo := replace(v_def, '  v_tele boolean := false;', E'  v_tele boolean := false;\n  v_atendida timestamptz := now();');
    v_nuevo := replace(v_nuevo, 'select c.id, c.perro_id, c.medico_id, c.estado, c.tipo_clave, c.consulta_id, c.motivo into v_cita from public.vet_citas c',
                                'select c.id, c.perro_id, c.medico_id, c.estado, c.tipo_clave, c.consulta_id, c.motivo, c.inicia_at into v_cita from public.vet_citas c');
    v_nuevo := replace(v_nuevo, '    p_perro := v_cita.perro_id;', E'    p_perro := v_cita.perro_id;\n    v_atendida := coalesce(v_cita.inicia_at, now());');
    v_nuevo := replace(v_nuevo, 'insert into public.vet_consultas (id, perro_id, cliente_id, cita_id, tipo_clave, medico_id, modalidad,',
                                'insert into public.vet_consultas (id, atendida_at, perro_id, cliente_id, cita_id, tipo_clave, medico_id, modalidad,');
    v_nuevo := replace(v_nuevo, '  values (v_id, p_perro, v_perro.cliente_id, p_cita,', '  values (v_id, v_atendida, p_perro, v_perro.cliente_id, p_cita,');
    if v_nuevo = v_def or (length(v_nuevo) - length(replace(v_nuevo, 'v_atendida', ''))) / length('v_atendida') <> 3 then
      raise exception 'vet_consulta_iniciar cambió: no se pudo poner la fecha de la cita.';
    end if;
    execute v_nuevo;
  end if;
end $$;
