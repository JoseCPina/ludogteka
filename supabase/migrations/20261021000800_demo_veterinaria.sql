-- El negocio de demostración (Patitas & Co.) ahora trae Veterinaria con datos de ejemplo.
--  1. demo_vaciar_veterinaria(negocio): borra lo clínico de un negocio con plan demo para volver a sembrarlo
--     (demo_vaciar no conoce estas tablas). Solo el servidor y solo un negocio demo. Las tablas clínicas son
--     inmutables por disparador: se apagan SOLO los de usuario de la tabla que lo exige, dentro de la
--     transacción, y se vuelven a prender al final.
--  2. La tarea de recordatorios nunca recorre un negocio demo: el demo no manda nada a nadie.
-- Reversa: drop function demo_vaciar_veterinaria; restaurar carnet_negocios_con_recordatorios.
create or replace function public.demo_vaciar_veterinaria(p_negocio_id uuid)
returns table (tabla text, borradas bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_tabla text;
  v_n bigint;
  v_pendientes text[];
  v_siguen text[];
  v_apagadas text[] := '{}';
  v_pasada int := 0;
  v_progreso boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor vacía el demo.' using errcode = '42501';
  end if;
  select n.plan into v_plan from public.negocios n where n.id = p_negocio_id and n.deleted_at is null;
  if v_plan is distinct from 'demo' then
    raise exception 'Solo se vacía un negocio con plan demo.';
  end if;
  v_pendientes := array[
    'carnet_desparasitaciones', 'carnet_enlaces', 'carnet_mascota', 'carnet_recordatorios', 'carnet_vacunas', 'certificados_salud',
    'consentimientos', 'hospitalizacion_cargos', 'hospitalizacion_dosis', 'hospitalizacion_medicacion', 'hospitalizacion_monitoreo',
    'hospitalizaciones', 'lotes_movimientos', 'insumo_lotes', 'medico_folios_usados', 'medico_folios', 'vet_adjuntos', 'vet_citas',
    'vet_consulta_adendas', 'vet_consultas', 'vet_dictados', 'vet_estimado_lineas', 'vet_estimados', 'vet_lecturas', 'vet_receta_lineas',
    'vet_recetas', 'vet_recetario_especial', 'vet_resultados_lab', 'vet_sitpv_recetas', 'vet_sitpv_reportes', 'vet_telemedicina',
    'perros_notas_clinicas', 'clientes_notas_internas', 'perros_evaluaciones', 'contratos_internos', 'media_perro', 'galeria_items',
    'galerias_perro', 'enlaces_cliente', 'reportes_guarderia_versiones', 'reportes_guarderia', 'razas_propuestas_perros',
    'razas_normalizacion_perros', 'citas_estetica_asignaciones', 'citas_estetica_correcciones'
  ];
  while cardinality(v_pendientes) > 0 loop
    v_pasada := v_pasada + 1;
    if v_pasada > 30 then
      raise exception 'No se pudo vaciar lo clínico del demo: siguen con filas %.', v_pendientes;
    end if;
    v_siguen := array[]::text[];
    v_progreso := false;
    foreach v_tabla in array v_pendientes loop
      begin
        execute format('delete from public.%I where negocio_id = $1', v_tabla) using p_negocio_id;
        get diagnostics v_n = row_count;
        v_progreso := true;
        if v_n > 0 then tabla := v_tabla; borradas := v_n; return next; end if;
      exception
        when foreign_key_violation then
          v_siguen := array_append(v_siguen, v_tabla);
        when undefined_table then
          v_progreso := true;
        when others then
          if v_tabla = any(v_apagadas) then raise; end if;
          execute format('alter table public.%I disable trigger user', v_tabla);
          v_apagadas := array_append(v_apagadas, v_tabla);
          v_siguen := array_append(v_siguen, v_tabla);
          v_progreso := true;
      end;
    end loop;
    if not v_progreso and cardinality(v_siguen) > 0 then
      raise exception 'No se pudo vaciar lo clínico del demo: dependencias entre %.', v_siguen;
    end if;
    v_pendientes := v_siguen;
  end loop;
  foreach v_tabla in array v_apagadas loop
    execute format('alter table public.%I enable trigger user', v_tabla);
  end loop;
end;
$$;
alter function public.demo_vaciar_veterinaria(uuid) owner to postgres;
revoke execute on function public.demo_vaciar_veterinaria(uuid) from public, anon, authenticated;
grant execute on function public.demo_vaciar_veterinaria(uuid) to service_role;

-- La tarea de recordatorios no recorre un negocio demo.
do $$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.carnet_negocios_con_recordatorios()'::regprocedure), E'\r', '');
  if position('plan <> ''demo''' in v_def) = 0 then
    v_def := replace(v_def, E'where a.deleted_at is null and a.recordatorios_activos', E'where a.deleted_at is null and a.recordatorios_activos and n.plan <> ''demo''');
    if position('plan <> ''demo''' in v_def) = 0 then raise exception 'No se pudo parchar carnet_negocios_con_recordatorios.'; end if;
    execute v_def;
  end if;
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position('demo_vaciar_veterinaria' in v_def) = 0 then
    v_def := replace(v_def, $a$('demo_vaciar')$a$, $b$('demo_vaciar'), ('demo_vaciar_veterinaria')$b$);
    if position('demo_vaciar_veterinaria' in v_def) = 0 then raise exception 'auditoria_frontera cambió.'; end if;
    execute v_def;
  end if;
end $$;
