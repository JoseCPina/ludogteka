-- permisos_por_omision_recepcion (migración 20261203003800) es un disparador SECURITY DEFINER de postgres, como
-- permiso_tarjeta_manual_por_omision y permiso_extras_por_omision: inserta en permisos_staff al crear o cambiar una
-- membresía (también cuando lo hace la plataforma, sin encabezado de negocio). Entra a la lista blanca de la frontera
-- con la misma justificación que sus dos hermanas.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position('permisos_por_omision_recepcion' in v_def) = 0 then
    v_def := replace(v_def, $a$('avisos_marcar')$a$, $b$('avisos_marcar'), ('permisos_por_omision_recepcion')$b$);
    if position('permisos_por_omision_recepcion' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar permisos_por_omision_recepcion.';
    end if;
    execute v_def;
  end if;
end $$;
