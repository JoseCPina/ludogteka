-- Segunda mitad del cambio a varios contratos: las funciones que antes
-- decían "la" plantilla ahora tienen que decir CUÁL.
--
-- Las firmas viejas (publicar_plantilla sin tipo, generar_contrato con
-- solo el perro) se eliminan en vez de dejarse como compatibilidad: si
-- sobrevivieran, una pantalla que se nos olvide actualizar seguiría
-- publicando o generando "a ciegas" contra un tipo arbitrario, que es
-- exactamente el bug que este cambio viene a quitar. Preferimos que
-- truene en compilación/llamada a que elija mal en silencio.

drop function public.publicar_plantilla(text, text, boolean);

create function public.publicar_plantilla(
  p_tipo_contrato_id uuid,
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

  if not exists (
    select 1 from public.tipos_contrato where id = p_tipo_contrato_id and deleted_at is null
  ) then
    raise exception 'Tipo de contrato no encontrado o archivado.';
  end if;

  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'El título no puede estar vacío.';
  end if;
  if p_cuerpo is null or btrim(p_cuerpo) = '' then
    raise exception 'El cuerpo del contrato no puede estar vacío.';
  end if;

  -- Solo se desactiva la versión activa DE ESTE TIPO: publicar una
  -- versión nueva del contrato de hotel no puede dejar sin plantilla
  -- activa al de guardería.
  update public.plantillas_contrato
  set activa = false
  where activa = true and tipo_contrato_id = p_tipo_contrato_id;

  select coalesce(max(version), 0) + 1 into v_version
  from public.plantillas_contrato
  where tipo_contrato_id = p_tipo_contrato_id;

  insert into public.plantillas_contrato (tipo_contrato_id, version, titulo, cuerpo, activa, requiere_refirma, created_by)
  values (p_tipo_contrato_id, v_version, btrim(p_titulo), p_cuerpo, true, coalesce(p_requiere_refirma, false), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.publicar_plantilla(uuid, text, text, boolean) from public;
grant execute on function public.publicar_plantilla(uuid, text, text, boolean) to authenticated;

-- Generar un contrato ahora exige decir de cuál se trata. La regla de
-- "una sola pendiente de firma a la vez" pasa a ser por perro Y tipo:
-- un perro puede tener pendiente el de hotel y ya firmado el de
-- guardería, o los dos pendientes a la vez — lo que no puede es tener
-- dos pendientes del MISMO contrato.
drop function public.generar_contrato(uuid);

create function public.generar_contrato(p_perro_id uuid, p_tipo_contrato_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_plantilla_id uuid;
  v_tipo_nombre text;
  v_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden generar un contrato.';
  end if;

  select cliente_id into v_cliente_id from public.perros where id = p_perro_id and deleted_at is null;
  if v_cliente_id is null then
    raise exception 'Perro no encontrado.';
  end if;

  select nombre into v_tipo_nombre from public.tipos_contrato
  where id = p_tipo_contrato_id and deleted_at is null;
  if v_tipo_nombre is null then
    raise exception 'Tipo de contrato no encontrado o archivado.';
  end if;

  select id into v_plantilla_id from public.plantillas_contrato
  where tipo_contrato_id = p_tipo_contrato_id and activa = true;
  if v_plantilla_id is null then
    raise exception 'No hay una versión publicada de "%" todavía.', v_tipo_nombre;
  end if;

  if exists (
    select 1
    from public.contratos c
    join public.plantillas_contrato pl on pl.id = c.plantilla_id
    where c.perro_id = p_perro_id
      and c.estado = 'pendiente_firma'
      and pl.tipo_contrato_id = p_tipo_contrato_id
  ) then
    raise exception 'Ya hay un "%" pendiente de firma para este perro. Cancélalo antes de generar otro.', v_tipo_nombre;
  end if;

  insert into public.contratos (perro_id, cliente_id, plantilla_id, created_by)
  values (p_perro_id, v_cliente_id, v_plantilla_id, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.generar_contrato(uuid, uuid) from public;
grant execute on function public.generar_contrato(uuid, uuid) to authenticated;

-- marcar_requiere_refirma no cambia de firma: el "punto de quiebre"
-- sigue marcándose sobre una versión concreta. Lo que cambia es cómo se
-- lee (ver la vista de la migración siguiente): el punto de quiebre pasa
-- a calcularse dentro de cada tipo, así que marcar la versión 4 del
-- contrato de hotel jamás va a invalidar lo firmado del de guardería.
