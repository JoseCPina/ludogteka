-- demo_vaciar_veterinaria: por omisión SOLO lo clínico (sembrar la parte veterinaria del demo no debe tocar el resto);
-- con p_todo también las tablas de perros y clientes que demo_vaciar no conoce (para rehacer el demo entero).
drop function if exists public.demo_vaciar_veterinaria(uuid);
create or replace function public.demo_vaciar_veterinaria(p_negocio_id uuid, p_todo boolean default false)
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
    'perros_notas_clinicas'
  ];
  -- Con p_todo (cuando se va a rehacer el demo entero) también lo que cuelga de perros y clientes y demo_vaciar no conoce.
  if coalesce(p_todo, false) then
    v_pendientes := v_pendientes || array[
      'clientes_notas_internas', 'perros_evaluaciones', 'contratos_internos', 'media_perro', 'galeria_items', 'galerias_perro',
      'enlaces_cliente', 'reportes_guarderia_versiones', 'reportes_guarderia', 'razas_propuestas_perros',
      'razas_normalizacion_perros', 'citas_estetica_asignaciones', 'citas_estetica_correcciones'
    ];
  end if;
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
alter function public.demo_vaciar_veterinaria(uuid, boolean) owner to postgres;
revoke execute on function public.demo_vaciar_veterinaria(uuid, boolean) from public, anon, authenticated;
grant execute on function public.demo_vaciar_veterinaria(uuid, boolean) to service_role;

