-- Ajustes al seguimiento de pruebas (mismo día, antes de producción):
--  · seguimiento_perfil_completo: las variables sueltas en vez de un record
--    (un `select … into record` que no encuentra fila deja el record sin
--    asignar y leerlo truena: 55000).
--  · seguimiento_registrar_respuesta: el día de la prueba en la hora DEL
--    NEGOCIO (no la del servidor).
create or replace function public.seguimiento_perfil_completo(p_negocio_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_marca jsonb;
  v_logo text;
  v_direccion text;
  v_fotos int;
  v_precio boolean;
  v_horario boolean;
  v_telefono boolean;
  v_empleado boolean;
  v_cliente boolean;
  v_asistente boolean;
  v_empleados_activo boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.es_admin_plataforma() then
    raise exception 'Solo el servidor.';
  end if;
  select n.marca into v_marca from public.negocios n where n.id = p_negocio_id;
  select p.logo_path, p.direccion into v_logo, v_direccion from public.negocio_perfil p where p.negocio_id = p_negocio_id and p.deleted_at is null;
  select count(*) into v_fotos from public.negocio_fotos f where f.negocio_id = p_negocio_id and f.deleted_at is null;
  v_precio := exists (select 1 from public.tarifas t where t.negocio_id = p_negocio_id and t.deleted_at is null and not t.no_aplica and t.precio is not null);
  v_horario := exists (select 1 from public.cupo_configuracion c where c.negocio_id = p_negocio_id and c.deleted_at is null and c.created_by is not null);
  v_telefono := exists (select 1 from public.cupo_configuracion c where c.negocio_id = p_negocio_id and c.deleted_at is null and c.telefono_recepcion is not null);
  v_empleados_activo := 'empleados' = any(public.modulos_disponibles_de(p_negocio_id))
    and coalesce((select nm.activo from public.negocio_modulos nm where nm.negocio_id = p_negocio_id and nm.modulo = 'empleados' and nm.deleted_at is null), true);
  v_empleado := not v_empleados_activo or exists (select 1 from public.empleados e where e.negocio_id = p_negocio_id and e.deleted_at is null);
  v_cliente := exists (select 1 from public.clientes c where c.negocio_id = p_negocio_id and c.deleted_at is null);
  v_asistente := v_telefono and v_precio and v_horario and v_empleado and v_cliente;
  return v_asistente
    and (v_logo is not null or (v_marca ->> 'logo') is not null)
    and v_fotos >= 3
    and nullif(btrim(coalesce(v_direccion, '')), '') is not null;
end;
$$;

create or replace function public.seguimiento_registrar_respuesta(p_telefono text, p_texto text, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_ult record;
  v_hay boolean;
  v_ids uuid[];
  v_id uuid;
  v_zona text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.';
  end if;
  if p_tipo not in ('respuesta', 'boton_ayuda', 'boton_plan', 'ahora_no', 'baja') then
    raise exception 'Tipo de respuesta desconocido.';
  end if;
  if length(v_tel) = 12 and v_tel like '52%' then v_tel := substr(v_tel, 3); end if;
  if length(v_tel) = 13 and v_tel like '521%' then v_tel := substr(v_tel, 4); end if;
  if length(v_tel) <> 10 then
    return null;
  end if;

  select e.negocio_id, e.etapa, e.plantilla, e.enviado_at, e.perfil_completo, n.nombre, n.created_at, n.prueba_termina_at, n.plan, n.zona_horaria into v_ult
  from public.seguimiento_pruebas_envios e join public.negocios n on n.id = e.negocio_id
  where e.telefono = v_tel and e.estado = 'enviado' and e.deleted_at is null
  order by e.enviado_at desc limit 1;
  v_hay := found;
  if not v_hay then
    return null;
  end if;
  v_zona := v_ult.zona_horaria;

  v_ids := array(select distinct e.negocio_id from public.seguimiento_pruebas_envios e where e.telefono = v_tel and e.estado = 'enviado' and e.deleted_at is null);
  foreach v_id in array v_ids loop
    insert into public.seguimiento_pruebas_respuestas (negocio_id, telefono, etapa, tipo, texto, created_by)
    values (v_id, v_tel, v_ult.etapa, p_tipo, left(coalesce(p_texto, ''), 500), null);
    insert into public.seguimiento_pruebas_paradas (negocio_id, motivo, created_by)
    values (v_id, case when p_tipo = 'respuesta' then 'respuesta' else p_tipo end, null)
    on conflict on constraint seguimiento_pruebas_paradas_unico do nothing;
  end loop;
  if p_tipo = 'baja' then
    insert into public.seguimiento_pruebas_exclusiones (telefono, motivo, created_by) values (v_tel, 'baja', null)
    on conflict on constraint seguimiento_pruebas_exclusiones_unico do nothing;
  end if;

  return jsonb_build_object(
    'tipo', p_tipo,
    'negocio_id', v_ult.negocio_id,
    'negocio', v_ult.nombre,
    'etapa', v_ult.etapa,
    'plantilla', v_ult.plantilla,
    'enviado_at', v_ult.enviado_at,
    'dia', ((now() at time zone v_zona)::date - (v_ult.created_at at time zone v_zona)::date),
    'perfil_completo', public.seguimiento_perfil_completo(v_ult.negocio_id),
    'perfil_completo_al_enviar', v_ult.perfil_completo,
    'plan', v_ult.plan,
    'prueba_termina_at', v_ult.prueba_termina_at
  );
end;
$$;
revoke execute on function public.seguimiento_perfil_completo(uuid) from public, anon;
revoke execute on function public.seguimiento_registrar_respuesta(text, text, text) from public, anon, authenticated;
grant execute on function public.seguimiento_perfil_completo(uuid) to service_role;
grant execute on function public.seguimiento_registrar_respuesta(text, text, text) to service_role;
